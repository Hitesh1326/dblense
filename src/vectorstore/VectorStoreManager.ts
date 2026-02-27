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

/**
 * Options for vector or hybrid search.
 */
export interface SearchOptions {
  /** Maximum number of results to return (after rerank if hybrid). */
  topK: number;
  /** Raw query text for hybrid (BM25 + vector) search. If omitted, only vector search is used. */
  queryText?: string;
  /** Pre-filter by object type (e.g. only tables or only stored procedures). */
  typeFilter?: SchemaChunk["objectType"];
}

/** Allowed objectType values for typeFilter (used to build a safe WHERE clause). */
const ALLOWED_OBJECT_TYPES = new Set<SchemaChunk["objectType"]>([
  "table",
  "view",
  "stored_procedure",
  "function",
]);

/**
 * Converts a LanceDB row (Record) to a SchemaChunk.
 * @param row Raw row from table.query() or vectorSearch().
 * @returns SchemaChunk with embedding as number[] (LanceDB may return Float32Array).
 */
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
 * Sanitizes connectionId for use as a LanceDB table name (alphanumeric, underscore, hyphen).
 * @param connectionId Connection id (may contain characters invalid in table names).
 * @returns Table name prefix + sanitized id (e.g. chunks_conn_123).
 */
function tableNameFor(connectionId: string): string {
  const safe = connectionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${CHUNKS_TABLE_PREFIX}${safe}`;
}

/**
 * Builds Arrow schema for the chunks table with embedding as a vector column (FixedSizeList of Float32).
 * LanceDB requires this for vectorSearch; plain List inferred from number[] is not sufficient.
 * @param embeddingDimension Length of each embedding vector (e.g. 384 for MiniLM).
 * @returns Arrow Schema for the chunks table.
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
 * Computes per-type counts, summary/embedding coverage, and latest crawledAt from raw rows.
 * Used by getIndexStats (totalChunks comes from table.countRows() separately).
 * @param rows Raw rows with objectType, summary, embedding, crawledAt.
 * @returns Partial IndexStats (without totalChunks).
 */
function computeStatsFromRows(
  rows: Record<string, unknown>[]
): Omit<IndexStats, "totalChunks"> {
  let tableChunks = 0;
  let viewChunks = 0;
  let spChunks = 0;
  let functionChunks = 0;
  let chunksWithSummary = 0;
  let chunksWithEmbedding = 0;
  let lastCrawledAt: string | null = null;

  for (const r of rows) {
    if (r.objectType === "table") tableChunks++;
    if (r.objectType === "view") viewChunks++;
    if (r.objectType === "stored_procedure") spChunks++;
    if (r.objectType === "function") functionChunks++;
    if (typeof r.summary === "string" && r.summary.length > 0) chunksWithSummary++;
    const emb = r.embedding;
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
    tableChunks,
    viewChunks,
    spChunks,
    functionChunks,
    chunksWithSummary,
    chunksWithEmbedding,
    lastCrawledAt,
  };
}

/**
 * Manages the LanceDB vector store for schema chunks.
 * Each connection has its own table (chunks_<sanitized-connectionId>). Uses cosine distance
 * for normalized embeddings; supports vector search, FTS (BM25), and hybrid search with RRF rerank.
 */
export class VectorStoreManager {
  private conn: Connection | null = null;
  private initPromise: Promise<Connection> | null = null;
  private rrfrerankerPromise: Promise<InstanceType<typeof lancedb.rerankers.RRFReranker>> | null = null;

  /**
   * @param storageUri Base directory for extension storage (LanceDB created here unless overridden by config).
   */
  constructor(private readonly storageUri: vscode.Uri) {}

  /** LanceDB root path: from config (schemasight.lanceDbPath) or storageUri/lancedb. */
  private get dbPath(): string {
    const configPath = vscode.workspace.getConfiguration("schemasight").get<string>("lanceDbPath");
    return configPath?.trim() || path.join(this.storageUri.fsPath, "lancedb");
  }

  /** Returns the LanceDB connection; connects on first call (lazy init). */
  private async getConnection(): Promise<Connection> {
    if (this.conn) return this.conn;
    if (this.initPromise) return this.initPromise;
    this.initPromise = lancedb.connect(this.dbPath);
    this.conn = await this.initPromise;
    this.initPromise = null;
    return this.conn;
  }

  /** Ensures the LanceDB connection is open (e.g. at extension activation). */
  async initialize(): Promise<void> {
    await this.getConnection();
  }

  /**
   * Replaces all chunks for a connection with the given chunks (overwrite).
   * Drops the existing table if present, creates a new one with an explicit Arrow schema
   * (embedding as FixedSizeList of Float32), and creates vector + FTS indexes when applicable.
   * @param connectionId Connection id (used for table name and chunk.connectionId).
   * @param chunks Chunks to store (must have embedding populated).
   * @returns Resolves when the table and indexes are created; no-op if chunks is empty.
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
   * Returns all chunks for a connection (no vector search). Use when the model needs
   * the full schema (e.g. "list all tables", "how many tables").
   * @param connectionId Connection id.
   * @param limit Maximum rows to return (default 500).
   * @returns Array of SchemaChunk; empty if the table does not exist.
   */
  async getAllChunks(connectionId: string, limit = 500): Promise<SchemaChunk[]> {
    const ctx = await this.getTableIfExists(connectionId);
    if (!ctx) return [];
    const results = await ctx.table.query().limit(limit).toArray();
    return (results as Record<string, unknown>[]).map(rowToChunk);
  }

  /**
   * Vector or hybrid search. With queryText, uses LanceDB built-in hybrid search (vector + FTS)
   * with RRF reranker; otherwise vector-only. Optional typeFilter restricts to one object type.
   * @param connectionId Connection id.
   * @param queryEmbedding Query vector (same dimension as stored embeddings).
   * @param options topK, optional queryText (for hybrid), optional typeFilter.
   * @returns Top-k chunks; empty if the table does not exist.
   */
  async search(
    connectionId: string,
    queryEmbedding: number[],
    options: SearchOptions
  ): Promise<SchemaChunk[]> {
    const { topK, queryText, typeFilter } = options;
    const ctx = await this.getTableIfExists(connectionId);
    if (!ctx) return [];

    const { table } = ctx;
    const whereClause =
      typeFilter != null && ALLOWED_OBJECT_TYPES.has(typeFilter)
        ? `objectType = '${typeFilter}'`
        : undefined;

    if (queryText != null && queryText.trim().length > 0) {
      if (!this.rrfrerankerPromise) {
        this.rrfrerankerPromise = lancedb.rerankers.RRFReranker.create(60);
      }
      const reranker = await this.rrfrerankerPromise;
      let hybridQuery = table
        .query()
        .fullTextSearch(queryText.trim(), { columns: [CONTENT_COLUMN] })
        .nearestTo(queryEmbedding)
        .column(EMBEDDING_COLUMN)
        .distanceType("cosine")
        .rerank(reranker)
        .limit(topK);
      if (whereClause) hybridQuery = hybridQuery.where(whereClause);
      const results = await hybridQuery.toArray();
      return (results as Record<string, unknown>[]).map(rowToChunk);
    }

    let query = table.vectorSearch(queryEmbedding).column(EMBEDDING_COLUMN).distanceType("cosine");
    if (whereClause) query = query.where(whereClause);
    const results = await query.limit(topK).toArray();
    return (results as Record<string, unknown>[]).map(rowToChunk);
  }

  /**
   * Removes the index for a connection (drops the chunks table).
   * @param connectionId Connection id.
   */
  async clearIndex(connectionId: string): Promise<void> {
    const ctx = await this.getTableIfExists(connectionId);
    if (!ctx) return;
    await ctx.db.dropTable(ctx.tableName);
  }

  /**
   * Lists connection ids that have at least one chunk (tables starting with chunks_).
   * Returns the sanitized table suffix (not the original connectionId); use for presence check.
   * @returns Array of sanitized connection ids that have a chunks table.
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
   * Returns aggregate stats for a connection's index (counts by type, summary/embedding coverage, last crawl).
   * @param connectionId Connection id.
   * @returns IndexStats or null if the table does not exist.
   */
  async getIndexStats(connectionId: string): Promise<IndexStats | null> {
    const ctx = await this.getTableIfExists(connectionId);
    if (!ctx) return null;

    const totalChunks = await ctx.table.countRows();
    const rows = await ctx.table
      .query()
      .select(["objectType", "summary", "embedding", "crawledAt"])
      .limit(50_000)
      .toArray();

    const partial = computeStatsFromRows(rows as Record<string, unknown>[]);
    return { totalChunks, ...partial };
  }

  /**
   * Opens the chunks table for a connection if it exists.
   * @param connectionId Connection id.
   * @returns Context with db, tableName, and opened table, or null if the table does not exist.
   */
  private async getTableIfExists(
    connectionId: string
  ): Promise<{ db: Connection; tableName: string; table: Awaited<ReturnType<Connection["openTable"]>> } | null> {
    const db = await this.getConnection();
    const tableName = tableNameFor(connectionId);
    const names = await db.tableNames();
    if (!names.includes(tableName)) return null;
    const table = await db.openTable(tableName);
    return { db, tableName, table };
  }
}
