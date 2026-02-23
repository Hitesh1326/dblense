import * as vscode from "vscode";
import { PanelManager } from "../webview/PanelManager";

export function registerCommands(
  context: vscode.ExtensionContext,
  panelManager: PanelManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("schemasight.openPanel", () => {
      panelManager.openOrReveal();
    }),

    vscode.commands.registerCommand("schemasight.addConnection", () => {
      panelManager.openOrReveal();
    })
  );
}
