import {
   DBAdapter,
   ColumnSchema,
   SchemaChangeOptions,
   IndexSchema,
} from './types.js';
import { getDialect } from './dialect.js';

export interface SchemaResult {
   success: boolean;
   error?: string;
}

export async function createTable(
   adapter: DBAdapter,
   dbType: string,
   tableName: string,
   columns: ColumnSchema[],
): Promise<SchemaResult> {
   try {
      const dialect = getDialect(dbType as any);
      const sql = dialect.buildCreateTable(tableName, columns);
      await adapter.executeSql(sql);
      return { success: true };
   } catch (e: any) {
      return { success: false, error: e.message };
   }
}

export async function dropTable(
   adapter: DBAdapter,
   dbType: string,
   tableName: string,
): Promise<SchemaResult> {
   try {
      const dialect = getDialect(dbType as any);
      const quoted = dialect.quoteIdentifier(tableName);
      await adapter.executeSql(`DROP TABLE ${quoted};`);
      return { success: true };
   } catch (e: any) {
      return { success: false, error: e.message };
   }
}

export async function truncateTable(
   adapter: DBAdapter,
   tableName: string,
): Promise<SchemaResult> {
   try {
      await adapter.truncateTable(tableName);
      return { success: true };
   } catch (e: any) {
      return { success: false, error: e.message };
   }
}

export async function applySchemaChanges(
   adapter: DBAdapter,
   dbType: string,
   options: SchemaChangeOptions,
): Promise<SchemaResult> {
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
      return { success: false, error: 'Table name is required.' };
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
      return { success: false, error: `Table "${tableName}" does not exist.` };
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
            return { success: false, error: e.message };
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
            return { success: false, error: e.message };
         }
      }

      return { success: true };
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
      return { success: true };
   } catch (e: any) {
      return { success: false, error: e.message };
   }
}
