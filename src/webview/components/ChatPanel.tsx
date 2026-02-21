import React, { useRef, useEffect, useState, KeyboardEvent } from "react";
import { ChatMessage } from "../../shared/types";
import { IndexFirstCard } from "./IndexFirstCard";

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSend: (text: string) => void;
  onClear: () => void;
  connectionId: string | null;
  isCrawled: boolean;
  onCrawl: () => void;
  isCrawling: boolean;
}

export function ChatPanel({
  messages,
  isStreaming,
  onSend,
  onClear,
  connectionId,
  isCrawled,
  onCrawl,
  isCrawling,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !connectionId) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (connectionId && !isCrawled) {
    return (
      <div className="flex flex-col h-full">
        <IndexFirstCard onCrawl={onCrawl} isCrawling={isCrawling} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-vscode-panel-border">
        <span className="text-sm font-medium">
          {connectionId ? "Chat with your database" : "Select a database connection"}
        </span>
        <button
          onClick={onClear}
          className="text-xs opacity-60 hover:opacity-100 transition-opacity"
          disabled={messages.length === 0}
        >
          Clear
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40 select-none">
            <span className="text-4xl">🗄️</span>
            <p className="text-sm text-center">
              Ask anything about your database schema,<br />tables, or stored procedures.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {isStreaming && (
          <div className="flex gap-1 pl-2">
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-vscode-panel-border">
        <div className="flex gap-2">
          <textarea
            className="flex-1 resize-none rounded border border-vscode-input-border bg-vscode-input-background text-vscode-input-foreground px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-vscode-focusBorder"
            rows={2}
            placeholder={
              !connectionId
                ? "Select a connection first…"
                : "Ask about your schema… (Enter to send, Shift+Enter for newline)"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!connectionId || isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={!connectionId || isStreaming || !input.trim()}
            className="px-3 py-2 rounded bg-vscode-button-background text-vscode-button-foreground text-sm disabled:opacity-40 hover:bg-vscode-button-hoverBackground transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
          isUser
            ? "bg-vscode-button-background text-vscode-button-foreground"
            : "bg-vscode-editor-inactiveSelectionBackground"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
