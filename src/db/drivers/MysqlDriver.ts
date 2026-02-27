import * as mysql from "mysql2/promise";
import {
  DbConnectionConfig,
  DatabaseSchema,
  TableMeta,
  ColumnMeta,
  ViewMeta,
  StoredProcedureMeta,
  FunctionMeta,
  SpParameterMeta,
  CrawlProgressCallback,
  CrawlProgress,
} from "../../shared/types";

/** Row shape for table/view columns from information_schema.COLUMNS. */
interface ColumnRow {
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
  ORDINAL_POSITION: number;
  COLUMN_DEFAULT: string | null;
}

/** Context passed through crawl phases: connection, database name, reporting, and abort check. */
interface CrawlContext {
  conn: mysql.Connection;
  databaseName: string;
  connectionId: string;
  report: (phase: CrawlProgress["phase"], current: number, total: number, currentObject?: string) => void;
  throwIfAborted: () => void;
}

/**
 * MySQL driver using the `mysql2` package.
 * Each operation creates its own connection and closes it when done.
 * Uses information_schema (TABLES, COLUMNS, ROUTINES, PARAMETERS, etc.); dynamic values are parameterized.
 */
export class MysqlDriver {
  /**
   * Builds connection options from connection config and secret password.
   * @param config Connection config (host, port, database, username, useSsl).
   * @param password Secret password from VS Code SecretStorage.
   * @returns mysql2 connection options.
   */
  private getConnectionOptions(
    config: DbConnectionConfig,
    password: string
  ): mysql.ConnectionOptions {
    return {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password,
      ssl: config.useSsl ? {} : undefined,
    };
  }

  /**
   * Crawls the database schema: tables (with columns, PKs, FKs), views, stored procedures, and functions.
   * Reports progress via onProgress and respects signal for cancellation.
   * @param config Connection config (id, database name, etc.).
   * @param password Secret password from VS Code SecretStorage.
   * @param onProgress Optional callback for progress (phase, current, total, currentObject).
   * @param signal Optional AbortSignal to cancel the crawl.
   * @returns Full database schema; connection is closed before returning.
   */
  async crawlSchema(
    config: DbConnectionConfig,
    password: string,
    onProgress?: CrawlProgressCallback,
    signal?: AbortSignal
  ): Promise<DatabaseSchema> {
    const connectionId = config.id;
    const throwIfAborted = () => {
      if (signal?.aborted) throw new DOMException("Crawl cancelled", "AbortError");
    };
    const report = (
      phase: CrawlProgress["phase"],
      current: number,
      total: number,
      currentObject?: string
    ) => {
      onProgress?.({ connectionId, phase, current, total, currentObject });
    };

    report("connecting", 0, 1);
    const conn = await mysql.createConnection(this.getConnectionOptions(config, password));

    try {
      const ctx: CrawlContext = {
        conn,
        databaseName: config.database,
        connectionId,
        report,
        throwIfAborted,
      };

      const tables = await this.crawlTables(ctx);
      const views = await this.crawlViews(ctx);
      const storedProcedures = await this.crawlStoredProcedures(ctx);
      const functions = await this.crawlFunctions(ctx);

      return {
        connectionId,
        databaseName: config.database,
        tables,
        views,
        storedProcedures,
        functions,
        crawledAt: new Date().toISOString(),
      };
    } finally {
      await conn.end();
    }
  }

  /**
   * Tests connectivity by running a simple query.
   * @param config Connection config.
   * @param password Secret password from VS Code SecretStorage.
   * @returns True if the query succeeds; connection is closed before returning.
   */
  async testConnection(config: DbConnectionConfig, password: string): Promise<boolean> {
    const conn = await mysql.createConnection(this.getConnectionOptions(config, password));
    try {
      const [rows] = await conn.execute("SELECT 1 AS n");
      return Array.isArray(rows) && rows.length === 1;
    } finally {
      await conn.end();
    }
  }

