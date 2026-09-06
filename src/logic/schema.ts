import {
   DBAdapter,
   ColumnSchema,
   SchemaChangeOptions,
   Result,
   ok,
   okVoid,
   err,
} from './types.js';
import { getDialect } from './dialect.js';

export async function createTable(
   adapter: DBAdapter,
   dbType: string,
   tableName: string,
   columns: ColumnSchema[],
): Promise<Result<void>> {
   try {
      const dialect = getDialect(dbType as any);
      const sql = dialect.buildCreateTable(tableName, columns);
      await adapter.executeSql(sql);
      return okVoid();
   } catch (e: any) {
      return err(e.message || 'Failed to create table', undefined, e);
   }
}

export async function dropTable(
   adapter: DBAdapter,
   dbType: string,
   tableName: string,
): Promise<Result<void>> {
   try {
      const dialect = getDialect(dbType as any);
      const quoted = dialect.quoteIdentifier(tableName);
      await adapter.executeSql(`DROP TABLE ${quoted};`);
      return okVoid();
   } catch (e: any) {
      return err(e.message || 'Failed to drop table', undefined, e);
   }
}

export async function truncateTable(
   adapter: DBAdapter,
   tableName: string,
): Promise<Result<void>> {
   try {
      await adapter.truncateTable(tableName);
      return okVoid();
   } catch (e: any) {
      return err(e.message || 'Failed to truncate table', undefined, e);
   }
}

