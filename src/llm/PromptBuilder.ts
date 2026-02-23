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

  /**
   * Builds the prompt for rewriting a follow-up message into a standalone search query
   * so retrieval stays focused on what the user is asking about (e.g. "it" → GetSupplierUpdates).
   */
  buildQueryRewritePrompt(history: ChatMessage[], currentMessage: string): string {
    const lines: string[] = [];
    for (const m of history) {
      lines.push(`${m.role === "user" ? "User" : "Assistant"}: ${m.content}`);
    }
    lines.push(`User: ${currentMessage}`);
    lines.push("");
    lines.push(
      "Output a single standalone search query that captures what the user is asking, including what \"it\" or \"that\" refers to from the conversation. Output only the query, one line, no explanation."
    );
    return lines.join("\n");
  }

  /**
   * Builds the system prompt for RAG chat: instructs the model to answer using only
   * the provided schema context (object type, name, and summary per chunk).
   */
  buildRagSystemPrompt(chunks: SchemaChunk[], databaseName: string): string {
    const intro = `You are a helpful assistant for the database "${databaseName}". Answer questions about the schema and business logic using only the retrieved context below. The index contains tables, views, stored procedures, and functions. If the answer is not in the context, say so. Be concise.`;
    if (chunks.length === 0) {
      return `${intro}\n\nNo schema context was retrieved for this query. Ask the user to rephrase or mention that the index may be empty.`;
    }
    const blocks = chunks.map((c) => {
      const heading = `[${c.objectType}] ${c.schema}.${c.objectName}`;
      const body = c.summary?.trim() || c.content.slice(0, 300).trim() + (c.content.length > 300 ? "…" : "");
      return `${heading}\n${body}`;
    });
    return `${intro}\n\n## Retrieved context\n\n${blocks.join("\n\n---\n\n")}`;
  }
}
