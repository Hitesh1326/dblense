import { WebviewToExtensionMessage, ExtensionToWebviewMessage } from "../shared/types";

// acquireVsCodeApi() can only be called once per webview session.
const vscode = acquireVsCodeApi();

export function postMessage(message: WebviewToExtensionMessage): void {
  vscode.postMessage(message);
}

export function onMessage(handler: (message: ExtensionToWebviewMessage) => void): () => void {
  const listener = (event: MessageEvent<ExtensionToWebviewMessage>) => {
    handler(event.data);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

// Extend the global Window interface so TypeScript knows about acquireVsCodeApi
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
