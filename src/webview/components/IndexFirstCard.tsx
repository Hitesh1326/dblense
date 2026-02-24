import React, { useState, useCallback } from "react";
import { Database, AlertTriangle, Check, Copy, Lock, Loader2 } from "lucide-react";
import type { CrawlProgress } from "../../shared/types";
import { formatCrawlPhase } from "../utils/formatCrawlPhase";

/** Link for "Learn more" about Ollama. */
const OLLAMA_LEARN_MORE_URL = "https://ollama.ai";
/** Fallback model name when config model is not set. */
const DEFAULT_PULL_MODEL = "llama3.1:8b";
/** How long to show "Copied" after copying the pull command. */
const COPY_FEEDBACK_MS = 2000;

/** Visual state of a step in the stepper (blocked = needs action, active = current, done = complete, locked = not yet). */
type StepperState = "blocked" | "active" | "done" | "locked";

/** Tailwind classes per stepper state for the step circle. */
const STEPPER_STEP_CLASS: Record<StepperState, string> = {
  done: "bg-vscode-badge-background text-vscode-badge-foreground",
  blocked:
    "border-2 border-amber-500/70 bg-amber-500/15 text-amber-700 dark:text-amber-400 dark:border-amber-400/60 dark:bg-amber-400/15",
  active:
    "border-2 border-vscode-panel-border bg-vscode-editor-inactiveSelectionBackground/50 text-vscode-foreground",
  locked:
    "border border-vscode-panel-border bg-vscode-editor-inactiveSelectionBackground/30 text-vscode-descriptionForeground",
};

/** Props for the index-first card (connection name, crawl/Ollama state, and callbacks). */
interface IndexFirstCardProps {
  connectionName: string;
  onCrawl: () => void;
  onCancelCrawl?: () => void;
  isCrawling: boolean;
  crawlProgress: CrawlProgress | null;
  ollamaAvailable: boolean | null;
  ollamaModel: string | null;
  ollamaModelPulled: boolean | null;
  onCheckOllama?: () => void;
}

/** Returns 0–100 percent from crawl progress (0 if total is 0). */
function getProgressPercent(progress: CrawlProgress): number {
  if (progress.total <= 0) return 0;
  return Math.round((progress.current / progress.total) * 100);
}

