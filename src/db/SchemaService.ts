import { DbConnectionConfig, DatabaseSchema, CrawlProgress } from "../shared/types";
import { MssqlDriver } from "./drivers/MssqlDriver";
import { PostgresDriver } from "./drivers/PostgresDriver";
import { MysqlDriver } from "./drivers/MysqlDriver";

type ProgressCallback = (progress: CrawlProgress) => void;

/**
 * Orchestrates schema crawling across all supported drivers.
 */
export class SchemaService {
  async crawl(
    config: DbConnectionConfig,
    password: string,
    onProgress: ProgressCallback
  ): Promise<DatabaseSchema> {
    // TODO: select driver based on config.driver, run crawl with progress events
    throw new Error("Not implemented");
  }
}
