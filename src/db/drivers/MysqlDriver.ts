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
    // TODO: attempt connect + SELECT 1
    return false;
  }
}
