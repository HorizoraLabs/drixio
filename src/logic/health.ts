import { DBAdapter, ColumnSchema, IndexSchema, Result, ok, err } from './types.js';
import { getDialect } from './dialect.js';

export type HealthSeverity = 'critical' | 'warning' | 'suggestion';

export interface HealthIssue {
   id: string;
   tableName: string;
   columnName?: string;
   severity: HealthSeverity;
   title: string;
   description: string;
   impact: string;
   remediationSql: string;
   deduction: number;
}

export interface SchemaHealthReport {
   score: number;
   grade: 'A' | 'B' | 'C' | 'D';
   statusText: string;
   analyzedTablesCount: number;
   issuesCount: {
      critical: number;
      warning: number;
      suggestion: number;
      total: number;
   };
   issues: HealthIssue[];
}

/**
 * Runs deep architectural diagnostics on the connected database.
 */
export async function runSchemaHealthCheck(
   adapter: DBAdapter,
   dbType: string,
): Promise<Result<SchemaHealthReport>> {
   try {
      const tables = await adapter.getTables();
      const dialect = getDialect(dbType as any);
      const issues: HealthIssue[] = [];

      for (const tableName of tables) {
         let schema: ColumnSchema[] = [];
         let indexes: IndexSchema[] = [];

         try {
            schema = await adapter.getSchema(tableName);
         } catch {
            continue;
         }

         try {
            indexes = await adapter.getIndexes(tableName);
         } catch {
            indexes = [];
         }

         const quotedTable = dialect.quoteIdentifier(tableName);

         // 1. Check Missing Primary Key
         const pkColumns = schema.filter((c) => c.isPk);
         if (pkColumns.length === 0) {
            let addPkSql = '';
            if (dbType === 'sqlite') {
               addPkSql = `ALTER TABLE ${quotedTable} ADD COLUMN id INTEGER PRIMARY KEY AUTOINCREMENT;`;
            } else if (dbType === 'postgres') {
               addPkSql = `ALTER TABLE ${quotedTable} ADD COLUMN id SERIAL PRIMARY KEY;`;
            } else {
               addPkSql = `ALTER TABLE ${quotedTable} ADD COLUMN id INT AUTO_INCREMENT PRIMARY KEY;`;
            }

            issues.push({
               id: `missing-pk-${tableName}`,
               tableName,
               severity: 'critical',
               title: `Table "${tableName}" has no Primary Key`,
               description: `The table is missing a PRIMARY KEY constraint.`,
               impact: `Affects row identification, database replication, clustering efficiency, and causes ORMs (like Prisma/Drizzle) to fail.`,
               remediationSql: addPkSql,
               deduction: 15,
            });
         }

         // 2. Check Unindexed Foreign Keys
         const indexedLeadingCols = new Set<string>();
         for (const idx of indexes) {
            if (idx.columns.length > 0) {
               indexedLeadingCols.add(idx.columns[0]);
            }
         }
         // Primary keys also have underlying unique indexes
         for (const pk of pkColumns) {
            indexedLeadingCols.add(pk.name);
         }

         for (const col of schema) {
            if (col.fkTarget && !indexedLeadingCols.has(col.name)) {
               const idxName = dialect.quoteIdentifier(`idx_${tableName}_${col.name}`);
               const quotedCol = dialect.quoteIdentifier(col.name);
               const fixSql = `CREATE INDEX ${idxName} ON ${quotedTable} (${quotedCol});`;

               issues.push({
                  id: `unindexed-fk-${tableName}-${col.name}`,
                  tableName,
                  columnName: col.name,
                  severity: 'critical',
                  title: `Foreign Key "${col.name}" on "${tableName}" lacks an Index`,
                  description: `Column "${col.name}" references "${col.fkTarget.table}.${col.fkTarget.column}" but does not have an index.`,
                  impact: `Updates or deletes on the parent table will trigger full table scans on "${tableName}", causing extreme slow queries and row deadlocks.`,
                  remediationSql: fixSql,
                  deduction: 12,
               });
            }
         }

         // 3. Check Redundant / Duplicate Indexes
         for (let i = 0; i < indexes.length; i++) {
            for (let j = i + 1; j < indexes.length; j++) {
               const idxA = indexes[i];
               const idxB = indexes[j];
               const colsA = idxA.columns.join(',');
               const colsB = idxB.columns.join(',');

               if (colsA === colsB && idxA.name && idxB.name) {
                  const dropIdxSql =
                     dbType === 'mysql'
                        ? `DROP INDEX ${dialect.quoteIdentifier(idxB.name)} ON ${quotedTable};`
                        : `DROP INDEX ${dialect.quoteIdentifier(idxB.name)};`;

                  issues.push({
                     id: `duplicate-index-${tableName}-${idxB.name}`,
                     tableName,
                     severity: 'warning',
                     title: `Duplicate Index "${idxB.name}" on "${tableName}"`,
                     description: `Index "${idxB.name}" covers the exact same columns (${colsB}) as "${idxA.name}".`,
                     impact: `Consumes duplicate disk space and forces the database engine to maintain two identical B-trees on every INSERT/UPDATE.`,
                     remediationSql: dropIdxSql,
                     deduction: 8,
                  });
               }
            }
         }

         // 4. Check Non-Null Columns Missing Default Values
         for (const col of schema) {
            if (!col.isPk && col.nullable === false && col.defaultValue === undefined) {
               const quotedCol = dialect.quoteIdentifier(col.name);
               const fixSql =
                  dbType === 'postgres'
                     ? `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} SET DEFAULT '';`
                     : dbType === 'mysql'
                       ? `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} SET DEFAULT '';`
                       : `-- In SQLite, re-create or assign a DEFAULT value during migration\n-- ALTER TABLE ${quotedTable} ...`;

               issues.push({
                  id: `notnull-no-default-${tableName}-${col.name}`,
                  tableName,
                  columnName: col.name,
                  severity: 'warning',
                  title: `Non-null Column "${col.name}" has no Default Value`,
                  description: `Column "${col.name}" is marked NOT NULL but does not specify a DEFAULT constraint.`,
                  impact: `Any partial INSERT omitting this column will fail at runtime.`,
                  remediationSql: fixSql,
                  deduction: 5,
               });
            }
         }

         // 5. Check Categorical Columns Stored As Generic Unchecked Text
         for (const col of schema) {
            const colLower = col.name.toLowerCase();
            const isCategoryCol =
               colLower === 'status' ||
               colLower === 'role' ||
               colLower === 'type' ||
               colLower === 'gender';
            const typeUpper = (col.type || '').toUpperCase();
            const isGenericText =
               typeUpper.includes('VARCHAR') ||
               typeUpper === 'TEXT' ||
               typeUpper === 'STRING';

            if (isCategoryCol && isGenericText && (!col.enumValues || col.enumValues.length === 0)) {
               const quotedCol = dialect.quoteIdentifier(col.name);
               const fixSql = `ALTER TABLE ${quotedTable} ADD CONSTRAINT chk_${tableName}_${col.name} CHECK (${quotedCol} IN ('active', 'inactive', 'pending'));`;

               issues.push({
                  id: `unconstrained-categorical-${tableName}-${col.name}`,
                  tableName,
                  columnName: col.name,
                  severity: 'suggestion',
                  title: `Categorical Column "${col.name}" lacks ENUM or CHECK Constraint`,
                  description: `Column "${col.name}" stores status/role data as unrestricted text.`,
                  impact: `Risk of corrupt or inconsistent values (e.g. 'Active', 'active', 'ACTIVE') polluting the database.`,
                  remediationSql: fixSql,
                  deduction: 3,
               });
            }
         }
      }

      // Calculate overall score
      let totalDeductions = 0;
      for (const issue of issues) {
         totalDeductions += issue.deduction;
      }

      const score = Math.max(15, Math.min(100, 100 - totalDeductions));

      let grade: 'A' | 'B' | 'C' | 'D' = 'A';
      let statusText = 'Excellent (No Critical Issues)';

      if (score >= 90) {
         grade = 'A';
         statusText = 'Excellent - Production Ready';
      } else if (score >= 75) {
         grade = 'B';
         statusText = 'Good - Minor Optimizations Recommended';
      } else if (score >= 50) {
         grade = 'C';
         statusText = 'Needs Improvement - Potential Performance Bottlenecks';
      } else {
         grade = 'D';
         statusText = 'Critical - High-Risk Antipatterns Detected';
      }

      const issuesCount = {
         critical: issues.filter((i) => i.severity === 'critical').length,
         warning: issues.filter((i) => i.severity === 'warning').length,
         suggestion: issues.filter((i) => i.severity === 'suggestion').length,
         total: issues.length,
      };

      return ok({
         score,
         grade,
         statusText,
         analyzedTablesCount: tables.length,
         issuesCount,
         issues,
      });
   } catch (e: any) {
      return err(e.message || 'Failed to complete schema health check.', undefined, e);
   }
}

