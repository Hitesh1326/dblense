import * as sql from "mssql";
import {
  DbConnectionConfig,
  DatabaseSchema,
  TableMeta,
  ColumnMeta,
  StoredProcedureMeta,
  SpParameterMeta,
  CrawlProgressCallback,
  CrawlProgress,
} from "../../shared/types";

/**
 * Driver for Microsoft SQL Server via the `mssql` package.
 * Each operation (crawlSchema, testConnection) creates its own connection and closes it when done.
 */
export class MssqlDriver {
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

  async crawlSchema(
    config: DbConnectionConfig,
    password: string,
    onProgress?: CrawlProgressCallback
  ): Promise<DatabaseSchema> {
    const connectionId = config.id;
    const report = (phase: CrawlProgress["phase"], current: number, total: number, currentObject?: string) => {
      onProgress?.({
        connectionId,
        phase,
        current,
        total,
        currentObject,
      });
    };

    report("connecting", 0, 1);

    const pool = await sql.connect(this.getPoolConfig(config, password));

    try {
      const tables: TableMeta[] = [];
      const storedProcedures: StoredProcedureMeta[] = [];

      // ─── Tables + columns ─────────────────────────────────────────────────
      const tablesResult = await pool
        .request()
        .query<{ schema_name: string; table_name: string; object_id: number }>(`
        SELECT s.name AS schema_name, t.name AS table_name, t.object_id
        FROM sys.tables t
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        ORDER BY s.name, t.name
      `);
      const tableList = tablesResult.recordset ?? [];

      const columnsResult = await pool
        .request()
        .query<{
          object_id: number;
          column_name: string;
          type_name: string;
          is_nullable: boolean;
          column_id: number;
        }>(`
        SELECT c.object_id, c.name AS column_name, ty.name AS type_name, c.is_nullable, c.column_id
        FROM sys.columns c
        INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
        WHERE c.object_id IN (SELECT object_id FROM sys.tables)
        ORDER BY c.object_id, c.column_id
      `);
      type ColumnRow = {
        object_id: number;
        column_name: string;
        type_name: string;
        is_nullable: boolean;
        column_id: number;
      };
      const columnsList: ColumnRow[] = columnsResult.recordset
        ? Array.from(columnsResult.recordset)
        : [];

      const pkResult = await pool
        .request()
        .query<{ object_id: number; column_name: string }>(`
        SELECT ic.object_id, c.name AS column_name
        FROM sys.index_columns ic
        INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        INNER JOIN sys.key_constraints k ON i.object_id = k.parent_object_id AND i.index_id = k.unique_index_id AND k.type = 'PK'
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      `);
      const pkSet = new Set<string>();
      for (const row of pkResult.recordset ?? []) {
        pkSet.add(`${row.object_id}.${row.column_name}`);
      }

      const fkResult = await pool
        .request()
        .query<{
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
      const fkMap = new Map<string, { refTable: string; refColumn: string }>();
      for (const row of fkResult.recordset ?? []) {
        fkMap.set(`${row.parent_object_id}.${row.parent_column_name}`, {
          refTable: row.referenced_table_name,
          refColumn: row.referenced_column_name,
        });
      }

      const columnsByTable = new Map<number, ColumnRow[]>();
      for (const col of columnsList) {
        if (!columnsByTable.has(col.object_id)) {
          columnsByTable.set(col.object_id, []);
        }
        columnsByTable.get(col.object_id)!.push(col);
      }

      const totalTables = tableList.length;
      for (let i = 0; i < totalTables; i++) {
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

      // ─── Stored procedures ─────────────────────────────────────────────────
      const procsResult = await pool
        .request()
        .query<{ object_id: number; schema_name: string; procedure_name: string }>(`
        SELECT p.object_id, s.name AS schema_name, p.name AS procedure_name
        FROM sys.procedures p
        INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
        ORDER BY s.name, p.name
      `);
      const procList = procsResult.recordset ?? [];
      const totalProcs = procList.length;

      for (let i = 0; i < totalProcs; i++) {
        const p = procList[i];
        report("crawling_sps", i + 1, totalProcs, `${p.schema_name}.${p.procedure_name}`);

        const defResult = await pool
          .request()
          .input("obj_id", sql.Int, p.object_id)
          .query<{ definition: string | null }>("SELECT OBJECT_DEFINITION(@obj_id) AS definition");
        const definition = defResult.recordset?.[0]?.definition ?? "";

        const paramsResult = await pool
          .request()
          .input("obj_id", sql.Int, p.object_id)
          .query<{ name: string; type_name: string; is_output: boolean }>(`
          SELECT pr.name, ty.name AS type_name, pr.is_output
          FROM sys.parameters pr
          INNER JOIN sys.types ty ON pr.user_type_id = ty.user_type_id
          WHERE pr.object_id = @obj_id AND pr.parameter_id > 0
          ORDER BY pr.parameter_id
        `);
        const parameters: SpParameterMeta[] = (paramsResult.recordset ?? []).map((row) => ({
          name: row.name,
          dataType: row.type_name,
          direction: row.is_output ? "OUT" : "IN",
        }));

        storedProcedures.push({
          schema: p.schema_name,
          name: p.procedure_name,
          definition,
          parameters,
        });
      }

      return {
        connectionId,
        databaseName: config.database,
        tables,
        storedProcedures,
        crawledAt: new Date().toISOString(),
      };
    } finally {
      await pool.close();
    }
  }

  async testConnection(config: DbConnectionConfig, password: string): Promise<boolean> {
    const pool = await sql.connect(this.getPoolConfig(config, password));
    try {
      const result = await pool.request().query("SELECT 1 AS n");
      return result.recordset?.length === 1;
    } finally {
      await pool.close();
    }
  }
}
