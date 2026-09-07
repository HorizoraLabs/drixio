import {
   DBAdapter,
   TableSchemaInfo,
   ColumnSchema,
   IndexSchema,
   SchemaSnapshot,
   ColumnDiff,
   TableDiff,
   SchemaDiffStats,
   SchemaDiffResult,
   Result,
   ok,
   err,
} from './types.js';
import { getDialect } from './dialect.js';
import { getTableSchemas } from './schema.js';

/**
 * Normalizes SQL column types across dialects for reliable comparison.
 */
export function normalizeType(rawType: string): string {
   if (!rawType) return 'TEXT';
   const clean = rawType.trim().toLowerCase();

   if (
      clean === 'int' ||
      clean === 'integer' ||
      clean === 'int4' ||
      clean === 'serial' ||
      clean.startsWith('int(')
   ) {
      return 'INTEGER';
   }
   if (
      clean === 'bigint' ||
      clean === 'int8' ||
      clean === 'bigserial' ||
      clean.startsWith('bigint(')
   ) {
      return 'BIGINT';
   }
   if (
      clean === 'smallint' ||
      clean === 'int2' ||
      clean === 'smallserial' ||
      clean.startsWith('smallint(')
   ) {
      return 'SMALLINT';
   }
   if (clean === 'tinyint(1)' || clean === 'bool' || clean === 'boolean') {
      return 'BOOLEAN';
   }
   if (
      clean.includes('char') ||
      clean.includes('string') ||
      clean.includes('text') ||
      clean.includes('clob')
   ) {
      // Normalize varchar(X) length if present
      const match = clean.match(/varchar\((\d+)\)/);
      if (match) return `VARCHAR(${match[1]})`;
      if (clean.includes('text')) return 'TEXT';
      return 'VARCHAR(255)';
   }
   if (
      clean === 'decimal' ||
      clean === 'numeric' ||
      clean.startsWith('decimal(') ||
      clean.startsWith('numeric(')
   ) {
      return 'NUMERIC';
   }
   if (
      clean === 'float' ||
      clean === 'double' ||
      clean === 'real' ||
      clean === 'double precision'
   ) {
      return 'REAL';
   }
   if (clean.includes('timestamp') || clean.includes('datetime')) {
      return 'TIMESTAMP';
   }
   if (clean === 'date') return 'DATE';
   if (clean === 'time') return 'TIME';
   if (clean === 'json' || clean === 'jsonb') return 'JSON';
   if (clean === 'blob' || clean === 'bytea' || clean === 'binary')
      return 'BLOB';

   return rawType.toUpperCase();
}

/**
 * Normalizes default value expressions.
 */
export function normalizeDefault(rawDefault?: string): string | undefined {
   if (rawDefault === undefined || rawDefault === null) return undefined;
   const trimmed = String(rawDefault).trim();
   if (!trimmed || trimmed.toLowerCase() === 'null') return undefined;

   // Normalize timestamp defaults
   if (
      trimmed.toUpperCase() === 'CURRENT_TIMESTAMP' ||
      trimmed.toLowerCase() === 'now()' ||
      trimmed.toUpperCase().includes('CURRENT_TIMESTAMP')
   ) {
      return 'CURRENT_TIMESTAMP';
   }

   // Strip outer quotes for basic string comparison: "'hello'" -> "hello"
   if (
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
   ) {
      return trimmed.slice(1, -1);
   }

   return trimmed;
}

/**
 * Capture and return a full SchemaSnapshot from a live database adapter.
 */
export async function createSchemaSnapshot(
   adapter: DBAdapter,
   dbType: string,
   dbName: string = 'database',
): Promise<Result<SchemaSnapshot>> {
   try {
      const schemasRes = await getTableSchemas(adapter, undefined, true);
      if (!schemasRes.success) {
         return err(schemasRes.error, schemasRes.code, schemasRes.cause);
      }

      const snapshot: SchemaSnapshot = {
         version: 1,
         createdAt: new Date().toISOString(),
         dbType,
         dbName,
         tables: schemasRes.data,
      };

      return ok(snapshot);
   } catch (e: any) {
      return err(e.message || 'Failed to create schema snapshot', undefined, e);
   }
}

/**
 * Compare two sets of TableSchemaInfo and return an extensive SchemaDiffResult.
 * Computes forward migration SQL and rollback SQL for the specified dialect.
 */
