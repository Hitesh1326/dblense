import { randomUUID } from "node:crypto";
import {
  DatabaseSchema,
  SchemaChunk,
  CrawlProgress,
  TableMeta,
  ViewMeta,
  StoredProcedureMeta,
  FunctionMeta,
} from "../shared/types";
import { OllamaService } from "../llm/OllamaService";
import { PromptBuilder } from "../llm/PromptBuilder";
import { EmbeddingService } from "../embeddings/EmbeddingService";
import { VectorStoreManager } from "./VectorStoreManager";
import { SpParser } from "../parser/SpParser";

type ProgressCallback = (progress: CrawlProgress) => void;

/** Max concurrent Ollama summarization calls during indexing. */
const SUMMARIZE_CONCURRENCY = 5;

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
    for (const view of schema.views) {
      chunks.push(...this.chunkView(connectionId, view, crawledAt));
    }
    for (const sp of schema.storedProcedures) {
      chunks.push(...this.chunkSp(connectionId, sp, crawledAt));
    }
    for (const fn of schema.functions) {
      chunks.push(...this.chunkFunction(connectionId, fn, crawledAt));
    }

    const total = chunks.length;
    if (total === 0) {
      onProgress({ connectionId, phase: "storing", current: 0, total: 1 });
      return;
    }

    // 2. Summarize chunks via Ollama with limited concurrency
    let completed = 0;
    const summarizeOne = async (i: number): Promise<void> => {
      throwIfAborted();
      const chunk = chunks[i];
      const prompt = this.promptBuilder.buildSummarizationPrompt(
        chunk.objectType,
        `${chunk.schema}.${chunk.objectName}`,
        chunk.content
      );
      chunk.summary = await this.ollamaService.summarize(prompt);
      completed++;
      onProgress({
        connectionId,
        phase: "summarizing",
        current: completed,
        total,
        currentObject: `${chunk.schema}.${chunk.objectName}`,
      });
    };
    const queue = chunks.map((_, i) => i);
    const workers = Math.min(SUMMARIZE_CONCURRENCY, queue.length);
    const runWorker = async (): Promise<void> => {
      while (queue.length > 0) {
        throwIfAborted();
        const i = queue.shift()!;
        await summarizeOne(i);
      }
    };
    await Promise.all(Array.from({ length: workers }, () => runWorker()));

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

  private chunkView(connectionId: string, view: ViewMeta, crawledAt: string): SchemaChunk[] {
    const colParts = view.columns.map((c) => `${c.name} (${c.dataType}${c.nullable ? ", nullable" : ""})`);
    const content = `View ${view.schema}.${view.name}\nColumns: ${colParts.join("; ")}\n\nDefinition:\n${view.definition}`;
    const id = randomUUID();
    return [
      {
        id,
        connectionId,
        objectType: "view",
        objectName: `${view.schema}.${view.name}`,
        schema: view.schema,
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

  private chunkFunction(
    connectionId: string,
    fn: FunctionMeta,
    crawledAt: string
  ): SchemaChunk[] {
    const paramStr =
      fn.parameters.length > 0
        ? fn.parameters.map((p) => `${p.name} (${p.dataType}, ${p.direction})`).join(", ")
        : "none";
    const content = `Function ${fn.schema}.${fn.name}\nParameters: ${paramStr}\n\nDefinition:\n${fn.definition}`;
    const id = randomUUID();
    return [
      {
        id,
        connectionId,
        objectType: "function",
        objectName: `${fn.schema}.${fn.name}`,
        schema: fn.schema,
        content,
        summary: "",
        embedding: [],
        crawledAt,
      },
    ];
  }
}
