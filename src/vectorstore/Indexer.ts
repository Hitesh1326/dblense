import { DatabaseSchema, SchemaChunk, CrawlProgress } from "../shared/types";
import { OllamaService } from "../llm/OllamaService";
import { PromptBuilder } from "../llm/PromptBuilder";
import { EmbeddingService } from "../embeddings/EmbeddingService";
import { VectorStoreManager } from "./VectorStoreManager";
import { SpParser } from "../parser/SpParser";

type ProgressCallback = (progress: CrawlProgress) => void;

/**
 * Orchestrates: schema → summarize → embed → store pipeline.
 */
export class Indexer {
  constructor(
    private readonly ollamaService: OllamaService,
    private readonly promptBuilder: PromptBuilder,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStoreManager,
    private readonly spParser: SpParser
  ) {}

  async index(schema: DatabaseSchema, onProgress: ProgressCallback): Promise<void> {
    // TODO:
    // 1. chunk tables and stored procedures
    // 2. summarize each chunk via OllamaService
    // 3. embed summaries via EmbeddingService
    // 4. upsert into VectorStoreManager
    // Report progress at each step
  }

  private chunkTable(connectionId: string, table: import("../shared/types").TableMeta): SchemaChunk[] {
    // TODO: produce one chunk per table + column-level chunks if large
    return [];
  }

  private chunkSp(
    connectionId: string,
    sp: import("../shared/types").StoredProcedureMeta
  ): SchemaChunk[] {
    // TODO: produce one or more chunks for a stored procedure
    return [];
  }
}
