import { useState, useEffect, useCallback, useRef } from "react";
import { DbConnectionConfig, CrawlProgress, IndexStats } from "../../shared/types";
import { postMessage, onMessage } from "../vscodeApi";

interface UseConnectionsReturn {
  connections: DbConnectionConfig[];
  crawledConnectionIds: string[];
  crawlProgress: CrawlProgress | null;
  addConnection: (config: DbConnectionConfig & { password: string }) => void;
  removeConnection: (id: string) => void;
  testConnection: (id: string) => void;
  crawlSchema: (id: string) => void;
  cancelCrawl: (connectionId: string) => void;
  requestIndexStats: (connectionId: string) => void;
  indexStats: IndexStats | null;
  indexStatsLoading: boolean;
  clearIndexInfo: () => void;
}

export function useConnections(): UseConnectionsReturn {
  const [connections, setConnections] = useState<DbConnectionConfig[]>([]);
  const [crawledConnectionIds, setCrawledConnectionIds] = useState<string[]>([]);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const [indexStats, setIndexStats] = useState<IndexStats | null>(null);
  const [indexStatsRequestedId, setIndexStatsRequestedId] = useState<string | null>(null);
  const indexStatsRequestedIdRef = useRef<string | null>(null);

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
        case "CRAWL_CANCELLED":
        case "CRAWL_ERROR":
          setCrawlProgress(null);
          break;
        case "INDEX_STATS":
          if (message.payload.connectionId === indexStatsRequestedIdRef.current) {
            setIndexStats(message.payload.stats);
            indexStatsRequestedIdRef.current = null;
            setIndexStatsRequestedId(null);
          }
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

  const cancelCrawl = useCallback((connectionId: string) => {
    postMessage({ type: "CRAWL_CANCEL", payload: { connectionId } });
  }, []);

  const requestIndexStats = useCallback((connectionId: string) => {
    indexStatsRequestedIdRef.current = connectionId;
    setIndexStatsRequestedId(connectionId);
    setIndexStats(null);
    postMessage({ type: "GET_INDEX_STATS", payload: { connectionId } });
  }, []);

  const clearIndexInfo = useCallback(() => {
    indexStatsRequestedIdRef.current = null;
    setIndexStatsRequestedId(null);
    setIndexStats(null);
  }, []);

  const indexStatsLoading = indexStatsRequestedId !== null;

  return {
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
  };
}
