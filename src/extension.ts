import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { PanelManager } from "./webview/PanelManager";
import { ConnectionManager } from "./db/ConnectionManager";
import { VectorStoreManager } from "./vectorstore/VectorStoreManager";
import { EmbeddingService } from "./embeddings/EmbeddingService";
import { OllamaService } from "./llm/OllamaService";

export function activate(context: vscode.ExtensionContext): void {
  const connectionManager = new ConnectionManager(context.globalState, context.secrets);
  const ollamaService = new OllamaService();
  const embeddingService = new EmbeddingService();
  const vectorStoreManager = new VectorStoreManager(context.globalStorageUri);
  const panelManager = new PanelManager(context, {
    connectionManager,
    ollamaService,
    embeddingService,
    vectorStoreManager,
  });

  registerCommands(context, panelManager, connectionManager, vectorStoreManager);

  // Sidebar view provider — renders the same React app inside the sidebar
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "dblense.sidebarView",
      panelManager.getSidebarViewProvider(),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
}

export function deactivate(): void {
  // cleanup handled by disposables registered on context
}
