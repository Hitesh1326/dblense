import * as vscode from "vscode";
import * as path from "path";
import * as lancedb from "@lancedb/lancedb";
import type { Connection } from "@lancedb/lancedb";
import { Field, Float32, FixedSizeList, Schema, Utf8 } from "apache-arrow";
import type { SchemaChunk, IndexStats } from "../shared/types";

const CHUNKS_TABLE_PREFIX = "chunks_";
const EMBEDDING_COLUMN = "embedding";
const CONTENT_COLUMN = "content";
/** Minimum rows required by LanceDB to train the IVF-PQ vector index. */
const MIN_ROWS_FOR_VECTOR_INDEX = 256;

/** Options for vector/hybrid search. */
export interface SearchOptions {
  topK: number;
  /** Raw query text for hybrid (BM25 + vector) search. If omitted, only vector search is used. */
  queryText?: string;
  /** Pre-filter by object type (e.g. only tables or only stored procedures). */
  typeFilter?: SchemaChunk["objectType"];
}

/** RRF constant for reciprocal rank fusion (typical value 60). */
const RRF_K = 60;

function rowToChunk(row: Record<string, unknown>): SchemaChunk {
  return {
    id: row.id as string,
    connectionId: row.connectionId as string,
    objectType: row.objectType as SchemaChunk["objectType"],
    objectName: row.objectName as string,
    schema: row.schema as string,
    content: row.content as string,
    summary: row.summary as string,
    embedding: (row.embedding as number[]) ?? [],
    crawledAt: row.crawledAt as string,
  };
}

/**
 * Merge two ranked result lists by Reciprocal Rank Fusion (RRF).
 * LanceDB Node SDK does not expose a built-in reranker; we apply RRF client-side.
 */
function rerankWithRRF(
  vectorResults: SchemaChunk[],
  ftsResults: SchemaChunk[],
  topK: number
): SchemaChunk[] {
  const scoreById = new Map<string, number>();
  const chunkById = new Map<string, SchemaChunk>();

  const add = (list: SchemaChunk[]) => {
    list.forEach((chunk, rank) => {
      const rrf = 1 / (RRF_K + rank + 1);
      const cur = scoreById.get(chunk.id) ?? 0;
      scoreById.set(chunk.id, cur + rrf);
      if (!chunkById.has(chunk.id)) chunkById.set(chunk.id, chunk);
    });
  };
  add(vectorResults);
  add(ftsResults);

  return Array.from(chunkById.entries())
    .map(([id, chunk]) => ({ id, chunk, score: scoreById.get(id)! }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk }) => chunk);
}

/**
 * Sanitize connectionId for use as a LanceDB table name (alphanumeric + underscore).
 */
