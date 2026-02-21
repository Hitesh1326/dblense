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
    vscode.commands.registerCommand("schemasight.openPanel", () => {
      panelManager.openOrReveal();
    }),

    vscode.commands.registerCommand("schemasight.addConnection", () => {
      panelManager.openOrReveal();
      // Panel will handle the add-connection flow via webview UI
    }),

    vscode.commands.registerCommand("schemasight.crawlSchema", async () => {
      // TODO: prompt user to pick a connection then trigger crawl
    }),

    vscode.commands.registerCommand("schemasight.clearIndex", async () => {
      // TODO: prompt user to pick a connection then clear its index
    })
  );
}
