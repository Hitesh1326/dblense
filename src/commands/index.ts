import * as vscode from "vscode";
import { PanelManager } from "../webview/PanelManager";

/**
 * Registers all SchemaSight VS Code commands and adds them to the extension's subscriptions
 * so they are disposed on deactivation.
 *
 * @param context Extension context; registered commands are pushed onto context.subscriptions.
 * @param panelManager Used to open or reveal the SchemaSight webview panel.
 */
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
