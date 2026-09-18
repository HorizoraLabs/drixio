import { ColumnSchema, DBAdapter } from './types.js';

export interface Dialect {
   quoteIdentifier(name: string): string;
   escapeString(val: string): string;
   buildCreateTable(tableName: string, columns: ColumnSchema[]): string;
}

export class SqliteDialect implements Dialect {
   quoteIdentifier(name: string): string {
      return `"${name}"`;
      return `"${name.replace(/"/g, '""')}"`;
   }

   escapeString(val: string): string {
      return val.replace(/'/g, "''");
   }

   buildCreateTable(tableName: string, columns: ColumnSchema[]): string {
      const pkColumns = columns.filter(
         (c) => !!(c.isPk || (c as any).primaryKey),
      );
      const isCompositePk = pkColumns.length > 1;

      const lines = columns.map((col) => {
         const isPk = !!(col.isPk || (col as any).primaryKey);
         const tLower = col.type.toLowerCase();
         let typeStr = col.type;
         if (tLower === 'integer' || tLower === 'int') typeStr = 'INTEGER';
         else if (tLower === 'text' || tLower === 'string') typeStr = 'TEXT';
         else if (tLower === 'boolean' || tLower === 'bool')
            typeStr = 'BOOLEAN';
         else if (
            tLower === 'decimal' ||
            tLower === 'numeric' ||
            tLower === 'float' ||
            tLower === 'double'
         )
            typeStr = 'REAL';
         else if (tLower === 'datetime' || tLower === 'timestamp')
            typeStr = 'DATETIME';
         else if (col.enumValues && col.enumValues.length > 0) {
            typeStr = `TEXT CHECK(${this.quoteIdentifier(col.name)} IN (${col.enumValues.map((v) => `'${this.escapeString(v)}'`).join(', ')}))`;
         }

         const hasFk = !!(
            col.fkTarget &&
            col.fkTarget.table &&
            col.fkTarget.column
         );
         if (isPk && !isCompositePk) {
            if (!hasFk && (tLower.includes('int') || typeStr === 'INTEGER')) {
               typeStr = 'INTEGER PRIMARY KEY AUTOINCREMENT';
            } else {
               typeStr += ' PRIMARY KEY';
            }
         } else {
            if (!col.nullable || (isPk && isCompositePk)) typeStr += ' NOT NULL';
            if (col.isUnique && !isPk) typeStr += ' UNIQUE';
         }

         if (
            col.defaultValue &&
            col.defaultValue !== 'AutoInc' &&
            !col.defaultValue.startsWith('FK ->')
         ) {
            const formatted = formatSqlDefaultValue(col.defaultValue);
            if (formatted !== null) {
               typeStr += ` DEFAULT ${formatted}`;
            }
         }

         return `  ${this.quoteIdentifier(col.name)} ${typeStr}`;
      });

      if (isCompositePk) {
         const pkColsQuoted = pkColumns
            .map((c) => this.quoteIdentifier(c.name))
            .join(', ');
         lines.push(`  PRIMARY KEY (${pkColsQuoted})`);
      }

      const fks = columns
         .filter(
            (col) => col.fkTarget && col.fkTarget.table && col.fkTarget.column,
         )
         .map((col) => {
            let fkStr = `  FOREIGN KEY (${this.quoteIdentifier(col.name)}) REFERENCES ${this.quoteIdentifier(col.fkTarget!.table)}(${this.quoteIdentifier(col.fkTarget!.column)})`;
            if (
               col.fkTarget!.onDelete &&
               col.fkTarget!.onDelete !== 'NO ACTION'
            ) {
               fkStr += ` ON DELETE ${col.fkTarget!.onDelete}`;
            }
            if (
               col.fkTarget!.onUpdate &&
               col.fkTarget!.onUpdate !== 'NO ACTION'
            ) {
               fkStr += ` ON UPDATE ${col.fkTarget!.onUpdate}`;
            }
            return fkStr;
         });

      if (fks.length > 0) {
         lines.push(...fks);
      }

      return `CREATE TABLE ${this.quoteIdentifier(tableName)} (\n${lines.join(',\n')}\n);`;
   }
}

export class PostgresDialect implements Dialect {
   quoteIdentifier(name: string): string {
      return `"${name.replace(/"/g, '""')}"`;
   }

