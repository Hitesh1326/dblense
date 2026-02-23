import * as vscode from "vscode";
import { ConnectionManager } from "../db/ConnectionManager";
import { SchemaService } from "../db/SchemaService";
import { OllamaService } from "../llm/OllamaService";
import { PromptBuilder } from "../llm/PromptBuilder";
import { EmbeddingService } from "../embeddings/EmbeddingService";
import { VectorStoreManager } from "../vectorstore/VectorStoreManager";
import { Indexer } from "../vectorstore/Indexer";
import { logger } from "../utils/logger";
import type { SchemaChunk, ChatThinking } from "../shared/types";
import {
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
} from "../shared/types";

function isOllamaUnreachableError(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes("fetch") ||
    lower.includes("econnrefused") ||
    lower.includes("11434") ||
    lower.includes("ollama") ||
    lower.includes("network") ||
    lower.includes("failed to fetch")
  );
}

/** True when the user is asking for a full list or count of schema objects (needs full schema, not top-k). */
function isBroadSchemaQuery(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const listOrCount =
    /\b(list|count|how\s+many|what\s+are|every|all)\s+(the\s+)?(tables?|views?|stored\s+procedures?|procedures?|functions?)/i.test(
      lower
    ) ||
    /(tables?|views?|stored\s+procedures?|procedures?|functions?)\s+(in\s+(the\s+)?database|in\s+total)/i.test(
      lower
    ) ||
    /^(tables?|views?|list|count)\s*[?.]?$/i.test(lower);
  return listOrCount;
}

type PostMessage = (message: ExtensionToWebviewMessage) => void;

interface Services {
  connectionManager: ConnectionManager;
  schemaService: SchemaService;
  ollamaService: OllamaService;
  promptBuilder: PromptBuilder;
  embeddingService: EmbeddingService;
  vectorStoreManager: VectorStoreManager;
  indexer: Indexer;
}

/**
 * Routes messages from the webview to the appropriate service handler.
 */
export class MessageRouter {
  /** Holds the active crawl abort controller; null when no crawl is running. */
  private activeCrawl: { connectionId: string; controller: AbortController } | null = null;

  constructor(private readonly services: Services) {}

