import * as sql from "mssql";
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
    const pool = await sql.connect({
      server: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password,
      options: { encrypt: config.useSsl, trustServerCertificate: true },
    });
    try {
      const result = await pool.request().query("SELECT 1 AS n");
      return result.recordset?.length === 1;
    } finally {
      await pool.close();
    }
  }
}
