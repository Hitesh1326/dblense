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
 * (Test, Re-index/Crawl schema, Index info, Remove). Add connection next to header. Click-outside closes menu.
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
      <SidebarHeader onAddConnection={onAddConnection} />
      <ConnectionList
        connections={connections}
        crawledConnectionIds={crawledConnectionIds}
        activeConnectionId={activeConnectionId}
        crawlProgress={crawlProgress}
        menuOpenId={menuOpenId}
        menuRef={menuRef}
        onSelectConnection={onSelectConnection}
        onToggleMenu={(id) => setMenuOpenId((prev) => (prev === id ? null : id))}
        onCloseMenu={() => setMenuOpenId(null)}
        onTest={onTest}
        onCrawl={onCrawl}
        onRemove={onRemove}
        onIndexInfo={onIndexInfo}
      />
    </aside>
  );
}

/** Sidebar top bar: "Connections" label and the Add button. */
function SidebarHeader({ onAddConnection }: { onAddConnection: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2 shrink-0">
      <span className="text-[10px] font-normal uppercase tracking-widest text-vscode-descriptionForeground opacity-90">
        Connections
      </span>
      <button
        type="button"
        onClick={onAddConnection}
        aria-label="Add connection"
        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium hover:opacity-90 transition-opacity"
        style={{
          backgroundColor: "var(--vscode-button-background)",
          color: "var(--vscode-button-foreground)",
        }}
      >
        <Plus size={14} aria-hidden />
        Add
      </button>
    </div>
  );
}

/** Scrollable list of connection rows plus the empty-state placeholder. */
function ConnectionList({
  connections,
  crawledConnectionIds,
  activeConnectionId,
  crawlProgress,
  menuOpenId,
  menuRef,
  onSelectConnection,
  onToggleMenu,
  onCloseMenu,
  onTest,
  onCrawl,
  onRemove,
  onIndexInfo,
}: {
  connections: DbConnectionConfig[];
  crawledConnectionIds: string[];
  activeConnectionId: string | null;
  crawlProgress: CrawlProgress | null;
  menuOpenId: string | null;
  menuRef: React.RefObject<HTMLDivElement>;
  onSelectConnection: (id: string) => void;
  onToggleMenu: (id: string) => void;
  onCloseMenu: () => void;
  onTest: (id: string) => void;
  onCrawl: (id: string) => void;
  onRemove: (id: string) => void;
  onIndexInfo?: (id: string) => void;
}) {
  return (
    <ul className="flex-1 py-1.5 px-1.5 space-y-0.5 min-h-0 overflow-y-auto">
      {connections.map((conn) => (
        <ConnectionRow
          key={conn.id}
          conn={conn}
          isActive={activeConnectionId === conn.id}
          isCrawling={crawlProgress?.connectionId === conn.id}
          isIndexed={crawledConnectionIds.includes(conn.id)}
          menuOpen={menuOpenId === conn.id}
          menuRef={menuRef}
          crawlProgress={crawlProgress}
          onSelect={() => onSelectConnection(conn.id)}
          onToggleMenu={() => onToggleMenu(conn.id)}
          onCloseMenu={onCloseMenu}
          onTest={() => { onTest(conn.id); onCloseMenu(); }}
          onCrawl={() => { onSelectConnection(conn.id); onCrawl(conn.id); onCloseMenu(); }}
          onRemove={() => { onRemove(conn.id); onCloseMenu(); }}
          onIndexInfo={onIndexInfo ? () => { onIndexInfo(conn.id); onCloseMenu(); } : undefined}
        />
      ))}
      {connections.length === 0 && (
        <li className="px-3 py-4 text-xs text-vscode-descriptionForeground italic">
          No connections yet
        </li>
      )}
    </ul>
  );
}