export function compareSchemas(
   sourceTables: TableSchemaInfo[],
   targetTables: TableSchemaInfo[],
   dbType: string,
   sourceName: string = 'Current Database',
   targetName: string = 'Target Schema',
): SchemaDiffResult {
   const sourceMap = new Map<string, TableSchemaInfo>();
   for (const t of sourceTables) {
      sourceMap.set(t.tableName.toLowerCase(), t);
   }

   const targetMap = new Map<string, TableSchemaInfo>();
   for (const t of targetTables) {
      targetMap.set(t.tableName.toLowerCase(), t);
   }

   const tableDiffs: TableDiff[] = [];

   let addedTablesCount = 0;
   let droppedTablesCount = 0;
   let alteredTablesCount = 0;
   let addedColumnsCount = 0;
   let droppedColumnsCount = 0;
   let modifiedColumnsCount = 0;
   let addedIndexesCount = 0;
   let droppedIndexesCount = 0;

   // 1. Check for Added Tables (in target, not in source)
   for (const targetTable of targetTables) {
      const lowName = targetTable.tableName.toLowerCase();
      if (!sourceMap.has(lowName)) {
         addedTablesCount++;
         addedColumnsCount += targetTable.columns.length;
         if (targetTable.indexes) {
            addedIndexesCount += targetTable.indexes.length;
         }

         tableDiffs.push({
            tableName: targetTable.tableName,
            type: 'added',
            addedColumns: targetTable.columns,
            droppedColumns: [],
            modifiedColumns: [],
            addedIndexes: targetTable.indexes || [],
            droppedIndexes: [],
         });
      }
   }

   // 2. Check for Dropped Tables (in source, not in target)
   for (const sourceTable of sourceTables) {
      const lowName = sourceTable.tableName.toLowerCase();
      if (!targetMap.has(lowName)) {
         droppedTablesCount++;
         droppedColumnsCount += sourceTable.columns.length;
         if (sourceTable.indexes) {
            droppedIndexesCount += sourceTable.indexes.length;
         }

         tableDiffs.push({
            tableName: sourceTable.tableName,
            type: 'dropped',
            addedColumns: [],
            droppedColumns: sourceTable.columns,
            modifiedColumns: [],
            addedIndexes: [],
            droppedIndexes: sourceTable.indexes || [],
         });
      }
   }

   // 3. Check for Altered Tables (in both source and target)
   for (const targetTable of targetTables) {
      const lowName = targetTable.tableName.toLowerCase();
      const sourceTable = sourceMap.get(lowName);
      if (!sourceTable) continue;

      const sourceColMap = new Map<string, ColumnSchema>();
      for (const col of sourceTable.columns) {
         sourceColMap.set(col.name.toLowerCase(), col);
      }

      const targetColMap = new Map<string, ColumnSchema>();
      for (const col of targetTable.columns) {
         targetColMap.set(col.name.toLowerCase(), col);
      }

      const addedCols: ColumnSchema[] = [];
      const droppedCols: ColumnSchema[] = [];
      const modifiedCols: ColumnDiff[] = [];

      // Columns in target not in source -> Added
      for (const tCol of targetTable.columns) {
         if (!sourceColMap.has(tCol.name.toLowerCase())) {
            addedCols.push(tCol);
         }
      }

      // Columns in source not in target -> Dropped
      for (const sCol of sourceTable.columns) {
         if (!targetColMap.has(sCol.name.toLowerCase())) {
            droppedCols.push(sCol);
         }
      }

      // Columns in both -> check modifications
      for (const tCol of targetTable.columns) {
         const sCol = sourceColMap.get(tCol.name.toLowerCase());
         if (!sCol) continue;

         const sTypeNorm = normalizeType(sCol.type);
         const tTypeNorm = normalizeType(tCol.type);
         const typeChanged = sTypeNorm !== tTypeNorm;

         const sNullable = !!sCol.nullable;
         const tNullable = !!tCol.nullable;
         const nullableChanged = sNullable !== tNullable;

         const sDefNorm = normalizeDefault(sCol.defaultValue);
         const tDefNorm = normalizeDefault(tCol.defaultValue);
         const defaultChanged = sDefNorm !== tDefNorm;

         const sPk = !!sCol.isPk;
         const tPk = !!tCol.isPk;
         const pkChanged = sPk !== tPk;

         if (typeChanged || nullableChanged || defaultChanged || pkChanged) {
            modifiedCols.push({
               name: tCol.name,
               oldType: sCol.type,
               newType: tCol.type,
               oldNullable: sCol.nullable,
               newNullable: tCol.nullable,
               oldDefault: sCol.defaultValue,
               newDefault: tCol.defaultValue,
               oldPk: sCol.isPk,
               newPk: tCol.isPk,
            });
         }
      }

      // Index comparisons
      const sourceIndexes = sourceTable.indexes || [];
      const targetIndexes = targetTable.indexes || [];
      const addedIdxs: IndexSchema[] = [];
      const droppedIdxs: IndexSchema[] = [];

      const sourceIdxMap = new Map<string, IndexSchema>();
      for (const idx of sourceIndexes) {
         const key = `${idx.columns
            .map((c) => c.toLowerCase())
            .sort()
            .join(',')}:${idx.isUnique}`;
         sourceIdxMap.set(key, idx);
      }

      const targetIdxMap = new Map<string, IndexSchema>();
      for (const idx of targetIndexes) {
         const key = `${idx.columns
            .map((c) => c.toLowerCase())
            .sort()
            .join(',')}:${idx.isUnique}`;
         targetIdxMap.set(key, idx);
         if (!sourceIdxMap.has(key)) {
            addedIdxs.push(idx);
         }
      }

      for (const idx of sourceIndexes) {
         const key = `${idx.columns
            .map((c) => c.toLowerCase())
            .sort()
            .join(',')}:${idx.isUnique}`;
         if (!targetIdxMap.has(key)) {
            droppedIdxs.push(idx);
         }
      }

      if (
         addedCols.length > 0 ||
         droppedCols.length > 0 ||
         modifiedCols.length > 0 ||
         addedIdxs.length > 0 ||
         droppedIdxs.length > 0
      ) {
         alteredTablesCount++;
         addedColumnsCount += addedCols.length;
         droppedColumnsCount += droppedCols.length;
         modifiedColumnsCount += modifiedCols.length;
         addedIndexesCount += addedIdxs.length;
         droppedIndexesCount += droppedIdxs.length;

         tableDiffs.push({
            tableName: targetTable.tableName,
            type: 'altered',
            addedColumns: addedCols,
            droppedColumns: droppedCols,
            modifiedColumns: modifiedCols,
            addedIndexes: addedIdxs,
            droppedIndexes: droppedIdxs,
         });
      }
   }

   const stats: SchemaDiffStats = {
      addedTablesCount,
      droppedTablesCount,
      alteredTablesCount,
      addedColumnsCount,
      droppedColumnsCount,
      modifiedColumnsCount,
      addedIndexesCount,
      droppedIndexesCount,
   };

   const hasChanges =
      addedTablesCount > 0 || droppedTablesCount > 0 || alteredTablesCount > 0;

   const diffResultPartial: SchemaDiffResult = {
      hasChanges,
      sourceName,
      targetName,
      tables: tableDiffs,
      stats,
      migrationSql: '',
      rollbackSql: '',
   };

   diffResultPartial.migrationSql = generateMigrationSql(
      diffResultPartial,
      dbType,
   );
   diffResultPartial.rollbackSql = generateRollbackSql(
      diffResultPartial,
      dbType,
   );

   return diffResultPartial;
}

