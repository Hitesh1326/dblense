import * as vscode from "vscode";
import { ConnectionManager } from "../db/ConnectionManager";
import { SchemaService } from "../db/SchemaService";
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
  schemaService: SchemaService;
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
            vscode.window.showInformationMessage("DBLens: Connection successful.");
          } else {
            vscode.window.showErrorMessage(`DBLens: Connection failed. ${result.error ?? "Unknown error"}`);
          }
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
          try {
            await this.services.schemaService.crawl(config, password, (progress) => {
              post({ type: "CRAWL_PROGRESS", payload: progress });
            });
            await this.services.connectionManager.addCrawledConnectionId(connectionId);
            const crawledIds = await this.services.connectionManager.getCrawledConnectionIds();
            post({ type: "CRAWL_COMPLETE", payload: { connectionId } });
            post({ type: "CRAWLED_CONNECTION_IDS", payload: crawledIds });
            vscode.window.showInformationMessage("DBLens: Schema crawl complete.");
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            post({ type: "CRAWL_ERROR", payload: { connectionId, error } });
            vscode.window.showErrorMessage(`DBLens: Crawl failed. ${error}`);
          }
          break;
        }
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
