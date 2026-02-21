import { StoredProcedureMeta, SpParameterMeta } from "../shared/types";

/**
 * Parses stored procedure DDL to extract parameter lists.
 * Supports T-SQL (@param type [OUTPUT]) and parenthesized (param type, ...) forms.
 */
export class SpParser {
  /**
   * Build StoredProcedureMeta from name, schema, and definition text.
   * Parameters are parsed from the definition when not provided by the DB.
   */
  parse(name: string, schema: string, ddl: string): StoredProcedureMeta {
    const parameters = this.extractParameters(ddl);
    return {
      schema,
      name,
      definition: ddl,
      parameters,
    };
  }

  /**
   * Extract parameter list from procedure DDL.
   * T-SQL: @paramName type [OUTPUT] before AS.
   * Other: ( param type, ... ) after procedure name.
   */
  extractParameters(ddl: string): SpParameterMeta[] {
    if (!ddl || !ddl.trim()) return [];

    const normalized = ddl.trim();
    const tsqlParams = this.extractTsqlParameters(normalized);
    if (tsqlParams.length > 0) return tsqlParams;

    const parenParams = this.extractParenParameters(normalized);
    return parenParams;
  }

  /** T-SQL: CREATE PROC ... @p1 type, @p2 type OUTPUT, ... AS */
  private extractTsqlParameters(ddl: string): SpParameterMeta[] {
    const asIndex = ddl.toUpperCase().indexOf(" AS ");
    const head = asIndex >= 0 ? ddl.slice(0, asIndex) : ddl;
    const params: SpParameterMeta[] = [];
    const paramBlock = head.replace(/^[\s\S]*?(?=@\w)/i, "").trim();
    if (!paramBlock) return params;

    const parts = this.splitTopLevel(paramBlock, ",");
    for (const part of parts) {
      const t = part.trim();
      const m = t.match(/^@(\w+)\s+(.+)$/s);
      if (m) {
        let typeAndDir = m[2].trim();
        const isOutput = typeAndDir.toUpperCase().endsWith(" OUTPUT");
        if (isOutput) typeAndDir = typeAndDir.slice(0, -7).trim();
        params.push({
          name: m[1],
          dataType: typeAndDir,
          direction: isOutput ? "OUT" : "IN",
        });
      }
    }
    return params;
  }

  /** Parenthesized form: ( param1 type, param2 type, ... ) */
  private extractParenParameters(ddl: string): SpParameterMeta[] {
    const openParen = ddl.indexOf("(");
    if (openParen < 0) return [];
    const closeParen = this.findMatchingParen(ddl, openParen);
    if (closeParen < 0) return [];
    const inner = ddl.slice(openParen + 1, closeParen).trim();
    if (!inner) return [];

    const params: SpParameterMeta[] = [];
    const parts = this.splitTopLevel(inner, ",");
    for (const part of parts) {
      const t = part.trim();
      if (!t) continue;
      // "param type" or "param type direction" or "IN param type"
      const m = t.match(/^(?:IN\s+|OUT\s+|INOUT\s+)?(\w+)\s+(.+?)\s*$/is);
      if (m) {
        const name = m[1];
        const rest = m[2].trim();
        let direction: SpParameterMeta["direction"] = "IN";
        const upper = rest.toUpperCase();
        if (upper.endsWith(" OUT") || upper.endsWith(" OUTPUT")) {
          direction = "OUT";
        } else if (upper.endsWith(" INOUT")) {
          direction = "INOUT";
        }
        const dataType = rest.replace(/\s+(OUT|OUTPUT|INOUT)$/i, "").trim();
        params.push({ name, dataType, direction });
      }
    }
    return params;
  }

  /** Split by comma only at top level (ignore commas inside parentheses). */
  private splitTopLevel(str: string, sep: string): string[] {
    const result: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (depth === 0 && str.slice(i, i + sep.length) === sep) {
        result.push(str.slice(start, i));
        start = i + sep.length;
      }
    }
    result.push(str.slice(start));
    return result;
  }

  private findMatchingParen(str: string, openIndex: number): number {
    let depth = 1;
    for (let i = openIndex + 1; i < str.length; i++) {
      const c = str[i];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }
}