/**
 * Generate Forward Migration SQL for SQLite, PostgreSQL, or MySQL.
 */
export function generateMigrationSql(
   diff: SchemaDiffResult,
   dbType: string,
): string {
   if (!diff.hasChanges) {
      return '-- No schema changes detected. Schemas are identical.\n';
   }

   const dialect = getDialect(dbType as any);
   const lines: string[] = [];
   const timestamp = new Date().toISOString();

   lines.push(`-- Drixio Migration Script`);
   lines.push(`-- Source: ${diff.sourceName}`);
   lines.push(`-- Target: ${diff.targetName}`);
   lines.push(`-- Generated At: ${timestamp}`);
   lines.push(`-- Target Engine: ${dbType.toUpperCase()}\n`);

   // 1. CREATE TABLES (added tables)
   const addedTables = diff.tables.filter((t) => t.type === 'added');
   if (addedTables.length > 0) {
      lines.push(`-- =============================================`);
      lines.push(`-- 1. Create Added Tables`);
      lines.push(`-- =============================================\n`);
      for (const t of addedTables) {
         const ddl = dialect.buildCreateTable(t.tableName, t.addedColumns);
         lines.push(ddl);
         lines.push('');

         // Create any indexes for this newly created table
         for (const idx of t.addedIndexes) {
            const idxName =
               idx.name || `idx_${t.tableName}_${idx.columns.join('_')}`;
            const uniqueStr = idx.isUnique ? 'UNIQUE ' : '';
            const colsStr = idx.columns
               .map((c) => dialect.quoteIdentifier(c))
               .join(', ');
            lines.push(
               `CREATE ${uniqueStr}INDEX IF NOT EXISTS ${dialect.quoteIdentifier(idxName)} ON ${dialect.quoteIdentifier(t.tableName)} (${colsStr});`,
            );
         }
         if (t.addedIndexes.length > 0) lines.push('');
      }
   }

   // 2. ALTER TABLES (altered tables)
   const alteredTables = diff.tables.filter((t) => t.type === 'altered');
   if (alteredTables.length > 0) {
      lines.push(`-- =============================================`);
      lines.push(`-- 2. Alter Existing Tables`);
      lines.push(`-- =============================================\n`);

      for (const t of alteredTables) {
         const qTable = dialect.quoteIdentifier(t.tableName);

         // A. Add Columns
         for (const col of t.addedColumns) {
            const qCol = dialect.quoteIdentifier(col.name);
            let typeStr = col.type || 'TEXT';
            if (col.nullable === false) typeStr += ' NOT NULL';
            if (col.defaultValue !== undefined && col.defaultValue !== null) {
               typeStr += ` DEFAULT '${dialect.escapeString(col.defaultValue)}'`;
            }
            lines.push(`ALTER TABLE ${qTable} ADD COLUMN ${qCol} ${typeStr};`);
         }

         // B. Drop Columns
         for (const col of t.droppedColumns) {
            const qCol = dialect.quoteIdentifier(col.name);
            lines.push(`ALTER TABLE ${qTable} DROP COLUMN ${qCol};`);
         }

         // C. Modify Columns
         for (const mod of t.modifiedColumns) {
            const qCol = dialect.quoteIdentifier(mod.name);
            const newType = mod.newType || 'TEXT';

            if (dbType === 'postgres') {
               if (mod.oldType !== mod.newType) {
                  lines.push(
                     `ALTER TABLE ${qTable} ALTER COLUMN ${qCol} TYPE ${newType};`,
                  );
               }
               if (mod.oldNullable !== mod.newNullable) {
                  if (mod.newNullable === false) {
                     lines.push(
                        `ALTER TABLE ${qTable} ALTER COLUMN ${qCol} SET NOT NULL;`,
                     );
                  } else {
                     lines.push(
                        `ALTER TABLE ${qTable} ALTER COLUMN ${qCol} DROP NOT NULL;`,
                     );
                  }
               }
               if (mod.oldDefault !== mod.newDefault) {
                  if (mod.newDefault) {
                     lines.push(
                        `ALTER TABLE ${qTable} ALTER COLUMN ${qCol} SET DEFAULT '${dialect.escapeString(mod.newDefault)}';`,
                     );
                  } else {
                     lines.push(
                        `ALTER TABLE ${qTable} ALTER COLUMN ${qCol} DROP DEFAULT;`,
                     );
                  }
               }
            } else if (dbType === 'mysql') {
               const nullStr = mod.newNullable === false ? 'NOT NULL' : 'NULL';
               const defStr = mod.newDefault
                  ? `DEFAULT '${dialect.escapeString(mod.newDefault)}'`
                  : '';
               lines.push(
                  `ALTER TABLE ${qTable} MODIFY COLUMN ${qCol} ${newType} ${nullStr} ${defStr};`
                     .trim()
                     .replace(/\s+;/g, ';'),
               );
            } else if (dbType === 'sqlite') {
               lines.push(
                  `-- SQLite Warning: Column "${mod.name}" in table "${t.tableName}" requires modification (${mod.oldType} -> ${mod.newType}).`,
               );
               lines.push(
                  `-- Direct ALTER COLUMN is not supported in SQLite. Use Drixio Table Recreate or apply full table rebuild.`,
               );
            }
         }

         // D. Drop Indexes
         for (const idx of t.droppedIndexes) {
            if (idx.name) {
               if (dbType === 'mysql') {
                  lines.push(
                     `ALTER TABLE ${qTable} DROP INDEX ${dialect.quoteIdentifier(idx.name)};`,
                  );
               } else {
                  lines.push(
                     `DROP INDEX IF EXISTS ${dialect.quoteIdentifier(idx.name)};`,
                  );
               }
            }
         }

         // E. Add Indexes
         for (const idx of t.addedIndexes) {
            const idxName =
               idx.name || `idx_${t.tableName}_${idx.columns.join('_')}`;
            const uniqueStr = idx.isUnique ? 'UNIQUE ' : '';
            const colsStr = idx.columns
               .map((c) => dialect.quoteIdentifier(c))
               .join(', ');
            lines.push(
               `CREATE ${uniqueStr}INDEX IF NOT EXISTS ${dialect.quoteIdentifier(idxName)} ON ${qTable} (${colsStr});`,
            );
         }

         lines.push('');
      }
   }

   // 3. DROP TABLES (dropped tables)
   const droppedTables = diff.tables.filter((t) => t.type === 'dropped');
   if (droppedTables.length > 0) {
      lines.push(`-- =============================================`);
      lines.push(`-- 3. Drop Removed Tables`);
      lines.push(`-- =============================================\n`);
      for (const t of droppedTables) {
         lines.push(
            `DROP TABLE IF EXISTS ${dialect.quoteIdentifier(t.tableName)};`,
         );
      }
      lines.push('');
   }

   return lines.join('\n');
}

