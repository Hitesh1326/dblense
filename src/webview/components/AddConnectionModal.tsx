import React, { useCallback, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { ConnectionForm } from "./ConnectionForm";
import { DbConnectionConfig } from "../../shared/types";
import type { AddConnectionResult } from "../hooks/useConnections";

/** Props for the add-connection modal. */
interface AddConnectionModalProps {
  /** When true, the modal is visible. */
  isOpen: boolean;
  /** Called when the user closes the modal (Escape, backdrop click, or close button). */
  onClose: () => void;
  /** Called when the user submits the form with valid connection config and password. */
  onAdd: (config: DbConnectionConfig & { password: string }) => void;
  /** True while the extension is testing and adding the connection. */
  addConnectionPending?: boolean;
  /** Result of the last add attempt (success or error); used to show error and close on success. */
  addConnectionResult?: AddConnectionResult;
}

/**
 * Modal for adding a new database connection. Tests the connection before adding; only adds on success.
 * Shows loading while testing/adding and error message if the connection fails.
 */
export function AddConnectionModal({
  isOpen,
  onClose,
  onAdd,
  addConnectionPending = false,
  addConnectionResult = null,
}: AddConnectionModalProps) {
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
    },
    [onAdd]
  );

  if (!isOpen) return null;

  const addFailed = addConnectionResult && !addConnectionResult.success;

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
            disabled={addConnectionPending}
            className="p-1 rounded hover:bg-vscode-toolbar-hoverBackground text-vscode-foreground disabled:opacity-50"
            aria-label="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="p-4">
          {addFailed && (
            <div className="mb-4 px-3 py-2 rounded border border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-400 dark:border-red-400/50 dark:bg-red-400/10 text-sm">
              {addConnectionResult.error ?? "Connection failed"}
            </div>
          )}
          <ConnectionForm onAdd={handleAdd} addConnectionPending={addConnectionPending} />
        </div>
      </div>
    </div>
  );
}
