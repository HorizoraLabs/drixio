import fs from 'node:fs/promises';
import path from 'node:path';
import { DBAdapter, Result, ok, okVoid, err } from './types.js';
import { dropTable } from './schema.js';
import { getDialect } from './dialect.js';

export const TRASH_TABLE_PREFIX = '_drixio_trash_';

async function doRenameTable(
   adapter: DBAdapter,
   dbType: string,
   oldName: string,
   newName: string,
): Promise<void> {
   if (typeof adapter.renameTable === 'function') {
      await adapter.renameTable(oldName, newName);
   } else {
      const dialect = getDialect(dbType as any);
      let sql = '';
      if (dbType === 'mysql') {
         sql = `RENAME TABLE ${dialect.quoteIdentifier(oldName)} TO ${dialect.quoteIdentifier(newName)};`;
      } else if (dbType === 'mssql') {
         sql = `EXEC sp_rename '${oldName.replace(/'/g, "''")}', '${newName.replace(/'/g, "''")}';`;
      } else {
         sql = `ALTER TABLE ${dialect.quoteIdentifier(oldName)} RENAME TO ${dialect.quoteIdentifier(newName)};`;
      }
      await adapter.executeSql(sql);
   }
}

export interface TrashItem {
   trashId: string;
   originalName: string;
   deletedAt: number;
   deletedAtStr: string;
   rowCount: number;
   hasLocalBackup: boolean;
   backupFilePath?: string;
}

/**
 * Checks whether a given table name is a Drixio soft-deleted trash table.
 */
export function isTrashTable(tableName: string): boolean {
   return tableName.startsWith(TRASH_TABLE_PREFIX);
}

/**
 * Encodes an original table name and timestamp into a trash table identifier.
 */
export function formatTrashId(tableName: string, timestamp: number = Date.now()): string {
   // Sanitize table name: keep alphanumeric and underscores
   const cleanName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
   return `${TRASH_TABLE_PREFIX}${cleanName}_${timestamp}`;
}

/**
 * Extracts the original table name and deletion timestamp from a trash table identifier.
 */
export function parseTrashId(trashId: string): { originalName: string; deletedAt: number } {
   if (!trashId.startsWith(TRASH_TABLE_PREFIX)) {
      return { originalName: trashId, deletedAt: 0 };
   }

   const body = trashId.slice(TRASH_TABLE_PREFIX.length);
   const lastUnderscore = body.lastIndexOf('_');

   if (lastUnderscore !== -1) {
      const tsStr = body.slice(lastUnderscore + 1);
      const ts = parseInt(tsStr, 10);
      if (!isNaN(ts) && ts > 0) {
         return {
            originalName: body.slice(0, lastUnderscore),
            deletedAt: ts,
         };
      }
   }

   return { originalName: body, deletedAt: 0 };
}

/**
 * Moves an active table to the Recycle Bin:
 * 1. Takes a complete local schema DDL + data snapshot and writes to `<cwd>/.drixio/backups/`.
 * 2. Renames the database table to `_drixio_trash_${name}_${timestamp}` (1ms rename).
 */
export async function moveToTrash(
   adapter: DBAdapter,
   dbType: string,
   tableName: string,
   cwd: string = process.cwd(),
): Promise<Result<{ trashId: string; backupPath?: string; rowCount: number }>> {
   try {
      const activeTables = await adapter.getTables();
      if (!activeTables.includes(tableName)) {
         return err(`Table "${tableName}" does not exist in the active database.`);
      }

      const timestamp = Date.now();
      const trashId = formatTrashId(tableName, timestamp);

      // 1. Capture snapshot before renaming
      let rowCount = 0;
      let backupPath: string | undefined;

      try {
         const schema = await adapter.getSchema(tableName);
         const dataRes = await adapter.getData(tableName, 100000, 0); // Export up to 100k rows
         rowCount = dataRes.rows.length;

         const backupDir = path.join(cwd, '.drixio', 'backups');
         await fs.mkdir(backupDir, { recursive: true });

         const dateStr = new Date(timestamp).toISOString().replace(/[:.]/g, '-');
         const backupFileName = `${tableName}_${dateStr}.json`;
         backupPath = path.join(backupDir, backupFileName);

         const snapshotPayload = {
            drixioVersion: '1.2.1',
            tableName,
            dbType,
            deletedAt: timestamp,
            deletedAtStr: new Date(timestamp).toISOString(),
            schema,
            rowCount,
            rows: dataRes.rows,
         };

         await fs.writeFile(backupPath, JSON.stringify(snapshotPayload, null, 2), 'utf-8');
      } catch (backupErr) {
         // Snapshot failure should not prevent moving to trash, but log warning
         console.warn('[Drixio Trash] Could not write local snapshot file:', backupErr);
      }

      // 2. Atomic Rename Table in database
      await doRenameTable(adapter, dbType, tableName, trashId);

      return ok({
         trashId,
         backupPath,
         rowCount,
      });
   } catch (e: any) {
      return err(e.message || `Failed to move table "${tableName}" to trash.`, undefined, e);
   }
}

/**
 * Discovers and lists all items currently in the Recycle Bin.
 */