  /**
   * Fetches table and column metadata, primary keys, and foreign keys; builds TableMeta list.
   * @param ctx Crawl context (conn, report, throwIfAborted).
   * @returns Array of table metadata with columns, PKs, and FKs.
   */
  private async crawlTables(ctx: CrawlContext): Promise<TableMeta[]> {
    const { conn, report, throwIfAborted } = ctx;

    const tableList = await this.fetchTableList(conn, ctx.databaseName);
    const columnsList = await this.fetchColumnRowsForTables(conn, ctx.databaseName);
    const pkSet = await this.fetchPrimaryKeySet(conn, ctx.databaseName);
    const fkMap = await this.fetchForeignKeyMap(conn, ctx.databaseName);

    const columnsByTable = this.groupColumnsByTableKey(columnsList);
    const totalTables = tableList.length;
    const tables: TableMeta[] = [];

    for (let i = 0; i < totalTables; i++) {
      throwIfAborted();
      const t = tableList[i];
      const key = `${t.TABLE_SCHEMA}.${t.TABLE_NAME}`;
      report("crawling_tables", i + 1, totalTables, `${t.TABLE_SCHEMA}.${t.TABLE_NAME}`);

      const cols = columnsByTable.get(key) ?? [];
      const columnMetas: ColumnMeta[] = cols.map((c) => {
        const colKey = `${key}.${c.COLUMN_NAME}`;
        const fk = fkMap.get(colKey);
        return {
          name: c.COLUMN_NAME,
          dataType: c.DATA_TYPE,
          nullable: c.IS_NULLABLE === "YES",
          isPrimaryKey: pkSet.has(colKey),
          isForeignKey: !!fk,
          referencedTable: fk?.refTable,
          referencedColumn: fk?.refColumn,
          defaultValue: c.COLUMN_DEFAULT ?? undefined,
        };
      });

      tables.push({
        schema: t.TABLE_SCHEMA,
        name: t.TABLE_NAME,
        columns: columnMetas,
      });
    }

    return tables;
  }

  /**
   * Fetches view list, column metadata, and definitions; builds ViewMeta list.
   * @param ctx Crawl context (conn, report, throwIfAborted).
   * @returns Array of view metadata with columns and definition.
   */
  private async crawlViews(ctx: CrawlContext): Promise<ViewMeta[]> {
    const { conn, report, throwIfAborted } = ctx;

    const viewList = await this.fetchViewList(conn, ctx.databaseName);
    const viewColumnsList = await this.fetchColumnRowsForViews(conn, ctx.databaseName);
    const viewColumnsByView = this.groupColumnsByTableKey(viewColumnsList);
    const totalViews = viewList.length;
    const views: ViewMeta[] = [];

    for (let i = 0; i < totalViews; i++) {
      throwIfAborted();
      const v = viewList[i];
      const key = `${v.TABLE_SCHEMA}.${v.TABLE_NAME}`;
      report("crawling_views", i + 1, totalViews, `${v.TABLE_SCHEMA}.${v.TABLE_NAME}`);

      const definition = await this.getViewDefinition(conn, v.TABLE_SCHEMA, v.TABLE_NAME);
      const cols = viewColumnsByView.get(key) ?? [];
      const columnMetas: ColumnMeta[] = cols.map((c) => ({
        name: c.COLUMN_NAME,
        dataType: c.DATA_TYPE,
        nullable: c.IS_NULLABLE === "YES",
        isPrimaryKey: false,
        isForeignKey: false,
      }));

      views.push({
        schema: v.TABLE_SCHEMA,
        name: v.TABLE_NAME,
        columns: columnMetas,
        definition,
      });
    }

    return views;
  }

  /**
   * Fetches stored procedure list, then for each: definition and parameters; builds StoredProcedureMeta list.
   * @param ctx Crawl context (conn, report, throwIfAborted).
   * @returns Array of stored procedure metadata.
   */
  private async crawlStoredProcedures(ctx: CrawlContext): Promise<StoredProcedureMeta[]> {
    const { conn, report, throwIfAborted } = ctx;

    const procList = await this.fetchProcedureList(conn, ctx.databaseName);
    const totalProcs = procList.length;
    const storedProcedures: StoredProcedureMeta[] = [];

    for (let i = 0; i < totalProcs; i++) {
      throwIfAborted();
      const p = procList[i];
      report("crawling_sps", i + 1, totalProcs, `${p.ROUTINE_SCHEMA}.${p.ROUTINE_NAME}`);

      const definition = p.ROUTINE_DEFINITION ?? "";
      const parameters = await this.getRoutineParameters(conn, p.ROUTINE_SCHEMA, p.SPECIFIC_NAME);

      storedProcedures.push({
        schema: p.ROUTINE_SCHEMA,
        name: p.ROUTINE_NAME,
        definition,
        parameters,
      });
    }

    return storedProcedures;
  }

  /**
   * Fetches function list, then for each: definition and parameters; builds FunctionMeta list.
   * @param ctx Crawl context (conn, report, throwIfAborted).
   * @returns Array of function metadata.
   */
  private async crawlFunctions(ctx: CrawlContext): Promise<FunctionMeta[]> {
    const { conn, report, throwIfAborted } = ctx;

    const funcList = await this.fetchFunctionList(conn, ctx.databaseName);
    const totalFuncs = funcList.length;
    const functions: FunctionMeta[] = [];

    for (let i = 0; i < totalFuncs; i++) {
      throwIfAborted();
      const f = funcList[i];
      report("crawling_functions", i + 1, totalFuncs, `${f.ROUTINE_SCHEMA}.${f.ROUTINE_NAME}`);

      const definition = f.ROUTINE_DEFINITION ?? "";
      const parameters = await this.getRoutineParameters(conn, f.ROUTINE_SCHEMA, f.SPECIFIC_NAME);

      functions.push({
        schema: f.ROUTINE_SCHEMA,
        name: f.ROUTINE_NAME,
        definition,
        parameters,
      });
    }

    return functions;
  }

