import * as vscode from "vscode";

const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";
const POOLING_OPTIONS = { pooling: "mean" as const, normalize: true };

type FeatureExtractionPipeline = (text: string | string[], options: { pooling: "mean"; normalize: boolean }) => Promise<{ data: Float32Array; dims: number[] }>;

/**
 * Generates embeddings locally using Transformers.js (e.g. all-MiniLM-L6-v2).
 * The model is downloaded once and cached on disk. Lazy-initializes on first embed.
 * Uses dynamic import so the ESM-only @xenova/transformers loads correctly when extension is CJS.
 */
export class EmbeddingService {
  private pipelineInstance: FeatureExtractionPipeline | null = null;
  private initPromise: Promise<void> | null = null;

  /** Model name from VS Code config (schemasight.embeddingModel). Resolved at first pipeline load. */
  private get modelName(): string {
    return vscode.workspace
      .getConfiguration("schemasight")
      .get("embeddingModel", DEFAULT_MODEL);
  }

  /**
   * Ensures the pipeline is loaded. Call before embed/embedBatch, or use explicitly to preload.
   * @returns Resolves when the model is ready (or already loaded).
   */
  async initialize(): Promise<void> {
    await this.ensurePipeline();
  }

  /** Loads the feature-extraction pipeline once; concurrent callers share the same load. */
  private async ensurePipeline(): Promise<FeatureExtractionPipeline> {
    if (this.pipelineInstance) return this.pipelineInstance;
    if (this.initPromise) {
      await this.initPromise;
      return this.pipelineInstance!;
    }
    this.initPromise = (async () => {
      const { pipeline } = await import("@xenova/transformers");
      const pipe = await pipeline("feature-extraction", this.modelName);
      this.pipelineInstance = pipe as FeatureExtractionPipeline;
    })();
    await this.initPromise;
    this.initPromise = null;
    return this.pipelineInstance!;
  }

  /**
   * Embeds a single text into a float vector (e.g. 384-dim for MiniLM-L6).
   * @param text Input string to embed.
   * @returns One embedding vector as an array of numbers.
   */
  async embed(text: string): Promise<number[]> {
    const pipe = await this.ensurePipeline();
    const output = await pipe(text, POOLING_OPTIONS);
    return this.tensorToVector(output);
  }

  /**
   * Embeds multiple texts in one forward pass; more efficient than calling embed repeatedly.
   * @param texts Input strings to embed (empty array returns []).
   * @returns Array of embedding vectors, one per input text.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const pipe = await this.ensurePipeline();
    const output = await pipe(texts, POOLING_OPTIONS);
    return this.tensorToVectors(output);
  }

  /** Converts pipeline output for a single text (shape [embedDim]) to a plain number array. */
  private tensorToVector(tensor: { data: Float32Array; dims: number[] }): number[] {
    return Array.from(tensor.data);
  }

  /** Converts pipeline output for a batch (shape [batchSize, embedDim]) to an array of number arrays. */
  private tensorToVectors(tensor: { data: Float32Array; dims: number[] }): number[][] {
    const dims = tensor.dims;
    const data = tensor.data;
    if (dims.length === 1) {
      return [Array.from(data)];
    }
    const [batchSize, embedDim] = dims;
    const out: number[][] = [];
    for (let i = 0; i < batchSize; i++) {
      const start = i * embedDim;
      out.push(Array.from(data.slice(start, start + embedDim)));
    }
    return out;
  }
}
