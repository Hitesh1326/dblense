import * as mysql from "mysql2/promise";
import { DbConnectionConfig, DatabaseSchema } from "../../shared/types";

/**
 * Driver for MySQL via the `mysql2` package.
 */
export class MysqlDriver {
  async connect(config: DbConnectionConfig, password: string): Promise<void> {
    // TODO: create mysql2 connection pool
  }

  async disconnect(): Promise<void> {
    // TODO: end pool
  }

  async crawlSchema(connectionId: string): Promise<DatabaseSchema> {
    // TODO: query information_schema.TABLES, information_schema.COLUMNS,
    //       information_schema.ROUTINES for stored procedures
    throw new Error("Not implemented");
  }

  async testConnection(config: DbConnectionConfig, password: string): Promise<boolean> {
    const conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password,
      ssl: config.useSsl ? {} : undefined,
    });
    try {
      const [rows] = await conn.execute("SELECT 1 AS n");
      return Array.isArray(rows) && rows.length === 1;
    } finally {
      await conn.end();
    }
  }
}
