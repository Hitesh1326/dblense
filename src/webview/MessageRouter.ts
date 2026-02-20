import * as vscode from "vscode";
import { ConnectionManager } from "../db/ConnectionManager";
import { OllamaService } from "../llm/OllamaService";
import { EmbeddingService } from "../embeddings/EmbeddingService";
import { VectorStoreManager } from "../vectorstore/VectorStoreManager";
import {
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
} from "../shared/types";

type PostMessage = (message: ExtensionToWebviewMessage) => void;

interface Services {
  connectionManager: ConnectionManager;
  ollamaService: OllamaService;
  embeddingService: EmbeddingService;
  vectorStoreManager: VectorStoreManager;
}

/**
 * Routes messages from the webview to the appropriate service handler.
 */
export class MessageRouter {
  constructor(private readonly services: Services) {}

  async handle(message: WebviewToExtensionMessage, post: PostMessage): Promise<void> {
    try {
      switch (message.type) {
        case "GET_CONNECTIONS": {
          const connections = await this.services.connectionManager.getAll();
          post({ type: "CONNECTIONS_LIST", payload: connections });
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
            vscode.window.showInformationMessage("DBLens: Connection successful.");
          } else {
            vscode.window.showErrorMessage(`DBLens: Connection failed. ${result.error ?? "Unknown error"}`);
          }
          break;
        }
        case "CRAWL_SCHEMA":
          // TODO: kick off SchemaService + Indexer pipeline, stream CRAWL_PROGRESS events
          break;
        case "CHAT":
          // TODO: embed query, vector search, build RAG prompt, stream CHAT_CHUNK events
          break;
        case "CLEAR_INDEX":
          // TODO: clear index for connection, post INDEX_CLEARED
          break;
        default:
          post({ type: "ERROR", payload: { message: "Unknown message type" } });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      post({ type: "ERROR", payload: { message } });
    }
  }
}
