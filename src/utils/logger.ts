import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | undefined;

/** Returns the SchemaSight output channel, creating it on first use. @internal */
function getChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("SchemaSight");
  }
  return outputChannel;
}

/**
 * Logger that writes to the SchemaSight output channel (View → Output → SchemaSight).
 * Use for extension-side logging; does not write to the VS Code developer console.
 */
export const logger = {
  /** Appends a line with [INFO] prefix. */
  info: (msg: string) => getChannel().appendLine(`[INFO]  ${msg}`),
  /** Appends a line with [WARN] prefix. */
  warn: (msg: string) => getChannel().appendLine(`[WARN]  ${msg}`),
  /** Appends a line with [ERROR] prefix; if err is an Error, appends its message. */
  error: (msg: string, err?: unknown) => {
    const detail = err instanceof Error ? ` — ${err.message}` : "";
    getChannel().appendLine(`[ERROR] ${msg}${detail}`);
  },
  /** Reveals the SchemaSight output channel in the Output panel. */
  show: () => getChannel().show(true),
};
