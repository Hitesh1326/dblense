import React from "react";

export type MainView = "chat" | "schema";

interface TabBarProps {
  activeView: MainView;
  onChangeView: (view: MainView) => void;
}

export function TabBar({ activeView, onChangeView }: TabBarProps) {
  return (
    <div className="flex w-full border-b border-vscode-panel-border bg-vscode-editorGroupHeader-tabsBackground shrink-0">
      <button
        type="button"
        onClick={() => onChangeView("chat")}
        className={`px-4 py-2.5 text-sm border-b-2 border-transparent transition-colors ${
          activeView === "chat"
            ? "border-vscode-tab-activeBorder text-vscode-foreground font-semibold opacity-100 mb-[-2px]"
            : "text-vscode-foreground opacity-[0.4] font-normal hover:opacity-60"
        }`}
      >
        Chat
      </button>
      <button
        type="button"
        onClick={() => onChangeView("schema")}
        className={`px-4 py-2.5 text-sm border-b-2 border-transparent transition-colors ${
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
