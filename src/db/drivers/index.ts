import { DbDriver, IDbDriver } from "../../shared/types";
import { MssqlDriver } from "./MssqlDriver";
import { PostgresDriver } from "./PostgresDriver";
import { MysqlDriver } from "./MysqlDriver";

/**
 * Returns the appropriate driver instance for the given DB type.
 * Single place for driver selection — used by ConnectionManager and SchemaService.
 */
export function getDriver(driver: DbDriver): IDbDriver {
  switch (driver) {
    case "mssql":
      return new MssqlDriver();
    case "postgres":
      return new PostgresDriver();
    case "mysql":
      return new MysqlDriver();
  }
}

export { MssqlDriver } from "./MssqlDriver";
export { PostgresDriver } from "./PostgresDriver";
export { MysqlDriver } from "./MysqlDriver";
