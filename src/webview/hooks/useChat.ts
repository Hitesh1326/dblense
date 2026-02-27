import { useState, useEffect, useCallback, useRef } from "react";
import { ChatMessage, ChatThinking } from "../../shared/types";
import { postMessage, onMessage } from "../vscodeApi";

const LAST_N = 10;

/** Per-connection persisted state (messages, summary, last thinking). */
interface ConnectionChatState {
  messages: ChatMessage[];
  summary: string | null;
  lastCompletedThinking: ChatThinking | null;
}

const emptyState = (): ConnectionChatState => ({
  messages: [],
  summary: null,
  lastCompletedThinking: null,
});

/** Returns next messages: update last if it's assistant, otherwise append new assistant message with content. */
function mergeAssistantContent(
  messages: ChatMessage[],
  content: string
): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (last?.role === "assistant") {
    return [...messages.slice(0, -1), { ...last, content }];
  }
  return [
    ...messages,
    {
      role: "assistant" as const,
      content,
      timestamp: new Date().toISOString(),
    },
  ];
}

/** Pure: apply a streaming chunk to a connection's history (updates or appends assistant message). */
function applyChunkToConnection(
  prev: Record<string, ConnectionChatState>,
  connectionId: string,
  bufferContent: string
): Record<string, ConnectionChatState> {
  const cur = prev[connectionId] ?? emptyState();
  const nextMessages = mergeAssistantContent(cur.messages, bufferContent);
  return { ...prev, [connectionId]: { ...cur, messages: nextMessages } };
}

/** Pure: apply CHAT_DONE (last thinking + optional summary) for a connection. */
function applyDoneToConnection(
  prev: Record<string, ConnectionChatState>,
  connectionId: string,
  lastCompletedThinking: ChatThinking | null,
  summary: string | undefined
): Record<string, ConnectionChatState> {
  const cur = prev[connectionId] ?? emptyState();
  const next: ConnectionChatState = {
    ...cur,
    lastCompletedThinking,
    ...(summary != null ? { summary } : {}),
  };
  return { ...prev, [connectionId]: next };
}

/** Pure: append an error assistant message for a connection. */
function applyErrorToConnection(
  prev: Record<string, ConnectionChatState>,
  connectionId: string,
  error: string
): Record<string, ConnectionChatState> {
  const cur = prev[connectionId] ?? emptyState();
  const nextMessages: ChatMessage[] = [
    ...cur.messages,
    {
      role: "assistant",
      content: `Error: ${error}`,
      timestamp: new Date().toISOString(),
    },
  ];
  return { ...prev, [connectionId]: { ...cur, messages: nextMessages } };
}

/** Return type of useChat: message list, streaming/thinking state, and actions. */
interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  thinking: ChatThinking | null;
  showThinkingBlock: boolean;
  lastCompletedThinking: ChatThinking | null;
  streamedChunkCount: number;
  isSummarized: boolean;
  sendMessage: (text: string) => void;
  clearHistory: () => void;
}

/**
 * Chat state and actions keyed by connection. Each connection has its own message history,
 * summary, and lastCompletedThinking. Subscribes to CHAT_THINKING, CHAT_CHUNK, CHAT_DONE, CHAT_ERROR
 * and applies updates to the connection that initiated the request (pendingConnectionIdRef).
 * Returned values are for the active connectionId; streaming/thinking apply only when the
 * response is for that connection.
 *
 * @param connectionId Active connection id (send is no-op when null).
 * @returns Messages and state for the active connection, plus sendMessage and clearHistory.
 */
