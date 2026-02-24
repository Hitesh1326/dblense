import { DbDriver, IDbDriver } from "../../shared/types";
import { MssqlDriver } from "./MssqlDriver";
import { PostgresDriver } from "./PostgresDriver";
import { MysqlDriver } from "./MysqlDriver";

/**
 * Returns the appropriate driver instance for the given DB type.
 * Single place for driver selection — used by ConnectionManager and SchemaService.
 *
 * @param driver Database driver key: "mssql" | "postgres" | "mysql".
 * @returns An IDbDriver implementation for the given type.
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

/** SQL Server driver (mssql package). */
export { MssqlDriver } from "./MssqlDriver";
/** PostgreSQL driver. */
export { PostgresDriver } from "./PostgresDriver";
/** MySQL driver. */
export { MysqlDriver } from "./MysqlDriver";
