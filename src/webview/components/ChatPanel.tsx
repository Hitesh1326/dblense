import React, { useRef, useEffect, useState, KeyboardEvent } from "react";
import { Database, Trash2 } from "lucide-react";
import { ChatMessage, CrawlProgress } from "../../shared/types";
import { IndexFirstCard } from "./IndexFirstCard";
import { ReindexingBanner } from "./ReindexingBanner";

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSend: (text: string) => void;
  onClear: () => void;
  connectionId: string | null;
  connectionName: string;
  isCrawled: boolean;
  onCrawl: () => void;
  onCancelCrawl?: () => void;
  isCrawling: boolean;
  crawlProgress: CrawlProgress | null;
  ollamaAvailable: boolean | null;
  ollamaModel: string | null;
  ollamaModelPulled: boolean | null;
  onCheckOllama?: () => void;
}

export function ChatPanel({
  messages,
  isStreaming,
  onSend,
  onClear,
  connectionId,
  connectionName,
  isCrawled,
  onCrawl,
  onCancelCrawl,
  isCrawling,
  crawlProgress,
  ollamaAvailable,
  ollamaModel,
  ollamaModelPulled,
  onCheckOllama,
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
      <div className="flex flex-col flex-1 min-h-0">
        <IndexFirstCard
          connectionName={connectionName}
          onCrawl={onCrawl}
          onCancelCrawl={onCancelCrawl}
          isCrawling={isCrawling}
          crawlProgress={crawlProgress}
          ollamaAvailable={ollamaAvailable}
          ollamaModel={ollamaModel}
          ollamaModelPulled={ollamaModelPulled}
          onCheckOllama={onCheckOllama}
        />
      </div>
    );
  }

  const showReindexingBanner = isCrawled && isCrawling && crawlProgress;

  return (
    <div className="flex flex-col h-full min-h-0">
      {showReindexingBanner && <ReindexingBanner progress={crawlProgress} onCancel={onCancelCrawl} />}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40 select-none">
            <Database size={48} strokeWidth={1.5} className="text-vscode-descriptionForeground" />
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
          <div className="flex flex-col gap-1.5">
            <button
              onClick={handleSend}
              disabled={!connectionId || isStreaming || !input.trim()}
              className="px-3 py-2 rounded bg-vscode-button-background text-vscode-button-foreground text-sm disabled:opacity-40 hover:bg-vscode-button-hoverBackground transition-colors flex-1"
            >
              Send
            </button>
            <button
              onClick={onClear}
              disabled={messages.length === 0}
              title="Clear conversation"
              aria-label="Clear conversation"
              className="p-1.5 rounded text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-toolbar-hoverBackground disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
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
