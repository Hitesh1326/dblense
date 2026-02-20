import * as vscode from "vscode";
import * as path from "path";
import { SchemaChunk } from "../shared/types";

/**
 * Manages the LanceDB vector store.
 * Each connection gets its own table named by connectionId.
 */
export class VectorStoreManager {
  private db: unknown = null;

  constructor(private readonly storageUri: vscode.Uri) {}

  private get dbPath(): string {
    const configPath = vscode.workspace.getConfiguration("dblense").get<string>("lanceDbPath");
    return configPath || path.join(this.storageUri.fsPath, "lancedb");
  }

  async initialize(): Promise<void> {
    // TODO: import lancedb, open/create db at this.dbPath
  }

  async upsertChunks(connectionId: string, chunks: SchemaChunk[]): Promise<void> {
    // TODO: open/create table for connectionId, upsert all chunks
  }

  async search(connectionId: string, queryEmbedding: number[], topK: number): Promise<SchemaChunk[]> {
    // TODO: open table, run vector search, return top-k results
    return [];
  }

  async clearIndex(connectionId: string): Promise<void> {
    // TODO: drop table for connectionId
  }

  async listIndexedConnections(): Promise<string[]> {
    // TODO: list table names in lancedb directory
    return [];
  }
}
