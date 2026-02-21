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

  private get modelName(): string {
    return vscode.workspace
      .getConfiguration("schemasight")
      .get("embeddingModel", DEFAULT_MODEL);
  }

  /**
   * Ensure the pipeline is loaded. Call before embed/embedBatch, or use explicitly to preload.
   */
  async initialize(): Promise<void> {
    await this.ensurePipeline();
  }

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
   * Embed a single text; returns a float vector (e.g. 384-dim for MiniLM-L6).
   */
  async embed(text: string): Promise<number[]> {
    const pipe = await this.ensurePipeline();
    const output = await pipe(text, POOLING_OPTIONS);
    return this.tensorToVector(output);
  }

  /**
   * Embed multiple texts in one forward pass; returns an array of vectors.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const pipe = await this.ensurePipeline();
    const output = await pipe(texts, POOLING_OPTIONS);
    return this.tensorToVectors(output);
  }

  private tensorToVector(tensor: { data: Float32Array; dims: number[] }): number[] {
    return Array.from(tensor.data);
  }

  private tensorToVectors(tensor: { data: Float32Array; dims: number[] }): number[][] {
    const dims = tensor.dims;
    const data = tensor.data;
    if (dims.length === 1) {
      return [Array.from(data)];
    }
    // shape [batchSize, embedDim]
    const [batchSize, embedDim] = dims;
    const out: number[][] = [];
    for (let i = 0; i < batchSize; i++) {
      const start = i * embedDim;
      out.push(Array.from(data.slice(start, start + embedDim)));
    }
    return out;
  }
}
