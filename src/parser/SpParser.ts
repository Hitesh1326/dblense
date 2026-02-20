import { StoredProcedureMeta, SpParameterMeta } from "../shared/types";

/**
 * Parses stored procedure DDL using node-sql-parser to extract
 * parameter lists and structural metadata.
 */
export class SpParser {
  parse(name: string, schema: string, ddl: string): StoredProcedureMeta {
    // TODO: use node-sql-parser to extract parameters and structure
    return {
      schema,
      name,
      definition: ddl,
      parameters: [],
    };
  }

  extractParameters(ddl: string): SpParameterMeta[] {
    // TODO: parse parameter block from DDL
    return [];
  }
}
