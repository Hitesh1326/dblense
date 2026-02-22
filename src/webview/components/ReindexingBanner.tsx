import React from "react";
import { Loader2 } from "lucide-react";
import type { CrawlProgress } from "../../shared/types";
import { formatCrawlPhase } from "../utils/formatCrawlPhase";

interface ReindexingBannerProps {
  progress: CrawlProgress;
  onCancel?: () => void;
}

function getProgressPercent(progress: CrawlProgress): number {
  if (progress.total <= 0) return 0;
  return Math.round((progress.current / progress.total) * 100);
}

/**
 * Compact banner shown in the main content when re-indexing an already-indexed connection.
 * Industry-standard: surface long-running action in the primary pane, not only in the sidebar.
 */
export function ReindexingBanner({ progress, onCancel }: ReindexingBannerProps) {
  const phaseText = formatCrawlPhase(progress);
  const percent = getProgressPercent(progress);
  const hasProgress = progress.total > 0;

  return (
    <div
      className="shrink-0 px-4 py-2.5 border-b border-vscode-panel-border bg-vscode-editor-inactiveSelectionBackground/40"
      role="status"
      aria-live="polite"
      aria-label={`Re-indexing: ${phaseText}`}
    >
      {/* Single row: spinner · title · phase text · percent · cancel */}
      <div className="flex items-center gap-2 min-w-0">
        <Loader2 size={15} className="shrink-0 animate-spin text-vscode-descriptionForeground" aria-hidden />
        <span className="text-sm font-medium text-vscode-foreground shrink-0">Re-indexing…</span>
        <span className="text-xs text-vscode-descriptionForeground truncate min-w-0" title={phaseText}>
          {phaseText}
        </span>
        {hasProgress && (
          <span className="text-xs text-vscode-descriptionForeground tabular-nums shrink-0 ml-auto">
            {percent}%
          </span>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 text-xs text-vscode-descriptionForeground hover:text-vscode-foreground hover:underline focus:outline-none transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
      {hasProgress && (
        <div
          className="mt-2 h-1.5 rounded-full w-full overflow-hidden bg-[var(--vscode-widget-border)] opacity-40"
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