  /**
   * Lists base tables from information_schema.TABLES for the connected database.
   * @param conn Active MySQL connection.
   * @returns List of { TABLE_SCHEMA, TABLE_NAME }.
   */
  private async fetchTableList(
    conn: mysql.Connection,
    databaseName: string
  ): Promise<{ TABLE_SCHEMA: string; TABLE_NAME: string }[]> {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT TABLE_SCHEMA, TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_SCHEMA, TABLE_NAME`,
      [databaseName]
    );
    return (Array.isArray(rows) ? rows : []) as { TABLE_SCHEMA: string; TABLE_NAME: string }[];
  }

  /**
   * Fetches column metadata for base tables from information_schema.COLUMNS.
   * @param conn Active MySQL connection.
   * @returns List of column rows for tables.
   */
  private async fetchColumnRowsForTables(
    conn: mysql.Connection,
    databaseName: string
  ): Promise<ColumnRow[]> {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, ORDINAL_POSITION, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (
         SELECT TABLE_NAME FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
       )
       ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`,
      [databaseName, databaseName]
    );
    return (Array.isArray(rows) ? rows : []) as ColumnRow[];
  }

  /**
   * Fetches primary key column keys (schema.table.column).
   * @param conn Active MySQL connection.
   * @returns Set of "schema.table.column" keys for PK columns.
   */
  private async fetchPrimaryKeySet(
    conn: mysql.Connection,
    databaseName: string
  ): Promise<Set<string>> {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT kcu.TABLE_SCHEMA, kcu.TABLE_NAME, kcu.COLUMN_NAME
       FROM information_schema.TABLE_CONSTRAINTS tc
       JOIN information_schema.KEY_COLUMN_USAGE kcu
         ON tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
         AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
       WHERE tc.TABLE_SCHEMA = ? AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'`,
      [databaseName]
    );
    const set = new Set<string>();
    for (const row of Array.isArray(rows) ? rows : []) {
      set.add(`${row.TABLE_SCHEMA}.${row.TABLE_NAME}.${row.COLUMN_NAME}`);
    }
    return set;
  }

  /**
   * Fetches foreign key column to referenced table.column.
   * @param conn Active MySQL connection.
   * @returns Map from "schema.table.column" to { refTable, refColumn }.
   */
  private async fetchForeignKeyMap(
    conn: mysql.Connection,
    databaseName: string
  ): Promise<Map<string, { refTable: string; refColumn: string }>> {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT
         kcu.TABLE_SCHEMA,
         kcu.TABLE_NAME,
         kcu.COLUMN_NAME,
         kcu.REFERENCED_TABLE_SCHEMA,
         kcu.REFERENCED_TABLE_NAME,
         kcu.REFERENCED_COLUMN_NAME
       FROM information_schema.REFERENTIAL_CONSTRAINTS rc
       JOIN information_schema.KEY_COLUMN_USAGE kcu
         ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
         AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
       WHERE kcu.TABLE_SCHEMA = ? AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`,
      [databaseName]
    );
    const map = new Map<string, { refTable: string; refColumn: string }>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const refTable =
        row.REFERENCED_TABLE_SCHEMA === databaseName
          ? row.REFERENCED_TABLE_NAME
          : `${row.REFERENCED_TABLE_SCHEMA}.${row.REFERENCED_TABLE_NAME}`;
      map.set(`${row.TABLE_SCHEMA}.${row.TABLE_NAME}.${row.COLUMN_NAME}`, {
        refTable,
        refColumn: row.REFERENCED_COLUMN_NAME,
      });
    }
    return map;
  }

  /**
   * Lists views from information_schema.VIEWS for the connected database.
   * @param conn Active MySQL connection.
   * @returns List of { TABLE_SCHEMA, TABLE_NAME }.
   */
  private async fetchViewList(
    conn: mysql.Connection,
    databaseName: string
  ): Promise<{ TABLE_SCHEMA: string; TABLE_NAME: string }[]> {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT TABLE_SCHEMA, TABLE_NAME
       FROM information_schema.VIEWS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_SCHEMA, TABLE_NAME`,
      [databaseName]
    );
    return (Array.isArray(rows) ? rows : []) as { TABLE_SCHEMA: string; TABLE_NAME: string }[];
  }

  /**
   * Fetches column metadata for views from information_schema.COLUMNS.
   * @param conn Active MySQL connection.
   * @returns List of column rows for views.
   */
  private async fetchColumnRowsForViews(
    conn: mysql.Connection,
    databaseName: string
  ): Promise<ColumnRow[]> {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, ORDINAL_POSITION, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (
         SELECT TABLE_NAME FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?
       )
       ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`,
      [databaseName, databaseName]
    );
    return (Array.isArray(rows) ? rows : []) as ColumnRow[];
  }

  /**
   * Returns view definition from information_schema.VIEWS.
   * @param conn Active MySQL connection.
   * @param schemaName Schema (database) of the view.
   * @param viewName Name of the view.
   * @returns Definition text, or empty string if not found.
   */
  private async getViewDefinition(
    conn: mysql.Connection,
    schemaName: string,
    viewName: string
  ): Promise<string> {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT VIEW_DEFINITION FROM information_schema.VIEWS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [schemaName, viewName]
    );
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    return (row?.VIEW_DEFINITION as string) ?? "";
  }

  /**
   * Lists stored procedures from information_schema.ROUTINES.
   * @param conn Active MySQL connection.
   * @returns List of { ROUTINE_SCHEMA, ROUTINE_NAME, SPECIFIC_NAME, ROUTINE_DEFINITION }.
   */
  private async fetchProcedureList(
    conn: mysql.Connection,
    databaseName: string
  ): Promise<
    { ROUTINE_SCHEMA: string; ROUTINE_NAME: string; SPECIFIC_NAME: string; ROUTINE_DEFINITION: string | null }[]
  > {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT ROUTINE_SCHEMA, ROUTINE_NAME, SPECIFIC_NAME, ROUTINE_DEFINITION
       FROM information_schema.ROUTINES
       WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'
       ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME`,
      [databaseName]
    );
    return (Array.isArray(rows) ? rows : []) as {
      ROUTINE_SCHEMA: string;
      ROUTINE_NAME: string;
      SPECIFIC_NAME: string;
      ROUTINE_DEFINITION: string | null;
    }[];
  }

  /**
   * Lists functions from information_schema.ROUTINES.
   * @param conn Active MySQL connection.
   * @returns List of { ROUTINE_SCHEMA, ROUTINE_NAME, SPECIFIC_NAME, ROUTINE_DEFINITION }.
   */
  private async fetchFunctionList(
    conn: mysql.Connection,
    databaseName: string
  ): Promise<
    { ROUTINE_SCHEMA: string; ROUTINE_NAME: string; SPECIFIC_NAME: string; ROUTINE_DEFINITION: string | null }[]
  > {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT ROUTINE_SCHEMA, ROUTINE_NAME, SPECIFIC_NAME, ROUTINE_DEFINITION
       FROM information_schema.ROUTINES
       WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'FUNCTION'
       ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME`,
      [databaseName]
    );
    return (Array.isArray(rows) ? rows : []) as {
      ROUTINE_SCHEMA: string;
      ROUTINE_NAME: string;
      SPECIFIC_NAME: string;
      ROUTINE_DEFINITION: string | null;
    }[];
  }

  /**
   * Returns parameter metadata for a routine from information_schema.PARAMETERS.
   * @param conn Active MySQL connection.
   * @param schemaName Schema of the routine.
   * @param specificName Specific name of the routine.
   * @returns Array of parameter metadata (name, dataType, direction).
   */
  private async getRoutineParameters(
    conn: mysql.Connection,
    schemaName: string,
    specificName: string
  ): Promise<SpParameterMeta[]> {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT PARAMETER_NAME, DATA_TYPE, PARAMETER_MODE
       FROM information_schema.PARAMETERS
       WHERE SPECIFIC_SCHEMA = ? AND SPECIFIC_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [schemaName, specificName]
    );
    const dirMap: Record<string, "IN" | "OUT" | "INOUT"> = {
      IN: "IN",
      OUT: "OUT",
      INOUT: "INOUT",
    };
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      name: row.PARAMETER_NAME ?? "",
      dataType: row.DATA_TYPE ?? "",
      direction: dirMap[row.PARAMETER_MODE as string] ?? "IN",
    }));
  }

  /**
   * Groups column rows by "schema.table" key.
   * @param rows Flat list of column rows.
   * @returns Map from "schema.table" to array of column rows.
   */
  private groupColumnsByTableKey(rows: ColumnRow[]): Map<string, ColumnRow[]> {
    const map = new Map<string, ColumnRow[]>();
    for (const col of rows) {
      const key = `${col.TABLE_SCHEMA}.${col.TABLE_NAME}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(col);
    }
    return map;
  }
}
