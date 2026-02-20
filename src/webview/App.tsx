import React, { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatPanel } from "./components/ChatPanel";
import { ConnectionForm } from "./components/ConnectionForm";
import { SchemaGraph } from "./components/SchemaGraph";
import { useConnections } from "./hooks/useConnections";
import { useChat } from "./hooks/useChat";

export type ActiveView = "chat" | "schema" | "connections";

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>("chat");
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);

  const { connections, addConnection, removeConnection, testConnection, crawlSchema } =
    useConnections();
  const { messages, sendMessage, isStreaming, clearHistory } = useChat(activeConnectionId);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        connections={connections}
        activeConnectionId={activeConnectionId}
        activeView={activeView}
        onSelectConnection={setActiveConnectionId}
        onChangeView={setActiveView}
        onCrawl={crawlSchema}
        onRemove={removeConnection}
      />

      <main className="flex-1 overflow-hidden">
        {activeView === "chat" && (
          <ChatPanel
            messages={messages}
            isStreaming={isStreaming}
            onSend={sendMessage}
            onClear={clearHistory}
            connectionId={activeConnectionId}
          />
        )}
        {activeView === "schema" && (
          <SchemaGraph connectionId={activeConnectionId} />
        )}
        {activeView === "connections" && (
          <ConnectionForm
            onAdd={addConnection}
            onTest={testConnection}
            connections={connections}
            onRemove={removeConnection}
          />
        )}
      </main>
    </div>
  );
};
