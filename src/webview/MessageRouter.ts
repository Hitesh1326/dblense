import * as vscode from "vscode";
import { ConnectionManager } from "../db/ConnectionManager";
import { SchemaService } from "../db/SchemaService";
import { OllamaService } from "../llm/OllamaService";
import { PromptBuilder } from "../llm/PromptBuilder";
import { EmbeddingService } from "../embeddings/EmbeddingService";
import { VectorStoreManager } from "../vectorstore/VectorStoreManager";
import { Indexer } from "../vectorstore/Indexer";
import { logger } from "../utils/logger";
import type { SchemaChunk, ChatThinking, ChatMessage, DbConnectionConfig } from "../shared/types";
import {
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
} from "../shared/types";

type AddConnectionPayload = Extract<WebviewToExtensionMessage, { type: "ADD_CONNECTION" }>["payload"];
type ChatPayload = Extract<WebviewToExtensionMessage, { type: "CHAT" }>["payload"];

/** True when the error message indicates Ollama is unreachable (e.g. ECONNREFUSED, fetch failed). */
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

const CONTEXT_THRESHOLD = 0.9;
const FIRST_SUMMARY_LAST_N = 10;
const RE_SUMMARY_LAST_N = 5;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateHistoryTokens(messages: ChatMessage[]): number {
  return messages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
}

/** Injected services used to fulfill webview message requests. */
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
 * Routes messages from the webview to the appropriate handler. Each message type is handled by
 * a dedicated private method; this class does not perform business logic itself.
 */
export class MessageRouter {
  /** Holds the active crawl abort controller; null when no crawl is running. */
  private activeCrawl: { connectionId: string; controller: AbortController } | null = null;

  constructor(private readonly services: Services) {}

