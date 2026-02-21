import * as vscode from "vscode";
import { ChatMessage } from "../shared/types";

type StreamCallback = (token: string) => void;

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.1:8b";

const SUMMARIZE_SYSTEM = `Summarize the following database schema or stored procedure text in 1-3 concise sentences suitable for semantic search. Output only the summary, no preamble.`;

/**
 * Thin wrapper around the Ollama HTTP API.
 * Uses Node's built-in fetch (Node 18+) — no external HTTP client needed.
 */
export class OllamaService {
  private get baseUrl(): string {
    return vscode.workspace.getConfiguration("schemasight").get("ollamaBaseUrl", DEFAULT_BASE_URL);
  }

  private get model(): string {
    return vscode.workspace.getConfiguration("schemasight").get("ollamaModel", DEFAULT_MODEL);
  }

  /**
   * Configurable model name (for display and pull hint).
   */
  getModelName(): string {
    return this.model;
  }

  /**
   * Check if Ollama is running and reachable (GET /api/tags).
   */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
      if (!res.ok) return false;
      const data = (await res.json()) as { models?: unknown[] };
      return Array.isArray(data?.models);
    } catch {
      return false;
    }
  }

  /**
   * Check if the configured model is present in Ollama (already pulled).
   */
  async isModelPulled(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
      if (!res.ok) return false;
      const data = (await res.json()) as { models?: { name?: string }[] };
      const models = data?.models ?? [];
      const want = this.model;
      return models.some((m) => typeof m.name === "string" && m.name === want);
    } catch {
      return false;
    }
  }

  /**
   * Summarize content for indexing (POST /api/generate, non-streaming).
   */
  async summarize(content: string): Promise<string> {
    const url = `${this.baseUrl}/api/generate`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: content,
        system: SUMMARIZE_SYSTEM,
        stream: false,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama generate failed (${res.status}): ${text || res.statusText}`);
    }
    const data = (await res.json()) as { response?: string };
    const summary = data.response;
    if (typeof summary !== "string") {
      throw new Error("Ollama response missing or invalid 'response' field");
    }
    return summary.trim();
  }

  /**
   * Chat with history; streams tokens via onToken (POST /api/chat with stream: true).
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

    const decoder = new TextDecoder();
    let buffer = "";

    try {
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
      // last line in buffer
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
    } finally {
      reader.releaseLock();
    }
  }
}
