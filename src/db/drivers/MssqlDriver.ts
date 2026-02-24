import * as sql from "mssql";
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

/** Row shape returned by sys.columns + sys.types for tables or views. */
interface ColumnRow {
  object_id: number;
  column_name: string;
  type_name: string;
  is_nullable: boolean;
  column_id: number;
}

/** Context passed through crawl phases: shared pool, reporting, and abort check. */
interface CrawlContext {
  pool: sql.ConnectionPool;
  connectionId: string;
  report: (phase: CrawlProgress["phase"], current: number, total: number, currentObject?: string) => void;
  throwIfAborted: () => void;
}

/**
 * Microsoft SQL Server driver using the `mssql` package.
 * Each operation opens its own connection and closes it when done.
 * All dynamic values are passed via parameterized queries (e.g. object_id); no string concatenation into SQL.
 */
export class MssqlDriver {
  /**
   * Builds connection pool config from connection config and secret password.
   * Password is never logged or embedded in SQL.
   * @param config Connection config (host, port, database, username, useSsl).
   * @param password Secret password from VS Code SecretStorage.
   * @returns mssql pool config object.
   */
  private getPoolConfig(config: DbConnectionConfig, password: string): sql.config {
    return {
      server: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password,
      options: { encrypt: config.useSsl, trustServerCertificate: true },
    };
  }

  /**
   * Crawls the database schema: tables (with columns, PKs, FKs), views, stored procedures, and functions.
   * Reports progress via onProgress and respects signal for cancellation.
   * @param config Connection config (id, database name, etc.).
   * @param password Secret password from VS Code SecretStorage.
   * @param onProgress Optional callback for progress (phase, current, total, currentObject).
   * @param signal Optional AbortSignal to cancel the crawl.
   * @returns Full database schema; pool is closed before returning.
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
    const pool = await sql.connect(this.getPoolConfig(config, password));

    try {
      const ctx: CrawlContext = { pool, connectionId, report, throwIfAborted };

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
      await pool.close();
    }
  }

  /**
   * Tests connectivity by running a simple query.
   * @param config Connection config.
   * @param password Secret password from VS Code SecretStorage.
   * @returns True if the query succeeds; pool is closed before returning.
   */
  async testConnection(config: DbConnectionConfig, password: string): Promise<boolean> {
    const pool = await sql.connect(this.getPoolConfig(config, password));
    try {
      const result = await pool.request().query("SELECT 1 AS n");
      return result.recordset?.length === 1;
    } finally {
      await pool.close();
    }
  }

  /**
   * Fetches table and column metadata, primary keys, and foreign keys, then builds TableMeta list.
   * @param ctx Crawl context (pool, report, throwIfAborted).
   * @returns Array of table metadata with columns, PKs, and FKs.
   */
  private async crawlTables(ctx: CrawlContext): Promise<TableMeta[]> {
    const { pool, report, throwIfAborted } = ctx;

    const tableList = await this.fetchTableList(pool);
    const columnsList = await this.fetchColumnRowsForTables(pool);
    const pkSet = await this.fetchPrimaryKeySet(pool);
    const fkMap = await this.fetchForeignKeyMap(pool);

    const columnsByTable = this.groupColumnsByObjectId(columnsList);
    const totalTables = tableList.length;
    const tables: TableMeta[] = [];

    for (let i = 0; i < totalTables; i++) {
      throwIfAborted();
      const t = tableList[i];
      report("crawling_tables", i + 1, totalTables, `${t.schema_name}.${t.table_name}`);

      const cols = columnsByTable.get(t.object_id) ?? [];
      const columnMetas: ColumnMeta[] = cols.map((c) => {
        const pkKey = `${t.object_id}.${c.column_name}`;
        const fk = fkMap.get(pkKey);
        return {
          name: c.column_name,
          dataType: c.type_name,
          nullable: c.is_nullable,
          isPrimaryKey: pkSet.has(pkKey),
          isForeignKey: !!fk,
          referencedTable: fk?.refTable,
          referencedColumn: fk?.refColumn,
        };
      });

      tables.push({
        schema: t.schema_name,
        name: t.table_name,
        columns: columnMetas,
      });
    }

    return tables;
  }

