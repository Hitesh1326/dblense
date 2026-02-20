import * as vscode from "vscode";
import { ChatMessage } from "../shared/types";

type StreamCallback = (token: string) => void;

/**
 * Thin wrapper around the Ollama HTTP API.
 * Uses Node's built-in fetch (Node 18+) — no external HTTP client needed.
 */
export class OllamaService {
  private get baseUrl(): string {
    return vscode.workspace.getConfiguration("dblense").get("ollamaBaseUrl", "http://localhost:11434");
  }

  private get model(): string {
    return vscode.workspace.getConfiguration("dblense").get("ollamaModel", "llama3.1:8b");
  }

  async isAvailable(): Promise<boolean> {
    // TODO: GET /api/tags and check response
    return false;
  }

  async summarize(content: string): Promise<string> {
    // TODO: POST /api/generate with a summarization prompt
    throw new Error("Not implemented");
  }

  async chat(
    systemPrompt: string,
    history: ChatMessage[],
    userMessage: string,
    onToken: StreamCallback
  ): Promise<void> {
    // TODO: POST /api/chat with stream: true, pipe tokens to onToken
  }
}
