import { DbConnectionConfig, DatabaseSchema, CrawlProgressCallback } from "../shared/types";
import { getDriver } from "./drivers";

/**
 * Orchestrates schema crawling across all supported drivers (mssql, postgres, mysql).
 * Delegates to the appropriate driver based on config.driver.
 */
export class SchemaService {
  /**
   * Crawls the database schema for the given connection (tables, views, procedures, functions).
   * @param config Connection config (driver, host, port, database, etc.).
   * @param password Secret password for the connection.
   * @param onProgress Callback invoked with progress updates (phase, current, total, currentObject).
   * @param signal Optional AbortSignal to cancel the crawl.
   * @returns The full database schema; rejects on driver error or if signal is aborted.
   */
  async crawl(
    config: DbConnectionConfig,
    password: string,
    onProgress: CrawlProgressCallback,
    signal?: AbortSignal
  ): Promise<DatabaseSchema> {
    const driver = getDriver(config.driver);
    return driver.crawlSchema(config, password, onProgress, signal);
  }
}
