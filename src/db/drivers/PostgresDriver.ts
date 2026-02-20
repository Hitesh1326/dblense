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
    // TODO: attempt connect + SELECT 1
    return false;
  }
}
