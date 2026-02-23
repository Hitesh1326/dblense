import React, { useState, useCallback } from "react";
import { X, Info } from "lucide-react";
import { IndexStats } from "../../shared/types";

interface IndexInfoModalProps {
  isOpen: boolean;
  connectionId: string;
  connectionName: string;
  stats: IndexStats | null;
  loading: boolean;
  onClose: () => void;
  onReindex: (connectionId: string) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type IndexStatus = "complete" | "partial" | "none";

function getIndexStatus(stats: IndexStats): IndexStatus {
  if (stats.totalChunks === 0) return "none";
  if (stats.chunksWithEmbedding >= stats.totalChunks) return "complete";
  return "partial";
}

const STATUS_COPY: Record<
  IndexStatus,
  { label: string; description: string }
> = {
  complete: {
    label: "Complete",
    description: "All chunks are embedded. Chat and search are fully available.",
  },
  partial: {
    label: "Partial",
    description: "Some chunks have embeddings; others are still pending. Re-index to complete.",
  },
  none: {
    label: "No embeddings",
    description: "No embeddings yet. Re-index to generate embeddings for chat and search.",
  },
};

const STATUS_DOT_COLOR: Record<IndexStatus, string> = {
  complete: "var(--vscode-testing-iconPassed, #89d185)",
  partial: "var(--vscode-editorWarning-foreground, #cca700)",
  none: "var(--vscode-errorForeground, #f48771)",
};

const STAT_ROWS: { key: keyof IndexStats; label: string; tooltip: string }[] = [
  { key: "tableChunks", label: "Tables", tooltip: "Number of tables in the index." },
  { key: "viewChunks", label: "Views", tooltip: "Number of views in the index." },
  { key: "spChunks", label: "Stored procedures", tooltip: "Number of stored procedures in the index." },
  { key: "functionChunks", label: "Functions", tooltip: "Number of functions in the index." },
  {
    key: "totalChunks",
    label: "Indexed items",
    tooltip: "Total schema objects in the index. Each item is one searchable unit.",
  },
  {
    key: "chunksWithSummary",
    label: "Summarized",
    tooltip: "Items that have an AI-generated summary (via Ollama). Summaries power better search and chat answers.",
  },
  {
    key: "chunksWithEmbedding",
    label: "Searchable",
    tooltip: "Items with vector embeddings. Only these are used when you ask questions in Chat.",
  },
  {
    key: "lastCrawledAt",
    label: "Last updated",
    tooltip: "When this connection's index was last built or updated.",
  },
];

function getStatDisplayValue(stats: IndexStats, key: keyof IndexStats): string {
  const raw = stats[key];
  if (key === "lastCrawledAt") return formatDate(raw as string | null);
  return String(raw ?? "—");
}

function isEmbeddingIncomplete(stats: IndexStats): boolean {
  return (
    stats.totalChunks > 0 &&
    (stats.chunksWithEmbedding ?? 0) < stats.totalChunks
  );
}

export function IndexInfoModal({
  isOpen,
  connectionId,
  connectionName,
  stats,
  loading,
  onClose,
  onReindex,
}: IndexInfoModalProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const handleReindex = useCallback(() => {
    onReindex(connectionId);
    onClose();
  }, [connectionId, onReindex, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!isOpen) return null;

  const status = stats ? getIndexStatus(stats) : null;
  const statusCopy = status ? STATUS_COPY[status] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="index-info-title"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-vscode-editor-background border border-vscode-panel-border rounded-xl shadow-2xl max-w-md w-full mx-4 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 border-b border-vscode-panel-border flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2 id="index-info-title" className="text-lg font-semibold text-vscode-foreground tracking-tight">
              Index
            </h2>
            <p className="mt-0.5 text-sm text-vscode-descriptionForeground truncate">
              {connectionName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-vscode-toolbar-hoverBackground text-vscode-descriptionForeground hover:text-vscode-foreground transition-colors focus:outline-none shrink-0"
            aria-label="Close"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="px-5 pb-5 overflow-y-auto shrink min-h-0">
          {loading && (
            <p className="text-sm text-vscode-descriptionForeground py-2">Loading…</p>
          )}
          {!loading && !stats && (
            <p className="text-sm text-vscode-descriptionForeground py-2">No index found for this connection.</p>
          )}
          {!loading && stats && (
            <>
              {status !== null && statusCopy && (
                <div className="mb-5 py-3 px-0 rounded-lg bg-vscode-editor-inactiveSelectionBackground/25">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      aria-hidden
                      style={{ backgroundColor: STATUS_DOT_COLOR[status] }}
                    />
                    <span className="text-sm font-semibold text-vscode-foreground">{statusCopy.label}</span>
                  </div>
                  <p className="mt-2 text-xs text-vscode-descriptionForeground leading-relaxed">
                    {statusCopy.description}
                  </p>
                </div>
              )}
              <p className="text-[11px] font-medium uppercase tracking-wider text-vscode-descriptionForeground mb-2">
                Details
              </p>
              <div className="rounded-lg overflow-visible bg-vscode-editor-inactiveSelectionBackground/15 divide-y divide-white/[0.06]">
                {STAT_ROWS.map(({ key, label, tooltip }) => {
                  const value = getStatDisplayValue(stats, key);
                  const showWarning =
                    key === "chunksWithEmbedding" && isEmbeddingIncomplete(stats);
                  const labelClass = showWarning
                    ? "text-amber-600 dark:text-amber-400 font-medium"
                    : "text-vscode-descriptionForeground";
                  const valueClass = showWarning
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-vscode-foreground";
                  const tooltipOpen = activeTooltip === key;
                  return (
                    <div key={key} className="grid grid-cols-[1fr_auto] gap-x-4 text-sm">
                      <div className={`py-2.5 px-3 flex items-center gap-1.5 min-w-0 ${labelClass}`}>
                        <span className="truncate">{label}</span>
                        <div className="relative shrink-0 flex items-center">
                          <button
                            type="button"
                            aria-label={`About ${label}`}
                            title={tooltip}
                            className="text-vscode-descriptionForeground hover:text-vscode-foreground opacity-50 hover:opacity-100 transition-opacity focus:outline-none rounded p-0.5"
                            onMouseEnter={() => setActiveTooltip(key)}
                            onMouseLeave={() => setActiveTooltip(null)}
                            onFocus={() => setActiveTooltip(key)}
                            onBlur={() => setActiveTooltip(null)}
                          >
                            <Info size={14} aria-hidden strokeWidth={2} />
                          </button>
                          {tooltipOpen && (
                            <div
                              className="absolute bottom-full left-0 mb-2 z-30 w-[280px] px-3 py-2.5 rounded-lg text-xs leading-relaxed bg-vscode-dropdown-background text-vscode-foreground pointer-events-none"
                              role="tooltip"
                              style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.45)" }}
                            >
                              <span className="block break-words whitespace-normal">{tooltip}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={`py-2.5 px-3 text-right font-medium tabular-nums ${valueClass}`}>
                        {value}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {stats && (
          <div className="px-5 py-4 border-t border-vscode-panel-border flex items-center justify-end shrink-0 bg-vscode-editor-background">
            <button
              type="button"
              onClick={handleReindex}
              className="px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              style={{
                backgroundColor: "var(--vscode-button-background)",
                color: "var(--vscode-button-foreground)",
              }}
            >
              Re-index
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