export async function applySchemaChanges(
   adapter: DBAdapter,
   dbType: string,
   options: SchemaChangeOptions,
): Promise<Result<void>> {
   const {
      tableName,
      columns,
      renames = {},
      pendingEdits = {},
      pendingInserts = [],
      pendingDeletes = [],
      pendingIndexEdits,
   } = options;

   if (!tableName) {
      return err('Table name is required.');
   }

   const dialect = getDialect(dbType as any);
   const quotedTable = dialect.quoteIdentifier(tableName);

   // If table does not exist, and columns are provided, create the new table
   const tables = await adapter.getTables();
   const tableExists = tables.includes(tableName);
   if (!tableExists) {
      if (columns && columns.length > 0) {
         return createTable(adapter, dbType, tableName, columns);
      }
      return err(`Table "${tableName}" does not exist.`);
   }

   // Case A: Explicit newColumns array passed (used by SQLite recreation or direct column array)
   if (dbType === 'sqlite') {
      if (adapter.recreateTable) {
         const hasEdits =
            Object.keys(pendingEdits).length > 0 ||
            pendingInserts.length > 0 ||
            pendingDeletes.length > 0;

         let targetColumns: ColumnSchema[];
         if (hasEdits || !columns || columns.length === 0) {
            // Reconstruct targetColumns from existing schema + edits/inserts/deletes
            const origSchema =
               columns && columns.length > 0
                  ? columns
                  : await adapter.getSchema(tableName);
            const updated: ColumnSchema[] = [];

            for (const col of origSchema) {
               if (pendingDeletes.includes(col.name)) continue;

               const edits = pendingEdits[col.name] || {};
               let colName = edits.name || col.name;
               let type = edits.type || col.type;
               let isPk = col.isPk;
               let fkTarget = edits.fkTarget || col.fkTarget;

               const rawPk = (edits as any).isPk;
               if (rawPk !== undefined) {
                  if (typeof rawPk === 'string') {
                     isPk = rawPk.includes('PK') || rawPk.includes('PFK');
                     const fkMatch = rawPk.match(
                        /(?:FK|PFK)(?:\s*\(|:\s*|\s*→\s*|\s*->\s*)([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/i,
                     );
                     if (fkMatch) {
                        fkTarget = { table: fkMatch[1], column: fkMatch[2] };
                     } else {
                        fkTarget = undefined;
                     }
                  } else {
                     isPk = !!rawPk;
                  }
               }

               let nullable =
                  edits.nullable !== undefined
                     ? !!edits.nullable
                     : col.nullable;
               let defaultValue =
                  edits.defaultValue !== undefined
                     ? edits.defaultValue
                     : col.defaultValue;
               let isUnique =
                  edits.isUnique !== undefined
                     ? !!edits.isUnique
                     : col.isPk && !isPk
                       ? false
                       : !!col.isUnique;

               if (edits.name && edits.name !== col.name) {
                  renames[col.name] = edits.name;
               }

               updated.push({
                  name: colName,
                  type,
                  isPk,
                  nullable,
                  defaultValue,
                  isUnique,
                  fkTarget,
               });
            }

            for (const ins of pendingInserts) {
               if (!ins.name || ins.name.trim() === '') continue;
               let isPk = false;
               let fkTarget = ins.fkTarget;
               const rawInsPk = (ins as any).isPk;
               if (rawInsPk !== undefined) {
                  if (typeof rawInsPk === 'string') {
                     isPk = rawInsPk.includes('PK') || rawInsPk.includes('PFK');
                     const fkMatch = rawInsPk.match(
                        /(?:FK|PFK)(?:\s*\(|:\s*|\s*→\s*|\s*->\s*)([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)/i,
                     );
                     if (fkMatch) {
                        fkTarget = { table: fkMatch[1], column: fkMatch[2] };
                     }
                  } else {
                     isPk = !!rawInsPk;
                  }
               }
               updated.push({
                  name: ins.name.trim(),
                  type: ins.type || 'TEXT',
                  isPk,
                  nullable: ins.nullable !== undefined ? !!ins.nullable : true,
                  defaultValue: ins.defaultValue,
                  isUnique: !!ins.isUnique,
                  fkTarget,
               });
            }

            targetColumns = updated;
         } else {
            targetColumns = columns;
         }

         try {
            await adapter.recreateTable(tableName, targetColumns, renames);
         } catch (e: any) {
            return err(e.message || 'Failed to recreate table', undefined, e);
         }
      }

      // Handle SQLite index changes if any
      if (pendingIndexEdits) {
         try {
            for (const idxName of pendingIndexEdits.dropped) {
               if (idxName) {
                  await adapter.executeSql(
                     `DROP INDEX ${dialect.quoteIdentifier(idxName)};`,
                  );
               }
            }
            for (const idx of pendingIndexEdits.added) {
               const nameStr = idx.name
                  ? dialect.quoteIdentifier(idx.name)
                  : dialect.quoteIdentifier(
                       `idx_${tableName}_${idx.columns.join('_')}_${Date.now()}`,
                    );
               const uniqueStr = idx.isUnique ? 'UNIQUE' : '';
               const colsStr = idx.columns
                  .map((c) => dialect.quoteIdentifier(c))
                  .join(', ');
               await adapter.executeSql(
                  `CREATE ${uniqueStr} INDEX IF NOT EXISTS ${nameStr} ON ${quotedTable} (${colsStr});`,
               );
            }
         } catch (e: any) {
            return err(e.message || 'Failed to update index', undefined, e);
         }
      }

      return okVoid();
   }

   // Case B: Postgres / MySQL DDL Execution
   const sqls: string[] = [];

   // 1. Deletes
   for (const colName of pendingDeletes) {
      const quotedCol = dialect.quoteIdentifier(colName);
      sqls.push(`ALTER TABLE ${quotedTable} DROP COLUMN ${quotedCol};`);
   }

   // 2. Updates & Renames
   for (const [colName, edits] of Object.entries(pendingEdits)) {
      let currentName = colName;
      if (edits.name && edits.name !== colName) {
         const quotedOld = dialect.quoteIdentifier(colName);
         const quotedNew = dialect.quoteIdentifier(edits.name);
         sqls.push(
            `ALTER TABLE ${quotedTable} RENAME COLUMN ${quotedOld} TO ${quotedNew};`,
         );
         currentName = edits.name;
      }

      const hasOtherChanges = Object.keys(edits).some((k) => k !== 'name');
      if (hasOtherChanges) {
         const quotedCol = dialect.quoteIdentifier(currentName);
         const type = edits.type || 'TEXT';

         if (dbType === 'postgres') {
            sqls.push(
               `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} TYPE ${type};`,
            );
            if (edits.nullable === false) {
               sqls.push(
                  `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} SET NOT NULL;`,
               );
            } else if (edits.nullable === true) {
               sqls.push(
                  `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} DROP NOT NULL;`,
               );
            }
            if (edits.defaultValue) {
               const escapedDef = dialect.escapeString(edits.defaultValue);
               sqls.push(
                  `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} SET DEFAULT '${escapedDef}';`,
               );
            }
         } else if (dbType === 'mysql') {
            const nullStr = edits.nullable === false ? 'NOT NULL' : 'NULL';
            const defStr = edits.defaultValue
               ? `DEFAULT '${dialect.escapeString(edits.defaultValue)}'`
               : '';
            sqls.push(
               `ALTER TABLE ${quotedTable} MODIFY COLUMN ${quotedCol} ${type} ${nullStr} ${defStr};`,
            );
         }
      }
   }

   // 3. Inserts
   for (const ins of pendingInserts) {
      if (!ins.name || ins.name.trim() === '') continue;
      const quotedCol = dialect.quoteIdentifier(ins.name.trim());
      const type = ins.type || 'TEXT';
      const nullStr = ins.nullable === false ? 'NOT NULL' : '';
      const defStr = ins.defaultValue
         ? `DEFAULT '${dialect.escapeString(ins.defaultValue)}'`
         : '';
      sqls.push(
         `ALTER TABLE ${quotedTable} ADD COLUMN ${quotedCol} ${type} ${nullStr} ${defStr};`,
      );
   }

   // 4. Index changes
   if (pendingIndexEdits) {
      for (const idxName of pendingIndexEdits.dropped) {
         if (idxName) {
            if (dbType === 'mysql') {
               sqls.push(
                  `ALTER TABLE ${quotedTable} DROP INDEX ${dialect.quoteIdentifier(idxName)};`,
               );
            } else {
               sqls.push(`DROP INDEX ${dialect.quoteIdentifier(idxName)};`);
            }
         }
      }
      for (const idx of pendingIndexEdits.added) {
         const nameStr = idx.name
            ? dialect.quoteIdentifier(idx.name)
            : dialect.quoteIdentifier(
                 `idx_${tableName}_${idx.columns.join('_')}_${Date.now()}`,
              );
         const uniqueStr = idx.isUnique ? 'UNIQUE' : '';
         const colsStr = idx.columns
            .map((c) => dialect.quoteIdentifier(c))
            .join(', ');
         sqls.push(
            `CREATE ${uniqueStr} INDEX IF NOT EXISTS ${nameStr} ON ${quotedTable} (${colsStr});`,
         );
      }
   }

   // Execute SQLs
   try {
      for (const sql of sqls) {
         await adapter.executeSql(sql);
      }
      return okVoid();
   } catch (e: any) {
      return err(e.message || 'Failed to apply schema changes', undefined, e);
   }
}

/**
 * Safely query the number of rows in a table, handling cross-dialect count field aliases.
 */
export async function getTableRowCount(
   adapter: DBAdapter,
   tableName: string,
): Promise<Result<number>> {
   try {
      const quoted = adapter.quoteIdentifier(tableName);
      const countRes = await adapter.query(
         `SELECT COUNT(*) as cnt FROM ${quoted}`,
      );
      if (countRes && countRes.rows && countRes.rows.length > 0) {
         const row = countRes.rows[0];
         const rawCount =
            row.cnt ??
            row.CNT ??
            row.count ??
            row.COUNT ??
            row['count(*)'] ??
            Object.values(row)[0];
         return ok(Number(rawCount) || 0);
      }
      return ok(0);
   } catch (e: any) {
      return err(
         e.message || `Failed to count rows in table ${tableName}`,
         undefined,
         e,
      );
   }
}

export interface TableStatsInfo {
   name: string;
   rows: number | string;
}

/**
 * Query all tables and their respective row count.
 */
export async function getTablesWithRowCount(
   adapter: DBAdapter,
): Promise<Result<TableStatsInfo[]>> {
   try {
      const tables = await adapter.getTables();
      const result: TableStatsInfo[] = [];

      for (const table of tables) {
         const rowRes = await getTableRowCount(adapter, table);
         const rows = rowRes.success ? rowRes.data : 'N/A';
         result.push({ name: table, rows });
      }

      return ok(result);
   } catch (e: any) {
      return err(
         e.message || 'Failed to list tables with row counts',
         undefined,
         e,
      );
   }
}

/**
 * Generate a Mermaid ER diagram definition from all tables in the database.
 */
export async function generateMermaidErDiagram(
   adapter: DBAdapter,
): Promise<Result<string>> {
   try {
      const allTables = await adapter.getTables();
      if (allTables.length === 0) {
         return ok('erDiagram\n');
      }

      let mermaidCode = 'erDiagram\n';

      for (const table of allTables) {
         mermaidCode += `    ${table} {\n`;
         const schema = await adapter.getSchema(table);
         for (const col of schema) {
            const safeType = col.type
               .replace(/\s+/g, '_')
               .replace(/[^a-zA-Z0-9_]/g, '');
            const pk = col.isPk ? ' PK' : '';
            mermaidCode += `        ${safeType} ${col.name}${pk}\n`;
         }
         mermaidCode += `    }\n`;
      }

      return ok(mermaidCode);
   } catch (e: any) {
      return err(
         e.message || 'Failed to generate Mermaid ER diagram',
         undefined,
         e,
      );
   }
}

/**
 * Generate a Markdown Data Dictionary document for all tables in the database.
 */
export async function generateDataDictionary(
   adapter: DBAdapter,
   dbName: string = 'Database',
): Promise<Result<string>> {
   try {
      let md = `# Data Dictionary: ${dbName}\n\n`;
      const tables = await adapter.getTables();

      for (const t of tables) {
         md += `## Table: \`${t}\`\n\n`;
         md += `| Column | Type | PK | Nullable | Default | Extra |\n|---|---|---|---|---|---|\n`;
         const schema = await adapter.getSchema(t);
         for (const col of schema) {
            let extra = '-';
            if (col.fkTarget) {
               extra = `FK -> ${col.fkTarget.table}(${col.fkTarget.column})`;
            } else if (col.isUnique) {
               extra = 'UNIQUE';
            }
            md += `| ${col.name} | ${col.type} | ${col.isPk ? 'Yes' : 'No'} | ${col.nullable ? 'Yes' : 'No'} | ${col.defaultValue || '-'} | ${extra} |\n`;
         }
         md += `\n`;
      }

      return ok(md);
   } catch (e: any) {
      return err(
         e.message || 'Failed to generate data dictionary',
         undefined,
         e,
      );
   }
}

/**
 * Export DDL creation statements for all tables in the database.
 */
export async function exportDatabaseSchemaDdl(
   adapter: DBAdapter,
   dbType: string,
): Promise<Result<string>> {
   try {
      if (dbType === 'sqlite') {
         let sqlDump = '-- Drixio SQLite Schema Dump\n\n';
         const tablesResult = await adapter.query(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';",
         );
         for (const row of tablesResult.rows) {
            if (row.sql) sqlDump += `${row.sql};\n\n`;
         }
         return ok(sqlDump);
      } else if (dbType === 'mysql') {
         let sqlDump = '-- Drixio MySQL Schema Dump\n\n';
         const tables = await adapter.getTables();
         for (const table of tables) {
            const createResult = await adapter.query(
               `SHOW CREATE TABLE ${adapter.quoteIdentifier(table)}`,
            );
            if (createResult.rows && createResult.rows.length > 0) {
               const row = createResult.rows[0] as Record<string, any>;
               const createSql =
                  row['Create Table'] ||
                  row['Create View'] ||
                  Object.values(row)[1];
               if (createSql) sqlDump += `${createSql};\n\n`;
            }
         }
         return ok(sqlDump);
      }

      // Generic fallback using getDialect().buildCreateTable()
      const dialect = getDialect(dbType as any);
      const tables = await adapter.getTables();
      let sqlDump = `-- Drixio ${dbType.toUpperCase()} Schema Dump\n\n`;
      for (const table of tables) {
         const schema = await adapter.getSchema(table);
         sqlDump += `${dialect.buildCreateTable(table, schema)};\n\n`;
      }
      return ok(sqlDump);
   } catch (e: any) {
      return err(
         e.message || 'Failed to export database schema DDL',
         undefined,
         e,
      );
   }
}
