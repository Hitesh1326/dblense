import * as mysql from "mysql2/promise";
import { DbConnectionConfig, DatabaseSchema, CrawlProgressCallback } from "../../shared/types";

/**
 * Driver for MySQL via the `mysql2` package.
 * Each operation creates its own connection and closes it when done.
 */
export class MysqlDriver {
  async crawlSchema(
    _config: DbConnectionConfig,
    _password: string,
    _onProgress?: CrawlProgressCallback
  ): Promise<DatabaseSchema> {
    // TODO: query information_schema.TABLES, information_schema.COLUMNS,
    //       information_schema.ROUTINES for stored procedures
    throw new Error("MySQL schema crawl not implemented yet");
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