/**
 * Generate Reverse (Rollback) Migration SQL.
 */
export function generateRollbackSql(
   diff: SchemaDiffResult,
   dbType: string,
): string {
   if (!diff.hasChanges) {
      return '-- No schema changes detected. Rollback is empty.\n';
   }

   const dialect = getDialect(dbType as any);
   const lines: string[] = [];
   const timestamp = new Date().toISOString();

   lines.push(`-- Drixio Rollback Script (Down Migration)`);
   lines.push(`-- Generated At: ${timestamp}`);
   lines.push(`-- Target Engine: ${dbType.toUpperCase()}\n`);

   // 1. DROP added tables
   const addedTables = diff.tables.filter((t) => t.type === 'added');
   if (addedTables.length > 0) {
      lines.push(`-- Revert Added Tables`);
      for (const t of addedTables) {
         lines.push(
            `DROP TABLE IF EXISTS ${dialect.quoteIdentifier(t.tableName)};`,
         );
      }
      lines.push('');
   }

   // 2. REVERT altered tables
   const alteredTables = diff.tables.filter((t) => t.type === 'altered');
   if (alteredTables.length > 0) {
      lines.push(`-- Revert Altered Tables`);
      for (const t of alteredTables) {
         const qTable = dialect.quoteIdentifier(t.tableName);

         // Drop added columns
         for (const col of t.addedColumns) {
            lines.push(
               `ALTER TABLE ${qTable} DROP COLUMN ${dialect.quoteIdentifier(col.name)};`,
            );
         }

         // Re-add dropped columns
         for (const col of t.droppedColumns) {
            const qCol = dialect.quoteIdentifier(col.name);
            let typeStr = col.type || 'TEXT';
            if (col.nullable === false) typeStr += ' NOT NULL';
            if (col.defaultValue !== undefined && col.defaultValue !== null) {
               typeStr += ` DEFAULT '${dialect.escapeString(col.defaultValue)}'`;
            }
            lines.push(`ALTER TABLE ${qTable} ADD COLUMN ${qCol} ${typeStr};`);
         }

         // Revert modified columns
         for (const mod of t.modifiedColumns) {
            const qCol = dialect.quoteIdentifier(mod.name);
            const oldType = mod.oldType || 'TEXT';
            if (dbType === 'postgres') {
               if (mod.oldType !== mod.newType) {
                  lines.push(
                     `ALTER TABLE ${qTable} ALTER COLUMN ${qCol} TYPE ${oldType};`,
                  );
               }
               if (mod.oldNullable !== mod.newNullable) {
                  if (mod.newNullable === false) {
                     lines.push(
                        `ALTER TABLE ${qTable} ALTER COLUMN ${qCol} SET NOT NULL;`,
                     );
                  } else {
                     lines.push(
                        `ALTER TABLE ${qTable} ALTER COLUMN ${qCol} DROP NOT NULL;`,
                     );
                  }
               }
               if (mod.oldDefault !== mod.newDefault) {
                  if (mod.oldDefault) {
                     lines.push(
                        `ALTER TABLE ${qTable} ALTER COLUMN ${qCol} SET DEFAULT '${dialect.escapeString(mod.oldDefault)}';`,
                     );
                  } else {
                     lines.push(
                        `ALTER TABLE ${qTable} ALTER COLUMN ${qCol} DROP DEFAULT;`,
                     );
                  }
               }
            } else if (dbType === 'mysql') {
               const nullStr = mod.oldNullable === false ? 'NOT NULL' : 'NULL';
               const defStr = mod.oldDefault
                  ? `DEFAULT '${dialect.escapeString(mod.oldDefault)}'`
                  : '';
               lines.push(
                  `ALTER TABLE ${qTable} MODIFY COLUMN ${qCol} ${oldType} ${nullStr} ${defStr};`
                     .trim()
                     .replace(/\s+;/g, ';'),
               );
            }
         }

         // Drop added indexes
         for (const idx of t.addedIndexes) {
            if (idx.name) {
               if (dbType === 'mysql') {
                  lines.push(
                     `ALTER TABLE ${qTable} DROP INDEX ${dialect.quoteIdentifier(idx.name)};`,
                  );
               } else {
                  lines.push(
                     `DROP INDEX IF EXISTS ${dialect.quoteIdentifier(idx.name)};`,
                  );
               }
            }
         }

         // Re-create dropped indexes
         for (const idx of t.droppedIndexes) {
            const idxName =
               idx.name || `idx_${t.tableName}_${idx.columns.join('_')}`;
            const uniqueStr = idx.isUnique ? 'UNIQUE ' : '';
            const colsStr = idx.columns
               .map((c) => dialect.quoteIdentifier(c))
               .join(', ');
            lines.push(
               `CREATE ${uniqueStr}INDEX IF NOT EXISTS ${dialect.quoteIdentifier(idxName)} ON ${qTable} (${colsStr});`,
            );
         }

         lines.push('');
      }
   }

   // 3. RE-CREATE dropped tables
   const droppedTables = diff.tables.filter((t) => t.type === 'dropped');
   if (droppedTables.length > 0) {
      lines.push(`-- Re-create Dropped Tables`);
      for (const t of droppedTables) {
         const ddl = dialect.buildCreateTable(t.tableName, t.droppedColumns);
         lines.push(ddl);
         lines.push('');
      }
   }

   return lines.join('\n');
}

