import React from "react";
import { DbConnectionConfig } from "../../shared/types";
import { ActiveView } from "../App";

interface SidebarProps {
  connections: DbConnectionConfig[];
  activeConnectionId: string | null;
  activeView: ActiveView;
  onSelectConnection: (id: string) => void;
  onChangeView: (view: ActiveView) => void;
  onCrawl: (id: string) => void;
  onRemove: (id: string) => void;
}

export function Sidebar({
  connections,
  activeConnectionId,
  activeView,
  onSelectConnection,
  onChangeView,
  onCrawl,
  onRemove,
}: SidebarProps) {
  return (
    <aside className="w-56 flex flex-col border-r border-vscode-panel-border bg-vscode-sideBar-background overflow-y-auto shrink-0">
      {/* Navigation */}
      <nav className="p-2 space-y-1">
        <NavButton active={activeView === "chat"} onClick={() => onChangeView("chat")}>
          Chat
        </NavButton>
        <NavButton active={activeView === "schema"} onClick={() => onChangeView("schema")}>
          Schema Graph
        </NavButton>
        <NavButton active={activeView === "connections"} onClick={() => onChangeView("connections")}>
          Connections
        </NavButton>
      </nav>

      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider opacity-50">
        Databases
      </div>

      {/* Connection list */}
      <ul className="flex-1 space-y-0.5 px-2">
        {connections.map((conn) => (
          <li key={conn.id}>
            <button
              className={`w-full text-left px-2 py-1.5 rounded text-sm truncate flex items-center gap-2 ${
                activeConnectionId === conn.id
                  ? "bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground"
                  : "hover:bg-vscode-list-hoverBackground"
              }`}
              onClick={() => onSelectConnection(conn.id)}
            >
              <DbIcon driver={conn.driver} />
              <span className="truncate">{conn.label}</span>
            </button>
          </li>
        ))}

        {connections.length === 0 && (
          <li className="px-2 py-1.5 text-xs opacity-50 italic">No connections yet</li>
        )}
      </ul>
    </aside>
  );
}

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function NavButton({ active, onClick, children }: NavButtonProps) {
  return (
  <button
    onClick={onClick}
    className={`w-full text-left px-2 py-1.5 rounded text-sm ${
      active
        ? "bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground font-medium"
        : "hover:bg-vscode-list-hoverBackground"
    }`}
  >
    {children}
  </button>
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
