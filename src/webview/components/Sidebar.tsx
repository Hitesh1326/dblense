import React, { useState, useRef, useEffect } from "react";
import { Plus, MoreVertical } from "lucide-react";
import { DbConnectionConfig, CrawlProgress } from "../../shared/types";

/** Props for the connections sidebar (list, selection, crawl state, and actions). */
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
  onIndexInfo?: (connectionId: string) => void;
}

/**
 * Connections sidebar: list of connections with avatar, active state, and per-item ⋮ menu
 * (Test, Re-index/Crawl schema, Index info, Remove). Click-outside closes the open menu.
 * Add Connection button at the bottom.
 */
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
  onIndexInfo,
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
    <aside className="w-[220px] flex flex-col border-r border-vscode-panel-border bg-vscode-sideBar-background overflow-hidden shrink-0">
      <div className="flex items-center px-3 pt-3 pb-2 shrink-0">
        <span className="text-[10px] font-normal uppercase tracking-widest text-vscode-descriptionForeground opacity-90">
          Connections
        </span>
      </div>

      <ul className="flex-1 py-1.5 px-1.5 space-y-0.5 min-h-0 overflow-y-auto">
        {connections.map((conn) => {
          const isActive = activeConnectionId === conn.id;
          const isCrawling = crawlProgress?.connectionId === conn.id;
          const menuOpen = menuOpenId === conn.id;
          const isIndexed = crawledConnectionIds.includes(conn.id);
          const primaryLabel = conn.database;

          return (
            <li key={conn.id} className="relative">
              <div
                className={`group flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-sm min-w-0 transition-colors ${
                  isActive
                    ? "bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground"
                    : "hover:bg-vscode-list-hoverBackground text-vscode-foreground"
                }`}
              >
                <button
                  type="button"
                  className="flex-1 min-w-0 flex items-center gap-2.5"
                  onClick={() => onSelectConnection(conn.id)}
                  title={primaryLabel}
                >
                  <DbAvatarWithStatus driver={conn.driver} isIndexed={isIndexed} isCrawling={isCrawling} />
                  <span className="truncate font-normal text-sm" title={primaryLabel}>
                    {primaryLabel}
                  </span>
                </button>
                <div
                  className="shrink-0"
                  ref={menuOpen ? menuRef : undefined}
                >
                  <button
                    type="button"
                    aria-label="Actions"
                    aria-expanded={menuOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(menuOpen ? null : conn.id);
                    }}
                    className="p-1 rounded hover:bg-vscode-toolbar-hoverBackground text-vscode-descriptionForeground hover:text-vscode-foreground"
                  >
                    <MoreVertical size={14} aria-hidden />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-0.5 z-10 py-0.5 min-w-[160px] rounded-md shadow-lg border border-vscode-dropdown-border bg-vscode-dropdown-background">
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
                            onSelectConnection(conn.id);
                            onCrawl(conn.id);
                            setMenuOpenId(null);
                          }
                        }}
                      >
                        {isIndexed ? "Re-index" : "Crawl schema"}
                      </button>
                      {isIndexed && onIndexInfo && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-vscode-list-hoverBackground"
                          onClick={() => {
                            onIndexInfo(conn.id);
                            setMenuOpenId(null);
                          }}
                        >
                          Index info
                        </button>
                      )}
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
            </li>
          );
        })}

        {connections.length === 0 && (
          <li className="px-3 py-4 text-xs text-vscode-descriptionForeground italic">
            No connections yet
          </li>
        )}
      </ul>

      <div className="shrink-0 border-t border-vscode-panel-border/50 p-2 pt-2">
        <button
          type="button"
          onClick={onAddConnection}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          style={{
            backgroundColor: "var(--vscode-button-background)",
            color: "var(--vscode-button-foreground)",
          }}
        >
          <Plus size={18} aria-hidden />
          Add Connection
        </button>
      </div>
    </aside>
  );
}

/**
 * Driver avatar (MS / PG / MY) with an overlaid status badge on the bottom-right:
 * green dot = indexed, pulsing amber = crawling, no badge = not yet indexed.
 */
function DbAvatarWithStatus({
  driver,
  isIndexed,
  isCrawling,
}: {
  driver: DbConnectionConfig["driver"];
  isIndexed: boolean;
  isCrawling: boolean;
}) {
  const { label, bg, fg } = driverStyle(driver);
  return (
    <span className="relative shrink-0 inline-flex" aria-hidden>
      <span
        className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-[10px] font-semibold ${bg} ${fg}`}
        title={driver}
      >
        {label}
      </span>
      {isCrawling && (
        <span
          className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-vscode-sideBar-background bg-amber-400 animate-pulse"
          title="Indexing…"
        />
      )}
      {!isCrawling && isIndexed && (
        <span
          className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-vscode-sideBar-background bg-emerald-500"
          title="Indexed"
        />
      )}
    </span>
  );
}

/** Returns label and Tailwind classes for the driver avatar (MS/PG/MY + colors). */
function driverStyle(driver: DbConnectionConfig["driver"]): { label: string; bg: string; fg: string } {
  switch (driver) {
    case "mssql":
      return { label: "MS", bg: "bg-[#0078d4]/15", fg: "text-[#0078d4]" };
    case "postgres":
      return { label: "PG", bg: "bg-[#336791]/15", fg: "text-[#336791]" };
    case "mysql":
      return { label: "MY", bg: "bg-[#00758f]/15", fg: "text-[#00758f]" };
    default:
      return { label: "DB", bg: "bg-vscode-badge-background", fg: "text-vscode-badge-foreground" };
  }
}
