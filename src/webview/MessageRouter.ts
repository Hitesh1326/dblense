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

  handle(message: WebviewToExtensionMessage, post: PostMessage): void {
    switch (message.type) {
      case "GET_CONNECTIONS":
        // TODO: return connections list
        break;
      case "ADD_CONNECTION":
        // TODO: add connection via ConnectionManager, post CONNECTION_ADDED
        break;
      case "REMOVE_CONNECTION":
        // TODO: remove connection, post CONNECTION_REMOVED
        break;
      case "TEST_CONNECTION":
        // TODO: test connection, post CONNECTION_TEST_RESULT
        break;
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
  }
}
