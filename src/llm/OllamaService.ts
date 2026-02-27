import * as vscode from "vscode";
import type { ChatMessage } from "../shared/types";
import { logger } from "../utils/logger";

type StreamCallback = (token: string) => void;

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.1:8b";

const SUMMARIZE_SYSTEM = `Summarize the following database schema or stored procedure text in 1-3 concise sentences suitable for semantic search. Output only the summary, no preamble.`;

const QUERY_REWRITE_SYSTEM = `You are a query rewriter for a database schema search. Given a conversation and the latest user message, output a single standalone search query that captures what the user is asking. Resolve references like "it", "that", "the procedure" using the conversation. Output only the search query, one line, no preamble or explanation.`;

const CONVERSATION_SUMMARY_SYSTEM = `Summarize this conversation in 1-2 short paragraphs. Preserve database object names (tables, procedures, functions, views), key facts the user asked about, and any references the assistant made. The summary will be used as context so later messages can still refer to earlier topics. Output only the summary, no preamble.`;

/** Response shape from GET /api/tags. */
interface OllamaTagsResponse {
  models?: { name?: string }[];
}

/** Response shape from POST /api/show (model details). */
interface OllamaShowResponse {
  parameters?: string;
  model_info?: Record<string, number>;
}

/**
 * Thin wrapper around the Ollama HTTP API.
 * Uses Node's built-in fetch (Node 18+) — no external HTTP client needed.
 */
export class OllamaService {
  /** Base URL from VS Code config (schemasight.ollamaBaseUrl). */
  private get baseUrl(): string {
    return vscode.workspace.getConfiguration("schemasight").get("ollamaBaseUrl", DEFAULT_BASE_URL);
  }

  /** Model name from VS Code config (schemasight.ollamaModel). */
  private get model(): string {
    return vscode.workspace.getConfiguration("schemasight").get("ollamaModel", DEFAULT_MODEL);
  }

  /**
   * Returns the configured model name (for display and pull hint).
   * @returns The current Ollama model name.
   */
  getModelName(): string {
    return this.model;
  }

  /**
   * Checks if Ollama is running and reachable (GET /api/tags).
   * @returns True if the tags endpoint returns a valid response; false on network or parse error.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const data = await this.getTags();
      return Array.isArray(data?.models);
    } catch {
      return false;
    }
  }

  /**
   * Checks if the configured model is present in Ollama (already pulled).
   * @returns True if the model appears in /api/tags; false otherwise.
   */
  async isModelPulled(): Promise<boolean> {
    try {
      const data = await this.getTags();
      const models = data?.models ?? [];
      const want = this.model;
      return models.some((m) => typeof m.name === "string" && m.name === want);
    } catch {
      return false;
    }
  }

  /**
   * Summarizes content for indexing (POST /api/generate, non-streaming).
   * @param content Raw schema or procedure text to summarize.
   * @returns A short summary (1–3 sentences); throws on API or invalid response.
   */
  async summarize(content: string): Promise<string> {
    const raw = await this.generate(content, SUMMARIZE_SYSTEM);
    if (typeof raw !== "string") {
      throw new Error("Ollama response missing or invalid 'response' field");
    }
    return raw.trim();
  }

  /**
   * Summarizes a conversation segment for context compression. Preserves entity names and references.
   * @param prompt Formatted conversation (from PromptBuilder.buildConversationSummaryPrompt).
   * @returns Summary string; throws on API or invalid response.
   */
  async summarizeConversation(prompt: string): Promise<string> {
    const raw = await this.generate(prompt, CONVERSATION_SUMMARY_SYSTEM);
    if (typeof raw !== "string") {
      throw new Error("Ollama conversation summary missing or invalid");
    }
    return raw.trim();
  }

  /**
   * Rewrites a follow-up message into a standalone search query (prompt built from conversation + current message by PromptBuilder).
   * @param prompt Full prompt for the rewriter (conversation + latest message).
   * @returns Standalone search query string, or empty string if response is missing/invalid.
   */
  async rewriteQueryForSearch(prompt: string): Promise<string> {
    const raw = await this.generate(prompt, QUERY_REWRITE_SYSTEM);
    return typeof raw === "string" ? raw.trim() : "";
  }

