import * as vscode from "vscode";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { ConnectionManager } from "../db/ConnectionManager";
import { SchemaService } from "../db/SchemaService";
import { OllamaService } from "../llm/OllamaService";
import { PromptBuilder } from "../llm/PromptBuilder";
import { EmbeddingService } from "../embeddings/EmbeddingService";
import { VectorStoreManager } from "../vectorstore/VectorStoreManager";
import { Indexer } from "../vectorstore/Indexer";
import { MessageRouter } from "./MessageRouter";
import { WebviewToExtensionMessage } from "../shared/types";

/** Injected services used by MessageRouter to handle webview messages. */
interface Services {
  connectionManager: ConnectionManager;
  schemaService: SchemaService;
  ollamaService: OllamaService;
  promptBuilder: PromptBuilder;
  embeddingService: EmbeddingService;
  vectorStoreManager: VectorStoreManager;
  indexer: Indexer;
}

/**
 * Owns the VS Code WebviewPanel lifecycle (command panel and sidebar webview). Builds HTML with
 * script/style URIs and CSP nonce; delegates all incoming messages to MessageRouter and posts
 * responses back to the webview.
 */
export class PanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private readonly messageRouter: MessageRouter;

  /**
   * @param context - Extension context (extensionUri, subscriptions).
   * @param services - Injected services for MessageRouter.
   */
  constructor(
    private readonly context: vscode.ExtensionContext,
    services: Services
  ) {
    this.messageRouter = new MessageRouter(services);
  }

  /** Opens the main SchemaSight panel or reveals it if already open. */
  openOrReveal(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "schemasight.panel",
      "SchemaSight",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "dist"),
          vscode.Uri.joinPath(this.context.extensionUri, "assets"),
        ],
      }
    );

    this.panel.webview.html = this.buildHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => {
        void this.messageRouter.handle(message, (msg) => {
          this.panel?.webview.postMessage(msg);
        });
      },
      undefined,
      this.context.subscriptions
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      undefined,
      this.context.subscriptions
    );
  }

  /**
   * Sends a message to the main panel webview (no-op if panel is not open).
   * @param message - Message to post to the webview.
   */
  postMessage(message: unknown): void {
    this.panel?.webview.postMessage(message);
  }

  /**
   * Returns a WebviewViewProvider that renders the same app in the sidebar.
   * @returns Provider for the sidebar webview view.
   */
  getSidebarViewProvider(): vscode.WebviewViewProvider {
    return {
      resolveWebviewView: (webviewView: vscode.WebviewView) => {
        webviewView.webview.options = {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(this.context.extensionUri, "dist"),
            vscode.Uri.joinPath(this.context.extensionUri, "assets"),
          ],
        };
        webviewView.webview.html = this.buildHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(
          (message: WebviewToExtensionMessage) => {
            void this.messageRouter.handle(message, (msg) => {
              webviewView.webview.postMessage(msg);
            });
          },
          undefined,
          this.context.subscriptions
        );
      },
    };
  }

  /**
   * Loads dist/webview/index.html and substitutes script/style URIs, nonce, and CSP source.
   * @param webview - Webview instance (for asWebviewUri and cspSource).
   * @returns Full HTML string with placeholders replaced.
   */
  private buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "index.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "index.css")
    );

    const htmlPath = path.join(
      this.context.extensionUri.fsPath,
      "dist",
      "webview",
      "index.html"
    );
    let html = fs.readFileSync(htmlPath, "utf-8");

    html = html
      .replace(/\{\{SCRIPT_URI\}\}/g, scriptUri.toString())
      .replace(/\{\{STYLE_URI\}\}/g, styleUri.toString())
      .replace(/\{\{NONCE\}\}/g, getNonce())
      .replace(/\{\{CSP_SOURCE\}\}/g, webview.cspSource);

    return html;
  }
}

/**
 * CSP nonce for script/style tags (crypto-random, base64url).
 * @returns 32 random bytes as base64url string.
 */
function getNonce(): string {
  return crypto.randomBytes(32).toString("base64url");
}
