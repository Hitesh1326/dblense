import { Client } from "pg";
import { DbConnectionConfig, DatabaseSchema, CrawlProgressCallback } from "../../shared/types";

/**
 * Driver for PostgreSQL via the `pg` package.
 * Each operation creates its own connection and closes it when done.
 */
export class PostgresDriver {
  async crawlSchema(
    _config: DbConnectionConfig,
    _password: string,
    _onProgress?: CrawlProgressCallback,
    _signal?: AbortSignal
  ): Promise<DatabaseSchema> {
    // TODO: query information_schema.tables, information_schema.columns,
    //       pg_proc for stored procedures/functions
    throw new Error("Postgres schema crawl not implemented yet");
  }

  async testConnection(config: DbConnectionConfig, password: string): Promise<boolean> {
    const client = new Client({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password,
      ssl: config.useSsl ? { rejectUnauthorized: false } : false,
    });
    try {
      await client.connect();
      const result = await client.query("SELECT 1");
      return result.rowCount === 1;
    } finally {
      await client.end();
    }
  }
}