/** Progress bar and phase text for an active crawl. */
function CrawlProgressBlock({ progress }: { progress: CrawlProgress }) {
  const hasProgress = progress.total > 0;
  const percent = getProgressPercent(progress);
  const phaseText = formatCrawlPhase(progress);
  return (
    <div className="w-full mb-2">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <p
          className="text-sm text-vscode-descriptionForeground truncate min-w-0 flex-1"
          title={phaseText}
        >
          {phaseText}
        </p>
        {hasProgress && (
          <span className="text-xs text-vscode-descriptionForeground shrink-0 tabular-nums">
            {percent}%
          </span>
        )}
      </div>
      {hasProgress && (
        <div
          className="h-1.5 rounded-full w-full overflow-hidden bg-[var(--vscode-widget-border)] opacity-40"
          role="progressbar"
          aria-valuenow={progress.current}
          aria-valuemin={0}
          aria-valuemax={progress.total}
        >
          <div
            className="h-full rounded-full bg-vscode-progressBar-background"
            style={{ width: `${(progress.current / progress.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Onboarding card when a connection is selected but not yet indexed.
 * Shows a 3-step stepper (Verify Ollama → Crawl Schema → Start Chatting), Ollama status
 * (checking / ready / not found / need pull), optional crawl progress, and the Crawl schema button.
 * Copy-pull-command and "Check again" are shown when the model is not pulled or Ollama is unavailable.
 */
export function IndexFirstCard({
  connectionName,
  onCrawl,
  onCancelCrawl,
  isCrawling,
  crawlProgress,
  ollamaAvailable,
  ollamaModel,
  ollamaModelPulled,
  onCheckOllama,
}: IndexFirstCardProps) {
  const [copied, setCopied] = useState(false);

  const isCheckingOllama = ollamaAvailable === null;
  const isOllamaReady = ollamaAvailable === true && ollamaModelPulled === true;
  const needsPull = ollamaAvailable === true && ollamaModelPulled === false;
  const ollamaUnavailable = ollamaAvailable === false;
  const showOllamaWarning = needsPull || ollamaUnavailable;
  const showCheckAgain = showOllamaWarning && !!onCheckOllama;
  const canCrawl = isOllamaReady && !isCrawling;

  const pullCommand = ollamaModel
    ? `ollama pull ${ollamaModel}`
    : `ollama pull ${DEFAULT_PULL_MODEL}`;

  const copyPullCommand = useCallback(() => {
    if (!pullCommand) return;
    void navigator.clipboard.writeText(pullCommand).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    });
  }, [pullCommand]);

  const step1State: StepperState = isOllamaReady ? "done" : "blocked";
  const step2State: StepperState = isOllamaReady ? "active" : "locked";
  const step3State: StepperState = "locked";

  return (
    <div className="flex flex-1 min-h-0 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-vscode-panel-border bg-vscode-editor-inactiveSelectionBackground/40 shadow-sm p-8 flex flex-col items-center text-center">
        <div className="mb-4 text-vscode-descriptionForeground opacity-80" aria-hidden>
          <Database size={64} strokeWidth={1.5} className="mx-auto" />
        </div>

        <h1 className="text-base font-semibold text-vscode-foreground mb-1 text-center">
          Get started with
        </h1>
        <p className="text-sm text-vscode-descriptionForeground mb-4 text-center break-all">
          {connectionName}
        </p>

        <div className="flex items-start justify-center w-full mb-5 overflow-hidden">
          <StepperStep label="Verify Ollama" state={step1State} />
          <StepperConnector toLocked={!isOllamaReady} />
          <StepperStep label="Crawl Schema" state={step2State} />
          <StepperConnector toLocked />
          <StepperStep label="Start Chatting" state={step3State} />
        </div>

        <div className="w-full space-y-2 mb-5 flex flex-col items-center">
          {isCheckingOllama && (
            <p className="text-sm text-vscode-descriptionForeground text-center">Checking Ollama…</p>
          )}
          {isOllamaReady && (
            <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-md border border-vscode-panel-border bg-vscode-editor-inactiveSelectionBackground/30">
              <Check size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-sm text-vscode-foreground">Ollama ready · {ollamaModel ?? "model"}</span>
            </div>
          )}
          {showOllamaWarning && (
            <div className="flex flex-wrap items-center justify-center gap-2 py-2.5 px-3 rounded-md border border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400 dark:border-amber-400/50 dark:bg-amber-400/10">
              <AlertTriangle size={18} className="shrink-0 opacity-90" />
              <span className="text-sm font-medium">{ollamaModel ?? "Model"} not found</span>
              {needsPull && ollamaModel && (
                <>
                  <button
                    type="button"
                    onClick={copyPullCommand}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-current/30 hover:bg-current/10 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check size={12} className="shrink-0" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} className="shrink-0" />
                        Copy command
                      </>
                    )}
                  </button>
                  <code className="text-[11px] opacity-90 font-mono truncate max-w-full">
                    {pullCommand}
                  </code>
                </>
              )}
              {ollamaUnavailable && (
                <span className="text-xs opacity-90">
                  Start Ollama (e.g. <code className="font-mono">ollama serve</code>) and try again.
                </span>
              )}
            </div>
          )}
        </div>

        {isCrawling && crawlProgress && (
          <CrawlProgressBlock progress={crawlProgress} />
        )}

        {isCrawling ? (
          <div className="flex items-center justify-center gap-2 mb-2 text-sm text-vscode-descriptionForeground">
            <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
            <span>Indexing in progress…</span>
            {onCancelCrawl && (
              <button
                type="button"
                onClick={onCancelCrawl}
                className="ml-1 text-xs hover:text-vscode-foreground hover:underline focus:outline-none transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <div className="w-full max-w-xs mx-auto mb-2">
            <button
              type="button"
              onClick={onCrawl}
              disabled={!canCrawl}
              title={!canCrawl ? "Complete Ollama setup first" : undefined}
              className="w-full px-5 py-2.5 rounded-md text-sm font-medium bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-vscode-button-background disabled:bg-vscode-button-secondaryBackground disabled:text-vscode-descriptionForeground transition-colors border border-transparent"
            >
              Crawl schema
            </button>
          </div>
        )}

        {showCheckAgain && (
          <button
            type="button"
            onClick={onCheckOllama}
            className="text-xs text-vscode-descriptionForeground hover:text-vscode-textLink-foreground hover:underline focus:outline-none mt-2"
          >
            Check again
          </button>
        )}

        {!isCrawling && (
          <p className="text-xs text-vscode-descriptionForeground max-w-sm text-center mt-3">
            Ollama must be installed and running. Pull the configured model to enable indexing and chat.{" "}
            <a
              href={OLLAMA_LEARN_MORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-vscode-textLink-foreground hover:underline"
            >
              Learn more
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

/** Single step in the stepper (icon + label); appearance depends on state (done/blocked/active/locked). */
function StepperStep({ label, state }: { label: string; state: StepperState }) {
  const isLocked = state === "locked";
  return (
    <div className={`flex flex-col items-center shrink-0 ${isLocked ? "opacity-50" : ""}`}>
      <span
        className={`inline-flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${STEPPER_STEP_CLASS[state]}`}
      >
        {state === "done" && <Check size={16} />}
        {state === "blocked" && <AlertTriangle size={16} />}
        {state === "locked" && <Lock size={16} />}
        {state === "active" && <span className="w-2 h-2 rounded-full bg-vscode-foreground" aria-hidden />}
      </span>
      <span className="mt-1.5 text-[11px] font-medium text-vscode-foreground">{label}</span>
    </div>
  );
}

/** Horizontal line between stepper steps; dimmed when the next step is locked. */
function StepperConnector({ toLocked }: { toLocked?: boolean }) {
  return (
    <div className="flex items-center justify-center w-16 shrink-0 pt-4" aria-hidden>
      <span
        className="h-px w-full bg-[var(--vscode-widget-border,var(--vscode-panel-border))]"
        style={{ opacity: toLocked ? 0.3 : 0.75 }}
      />
    </div>
  );
}
