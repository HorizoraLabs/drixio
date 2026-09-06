/**
 * SQL Safety & Destructive Query Analysis Engine
 * Intercepts dangerous SQL queries (DELETE/UPDATE without WHERE, DROP, TRUNCATE)
 */

export interface DangerousQueryResult {
   isDangerous: boolean;
   type?: string;
   title?: string;
   description?: string;
   sql?: string;
}

/**
 * Strips comments from SQL text (-- single line and /* multiline *\/)
 */
export function stripSqlComments(sql: string): string {
   if (!sql) return '';
   return sql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
}

/**
 * Analyzes SQL statement(s) for destructive operations without WHERE clauses
 */
export function analyzeDangerousQuery(rawSql: string): DangerousQueryResult {
   if (!rawSql) return { isDangerous: false };

   const cleaned = stripSqlComments(rawSql);
   if (!cleaned) return { isDangerous: false };

   // Split multiple statements separated by semicolon (not inside quotes)
   const statements = cleaned
      .split(/;(?=(?:[^'"]*['"][^'"]*['"])*[^'"]*$)/)
      .map((s) => s.trim())
      .filter(Boolean);

   for (const stmt of statements) {
      const normalized = stmt.replace(/\s+/g, ' ');

      // 1. DROP TABLE or DROP DATABASE / SCHEMA
      const dropMatch = normalized.match(
         /^DROP\s+(TABLE|DATABASE|SCHEMA)\s+(IF\s+EXISTS\s+)?([`"']?[a-zA-Z0-9_]+[`"']?)/i,
      );
      if (dropMatch) {
         const targetType = dropMatch[1].toUpperCase();
         const targetName = dropMatch[3] || 'target';
         return {
            isDangerous: true,
            type: `DROP ${targetType}`,
            title: `Permanent Deletion: DROP ${targetType}`,
            description: `This statement will permanently destroy the ${targetType.toLowerCase()} <code>${targetName}</code> and all data contained within it.`,
            sql: stmt,
         };
      }

      // 2. TRUNCATE TABLE or TRUNCATE
      const truncateMatch = normalized.match(
         /^TRUNCATE(\s+TABLE)?\s+([`"']?[a-zA-Z0-9_]+[`"']?)/i,
      );
      if (truncateMatch) {
         const targetName = truncateMatch[2] || 'target';
         return {
            isDangerous: true,
            type: 'TRUNCATE TABLE',
            title: 'Wipe Out Table: TRUNCATE',
            description: `This statement will immediately wipe out ALL records in table <code>${targetName}</code>.`,
            sql: stmt,
         };
      }

      // 3. DELETE without WHERE or trivial WHERE (WHERE 1=1 or WHERE true)
      if (
         /^DELETE\s+FROM\s+/i.test(normalized) ||
         /^DELETE\s+[a-zA-Z0-9_`"']+\s+FROM/i.test(normalized)
      ) {
         const hasWhere = /\bWHERE\b/i.test(normalized);
         if (!hasWhere) {
            return {
               isDangerous: true,
               type: 'DELETE without WHERE',
               title: 'Unrestricted DELETE Statement',
               description:
                  'This <b>DELETE</b> query does NOT contain a <code>WHERE</code> clause. Executing this will permanently delete <b>EVERY SINGLE RECORD</b> in the table.',
               sql: stmt,
            };
         }

         // Check trivial WHERE like WHERE 1=1 or WHERE true
         const wherePart = normalized
            .substring(normalized.search(/\bWHERE\b/i) + 5)
            .trim();
         if (
            /^(1\s*=\s*1|true|1|\(1\s*=\s*1\)|['"]1['"]\s*=\s*['"]1['"])\s*;/i.test(
               wherePart + ';',
            )
         ) {
            return {
               isDangerous: true,
               type: 'DELETE with Trivial WHERE',
               title: 'Trivial WHERE in DELETE Statement',
               description:
                  'This <b>DELETE</b> query has a trivial condition (<code>WHERE ' +
                  wherePart +
                  '</code>) that always evaluates to TRUE. It will delete <b>EVERY SINGLE RECORD</b> in the table.',
               sql: stmt,
            };
         }
      }

      // 4. UPDATE without WHERE or trivial WHERE
      if (/^UPDATE\s+([`"']?[a-zA-Z0-9_]+[`"']?)\s+SET\s+/i.test(normalized)) {
         const hasWhere = /\bWHERE\b/i.test(normalized);
         if (!hasWhere) {
            return {
               isDangerous: true,
               type: 'UPDATE without WHERE',
               title: 'Unrestricted UPDATE Statement',
               description:
                  'This <b>UPDATE</b> query does NOT contain a <code>WHERE</code> clause. Executing this will modify <b>EVERY SINGLE RECORD</b> across the entire table.',
               sql: stmt,
            };
         }

         // Check trivial WHERE
         const wherePart = normalized
            .substring(normalized.search(/\bWHERE\b/i) + 5)
            .trim();
         if (
            /^(1\s*=\s*1|true|1|\(1\s*=\s*1\)|['"]1['"]\s*=\s*['"]1['"])\s*;/i.test(
               wherePart + ';',
            )
         ) {
            return {
               isDangerous: true,
               type: 'UPDATE with Trivial WHERE',
               title: 'Trivial WHERE in UPDATE Statement',
               description:
                  'This <b>UPDATE</b> query has a trivial condition (<code>WHERE ' +
                  wherePart +
                  '</code>) that always evaluates to TRUE. It will overwrite <b>EVERY SINGLE RECORD</b> in the table.',
               sql: stmt,
            };
         }
      }
   }

   return { isDangerous: false };
}

