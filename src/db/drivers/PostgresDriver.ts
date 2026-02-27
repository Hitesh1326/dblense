import { Client, ClientConfig } from "pg";
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

/** Row shape for table/view columns from information_schema.columns. */
interface ColumnRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  ordinal_position: number;
}

/** Context passed through crawl phases: client, reporting, and abort check. */
interface CrawlContext {
  client: Client;
  connectionId: string;
  report: (phase: CrawlProgress["phase"], current: number, total: number, currentObject?: string) => void;
  throwIfAborted: () => void;
}

/**
 * PostgreSQL driver using the `pg` package.
 * Each operation creates its own connection and closes it when done.
 * Uses information_schema and pg_catalog for metadata; dynamic values are parameterized.
 */
export class PostgresDriver {
  /**
   * Builds client config from connection config and secret password.
   * @param config Connection config (host, port, database, username, useSsl).
   * @param password Secret password from VS Code SecretStorage.
   * @returns pg Client config.
   */
  private getClientConfig(config: DbConnectionConfig, password: string): ClientConfig {
    return {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password,
      ssl: config.useSsl ? { rejectUnauthorized: false } : false,
    };
  }

  /**
   * Crawls the database schema: tables (with columns, PKs, FKs), views, stored procedures, and functions.
   * Reports progress via onProgress and respects signal for cancellation.
   * @param config Connection config (id, database name, etc.).
   * @param password Secret password from VS Code SecretStorage.
   * @param onProgress Optional callback for progress (phase, current, total, currentObject).
   * @param signal Optional AbortSignal to cancel the crawl.
   * @returns Full database schema; client is closed before returning.
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
    const clientConfig = this.getClientConfig(config, password);
    const client = new Client(clientConfig);
    await client.connect();

    try {
      const ctx: CrawlContext = { client, connectionId, report, throwIfAborted };

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
      await client.end();
    }
  }

  /**
   * Tests connectivity by running a simple query.
   * @param config Connection config.
   * @param password Secret password from VS Code SecretStorage.
   * @returns True if the query succeeds; client is closed before returning.
   */
  async testConnection(config: DbConnectionConfig, password: string): Promise<boolean> {
    const client = new Client(this.getClientConfig(config, password));
    try {
      await client.connect();
      const result = await client.query("SELECT 1 AS n");
      return (result.rowCount ?? 0) === 1;
    } finally {
      await client.end();
    }
  }

  /**
   * Fetches table and column metadata, primary keys, and foreign keys; builds TableMeta list.
   * @param ctx Crawl context (client, report, throwIfAborted).
   * @returns Array of table metadata with columns, PKs, and FKs.
   */
  private async crawlTables(ctx: CrawlContext): Promise<TableMeta[]> {
    const { client, report, throwIfAborted } = ctx;

    const tableList = await this.fetchTableList(client);
    const columnsList = await this.fetchColumnRowsForTables(client);
    const pkSet = await this.fetchPrimaryKeySet(client);
    const fkMap = await this.fetchForeignKeyMap(client);

    const columnsByTable = this.groupColumnsByTableKey(columnsList);
    const totalTables = tableList.length;
    const tables: TableMeta[] = [];

    for (let i = 0; i < totalTables; i++) {
      throwIfAborted();
      const t = tableList[i];
      const key = `${t.table_schema}.${t.table_name}`;
      report("crawling_tables", i + 1, totalTables, `${t.table_schema}.${t.table_name}`);

      const cols = columnsByTable.get(key) ?? [];
      const columnMetas: ColumnMeta[] = cols.map((c) => {
        const colKey = `${key}.${c.column_name}`;
        const fk = fkMap.get(colKey);
        return {
          name: c.column_name,
          dataType: c.data_type,
          nullable: c.is_nullable === "YES",
          isPrimaryKey: pkSet.has(colKey),
          isForeignKey: !!fk,
          referencedTable: fk?.refTable,
          referencedColumn: fk?.refColumn,
        };
      });

      tables.push({
        schema: t.table_schema,
        name: t.table_name,
        columns: columnMetas,
      });
    }

    return tables;
  }

