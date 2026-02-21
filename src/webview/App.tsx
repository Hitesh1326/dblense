import React, { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { TabBar, MainView } from "./components/TabBar";
import { ChatPanel } from "./components/ChatPanel";
import { SchemaGraph } from "./components/SchemaGraph";
import { AddConnectionModal } from "./components/AddConnectionModal";
import { useConnections } from "./hooks/useConnections";
import { useChat } from "./hooks/useChat";

export function App() {
  const [activeView, setActiveView] = useState<MainView>("chat");
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [addConnectionModalOpen, setAddConnectionModalOpen] = useState(false);

  const { connections, crawledConnectionIds, crawlProgress, addConnection, removeConnection, testConnection, crawlSchema } =
    useConnections();
  const { messages, sendMessage, isStreaming, clearHistory } = useChat(activeConnectionId);

  const isActiveCrawled = activeConnectionId !== null && crawledConnectionIds.includes(activeConnectionId);
  const isActiveCrawling = crawlProgress !== null && crawlProgress.connectionId === activeConnectionId;

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
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <TabBar activeView={activeView} onChangeView={setActiveView} />

        {!activeConnectionId ? (
          <div className="flex-1 flex items-center justify-center text-vscode-descriptionForeground text-sm">
            Select or add a connection to get started.
          </div>
        ) : (
          <div className="flex-1 overflow-hidden min-h-0">
            {activeView === "chat" && (
              <ChatPanel
                messages={messages}
                isStreaming={isStreaming}
                onSend={sendMessage}
                onClear={clearHistory}
                connectionId={activeConnectionId}
                isCrawled={isActiveCrawled}
                onCrawl={() => activeConnectionId && crawlSchema(activeConnectionId)}
                isCrawling={isActiveCrawling}
              />
            )}
            {activeView === "schema" && (
              <SchemaGraph
                connectionId={activeConnectionId}
                isCrawled={isActiveCrawled}
                onCrawl={() => activeConnectionId && crawlSchema(activeConnectionId)}
                isCrawling={isActiveCrawling}
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
    </div>
  );
}
