import {
   DBAdapter,
   ColumnSchema,
   TableSchemaInfo,
   SchemaChangeOptions,
   ReferencingForeignKey,
   CascadeImpactResult,
   Result,
   ok,
   okVoid,
   err,
} from './types.js';
import { getDialect, formatSqlDefaultValue } from './dialect.js';

export async function createTable(
   adapter: DBAdapter,
   dbType: string,
   tableName: string,
   columns: ColumnSchema[],
): Promise<Result<void>> {
   try {
      if (dbType === 'postgres') {
         const processedEnums = new Set<string>();
         for (const col of columns) {
            if (
               col.enumValues &&
               col.enumValues.length > 0 &&
               col.type &&
               !['enum', 'varchar', 'varchar(255)', 'text', 'string'].includes(
                  col.type.toLowerCase(),
               ) &&
               !processedEnums.has(col.type.toLowerCase())
            ) {
               processedEnums.add(col.type.toLowerCase());
               const vals = col.enumValues
                  .map((v) => `'${v.replace(/'/g, "''")}'`)
                  .join(', ');
               const enumTypeQuoted = adapter.quoteIdentifier(col.type);
               const escapedName = col.type.replace(/'/g, "''");
               const createTypeSql = `
                  DO $$
                  BEGIN
                     IF NOT EXISTS (
                        SELECT 1 FROM pg_type t
                        JOIN pg_namespace n ON n.oid = t.typnamespace
                        WHERE t.typname = '${escapedName}'
                          AND (n.nspname = current_schema() OR n.nspname = 'public')
                     ) THEN
                        CREATE TYPE ${enumTypeQuoted} AS ENUM (${vals});
                     END IF;
                  END$$;
               `;
               await adapter.executeSql(createTypeSql);
            }
         }
      }

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
      cascadeFkTypes = true,
      autoReindex = false,
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

   // Detect any PK column type changes and their referencing foreign keys
   const origSchemaForCascade =
      columns && columns.length > 0
         ? columns
         : await adapter.getSchema(tableName);

   const pkTypeChanges: {
      colName: string;
      oldType: string;
      newType: string;
      refs: ReferencingForeignKey[];
   }[] = [];

   if (cascadeFkTypes) {
      for (const col of origSchemaForCascade) {
         const edits = pendingEdits[col.name];
         if (
            col.isPk &&
            edits &&
            edits.type &&
            edits.type.toLowerCase() !== (col.type || '').toLowerCase()
         ) {
            const refs = await findReferencingForeignKeys(
               adapter,
               tableName,
               col.name,
            );
            if (refs.length > 0) {
               pkTypeChanges.push({
                  colName: col.name,
                  oldType: col.type,
                  newType: edits.type,
                  refs,
               });
            }
         }
      }
   }

   // 1. Data migration / reindexing for TEXT -> INT if needed
   for (const ptc of pkTypeChanges) {
      const oldUpper = (ptc.oldType || '').toUpperCase();
      const newUpper = (ptc.newType || '').toUpperCase();
      const isOldText = ['TEXT', 'VARCHAR', 'CHAR', 'STRING', 'CLOB'].some(
         (t) => oldUpper.includes(t),
      );
      const isNewInt = [
         'INT',
         'INTEGER',
         'SERIAL',
         'BIGINT',
         'SMALLINT',
         'TINYINT',
      ].some((t) => newUpper.includes(t));

      if (isOldText && isNewInt) {
         const quotedCol = dialect.quoteIdentifier(ptc.colName);
         let distinctRows: any[] = [];
         try {
            const qRes = await adapter.query(
               `SELECT DISTINCT ${quotedCol} AS val FROM ${quotedTable} WHERE ${quotedCol} IS NOT NULL;`,
            );
            distinctRows = qRes?.rows || [];
         } catch {}

         const hasNonNumeric = distinctRows.some((r) => {
            const v =
               r.val !== undefined && r.val !== null ? String(r.val).trim() : '';
            return v === '' || isNaN(Number(v));
         });

         if (hasNonNumeric) {
            if (!autoReindex) {
               return err(
                  `Column "${ptc.colName}" contains non-numeric text. Enable autoReindex to map values to sequential IDs.`,
               );
            }

            const valMapping = new Map<string, number>();
            let counter = 1;
            for (const r of distinctRows) {
               const s = String(r.val);
               if (!valMapping.has(s)) {
                  valMapping.set(s, counter++);
               }
            }

            // Temporarily disable FK checks during re-indexing if needed
            if (dbType === 'sqlite') {
               await adapter.executeSql('PRAGMA foreign_keys = OFF;');
            } else if (dbType === 'mysql') {
               await adapter.executeSql('SET FOREIGN_KEY_CHECKS = 0;');
            }

            try {
               // Update parent table
               for (const [oldVal, newInt] of valMapping.entries()) {
                  const esc = dialect.escapeString(oldVal);
                  await adapter.executeSql(
                     `UPDATE ${quotedTable} SET ${quotedCol} = '${newInt}' WHERE ${quotedCol} = '${esc}';`,
                  );
               }

               // Update all child tables
               for (const ref of ptc.refs) {
                  const qChildTbl = dialect.quoteIdentifier(ref.table);
                  const qChildCol = dialect.quoteIdentifier(ref.column);
                  for (const [oldVal, newInt] of valMapping.entries()) {
                     const esc = dialect.escapeString(oldVal);
                     await adapter.executeSql(
                        `UPDATE ${qChildTbl} SET ${qChildCol} = '${newInt}' WHERE ${qChildCol} = '${esc}';`,
                     );
                  }
               }
            } finally {
               if (dbType === 'sqlite') {
                  await adapter.executeSql('PRAGMA foreign_keys = ON;');
               } else if (dbType === 'mysql') {
                  await adapter.executeSql('SET FOREIGN_KEY_CHECKS = 1;');
               }
            }
         }
      }
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
                if (edits.fkTarget !== undefined) {
                   fkTarget = edits.fkTarget;
                }
                if (rawPk !== undefined) {
                   if (typeof rawPk === 'string') {
                      isPk = rawPk.includes('PK') || rawPk.includes('PFK');
                      const fkMatch = rawPk.match(
                         /(?:FK|PFK)(?:\s*\(|:\s*|\s*→\s*|\s*->\s*)([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)(?:\s*\((CASCADE|SET NULL|RESTRICT|NO ACTION)\))?/i,
                      );
                      if (fkMatch && edits.fkTarget === undefined) {
                         const act = fkMatch[3]
                            ? fkMatch[3].toUpperCase()
                            : undefined;
                         fkTarget = {
                            table: fkMatch[1],
                            column: fkMatch[2],
                            onDelete:
                               act && act !== 'NO ACTION'
                                  ? act
                                  : col.fkTarget?.onDelete,
                            onUpdate: col.fkTarget?.onUpdate,
                         };
                      } else if (
                         !fkMatch &&
                         edits.fkTarget === undefined &&
                         (rawPk === '' || rawPk === 'PK' || rawPk === '-')
                      ) {
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
                let enumValues =
                   edits.enumValues !== undefined
                      ? edits.enumValues
                      : col.enumValues;

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
                   enumValues,
                });
             }

             for (const ins of pendingInserts) {
                if (!ins.name || ins.name.trim() === '') continue;
                let isPk = false;
                let fkTarget = ins.fkTarget;
                const rawInsPk = (ins as any).isPk;
                if (ins.fkTarget !== undefined) {
                   fkTarget = ins.fkTarget;
                }
                if (rawInsPk !== undefined) {
                   if (typeof rawInsPk === 'string') {
                      isPk = rawInsPk.includes('PK') || rawInsPk.includes('PFK');
                      const fkMatch = rawInsPk.match(
                         /(?:FK|PFK)(?:\s*\(|:\s*|\s*→\s*|\s*->\s*)([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)(?:\s*\((CASCADE|SET NULL|RESTRICT|NO ACTION)\))?/i,
                      );
                      if (fkMatch && ins.fkTarget === undefined) {
                         const act = fkMatch[3]
                            ? fkMatch[3].toUpperCase()
                            : undefined;
                         fkTarget = {
                            table: fkMatch[1],
                            column: fkMatch[2],
                            onDelete:
                               act && act !== 'NO ACTION' ? act : undefined,
                         };
                      }
                   } else {
                      isPk = !!rawInsPk;
                   }
                }updated.push({
                  name: ins.name.trim(),
                  type: ins.type || 'TEXT',
                  isPk,
                  nullable: ins.nullable !== undefined ? !!ins.nullable : true,
                  defaultValue: ins.defaultValue,
                  isUnique: !!ins.isUnique,
                  fkTarget,
                  enumValues: ins.enumValues,
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

         // Cascade update child referencing tables in SQLite
         if (pkTypeChanges.length > 0) {
            const childTableUpdates = new Map<
               string,
               { [colName: string]: { newType: string; parentColName: string } }
            >();
            for (const ptc of pkTypeChanges) {
               const parentColName =
                  pendingEdits[ptc.colName]?.name || ptc.colName;
               for (const ref of ptc.refs) {
                  let map = childTableUpdates.get(ref.table);
                  if (!map) {
                     map = {};
                     childTableUpdates.set(ref.table, map);
                  }
                  map[ref.column] = {
                     newType: ptc.newType,
                     parentColName,
                  };
               }
            }

            for (const [childTable, colMap] of childTableUpdates.entries()) {
               const childSchema = await adapter.getSchema(childTable);
               const updatedChildSchema = childSchema.map((c) => {
                  if (colMap[c.name]) {
                     const info = colMap[c.name];
                     const updatedCol = { ...c, type: info.newType };
                     if (updatedCol.fkTarget) {
                        updatedCol.fkTarget = {
                           ...updatedCol.fkTarget,
                           column: info.parentColName,
                        };
                     }
                     return updatedCol;
                  }
                  return c;
               });
               try {
                  await adapter.recreateTable(childTable, updatedChildSchema);
               } catch (e: any) {
                  return err(
                     e.message ||
                        `Failed to cascade update child table "${childTable}"`,
                     undefined,
                     e,
                  );
               }
            }
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

   // If cascading PK changes, drop referencing child constraints first
   if (pkTypeChanges.length > 0) {
      for (const ptc of pkTypeChanges) {
         for (const ref of ptc.refs) {
            if (ref.constraintName) {
               const qChildTable = dialect.quoteIdentifier(ref.table);
               const qConstraint = dialect.quoteIdentifier(ref.constraintName);
               if (dbType === 'postgres') {
                  sqls.push(
                     `ALTER TABLE ${qChildTable} DROP CONSTRAINT IF EXISTS ${qConstraint};`,
                  );
               } else if (dbType === 'mysql') {
                  sqls.push(
                     `ALTER TABLE ${qChildTable} DROP FOREIGN KEY ${qConstraint};`,
                  );
               } else if (dbType === 'mssql') {
                  sqls.push(
                     `ALTER TABLE ${qChildTable} DROP CONSTRAINT ${qConstraint};`,
                  );
               }
            }
         }
      }
   }

   // 1. Deletes
   for (const colName of pendingDeletes) {
      const quotedCol = dialect.quoteIdentifier(colName);
      sqls.push(`ALTER TABLE ${quotedTable} DROP COLUMN ${quotedCol};`);
   }

   // 2. Updates & Renames
   for (const [colName, edits] of Object.entries(pendingEdits)) {
      let currentName = colName;
      if (edits.name && edits.name !== colName) {
         if (dbType === 'mssql') {
            // MSSQL uses sp_rename for column renaming
            const escapedFull = `${tableName}.${colName}`.replace(/'/g, "''");
            const escapedNew = edits.name.replace(/'/g, "''");
            sqls.push(
               `EXEC sp_rename '${escapedFull}', '${escapedNew}', 'COLUMN';`,
            );
         } else {
            const quotedOld = dialect.quoteIdentifier(colName);
            const quotedNew = dialect.quoteIdentifier(edits.name);
            sqls.push(
               `ALTER TABLE ${quotedTable} RENAME COLUMN ${quotedOld} TO ${quotedNew};`,
            );
         }
         currentName = edits.name;
      }

      // Exclude isPk / fkTarget — those only affect constraints, not column definition.
      // Including them here would cause a spurious TYPE cast (defaulting to 'TEXT')
      // which breaks FK references when the column type is e.g. INTEGER.
      const CONSTRAINT_ONLY_KEYS = new Set(['isPk', 'fkTarget']);
      const hasOtherChanges = Object.keys(edits).some(
         (k) => k !== 'name' && !CONSTRAINT_ONLY_KEYS.has(k),
      );
      if (hasOtherChanges) {
         const quotedCol = dialect.quoteIdentifier(currentName);
         const type = edits.type || 'TEXT';

         if (dbType === 'postgres') {
            let pgType = type;
            if (edits.enumValues && edits.enumValues.length > 0) {
               if (edits.isNewEnum && edits.type) {
                  const escapedName = edits.type.replace(/'/g, "''");
                  const vals = edits.enumValues
                     .map((v: string) => `'${dialect.escapeString(v)}'`)
                     .join(', ');
                  const quotedType = dialect.quoteIdentifier(edits.type);
                  sqls.push(`
                     DO $$
                     BEGIN
                        IF NOT EXISTS (
                           SELECT 1 FROM pg_type t
                           JOIN pg_namespace n ON n.oid = t.typnamespace
                           WHERE t.typname = '${escapedName}'
                             AND (n.nspname = current_schema() OR n.nspname = 'public')
                        ) THEN
                           CREATE TYPE ${quotedType} AS ENUM (${vals});
                        END IF;
                     END$$;
                  `);
                  pgType = quotedType;
               } else if (edits.type) {
                  pgType = dialect.quoteIdentifier(edits.type);
               }
            }
            sqls.push(
               `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} TYPE ${pgType} USING ${quotedCol}::text::${pgType};`,
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
            if (edits.defaultValue !== undefined) {
               const formatted = formatSqlDefaultValue(edits.defaultValue);
               if (formatted !== null) {
                  sqls.push(
                     `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} SET DEFAULT ${formatted};`,
                  );
               } else {
                  sqls.push(
                     `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} DROP DEFAULT;`,
                  );
               }
            }
         } else if (dbType === 'mysql') {
            let mysqlType = type;
            if (edits.enumValues && edits.enumValues.length > 0) {
               const vals = edits.enumValues
                  .map((v: string) => `'${dialect.escapeString(v)}'`)
                  .join(', ');
               mysqlType = `ENUM(${vals})`;
            }
            const nullStr = edits.nullable === false ? 'NOT NULL' : 'NULL';
            const formatted = formatSqlDefaultValue(edits.defaultValue);
            const defStr = formatted !== null ? `DEFAULT ${formatted}` : '';
            sqls.push(
               `ALTER TABLE ${quotedTable} MODIFY COLUMN ${quotedCol} ${mysqlType} ${nullStr} ${defStr};`,
            );
         } else if (dbType === 'mssql') {
            // MSSQL: must drop existing default constraint before changing column type
            const escTable = tableName.replace(/'/g, "''");
            const escColName = currentName.replace(/'/g, "''");
            sqls.push(
               `DECLARE @dfC NVARCHAR(200);\nSELECT @dfC = dc.name FROM sys.default_constraints dc JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id WHERE OBJECT_NAME(dc.parent_object_id) = '${escTable}' AND c.name = '${escColName}';\nIF @dfC IS NOT NULL EXEC('ALTER TABLE ${quotedTable} DROP CONSTRAINT [' + @dfC + ']');`,
            );
            let mssqlType = type;
            if (edits.enumValues && edits.enumValues.length > 0) {
               const vals = edits.enumValues
                  .map((v: string) => `'${dialect.escapeString(v)}'`)
                  .join(', ');
               // MSSQL: use NVARCHAR for enum-like columns; CHECK constraint added separately
               mssqlType = `NVARCHAR(255)`;
            }
            const mssqlNull = edits.nullable === false ? 'NOT NULL' : 'NULL';
            sqls.push(
               `ALTER TABLE ${quotedTable} ALTER COLUMN ${quotedCol} ${mssqlType} ${mssqlNull};`,
            );
            if (edits.defaultValue !== undefined) {
               const formatted2 = formatSqlDefaultValue(edits.defaultValue);
               if (formatted2 !== null) {
                  const safeConName = `DF_${tableName}_${currentName}`
                     .replace(/[^a-zA-Z0-9_]/g, '_')
                     .slice(0, 128);
                  sqls.push(
                     `ALTER TABLE ${quotedTable} ADD CONSTRAINT [${safeConName}] DEFAULT ${formatted2} FOR ${quotedCol};`,
                  );
               }
            }
         }
      }
   }

   // ── Handle PK / FK constraint changes for existing columns (Postgres, MySQL & MSSQL) ──

   // SQLite uses recreateTable above which rebuilds the whole table including all constraints.
   // Postgres/MySQL execute individual ALTER TABLE statements, so isPk and fkTarget changes
   // on EXISTING columns must be handled explicitly here — the loop above only covers
   // type / nullable / defaultValue edits.
   {
      // Build a lookup of the original column state
      const origColMap = new Map<string, ColumnSchema>();
      for (const col of origSchemaForCascade) {
         origColMap.set(col.name, col);
      }

      const esc = (s: string) => s.replace(/'/g, "''");

      for (const [editColName, edits] of Object.entries(pendingEdits)) {
         const origCol = origColMap.get(editColName);
         if (!origCol) continue;

         // Column name after any rename already applied above
         const currentColName = (edits as any).name || editColName;
         const quotedCurrentCol = dialect.quoteIdentifier(currentColName);

         // ── Compute intended isPk ───────────────────────────────────────
         let newIsPk = origCol.isPk;
         const rawPk = (edits as any).isPk;
         if (rawPk !== undefined) {
            if (typeof rawPk === 'string') {
               newIsPk = rawPk.includes('PK') || rawPk.includes('PFK');
            } else {
               newIsPk = !!rawPk;
            }
         }

         // ── Compute intended fkTarget ───────────────────────────────────
         let newFkTarget: ColumnSchema['fkTarget'] = origCol.fkTarget;
         if ((edits as any).fkTarget !== undefined) {
            // Explicit override — null means "remove FK"
            newFkTarget = (edits as any).fkTarget ?? undefined;
         } else if (rawPk !== undefined && typeof rawPk === 'string') {
            // Try to parse FK info embedded in the key-string (e.g. "PFK: users.id")
            const fkStrMatch = rawPk.match(
               /(?:FK|PFK)(?:\s*\(|:\s*|\s*→\s*|\s*->\s*)([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)(?:\s*\((CASCADE|SET NULL|RESTRICT|NO ACTION)\))?/i,
            );
            if (fkStrMatch) {
               const act = fkStrMatch[3]
                  ? fkStrMatch[3].toUpperCase()
                  : undefined;
               newFkTarget = {
                  table: fkStrMatch[1],
                  column: fkStrMatch[2],
                  onDelete:
                     act && act !== 'NO ACTION'
                        ? act
                        : origCol.fkTarget?.onDelete,
                  onUpdate: origCol.fkTarget?.onUpdate,
               };
            } else if (rawPk === '' || rawPk === 'PK' || rawPk === '-') {
               newFkTarget = undefined;
            }
         }

         // ── Detect actual changes ───────────────────────────────────────
         const pkChanged = !!origCol.isPk !== !!newIsPk;
         const origFkSig = origCol.fkTarget
            ? `${origCol.fkTarget.table}.${origCol.fkTarget.column}|${origCol.fkTarget.onDelete ?? ''}|${origCol.fkTarget.onUpdate ?? ''}`
            : '';
         const newFkSig = newFkTarget
            ? `${newFkTarget.table}.${newFkTarget.column}|${newFkTarget.onDelete ?? ''}|${newFkTarget.onUpdate ?? ''}`
            : '';
         const fkChanged = origFkSig !== newFkSig;

         if (!pkChanged && !fkChanged) continue;

         // ── Safe execution order: DROP FK → DROP PK → ADD PK → ADD FK ──

         // Step 1: Drop old FK constraint (must happen before dropping PK)
         if (fkChanged && origCol.fkTarget) {
            const oldCon = origCol.fkTarget.constraintName;
            if (oldCon) {
               const qCon = dialect.quoteIdentifier(oldCon);
               if (dbType === 'postgres') {
                  sqls.push(
                     `ALTER TABLE ${quotedTable} DROP CONSTRAINT IF EXISTS ${qCon};`,
                  );
               } else if (dbType === 'mysql') {
                  sqls.push(
                     `ALTER TABLE ${quotedTable} DROP FOREIGN KEY ${qCon};`,
                  );
               } else if (dbType === 'mssql') {
                  sqls.push(
                     `ALTER TABLE ${quotedTable} DROP CONSTRAINT ${qCon};`,
                  );
               }
            } else if (dbType === 'postgres') {
               // Fallback: locate constraint name via information_schema
               sqls.push(
                  `DO $$\nDECLARE v_fk text;\nBEGIN\n  SELECT tc.constraint_name INTO v_fk\n  FROM information_schema.table_constraints tc\n  JOIN information_schema.key_column_usage kcu\n    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema\n  WHERE tc.table_schema = current_schema()\n    AND tc.table_name = '${esc(tableName)}'\n    AND tc.constraint_type = 'FOREIGN KEY'\n    AND kcu.column_name = '${esc(editColName)}'\n  LIMIT 1;\n  IF v_fk IS NOT NULL THEN\n    EXECUTE format('ALTER TABLE ${quotedTable} DROP CONSTRAINT %I', v_fk);\n  END IF;\nEND$$;`,
               );
            } else if (dbType === 'mssql') {
               sqls.push(
                  `DECLARE @fkName NVARCHAR(200);\nSELECT @fkName = fk.name FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id WHERE OBJECT_NAME(fk.parent_object_id) = '${esc(tableName)}' AND c.name = '${esc(editColName)}';\nIF @fkName IS NOT NULL EXEC('ALTER TABLE ${quotedTable} DROP CONSTRAINT [' + @fkName + ']');`,
               );
            }
         }
      }

      // ── Step 2 & 3: Table-level Primary Key Update (Supports Composite PK / PFK) ──
      const origPkCols: string[] = [];
      const targetPkCols: string[] = [];

      for (const col of origSchemaForCascade) {
         if (col.isPk) {
            origPkCols.push(col.name);
         }
         if (pendingDeletes.includes(col.name)) continue;

         const edits = pendingEdits[col.name];
         const currentColName = edits?.name || col.name;
         let colIsPk = col.isPk;
         if (edits) {
            const rawPk = (edits as any).isPk;
            if (rawPk !== undefined) {
               if (typeof rawPk === 'string') {
                  colIsPk = rawPk.includes('PK') || rawPk.includes('PFK');
               } else {
                  colIsPk = !!rawPk;
               }
            }
         }
         if (colIsPk) {
            targetPkCols.push(currentColName);
         }
      }

      for (const ins of pendingInserts) {
         if (!ins.name || ins.name.trim() === '') continue;
         let insIsPk = false;
         const rawInsPk = (ins as any).isPk;
         if (rawInsPk !== undefined) {
            if (typeof rawInsPk === 'string') {
               insIsPk = rawInsPk.includes('PK') || rawInsPk.includes('PFK');
            } else {
               insIsPk = !!rawInsPk;
            }
         }
         if (insIsPk) {
            targetPkCols.push(ins.name.trim());
         }
      }

      const pkChanged =
         origPkCols.length !== targetPkCols.length ||
         origPkCols.some((c, i) => c !== targetPkCols[i]);

      if (pkChanged) {
         if (origPkCols.length > 0) {
            if (dbType === 'postgres') {
               sqls.push(
                  `DO $$\nDECLARE v_pk text;\nBEGIN\n  SELECT constraint_name INTO v_pk\n  FROM information_schema.table_constraints\n  WHERE table_schema = current_schema()\n    AND table_name = '${esc(tableName)}'\n    AND constraint_type = 'PRIMARY KEY';\n  IF v_pk IS NOT NULL THEN\n    EXECUTE format('ALTER TABLE ${quotedTable} DROP CONSTRAINT %I', v_pk);\n  END IF;\nEND$$;`,
               );
            } else if (dbType === 'mysql') {
               sqls.push(`ALTER TABLE ${quotedTable} DROP PRIMARY KEY;`);
            } else if (dbType === 'mssql') {
               sqls.push(
                  `DECLARE @pkName NVARCHAR(200);\nSELECT @pkName = kc.name FROM sys.key_constraints kc WHERE OBJECT_NAME(kc.parent_object_id) = '${esc(tableName)}' AND kc.type = 'PK';\nIF @pkName IS NOT NULL EXEC('ALTER TABLE ${quotedTable} DROP CONSTRAINT [' + @pkName + ']');`,
               );
            }
         }

         if (targetPkCols.length > 0) {
            const pkColsQuoted = targetPkCols
               .map((c) => dialect.quoteIdentifier(c))
               .join(', ');
            sqls.push(
               `ALTER TABLE ${quotedTable} ADD PRIMARY KEY (${pkColsQuoted});`,
            );
         }
      }

      // ── Step 4: Add new FK constraints ──
      for (const [editColName, edits] of Object.entries(pendingEdits)) {
         const origCol = origColMap.get(editColName);
         if (!origCol) continue;

         const currentColName = (edits as any).name || editColName;
         const quotedCurrentCol = dialect.quoteIdentifier(currentColName);

         let newFkTarget: ColumnSchema['fkTarget'] = origCol.fkTarget;
         const rawPk = (edits as any).isPk;
         if ((edits as any).fkTarget !== undefined) {
            newFkTarget = (edits as any).fkTarget ?? undefined;
         } else if (rawPk !== undefined && typeof rawPk === 'string') {
            const fkStrMatch = rawPk.match(
               /(?:FK|PFK)(?:\s*\(|:\s*|\s*→\s*|\s*->\s*)([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)(?:\s*\((CASCADE|SET NULL|RESTRICT|NO ACTION)\))?/i,
            );
            if (fkStrMatch) {
               const act = fkStrMatch[3]
                  ? fkStrMatch[3].toUpperCase()
                  : undefined;
               newFkTarget = {
                  table: fkStrMatch[1],
                  column: fkStrMatch[2],
                  onDelete:
                     act && act !== 'NO ACTION'
                        ? act
                        : origCol.fkTarget?.onDelete,
                  onUpdate: origCol.fkTarget?.onUpdate,
               };
            } else if (rawPk === '' || rawPk === 'PK' || rawPk === '-') {
               newFkTarget = undefined;
            }
         }

         const origFkSig = origCol.fkTarget
            ? `${origCol.fkTarget.table}.${origCol.fkTarget.column}|${origCol.fkTarget.onDelete ?? ''}|${origCol.fkTarget.onUpdate ?? ''}`
            : '';
         const newFkSig = newFkTarget
            ? `${newFkTarget.table}.${newFkTarget.column}|${newFkTarget.onDelete ?? ''}|${newFkTarget.onUpdate ?? ''}`
            : '';
         const fkChanged = origFkSig !== newFkSig;

         if (fkChanged && newFkTarget?.table && newFkTarget?.column) {
            const newCon = dialect.quoteIdentifier(
               `fk_${tableName}_${currentColName}_${Date.now()}`,
            );
            const qRefTable = dialect.quoteIdentifier(newFkTarget.table);
            const qRefCol = dialect.quoteIdentifier(newFkTarget.column);
            let fkSql = `ALTER TABLE ${quotedTable} ADD CONSTRAINT ${newCon} FOREIGN KEY (${quotedCurrentCol}) REFERENCES ${qRefTable}(${qRefCol})`;
            if (
               newFkTarget.onDelete &&
               newFkTarget.onDelete.toUpperCase() !== 'NO ACTION'
            ) {
               fkSql += ` ON DELETE ${newFkTarget.onDelete.toUpperCase()}`;
            }
            if (
               newFkTarget.onUpdate &&
               newFkTarget.onUpdate.toUpperCase() !== 'NO ACTION'
            ) {
               fkSql += ` ON UPDATE ${newFkTarget.onUpdate.toUpperCase()}`;
            }
            sqls.push(`${fkSql};`);
         }
      }
   }

   // Cascade alter child foreign key columns and restore constraints
   if (pkTypeChanges.length > 0) {
      for (const ptc of pkTypeChanges) {
         const parentColName = pendingEdits[ptc.colName]?.name || ptc.colName;
         const qParentCol = dialect.quoteIdentifier(parentColName);

         for (const ref of ptc.refs) {
            const qChildTable = dialect.quoteIdentifier(ref.table);
            const qChildCol = dialect.quoteIdentifier(ref.column);

            if (dbType === 'postgres') {
               const pgType = ptc.newType;
               sqls.push(
                  `ALTER TABLE ${qChildTable} ALTER COLUMN ${qChildCol} TYPE ${pgType} USING ${qChildCol}::text::${pgType};`,
               );
            } else if (dbType === 'mysql') {
               const mysqlType = ptc.newType;
               const nullStr = ref.nullable === false ? 'NOT NULL' : 'NULL';
               sqls.push(
                  `ALTER TABLE ${qChildTable} MODIFY COLUMN ${qChildCol} ${mysqlType} ${nullStr};`,
               );
            } else if (dbType === 'mssql') {
               const mssqlType = ptc.newType;
               const nullStr = ref.nullable === false ? 'NOT NULL' : 'NULL';
               sqls.push(
                  `ALTER TABLE ${qChildTable} ALTER COLUMN ${qChildCol} ${mssqlType} ${nullStr};`,
               );
            }

            const constraintName = dialect.quoteIdentifier(
               ref.constraintName || `fk_${ref.table}_${ref.column}_${Date.now()}`,
            );
            let fkClause = `ALTER TABLE ${qChildTable} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${qChildCol}) REFERENCES ${quotedTable}(${qParentCol})`;
            if (ref.onDelete && ref.onDelete.toUpperCase() !== 'NO ACTION') {
               fkClause += ` ON DELETE ${ref.onDelete.toUpperCase()}`;
            }
            if (ref.onUpdate && ref.onUpdate.toUpperCase() !== 'NO ACTION') {
               fkClause += ` ON UPDATE ${ref.onUpdate.toUpperCase()}`;
            }
            sqls.push(`${fkClause};`);
         }
      }
   }

   // 3. Inserts
   for (const ins of pendingInserts) {
      if (!ins.name || ins.name.trim() === '') continue;
      const quotedCol = dialect.quoteIdentifier(ins.name.trim());
      let type = ins.type || 'TEXT';

      if (
         dbType === 'postgres' &&
         ins.enumValues &&
         ins.enumValues.length > 0
      ) {
         if (ins.isNewEnum && ins.type) {
            const escapedName = ins.type.replace(/'/g, "''");
            const vals = ins.enumValues
               .map((v: string) => `'${dialect.escapeString(v)}'`)
               .join(', ');
            const quotedType = dialect.quoteIdentifier(ins.type);
            sqls.push(`
               DO $$
               BEGIN
                  IF NOT EXISTS (
                     SELECT 1 FROM pg_type t
                     JOIN pg_namespace n ON n.oid = t.typnamespace
                     WHERE t.typname = '${escapedName}'
                       AND (n.nspname = current_schema() OR n.nspname = 'public')
                  ) THEN
                     CREATE TYPE ${quotedType} AS ENUM (${vals});
                  END IF;
               END$$;
            `);
            type = quotedType;
         } else if (ins.type) {
            type = dialect.quoteIdentifier(ins.type);
         }
      } else if (
         dbType === 'mysql' &&
         ins.enumValues &&
         ins.enumValues.length > 0
      ) {
         const vals = ins.enumValues
            .map((v: string) => `'${dialect.escapeString(v)}'`)
            .join(', ');
         type = `ENUM(${vals})`;
      } else if (
         dbType === 'mssql' &&
         ins.enumValues &&
         ins.enumValues.length > 0
      ) {
         type = `NVARCHAR(255)`;
      }

      const nullStr = ins.nullable === false ? 'NOT NULL' : '';
      const formattedDef = formatSqlDefaultValue(ins.defaultValue);
      const defStr = formattedDef !== null ? `DEFAULT ${formattedDef}` : '';
      if (dbType === 'mssql') {
         sqls.push(
            `ALTER TABLE ${quotedTable} ADD ${quotedCol} ${type} ${nullStr} ${defStr};`,
         );
      } else {
         sqls.push(
            `ALTER TABLE ${quotedTable} ADD COLUMN ${quotedCol} ${type} ${nullStr} ${defStr};`,
         );
      }

      if (ins.fkTarget && ins.fkTarget.table && ins.fkTarget.column) {
         const fkConstraintName = dialect.quoteIdentifier(
            `fk_${tableName}_${ins.name.trim()}_${Date.now()}`,
         );
         const quotedRefTable = dialect.quoteIdentifier(ins.fkTarget.table);
         const quotedRefCol = dialect.quoteIdentifier(ins.fkTarget.column);
         let fkClause = `ALTER TABLE ${quotedTable} ADD CONSTRAINT ${fkConstraintName} FOREIGN KEY (${quotedCol}) REFERENCES ${quotedRefTable}(${quotedRefCol})`;
         if (
            ins.fkTarget.onDelete &&
            ins.fkTarget.onDelete.toUpperCase() !== 'NO ACTION'
         ) {
            fkClause += ` ON DELETE ${ins.fkTarget.onDelete.toUpperCase()}`;
         }
         if (
            ins.fkTarget.onUpdate &&
            ins.fkTarget.onUpdate.toUpperCase() !== 'NO ACTION'
         ) {
            fkClause += ` ON UPDATE ${ins.fkTarget.onUpdate.toUpperCase()}`;
         }
         sqls.push(`${fkClause};`);
      }
   }

   // 4. Index changes
   if (pendingIndexEdits) {
      for (const idxName of pendingIndexEdits.dropped) {
         if (idxName) {
            if (dbType === 'mysql') {
               sqls.push(
                  `ALTER TABLE ${quotedTable} DROP INDEX ${dialect.quoteIdentifier(idxName)};`,
               );
            } else if (dbType === 'mssql') {
               sqls.push(
                  `DROP INDEX ${dialect.quoteIdentifier(idxName)} ON ${quotedTable};`,
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
         if (dbType === 'mssql') {
            sqls.push(
               `CREATE ${uniqueStr} INDEX ${nameStr} ON ${quotedTable} (${colsStr});`,
            );
         } else {
            sqls.push(
               `CREATE ${uniqueStr} INDEX IF NOT EXISTS ${nameStr} ON ${quotedTable} (${colsStr});`,
            );
         }
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
      const quoted = adapter.quoteTable
         ? adapter.quoteTable(tableName)
         : adapter.quoteIdentifier(tableName);
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
 * Query schema information (columns) for multiple tables or all tables in the database.
 * Single source of truth shared by ORM generation, TypeScript definitions generation, and Studio.
 */
export async function getTableSchemas(
   adapter: DBAdapter,
   tables?: string[],
   includeIndexes: boolean = true,
): Promise<Result<TableSchemaInfo[]>> {
   try {
      const allTables = tables || (await adapter.getTables());
      const schemaInfos: TableSchemaInfo[] = [];
      for (const table of allTables) {
         const columns = await adapter.getSchema(table);
         let indexes = undefined;
         if (includeIndexes && typeof adapter.getIndexes === 'function') {
            try {
               indexes = await adapter.getIndexes(table);
            } catch {
               indexes = [];
            }
         }
         schemaInfos.push({ tableName: table, columns, indexes });
      }
      return ok(schemaInfos);
   } catch (e: any) {
      return err(e.message || 'Failed to get table schemas', undefined, e);
   }
}

/**
 * Find all foreign key columns in the database that reference a given table (and column).
 */
export async function findReferencingForeignKeys(
   adapter: DBAdapter,
   targetTable: string,
   targetColumn?: string,
): Promise<ReferencingForeignKey[]> {
   const schemasRes = await getTableSchemas(adapter, undefined, false);
   if (!schemasRes.success) return [];

   const refs: ReferencingForeignKey[] = [];
   const tLow = targetTable.toLowerCase();
   const cLow = targetColumn ? targetColumn.toLowerCase() : undefined;

   for (const table of schemasRes.data) {
      for (const col of table.columns) {
         if (col.fkTarget && col.fkTarget.table.toLowerCase() === tLow) {
            if (!cLow || col.fkTarget.column.toLowerCase() === cLow) {
               refs.push({
                  table: table.tableName,
                  column: col.name,
                  targetTable,
                  targetColumn: col.fkTarget.column,
                  currentType: col.type,
                  constraintName: col.fkTarget.constraintName,
                  onDelete: col.fkTarget.onDelete,
                  onUpdate: col.fkTarget.onUpdate,
                  nullable: col.nullable,
               });
            }
         }
      }
   }
   return refs;
}

/**
 * Check the impact of changing a column's type, detecting referencing foreign keys
 * and whether existing data contains non-numeric strings that require re-indexing.
 */
export async function checkCascadeImpact(
   adapter: DBAdapter,
   dbType: string,
   tableName: string,
   colName: string,
   newType: string,
): Promise<Result<CascadeImpactResult>> {
   try {
      const dialect = getDialect(dbType as any);
      const dependents = await findReferencingForeignKeys(
         adapter,
         tableName,
         colName,
      );

      const hasDependents = dependents.length > 0;
      let isNumericOnly = true;
      let needsReindexing = false;
      const sampleValues: string[] = [];

      const newTypeUpper = (newType || '').toUpperCase();
      const isNewInt =
         newTypeUpper.includes('INT') ||
         newTypeUpper === 'SERIAL' ||
         newTypeUpper === 'BIGINT';

      // Query sample of existing values in this column
      const quotedTable = dialect.quoteIdentifier(tableName);
      const quotedCol = dialect.quoteIdentifier(colName);
      try {
         const sampleRes = await adapter.query(
            `SELECT DISTINCT ${quotedCol} AS val FROM ${quotedTable} WHERE ${quotedCol} IS NOT NULL LIMIT 50;`,
         );
         if (sampleRes && sampleRes.rows) {
            for (const r of sampleRes.rows) {
               const val =
                  r.val !== undefined && r.val !== null ? String(r.val) : '';
               if (val !== '') {
                  sampleValues.push(val);
                  if (isNaN(Number(val)) || val.trim() === '') {
                     isNumericOnly = false;
                  }
               }
            }
         }
      } catch {
         // Query might fail if table is empty or column does not exist
      }

      if (isNewInt && !isNumericOnly && sampleValues.length > 0) {
         needsReindexing = true;
      }

      return ok({
         hasDependents,
         dependents,
         isNumericOnly,
         needsReindexing,
         sampleValues: sampleValues.slice(0, 10),
      });
   } catch (e: any) {
      return err(
         e.message || 'Failed to check cascade impact',
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

export async function getDatabaseEnums(
   adapter: DBAdapter,
): Promise<Result<Array<{ name: string; values: string[] }>>> {
   try {
      if (adapter.getCustomEnums) {
         const enums = await adapter.getCustomEnums();
         return ok(enums as any);
      }

      const enumsMap = new Map<string, string[]>();
      try {
         const tables = await adapter.getTables();
         for (const t of tables.slice(0, 30)) {
            const cols = await adapter.getSchema(t);
            for (const col of cols) {
               if (col.enumValues && col.enumValues.length > 0) {
                  const key =
                     col.type &&
                     ![
                        'enum',
                        'varchar',
                        'varchar(255)',
                        'text',
                        'string',
                     ].includes(col.type.toLowerCase())
                        ? col.type
                        : col.name;
                  if (!enumsMap.has(key)) {
                     enumsMap.set(key, col.enumValues);
                  }
               }
            }
         }
      } catch {}

      const data = Array.from(enumsMap.entries()).map(([name, values]) => ({
         name,
         values,
      }));

      return ok(data);
   } catch (e: any) {
      return err(e.message || 'Failed to get database enums', undefined, e);
   }
}
