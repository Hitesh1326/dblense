import React from "react";
import { CrawlProgress } from "../../shared/types";
import { IndexFirstCard } from "./IndexFirstCard";
import { ReindexingBanner } from "./ReindexingBanner";

interface SchemaGraphProps {
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
 * Renders an interactive ReactFlow graph of the database schema.
 * Tables are nodes; foreign-key relationships are edges.
 */
export function SchemaGraph({
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
}: SchemaGraphProps) {
  if (!connectionId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-vscode-descriptionForeground">
        Select a database connection to view its schema graph.
      </div>
    );
  }

  if (!isCrawled) {
    return (
      <div className="flex flex-col h-full">
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

  const showReindexingBanner = isCrawling && crawlProgress;

  return (
    <div className="flex flex-col h-full min-h-0">
      {showReindexingBanner && <ReindexingBanner progress={crawlProgress} onCancel={onCancelCrawl} />}
      <div className="flex-1 flex items-center justify-center opacity-40 text-sm min-h-0">
        {/* TODO: fetch schema chunks, build ReactFlow nodes + edges, render graph */}
        Schema graph coming soon for connection: {connectionId}
      </div>
    </div>
  );
}
