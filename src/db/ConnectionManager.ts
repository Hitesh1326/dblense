import * as vscode from "vscode";
import { DbConnectionConfig } from "../shared/types";

const CONNECTIONS_KEY = "dblense.connections";
const PASSWORD_KEY_PREFIX = "dblense.password.";

/**
 * Persists connection configs in VS Code globalState.
 * Passwords are stored separately in VS Code SecretStorage.
 */
export class ConnectionManager {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getAll(): Promise<DbConnectionConfig[]> {
    // TODO: load from globalState
    return [];
  }

  async add(config: DbConnectionConfig, password: string): Promise<void> {
    // TODO: persist config to globalState, store password in SecretStorage
  }

  async remove(id: string): Promise<void> {
    // TODO: remove config from globalState, delete password from SecretStorage
  }

  async getPassword(id: string): Promise<string | undefined> {
    return this.secrets.get(`${PASSWORD_KEY_PREFIX}${id}`);
  }

  async testConnection(id: string): Promise<{ success: boolean; error?: string }> {
    // TODO: look up config + password, attempt connect via appropriate driver
    return { success: false, error: "Not implemented" };
  }
}
