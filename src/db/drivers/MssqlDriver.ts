import { DbConnectionConfig, DatabaseSchema } from "../../shared/types";

/**
 * Driver for Microsoft SQL Server via the `mssql` package.
 */
export class MssqlDriver {
  async connect(config: DbConnectionConfig, password: string): Promise<void> {
    // TODO: create mssql connection pool
  }

  async disconnect(): Promise<void> {
    // TODO: close pool
  }

  async crawlSchema(connectionId: string): Promise<DatabaseSchema> {
    // TODO: query sys.tables, sys.columns, sys.procedures, sys.parameters
    throw new Error("Not implemented");
  }

  async testConnection(config: DbConnectionConfig, password: string): Promise<boolean> {
    // TODO: attempt connect + simple SELECT 1
    return false;
  }
}