/** A single connection row: avatar + label button + ⋮ menu trigger and dropdown. */
function ConnectionRow({
  conn,
  isActive,
  isCrawling,
  isIndexed,
  menuOpen,
  menuRef,
  crawlProgress,
  onSelect,
  onToggleMenu,
  onCloseMenu: _onCloseMenu,
  onTest,
  onCrawl,
  onRemove,
  onIndexInfo,
}: {
  conn: DbConnectionConfig;
  isActive: boolean;
  isCrawling: boolean;
  isIndexed: boolean;
  menuOpen: boolean;
  menuRef: React.RefObject<HTMLDivElement>;
  crawlProgress: CrawlProgress | null;
  onSelect: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onTest: () => void;
  onCrawl: () => void;
  onRemove: () => void;
  onIndexInfo?: () => void;
}) {
  return (
    <li className="relative">
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
          onClick={onSelect}
          title={conn.database}
        >
          <DbAvatarWithStatus driver={conn.driver} isIndexed={isIndexed} isCrawling={isCrawling} isActive={isActive} />
          <span className="truncate font-normal text-sm" title={conn.database}>
            {conn.database}
          </span>
        </button>
        <div className="shrink-0" ref={menuOpen ? menuRef : undefined}>
          <button
            type="button"
            aria-label="Actions"
            aria-expanded={menuOpen}
            onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
            className="p-1 rounded hover:bg-vscode-toolbar-hoverBackground text-vscode-descriptionForeground hover:text-vscode-foreground"
          >
            <MoreVertical size={14} aria-hidden />
          </button>
          {menuOpen && (
            <ConnectionMenu
              isIndexed={isIndexed}
              crawlProgress={crawlProgress}
              onTest={onTest}
              onCrawl={onCrawl}
              onRemove={onRemove}
              onIndexInfo={onIndexInfo}
            />
          )}
        </div>
      </div>
    </li>
  );
}

/** Dropdown menu for a connection row: Test, Crawl/Re-index, Index info (if indexed), Remove. */
function ConnectionMenu({
  isIndexed,
  crawlProgress,
  onTest,
  onCrawl,
  onRemove,
  onIndexInfo,
}: {
  isIndexed: boolean;
  crawlProgress: CrawlProgress | null;
  onTest: () => void;
  onCrawl: () => void;
  onRemove: () => void;
  onIndexInfo?: () => void;
}) {
  return (
    <div className="absolute right-0 top-full mt-0.5 z-10 py-0.5 min-w-[160px] rounded-md shadow-lg border border-vscode-dropdown-border bg-vscode-dropdown-background">
      <button
        type="button"
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-vscode-list-hoverBackground"
        onClick={onTest}
      >
        Test connection
      </button>
      <button
        type="button"
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-vscode-list-hoverBackground disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!!crawlProgress}
        onClick={() => { if (!crawlProgress) onCrawl(); }}
      >
        {isIndexed ? "Re-index" : "Crawl schema"}
      </button>
      {isIndexed && onIndexInfo && (
        <button
          type="button"
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-vscode-list-hoverBackground"
          onClick={onIndexInfo}
        >
          Index info
        </button>
      )}
      <button
        type="button"
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-vscode-list-hoverBackground text-vscode-errorForeground"
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
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
  isActive,
}: {
  driver: DbConnectionConfig["driver"];
  isIndexed: boolean;
  isCrawling: boolean;
  isActive?: boolean;
}) {
  const { label, bg, fg, bgActive } = driverStyle(driver);
  return (
    <span className="relative shrink-0 inline-flex" aria-hidden>
      <span
        className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-[10px] font-semibold ${isActive ? bgActive : bg} ${fg}`}
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

function driverStyle(driver: DbConnectionConfig["driver"]): { label: string; bg: string; fg: string; bgActive: string } {
  switch (driver) {
    case "mssql":
      return { label: "MS", bg: "bg-[#0078d4]/25", fg: "text-[#0078d4]", bgActive: "bg-white" };
    case "postgres":
      return { label: "PG", bg: "bg-[#336791]/25", fg: "text-[#336791]", bgActive: "bg-white" };
    case "mysql":
      return { label: "MY", bg: "bg-[#00758f]/25", fg: "text-[#00758f]", bgActive: "bg-white" };
    default:
      return { label: "DB", bg: "bg-vscode-badge-background", fg: "text-vscode-badge-foreground", bgActive: "bg-white" };
  }
}
