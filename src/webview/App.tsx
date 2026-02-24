import React, { useState, useEffect, useMemo } from "react";
import { Sidebar } from "./components/Sidebar";
import { TabBar, MainView } from "./components/TabBar";
import { ChatPanel } from "./components/ChatPanel";
import { SchemaGraph } from "./components/SchemaGraph";
import { AddConnectionModal } from "./components/AddConnectionModal";
import { IndexInfoModal } from "./components/IndexInfoModal";
import { useConnections } from "./hooks/useConnections";
import { useChat } from "./hooks/useChat";
import { useOllamaStatus } from "./hooks/useOllamaStatus";

/**
 * Root webview UI: sidebar (connections, crawl, index info), main area with TabBar (chat / schema),
 * and modals for adding a connection and viewing index stats. Clears active connection when it
 * is removed from the list; passes crawl/Ollama state and handlers into Sidebar, ChatPanel, and SchemaGraph.
 * @returns Root layout JSX (sidebar, main, modals).
 */
export function App() {
  const [activeView, setActiveView] = useState<MainView>("chat");
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [addConnectionModalOpen, setAddConnectionModalOpen] = useState(false);
  const [indexInfoConnectionId, setIndexInfoConnectionId] = useState<string | null>(null);

  const {
    connections,
    crawledConnectionIds,
    crawlProgress,
    addConnection,
    removeConnection,
    testConnection,
    crawlSchema,
    cancelCrawl,
    requestIndexStats,
    indexStats,
    indexStatsLoading,
    clearIndexInfo,
  } = useConnections();
  const { messages, sendMessage, isStreaming, thinking, showThinkingBlock, clearHistory } = useChat(activeConnectionId);
  const { available: ollamaAvailable, model: ollamaModel, modelPulled: ollamaModelPulled, check: checkOllama } =
    useOllamaStatus();

  const isActiveCrawled = activeConnectionId !== null && crawledConnectionIds.includes(activeConnectionId);
  const isActiveCrawling = crawlProgress !== null && crawlProgress.connectionId === activeConnectionId;
  const cancelActiveCrawl = () => activeConnectionId && cancelCrawl(activeConnectionId);

  const activeConnection = useMemo(
    () => (activeConnectionId ? connections.find((c) => c.id === activeConnectionId) : null),
    [activeConnectionId, connections]
  );
  const activeConnectionName =
    activeConnection?.label?.trim() || activeConnection?.database || "this database";

  useEffect(() => {
    if (activeConnectionId && !connections.some((c) => c.id === activeConnectionId)) {
      setActiveConnectionId(null);
    }
  }, [activeConnectionId, connections]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        connections={connections}
        crawledConnectionIds={crawledConnectionIds}
        activeConnectionId={activeConnectionId}
        crawlProgress={crawlProgress}
        onSelectConnection={setActiveConnectionId}
        onAddConnection={() => setAddConnectionModalOpen(true)}
        onTest={testConnection}
        onCrawl={crawlSchema}
        onRemove={removeConnection}
        onIndexInfo={(id) => {
          setIndexInfoConnectionId(id);
          requestIndexStats(id);
        }}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <TabBar activeView={activeView} onChangeView={setActiveView} />

        {!activeConnectionId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
            <p className="text-sm text-vscode-descriptionForeground">
              Select a connection from the sidebar or add one to get started.
            </p>
            <p className="text-xs text-vscode-descriptionForeground opacity-80">
              SchemaSight indexes your schema and stored procedures so you can chat with your database locally.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {activeView === "chat" && (
              <ChatPanel
                messages={messages}
                isStreaming={isStreaming}
                thinking={thinking}
                showThinkingBlock={showThinkingBlock}
                onSend={sendMessage}
                onClear={clearHistory}
                connectionId={activeConnectionId}
                connectionName={activeConnectionName}
                isCrawled={isActiveCrawled}
                onCrawl={() => activeConnectionId && crawlSchema(activeConnectionId)}
                onCancelCrawl={cancelActiveCrawl}
                isCrawling={isActiveCrawling}
                crawlProgress={crawlProgress}
                ollamaAvailable={ollamaAvailable}
                ollamaModel={ollamaModel}
                ollamaModelPulled={ollamaModelPulled}
                onCheckOllama={checkOllama}
              />
            )}
            {activeView === "schema" && (
              <SchemaGraph
                connectionId={activeConnectionId}
                connectionName={activeConnectionName}
                isCrawled={isActiveCrawled}
                onCrawl={() => activeConnectionId && crawlSchema(activeConnectionId)}
                onCancelCrawl={cancelActiveCrawl}
                isCrawling={isActiveCrawling}
                crawlProgress={crawlProgress}
                ollamaAvailable={ollamaAvailable}
                ollamaModel={ollamaModel}
                ollamaModelPulled={ollamaModelPulled}
                onCheckOllama={checkOllama}
              />
            )}
          </div>
        )}
      </main>

      <AddConnectionModal
        isOpen={addConnectionModalOpen}
        onClose={() => setAddConnectionModalOpen(false)}
        onAdd={addConnection}
      />

      <IndexInfoModal
        isOpen={indexInfoConnectionId !== null}
        connectionId={indexInfoConnectionId ?? ""}
        connectionName={
          connections.find((c) => c.id === indexInfoConnectionId)?.database ?? indexInfoConnectionId ?? ""
        }
        stats={indexStats}
        loading={indexStatsLoading}
        onClose={() => {
          setIndexInfoConnectionId(null);
          clearIndexInfo();
        }}
        onReindex={(id) => {
          setIndexInfoConnectionId(null);
          clearIndexInfo();
          crawlSchema(id);
        }}
      />
    </div>
  );
}
