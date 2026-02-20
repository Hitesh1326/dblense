import { useState, useEffect, useCallback } from "react";
import { DbConnectionConfig } from "../../shared/types";
import { postMessage, onMessage } from "../vscodeApi";

interface UseConnectionsReturn {
  connections: DbConnectionConfig[];
  addConnection: (config: DbConnectionConfig & { password: string }) => void;
  removeConnection: (id: string) => void;
  testConnection: (id: string) => void;
  crawlSchema: (id: string) => void;
}

export function useConnections(): UseConnectionsReturn {
  const [connections, setConnections] = useState<DbConnectionConfig[]>([]);

  useEffect(() => {
    postMessage({ type: "GET_CONNECTIONS" });

    const unsubscribe = onMessage((message) => {
      switch (message.type) {
        case "CONNECTIONS_LIST":
          setConnections(message.payload);
          break;
        case "CONNECTION_ADDED":
          setConnections((prev) => [...prev, message.payload]);
          break;
        case "CONNECTION_REMOVED":
          setConnections((prev) => prev.filter((c) => c.id !== message.payload.id));
          break;
      }
    });

    return unsubscribe;
  }, []);

  const addConnection = useCallback((config: DbConnectionConfig & { password: string }) => {
    postMessage({ type: "ADD_CONNECTION", payload: config });
  }, []);

  const removeConnection = useCallback((id: string) => {
    postMessage({ type: "REMOVE_CONNECTION", payload: { id } });
  }, []);

  const testConnection = useCallback((id: string) => {
    postMessage({ type: "TEST_CONNECTION", payload: { id } });
  }, []);

  const crawlSchema = useCallback((id: string) => {
    postMessage({ type: "CRAWL_SCHEMA", payload: { id } });
  }, []);

  return { connections, addConnection, removeConnection, testConnection, crawlSchema };
}
