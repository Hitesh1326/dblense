import { useState, useEffect, useCallback, useRef } from "react";
import { ChatMessage, ChatThinking } from "../../shared/types";
import { postMessage, onMessage } from "../vscodeApi";

/** Return type of useChat: message list, streaming/thinking state, and actions. */
interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  thinking: ChatThinking | null;
  showThinkingBlock: boolean;
  sendMessage: (text: string) => void;
  clearHistory: () => void;
}

/**
 * Chat state and actions for the current connection. Subscribes to extension messages
 * (CHAT_THINKING, CHAT_CHUNK, CHAT_DONE, CHAT_ERROR) and updates messages/streaming/thinking.
 * sendMessage posts CHAT with connectionId, message, and history; clearHistory resets messages and buffer.
 *
 * @param connectionId Active connection id (send is no-op when null).
 * @returns Messages, streaming flags, thinking payload, showThinkingBlock, sendMessage, and clearHistory.
 */
export function useChat(connectionId: string | null): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinking, setThinking] = useState<ChatThinking | null>(null);
  const [showThinkingBlock, setShowThinkingBlock] = useState(false);
  const streamBufferRef = useRef("");

  useEffect(() => {
    const unsubscribe = onMessage((message) => {
      switch (message.type) {
        case "CHAT_THINKING":
          setThinking(message.payload);
          break;
        case "CHAT_CHUNK":
          setShowThinkingBlock(false);
          streamBufferRef.current += message.payload.token;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return [
                ...prev.slice(0, -1),
                { ...last, content: streamBufferRef.current },
              ];
            }
            return [
              ...prev,
              {
                role: "assistant",
                content: streamBufferRef.current,
                timestamp: new Date().toISOString(),
              },
            ];
          });
          break;
        case "CHAT_DONE":
          setIsStreaming(false);
          setShowThinkingBlock(false);
          setThinking(null);
          streamBufferRef.current = "";
          break;
        case "CHAT_ERROR":
          setIsStreaming(false);
          setShowThinkingBlock(false);
          setThinking(null);
          streamBufferRef.current = "";
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Error: ${message.payload.error}`,
              timestamp: new Date().toISOString(),
            },
          ]);
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

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setShowThinkingBlock(true);

      postMessage({
        type: "CHAT",
        payload: {
          connectionId,
          message: text,
          history: messages,
        },
      });
    },
    [connectionId, isStreaming, messages]
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
    streamBufferRef.current = "";
  }, []);

  return { messages, isStreaming, thinking, showThinkingBlock, sendMessage, clearHistory };
}
