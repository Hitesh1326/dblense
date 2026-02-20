import * as vscode from "vscode";

/**
 * Generates embeddings locally using Transformers.js (all-MiniLM-L6-v2).
 * The model is downloaded once and cached on disk.
 */
export class EmbeddingService {
  private pipeline: unknown = null;

  private get modelName(): string {
    return vscode.workspace
      .getConfiguration("dblense")
      .get("embeddingModel", "Xenova/all-MiniLM-L6-v2");
  }

  async initialize(): Promise<void> {
    // TODO: import { pipeline } from '@xenova/transformers'
    //       this.pipeline = await pipeline('feature-extraction', this.modelName)
  }

  async embed(text: string): Promise<number[]> {
    // TODO: run pipeline, return flat float32 array
    throw new Error("Not implemented");
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // TODO: embed multiple texts, return array of embeddings
    throw new Error("Not implemented");
  }
}
