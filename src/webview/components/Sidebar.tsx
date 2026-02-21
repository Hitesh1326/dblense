import React, { useState, useRef, useEffect } from "react";
import { DbConnectionConfig, CrawlProgress } from "../../shared/types";

interface SidebarProps {
  connections: DbConnectionConfig[];
  crawledConnectionIds: string[];
  activeConnectionId: string | null;
  crawlProgress: CrawlProgress | null;
  onSelectConnection: (id: string) => void;
  onAddConnection: () => void;
  onTest: (id: string) => void;
  onCrawl: (id: string) => void;
  onRemove: (id: string) => void;
}

function formatCrawlPhase(progress: CrawlProgress): string {
  if (progress.phase === "connecting") return "Connecting…";
  if (progress.phase === "crawling_tables") {
    return progress.total > 0
      ? `Tables ${progress.current}/${progress.total}${progress.currentObject ? ` — ${progress.currentObject}` : ""}`
      : "Crawling tables…";
  }
  if (progress.phase === "crawling_sps") {
    return progress.total > 0
      ? `Stored procedures ${progress.current}/${progress.total}${progress.currentObject ? ` — ${progress.currentObject}` : ""}`
      : "Crawling stored procedures…";
  }
  if (progress.phase === "summarizing") {
    return progress.total > 0
      ? `Summarizing ${progress.current}/${progress.total}${progress.currentObject ? ` — ${progress.currentObject}` : ""}`
      : "Summarizing…";
  }
  if (progress.phase === "embedding") {
    return progress.total > 0
      ? `Embedding ${progress.current}/${progress.total}`
      : "Embedding…";
  }
  if (progress.phase === "storing") return "Storing…";
  return `${progress.phase}…`;
}

export function Sidebar({
  connections,
  crawledConnectionIds,
  activeConnectionId,
  crawlProgress,
  onSelectConnection,
  onAddConnection,
  onTest,
  onCrawl,
  onRemove,
}: SidebarProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpenId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpenId]);

  return (
    <aside className="w-56 flex flex-col border-r border-vscode-panel-border bg-vscode-sideBar-background overflow-y-auto shrink-0">
      <div className="p-2">
        <button
          type="button"
          onClick={onAddConnection}
          className="w-full px-2 py-1.5 rounded text-xs font-medium border border-vscode-button-border bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground hover:bg-vscode-button-secondaryHoverBackground transition-colors"
        >
          + New Connection
        </button>
      </div>

      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider opacity-50">
        Connections
      </div>

      <ul className="flex-1 space-y-0.5 px-2 pb-2">
        {connections.map((conn) => {
          const isActive = activeConnectionId === conn.id;
          const isCrawling = crawlProgress?.connectionId === conn.id;
          const menuOpen = menuOpenId === conn.id;
          const isIndexed = crawledConnectionIds.includes(conn.id);

          return (
            <li key={conn.id} className="relative">
              <div
                className={`group flex items-center gap-1 w-full text-left px-2 py-1.5 rounded text-sm min-w-0 ${
                  isActive
                    ? "bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground"
                    : "hover:bg-vscode-list-hoverBackground"
                }`}
              >
                <button
                  type="button"
                  className="flex-1 min-w-0 flex items-center gap-2 truncate"
                  onClick={() => onSelectConnection(conn.id)}
                  title={conn.label}
                >
                  <DbIcon driver={conn.driver} />
                  <span className="truncate" title={conn.label}>{conn.database}</span>
                  {isIndexed && (
                    <span className="shrink-0 text-[10px] opacity-60" title="Indexed">
                      ✓
                    </span>
                  )}
                </button>
                <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" ref={menuOpen ? menuRef : undefined}>
                  <button
                    type="button"
                    aria-label="Actions"
                    aria-expanded={menuOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(menuOpen ? null : conn.id);
                    }}
                    className="p-0.5 rounded hover:bg-vscode-toolbar-hoverBackground text-vscode-foreground"
                  >
                    <KebabIcon />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-0.5 z-10 py-0.5 min-w-[140px] rounded shadow-lg border border-vscode-dropdown-border bg-vscode-dropdown-background">
                      <button
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-vscode-list-hoverBackground"
                        onClick={() => {
                          onTest(conn.id);
                          setMenuOpenId(null);
                        }}
                      >
                        Test connection
                      </button>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-vscode-list-hoverBackground disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!!crawlProgress}
                        onClick={() => {
                          if (!crawlProgress) {
                            onCrawl(conn.id);
                            setMenuOpenId(null);
                          }
                        }}
                      >
                        Crawl schema
                      </button>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-vscode-list-hoverBackground text-vscode-errorForeground"
                        onClick={() => {
                          onRemove(conn.id);
                          setMenuOpenId(null);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {isCrawling && crawlProgress && (
                <p className="px-2 py-0.5 pl-7 text-[10px] opacity-70 truncate" title={crawlProgress.currentObject}>
                  {formatCrawlPhase(crawlProgress)}
                </p>
              )}
            </li>
          );
        })}

        {connections.length === 0 && (
          <li className="px-2 py-1.5 text-xs opacity-50 italic">No connections yet</li>
        )}
      </ul>
    </aside>
  );
}

function KebabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
    </svg>
  );
}

function DbIcon({ driver }: { driver: DbConnectionConfig["driver"] }) {
  const labels: Record<DbConnectionConfig["driver"], string> = {
    mssql: "MS",
    postgres: "PG",
    mysql: "MY",
  };
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold bg-vscode-badge-background text-vscode-badge-foreground shrink-0">
      {labels[driver]}
    </span>
  );
}
