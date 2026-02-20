import * as vscode from "vscode";
import { DbConnectionConfig, DbDriver } from "../shared/types";
import { PostgresDriver } from "./drivers/PostgresDriver";
import { MssqlDriver } from "./drivers/MssqlDriver";
import { MysqlDriver } from "./drivers/MysqlDriver";
import { logger } from "../utils/logger";

const CONNECTIONS_KEY = "dblense.connections";
const PASSWORD_KEY_PREFIX = "dblense.password.";

/**
 * Persists connection configs in VS Code globalState.
 * Passwords are stored separately in VS Code SecretStorage.
 */
export class ConnectionManager {
  constructor(
    private readonly globalState: vscode.Memento,
    private readonly secrets: vscode.SecretStorage
  ) {}

  async getAll(): Promise<DbConnectionConfig[]> {
    const raw = this.globalState.get<DbConnectionConfig[]>(CONNECTIONS_KEY);
    return Array.isArray(raw) ? raw : [];
  }

  async add(config: DbConnectionConfig, password: string): Promise<void> {
    const list = await this.getAll();
    if (list.some((c) => c.id === config.id)) {
      throw new Error(`Connection with id "${config.id}" already exists`);
    }
    list.push(config);
    await this.globalState.update(CONNECTIONS_KEY, list);
    await this.secrets.store(`${PASSWORD_KEY_PREFIX}${config.id}`, password);
  }

  async remove(id: string): Promise<void> {
    const list = (await this.getAll()).filter((c) => c.id !== id);
    await this.globalState.update(CONNECTIONS_KEY, list);
    await this.secrets.delete(`${PASSWORD_KEY_PREFIX}${id}`);
  }

  async getPassword(id: string): Promise<string | undefined> {
    return this.secrets.get(`${PASSWORD_KEY_PREFIX}${id}`);
  }

  async getById(id: string): Promise<DbConnectionConfig | undefined> {
    const list = await this.getAll();
    return list.find((c) => c.id === id);
  }

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
    const driver = this.getDriver(config.driver);
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

  private getDriver(driver: DbDriver): PostgresDriver | MssqlDriver | MysqlDriver {
    switch (driver) {
      case "postgres":
        return new PostgresDriver();
      case "mssql":
        return new MssqlDriver();
      case "mysql":
        return new MysqlDriver();
    }
  }
}