export function useChat(connectionId: string | null): UseChatReturn {
  const [historyByConnectionId, setHistoryByConnectionId] = useState<Record<string, ConnectionChatState>>({});
  const [streamingConnectionId, setStreamingConnectionId] = useState<string | null>(null);
  const [thinking, setThinking] = useState<ChatThinking | null>(null);
  const [showThinkingBlock, setShowThinkingBlock] = useState(false);
  const [streamedChunkCount, setStreamedChunkCount] = useState(0);

  const streamBufferRef = useRef("");
  const thinkingRef = useRef<ChatThinking | null>(null);
  const pendingConnectionIdRef = useRef<string | null>(null);

  const activeState = connectionId ? historyByConnectionId[connectionId] ?? emptyState() : emptyState();
  const messages = activeState.messages;
  const summary = activeState.summary;
  const lastCompletedThinking = activeState.lastCompletedThinking;
  const isStreaming = streamingConnectionId !== null && streamingConnectionId === connectionId;

  useEffect(() => {
    function resetStreamingState() {
      thinkingRef.current = null;
      setStreamingConnectionId(null);
      setShowThinkingBlock(false);
      setThinking(null);
      setStreamedChunkCount(0);
      streamBufferRef.current = "";
    }

    function handleThinking(payload: ChatThinking) {
      thinkingRef.current = payload;
      setThinking(payload);
    }

    function handleChunk(token: string, pid: string | null) {
      setShowThinkingBlock(false);
      setStreamedChunkCount((n) => n + 1);
      streamBufferRef.current += token;
      if (pid) {
        setHistoryByConnectionId((prev) =>
          applyChunkToConnection(prev, pid, streamBufferRef.current)
        );
      }
    }

    function handleDone(payload: { summary?: string } | undefined, pid: string | null) {
      const doneThinking = thinkingRef.current ?? null;
      resetStreamingState();
      if (pid) {
        setHistoryByConnectionId((prev) =>
          applyDoneToConnection(prev, pid, doneThinking, payload?.summary)
        );
      }
    }

    function handleError(error: string, pid: string | null) {
      resetStreamingState();
      if (pid) {
        setHistoryByConnectionId((prev) => applyErrorToConnection(prev, pid, error));
      }
    }

    const unsubscribe = onMessage((message) => {
      const pid = pendingConnectionIdRef.current;
      switch (message.type) {
        case "CHAT_THINKING":
          handleThinking(message.payload);
          break;
        case "CHAT_CHUNK":
          handleChunk(message.payload.token, pid);
          break;
        case "CHAT_DONE":
          handleDone(message.payload, pid);
          break;
        case "CHAT_ERROR":
          handleError(message.payload.error, pid);
          break;
      }
    });

    return unsubscribe;
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      if (!connectionId || isStreaming) return;

      const userMessage: ChatMessage = {
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };

      pendingConnectionIdRef.current = connectionId;
      setStreamingConnectionId(connectionId);
      setShowThinkingBlock(true);
      setStreamedChunkCount(0);
      thinkingRef.current = null;

      setHistoryByConnectionId((prev) => {
        const cur = prev[connectionId] ?? emptyState();
        return {
          ...prev,
          [connectionId]: {
            ...cur,
            messages: [...cur.messages, userMessage],
            lastCompletedThinking: null,
          },
        };
      });

      const curState = historyByConnectionId[connectionId] ?? emptyState();
      const history = curState.summary != null ? curState.messages.slice(-LAST_N) : curState.messages;

      postMessage({
        type: "CHAT",
        payload: {
          connectionId,
          message: text,
          history,
          ...(curState.summary != null && curState.summary.length > 0 ? { summary: curState.summary } : {}),
        },
      });
    },
    [connectionId, isStreaming, historyByConnectionId]
  );

  const clearHistory = useCallback(() => {
    if (!connectionId) return;
    setHistoryByConnectionId((prev) => ({
      ...prev,
      [connectionId]: emptyState(),
    }));
    streamBufferRef.current = "";
  }, [connectionId]);

  return {
    messages,
    isStreaming,
    thinking,
    showThinkingBlock,
    lastCompletedThinking,
    streamedChunkCount,
    isSummarized: summary != null && summary.length > 0,
    sendMessage,
    clearHistory,
  };
}