  /**
   * Fetches view list, column metadata, and definitions; builds ViewMeta list.
   * @param ctx Crawl context (pool, report, throwIfAborted).
   * @returns Array of view metadata with columns and definition.
   */
  private async crawlViews(ctx: CrawlContext): Promise<ViewMeta[]> {
    const { pool, report, throwIfAborted } = ctx;

    const viewList = await this.fetchViewList(pool);
    const viewColumnsList = await this.fetchColumnRowsForViews(pool);
    const viewColumnsByView = this.groupColumnsByObjectId(viewColumnsList);
    const totalViews = viewList.length;
    const views: ViewMeta[] = [];

    for (let i = 0; i < totalViews; i++) {
      throwIfAborted();
      const v = viewList[i];
      report("crawling_views", i + 1, totalViews, `${v.schema_name}.${v.view_name}`);

      const definition = await this.getObjectDefinition(pool, v.object_id);
      const cols = viewColumnsByView.get(v.object_id) ?? [];
      const columnMetas: ColumnMeta[] = cols.map((c) => ({
        name: c.column_name,
        dataType: c.type_name,
        nullable: c.is_nullable,
        isPrimaryKey: false,
        isForeignKey: false,
      }));

      views.push({
        schema: v.schema_name,
        name: v.view_name,
        columns: columnMetas,
        definition,
      });
    }

    return views;
  }

  /**
   * Fetches stored procedure list, then for each: definition and parameters; builds StoredProcedureMeta list.
   * @param ctx Crawl context (pool, report, throwIfAborted).
   * @returns Array of stored procedure metadata.
   */
  private async crawlStoredProcedures(ctx: CrawlContext): Promise<StoredProcedureMeta[]> {
    const { pool, report, throwIfAborted } = ctx;

    const procList = await this.fetchProcedureList(pool);
    const totalProcs = procList.length;
    const storedProcedures: StoredProcedureMeta[] = [];

    for (let i = 0; i < totalProcs; i++) {
      throwIfAborted();
      const p = procList[i];
      report("crawling_sps", i + 1, totalProcs, `${p.schema_name}.${p.procedure_name}`);

      const definition = await this.getObjectDefinition(pool, p.object_id);
      const parameters = await this.getParameters(pool, p.object_id);

      storedProcedures.push({
        schema: p.schema_name,
        name: p.procedure_name,
        definition,
        parameters,
      });
    }

    return storedProcedures;
  }

  /**
   * Fetches function list (FN, IF, TF), then for each: definition and parameters; builds FunctionMeta list.
   * @param ctx Crawl context (pool, report, throwIfAborted).
   * @returns Array of function metadata.
   */
  private async crawlFunctions(ctx: CrawlContext): Promise<FunctionMeta[]> {
    const { pool, report, throwIfAborted } = ctx;

    const funcList = await this.fetchFunctionList(pool);
    const totalFuncs = funcList.length;
    const functions: FunctionMeta[] = [];

    for (let i = 0; i < totalFuncs; i++) {
      throwIfAborted();
      const f = funcList[i];
      report("crawling_functions", i + 1, totalFuncs, `${f.schema_name}.${f.function_name}`);

      const definition = await this.getObjectDefinition(pool, f.object_id);
      const parameters = await this.getParameters(pool, f.object_id);

      functions.push({
        schema: f.schema_name,
        name: f.function_name,
        definition,
        parameters,
      });
    }

    return functions;
  }

  /**
   * Queries sys.tables + sys.schemas for all user tables.
   * @param pool Active connection pool.
   * @returns List of { schema_name, table_name, object_id }.
   */
  private async fetchTableList(
    pool: sql.ConnectionPool
  ): Promise<{ schema_name: string; table_name: string; object_id: number }[]> {
    const result = await pool.request().query<{ schema_name: string; table_name: string; object_id: number }>(`
      SELECT s.name AS schema_name, t.name AS table_name, t.object_id
      FROM sys.tables t
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      ORDER BY s.name, t.name
    `);
    return result.recordset ?? [];
  }

