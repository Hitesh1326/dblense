import { SchemaChunk, ChatMessage } from "../shared/types";

/**
 * Builds structured prompts for summarization and RAG chat.
 */
export class PromptBuilder {
  /**
   * Format schema object content for the summarization model.
   * Prefix with type and name so the model knows what it is summarizing.
   */
  buildSummarizationPrompt(objectType: string, objectName: string, content: string): string {
    return `[${objectType}] ${objectName}\n\n${content}`;
  }

  buildRagSystemPrompt(chunks: SchemaChunk[], databaseName: string): string {
    // TODO: assemble a system prompt that injects retrieved context chunks
    return "";
  }
}
