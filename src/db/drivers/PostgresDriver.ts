import { Client } from "pg";
import { DbConnectionConfig, DatabaseSchema } from "../../shared/types";

/**
 * Driver for PostgreSQL via the `pg` package.
 */
export class PostgresDriver {
  async connect(config: DbConnectionConfig, password: string): Promise<void> {
    // TODO: create pg Pool
  }

  async disconnect(): Promise<void> {
    // TODO: end pool
  }

  async crawlSchema(connectionId: string): Promise<DatabaseSchema> {
    // TODO: query information_schema.tables, information_schema.columns,
    //       pg_proc for stored procedures/functions
    throw new Error("Not implemented");
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
