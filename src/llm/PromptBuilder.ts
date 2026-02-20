import { SchemaChunk, ChatMessage } from "../shared/types";

/**
 * Builds structured prompts for summarization and RAG chat.
 */
export class PromptBuilder {
  buildSummarizationPrompt(objectType: string, objectName: string, ddl: string): string {
    // TODO: craft a concise summarization prompt for the given schema object
    return "";
  }

  buildRagSystemPrompt(chunks: SchemaChunk[], databaseName: string): string {
    // TODO: assemble a system prompt that injects retrieved context chunks
    return "";
  }
}
