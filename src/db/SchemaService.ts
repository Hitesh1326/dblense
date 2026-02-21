import { DbConnectionConfig, DatabaseSchema, CrawlProgressCallback } from "../shared/types";
import { getDriver } from "./drivers";

/**
 * Orchestrates schema crawling across all supported drivers.
 */
export class SchemaService {
  async crawl(
    config: DbConnectionConfig,
    password: string,
    onProgress: CrawlProgressCallback
  ): Promise<DatabaseSchema> {
    const driver = getDriver(config.driver);
    return driver.crawlSchema(config, password, onProgress);
  }
}