  async handle(message: WebviewToExtensionMessage, post: PostMessage): Promise<void> {
    try {
      switch (message.type) {
        case "GET_CONNECTIONS": {
          const connections = await this.services.connectionManager.getAll();
          const crawledIds = await this.services.connectionManager.getCrawledConnectionIds();
          post({ type: "CONNECTIONS_LIST", payload: connections });
          post({ type: "CRAWLED_CONNECTION_IDS", payload: crawledIds });
          break;
        }
        case "ADD_CONNECTION": {
          const { password, ...config } = message.payload;
          await this.services.connectionManager.add(config, password);
          post({ type: "CONNECTION_ADDED", payload: config });
          break;
        }
        case "REMOVE_CONNECTION": {
          await this.services.connectionManager.remove(message.payload.id);
          post({ type: "CONNECTION_REMOVED", payload: message.payload });
          break;
        }
        case "TEST_CONNECTION": {
          const result = await this.services.connectionManager.testConnection(message.payload.id);
          post({
            type: "CONNECTION_TEST_RESULT",
            payload: {
              id: message.payload.id,
              success: result.success,
              error: result.error,
            },
          });
          if (result.success) {
            vscode.window.showInformationMessage("SchemaSight: Connection successful.");
          } else {
            vscode.window.showErrorMessage(`SchemaSight: Connection failed. ${result.error ?? "Unknown error"}`);
          }
          break;
        }
        case "GET_OLLAMA_STATUS": {
          const available = await this.services.ollamaService.isAvailable();
          let model: string | undefined;
          let modelPulled: boolean | undefined;
          if (available) {
            model = this.services.ollamaService.getModelName();
            modelPulled = await this.services.ollamaService.isModelPulled();
          }
          post({ type: "OLLAMA_STATUS", payload: { available, model, modelPulled } });
          break;
        }
        case "CRAWL_SCHEMA": {
          const connectionId = message.payload.id;
          const config = await this.services.connectionManager.getById(connectionId);
          if (!config) {
            post({ type: "ERROR", payload: { message: "Connection not found" } });
            break;
          }
          const password = await this.services.connectionManager.getPassword(connectionId);
          if (password === undefined) {
            post({ type: "ERROR", payload: { message: "Password not found for this connection" } });
            break;
          }
          const controller = new AbortController();
          this.activeCrawl = { connectionId, controller };
          try {
            const schema = await this.services.schemaService.crawl(
              config,
              password,
              (progress) => post({ type: "CRAWL_PROGRESS", payload: progress }),
              controller.signal
            );
            await this.services.indexer.index(
              schema,
              (progress) => post({ type: "CRAWL_PROGRESS", payload: progress }),
              controller.signal
            );
            await this.services.connectionManager.addCrawledConnectionId(connectionId);
            const crawledIds = await this.services.connectionManager.getCrawledConnectionIds();
            post({ type: "CRAWL_COMPLETE", payload: { connectionId } });
            post({ type: "CRAWLED_CONNECTION_IDS", payload: crawledIds });
            vscode.window.showInformationMessage("SchemaSight: Schema crawl and index complete.");
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
              post({ type: "CRAWL_CANCELLED", payload: { connectionId } });
              vscode.window.showInformationMessage("SchemaSight: Re-index cancelled.");
            } else {
              const error = err instanceof Error ? err.message : String(err);
              logger.error("Crawl failed", err);
              post({ type: "CRAWL_ERROR", payload: { connectionId, error } });
              if (isOllamaUnreachableError(error)) {
                vscode.window.showErrorMessage(
                  "SchemaSight: Couldn't reach Ollama. Is it running? Start it (e.g. ollama serve) and try again. See Output → SchemaSight for details."
                );
              } else {
                vscode.window.showErrorMessage(`SchemaSight: Crawl failed. See Output → SchemaSight for details.`);
              }
            }
          } finally {
            this.activeCrawl = null;
          }
          break;
        }
        case "CRAWL_CANCEL": {
          const { connectionId } = message.payload;
          if (this.activeCrawl?.connectionId === connectionId) {
            this.activeCrawl.controller.abort();
          }
          break;
        }
        case "CHAT": {
          const { connectionId, message: userMessage, history } = message.payload;
          const config = await this.services.connectionManager.getById(connectionId);
          if (!config) {
            post({ type: "CHAT_ERROR", payload: { error: "Connection not found" } });
            break;
          }
          const useFullSchema = isBroadSchemaQuery(userMessage);
          const topK = 30;
          const postThinking = (payload: ChatThinking) =>
            post({ type: "CHAT_THINKING", payload });

          let searchQuery = userMessage;
          if (!useFullSchema && history.length > 0) {
            try {
              const rewritePrompt = this.services.promptBuilder.buildQueryRewritePrompt(history, userMessage);
              const rewritten = await this.services.ollamaService.rewriteQueryForSearch(rewritePrompt);
              if (rewritten.length > 0) searchQuery = rewritten;
            } catch (e) {
              logger.warn(`Query rewrite failed, using original message: ${e instanceof Error ? e.message : e}`);
            }
          }

          try {
            let chunks: SchemaChunk[];
            let searchMs: number | undefined;

            if (useFullSchema) {
              postThinking({ step: "searching" });
              const t0 = Date.now();
              chunks = await this.services.vectorStoreManager.getAllChunks(connectionId);
              searchMs = Date.now() - t0;
            } else {
              postThinking({ step: "embedding" });
              const queryEmbedding = await this.services.embeddingService.embed(searchQuery);
              postThinking({ step: "searching" });
              const t0 = Date.now();
              chunks = await this.services.vectorStoreManager.search(connectionId, queryEmbedding, {
                topK,
                queryText: searchQuery,
              });
              searchMs = Date.now() - t0;
            }

            const byType: Record<string, number> = {};
            for (const c of chunks) {
              byType[c.objectType] = (byType[c.objectType] ?? 0) + 1;
            }
            const objectNames = chunks.slice(0, 8).map((c) => `${c.schema}.${c.objectName}`);
            const systemPrompt = this.services.promptBuilder.buildRagSystemPrompt(chunks, config.database);
            const contextTokens = Math.round(systemPrompt.length / 4);

            const contextPayload = {
              chunksUsed: chunks.length,
              byType,
              objectNames,
              searchMs,
              contextTokens,
            };
            postThinking({ step: "context", context: contextPayload });

            postThinking({
              step: "generating",
              model: this.services.ollamaService.getModelName(),
              context: contextPayload,
            });

            await this.services.ollamaService.chat(
              systemPrompt,
              history,
              userMessage,
              (token) => post({ type: "CHAT_CHUNK", payload: { token } })
            );
            post({ type: "CHAT_DONE" });
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            logger.error("Chat RAG failed", err);
            post({ type: "CHAT_ERROR", payload: { error } });
          }
          break;
        }
        case "CLEAR_INDEX":
          // TODO: clear index for connection, post INDEX_CLEARED
          break;
        case "GET_INDEX_STATS": {
          const { connectionId } = message.payload;
          const stats = await this.services.vectorStoreManager.getIndexStats(connectionId);
          post({ type: "INDEX_STATS", payload: { connectionId, stats } });
          break;
        }
        default:
          post({ type: "ERROR", payload: { message: "Unknown message type" } });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      post({ type: "ERROR", payload: { message } });
    }
  }
}