  /**
   * Fetches view list, column metadata, and definitions; builds ViewMeta list.
   * @param ctx Crawl context (client, report, throwIfAborted).
   * @returns Array of view metadata with columns and definition.
   */
  private async crawlViews(ctx: CrawlContext): Promise<ViewMeta[]> {
    const { client, report, throwIfAborted } = ctx;

    const viewList = await this.fetchViewList(client);
    const viewColumnsList = await this.fetchColumnRowsForViews(client);
    const viewColumnsByView = this.groupColumnsByTableKey(viewColumnsList);
    const totalViews = viewList.length;
    const views: ViewMeta[] = [];

    for (let i = 0; i < totalViews; i++) {
      throwIfAborted();
      const v = viewList[i];
      const key = `${v.table_schema}.${v.table_name}`;
      report("crawling_views", i + 1, totalViews, `${v.table_schema}.${v.table_name}`);

      const definition = await this.getViewDefinition(client, v.table_schema, v.table_name);
      const cols = viewColumnsByView.get(key) ?? [];
      const columnMetas: ColumnMeta[] = cols.map((c) => ({
        name: c.column_name,
        dataType: c.data_type,
        nullable: c.is_nullable === "YES",
        isPrimaryKey: false,
        isForeignKey: false,
      }));

      views.push({
        schema: v.table_schema,
        name: v.table_name,
        columns: columnMetas,
        definition,
      });
    }

    return views;
  }

  /**
   * Fetches stored procedure list, then for each: definition and parameters; builds StoredProcedureMeta list.
   * @param ctx Crawl context (client, report, throwIfAborted).
   * @returns Array of stored procedure metadata.
   */
  private async crawlStoredProcedures(ctx: CrawlContext): Promise<StoredProcedureMeta[]> {
    const { client, report, throwIfAborted } = ctx;

    const procList = await this.fetchProcedureList(client);
    const totalProcs = procList.length;
    const storedProcedures: StoredProcedureMeta[] = [];

    for (let i = 0; i < totalProcs; i++) {
      throwIfAborted();
      const p = procList[i];
      report("crawling_sps", i + 1, totalProcs, `${p.routine_schema}.${p.routine_name}`);

      const definition = await this.getRoutineDefinition(client, p.routine_schema, p.routine_name, "PROCEDURE");
      const parameters = await this.getRoutineParameters(client, p.routine_schema, p.specific_name);

      storedProcedures.push({
        schema: p.routine_schema,
        name: p.routine_name,
        definition,
        parameters,
      });
    }

    return storedProcedures;
  }

  /**
   * Fetches function list, then for each: definition and parameters; builds FunctionMeta list.
   * @param ctx Crawl context (client, report, throwIfAborted).
   * @returns Array of function metadata.
   */
  private async crawlFunctions(ctx: CrawlContext): Promise<FunctionMeta[]> {
    const { client, report, throwIfAborted } = ctx;

    const funcList = await this.fetchFunctionList(client);
    const totalFuncs = funcList.length;
    const functions: FunctionMeta[] = [];

    for (let i = 0; i < totalFuncs; i++) {
      throwIfAborted();
      const f = funcList[i];
      report("crawling_functions", i + 1, totalFuncs, `${f.routine_schema}.${f.routine_name}`);

      const definition = await this.getRoutineDefinition(client, f.routine_schema, f.routine_name, "FUNCTION");
      const parameters = await this.getRoutineParameters(client, f.routine_schema, f.specific_name);

      functions.push({
        schema: f.routine_schema,
        name: f.routine_name,
        definition,
        parameters,
      });
    }

    return functions;
  }

