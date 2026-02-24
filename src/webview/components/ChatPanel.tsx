import React, { useRef, useEffect, useState, useCallback, KeyboardEvent } from "react";
import { Database, Trash2, Sparkles, Check, Loader2 } from "lucide-react";
import { ChatMessage, CrawlProgress, ChatThinking, ChatThinkingStep } from "../../shared/types";
import { IndexFirstCard } from "./IndexFirstCard";
import { ReindexingBanner } from "./ReindexingBanner";

/** Order of steps shown in the thinking block. */
const STEPS_ORDER: ChatThinkingStep[] = ["embedding", "searching", "context", "generating"];

/** Human-readable label per thinking step. */
const STEP_LABELS: Record<ChatThinkingStep, string> = {
  embedding: "Embedding your question",
  searching: "Searching schema",
  context: "Building context",
  generating: "Generating answer",
};

/** Singular/plural labels for object types (used in context summary). */
const TYPE_LABELS: Record<string, { singular: string; plural: string }> = {
  table: { singular: "table", plural: "tables" },
  view: { singular: "view", plural: "views" },
  stored_procedure: { singular: "stored procedure", plural: "stored procedures" },
  function: { singular: "function", plural: "functions" },
  column: { singular: "column", plural: "columns" },
};

/** Formats a count with the correct singular/plural (e.g. "1 table", "2 views"). */
function formatTypeCount(type: string, n: number): string {
  const labels = TYPE_LABELS[type];
  const label = labels ? (n === 1 ? labels.singular : labels.plural) : type;
  return `${n} ${label}`;
}

/** Props for the main chat panel (messages, streaming state, connection, crawl, Ollama, and callbacks). */
interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  thinking: ChatThinking | null;
  showThinkingBlock: boolean;
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

/**
 * Main chat UI: message list, thinking block (when enabled), and input area.
 * If a connection is selected but not yet crawled, shows IndexFirstCard (crawl CTA) instead.
 * When re-indexing an already-indexed connection, shows ReindexingBanner above the chat.
 */
export function ChatPanel({
  messages,
  isStreaming,
  thinking,
  showThinkingBlock,
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

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !connectionId) return;
    onSend(trimmed);
    setInput("");
  }, [input, isStreaming, connectionId, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

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
          <MessageBubble key={`${i}-${msg.timestamp}`} message={msg} />
        ))}

        {isStreaming && thinking && showThinkingBlock && (
          <ThinkingBlock thinking={thinking} />
        )}

        {isStreaming && !showThinkingBlock && (
          <div className="flex gap-1 pl-2">
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

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

/**
 * Renders the thinking progress: ordered steps (embedding → searching → context → generating)
 * with checkmarks for done, spinner for current, and optional context summary (chunks used, types, timing).
 */
function ThinkingBlock({ thinking }: { thinking: ChatThinking }) {
  const currentIndex = STEPS_ORDER.indexOf(thinking.step);
  const ctx = thinking.context;
  const breakdown =
    ctx && Object.keys(ctx.byType).length > 0
      ? Object.entries(ctx.byType)
          .map(([type, n]) => formatTypeCount(type, n))
          .join(", ")
      : null;
  const contextSummary =
    ctx &&
    [
      `${ctx.chunksUsed} objects`,
      breakdown || null,
      ctx.searchMs != null ? `${(ctx.searchMs / 1000).toFixed(2)}s` : null,
      ctx.contextTokens != null ? `~${(ctx.contextTokens / 1000).toFixed(1)}k tokens` : null,
    ]
      .filter(Boolean)
      .join(" \u00B7 ");
  const includingTooltip =
    ctx && ctx.objectNames.length > 0 ? ctx.objectNames.join(", ") : undefined;

  return (
    <div className="flex justify-start mb-2" role="status" aria-live="polite" aria-label="Assistant is thinking">
      <div className="max-w-[85%] rounded-xl py-2.5 px-3 bg-vscode-editor-inactiveSelectionBackground/25">
        <div className="flex items-center gap-2 mb-2 thinking-pulse">
          <Sparkles size={12} className="text-vscode-descriptionForeground/80 shrink-0" aria-hidden />
          <span className="text-[11px] text-vscode-descriptionForeground/90 tracking-wide uppercase">Thinking</span>
        </div>

        <div className="space-y-1">
          {STEPS_ORDER.map((step, i) => {
            const isDone = i < currentIndex;
            const isCurrent = i === currentIndex;
            const label =
              step === "generating" && thinking.model
                ? `${STEP_LABELS[step]} with ${thinking.model}`
                : STEP_LABELS[step];
            return (
              <div
                key={step}
                className={`flex items-center gap-2 min-h-[20px] rounded px-1.5 -mx-1.5 transition-colors ${
                  isCurrent ? "bg-vscode-list-activeSelectionBackground/20" : ""
                } ${isCurrent ? "border-l-2 border-vscode-focusBorder pl-2" : "border-l-2 border-transparent pl-2"}`}
              >
                <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0 text-vscode-descriptionForeground/90">
                  {isDone && <Check size={12} strokeWidth={2.5} aria-hidden />}
                  {isCurrent && (
                    <Loader2 size={12} className="animate-spin text-vscode-foreground/80" aria-label="Loading" />
                  )}
                  {!isDone && !isCurrent && (
                    <span className="w-1.5 h-1.5 rounded-full bg-vscode-descriptionForeground/40" aria-hidden />
                  )}
                </span>
                <span
                  className={`text-[11px] ${isCurrent ? "text-vscode-foreground" : "text-vscode-descriptionForeground/90"}`}
                >
                  {label}{isCurrent ? "…" : ""}
                </span>
              </div>
            );
          })}
        </div>

        {ctx && contextSummary && (
          <p
            className="mt-2 text-[10px] text-vscode-descriptionForeground/70 leading-relaxed cursor-help"
            title={includingTooltip ? `Including: ${includingTooltip}` : undefined}
          >
            {contextSummary}
          </p>
        )}
      </div>
    </div>
  );
}

/** Single message bubble (user right-aligned, assistant left-aligned). */
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
