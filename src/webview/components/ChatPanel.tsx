import React, { useRef, useEffect, useState, useCallback, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { Database, Trash2, Sparkles, Check, Loader2, ChevronDown, ChevronRight, Send } from "lucide-react";
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

/** Format token count for display (e.g. 4300 → "4.3k"). */
function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Context usage line above input: "4.3k / 8k (54%)" with tiny progress bar. Optional children render between label and bar. */
function ContextIndicator({
  usedTokens,
  limitTokens,
  isStreaming = false,
  children,
}: {
  usedTokens?: number;
  limitTokens?: number;
  isStreaming?: boolean;
  children?: React.ReactNode;
}) {
  const used = usedTokens ?? 0;
  const limit = limitTokens ?? 0;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const hasData = used > 0 || limit > 0;
  const label =
    used > 0 && limit > 0
      ? `Context: ${formatTokenCount(used)} / ${formatTokenCount(limit)} (${pct}%)`
      : used > 0
        ? `Context: ${formatTokenCount(used)} / —`
        : "Context: — / — (—)";

  if (isStreaming && !hasData) {
    return (
      <div className="flex justify-start items-center gap-2 min-h-[18px] w-fit shrink-0" aria-busy="true">
        <Loader2 size={10} className="animate-spin text-vscode-descriptionForeground shrink-0" aria-hidden />
        <span className="text-[10px] text-vscode-descriptionForeground">Context: …</span>
        {children}
      </div>
    );
  }

  return (
    <div className="flex justify-start items-center gap-2 min-h-[18px] w-fit shrink-0">
      <span className="text-[10px] text-vscode-descriptionForeground shrink-0">{label}</span>
      {children}
      <div
        className="w-14 h-[2px] shrink-0 rounded-full bg-vscode-descriptionForeground/20 overflow-hidden"
        aria-hidden
      >
        <div
          className="h-full bg-vscode-descriptionForeground/40 rounded-full transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Props for the main chat panel (messages, streaming state, connection, crawl, Ollama, and callbacks). */
interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  thinking: ChatThinking | null;
  showThinkingBlock: boolean;
  lastCompletedThinking: ChatThinking | null;
  streamedChunkCount: number;
  isSummarized: boolean;
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
  isSummarized,
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
  const [clearConfirmShown, setClearConfirmShown] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  /** Suggested prompts when the thread is empty (high-level, one-click send). */
  const SUGGESTED_PROMPTS = [
    "What is this database about?",
    "Give me a high-level overview of the schema",
    "What are the main areas of this database?",
  ];

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

  const handleClearClick = useCallback(() => {
    if (messages.length === 0) return;
    setClearConfirmShown(true);
  }, [messages.length]);

  const handleClearConfirm = useCallback(() => {
    onClear();
    setClearConfirmShown(false);
  }, [onClear]);

  const handleSuggestedPrompt = useCallback(
    (text: string) => {
      if (!connectionId || isStreaming) return;
      onSend(text);
    },
    [connectionId, isStreaming, onSend]
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

      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-vscode-panel-border bg-vscode-editorGroupHeader-tabsBackground shrink-0">
        <span className="text-sm text-vscode-foreground truncate min-w-0">
          Database: {connectionName}
        </span>
        <button
          type="button"
          onClick={handleClearClick}
          disabled={messages.length === 0}
          title="Clear conversation"
          aria-label="Clear conversation"
          className="shrink-0 p-1.5 rounded opacity-40 hover:opacity-70 text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-toolbar-hoverBackground disabled:opacity-20 disabled:cursor-not-allowed transition-all border-l border-vscode-panel-border pl-3 -ml-1"
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 opacity-90">
            <Database size={48} strokeWidth={1.5} className="text-vscode-descriptionForeground" />
            <p className="text-sm text-center text-vscode-descriptionForeground">
              Ask anything about your database schema, tables, or stored procedures.
            </p>
            {connectionId && !isStreaming && (
              <div className="flex flex-wrap justify-center gap-2 max-w-md">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSuggestedPrompt(prompt)}
                    className="px-3 py-1.5 rounded-full text-xs bg-vscode-editor-inactiveSelectionBackground/50 text-vscode-foreground hover:bg-vscode-list-hoverBackground border border-vscode-input-border transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
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

      <div
        className="shrink-0"
        style={{
          background: "var(--vscode-input-background)",
          boxShadow: "0 -4px 12px rgba(0,0,0,0.15)",
        }}
      >
        {clearConfirmShown && (
          <div className="px-3 py-2 flex items-center justify-between gap-3 bg-vscode-input-background/80 border-b border-vscode-input-border">
            <span className="text-xs text-vscode-foreground">Clear conversation? This cannot be undone.</span>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setClearConfirmShown(false)}
                className="px-2 py-1 rounded text-xs text-vscode-foreground bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearConfirm}
                className="px-2 py-1 rounded text-xs text-vscode-button-foreground bg-vscode-button-background hover:bg-vscode-button-hoverBackground"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        <div className="p-3 flex flex-col gap-1.5">
          {messages.length > 0 && (
            <div className="inline-flex items-center min-h-[18px] gap-0 self-start">
              <ContextIndicator
                usedTokens={lastCompletedThinking?.context?.contextTokens}
                limitTokens={lastCompletedThinking?.context?.contextLimit}
                isStreaming={isStreaming}
              >
                {isSummarized && (
                  <span className="inline-flex items-center gap-0.5 shrink-0">
                    <span
                      className="h-3.5 w-px min-w-px bg-vscode-descriptionForeground shrink-0 opacity-70"
                      aria-hidden
                    />
                    <span className="text-[10px] text-vscode-descriptionForeground ml-0.5">
                      Context summarized. Clear chat to start fresh.
                    </span>
                  </span>
                )}
              </ContextIndicator>
            </div>
          )}

          <div className="relative flex-1 min-h-[44px]">
            <textarea
              className="w-full min-h-[44px] max-h-[120px] resize-none border border-vscode-input-border bg-vscode-input-background text-vscode-input-foreground text-sm focus:outline-none focus:ring-2 focus:ring-vscode-focusBorder focus:border-transparent overflow-y-auto transition-shadow"
              style={{ padding: "10px 48px 10px 12px", borderRadius: "12px" }}
              rows={2}
              placeholder={
                !connectionId
                  ? "Select a connection first…"
                  : messages.length > 0
                    ? "Reply…"
                    : "Ask about your database…"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!connectionId || isStreaming}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!connectionId || isStreaming || !input.trim()}
              title="Send"
              aria-label="Send"
              className={`absolute bottom-2 right-2 w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                input.trim()
                  ? "bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground"
                  : "bg-vscode-descriptionForeground/30 text-vscode-descriptionForeground"
              }`}
            >
              <Send size={16} aria-hidden />
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

/** Single message bubble (user right-aligned, assistant left-aligned). Assistant content is markdown-rendered. */
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg text-sm break-words ${
          isUser
            ? "px-4 py-2 bg-vscode-button-background text-vscode-button-foreground whitespace-pre-wrap"
            : "px-4 py-3 bg-vscode-editor-inactiveSelectionBackground chat-markdown"
        }`}
      >
        {isUser ? (
          message.content
        ) : (
          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{message.content}</ReactMarkdown>
        )}
      </div>
    </div>
  );
}