  /**
   * Lists base tables from information_schema (excludes system schemas).
   * @param client Connected pg Client.
   * @returns List of { table_schema, table_name }.
   */
  private async fetchTableList(
    client: Client
  ): Promise<{ table_schema: string; table_name: string }[]> {
    const result = await client.query<{ table_schema: string; table_name: string }>(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `);
    return result.rows ?? [];
  }

  /**
   * Fetches column metadata for base tables from information_schema.columns.
   * @param client Connected pg Client.
   * @returns List of column rows for tables.
   */
  private async fetchColumnRowsForTables(client: Client): Promise<ColumnRow[]> {
    const result = await client.query<ColumnRow>(`
      SELECT table_schema, table_name, column_name, data_type, is_nullable, ordinal_position
      FROM information_schema.columns c
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND EXISTS (
          SELECT 1 FROM information_schema.tables t
          WHERE t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        )
      ORDER BY table_schema, table_name, ordinal_position
    `);
    return result.rows ?? [];
  }

  /**
   * Fetches primary key column keys (schema.table.column).
   * @param client Connected pg Client.
   * @returns Set of "schema.table.column" keys for PK columns.
   */
  private async fetchPrimaryKeySet(client: Client): Promise<Set<string>> {
    const result = await client.query<{ table_schema: string; table_name: string; column_name: string }>(`
      SELECT kcu.table_schema, kcu.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_schema = kcu.constraint_schema
        AND tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
    `);
    const set = new Set<string>();
    for (const row of result.rows ?? []) {
      set.add(`${row.table_schema}.${row.table_name}.${row.column_name}`);
    }
    return set;
  }

  /**
   * Fetches foreign key column to referenced table.column.
   * @param client Connected pg Client.
   * @returns Map from "schema.table.column" to { refTable, refColumn } (refTable may be schema.column for display).
   */
  private async fetchForeignKeyMap(
    client: Client
  ): Promise<Map<string, { refTable: string; refColumn: string }>> {
    const result = await client.query<{
      table_schema: string;
      table_name: string;
      column_name: string;
      referenced_table_schema: string;
      referenced_table_name: string;
      referenced_column_name: string;
    }>(`
      SELECT
        kcu.table_schema,
        kcu.table_name,
        kcu.column_name,
        ccu.table_schema AS referenced_table_schema,
        ccu.table_name AS referenced_table_name,
        ccu.column_name AS referenced_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_schema = kcu.constraint_schema AND tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_schema = ccu.constraint_schema AND tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
    `);
    const map = new Map<string, { refTable: string; refColumn: string }>();
    for (const row of result.rows ?? []) {
      const refTable =
        row.referenced_table_schema === "public"
          ? row.referenced_table_name
          : `${row.referenced_table_schema}.${row.referenced_table_name}`;
      map.set(`${row.table_schema}.${row.table_name}.${row.column_name}`, {
        refTable,
        refColumn: row.referenced_column_name,
      });
    }
    return map;
  }

  /**
   * Lists views from information_schema.views.
   * @param client Connected pg Client.
   * @returns List of { table_schema, table_name }.
   */
  private async fetchViewList(
    client: Client
  ): Promise<{ table_schema: string; table_name: string }[]> {
    const result = await client.query<{ table_schema: string; table_name: string }>(`
      SELECT table_schema, table_name
      FROM information_schema.views
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);
    return result.rows ?? [];
  }

  /**
   * Fetches column metadata for views from information_schema.columns.
   * @param client Connected pg Client.
   * @returns List of column rows for views.
   */
  private async fetchColumnRowsForViews(client: Client): Promise<ColumnRow[]> {
    const result = await client.query<ColumnRow>(`
      SELECT table_schema, table_name, column_name, data_type, is_nullable, ordinal_position
      FROM information_schema.columns c
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND EXISTS (
          SELECT 1 FROM information_schema.views v
          WHERE v.table_schema = c.table_schema AND v.table_name = c.table_name
        )
      ORDER BY table_schema, table_name, ordinal_position
    `);
    return result.rows ?? [];
  }