function tableNameFor(connectionId: string): string {
  const safe = connectionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${CHUNKS_TABLE_PREFIX}${safe}`;
}

/**
 * Build Arrow schema for the chunks table with `embedding` as a proper vector column
 * (FixedSizeList of Float32). LanceDB requires this for vectorSearch; plain List is inferred from number[].
 */
function buildChunksSchema(embeddingDimension: number): Schema {
  return new Schema([
    new Field("id", new Utf8(), true),
    new Field("connectionId", new Utf8(), true),
    new Field("objectType", new Utf8(), true),
    new Field("objectName", new Utf8(), true),
    new Field("schema", new Utf8(), true),
    new Field("content", new Utf8(), true),
    new Field("summary", new Utf8(), true),
    new Field("embedding", new FixedSizeList(embeddingDimension, new Field("item", new Float32(), true)), true),
    new Field("crawledAt", new Utf8(), true),
  ]);
}

/**
 * Manages the LanceDB vector store.
 * Each connection gets its own table (chunks_<sanitized-connectionId>).
 * Uses cosine distance for normalized embeddings.
 */
export class VectorStoreManager {
  private conn: Connection | null = null;
  private initPromise: Promise<Connection> | null = null;

  constructor(private readonly storageUri: vscode.Uri) {}

  private get dbPath(): string {
    const configPath = vscode.workspace.getConfiguration("schemasight").get<string>("lanceDbPath");
    return configPath?.trim() || path.join(this.storageUri.fsPath, "lancedb");
  }

  private async getConnection(): Promise<Connection> {
    if (this.conn) return this.conn;
    if (this.initPromise) return this.initPromise;
    this.initPromise = lancedb.connect(this.dbPath);
    this.conn = await this.initPromise;
    this.initPromise = null;
    return this.conn;
  }

  async initialize(): Promise<void> {
    await this.getConnection();
  }

  /**
   * Replace all chunks for this connection with the given chunks (overwrite).
   * Uses an explicit Arrow schema so the embedding column is a vector (FixedSizeList of Float32),
   * which LanceDB requires for vectorSearch.
   */
  async upsertChunks(connectionId: string, chunks: SchemaChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    const db = await this.getConnection();
    const tableName = tableNameFor(connectionId);
    const embedDim = chunks[0].embedding.length;
    const rows = chunks.map((c) => ({
      id: c.id,
      connectionId: c.connectionId,
      objectType: c.objectType,
      objectName: c.objectName,
      schema: c.schema,
      content: c.content,
      summary: c.summary,
      embedding: c.embedding instanceof Float32Array ? c.embedding : new Float32Array(c.embedding),
      crawledAt: c.crawledAt,
    }));

    const names = await db.tableNames();
    if (names.includes(tableName)) {
      await db.dropTable(tableName);
    }
    const schema = buildChunksSchema(embedDim);
    await db.createTable(tableName, rows, { schema, mode: "overwrite" });

    const table = await db.openTable(tableName);
    if (chunks.length >= MIN_ROWS_FOR_VECTOR_INDEX) {
      await table.createIndex(EMBEDDING_COLUMN, {
        config: lancedb.Index.ivfPq({ distanceType: "cosine" }),
      });
    }
    await table.createIndex(CONTENT_COLUMN, {
      config: lancedb.Index.fts(),
    });
  }

  /**
   * Return all chunks for a connection (no vector search). Use for questions that need
   * the full schema (e.g. "list all tables", "how many tables") so the model sees every indexed object.
   */
  async getAllChunks(connectionId: string, limit = 500): Promise<SchemaChunk[]> {
    const db = await this.getConnection();
    const tableName = tableNameFor(connectionId);
    const names = await db.tableNames();
    if (!names.includes(tableName)) return [];

    const table = await db.openTable(tableName);
    const results = await table.query().limit(limit).toArray();
    return (results as Record<string, unknown>[]).map(rowToChunk);
  }

  /**
   * Vector or hybrid search. With queryText, runs both vector (cosine) and full-text (BM25)
   * and reranks via RRF; otherwise vector-only. Optional typeFilter restricts to one object type.
   */
  async search(
    connectionId: string,
    queryEmbedding: number[],
    options: SearchOptions
  ): Promise<SchemaChunk[]> {
    const { topK, queryText, typeFilter } = options;
    const db = await this.getConnection();
    const tableName = tableNameFor(connectionId);
    const names = await db.tableNames();
    if (!names.includes(tableName)) return [];

    const table = await db.openTable(tableName);
    const whereClause =
      typeFilter != null ? `objectType = '${typeFilter}'` : undefined;

    const applyWhere = <T extends { where: (p: string) => T }>(q: T): T =>
      whereClause ? q.where(whereClause) : q;

    if (queryText != null && queryText.trim().length > 0) {
      const rrfLimit = Math.max(topK * 2, 60);
      const vectorQuery = applyWhere(
        table.vectorSearch(queryEmbedding).column(EMBEDDING_COLUMN).distanceType("cosine")
      ).limit(rrfLimit);
      const ftsQuery = applyWhere(
        table.query().fullTextSearch(queryText.trim(), { columns: [CONTENT_COLUMN] })
      ).limit(rrfLimit);
      const [vectorOut, ftsOut] = await Promise.allSettled([
        vectorQuery.toArray(),
        ftsQuery.toArray(),
      ]);
      const vectorChunks = (vectorOut.status === "fulfilled"
        ? (vectorOut.value as Record<string, unknown>[]).map(rowToChunk)
        : []) as SchemaChunk[];
      const ftsChunks = (ftsOut.status === "fulfilled"
        ? (ftsOut.value as Record<string, unknown>[]).map(rowToChunk)
        : []) as SchemaChunk[];
      if (ftsChunks.length === 0) return vectorChunks.slice(0, topK);
      return rerankWithRRF(vectorChunks, ftsChunks, topK);
    }

    let query = table.vectorSearch(queryEmbedding).column(EMBEDDING_COLUMN).distanceType("cosine");
    if (whereClause) query = query.where(whereClause);
    const results = await query.limit(topK).toArray();
    return (results as Record<string, unknown>[]).map(rowToChunk);
  }

  /**
   * Remove the vector index for this connection (drop the table).
   */
  async clearIndex(connectionId: string): Promise<void> {
    const db = await this.getConnection();
    const tableName = tableNameFor(connectionId);
    const names = await db.tableNames();
    if (!names.includes(tableName)) return;
    await db.dropTable(tableName);
  }

  /**
   * List connectionIds that have at least one chunk (tables starting with chunks_).
   */
  async listIndexedConnections(): Promise<string[]> {
    const db = await this.getConnection();
    const names = await db.tableNames();
    const prefix = CHUNKS_TABLE_PREFIX;
    return names
      .filter((n) => n.startsWith(prefix))
      .map((n) => n.slice(prefix.length));
  }

  /**
   * Return aggregate stats for a connection's index (counts, last crawled, pipeline health).
   */
  async getIndexStats(connectionId: string): Promise<IndexStats | null> {
    const db = await this.getConnection();
    const tableName = tableNameFor(connectionId);
    const names = await db.tableNames();
    if (!names.includes(tableName)) return null;

    const table = await db.openTable(tableName);
    const totalChunks = await table.countRows();

    const rows = await table
      .query()
      .select(["objectType", "summary", "embedding", "crawledAt"])
      .limit(50_000)
      .toArray();

    let tableChunks = 0;
    let viewChunks = 0;
    let spChunks = 0;
    let functionChunks = 0;
    let chunksWithSummary = 0;
    let chunksWithEmbedding = 0;
    let lastCrawledAt: string | null = null;

    for (const row of rows) {
      const r = row as Record<string, unknown>;
      if (r.objectType === "table") tableChunks++;
      if (r.objectType === "view") viewChunks++;
      if (r.objectType === "stored_procedure") spChunks++;
      if (r.objectType === "function") functionChunks++;
      if (typeof r.summary === "string" && r.summary.length > 0) chunksWithSummary++;
      const emb = r.embedding;
      // LanceDB returns vector columns as Float32Array, not plain Array
      const hasEmbedding =
        (Array.isArray(emb) && emb.length > 0) ||
        (typeof emb === "object" && emb !== null && "length" in emb && (emb as { length: number }).length > 0);
      if (hasEmbedding) chunksWithEmbedding++;
      const at = r.crawledAt;
      if (typeof at === "string" && at) {
        if (!lastCrawledAt || at > lastCrawledAt) lastCrawledAt = at;
      }
    }

    return {
      totalChunks,
      tableChunks,
      viewChunks,
      spChunks,
      functionChunks,
      chunksWithSummary,
      chunksWithEmbedding,
      lastCrawledAt,
    };
  }
}
