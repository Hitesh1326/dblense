import React from "react";
import { IndexFirstCard } from "./IndexFirstCard";

interface SchemaGraphProps {
  connectionId: string | null;
  isCrawled: boolean;
  onCrawl: () => void;
  isCrawling: boolean;
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
  isCrawled,
  onCrawl,
  isCrawling,
  ollamaAvailable,
  ollamaModel,
  ollamaModelPulled,
  onCheckOllama,
}: SchemaGraphProps) {
  if (!connectionId) {
    return (
      <div className="flex items-center justify-center h-full opacity-40 text-sm">
        Select a database connection to view its schema graph.
      </div>
    );
  }

  if (!isCrawled) {
    return (
      <div className="flex flex-col h-full">
        <IndexFirstCard
          onCrawl={onCrawl}
          isCrawling={isCrawling}
          ollamaAvailable={ollamaAvailable}
          ollamaModel={ollamaModel}
          ollamaModelPulled={ollamaModelPulled}
          onCheckOllama={onCheckOllama}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center opacity-40 text-sm">
      {/* TODO: fetch schema chunks, build ReactFlow nodes + edges, render graph */}
      Schema graph coming soon for connection: {connectionId}
    </div>
  );
}
