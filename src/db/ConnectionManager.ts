import * as vscode from "vscode";
import { DbConnectionConfig } from "../shared/types";
import { getDriver } from "./drivers";
import { logger } from "../utils/logger";

const CONNECTIONS_KEY = "schemasight.connections";
const CRAWLED_IDS_KEY = "schemasight.crawledConnectionIds";
const PASSWORD_KEY_PREFIX = "schemasight.password.";

/**
 * Persists connection configs in VS Code globalState.
 * Passwords are stored separately in VS Code SecretStorage.
 */
export class ConnectionManager {
  /**
   * @param globalState VS Code Memento for persisting connection list and crawled-connection IDs.
   * @param secrets VS Code SecretStorage for persisting passwords per connection.
   */
  constructor(
    private readonly globalState: vscode.Memento,
    private readonly secrets: vscode.SecretStorage
  ) {}

  /**
   * Returns all saved connection configs (without passwords).
   * @returns Array of connection configs; empty array if none saved.
   */
  async getAll(): Promise<DbConnectionConfig[]> {
    const raw = this.globalState.get<DbConnectionConfig[]>(CONNECTIONS_KEY);
    return Array.isArray(raw) ? raw : [];
  }

  /**
   * Adds a new connection and stores its password in SecretStorage.
   * @param config Connection config (id, label, driver, host, port, database, username, useSsl).
   * @param password Password to store for this connection.
   * @throws Error if a connection with the same id already exists.
   */
  async add(config: DbConnectionConfig, password: string): Promise<void> {
    const list = await this.getAll();
    if (list.some((c) => c.id === config.id)) {
      throw new Error(`Connection with id "${config.id}" already exists`);
    }
    list.push(config);
    await this.globalState.update(CONNECTIONS_KEY, list);
    await this.secrets.store(`${PASSWORD_KEY_PREFIX}${config.id}`, password);
  }

  /**
   * Removes a connection and its stored password; also removes it from crawled-connection IDs.
   * @param id Connection id to remove.
   */
  async remove(id: string): Promise<void> {
    const list = (await this.getAll()).filter((c) => c.id !== id);
    await this.globalState.update(CONNECTIONS_KEY, list);
    await this.secrets.delete(`${PASSWORD_KEY_PREFIX}${id}`);
    await this.removeCrawledConnectionId(id);
  }

  /**
   * Returns the list of connection ids that have been crawled/indexed.
   * @returns Array of connection ids; empty array if none.
   */
  async getCrawledConnectionIds(): Promise<string[]> {
    const raw = this.globalState.get<string[]>(CRAWLED_IDS_KEY);
    return Array.isArray(raw) ? raw : [];
  }

  /**
   * Marks a connection as crawled (indexed). Idempotent if already present.
   * @param id Connection id that was crawled.
   */
  async addCrawledConnectionId(id: string): Promise<void> {
    const ids = await this.getCrawledConnectionIds();
    if (ids.includes(id)) return;
    await this.globalState.update(CRAWLED_IDS_KEY, [...ids, id]);
  }

  /**
   * Removes a connection from the crawled list (e.g. after connection removal).
   * @param id Connection id to remove from crawled list.
   */
  async removeCrawledConnectionId(id: string): Promise<void> {
    const ids = (await this.getCrawledConnectionIds()).filter((x) => x !== id);
    await this.globalState.update(CRAWLED_IDS_KEY, ids);
  }

  /**
   * Retrieves the stored password for a connection.
   * @param id Connection id.
   * @returns The password, or undefined if not stored.
   */
  async getPassword(id: string): Promise<string | undefined> {
    return this.secrets.get(`${PASSWORD_KEY_PREFIX}${id}`);
  }

  /**
   * Returns the connection config for the given id.
   * @param id Connection id.
   * @returns The config, or undefined if not found.
   */
  async getById(id: string): Promise<DbConnectionConfig | undefined> {
    const list = await this.getAll();
    return list.find((c) => c.id === id);
  }

  /**
   * Tests connectivity for a connection using its driver (no schema crawl).
   * @param id Connection id (must exist and have a stored password).
   * @returns { success: true } on success, or { success: false, error } on failure (not found, no password, or driver error).
   */
  async testConnection(id: string): Promise<{ success: boolean; error?: string }> {
    const config = await this.getById(id);
    if (!config) {
      logger.warn(`Connection test skipped: no connection found for id "${id}".`);
      return { success: false, error: "Connection not found" };
    }
    const password = await this.getPassword(id);
    if (password === undefined) {
      logger.warn(`Connection test skipped: no password stored for "${config.label}".`);
      return { success: false, error: "Password not found" };
    }

    logger.info(`Testing connection: ${config.label} (${config.driver} @ ${config.host}:${config.port}/${config.database}).`);
    const driver = getDriver(config.driver);
    try {
      const ok = await driver.testConnection(config, password);
      if (ok) {
        logger.info(`Connection test successful: ${config.label}.`);
        return { success: true };
      }
      logger.warn(`Connection test failed: ${config.label} — connection refused or invalid.`);
      return { success: false, error: "Connection failed" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Connection test failed: ${config.label}`, err);
      return { success: false, error: message };
    }
  }
}