  /**
   * Queries sys.columns + sys.types for all table columns.
   * @param pool Active connection pool.
   * @returns List of column rows for tables.
   */
  private async fetchColumnRowsForTables(pool: sql.ConnectionPool): Promise<ColumnRow[]> {
    const result = await pool.request().query<ColumnRow>(`
      SELECT c.object_id, c.name AS column_name, ty.name AS type_name, c.is_nullable, c.column_id
      FROM sys.columns c
      INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
      WHERE c.object_id IN (SELECT object_id FROM sys.tables)
      ORDER BY c.object_id, c.column_id
    `);
    return result.recordset ? Array.from(result.recordset) : [];
  }

  /**
   * Queries primary key columns.
   * @param pool Active connection pool.
   * @returns Set of "object_id.column_name" keys for PK columns.
   */
  private async fetchPrimaryKeySet(pool: sql.ConnectionPool): Promise<Set<string>> {
    const result = await pool.request().query<{ object_id: number; column_name: string }>(`
      SELECT ic.object_id, c.name AS column_name
      FROM sys.index_columns ic
      INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      INNER JOIN sys.key_constraints k ON i.object_id = k.parent_object_id AND i.index_id = k.unique_index_id AND k.type = 'PK'
      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    `);
    const set = new Set<string>();
    for (const row of result.recordset ?? []) {
      set.add(`${row.object_id}.${row.column_name}`);
    }
    return set;
  }

  /**
   * Queries foreign key columns.
   * @param pool Active connection pool.
   * @returns Map from "parent_object_id.parent_column_name" to { refTable, refColumn }.
   */
  private async fetchForeignKeyMap(
    pool: sql.ConnectionPool
  ): Promise<Map<string, { refTable: string; refColumn: string }>> {
    const result = await pool.request().query<{
      parent_object_id: number;
      parent_column_name: string;
      referenced_table_name: string;
      referenced_column_name: string;
    }>(`
      SELECT
        fkc.parent_object_id,
        pc.name AS parent_column_name,
        rt.name AS referenced_table_name,
        rc.name AS referenced_column_name
      FROM sys.foreign_key_columns fkc
      INNER JOIN sys.foreign_keys fk ON fkc.constraint_object_id = fk.object_id
      INNER JOIN sys.tables rt ON fkc.referenced_object_id = rt.object_id
      INNER JOIN sys.columns pc ON fkc.parent_object_id = pc.object_id AND fkc.parent_column_id = pc.column_id
      INNER JOIN sys.columns rc ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
    `);
    const map = new Map<string, { refTable: string; refColumn: string }>();
    for (const row of result.recordset ?? []) {
      map.set(`${row.parent_object_id}.${row.parent_column_name}`, {
        refTable: row.referenced_table_name,
        refColumn: row.referenced_column_name,
      });
    }
    return map;
  }

  /**
   * Queries sys.views + sys.schemas for all views.
   * @param pool Active connection pool.
   * @returns List of { schema_name, view_name, object_id }.
   */
  private async fetchViewList(
    pool: sql.ConnectionPool
  ): Promise<{ schema_name: string; view_name: string; object_id: number }[]> {
    const result = await pool.request().query<{ schema_name: string; view_name: string; object_id: number }>(`
      SELECT s.name AS schema_name, v.name AS view_name, v.object_id
      FROM sys.views v
      INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
      ORDER BY s.name, v.name
    `);
    return result.recordset ?? [];
  }

