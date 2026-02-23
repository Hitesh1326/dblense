// ─── Database Connection ──────────────────────────────────────────────────────

export type DbDriver = "mssql" | "postgres" | "mysql";

/** Implemented by each DB driver; used by ConnectionManager and SchemaService. */
export interface IDbDriver {
  testConnection(config: DbConnectionConfig, password: string): Promise<boolean>;
  crawlSchema(
    config: DbConnectionConfig,
    password: string,
    onProgress?: CrawlProgressCallback,
    signal?: AbortSignal
  ): Promise<DatabaseSchema>;
}

export interface DbConnectionConfig {
  id: string;
  label: string;
  driver: DbDriver;
  host: string;
  port: number;
  database: string;
  username: string;
  /** Password is stored separately in VS Code SecretStorage */
  useSsl: boolean;
}

// ─── Schema Metadata ──────────────────────────────────────────────────────────

export interface TableMeta {
  schema: string;
  name: string;
  rowCount?: number;
  columns: ColumnMeta[];
}

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

export interface StoredProcedureMeta {
  schema: string;
  name: string;
  definition: string;
  parameters: SpParameterMeta[];
}

export interface SpParameterMeta {
  name: string;
  dataType: string;
  direction: "IN" | "OUT" | "INOUT";
}

export interface ViewMeta {
  schema: string;
  name: string;
  columns: ColumnMeta[];
  definition: string;
}

export interface FunctionMeta {
  schema: string;
  name: string;
  definition: string;
  parameters: SpParameterMeta[];
}

export interface DatabaseSchema {
  connectionId: string;
  databaseName: string;
  tables: TableMeta[];
  views: ViewMeta[];
  storedProcedures: StoredProcedureMeta[];
  functions: FunctionMeta[];
  crawledAt: string;
}

// ─── Vector Store ─────────────────────────────────────────────────────────────

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

// ─── Webview ↔ Extension Messages ────────────────────────────────────────────

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

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

/** Thinking step shown while waiting for chat response. */
export type ChatThinkingStep = "embedding" | "searching" | "context" | "generating";

/** Payload when step is "context" — what we retrieved and are using. */
export interface ChatThinkingContext {
  chunksUsed: number;
  byType: Record<string, number>;
  objectNames: string[];
  searchMs?: number;
  contextTokens?: number;
}

export interface ChatThinking {
  step: ChatThinkingStep;
  /** Set when step is "context"; also sent with "generating" so UI can show context + model together. */
  context?: ChatThinkingContext;
  /** Set when step is "generating". */
  model?: string;
}

// ─── Crawl ────────────────────────────────────────────────────────────────────

export interface CrawlProgress {
  connectionId: string;
  phase: "connecting" | "crawling_tables" | "crawling_views" | "crawling_sps" | "crawling_functions" | "summarizing" | "embedding" | "storing";
  current: number;
  total: number;
  currentObject?: string;
}

export type CrawlProgressCallback = (progress: CrawlProgress) => void;
