import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { PanelManager } from "./webview/PanelManager";
import { ConnectionManager } from "./db/ConnectionManager";
import { SchemaService } from "./db/SchemaService";
import { VectorStoreManager } from "./vectorstore/VectorStoreManager";
import { EmbeddingService } from "./embeddings/EmbeddingService";
import { OllamaService } from "./llm/OllamaService";
import { PromptBuilder } from "./llm/PromptBuilder";
import { SpParser } from "./parser/SpParser";
import { Indexer } from "./vectorstore/Indexer";

export function activate(context: vscode.ExtensionContext): void {
  const connectionManager = new ConnectionManager(context.globalState, context.secrets);
  const schemaService = new SchemaService();
  const ollamaService = new OllamaService();
  const embeddingService = new EmbeddingService();
  const vectorStoreManager = new VectorStoreManager(context.globalStorageUri);
  const promptBuilder = new PromptBuilder();
  const spParser = new SpParser();
  const indexer = new Indexer(ollamaService, promptBuilder, embeddingService, vectorStoreManager, spParser);
  const panelManager = new PanelManager(context, {
    connectionManager,
    schemaService,
    ollamaService,
    embeddingService,
    vectorStoreManager,
    indexer,
  });

  registerCommands(context, panelManager, connectionManager, vectorStoreManager);

  // Sidebar view provider — renders the same React app inside the sidebar
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "schemasight.sidebarView",
      panelManager.getSidebarViewProvider(),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
}

export function deactivate(): void {
  // cleanup handled by disposables registered on context
}