   escapeString(val: string): string {
      return val.replace(/'/g, "''");
   }

   buildCreateTable(tableName: string, columns: ColumnSchema[]): string {
      const pkColumns = columns.filter(
         (c) => !!(c.isPk || (c as any).primaryKey),
      );
      const isCompositePk = pkColumns.length > 1;

      const lines = columns.map((col) => {
         const isPk = !!(col.isPk || (col as any).primaryKey);
         const tLower = col.type.toLowerCase();
         const hasFk = !!(
            col.fkTarget &&
            col.fkTarget.table &&
            col.fkTarget.column
         );
         let typeStr = col.type;
         if (
            isPk &&
            !isCompositePk &&
            !hasFk &&
            (tLower === 'integer' || tLower === 'int')
         ) {
            typeStr = 'SERIAL PRIMARY KEY';
         } else {
            if (tLower === 'integer' || tLower === 'int') typeStr = 'INTEGER';
            else if (tLower === 'text' || tLower === 'string') typeStr = 'TEXT';
            else if (tLower === 'boolean' || tLower === 'bool')
               typeStr = 'BOOLEAN';
            else if (tLower === 'decimal' || tLower === 'numeric')
               typeStr = 'NUMERIC';
            else if (tLower === 'datetime' || tLower === 'timestamp')
               typeStr = 'TIMESTAMP';
            else if (col.enumValues && col.enumValues.length > 0) {
               if (
                  col.type &&
                  ![
                     'enum',
                     'varchar',
                     'varchar(255)',
                     'text',
                     'string',
                  ].includes(tLower)
               ) {
                  typeStr = this.quoteIdentifier(col.type);
               } else {
                  typeStr = `VARCHAR(255) CHECK(${this.quoteIdentifier(col.name)} IN (${col.enumValues.map((v) => `'${this.escapeString(v)}'`).join(', ')}))`;
               }
            }

            if (isPk && !isCompositePk) typeStr += ' PRIMARY KEY';
            if (!col.nullable || (isPk && isCompositePk)) typeStr += ' NOT NULL';
            if (col.isUnique && !isPk) typeStr += ' UNIQUE';
         }

         if (
            col.defaultValue &&
            col.defaultValue !== 'AutoInc' &&
            !col.defaultValue.startsWith('FK ->')
         ) {
            const formatted = formatSqlDefaultValue(col.defaultValue);
            if (formatted !== null) {
               typeStr += ` DEFAULT ${formatted}`;
            }
         }

         return `  ${this.quoteIdentifier(col.name)} ${typeStr}`;
      });

      if (isCompositePk) {
         const pkColsQuoted = pkColumns
            .map((c) => this.quoteIdentifier(c.name))
            .join(', ');
         lines.push(`  PRIMARY KEY (${pkColsQuoted})`);
      }

      const fks = columns
         .filter(
            (col) => col.fkTarget && col.fkTarget.table && col.fkTarget.column,
         )
         .map((col) => {
            let fkStr = `  FOREIGN KEY (${this.quoteIdentifier(col.name)}) REFERENCES ${this.quoteIdentifier(col.fkTarget!.table)}(${this.quoteIdentifier(col.fkTarget!.column)})`;
            if (
               col.fkTarget!.onDelete &&
               col.fkTarget!.onDelete !== 'NO ACTION'
            ) {
               fkStr += ` ON DELETE ${col.fkTarget!.onDelete}`;
            }
            if (
               col.fkTarget!.onUpdate &&
               col.fkTarget!.onUpdate !== 'NO ACTION'
            ) {
               fkStr += ` ON UPDATE ${col.fkTarget!.onUpdate}`;
            }
            return fkStr;
         });

      if (fks.length > 0) {
         lines.push(...fks);
      }

      return `CREATE TABLE ${this.quoteIdentifier(tableName)} (\n${lines.join(',\n')}\n);`;
   }
}

export class MysqlDialect implements Dialect {
   quoteIdentifier(name: string): string {
      return `\`${name.replace(/`/g, '``')}\``;
   }