  /**
   * Queries sys.columns + sys.types for all view columns.
   * @param pool Active connection pool.
   * @returns List of column rows for views.
   */
  private async fetchColumnRowsForViews(pool: sql.ConnectionPool): Promise<ColumnRow[]> {
    const result = await pool.request().query<ColumnRow>(`
      SELECT c.object_id, c.name AS column_name, ty.name AS type_name, c.is_nullable, c.column_id
      FROM sys.columns c
      INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
      WHERE c.object_id IN (SELECT object_id FROM sys.views)
      ORDER BY c.object_id, c.column_id
    `);
    return result.recordset ? Array.from(result.recordset) : [];
  }

  /**
   * Queries sys.procedures + sys.schemas for all stored procedures.
   * @param pool Active connection pool.
   * @returns List of { object_id, schema_name, procedure_name }.
   */
  private async fetchProcedureList(
    pool: sql.ConnectionPool
  ): Promise<{ object_id: number; schema_name: string; procedure_name: string }[]> {
    const result = await pool.request().query<{
      object_id: number;
      schema_name: string;
      procedure_name: string;
    }>(`
      SELECT p.object_id, s.name AS schema_name, p.name AS procedure_name
      FROM sys.procedures p
      INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
      ORDER BY s.name, p.name
    `);
    return result.recordset ?? [];
  }

  /**
   * Queries sys.objects for scalar/inline/table functions (FN, IF, TF).
   * @param pool Active connection pool.
   * @returns List of { object_id, schema_name, function_name }.
   */
  private async fetchFunctionList(
    pool: sql.ConnectionPool
  ): Promise<{ object_id: number; schema_name: string; function_name: string }[]> {
    const result = await pool.request().query<{
      object_id: number;
      schema_name: string;
      function_name: string;
    }>(`
      SELECT o.object_id, s.name AS schema_name, o.name AS function_name
      FROM sys.objects o
      INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE o.type IN ('FN', 'IF', 'TF')
      ORDER BY s.name, o.name
    `);
    return result.recordset ?? [];
  }

  /**
   * Returns OBJECT_DEFINITION for the given object_id. Uses parameterized query only.
   * @param pool Active connection pool.
   * @param objectId SQL Server object_id (view, procedure, or function).
   * @returns Definition text, or empty string if not available.
   */
  private async getObjectDefinition(pool: sql.ConnectionPool, objectId: number): Promise<string> {
    const result = await pool
      .request()
      .input("obj_id", sql.Int, objectId)
      .query<{ definition: string | null }>("SELECT OBJECT_DEFINITION(@obj_id) AS definition");
    return result.recordset?.[0]?.definition ?? "";
  }

  /**
   * Returns parameter metadata for a procedure or function. Uses parameterized query only.
   * @param pool Active connection pool.
   * @param objectId SQL Server object_id (procedure or function).
   * @returns Array of parameter metadata (name, dataType, direction).
   */
  private async getParameters(pool: sql.ConnectionPool, objectId: number): Promise<SpParameterMeta[]> {
    const result = await pool
      .request()
      .input("obj_id", sql.Int, objectId)
      .query<{ name: string; type_name: string; is_output: boolean }>(`
        SELECT pr.name, ty.name AS type_name, pr.is_output
        FROM sys.parameters pr
        INNER JOIN sys.types ty ON pr.user_type_id = ty.user_type_id
        WHERE pr.object_id = @obj_id AND pr.parameter_id > 0
        ORDER BY pr.parameter_id
      `);
    return (result.recordset ?? []).map((row) => ({
      name: row.name,
      dataType: row.type_name,
      direction: row.is_output ? "OUT" : "IN",
    }));
  }

  /**
   * Groups column rows by object_id for easy lookup when building table/view metadata.
   * @param rows Flat list of column rows (tables or views).
   * @returns Map from object_id to array of column rows.
   */
  private groupColumnsByObjectId(rows: ColumnRow[]): Map<number, ColumnRow[]> {
    const map = new Map<number, ColumnRow[]>();
    for (const col of rows) {
      if (!map.has(col.object_id)) {
        map.set(col.object_id, []);
      }
      map.get(col.object_id)!.push(col);
    }
    return map;
  }
}
