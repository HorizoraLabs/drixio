import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../src/logic/adapters/sqlite.js';
import { runSchemaHealthCheck } from '../src/logic/health.js';

describe('Schema Health Doctor: runSchemaHealthCheck', () => {
   let adapter: SqliteAdapter;

   beforeEach(async () => {
      adapter = new SqliteAdapter(':memory:');
   });

   afterEach(async () => {
      await adapter.close();
   });

   it('should give grade A and 100 score for a healthy schema', async () => {
      await adapter.executeSql(`
         CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
         );
      `);

      const res = await runSchemaHealthCheck(adapter, 'sqlite');
      expect(res.success).toBe(true);
      if (res.success) {
         expect(res.data.grade).toBe('A');
         expect(res.data.score).toBeGreaterThanOrEqual(90);
         expect(res.data.analyzedTablesCount).toBe(1);
         expect(res.data.issuesCount.critical).toBe(0);
      }
   });

   it('should detect table with missing Primary Key as critical issue', async () => {
      await adapter.executeSql(`
         CREATE TABLE logs (
            message TEXT,
            timestamp TEXT
         );
      `);

      const res = await runSchemaHealthCheck(adapter, 'sqlite');
      expect(res.success).toBe(true);
      if (res.success) {
         const missingPkIssue = res.data.issues.find(
            (i) => i.id === 'missing-pk-logs',
         );
         expect(missingPkIssue).toBeDefined();
         expect(missingPkIssue?.severity).toBe('critical');
         expect(missingPkIssue?.impact).toContain('ORMs');
         expect(missingPkIssue?.remediationSql).toContain('PRIMARY KEY');
         expect(res.data.score).toBeLessThan(100);
      }
   });

   it('should detect unindexed Foreign Key columns as critical issue', async () => {
      await adapter.executeSql(`
         CREATE TABLE parents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL DEFAULT ''
         );
         CREATE TABLE children (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id INTEGER REFERENCES parents(id),
            child_name TEXT NOT NULL DEFAULT ''
         );
      `);

      const res = await runSchemaHealthCheck(adapter, 'sqlite');
      expect(res.success).toBe(true);
      if (res.success) {
         const unindexedFk = res.data.issues.find(
            (i) => i.id === 'unindexed-fk-children-parent_id',
         );
         expect(unindexedFk).toBeDefined();
         expect(unindexedFk?.severity).toBe('critical');
         expect(unindexedFk?.remediationSql).toContain('CREATE INDEX');
         expect(unindexedFk?.remediationSql).toContain('parent_id');
      }
   });

   it('should detect duplicate redundant indexes', async () => {
      await adapter.executeSql(`
         CREATE TABLE products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sku TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT ''
         );
         CREATE INDEX idx_sku_1 ON products(sku);
         CREATE INDEX idx_sku_2 ON products(sku);
      `);

      const res = await runSchemaHealthCheck(adapter, 'sqlite');
      expect(res.success).toBe(true);
      if (res.success) {
         const dupIndex = res.data.issues.find((i) =>
            i.id.startsWith('duplicate-index-products'),
         );
         expect(dupIndex).toBeDefined();
         expect(dupIndex?.severity).toBe('warning');
         expect(dupIndex?.remediationSql).toContain('DROP INDEX');
      }
   });

   it('should detect unconstrained categorical columns', async () => {
      await adapter.executeSql(`
         CREATE TABLE orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status TEXT NOT NULL DEFAULT 'pending'
         );
      `);

      const res = await runSchemaHealthCheck(adapter, 'sqlite');
      expect(res.success).toBe(true);
      if (res.success) {
         const catIssue = res.data.issues.find(
            (i) => i.id === 'unconstrained-categorical-orders-status',
         );
         expect(catIssue).toBeDefined();
         expect(catIssue?.severity).toBe('suggestion');
         expect(catIssue?.remediationSql).toContain('CHECK');
      }
   });

   it('should clamp scores between 15 and 100 and assign grade D on catastrophic schemas', async () => {
      // Create 5 tables missing PKs and with unconstrained text
      for (let i = 1; i <= 5; i++) {
         await adapter.executeSql(`
            CREATE TABLE bad_${i} (
               status TEXT NOT NULL,
               type TEXT NOT NULL,
               role TEXT NOT NULL
            );
         `);
      }

      const res = await runSchemaHealthCheck(adapter, 'sqlite');
      expect(res.success).toBe(true);
      if (res.success) {
         expect(res.data.score).toBeGreaterThanOrEqual(15);
         expect(res.data.score).toBeLessThanOrEqual(50);
         expect(['C', 'D']).toContain(res.data.grade);
         expect(res.data.issuesCount.critical).toBeGreaterThanOrEqual(5);
      }
   });
});

