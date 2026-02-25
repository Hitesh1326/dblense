/** Supported database drivers. */
export type DbDriver = "mssql" | "postgres" | "mysql";

/**
 * Implemented by each DB driver; used by ConnectionManager and SchemaService.
 * Each operation uses its own connection; no long-lived pool in the driver.
 */
export interface IDbDriver {
  testConnection(config: DbConnectionConfig, password: string): Promise<boolean>;
  crawlSchema(
    config: DbConnectionConfig,
    password: string,
    onProgress?: CrawlProgressCallback,
    signal?: AbortSignal
  ): Promise<DatabaseSchema>;
}

/** Persisted connection config (password stored separately in VS Code SecretStorage). */
export interface DbConnectionConfig {
  id: string;
  label: string;
  driver: DbDriver;
  host: string;
  port: number;
  database: string;
  username: string;
  /** Password is stored separately in VS Code SecretStorage. */
  useSsl: boolean;
}

/** Table metadata from a DB crawl (schema name, table name, columns). */
export interface TableMeta {
  schema: string;
  name: string;
  rowCount?: number;
  columns: ColumnMeta[];
}

/** Column metadata: name, type, nullability, PK/FK, and optional default. */
export interface ColumnMeta {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  referencedTable?: string;
  referencedColumn?: string;
  defaultValue?: string;
}

/** Stored procedure metadata: schema, name, definition text, and parameters. */
export interface StoredProcedureMeta {
  schema: string;
  name: string;
  definition: string;
  parameters: SpParameterMeta[];
}

/** Parameter metadata for a procedure or function (name, type, IN/OUT). */
export interface SpParameterMeta {
  name: string;
  dataType: string;
  direction: "IN" | "OUT" | "INOUT";
}

/** View metadata: schema, name, columns, and definition text. */
export interface ViewMeta {
  schema: string;
  name: string;
  columns: ColumnMeta[];
  definition: string;
}

/** Function metadata: schema, name, definition text, and parameters. */
export interface FunctionMeta {
  schema: string;
  name: string;
  definition: string;
  parameters: SpParameterMeta[];
}

/** Full schema result from a crawl: connection id, DB name, tables, views, procedures, functions, and crawl time. */
export interface DatabaseSchema {
  connectionId: string;
  databaseName: string;
  tables: TableMeta[];
  views: ViewMeta[];
  storedProcedures: StoredProcedureMeta[];
  functions: FunctionMeta[];
  crawledAt: string;
}

/** A single indexed unit: one table, view, stored procedure, or function (with summary and embedding). */
export interface SchemaChunk {
  id: string;
  connectionId: string;
  objectType: "table" | "column" | "stored_procedure" | "view" | "function";
  objectName: string;
  schema: string;
  content: string;
  summary: string;
  embedding: number[];
  crawledAt: string;
}

/** Messages sent from the webview (React UI) to the extension. */
export type WebviewToExtensionMessage =
  | { type: "GET_CONNECTIONS" }
  | { type: "ADD_CONNECTION"; payload: DbConnectionConfig & { password: string } }
  | { type: "REMOVE_CONNECTION"; payload: { id: string } }
  | { type: "TEST_CONNECTION"; payload: { id: string } }
  | { type: "CRAWL_SCHEMA"; payload: { id: string } }
  | { type: "CRAWL_CANCEL"; payload: { connectionId: string } }
  | { type: "GET_OLLAMA_STATUS" }
  | { type: "CHAT"; payload: { connectionId: string; message: string; history: ChatMessage[] } }
  | { type: "GET_CRAWL_STATUS"; payload: { connectionId: string } }
  | { type: "CLEAR_INDEX"; payload: { connectionId: string } }
  | { type: "GET_INDEX_STATS"; payload: { connectionId: string } };

/** Messages sent from the extension to the webview. */
export type ExtensionToWebviewMessage =
  | { type: "CONNECTIONS_LIST"; payload: DbConnectionConfig[] }
  | { type: "OLLAMA_STATUS"; payload: { available: boolean; model?: string; modelPulled?: boolean } }
  | { type: "CONNECTION_ADDED"; payload: DbConnectionConfig }
  | { type: "CONNECTION_REMOVED"; payload: { id: string } }
  | { type: "CONNECTION_TEST_RESULT"; payload: { id: string; success: boolean; error?: string } }
  | { type: "CRAWL_PROGRESS"; payload: CrawlProgress }
  | { type: "CRAWL_COMPLETE"; payload: { connectionId: string } }
  | { type: "CRAWL_CANCELLED"; payload: { connectionId: string } }
  | { type: "CRAWL_ERROR"; payload: { connectionId: string; error: string } }
  | { type: "CRAWLED_CONNECTION_IDS"; payload: string[] }
  | { type: "CHAT_CHUNK"; payload: { token: string } }
  | { type: "CHAT_THINKING"; payload: ChatThinking }
  | { type: "CHAT_DONE" }
  | { type: "CHAT_ERROR"; payload: { error: string } }
  | { type: "INDEX_CLEARED"; payload: { connectionId: string } }
  | { type: "INDEX_STATS"; payload: { connectionId: string; stats: IndexStats | null } }
  | { type: "ERROR"; payload: { message: string } };

/** Index statistics for a connection (chunk counts by type, summary/embedding coverage, last crawl time). */
export interface IndexStats {
  totalChunks: number;
  tableChunks: number;
  viewChunks: number;
  spChunks: number;
  functionChunks: number;
  chunksWithSummary: number;
  chunksWithEmbedding: number;
  lastCrawledAt: string | null;
}

/** A single message in the chat history (user or assistant). */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

/** Thinking step shown in the UI while waiting for the chat response. */
export type ChatThinkingStep = "embedding" | "searching" | "context" | "generating";

/** Payload when step is "context": what was retrieved and is being used for RAG. */
export interface ChatThinkingContext {
  chunksUsed: number;
  byType: Record<string, number>;
  objectNames: string[];
  searchMs?: number;
  contextTokens?: number;
  totalElapsedMs?: number;
}

/** Progress payload for CHAT_THINKING: current step and optional context/model info. */
export interface ChatThinking {
  step: ChatThinkingStep;
  /** Set when step is "context"; also sent with "generating" so UI can show context + model together. */
  context?: ChatThinkingContext;
  /** Set when step is "generating". */
  model?: string;
}

/** Progress update during schema crawl or index: phase, current/total, and optional object name. */
export interface CrawlProgress {
  connectionId: string;
  phase: "connecting" | "crawling_tables" | "crawling_views" | "crawling_sps" | "crawling_functions" | "summarizing" | "embedding" | "storing";
  current: number;
  total: number;
  currentObject?: string;
}

/** Callback invoked by the crawler/indexer with progress updates. */
export type CrawlProgressCallback = (progress: CrawlProgress) => void;
