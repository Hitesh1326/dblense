import { useState, useEffect, useCallback, useRef } from "react";
import { ChatMessage } from "../../shared/types";
import { postMessage, onMessage } from "../vscodeApi";

interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (text: string) => void;
  clearHistory: () => void;
}

export function useChat(connectionId: string | null): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamBufferRef = useRef("");

  useEffect(() => {
    const unsubscribe = onMessage((message) => {
      switch (message.type) {
        case "CHAT_CHUNK":
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
          streamBufferRef.current = "";
          break;
        case "CHAT_ERROR":
          setIsStreaming(false);
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

  return { messages, isStreaming, sendMessage, clearHistory };
}