   escapeString(val: string): string {
      return val.replace(/\\/g, '\\\\').replace(/'/g, "''");
   }

   buildCreateTable(tableName: string, columns: ColumnSchema[]): string {
      const pkColumns = columns.filter(
         (c) => !!(c.isPk || (c as any).primaryKey),
      );
      const isCompositePk = pkColumns.length > 1;

      const lines = columns.map((col) => {
         const isPk = !!(col.isPk || (col as any).primaryKey);
         const tLower = col.type.toLowerCase();
         const hasFk = !!(
            col.fkTarget &&
            col.fkTarget.table &&
            col.fkTarget.column
         );
         let typeStr = col.type;
         if (tLower === 'integer' || tLower === 'int') typeStr = 'INT';
         else if (tLower === 'text' || tLower === 'string')
            typeStr = 'VARCHAR(255)';
         else if (tLower === 'boolean' || tLower === 'bool')
            typeStr = 'BOOLEAN';
         else if (tLower === 'decimal' || tLower === 'numeric')
            typeStr = 'DOUBLE';
         else if (tLower === 'datetime' || tLower === 'timestamp')
            typeStr = 'DATETIME';
         else if (col.enumValues && col.enumValues.length > 0) {
            typeStr = `ENUM(${col.enumValues.map((v) => `'${this.escapeString(v)}'`).join(', ')})`;
         }

         if (isPk && !isCompositePk) {
            if (!hasFk && (tLower.includes('int') || typeStr === 'INT')) {
               typeStr += ' AUTO_INCREMENT PRIMARY KEY';
            } else {
               typeStr += ' PRIMARY KEY';
            }
         }

         if (!col.nullable || (isPk && isCompositePk)) typeStr += ' NOT NULL';
         if (col.isUnique && !isPk) typeStr += ' UNIQUE';
         if (
            col.defaultValue &&
            col.defaultValue !== 'AutoInc' &&
            !col.defaultValue.startsWith('FK ->')
         ) {
            const formatted = formatSqlDefaultValue(col.defaultValue);
            if (formatted !== null) {
               typeStr += ` DEFAULT ${formatted}`;
            }
         }

         return `  ${this.quoteIdentifier(col.name)} ${typeStr}`;
      });

      if (isCompositePk) {
         const pkColsQuoted = pkColumns
            .map((c) => this.quoteIdentifier(c.name))
            .join(', ');
         lines.push(`  PRIMARY KEY (${pkColsQuoted})`);
      }

      const fks = columns
         .filter(
            (col) => col.fkTarget && col.fkTarget.table && col.fkTarget.column,
         )
         .map((col) => {
            let fkStr = `  FOREIGN KEY (${this.quoteIdentifier(col.name)}) REFERENCES ${this.quoteIdentifier(col.fkTarget!.table)}(${this.quoteIdentifier(col.fkTarget!.column)})`;
            if (
               col.fkTarget!.onDelete &&
               col.fkTarget!.onDelete !== 'NO ACTION'
            ) {
               fkStr += ` ON DELETE ${col.fkTarget!.onDelete}`;
            }
            if (
               col.fkTarget!.onUpdate &&
               col.fkTarget!.onUpdate !== 'NO ACTION'
            ) {
               fkStr += ` ON UPDATE ${col.fkTarget!.onUpdate}`;
            }
            return fkStr;
         });

      if (fks.length > 0) {
         lines.push(...fks);
      }

      return `CREATE TABLE ${this.quoteIdentifier(tableName)} (\n${lines.join(',\n')}\n);`;
   }
}

export function getDialect(
   type: 'sqlite' | 'postgres' | 'mysql' | 'unknown',
): Dialect {
   switch (type) {
      case 'sqlite':
         return new SqliteDialect();
      case 'postgres':
         return new PostgresDialect();
      case 'mysql':
         return new MysqlDialect();
      default:
         return new SqliteDialect();
   }
}

/**
 * Construct a SQL WHERE clause from user search input.
 * Detects explicit SQL expressions vs multi-column fuzzy text search.
 * Always treats input as a safe fuzzy search term — never passes raw SQL.
 */
export function buildSearchWhereClause(
   adapter: DBAdapter,
   dbType: string,
   columns: ColumnSchema[],
   searchInput: string,
): string {
   const searchVal = (searchInput || '').trim();
   if (!searchVal) return '';

   // 1. Explicit SQL condition
   const isSqlCondition = /[=<>]|LIKE|IN|AND|OR/i.test(searchVal);
   if (isSqlCondition) {
      return searchVal;
   }
   const dialect = getDialect(dbType as any);

   // 2. Multi-column fuzzy search
   // Multi-column fuzzy search on text-like columns
   const strCols = columns.filter((c) => {
      const t = c.type.toLowerCase();
      return (
         t.includes('char') ||
         t.includes('text') ||
         t.includes('string') ||
         t.includes('uuid')
      );
   });

   if (strCols.length > 0) {
      const likeOp = dbType === 'postgres' ? 'ILIKE' : 'LIKE';
      const escaped = dialect.escapeString(searchVal);
      const conditions = strCols.map(
         (c) => `${adapter.quoteIdentifier(c.name)} ${likeOp} '%${escaped}%'`,
      );
      return conditions.join(' OR ');
   }

   // Fallback: match first column
   if (columns.length > 0) {
      const col = columns[0];
      const escaped = dialect.escapeString(searchVal);
      return `${adapter.quoteIdentifier(col.name)} = '${escaped}'`;
   }

   return '';
}

/**
 * Format a column default value into a valid SQL DEFAULT clause fragment,
 * or null if no default should be set.
 *
 * Avoids double-quoting string literals, unwraps buggy duplicate quotes,
 * and preserves SQL expressions, functions, numbers, booleans, and keywords.
 */
export function formatSqlDefaultValue(
   rawDefault: string | undefined | null,
): string | null {
   if (rawDefault === undefined || rawDefault === null) return null;
   let trimmed = String(rawDefault).trim();
   if (!trimmed || trimmed.toLowerCase() === 'null' || trimmed === '-') {
      return null;
   }

   // Unwrap duplicate nested quotes caused by prior bugs, e.g. ''active'' -> 'active'
   while (
      trimmed.startsWith("''") &&
      trimmed.endsWith("''") &&
      trimmed.length > 4
   ) {
      trimmed = trimmed.slice(1, -1);
   }

   // 1. If it's a number (e.g. 0, 100, -1, 3.14), keep as-is without quotes
   if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return trimmed;
   }

