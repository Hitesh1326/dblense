import * as vscode from "vscode";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { ConnectionManager } from "../db/ConnectionManager";
import { OllamaService } from "../llm/OllamaService";
import { EmbeddingService } from "../embeddings/EmbeddingService";
import { VectorStoreManager } from "../vectorstore/VectorStoreManager";
import { MessageRouter } from "./MessageRouter";
import { WebviewToExtensionMessage } from "../shared/types";

interface Services {
  connectionManager: ConnectionManager;
  ollamaService: OllamaService;
  embeddingService: EmbeddingService;
  vectorStoreManager: VectorStoreManager;
}

/**
 * Owns the VS Code WebviewPanel lifecycle.
 * Delegates all message handling to MessageRouter.
 */
export class PanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private readonly messageRouter: MessageRouter;

  constructor(
    private readonly context: vscode.ExtensionContext,
    services: Services
  ) {
    this.messageRouter = new MessageRouter(services);
  }

  openOrReveal(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "dblense.panel",
      "DBLens",
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
        this.messageRouter.handle(message, (msg) => {
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

  postMessage(message: unknown): void {
    this.panel?.webview.postMessage(message);
  }

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
            this.messageRouter.handle(message, (msg) => {
              webviewView.webview.postMessage(msg);
            });
          },
          undefined,
          this.context.subscriptions
        );
      },
    };
  }

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

function getNonce(): string {
  return crypto.randomBytes(32).toString("base64url");
}
