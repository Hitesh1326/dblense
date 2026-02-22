import { randomUUID } from "node:crypto";
import { DatabaseSchema, SchemaChunk, CrawlProgress, TableMeta, StoredProcedureMeta } from "../shared/types";
import { OllamaService } from "../llm/OllamaService";
import { PromptBuilder } from "../llm/PromptBuilder";
import { EmbeddingService } from "../embeddings/EmbeddingService";
import { VectorStoreManager } from "./VectorStoreManager";
import { SpParser } from "../parser/SpParser";

type ProgressCallback = (progress: CrawlProgress) => void;

/**
 * Orchestrates: schema → chunk → summarize (Ollama) → embed → store.
 * Reports progress at each step for UI (e.g. "Summarizing SP 47 of 312…").
 */
export class Indexer {
  constructor(
    private readonly ollamaService: OllamaService,
    private readonly promptBuilder: PromptBuilder,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStoreManager,
    private readonly spParser: SpParser
  ) {}

  async index(schema: DatabaseSchema, onProgress: ProgressCallback, signal?: AbortSignal): Promise<void> {
    const connectionId = schema.connectionId;
    const crawledAt = schema.crawledAt;
    const throwIfAborted = () => {
      if (signal?.aborted) throw new DOMException("Crawl cancelled", "AbortError");
    };

    // 1. Build raw chunks (no summary/embedding yet)
    const chunks: SchemaChunk[] = [];
    for (const table of schema.tables) {
      chunks.push(...this.chunkTable(connectionId, table, crawledAt));
    }
    for (const sp of schema.storedProcedures) {
      chunks.push(...this.chunkSp(connectionId, sp, crawledAt));
    }

    const total = chunks.length;
    if (total === 0) {
      onProgress({ connectionId, phase: "storing", current: 0, total: 1 });
      return;
    }

    // 2. Summarize each chunk via Ollama
    for (let i = 0; i < chunks.length; i++) {
      throwIfAborted();
      const chunk = chunks[i];
      onProgress({
        connectionId,
        phase: "summarizing",
        current: i + 1,
        total,
        currentObject: `${chunk.schema}.${chunk.objectName}`,
      });
      const prompt = this.promptBuilder.buildSummarizationPrompt(
        chunk.objectType,
        `${chunk.schema}.${chunk.objectName}`,
        chunk.content
      );
      chunk.summary = await this.ollamaService.summarize(prompt);
    }

    // 3. Embed all summaries in batches (e.g. 32 at a time to avoid overload)
    const batchSize = 32;
    for (let offset = 0; offset < chunks.length; offset += batchSize) {
      throwIfAborted();
      onProgress({
        connectionId,
        phase: "embedding",
        current: Math.min(offset + batchSize, chunks.length),
        total,
        currentObject: undefined,
      });
      const batch = chunks.slice(offset, offset + batchSize);
      const summaries = batch.map((c) => c.summary);
      const embeddings = await this.embeddingService.embedBatch(summaries);
      batch.forEach((chunk, j) => {
        chunk.embedding = embeddings[j];
      });
    }

    // 4. Upsert into vector store (only reached if not aborted)
    throwIfAborted();
    onProgress({ connectionId, phase: "storing", current: 1, total: 1 });
    await this.vectorStore.upsertChunks(connectionId, chunks);
  }

  private chunkTable(
    connectionId: string,
    table: TableMeta,
    crawledAt: string
  ): SchemaChunk[] {
    const lines: string[] = [];
    lines.push(`Table ${table.schema}.${table.name}`);
    const colParts = table.columns.map((c) => {
      let s = `${c.name} (${c.dataType}${c.nullable ? ", nullable" : ""})`;
      if (c.isPrimaryKey) s += " PK";
      if (c.isForeignKey && c.referencedTable) s += ` FK -> ${c.referencedTable}.${c.referencedColumn ?? "?"}`;
      return s;
    });
    lines.push("Columns: " + colParts.join("; "));
    const content = lines.join("\n");
    const id = randomUUID();
    return [
      {
        id,
        connectionId,
        objectType: "table",
        objectName: `${table.schema}.${table.name}`,
        schema: table.schema,
        content,
        summary: "",
        embedding: [],
        crawledAt,
      },
    ];
  }

  private chunkSp(
    connectionId: string,
    sp: StoredProcedureMeta,
    crawledAt: string
  ): SchemaChunk[] {
    const paramStr =
      sp.parameters.length > 0
        ? sp.parameters.map((p) => `${p.name} (${p.dataType}, ${p.direction})`).join(", ")
        : "none";
    const content = `Stored procedure ${sp.schema}.${sp.name}\nParameters: ${paramStr}\n\nDefinition:\n${sp.definition}`;
    const id = randomUUID();
    return [
      {
        id,
        connectionId,
        objectType: "stored_procedure",
        objectName: `${sp.schema}.${sp.name}`,
        schema: sp.schema,
        content,
        summary: "",
        embedding: [],
        crawledAt,
      },
    ];
  }
}