  /**
   * Chat with history; streams tokens via onToken (POST /api/chat with stream: true).
   * @param systemPrompt System prompt (e.g. RAG context).
   * @param history Previous messages (role + content).
   * @param userMessage Latest user message.
   * @param onToken Callback invoked for each streamed token.
   * @throws Error on non-OK response or missing response body.
   */
  async chat(
    systemPrompt: string,
    history: ChatMessage[],
    userMessage: string,
    onToken: StreamCallback
  ): Promise<void> {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessage },
    ];

    const url = `${this.baseUrl}/api/chat`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama chat failed (${res.status}): ${text || res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("Ollama chat response has no body");
    }

    try {
      await this.streamChatResponse(reader, onToken);
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Returns the model's context length (tokens) from Ollama POST /api/show.
   * Parses `parameters` for "num_ctx N" or `model_info` for "*context_length".
   * @returns Context length in tokens, or a safe default (8192) if unavailable.
   */
  async getContextLength(): Promise<number> {
    const DEFAULT_CTX = 8192;
    try {
      const res = await fetch(`${this.baseUrl}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model }),
      });
      if (!res.ok) {
        logger.info(`Context limit: ${DEFAULT_CTX} (fallback: Ollama /api/show returned ${res.status})`);
        return DEFAULT_CTX;
      }
      const data = (await res.json()) as OllamaShowResponse;
      if (data.parameters) {
        const match = data.parameters.match(/\bnum_ctx\s+(\d+)/i);
        if (match) {
          const n = Math.max(1, parseInt(match[1], 10));
          logger.info(`Context limit: ${n} (from Ollama parameters num_ctx)`);
          return n;
        }
      }
      if (data.model_info && typeof data.model_info === "object") {
        for (const [key, value] of Object.entries(data.model_info)) {
          if (key.endsWith("context_length") && typeof value === "number" && value > 0) {
            logger.info(`Context limit: ${value} (from Ollama model_info.${key})`);
            return value;
          }
        }
      }
      logger.info(`Context limit: ${DEFAULT_CTX} (fallback: no num_ctx or context_length in /api/show)`);
    } catch (e) {
      logger.info(`Context limit: ${DEFAULT_CTX} (fallback: Ollama unavailable — ${e instanceof Error ? e.message : "unknown error"})`);
    }
    return DEFAULT_CTX;
  }

  /**
   * Fetches GET /api/tags (list of models). Shared by isAvailable and isModelPulled.
   * @returns Parsed tags response; throws on network or non-OK response.
   */
  private async getTags(): Promise<OllamaTagsResponse> {
    const res = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama tags failed (${res.status}): ${text || res.statusText}`);
    }
    return (await res.json()) as OllamaTagsResponse;
  }

  /**
   * Non-streaming POST /api/generate. Used by summarize and rewriteQueryForSearch.
   * @param prompt User prompt.
   * @param system System prompt.
   * @returns The response.response string, or undefined if missing.
   */
  private async generate(prompt: string, system: string): Promise<string | undefined> {
    const url = `${this.baseUrl}/api/generate`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt,
        system,
        stream: false,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama generate failed (${res.status}): ${text || res.statusText}`);
    }
    const data = (await res.json()) as { response?: string };
    return data.response;
  }

  /**
   * Consumes the chat stream: reads chunks, splits by newline, parses JSON lines and invokes onToken for message.content.
   * @param reader Response body reader.
   * @param onToken Callback for each token (message.content from each JSON line).
   */
  private async streamChatResponse(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onToken: StreamCallback
  ): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const data = JSON.parse(trimmed) as { message?: { content?: string }; done?: boolean };
          const content = data.message?.content;
          if (typeof content === "string" && content.length > 0) {
            onToken(content);
          }
        } catch {
          // ignore malformed JSON lines (e.g. keep_alive pings)
        }
      }
    }

    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer.trim()) as { message?: { content?: string } };
        const content = data.message?.content;
        if (typeof content === "string" && content.length > 0) {
          onToken(content);
        }
      } catch {
        // ignore
      }
    }
  }
}
