import React, { useEffect } from "react";
import { ConnectionForm } from "./ConnectionForm";
import { DbConnectionConfig } from "../../shared/types";

interface AddConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (config: DbConnectionConfig & { password: string }) => void;
}

export function AddConnectionModal({ isOpen, onClose, onAdd }: AddConnectionModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAdd = (config: DbConnectionConfig & { password: string }) => {
    onAdd(config);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-connection-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-vscode-editor-background border border-vscode-panel-border rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-vscode-panel-border flex items-center justify-between">
          <h2 id="add-connection-title" className="text-base font-semibold text-vscode-foreground">
            New Connection
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-vscode-toolbar-hoverBackground text-vscode-foreground"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 4L4 12M4 4l8 8" />
            </svg>
          </button>
        </div>
        <div className="p-4">
          <ConnectionForm onAdd={handleAdd} />
        </div>
      </div>
    </div>
  );
}