  /**
   * Dispatches the incoming message to the correct handler.
   * @param message - Message from the webview.
   * @param post - Callback to send messages back to the webview.
   */
  async handle(message: WebviewToExtensionMessage, post: PostMessage): Promise<void> {
    try {
      switch (message.type) {
        case "GET_CONNECTIONS":
          await this.handleGetConnections(post);
          break;
        case "ADD_CONNECTION":
          await this.handleAddConnection(message.payload, post);
          break;
        case "REMOVE_CONNECTION":
          await this.handleRemoveConnection(message.payload, post);
          break;
        case "TEST_CONNECTION":
          await this.handleTestConnection(message.payload.id, post);
          break;
        case "GET_OLLAMA_STATUS":
          await this.handleGetOllamaStatus(post);
          break;
        case "CRAWL_SCHEMA":
          await this.handleCrawlSchema(message.payload.id, post);
          break;
        case "CRAWL_CANCEL":
          this.handleCrawlCancel(message.payload.connectionId);
          break;
        case "CHAT":
          await this.handleChat(message.payload, post);
          break;
        case "CLEAR_INDEX":
          // TODO: clear index for connection, post INDEX_CLEARED
          break;
        case "GET_INDEX_STATS":
          await this.handleGetIndexStats(message.payload.connectionId, post);
          break;
        default:
          post({ type: "ERROR", payload: { message: "Unknown message type" } });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      post({ type: "ERROR", payload: { message: msg } });
    }
  }

  /**
   * Fetches connection list and crawled IDs, posts CONNECTIONS_LIST and CRAWLED_CONNECTION_IDS.
   * @param post - Callback to send messages to the webview.
   */
  private async handleGetConnections(post: PostMessage): Promise<void> {
    const connections = await this.services.connectionManager.getAll();
    const crawledIds = await this.services.connectionManager.getCrawledConnectionIds();
    post({ type: "CONNECTIONS_LIST", payload: connections });
    post({ type: "CRAWLED_CONNECTION_IDS", payload: crawledIds });
  }

  /**
   * Persists the connection (with password in SecretStorage), posts CONNECTION_ADDED.
   * @param payload - Connection config plus password.
   * @param post - Callback to send messages to the webview.
   */
  private async handleAddConnection(payload: AddConnectionPayload, post: PostMessage): Promise<void> {
    const { password, ...config } = payload;
    await this.services.connectionManager.add(config, password);
    post({ type: "CONNECTION_ADDED", payload: config });
  }

  /**
   * Removes the connection and its crawled id, posts CONNECTION_REMOVED.
   * @param payload - Object with connection id.
   * @param post - Callback to send messages to the webview.
   */
  private async handleRemoveConnection(
    payload: { id: string },
    post: PostMessage
  ): Promise<void> {
    await this.services.connectionManager.remove(payload.id);
    post({ type: "CONNECTION_REMOVED", payload });
  }

  /**
   * Tests the connection, posts CONNECTION_TEST_RESULT and shows a VS Code message.
   * @param id - Connection id to test.
   * @param post - Callback to send messages to the webview.
   */
  private async handleTestConnection(id: string, post: PostMessage): Promise<void> {
    const result = await this.services.connectionManager.testConnection(id);
    post({
      type: "CONNECTION_TEST_RESULT",
      payload: { id, success: result.success, error: result.error },
    });
    if (result.success) {
      vscode.window.showInformationMessage("SchemaSight: Connection successful.");
    } else {
      vscode.window.showErrorMessage(`SchemaSight: Connection failed. ${result.error ?? "Unknown error"}`);
    }
  }

  /**
   * Checks Ollama availability and model, posts OLLAMA_STATUS.
   * @param post - Callback to send messages to the webview.
   */
  private async handleGetOllamaStatus(post: PostMessage): Promise<void> {
    const available = await this.services.ollamaService.isAvailable();
    let model: string | undefined;
    let modelPulled: boolean | undefined;
    if (available) {
      model = this.services.ollamaService.getModelName();
      modelPulled = await this.services.ollamaService.isModelPulled();
    }
    post({ type: "OLLAMA_STATUS", payload: { available, model, modelPulled } });
  }

  /**
   * Crawls schema and indexes it; posts CRAWL_PROGRESS, then CRAWL_COMPLETE or CRAWL_CANCELLED/CRAWL_ERROR.
   * Uses activeCrawl for abort; shows user-facing messages on success or Ollama/other errors.
   * @param connectionId - Connection to crawl.
   * @param post - Callback to send messages to the webview.
   */
  private async handleCrawlSchema(connectionId: string, post: PostMessage): Promise<void> {
    const config = await this.services.connectionManager.getById(connectionId);
    if (!config) {
      post({ type: "ERROR", payload: { message: "Connection not found" } });
      return;
    }
    const password = await this.services.connectionManager.getPassword(connectionId);
    if (password === undefined) {
      post({ type: "ERROR", payload: { message: "Password not found for this connection" } });
      return;
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
          vscode.window.showErrorMessage("SchemaSight: Crawl failed. See Output → SchemaSight for details.");
        }
      }
    } finally {
      this.activeCrawl = null;
    }
  }

  /**
   * Aborts the active crawl for the given connection if it matches activeCrawl.
   * @param connectionId - Connection whose crawl should be cancelled.
   */
  private handleCrawlCancel(connectionId: string): void {
    if (this.activeCrawl?.connectionId === connectionId) {
      this.activeCrawl.controller.abort();
    }
  }

  /**
   * Runs RAG chat: fetches chunks, builds system prompt, optionally summarizes conversation at ~90%
   * context usage, posts CHAT_THINKING steps, streams via Ollama, then CHAT_DONE or CHAT_ERROR.
   * @param payload - connectionId, user message, history, and optional summary (when in summary mode).
   * @param post - Callback to send messages to the webview.
   */
  private async handleChat(payload: ChatPayload, post: PostMessage): Promise<void> {
    const chatStartMs = Date.now();
    const setup = await this.getChatSetup(payload, post);
    if (!setup) return;

    const { connectionId, userMessage, history, existingSummary, config, contextLimit } = setup;
    const postThinking = (p: ChatThinking) => post({ type: "CHAT_THINKING", payload: p });

    try {
      const { chunks, searchMs } = await this.getChunksForChat(
        connectionId,
        userMessage,
        history,
        postThinking
      );
      const systemPrompt = this.services.promptBuilder.buildRagSystemPrompt(chunks, config.database);
      const systemTokens = estimateTokens(systemPrompt);
      const userTokens = estimateTokens(userMessage);

      const historyForApi = this.buildInitialHistoryForApi(history, existingSummary);
      const summarizationResult = await this.applySummarizationIfNeeded({
        historyForApi,
        history,
        existingSummary,
        systemTokens,
        userTokens,
        contextLimit,
        post,
      });
      if (summarizationResult === null) return;

      const { historyForApi: finalHistory, donePayload } = summarizationResult;
      await this.streamChatAndFinish({
        systemPrompt,
        historyForApi: finalHistory,
        userMessage,
        chunks,
        searchMs,
        contextLimit,
        chatStartMs,
        donePayload,
        postThinking,
        post,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("Chat RAG failed", err);
      post({ type: "CHAT_ERROR", payload: { error } });
    }
  }

  /**
   * Resolves config and context limit; posts CHAT_ERROR if connection not found.
   * @param payload - Incoming CHAT payload.
   * @param post - Callback to send messages to the webview.
   * @returns Setup object or null if invalid.
   */
  private async getChatSetup(
    payload: ChatPayload,
    post: PostMessage
  ): Promise<{
    connectionId: string;
    userMessage: string;
    history: ChatMessage[];
    existingSummary: string | undefined;
    config: DbConnectionConfig;
    contextLimit: number;
  } | null> {
    const { connectionId, message: userMessage, history, summary: existingSummary } = payload;
    const config = await this.services.connectionManager.getById(connectionId);
    if (!config) {
      post({ type: "CHAT_ERROR", payload: { error: "Connection not found" } });
      return null;
    }
    const contextLimit = await this.services.ollamaService.getContextLength();
    return { connectionId, userMessage, history, existingSummary, config, contextLimit };
  }

  /**
   * Builds the history array to send to the API: either existing summary + last N or full history.
   * @param history - Chat history (full or last N when in summary mode).
   * @param existingSummary - Optional summary from a previous round.
   */
  private buildInitialHistoryForApi(
    history: ChatMessage[],
    existingSummary: string | undefined
  ): ChatMessage[] {
    if (existingSummary != null && existingSummary.length > 0) {
      return [
        {
          role: "assistant",
          content: `Previous conversation summary:\n\n${existingSummary}`,
          timestamp: "",
        },
        ...history,
      ];
    }
    return history;
  }

  /**
   * If over context limit, posts error and returns null. If at ~90%, runs first or re-summarization
   * and returns updated history + optional CHAT_DONE payload. Otherwise returns current history.
   * @param params - historyForApi, history, existingSummary, token counts, contextLimit, and post.
   * @returns Final history and optional donePayload, or null to abort.
   */
  private async applySummarizationIfNeeded(params: {
    historyForApi: ChatMessage[];
    history: ChatMessage[];
    existingSummary: string | undefined;
    systemTokens: number;
    userTokens: number;
    contextLimit: number;
    post: PostMessage;
  }): Promise<{
    historyForApi: ChatMessage[];
    donePayload?: { summary: string; truncatedHistory: ChatMessage[] };
  } | null> {
    const { historyForApi, history, existingSummary, systemTokens, userTokens, contextLimit, post } = params;
    const historyTokens = estimateHistoryTokens(historyForApi);
    const totalEstimated = systemTokens + historyTokens + userTokens;

    if (totalEstimated >= contextLimit) {
      post({
        type: "CHAT_ERROR",
        payload: { error: "Conversation is too long. Clear the conversation to continue." },
      });
      return null;
    }

    if (totalEstimated < CONTEXT_THRESHOLD * contextLimit) {
      return { historyForApi, donePayload: undefined };
    }

    if (existingSummary == null || existingSummary.length === 0) {
      const toSummarize = history.slice(0, -FIRST_SUMMARY_LAST_N);
      const lastN = history.slice(-FIRST_SUMMARY_LAST_N);
      if (toSummarize.length === 0) {
        return { historyForApi, donePayload: undefined };
      }
      const summaryPrompt = this.services.promptBuilder.buildConversationSummaryPrompt(toSummarize);
      const summaryText = await this.services.ollamaService.summarizeConversation(summaryPrompt);
      return {
        historyForApi: [
          {
            role: "assistant",
            content: `Previous conversation summary:\n\n${summaryText}`,
            timestamp: "",
          },
          ...lastN,
        ],
        donePayload: { summary: summaryText, truncatedHistory: lastN },
      };
    }

    const toMerge = history.slice(0, -RE_SUMMARY_LAST_N);
    const newLastN = history.slice(-RE_SUMMARY_LAST_N);
    const mergePrompt =
      existingSummary +
      "\n\n---\n\n" +
      this.services.promptBuilder.buildConversationSummaryPrompt(toMerge);
    const newSummary = await this.services.ollamaService.summarizeConversation(mergePrompt);
    return {
      historyForApi: [
        {
          role: "assistant",
          content: `Previous conversation summary:\n\n${newSummary}`,
          timestamp: "",
        },
        ...newLastN,
      ],
      donePayload: { summary: newSummary, truncatedHistory: newLastN },
    };
  }

  /**
   * Posts context/generating steps, streams Ollama response, then posts final thinking and CHAT_DONE.
   * @param params - systemPrompt, historyForApi, userMessage, chunks, searchMs, contextLimit, chatStartMs, donePayload, postThinking, post.
   */
  private async streamChatAndFinish(params: {
    systemPrompt: string;
    historyForApi: ChatMessage[];
    userMessage: string;
    chunks: SchemaChunk[];
    searchMs: number | undefined;
    contextLimit: number;
    chatStartMs: number;
    donePayload: { summary: string; truncatedHistory: ChatMessage[] } | undefined;
    postThinking: (p: ChatThinking) => void;
    post: PostMessage;
  }): Promise<void> {
    const {
      systemPrompt,
      historyForApi,
      userMessage,
      chunks,
      searchMs,
      contextLimit,
      chatStartMs,
      donePayload,
      postThinking,
      post,
    } = params;

    const contextTokens =
      estimateTokens(systemPrompt) + estimateHistoryTokens(historyForApi) + estimateTokens(userMessage);
    const contextPayload = this.buildChatContextPayload(chunks, searchMs, contextTokens);

    postThinking({ step: "context", context: contextPayload });
    postThinking({
      step: "generating",
      model: this.services.ollamaService.getModelName(),
      context: contextPayload,
    });

    await this.services.ollamaService.chat(
      systemPrompt,
      historyForApi,
      userMessage,
      (token) => post({ type: "CHAT_CHUNK", payload: { token } })
    );

    const totalElapsedMs = Date.now() - chatStartMs;
    postThinking({
      step: "generating",
      model: this.services.ollamaService.getModelName(),
      context: { ...contextPayload, totalElapsedMs, contextLimit },
    });

    if (donePayload) {
      post({ type: "CHAT_DONE", payload: donePayload });
    } else {
      post({ type: "CHAT_DONE" });
    }
  }

  /**
   * Resolves context chunks for chat: full schema (getAllChunks) for broad list/count queries,
   * otherwise query rewrite + embedding + vector search (topK). Posts thinking steps and returns chunks + searchMs.
   *
   * @param connectionId - Connection to search.
   * @param userMessage - User message (used for rewrite and search).
   * @param history - Chat history for query rewrite.
   * @param postThinking - Callback to post CHAT_THINKING payloads.
   * @returns Chunks and optional search duration in ms.
   */
  private async getChunksForChat(
    connectionId: string,
    userMessage: string,
    history: ChatMessage[],
    postThinking: (p: ChatThinking) => void
  ): Promise<{ chunks: SchemaChunk[]; searchMs: number | undefined }> {
    const useFullSchema = isBroadSchemaQuery(userMessage);
    const topK = 30;
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
    if (useFullSchema) {
      postThinking({ step: "searching" });
      const t0 = Date.now();
      const chunks = await this.services.vectorStoreManager.getAllChunks(connectionId);
      return { chunks, searchMs: Date.now() - t0 };
    }
    postThinking({ step: "embedding" });
    const queryEmbedding = await this.services.embeddingService.embed(searchQuery);
    postThinking({ step: "searching" });
    const t0 = Date.now();
    const chunks = await this.services.vectorStoreManager.search(connectionId, queryEmbedding, {
      topK,
      queryText: searchQuery,
    });
    return { chunks, searchMs: Date.now() - t0 };
  }

  /**
   * Builds the context payload for CHAT_THINKING (chunksUsed, byType, objectNames, searchMs, contextTokens).
   *
   * @param chunks - Chunks used for RAG context.
   * @param searchMs - Optional search duration in ms.
   * @param contextTokens - Approximate token count of the system prompt.
   * @returns Payload for the "context" and "generating" thinking steps.
   */
  private buildChatContextPayload(
    chunks: SchemaChunk[],
    searchMs: number | undefined,
    contextTokens: number
  ): { chunksUsed: number; byType: Record<string, number>; objectNames: string[]; searchMs: number | undefined; contextTokens: number } {
    const byType: Record<string, number> = {};
    for (const c of chunks) {
      byType[c.objectType] = (byType[c.objectType] ?? 0) + 1;
    }
    const objectNames = chunks.slice(0, 8).map((c) => `${c.schema}.${c.objectName}`);
    return {
      chunksUsed: chunks.length,
      byType,
      objectNames,
      searchMs,
      contextTokens,
    };
  }

  /**
   * Fetches index stats for the connection and posts INDEX_STATS.
   * @param connectionId - Connection whose index stats to fetch.
   * @param post - Callback to send messages to the webview.
   */
  private async handleGetIndexStats(connectionId: string, post: PostMessage): Promise<void> {
    const stats = await this.services.vectorStoreManager.getIndexStats(connectionId);
    post({ type: "INDEX_STATS", payload: { connectionId, stats } });
  }
}
