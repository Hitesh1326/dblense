import * as vscode from "vscode";
import * as path from "path";
import * as lancedb from "@lancedb/lancedb";
import type { Connection } from "@lancedb/lancedb";
import type { SchemaChunk } from "../shared/types";

const CHUNKS_TABLE_PREFIX = "chunks_";
const EMBEDDING_COLUMN = "embedding";

/**
 * Sanitize connectionId for use as a LanceDB table name (alphanumeric + underscore).
 */
function tableNameFor(connectionId: string): string {
  const safe = connectionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${CHUNKS_TABLE_PREFIX}${safe}`;
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
   */
  async upsertChunks(connectionId: string, chunks: SchemaChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    const db = await this.getConnection();
    const tableName = tableNameFor(connectionId);
    const rows = chunks.map((c) => ({
      id: c.id,
      connectionId: c.connectionId,
      objectType: c.objectType,
      objectName: c.objectName,
      schema: c.schema,
      content: c.content,
      summary: c.summary,
      embedding: c.embedding,
      crawledAt: c.crawledAt,
    }));

    const names = await db.tableNames();
    if (names.includes(tableName)) {
      const table = await db.openTable(tableName);
      await table.add(rows, { mode: "overwrite" });
    } else {
      await db.createTable(tableName, rows);
    }
  }

  /**
   * Vector similarity search; returns top-k chunks closest to queryEmbedding.
   * Uses cosine distance (for normalized embeddings).
   */
  async search(connectionId: string, queryEmbedding: number[], topK: number): Promise<SchemaChunk[]> {
    const db = await this.getConnection();
    const tableName = tableNameFor(connectionId);
    const names = await db.tableNames();
    if (!names.includes(tableName)) return [];

    const table = await db.openTable(tableName);
    const results = await table
      .vectorSearch(queryEmbedding)
      .column(EMBEDDING_COLUMN)
      .distanceType("cosine")
      .limit(topK)
      .toArray();

    return results.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      connectionId: row.connectionId as string,
      objectType: row.objectType as SchemaChunk["objectType"],
      objectName: row.objectName as string,
      schema: row.schema as string,
      content: row.content as string,
      summary: row.summary as string,
      embedding: row.embedding as number[],
      crawledAt: row.crawledAt as string,
    }));
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
}