export async function getTrashList(
   adapter: DBAdapter,
   cwd: string = process.cwd(),
): Promise<Result<TrashItem[]>> {
   try {
      let rawTables: string[] = [];
      if (typeof adapter.getTrashTables === 'function') {
         rawTables = await adapter.getTrashTables();
      } else {
         // Fallback: query database directly based on adapter
         const isSqlite = typeof (adapter as any).dbPath === 'string';
         const isPostgres = typeof (adapter as any).currentSchema === 'string';
         const queryStr = isSqlite
            ? `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '${TRASH_TABLE_PREFIX}%'`
            : isPostgres
              ? `SELECT tablename FROM pg_catalog.pg_tables WHERE tablename LIKE '${TRASH_TABLE_PREFIX}%'`
              : `SHOW TABLES LIKE '${TRASH_TABLE_PREFIX}%'`;
         const res = await adapter
            .query(queryStr)
            .catch(() => ({ columns: [], rows: [] }));
         rawTables = (res.rows || []).map((r) => Object.values(r)[0] as string);
      }

      const backupDir = path.join(cwd, '.drixio', 'backups');
      let backupFiles: string[] = [];
      try {
         backupFiles = await fs.readdir(backupDir);
      } catch {
         // No backup folder yet
      }

      const items: TrashItem[] = [];

      for (const trashId of rawTables) {
         if (!isTrashTable(trashId)) continue;
         const { originalName, deletedAt } = parseTrashId(trashId);

         // Fetch approximate/exact row count
         let rowCount = 0;
         try {
            const countRes = await adapter.query(
               `SELECT COUNT(*) as cnt FROM ${adapter.quoteTable ? adapter.quoteTable(trashId) : adapter.quoteIdentifier(trashId)}`,
            );
            const rawCnt = countRes.rows[0]?.cnt || countRes.rows[0]?.count || 0;
            rowCount = parseInt(String(rawCnt), 10) || 0;
         } catch {
            // Count query error fallback
         }

         // Check if a corresponding local backup exists
         const matchedBackup = backupFiles.find((f) =>
            f.startsWith(`${originalName}_`) && f.endsWith('.json'),
         );

         items.push({
            trashId,
            originalName,
            deletedAt,
            deletedAtStr: deletedAt > 0 ? new Date(deletedAt).toLocaleString() : 'Unknown date',
            rowCount,
            hasLocalBackup: !!matchedBackup,
            backupFilePath: matchedBackup ? path.join(backupDir, matchedBackup) : undefined,
         });
      }

      // Sort newest deletions first
      items.sort((a, b) => b.deletedAt - a.deletedAt);

      return ok(items);
   } catch (e: any) {
      return err(e.message || 'Failed to list items from trash.', undefined, e);
   }
}

/**
 * Restores a table from the Recycle Bin back into active database tables.
 */
export async function restoreFromTrash(
   adapter: DBAdapter,
   dbType: string,
   trashId: string,
   customName?: string,
): Promise<Result<{ restoredTable: string }>> {
   try {
      if (!isTrashTable(trashId)) {
         return err(`"${trashId}" is not a valid trash table.`);
      }

      const { originalName } = parseTrashId(trashId);
      let targetName = (customName || originalName).trim();

      const activeTables = await adapter.getTables();
      if (activeTables.includes(targetName)) {
         // Collision: table already exists
         if (!customName) {
            targetName = `${originalName}_restored_${Date.now()}`;
         } else {
            return err(`Active table "${targetName}" already exists. Please choose a different restoration name.`);
         }
      }

      await doRenameTable(adapter, dbType, trashId, targetName);

      return ok({ restoredTable: targetName });
   } catch (e: any) {
      return err(e.message || `Failed to restore table "${trashId}".`, undefined, e);
   }
}

/**
 * Permanently drops a single table from the Recycle Bin (physical DROP TABLE).
 */
export async function purgeTrashItem(
   adapter: DBAdapter,
   dbType: string,
   trashId: string,
): Promise<Result<void>> {
   try {
      if (!isTrashTable(trashId)) {
         return err(`"${trashId}" is not a valid trash table.`);
      }

      return await dropTable(adapter, dbType, trashId);
   } catch (e: any) {
      return err(e.message || `Failed to permanently purge "${trashId}".`, undefined, e);
   }
}

/**
 * Empties all tables currently residing in the Recycle Bin (batch physical DROP).
 */
export async function purgeAllTrash(
   adapter: DBAdapter,
   dbType: string,
   cwd: string = process.cwd(),
): Promise<Result<{ purgedCount: number }>> {
   try {
      const trashListRes = await getTrashList(adapter, cwd);
      if (!trashListRes.success) {
         return err(trashListRes.error);
      }

      const items = trashListRes.data;
      let purgedCount = 0;

      for (const item of items) {
         const dropRes = await dropTable(adapter, dbType, item.trashId);
         if (dropRes.success) {
            purgedCount++;
         }
      }

      return ok({ purgedCount });
   } catch (e: any) {
      return err(e.message || 'Failed to empty recycle bin.', undefined, e);
   }
}
