import React, { useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { ConnectionForm } from "./ConnectionForm";
import { DbConnectionConfig } from "../../shared/types";

/** Props for the add-connection modal. */
interface AddConnectionModalProps {
  /** When true, the modal is visible. */
  isOpen: boolean;
  /** Called when the user closes the modal (Escape, backdrop click, or close button). */
  onClose: () => void;
  /** Called when the user submits the form with valid connection config and password. */
  onAdd: (config: DbConnectionConfig & { password: string }) => void;
}

/**
 * Modal for adding a new database connection. Renders a dialog with ConnectionForm;
 * supports Escape to close and clicking the backdrop to close. On successful add,
 * calls onAdd with the config and password then closes.
 */
export function AddConnectionModal({ isOpen, onClose, onAdd }: AddConnectionModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const handleAdd = useCallback(
    (config: DbConnectionConfig & { password: string }) => {
      onAdd(config);
      onClose();
    },
    [onAdd, onClose]
  );

  if (!isOpen) return null;

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
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="p-4">
          <ConnectionForm onAdd={handleAdd} />
        </div>
      </div>
    </div>
  );
}
