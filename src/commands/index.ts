import * as vscode from "vscode";
import { PanelManager } from "../webview/PanelManager";
import { ConnectionManager } from "../db/ConnectionManager";
import { VectorStoreManager } from "../vectorstore/VectorStoreManager";

export function registerCommands(
  context: vscode.ExtensionContext,
  panelManager: PanelManager,
  connectionManager: ConnectionManager,
  vectorStoreManager: VectorStoreManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dblense.openPanel", () => {
      panelManager.openOrReveal();
    }),

    vscode.commands.registerCommand("dblense.addConnection", () => {
      panelManager.openOrReveal();
      // Panel will handle the add-connection flow via webview UI
    }),

    vscode.commands.registerCommand("dblense.crawlSchema", async () => {
      // TODO: prompt user to pick a connection then trigger crawl
    }),

    vscode.commands.registerCommand("dblense.clearIndex", async () => {
      // TODO: prompt user to pick a connection then clear its index
    })
  );
}
