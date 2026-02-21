import React from "react";

interface IndexFirstCardProps {
  onCrawl: () => void;
  isCrawling: boolean;
}

/**
 * Shown when a connection is selected but not yet indexed.
 * Prompts the user to crawl the schema first and provides a primary action.
 */
export function IndexFirstCard({ onCrawl, isCrawling }: IndexFirstCardProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 p-6">
      <div className="max-w-sm w-full rounded-lg border border-vscode-panel-border bg-vscode-editor-inactiveSelectionBackground/30 p-6 text-center space-y-4">
        <p className="text-sm text-vscode-foreground">
          Index this database first so you can ask questions about your schema, tables, and stored procedures.
        </p>
        <button
          type="button"
          onClick={onCrawl}
          disabled={isCrawling}
          className="px-4 py-2 rounded text-sm font-medium bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isCrawling ? "Indexing…" : "Crawl schema"}
        </button>
      </div>
    </div>
  );
}
