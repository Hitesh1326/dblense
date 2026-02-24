import { WebviewToExtensionMessage, ExtensionToWebviewMessage } from "../shared/types";

/** Acquired once per webview; must not be called more than once in the same session. */
const vscode = acquireVsCodeApi();

/**
 * Sends a message from the webview to the extension host. Must be a WebviewToExtensionMessage.
 * @param message - Message to send (e.g. GET_CONNECTIONS, CHAT, CRAWL_SCHEMA).
 */
export function postMessage(message: WebviewToExtensionMessage): void {
  vscode.postMessage(message);
}

/**
 * Subscribes to messages from the extension host. Handler receives typed ExtensionToWebviewMessage.
 * @param handler - Callback invoked for each message (e.g. CONNECTIONS_LIST, CHAT_CHUNK).
 * @returns Unsubscribe function; call to remove the listener.
 */
export function onMessage(handler: (message: ExtensionToWebviewMessage) => void): () => void {
  const listener = (event: MessageEvent<ExtensionToWebviewMessage>) => {
    handler(event.data);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

/** Ambient declaration for the webview API provided by the extension host. */
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
