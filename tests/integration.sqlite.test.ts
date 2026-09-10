import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
   createDBAdapter,
   DBAdapter,
   batchMutateTableData,
   generateAndInsertMockData,
   exportTableToCsv,
   exportTableToJson,
   truncateTable,
} from '../src/logic/index.js';

describe('SQLite Integration: Full Database Lifecycle in-memory', () => {
   let adapter: DBAdapter;

   beforeAll(() => {
      adapter = createDBAdapter({
         type: 'sqlite',
         targetUrl: ':memory:',
         source: 'manual',
      });
   });

   afterAll(async () => {
      if (adapter) {
         await adapter.close();
      }
   });

   it('1. should connect to SQLite memory instance and report healthy status', async () => {
      const status = await adapter.getStatus();
      expect(status.status).toBe('connected');
      expect(status.dbType).toBe('sqlite');
   });

   it('2. should execute DDL CREATE TABLE and inspect schema & indexes', async () => {
      // Create users table with constraints and indexes
      await adapter.executeSql(`
         CREATE TABLE test_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL,
            score INTEGER DEFAULT 100,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
         );
      `);

      await adapter.executeSql(`
         CREATE INDEX idx_users_email ON test_users (email);
      `);

      const tables = await adapter.getTables();
      expect(tables).toContain('test_users');

      const schema = await adapter.getSchema('test_users');
      expect(schema.length).toBe(6);

      const idCol = schema.find((c) => c.name === 'id');
      expect(idCol?.isPk).toBe(true);

      const emailCol = schema.find((c) => c.name === 'email');
      expect(emailCol?.nullable).toBe(false);

      const indexes = await adapter.getIndexes('test_users');
      expect(indexes.some((i) => i.columns.includes('email'))).toBe(true);
   });

   it('3. should insert records and retrieve with pagination & sorting', async () => {
      await adapter.insert('test_users', [
         { username: 'alice', email: 'alice@example.com', score: 95 },
         { username: 'bob', email: 'bob@example.com', score: 80 },
         { username: 'charlie', email: 'charlie@example.com', score: 120 },
      ]);

      const dataAsc = await adapter.getData('test_users', 10, 0, '', {
         col: 'score',
         asc: true,
      });
      expect(dataAsc.rows.length).toBe(3);
      expect(dataAsc.rows[0].username).toBe('bob'); // lowest score first

      const dataDesc = await adapter.getData('test_users', 1, 0, '', {
         col: 'score',
         asc: false,
      });
      expect(dataDesc.rows.length).toBe(1);
      expect(dataDesc.rows[0].username).toBe('charlie'); // highest score
   });

   it('4. should apply atomic batch mutations (edits, inserts, deletes)', async () => {
      const schema = await adapter.getSchema('test_users');

      // Edit id=1 (Alice), Insert David, Delete id=2 (Bob)
      const mutationRes = await batchMutateTableData(adapter, 'sqlite', {
         tableName: 'test_users',
         pkColumn: 'id',
         schema,
         edits: {
            '1': { score: 999 },
         },
         inserts: [
            { username: 'david', email: 'david@example.com', score: 50 },
         ],
         deletes: ['2'],
      });

      expect(mutationRes.success).toBe(true);

      const current = await adapter.getData('test_users', 10, 0);
      const usernames = current.rows.map((r) => r.username);

      expect(usernames).toContain('alice');
      expect(usernames).toContain('david');
      expect(usernames).not.toContain('bob'); // deleted

      const alice = current.rows.find((r) => r.username === 'alice');
      expect(alice.score).toBe(999); // updated
   });

   it('5. should perform non-destructive table recreation when modifying columns', async () => {
      if (!adapter.recreateTable) return;

      const currentSchema = await adapter.getSchema('test_users');
      // Add a new column 'bio'
      const newSchema = [
         ...currentSchema,
         {
            name: 'bio',
            type: 'TEXT',
            isPk: false,
            nullable: true,
            defaultValue: 'N/A',
         },
      ];

      await adapter.recreateTable('test_users', newSchema);

      const updatedSchema = await adapter.getSchema('test_users');
      expect(updatedSchema.some((c) => c.name === 'bio')).toBe(true);

      // Verify existing rows are retained
      const dataAfter = await adapter.getData('test_users', 10, 0);
      expect(dataAfter.rows.length).toBeGreaterThan(0);
   });

   it('6. should generate realistic mock data and insert into table', async () => {
      const mockCount = 15;
      const res = await generateAndInsertMockData(
         adapter,
         'test_users',
         mockCount,
      );

      expect(res.success).toBe(true);
      if (res.success) {
         expect(res.data.insertedCount).toBe(mockCount);
      }

      const allRows = await adapter.getData('test_users', 100, 0);
      expect(allRows.rows.length).toBeGreaterThanOrEqual(mockCount);
   });

   it('7. should export table records to CSV and JSON formats', async () => {
      const csvRes = await exportTableToCsv(adapter, 'test_users');
      expect(csvRes.success).toBe(true);
      if (csvRes.success) {
         expect(csvRes.data).toContain('username');
         expect(csvRes.data).toContain('email');
      }

      const jsonRes = await exportTableToJson(adapter, 'test_users');
      expect(jsonRes.success).toBe(true);
      if (jsonRes.success) {
         expect(Array.isArray(jsonRes.data)).toBe(true);
         expect(jsonRes.data.length).toBeGreaterThan(0);
         expect(jsonRes.data[0]).toHaveProperty('username');
      }
   });

   it('8. should truncate table and wipe out all records safely', async () => {
      const res = await truncateTable(adapter, 'test_users');
      expect(res.success).toBe(true);

      const emptyData = await adapter.getData('test_users', 10, 0);
      expect(emptyData.rows.length).toBe(0);
   });
});
