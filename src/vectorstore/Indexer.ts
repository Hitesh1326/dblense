import { randomUUID } from "node:crypto";
import {
  DatabaseSchema,
  SchemaChunk,
  CrawlProgress,
  TableMeta,
  ViewMeta,
  StoredProcedureMeta,
  FunctionMeta,
  SpParameterMeta,
} from "../shared/types";
import { OllamaService } from "../llm/OllamaService";
import { PromptBuilder } from "../llm/PromptBuilder";
import { EmbeddingService } from "../embeddings/EmbeddingService";
import { VectorStoreManager } from "./VectorStoreManager";

/** Callback invoked with crawl/index progress (phase, current, total, currentObject). */
type ProgressCallback = (progress: CrawlProgress) => void;

/** Max concurrent Ollama summarization calls during indexing. */
const SUMMARIZE_CONCURRENCY = 5;

/** Embedding batch size to avoid overloading the embedding model. */
const EMBED_BATCH_SIZE = 32;

/**
 * Orchestrates the indexing pipeline: schema → chunks → summarize (Ollama) → embed → store.
 * Builds one chunk per table, view, stored procedure, and function; summarizes with limited
 * concurrency; embeds in batches; upserts into the vector store. Reports progress for UI.
 */
export class Indexer {
  /**
   * @param ollamaService Used to summarize chunk content for semantic search.
   * @param promptBuilder Builds summarization prompts (object type, name, content).
   * @param embeddingService Generates embeddings from summaries (batch).
   * @param vectorStore Persists chunks and vectors (LanceDB).
   */
  constructor(
    private readonly ollamaService: OllamaService,
    private readonly promptBuilder: PromptBuilder,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStoreManager
  ) {}

  /**
   * Indexes a full database schema: builds chunks, summarizes via Ollama, embeds, and upserts.
   * Progress is reported for each phase (summarizing, embedding, storing). Respects signal for cancellation.
   * @param schema Crawled schema (tables, views, stored procedures, functions).
   * @param onProgress Callback for progress updates (phase, current, total, currentObject).
   * @param signal Optional AbortSignal; when aborted, throws DOMException with name "AbortError".
   * @returns Resolves when all chunks are stored; rejects on driver error or when signal is aborted.
   */
  async index(schema: DatabaseSchema, onProgress: ProgressCallback, signal?: AbortSignal): Promise<void> {
    const throwIfAborted = () => {
      if (signal?.aborted) throw new DOMException("Crawl cancelled", "AbortError");
    };

    const chunks = this.buildChunksFromSchema(schema);
    if (chunks.length === 0) {
      onProgress({ connectionId: schema.connectionId, phase: "storing", current: 0, total: 1 });
      return;
    }

    await this.summarizeChunks(chunks, schema.connectionId, onProgress, throwIfAborted);
    await this.embedChunks(chunks, schema.connectionId, onProgress, throwIfAborted);

    throwIfAborted();
    onProgress({ connectionId: schema.connectionId, phase: "storing", current: 1, total: 1 });
    await this.vectorStore.upsertChunks(schema.connectionId, chunks);
  }

  /**
   * Builds raw schema chunks from a crawled schema (one per table, view, procedure, function).
   * Chunks have no summary or embedding yet.
   * @param schema Crawled database schema.
   * @returns Array of SchemaChunk (summary and embedding filled by later phases).
   */
  private buildChunksFromSchema(schema: DatabaseSchema): SchemaChunk[] {
    const { connectionId, crawledAt } = schema;
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
    return chunks;
  }

  /**
   * Summarizes all chunks via Ollama with limited concurrency; mutates chunk.summary in place.
   * @param chunks Chunks to summarize (content already set).
   * @param connectionId Connection id for progress.
   * @param onProgress Progress callback.
   * @param throwIfAborted Abort check (called before each unit of work).
   */
  private async summarizeChunks(
    chunks: SchemaChunk[],
    connectionId: string,
    onProgress: ProgressCallback,
    throwIfAborted: () => void
  ): Promise<void> {
    const total = chunks.length;
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
  }

  /**
   * Embeds all chunk summaries in batches; mutates chunk.embedding in place.
   * @param chunks Chunks with summary set (embedding filled here).
   * @param connectionId Connection id for progress.
   * @param onProgress Progress callback.
   * @param throwIfAborted Abort check (called before each batch).
   */
  private async embedChunks(
    chunks: SchemaChunk[],
    connectionId: string,
    onProgress: ProgressCallback,
    throwIfAborted: () => void
  ): Promise<void> {
    const total = chunks.length;
    for (let offset = 0; offset < chunks.length; offset += EMBED_BATCH_SIZE) {
      throwIfAborted();
      onProgress({
        connectionId,
        phase: "embedding",
        current: Math.min(offset + EMBED_BATCH_SIZE, chunks.length),
        total,
        currentObject: undefined,
      });
      const batch = chunks.slice(offset, offset + EMBED_BATCH_SIZE);
      const summaries = batch.map((c) => c.summary);
      const embeddings = await this.embeddingService.embedBatch(summaries);
      batch.forEach((chunk, j) => {
        chunk.embedding = embeddings[j];
      });
    }
  }

