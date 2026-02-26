import React, { useCallback } from "react";

/** Main content tabs: Chat or Schema Graph. */
export type MainView = "chat" | "schema";

/** Props for the tab bar. */
interface TabBarProps {
  /** Currently selected tab. */
  activeView: MainView;
  /** Called when the user switches tab. */
  onChangeView: (view: MainView) => void;
}

/**
 * Tab bar for switching between Chat and Schema Graph. Shows two tabs with an
 * active underline; used at the top of the main content area.
 */
export function TabBar({ activeView, onChangeView }: TabBarProps) {
  const handleChat = useCallback(() => onChangeView("chat"), [onChangeView]);
  const handleSchema = useCallback(() => onChangeView("schema"), [onChangeView]);

  return (
    <div className="flex w-full border-b border-vscode-panel-border bg-vscode-editorGroupHeader-tabsBackground shrink-0 pt-1">
      <button
        type="button"
        onClick={handleChat}
        className={`px-4 py-3 text-sm border-b-2 border-transparent transition-colors ${
          activeView === "chat"
            ? "border-vscode-tab-activeBorder text-vscode-foreground font-semibold opacity-100 mb-[-2px]"
            : "text-vscode-foreground opacity-[0.4] font-normal hover:opacity-60"
        }`}
      >
        Chat
      </button>
      <button
        type="button"
        onClick={handleSchema}
        className={`px-4 py-3 text-sm border-b-2 border-transparent transition-colors ${
          activeView === "schema"
            ? "border-vscode-tab-activeBorder text-vscode-foreground font-semibold opacity-100 mb-[-2px]"
            : "text-vscode-foreground opacity-[0.4] font-normal hover:opacity-60"
        }`}
      >
        Schema Graph
      </button>
    </div>
  );
}
