/**
 * Unified database column types supported across Drixio Studio
 * (Create Table Modal, Schema Grid Editor, etc.)
 */
export const STANDARD_DATA_TYPES = [
   'INTEGER',
   'VARCHAR(255)',
   'TEXT',
   'BOOLEAN',
   'TIMESTAMP',
   'DATETIME',
   'DATE',
   'NUMERIC',
   'DECIMAL(10,2)',
   'REAL',
   'JSON',
   'BLOB',
   'UUID',
   'ENUM',
];

/**
 * Checks whether a given type string is considered an ENUM type
 * @param {string} type
 * @returns {boolean}
 */
export function isEnumType(type) {
   if (!type) return false;
   const upper = String(type).toUpperCase().trim();
   return upper === 'ENUM' || upper.startsWith('ENUM(');
}

/**
 * Format a column default value into a valid SQL DEFAULT clause fragment,
 * or null if no default should be set.
 *
 * Avoids double-quoting string literals, unwraps buggy duplicate quotes,
 * and preserves SQL expressions, functions, numbers, booleans, and keywords.
 * @param {string} rawDefault
 * @returns {string|null}
 */
export function formatSqlDefaultValue(rawDefault) {
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
   if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
      return trimmed;
   }

   // 6. If it has double quotes around it (e.g. "active")
   if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
      const inner = trimmed.slice(1, -1).replace(/'/g, "''");
      return `'${inner}'`;
   }

   // 7. Otherwise, it's a plain string literal provided without quotes (e.g. active)
   const escaped = trimmed.replace(/'/g, "''");
   return `'${escaped}'`;
}