  /**
   * Creates a single schema chunk with id, content, and empty summary/embedding.
   * @param connectionId Connection id for the chunk.
   * @param objectType One of table, view, stored_procedure, function.
   * @param objectName Schema-qualified name (e.g. dbo.MyTable).
   * @param schema Schema name.
   * @param content Text content for the chunk.
   * @param crawledAt ISO timestamp of the crawl.
   * @returns A new SchemaChunk (summary and embedding to be filled later).
   */
  private createChunk(
    connectionId: string,
    objectType: SchemaChunk["objectType"],
    objectName: string,
    schema: string,
    content: string,
    crawledAt: string
  ): SchemaChunk {
    return {
      id: randomUUID(),
      connectionId,
      objectType,
      objectName,
      schema,
      content,
      summary: "",
      embedding: [],
      crawledAt,
    };
  }

  /**
   * Builds one schema chunk for a table (name, columns with types and PK/FK).
   * @param connectionId Connection id for the chunk.
   * @param table Table metadata from the crawl.
   * @param crawledAt ISO timestamp of the crawl.
   * @returns Array of one SchemaChunk (summary and embedding filled later).
   */
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
    const objectName = `${table.schema}.${table.name}`;
    return [this.createChunk(connectionId, "table", objectName, table.schema, content, crawledAt)];
  }

  /**
   * Builds one schema chunk for a view (name, columns, definition).
   * @param connectionId Connection id for the chunk.
   * @param view View metadata from the crawl.
   * @param crawledAt ISO timestamp of the crawl.
   * @returns Array of one SchemaChunk (summary and embedding filled later).
   */
  private chunkView(connectionId: string, view: ViewMeta, crawledAt: string): SchemaChunk[] {
    const colParts = view.columns.map((c) => `${c.name} (${c.dataType}${c.nullable ? ", nullable" : ""})`);
    const content = `View ${view.schema}.${view.name}\nColumns: ${colParts.join("; ")}\n\nDefinition:\n${view.definition}`;
    const objectName = `${view.schema}.${view.name}`;
    return [this.createChunk(connectionId, "view", objectName, view.schema, content, crawledAt)];
  }

  /**
   * Builds one schema chunk for a stored procedure (name, parameters, definition).
   * @param connectionId Connection id for the chunk.
   * @param sp Stored procedure metadata from the crawl.
   * @param crawledAt ISO timestamp of the crawl.
   * @returns Array of one SchemaChunk (summary and embedding filled later).
   */
  private chunkSp(
    connectionId: string,
    sp: StoredProcedureMeta,
    crawledAt: string
  ): SchemaChunk[] {
    return this.chunkProcedureLike(
      "stored_procedure",
      "Stored procedure",
      sp.schema,
      sp.name,
      sp.definition,
      sp.parameters,
      connectionId,
      crawledAt
    );
  }

  /**
   * Builds one schema chunk for a function (name, parameters, definition).
   * @param connectionId Connection id for the chunk.
   * @param fn Function metadata from the crawl.
   * @param crawledAt ISO timestamp of the crawl.
   * @returns Array of one SchemaChunk (summary and embedding filled later).
   */
  private chunkFunction(
    connectionId: string,
    fn: FunctionMeta,
    crawledAt: string
  ): SchemaChunk[] {
    return this.chunkProcedureLike(
      "function",
      "Function",
      fn.schema,
      fn.name,
      fn.definition,
      fn.parameters,
      connectionId,
      crawledAt
    );
  }

  /**
   * Builds one schema chunk for a stored procedure or function (shared shape: parameters + definition).
   * @param objectType "stored_procedure" or "function".
   * @param label Human-readable label for content (e.g. "Stored procedure", "Function").
   * @param schema Schema name.
   * @param name Object name.
   * @param definition DDL or definition text.
   * @param parameters Parameter list (name, type, direction).
   * @param connectionId Connection id for the chunk.
   * @param crawledAt ISO timestamp of the crawl.
   * @returns Array of one SchemaChunk (summary and embedding filled later).
   */
  private chunkProcedureLike(
    objectType: "stored_procedure" | "function",
    label: string,
    schema: string,
    name: string,
    definition: string,
    parameters: SpParameterMeta[],
    connectionId: string,
    crawledAt: string
  ): SchemaChunk[] {
    const paramStr =
      parameters.length > 0
        ? parameters.map((p) => `${p.name} (${p.dataType}, ${p.direction})`).join(", ")
        : "none";
    const objectName = `${schema}.${name}`;
    const content = `${label} ${objectName}\nParameters: ${paramStr}\n\nDefinition:\n${definition}`;
    return [this.createChunk(connectionId, objectType, objectName, schema, content, crawledAt)];
  }
}