/**
 * Compare two live databases using their DBAdapters.
 */
export async function diffDatabases(
   sourceAdapter: DBAdapter,
   targetAdapter: DBAdapter,
   dbType: string,
   sourceName: string = 'Source DB',
   targetName: string = 'Target DB',
): Promise<Result<SchemaDiffResult>> {
   try {
      const [srcRes, tgtRes] = await Promise.all([
         getTableSchemas(sourceAdapter, undefined, true),
         getTableSchemas(targetAdapter, undefined, true),
      ]);

      if (!srcRes.success) {
         return err(srcRes.error, srcRes.code, srcRes.cause);
      }
      if (!tgtRes.success) {
         return err(tgtRes.error, tgtRes.code, tgtRes.cause);
      }

      const diff = compareSchemas(
         srcRes.data,
         tgtRes.data,
         dbType,
         sourceName,
         targetName,
      );

      return ok(diff);
   } catch (e: any) {
      return err(e.message || 'Failed to diff databases', undefined, e);
   }
}

/**
 * Compare a live database with a saved SchemaSnapshot.
 */
export async function diffDatabaseWithSnapshot(
   adapter: DBAdapter,
   snapshot: SchemaSnapshot,
   dbType: string,
   sourceName: string = 'Current Database',
   targetName?: string,
): Promise<Result<SchemaDiffResult>> {
   try {
      const currentRes = await getTableSchemas(adapter, undefined, true);
      if (!currentRes.success) {
         return err(currentRes.error, currentRes.code, currentRes.cause);
      }

      const effectiveTargetName =
         targetName ||
         `Snapshot (${snapshot.dbName || 'db'}, ${snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleDateString() : 'v1'})`;

      const diff = compareSchemas(
         currentRes.data,
         snapshot.tables,
         dbType,
         sourceName,
         effectiveTargetName,
      );

      return ok(diff);
   } catch (e: any) {
      return err(
         e.message || 'Failed to diff database with snapshot',
         undefined,
         e,
      );
   }
}
