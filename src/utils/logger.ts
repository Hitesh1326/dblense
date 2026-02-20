import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("DBLens");
  }
  return outputChannel;
}

export const logger = {
  info: (msg: string) => getChannel().appendLine(`[INFO]  ${msg}`),
  warn: (msg: string) => getChannel().appendLine(`[WARN]  ${msg}`),
  error: (msg: string, err?: unknown) => {
    const detail = err instanceof Error ? ` — ${err.message}` : "";
    getChannel().appendLine(`[ERROR] ${msg}${detail}`);
  },
  show: () => getChannel().show(true),
};
