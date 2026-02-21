import React from "react";

export type MainView = "chat" | "schema";

interface TabBarProps {
  activeView: MainView;
  onChangeView: (view: MainView) => void;
}

export function TabBar({ activeView, onChangeView }: TabBarProps) {
  return (
    <div className="flex border-b border-vscode-panel-border bg-vscode-editorGroupHeader-tabsBackground shrink-0">
      <button
        type="button"
        onClick={() => onChangeView("chat")}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeView === "chat"
            ? "border-vscode-tab-activeBorder text-vscode-foreground"
            : "border-transparent text-vscode-descriptionForeground hover:text-vscode-foreground"
        }`}
      >
        Chat
      </button>
      <button
        type="button"
        onClick={() => onChangeView("schema")}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeView === "schema"
            ? "border-vscode-tab-activeBorder text-vscode-foreground"
            : "border-transparent text-vscode-descriptionForeground hover:text-vscode-foreground"
        }`}
      >
        Schema Graph
      </button>
    </div>
  );
}
