import { useState, useEffect, useCallback } from "react";
import { DbConnectionConfig, CrawlProgress } from "../../shared/types";
import { postMessage, onMessage } from "../vscodeApi";

interface UseConnectionsReturn {
  connections: DbConnectionConfig[];
  crawledConnectionIds: string[];
  crawlProgress: CrawlProgress | null;
  addConnection: (config: DbConnectionConfig & { password: string }) => void;
  removeConnection: (id: string) => void;
  testConnection: (id: string) => void;
  crawlSchema: (id: string) => void;
}

export function useConnections(): UseConnectionsReturn {
  const [connections, setConnections] = useState<DbConnectionConfig[]>([]);
  const [crawledConnectionIds, setCrawledConnectionIds] = useState<string[]>([]);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);

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
          setCrawledConnectionIds((prev) => prev.filter((id) => id !== message.payload.id));
          break;
        case "CRAWLED_CONNECTION_IDS":
          setCrawledConnectionIds(message.payload);
          break;
        case "CRAWL_PROGRESS":
          setCrawlProgress(message.payload);
          break;
        case "CRAWL_COMPLETE":
        case "CRAWL_ERROR":
          setCrawlProgress(null);
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

  return { connections, crawledConnectionIds, crawlProgress, addConnection, removeConnection, testConnection, crawlSchema };
}
