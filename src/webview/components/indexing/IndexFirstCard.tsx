import React, { useEffect } from "react";
import { Database, AlertTriangle, Check, Lock, Loader2 } from "lucide-react";
import type { CrawlProgress } from "../../../shared/types";
import { useCopyFeedback } from "../../hooks/useCopyFeedback";
import {
  CrawlProgressBlock,
  DEFAULT_PULL_MODEL,
  getOllamaDerivedState,
  ModelReadyBadge,
  ModelSelector,
  ModelsSetupExplanation,
  ModelsToPullSection,
  OllamaUnavailableBanner,
  RECOMMENDED_MODEL,
  CUSTOM_MODEL_VALUE,
} from "../ollama/OllamaModelSetup";
import { useOllamaModelForm } from "../../hooks/useOllamaModelForm";

/** Visual state of a stepper step: blocked (needs action), active (current), done (complete), locked (not yet). */
type StepperState = "blocked" | "active" | "done" | "locked";

/** Tailwind class names for the step circle per {@link StepperState}. */
const STEPPER_STEP_CLASS: Record<StepperState, string> = {
  done: "bg-vscode-badge-background text-vscode-badge-foreground",
  blocked:
    "border-2 border-amber-500/70 bg-amber-500/15 text-amber-700 dark:text-amber-400 dark:border-amber-400/60 dark:bg-amber-400/15",
  active:
    "border-2 border-vscode-panel-border bg-vscode-editor-inactiveSelectionBackground/50 text-vscode-foreground",
  locked:
    "border border-vscode-panel-border bg-vscode-editor-inactiveSelectionBackground/30 text-vscode-descriptionForeground",
};

/** Props for the index-first onboarding card (connection, crawl/Ollama state, and callbacks). */
interface IndexFirstCardProps {
  connectionName: string;
  onCrawl: () => void;
  onCancelCrawl?: () => void;
  isCrawling: boolean;
  crawlProgress: CrawlProgress | null;
  ollamaAvailable: boolean | null;
  ollamaModel: string | null;
  ollamaModelPulled: boolean | null;
  ollamaModels: string[];
  onModelChange: (model: string) => void;
  onCheckOllama?: () => void;
  onPullModel: (model: string) => void;
  pullingModel: string | null;
}

/** One step in the 3-step stepper (icon + label); appearance depends on {@link StepperState}. */
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

/** Horizontal connector between stepper steps; dimmed when the next step is locked. */
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

/**
 * Either crawl progress + "Indexing in progress…" with Cancel, or the "Crawl schema" button.
 * Renders the button only when not crawling; disabled when {@link canCrawl} is false.
 */
function CrawlActionBlock({
  isCrawling,
  crawlProgress,
  canCrawl,
  onCrawl,
  onCancelCrawl,
}: {
  isCrawling: boolean;
  crawlProgress: CrawlProgress | null;
  canCrawl: boolean;
  onCrawl: () => void;
  onCancelCrawl?: () => void;
}) {
  if (isCrawling) {
    return (
      <>
        {crawlProgress && <CrawlProgressBlock progress={crawlProgress} />}
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
      </>
    );
  }
  return (
    <div className="w-full max-w-sm mx-auto mb-2">
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
  );
}

/** Footer: "Check again" link only (explanatory text lives in ModelsSetupExplanation above). */
function CardFooter({
  showCheckAgain,
  onCheckOllama,
}: {
  showCheckAgain: boolean;
  onCheckOllama?: () => void;
}) {
  return (
    <>
      {showCheckAgain && onCheckOllama && (
        <button
          type="button"
          onClick={onCheckOllama}
          className="text-xs text-vscode-descriptionForeground hover:text-vscode-textLink-foreground hover:underline focus:outline-none mt-2"
        >
          Check again
        </button>
      )}
    </>
  );
}

/**
 * Onboarding card when a connection is selected but not yet indexed.
 * Shows a 3-step stepper (Verify Ollama → Crawl Schema → Start Chatting), model choice and pull,
 * optional crawl progress, and Crawl schema. The chosen model is used for indexing and chat.
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
  ollamaModels,
  onModelChange,
  onCheckOllama,
  onPullModel,
  pullingModel,
}: IndexFirstCardProps) {
  const { copiedWhich, copyWithFeedback } = useCopyFeedback();

  useEffect(() => {
    onCheckOllama?.();
  }, [onCheckOllama]);

  const derived = getOllamaDerivedState({ ollamaAvailable, ollamaModel, ollamaModelPulled });
  const { isCheckingOllama, modelChosen, isOllamaReady, needsPull, ollamaUnavailable, canCrawl } = derived;

  const {
    showOtherModel,
    otherModelName,
    setShowOtherModel,
    setOtherModelName,
    handleOtherSubmit,
    pullCommand,
    isPulling,
    selectOptions,
  } = useOllamaModelForm({ ollamaModel, ollamaModels, pullingModel, onModelChange });

  const showCheckAgain = (needsPull || ollamaUnavailable) && !!onCheckOllama;

  const step1State: StepperState = isOllamaReady ? "done" : "blocked";
  const step2State: StepperState = isOllamaReady ? "active" : "locked";
  const step3State: StepperState = "locked";

  return (
    <div className="flex flex-1 min-h-0 items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-lg border border-vscode-panel-border bg-vscode-editor-inactiveSelectionBackground/40 shadow-sm p-8 flex flex-col items-center text-center">
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
          {ollamaUnavailable && !isCheckingOllama && <OllamaUnavailableBanner />}
          {ollamaAvailable === true && (
            <>
              <ModelsSetupExplanation />
              <ModelSelector
                ollamaModel={ollamaModel}
                selectOptions={selectOptions}
                customModelValue={CUSTOM_MODEL_VALUE}
                showOtherModel={showOtherModel}
                otherModelName={otherModelName}
                isCrawling={isCrawling}
                onModelChange={onModelChange}
                setShowOtherModel={setShowOtherModel}
                setOtherModelName={setOtherModelName}
                onOtherSubmit={handleOtherSubmit}
              />
              {modelChosen && isOllamaReady && (
                <ModelReadyBadge label="Ready" model={ollamaModel!} />
              )}
              {needsPull && (
                <ModelsToPullSection
                  items={[
                    {
                      label: ollamaModel ?? DEFAULT_PULL_MODEL,
                      command: pullCommand,
                      copyLabel: "chat" as const,
                      onPull: () => ollamaModel && onPullModel(ollamaModel),
                      isPulling,
                      showRecommendedBadge: ollamaModel === RECOMMENDED_MODEL,
                    },
                  ]}
                  copied={copiedWhich}
                  onCopy={copyWithFeedback}
                  disabled={isCrawling}
                />
              )}
            </>
          )}
        </div>

        <CrawlActionBlock
          isCrawling={isCrawling}
          crawlProgress={crawlProgress}
          canCrawl={canCrawl}
          onCrawl={onCrawl}
          onCancelCrawl={onCancelCrawl}
        />

        <CardFooter showCheckAgain={showCheckAgain} onCheckOllama={onCheckOllama} />
      </div>
    </div>
  );
}
