import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { PanelManager } from "./webview/PanelManager";
import { ConnectionManager } from "./db/ConnectionManager";
import { SchemaService } from "./db/SchemaService";
import { VectorStoreManager } from "./vectorstore/VectorStoreManager";
import { EmbeddingService } from "./embeddings/EmbeddingService";
import { OllamaService } from "./llm/OllamaService";
import { PromptBuilder } from "./llm/PromptBuilder";
import { Indexer } from "./vectorstore/Indexer";

/**
 * Extension entry point. Wires ConnectionManager, SchemaService, OllamaService, EmbeddingService,
 * VectorStoreManager, Indexer, and PanelManager; registers commands and the sidebar webview provider.
 * @param context - VS Code extension context (globalState, secrets, subscriptions, etc.).
 */
export function activate(context: vscode.ExtensionContext): void {
  const connectionManager = new ConnectionManager(context.globalState, context.secrets);
  const schemaService = new SchemaService();
  const ollamaService = new OllamaService();
  const embeddingService = new EmbeddingService();
  void embeddingService.initialize();
  const vectorStoreManager = new VectorStoreManager(context.globalStorageUri);
  const promptBuilder = new PromptBuilder();
  const indexer = new Indexer(ollamaService, promptBuilder, embeddingService, vectorStoreManager);
  const panelManager = new PanelManager(context, {
    connectionManager,
    schemaService,
    ollamaService,
    promptBuilder,
    embeddingService,
    vectorStoreManager,
    indexer,
  });

  registerCommands(context, panelManager);

  // Sidebar view provider — renders the same React app inside the sidebar
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "schemasight.sidebarView",
      panelManager.getSidebarViewProvider(),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
}

/**
 * Called when the extension is deactivated. Cleanup is handled by disposables registered on context.
 */
export function deactivate(): void {
  // cleanup handled by disposables registered on context
}
