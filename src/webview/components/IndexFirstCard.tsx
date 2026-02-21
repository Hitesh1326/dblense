import React from "react";

const OLLAMA_LEARN_MORE_URL = "https://ollama.ai";

interface IndexFirstCardProps {
  onCrawl: () => void;
  isCrawling: boolean;
  ollamaAvailable: boolean | null;
  ollamaModel: string | null;
  ollamaModelPulled: boolean | null;
  onCheckOllama?: () => void;
}

/**
 * Shown when a connection is selected but not yet indexed.
 * Minimal copy, one CTA, requirements as secondary, Ollama status.
 */
export function IndexFirstCard({
  onCrawl,
  isCrawling,
  ollamaAvailable,
  ollamaModel,
  ollamaModelPulled,
  onCheckOllama,
}: IndexFirstCardProps) {
  const canCrawl = ollamaAvailable === true && ollamaModelPulled !== false && !isCrawling;

  return (
    <div className="flex flex-col items-center justify-center flex-1 p-6">
      <div className="max-w-sm w-full rounded-lg border border-vscode-panel-border bg-vscode-editor-inactiveSelectionBackground/30 p-6 text-center space-y-4">
        <p className="text-sm font-medium text-vscode-foreground">
          Index this database to ask questions about your schema.
        </p>
        <p className="text-xs italic text-vscode-descriptionForeground">
          Index once, then use Chat or Schema Graph.
        </p>

        {ollamaAvailable === null && (
          <p className="text-xs text-vscode-descriptionForeground">Ollama: Checking…</p>
        )}
        {ollamaAvailable === true && ollamaModelPulled === true && (
          <p className="text-xs text-vscode-descriptionForeground text-green-600 dark:text-green-400">
            Ollama: Ready
          </p>
        )}
        {ollamaAvailable === true && ollamaModelPulled === false && ollamaModel && (
          <p className="text-xs text-vscode-descriptionForeground text-amber-600 dark:text-amber-400">
            Model <code className="rounded px-0.5 bg-vscode-textBlockQuote-background">{ollamaModel}</code> not pulled. Run:{" "}
            <code className="rounded px-0.5 bg-vscode-textBlockQuote-background">ollama pull {ollamaModel}</code>
          </p>
        )}
        {ollamaAvailable === false && (
          <p className="text-xs text-vscode-descriptionForeground text-amber-600 dark:text-amber-400">
            Ollama: Not reachable. Start Ollama to index.
          </p>
        )}

        <button
          type="button"
          onClick={onCrawl}
          disabled={!canCrawl}
          className="px-4 py-2 rounded text-sm font-medium bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isCrawling ? "Indexing…" : "Crawl schema"}
        </button>

        <p className="text-[11px] text-vscode-descriptionForeground">
          Requirements: Ollama must be installed and running.{" "}
          <a
            href={OLLAMA_LEARN_MORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-vscode-textLink-foreground hover:underline"
          >
            Learn more
          </a>
        </p>
        {(ollamaAvailable === false || ollamaModelPulled === false) && onCheckOllama && (
          <button
            type="button"
            onClick={onCheckOllama}
            className="text-[11px] text-vscode-textLink-foreground hover:underline"
          >
            Check again
          </button>
        )}
      </div>
    </div>
  );
}
