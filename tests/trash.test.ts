import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../src/logic/adapters/sqlite.js';
import {
   moveToTrash,
   getTrashList,
   restoreFromTrash,
   purgeTrashItem,
   purgeAllTrash,
   isTrashTable,
   formatTrashId,
   parseTrashId,
} from '../src/logic/trash.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('trash: Database Recycle Bin & Pre-Drop Snapshots', () => {
   let adapter: SqliteAdapter;
   let tempDir: string;

   beforeEach(async () => {
      adapter = new SqliteAdapter(':memory:');
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drixio-trash-test-'));

      // Create test tables
      await adapter.executeSql(`
         CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT
         );
         INSERT INTO users (id, name, email) VALUES (1, 'Alice', 'alice@test.com');
         INSERT INTO users (id, name, email) VALUES (2, 'Bob', 'bob@test.com');

         CREATE TABLE posts (
            id INTEGER PRIMARY KEY,
            title TEXT
         );
         INSERT INTO posts (id, title) VALUES (10, 'Hello World');
      `);
   });

   afterEach(async () => {
      await adapter.close();
      try {
         await fs.rm(tempDir, { recursive: true, force: true });
      } catch {}
   });

   it('should correctly format and parse trash identifiers', () => {
      const now = 1726789123456;
      const trashId = formatTrashId('users', now);
      expect(trashId).toBe('_drixio_trash_users_1726789123456');
      expect(isTrashTable(trashId)).toBe(true);

      const parsed = parseTrashId(trashId);
      expect(parsed.originalName).toBe('users');
      expect(parsed.deletedAt).toBe(now);
   });

   it('should soft-delete table, save local snapshot, and exclude from getTables()', async () => {
      const moveRes = await moveToTrash(adapter, 'sqlite', 'users', tempDir);
      expect(moveRes.success).toBe(true);
      if (!moveRes.success) return;

      expect(moveRes.data.rowCount).toBe(2);
      expect(moveRes.data.trashId).toMatch(/^_drixio_trash_users_\d+$/);

      // Active tables must NOT include 'users' or the trash table
      const activeTables = await adapter.getTables();
      expect(activeTables).not.toContain('users');
      expect(activeTables.some((t) => isTrashTable(t))).toBe(false);
      expect(activeTables).toContain('posts');

      // Check that snapshot backup file was written
      expect(moveRes.data.backupPath).toBeDefined();
      const backupContent = await fs.readFile(moveRes.data.backupPath!, 'utf-8');
      const snapshot = JSON.parse(backupContent);
      expect(snapshot.tableName).toBe('users');
      expect(snapshot.rowCount).toBe(2);
      expect(snapshot.rows).toHaveLength(2);
      expect(snapshot.rows[0].name).toBe('Alice');
   });

   it('should discover soft-deleted tables in getTrashList()', async () => {
      await moveToTrash(adapter, 'sqlite', 'users', tempDir);

      const listRes = await getTrashList(adapter, tempDir);
      expect(listRes.success).toBe(true);
      if (!listRes.success) return;

      expect(listRes.data).toHaveLength(1);
      const item = listRes.data[0];
      expect(item.originalName).toBe('users');
      expect(item.rowCount).toBe(2);
      expect(item.hasLocalBackup).toBe(true);
      expect(item.backupFilePath).toBeDefined();
   });

   it('should restore table back with original data intact', async () => {
      const moveRes = await moveToTrash(adapter, 'sqlite', 'users', tempDir);
      expect(moveRes.success).toBe(true);
      if (!moveRes.success) return;

      const trashId = moveRes.data.trashId;
      const restoreRes = await restoreFromTrash(adapter, 'sqlite', trashId);
      expect(restoreRes.success).toBe(true);
      if (!restoreRes.success) return;

      expect(restoreRes.data.restoredTable).toBe('users');

      // 'users' must reappear in active tables
      const activeTables = await adapter.getTables();
      expect(activeTables).toContain('users');

      // Verify row data is 100% intact
      const queryRes = await adapter.query('SELECT * FROM users ORDER BY id');
      expect(queryRes.rows).toHaveLength(2);
      expect(queryRes.rows[0].name).toBe('Alice');
      expect(queryRes.rows[1].name).toBe('Bob');

      // Trash list must now be empty
      const listRes = await getTrashList(adapter, tempDir);
      expect(listRes.success && listRes.data).toHaveLength(0);
   });

   it('should handle collision when restoring if active table already exists', async () => {
      const moveRes = await moveToTrash(adapter, 'sqlite', 'users', tempDir);
      expect(moveRes.success).toBe(true);
      if (!moveRes.success) return;

      // Recreate a table named 'users'
      await adapter.executeSql(`CREATE TABLE users (id INT);`);

      // Restore without custom name -> should assign fallback name
      const restoreRes = await restoreFromTrash(adapter, 'sqlite', moveRes.data.trashId);
      expect(restoreRes.success).toBe(true);
      if (!restoreRes.success) return;

      expect(restoreRes.data.restoredTable).toMatch(/^users_restored_\d+$/);

      const activeTables = await adapter.getTables();
      expect(activeTables).toContain('users');
      expect(activeTables).toContain(restoreRes.data.restoredTable);
   });

   it('should permanently purge single trash item', async () => {
      const moveRes = await moveToTrash(adapter, 'sqlite', 'users', tempDir);
      expect(moveRes.success).toBe(true);
      if (!moveRes.success) return;

      const purgeRes = await purgeTrashItem(adapter, 'sqlite', moveRes.data.trashId);
      expect(purgeRes.success).toBe(true);

      // Verify table is physically gone from database
      const listRes = await getTrashList(adapter, tempDir);
      expect(listRes.success && listRes.data).toHaveLength(0);

      // Raw query should fail
      await expect(adapter.query(`SELECT * FROM ${moveRes.data.trashId}`)).rejects.toThrow();
   });

   it('should purge all trash tables in batch', async () => {
      await moveToTrash(adapter, 'sqlite', 'users', tempDir);
      await moveToTrash(adapter, 'sqlite', 'posts', tempDir);

      const listBefore = await getTrashList(adapter, tempDir);
      expect(listBefore.success && listBefore.data).toHaveLength(2);

      const purgeAllRes = await purgeAllTrash(adapter, 'sqlite', tempDir);
      expect(purgeAllRes.success).toBe(true);
      if (!purgeAllRes.success) return;
      expect(purgeAllRes.data.purgedCount).toBe(2);

      const listAfter = await getTrashList(adapter, tempDir);
      expect(listAfter.success && listAfter.data).toHaveLength(0);
   });
});