   // 2. If it's a boolean keyword, keep as-is
   const lower = trimmed.toLowerCase();
   if (lower === 'true' || lower === 'false') {
      return lower.toUpperCase();
   }

   // 3. If it's a SQL keyword or function call, keep as-is
   const upper = trimmed.toUpperCase();
   if (
      upper === 'CURRENT_TIMESTAMP' ||
      upper === 'CURRENT_DATE' ||
      upper === 'CURRENT_TIME' ||
      upper === 'NOW()' ||
      upper === 'TIMESTAMP' ||
      upper.startsWith('CURRENT_TIMESTAMP') ||
      upper.startsWith('NOW()') ||
      upper.startsWith('GEN_RANDOM_UUID(') ||
      upper.startsWith('UUID_GENERATE_') ||
      upper.startsWith('UUID(') ||
      (trimmed.startsWith('(') && trimmed.endsWith(')'))
   ) {
      return upper === 'TIMESTAMP' ? 'CURRENT_TIMESTAMP' : trimmed;
   }

   // 4. If it's a PostgreSQL cast expression like 'active'::character varying or 'active'::text
   const pgCastMatch = trimmed.match(/^('[\s\S]*')(?:::[\w\s()]+)$/);
   if (pgCastMatch) {
      return pgCastMatch[1];
   }

   // 5. If it already has single quotes around it (e.g. 'active' or '' or 'hello world')
   if (
      trimmed.startsWith("'") &&
      trimmed.endsWith("'") &&
      trimmed.length >= 2
   ) {
      return trimmed;
   }

   // 6. If it has double quotes around it (e.g. "active")
   if (
      trimmed.startsWith('"') &&
      trimmed.endsWith('"') &&
      trimmed.length >= 2
   ) {
      const inner = trimmed.slice(1, -1).replace(/'/g, "''");
      return `'${inner}'`;
   }

   // 7. Otherwise, it's a plain string literal provided without quotes (e.g. active)
   const escaped = trimmed.replace(/'/g, "''");
   return `'${escaped}'`;
}

export function generateExplainQuery(
   rawSql: string,
   dbType: string,
): { sql: string; error?: string } {
   let cleanSql = rawSql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
      .replace(/;+$/, '')
      .trim();

   if (!cleanSql) {
      return { sql: '', error: 'SQL query is empty after stripping comments' };
   }

   if (/^(CREATE|DROP|ALTER|TRUNCATE)\s+/i.test(cleanSql)) {
      return {
         sql: '',
         error: 'DDL statements (CREATE, DROP, ALTER, TRUNCATE) do not have query execution plans to explain.',
      };
   }

   const hasUserExplain = /^EXPLAIN\b/i.test(cleanSql);
   let targetSql = cleanSql;
   if (hasUserExplain) {
      targetSql = cleanSql
         .replace(/^EXPLAIN\s+(QUERY\s+PLAN\s+)?/i, '')
         .replace(
            /^\((ANALYZE|COSTS|VERBOSE|BUFFERS|FORMAT\s+\w+|,|\s)+\)\s*/i,
            '',
         )
         .trim();
   }

   let explainSql = '';
   const isDmlWrite = /^(INSERT|UPDATE|DELETE)\s+/i.test(targetSql);

   if (dbType === 'sqlite') {
      explainSql = `EXPLAIN QUERY PLAN ${targetSql}`;
   } else if (dbType === 'postgres') {
      if (isDmlWrite) {
         explainSql = `EXPLAIN (COSTS, VERBOSE) ${targetSql}`;
      } else {
         explainSql = `EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS) ${targetSql}`;
      }
   } else if (dbType === 'mysql') {
      explainSql = `EXPLAIN ${targetSql}`;
   } else {
      explainSql = `EXPLAIN ${targetSql}`;
   }

   return { sql: explainSql };
}
