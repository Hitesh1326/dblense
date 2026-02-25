import React, { useRef, useEffect, useState, useCallback, KeyboardEvent } from "react";
import { Database, Trash2, Sparkles, Check, Loader2, ChevronDown, ChevronRight } from "lucide-react";
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
  lastCompletedThinking: ChatThinking | null;
  streamedChunkCount: number;
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
  lastCompletedThinking,
  streamedChunkCount,
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
          <ThinkingBlock thinking={thinking} streamedChunkCount={streamedChunkCount} />
        )}

        {!isStreaming && lastCompletedThinking && (
          <CollapsedThinkingBlock thinking={lastCompletedThinking} />
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
 * Renders the thinking progress: ordered steps with per-step details. Searching shows only
 * chunk count and time; context shows one-line summary plus expandable object list; generating
 * shows token count when available.
 */
function ThinkingBlock({
  thinking,
  streamedChunkCount = 0,
}: {
  thinking: ChatThinking;
  streamedChunkCount?: number;
}) {
  const [objectsExpanded, setObjectsExpanded] = useState(false);
  const currentIndex = STEPS_ORDER.indexOf(thinking.step);
  const ctx = thinking.context;
  const typeBreakdown =
    ctx && Object.keys(ctx.byType).length > 0
      ? Object.entries(ctx.byType)
          .map(([type, n]) => formatTypeCount(type, n))
          .join(", ")
      : null;

  /** One-line detail for each step (no object list; that's separate for context). */
  const stepDetail = (step: ChatThinkingStep): string | null => {
    switch (step) {
      case "embedding":
        return "Encoded your question for semantic search.";
      case "searching":
        if (!ctx) return null;
        const time = ctx.searchMs != null ? ` in ${(ctx.searchMs / 1000).toFixed(2)}s` : "";
        return `Found ${ctx.chunksUsed} chunks${time}.`;
      case "context":
        if (!ctx) return null;
        const typeList = typeBreakdown ? ` (${typeBreakdown})` : "";
        const tokens = ctx.contextTokens != null ? ` ~${(ctx.contextTokens / 1000).toFixed(1)}k tokens sent to the model.` : ".";
        return `Included ${ctx.chunksUsed} objects${typeList}.${tokens}`;
      case "generating":
        if (!thinking.model) return null;
        if (streamedChunkCount > 0) {
          return `Streaming response from ${thinking.model}. … ${streamedChunkCount} tokens so far.`;
        }
        return `Streaming response from ${thinking.model}.`;
      default:
        return null;
    }
  };

  return (
    <div className="flex justify-start mb-2" role="status" aria-live="polite" aria-label="Assistant is thinking">
      <div className="max-w-[85%] rounded-xl py-2.5 px-3 bg-vscode-editor-inactiveSelectionBackground/25">
        <div className="flex items-center gap-2 mb-2 thinking-pulse">
          <Sparkles size={12} className="text-vscode-descriptionForeground/80 shrink-0" aria-hidden />
          <span className="text-[11px] text-vscode-descriptionForeground/90 tracking-wide uppercase">Thinking</span>
        </div>

        <div className="space-y-2">
          {STEPS_ORDER.map((step, i) => {
            const isDone = i < currentIndex;
            const isCurrent = i === currentIndex;
            const showDetail = (isDone || isCurrent) && stepDetail(step);
            const showObjectList =
              step === "context" && ctx && ctx.objectNames.length > 0 && (isDone || isCurrent);
            const label =
              step === "generating" && thinking.model
                ? `${STEP_LABELS[step]} with ${thinking.model}`
                : STEP_LABELS[step];
            return (
              <div
                key={step}
                className={`rounded px-1.5 -mx-1.5 transition-colors ${
                  isCurrent ? "bg-vscode-list-activeSelectionBackground/20" : ""
                }`}
              >
                <div className="flex items-center gap-2 min-h-[20px]">
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
                {showDetail && (
                  <p className="ml-5 mt-0.5 text-[10px] text-vscode-descriptionForeground/70 leading-relaxed">
                    {stepDetail(step)}
                  </p>
                )}
                {showObjectList && (
                  <div className="ml-5 mt-1">
                    <button
                      type="button"
                      onClick={() => setObjectsExpanded((e) => !e)}
                      className="flex items-center gap-1 text-[10px] text-vscode-descriptionForeground/60 hover:text-vscode-descriptionForeground/90 focus:outline-none focus:underline"
                      aria-expanded={objectsExpanded}
                    >
                      {objectsExpanded ? (
                        <ChevronDown size={10} aria-hidden />
                      ) : (
                        <ChevronRight size={10} aria-hidden />
                      )}
                      Objects ({ctx!.objectNames.length})
                    </button>
                    {objectsExpanded && (
                      <p className="mt-1 text-[10px] text-vscode-descriptionForeground/50 leading-relaxed break-words">
                        {ctx!.objectNames.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Collapsed summary of how the last reply was generated, shown after the message is complete. Expand to see full steps.
 */
function CollapsedThinkingBlock({ thinking }: { thinking: ChatThinking }) {
  const [expanded, setExpanded] = useState(false);
  const ctx = thinking.context;
  const thoughtLabel =
    ctx && ctx.totalElapsedMs != null
      ? `Thought for ${(ctx.totalElapsedMs / 1000).toFixed(1)}s`
      : ctx && ctx.searchMs != null
        ? `Thought for ${(ctx.searchMs / 1000).toFixed(1)}s`
        : "Thought";

  return (
    <div className="flex justify-start mb-2">
      <div className="max-w-[85%] rounded-xl py-2 px-3 bg-vscode-editor-inactiveSelectionBackground/20">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-2 w-full text-left focus:outline-none focus:ring-1 focus:ring-vscode-focusBorder rounded"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown size={12} className="text-vscode-descriptionForeground/80 shrink-0" aria-hidden />
          ) : (
            <ChevronRight size={12} className="text-vscode-descriptionForeground/80 shrink-0" aria-hidden />
          )}
          <Sparkles size={12} className="text-vscode-descriptionForeground/80 shrink-0" aria-hidden />
          <span className="text-[11px] text-vscode-descriptionForeground/90">{thoughtLabel}</span>
        </button>
        {expanded && (
          <div className="mt-2 pl-4 border-l-2 border-vscode-descriptionForeground/20 space-y-2">
            {STEPS_ORDER.map((step) => {
              const label =
                step === "generating" && thinking.model
                  ? `${STEP_LABELS[step]} with ${thinking.model}`
                  : STEP_LABELS[step];
              const detail = getCompletedStepDetail(step, thinking);
              return (
                <div key={step} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Check size={12} className="shrink-0 text-vscode-descriptionForeground/90" aria-hidden />
                    <span className="text-[11px] text-vscode-descriptionForeground/90">{label}</span>
                  </div>
                  {detail && (
                    <p className="ml-5 text-[10px] text-vscode-descriptionForeground/60 leading-relaxed">{detail}</p>
                  )}
                  {step === "context" && ctx && ctx.objectNames.length > 0 && (
                    <p className="ml-5 text-[10px] text-vscode-descriptionForeground/50 leading-relaxed break-words">
                      {ctx.objectNames.join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Detail line for a completed step (used in collapsed block when expanded). */
function getCompletedStepDetail(step: ChatThinkingStep, thinking: ChatThinking): string | null {
  const ctx = thinking.context;
  const typeBreakdown =
    ctx && Object.keys(ctx.byType).length > 0
      ? Object.entries(ctx.byType)
          .map(([type, n]) => formatTypeCount(type, n))
          .join(", ")
      : null;
  switch (step) {
    case "embedding":
      return "Encoded your question for semantic search.";
    case "searching":
      if (!ctx) return null;
      const time = ctx.searchMs != null ? ` in ${(ctx.searchMs / 1000).toFixed(2)}s` : "";
      return `Found ${ctx.chunksUsed} chunks${time}.`;
    case "context":
      if (!ctx) return null;
      const typeList = typeBreakdown ? ` (${typeBreakdown})` : "";
      const tokens = ctx.contextTokens != null ? ` ~${(ctx.contextTokens / 1000).toFixed(1)}k tokens sent to the model.` : ".";
      return `Included ${ctx.chunksUsed} objects${typeList}.${tokens}`;
    case "generating":
      return thinking.model ? `Streaming response from ${thinking.model}.` : null;
    default:
      return null;
  }
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