  /**
   * Returns view definition from pg_views.
   * @param client Connected pg Client.
   * @param schemaName Schema of the view.
   * @param viewName Name of the view.
   * @returns Definition text, or empty string if not found.
   */
  private async getViewDefinition(
    client: Client,
    schemaName: string,
    viewName: string
  ): Promise<string> {
    const result = await client.query<{ definition: string | null }>(
      `SELECT definition FROM pg_views WHERE schemaname = $1 AND viewname = $2`,
      [schemaName, viewName]
    );
    return result.rows?.[0]?.definition ?? "";
  }

  /**
   * Lists stored procedures from information_schema.routines.
   * @param client Connected pg Client.
   * @returns List of { routine_schema, routine_name, specific_name }.
   */
  private async fetchProcedureList(
    client: Client
  ): Promise<{ routine_schema: string; routine_name: string; specific_name: string }[]> {
    const result = await client.query<{
      routine_schema: string;
      routine_name: string;
      specific_name: string;
    }>(`
      SELECT routine_schema, routine_name, specific_name
      FROM information_schema.routines
      WHERE routine_schema NOT IN ('pg_catalog', 'information_schema')
        AND routine_type = 'PROCEDURE'
      ORDER BY routine_schema, routine_name
    `);
    return result.rows ?? [];
  }

  /**
   * Lists functions from information_schema.routines (excluding aggregates/window).
   * @param client Connected pg Client.
   * @returns List of { routine_schema, routine_name, specific_name }.
   */
  private async fetchFunctionList(
    client: Client
  ): Promise<{ routine_schema: string; routine_name: string; specific_name: string }[]> {
    const result = await client.query<{
      routine_schema: string;
      routine_name: string;
      specific_name: string;
    }>(`
      SELECT routine_schema, routine_name, specific_name
      FROM information_schema.routines
      WHERE routine_schema NOT IN ('pg_catalog', 'information_schema')
        AND routine_type = 'FUNCTION'
      ORDER BY routine_schema, routine_name
    `);
    return result.rows ?? [];
  }

  /**
   * Returns routine (procedure or function) definition using pg_get_functiondef.
   * @param client Connected pg Client.
   * @param schemaName Schema of the routine.
   * @param routineName Name of the routine.
   * @param routineType 'PROCEDURE' or 'FUNCTION'.
   * @returns Definition text, or empty string if not found.
   */
  private async getRoutineDefinition(
    client: Client,
    schemaName: string,
    routineName: string,
    routineType: "PROCEDURE" | "FUNCTION"
  ): Promise<string> {
    const result = await client.query<{ definition: string | null }>(
      `
      SELECT pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = $1 AND p.proname = $2 AND p.prokind = $3
      LIMIT 1
      `,
      [schemaName, routineName, routineType === "PROCEDURE" ? "p" : "f"]
    );
    return result.rows?.[0]?.definition ?? "";
  }

  /**
   * Returns parameter metadata for a routine from information_schema.parameters.
   * @param client Connected pg Client.
   * @param schemaName Schema of the routine.
   * @param specificName Specific name of the routine (for overloads).
   * @returns Array of parameter metadata (name, dataType, direction).
   */
  private async getRoutineParameters(
    client: Client,
    schemaName: string,
    specificName: string
  ): Promise<SpParameterMeta[]> {
    const result = await client.query<{
      parameter_name: string;
      data_type: string;
      parameter_mode: string | null;
    }>(
      `
      SELECT parameter_name, data_type, parameter_mode
      FROM information_schema.parameters
      WHERE specific_schema = $1 AND specific_name = $2
      ORDER BY ordinal_position
      `,
      [schemaName, specificName]
    );
    const dirMap: Record<string, "IN" | "OUT" | "INOUT"> = {
      IN: "IN",
      OUT: "OUT",
      INOUT: "INOUT",
    };
    return (result.rows ?? []).map((row) => ({
      name: row.parameter_name,
      dataType: row.data_type,
      direction: dirMap[row.parameter_mode?.toUpperCase() ?? "IN"] ?? "IN",
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
      const key = `${col.table_schema}.${col.table_name}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(col);
    }
    return map;
  }
}
