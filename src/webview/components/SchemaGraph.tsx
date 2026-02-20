import React from "react";

interface SchemaGraphProps {
  connectionId: string | null;
}

/**
 * Renders an interactive ReactFlow graph of the database schema.
 * Tables are nodes; foreign-key relationships are edges.
 */
export function SchemaGraph({ connectionId }: SchemaGraphProps) {
  if (!connectionId) {
    return (
      <div className="flex items-center justify-center h-full opacity-40 text-sm">
        Select a database connection to view its schema graph.
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
