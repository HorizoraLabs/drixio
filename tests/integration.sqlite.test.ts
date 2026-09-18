import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import {
   createDBAdapter,
   DBAdapter,
   batchMutateTableData,
   generateAndInsertMockData,
   exportTableToCsv,
   exportTableToJson,
   truncateTable,
   applySchemaChanges,
} from '../src/logic/index.js';
import { registerApiRoutes } from '../src/studio/api.js';

describe('SQLite Integration: Full Database Lifecycle in-memory', () => {
   let adapter: DBAdapter;
   let app: Hono;

   beforeAll(() => {
      adapter = createDBAdapter({
         type: 'sqlite',
         targetUrl: ':memory:',
         source: 'manual',
      });
      app = new Hono();
      registerApiRoutes(app, {
         type: 'sqlite',
         targetUrl: ':memory:',
         source: 'manual',
         adapter,
      } as any);
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

   it('9. should rename table successfully', async () => {
      expect(adapter.renameTable).toBeDefined();
      await adapter.renameTable!('test_users', 'test_users_renamed');
      const tables = await adapter.getTables();
      expect(tables).toContain('test_users_renamed');
      expect(tables).not.toContain('test_users');
   });

   it('10. should create and update columns as PFK (Primary Foreign Key)', async () => {
      // Create parent table 'orders'
      await adapter.executeSql(`
         CREATE TABLE test_orders (
            id INTEGER PRIMARY KEY,
            title TEXT
         );
      `);

      // Create child table 'test_order_items'
      await adapter.executeSql(`
         CREATE TABLE test_order_items (
            order_id INTEGER,
            item_id INTEGER,
            amount INTEGER
         );
      `);

      // Use applySchemaChanges to configure order_id as PFK (both PK and FK to test_orders.id)
      const res = await applySchemaChanges(adapter, 'sqlite', {
         tableName: 'test_order_items',
         pendingEdits: {
            order_id: {
               isPk: 'PFK: test_orders.id' as any,
               fkTarget: {
                  table: 'test_orders',
                  column: 'id',
               },
            },
            item_id: {
               isPk: true,
            },
         },
      });

      expect(res.success).toBe(true);

      const schema = await adapter.getSchema('test_order_items');
      const orderIdCol = schema.find((c) => c.name === 'order_id');
      expect(orderIdCol).toBeDefined();
      expect(orderIdCol?.isPk).toBe(true);
      expect(orderIdCol?.fkTarget).toBeDefined();
      expect(orderIdCol?.fkTarget?.table).toBe('test_orders');
      expect(orderIdCol?.fkTarget?.column).toBe('id');

      const itemIdCol = schema.find((c) => c.name === 'item_id');
      expect(itemIdCol?.isPk).toBe(true);
   });

   it('11. should mutate composite primary key records accurately without touching other rows sharing partial PK', async () => {
      // Insert parent orders first
      await adapter.executeSql(`
         INSERT INTO test_orders (id, title) VALUES (1, 'Order 1'), (2, 'Order 2');
      `);

      // Insert child rows sharing order_id = 1
      await adapter.executeSql(`
         INSERT INTO test_order_items (order_id, item_id, amount) VALUES
         (1, 10, 100),
         (1, 20, 200),
         (2, 10, 300);
      `);

      const schema = await adapter.getSchema('test_order_items');
      const pkColumns = ['order_id', 'item_id'];

      // Update only row (1, 10)
      const updateKey = JSON.stringify({ order_id: 1, item_id: 10 });
      const updateRes = await batchMutateTableData(adapter, 'sqlite', {
         tableName: 'test_order_items',
         pkColumns,
         edits: {
            [updateKey]: { amount: 999 },
         },
         schema,
      });

      expect(updateRes.success).toBe(true);

      // Verify row (1, 10) is 999, but (1, 20) is still 200
      const dataAfterUpdate = await adapter.getData('test_order_items', 10, 0, '', {
         col: 'order_id',
         asc: true,
      });

      expect(dataAfterUpdate.rows).toEqual([
         { order_id: 1, item_id: 10, amount: 999 },
         { order_id: 1, item_id: 20, amount: 200 },
         { order_id: 2, item_id: 10, amount: 300 },
      ]);

      // Delete only row (1, 10)
      const deleteKey = JSON.stringify({ order_id: 1, item_id: 10 });
      const deleteRes = await batchMutateTableData(adapter, 'sqlite', {
         tableName: 'test_order_items',
         pkColumns,
         deletes: [deleteKey],
         schema,
      });

      expect(deleteRes.success).toBe(true);

      const dataAfterDelete = await adapter.getData('test_order_items', 10, 0, '', {
         col: 'order_id',
         asc: true,
      });

      expect(dataAfterDelete.rows).toEqual([
         { order_id: 1, item_id: 20, amount: 200 },
         { order_id: 2, item_id: 10, amount: 300 },
      ]);
   });

   it('12. should handle table rename and records mutation with composite PK via Studio API endpoints', async () => {
      // 1. Test POST /api/tables/:name/rename
      const renameRes = await app.request(
         '/api/tables/test_users_renamed/rename',
         {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName: 'test_users_final' }),
         },
      );

      expect(renameRes.status).toBe(200);
      const renameJson = (await renameRes.json()) as any;
      expect(renameJson.success).toBe(true);

      const tables = await adapter.getTables();
      expect(tables).toContain('test_users_final');
      expect(tables).not.toContain('test_users_renamed');

      // Duplicate rename should return 400
      const dupRenameRes = await app.request(
         '/api/tables/test_users_final/rename',
         {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName: 'test_orders' }),
         },
      );
      expect(dupRenameRes.status).toBe(400);

      // 2. Test POST /api/tables/:name/records with composite PK
      const mutateRes = await app.request(
         '/api/tables/test_order_items/records',
         {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               pkColumns: ['order_id', 'item_id'],
               edits: {
                  [JSON.stringify({ order_id: 1, item_id: 20 })]: {
                     amount: 888,
                  },
               },
            }),
         },
      );

      expect(mutateRes.status).toBe(200);
      const mutateJson = (await mutateRes.json()) as any;
      expect(mutateJson.success).toBe(true);

      const data = await adapter.getData('test_order_items', 10, 0, '', {
         col: 'order_id',
         asc: true,
      });
      const row = data.rows.find((r) => r.order_id === 1 && r.item_id === 20);
      expect(row?.amount).toBe(888);
   });

   test('13. Cascading PK to FK type migration: numeric TEXT -> INTEGER', async () => {
      await adapter.executeSql(`
         CREATE TABLE test_authors (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL
         );
      `);
      await adapter.executeSql(`
         CREATE TABLE test_posts (
            id INTEGER PRIMARY KEY,
            author_id TEXT NOT NULL,
            title TEXT NOT NULL,
            FOREIGN KEY (author_id) REFERENCES test_authors(id)
         );
      `);

      await adapter.executeSql(`INSERT INTO test_authors (id, name) VALUES ('101', 'Alice'), ('102', 'Bob');`);
      await adapter.executeSql(`INSERT INTO test_posts (id, author_id, title) VALUES (1, '101', 'Post 1'), (2, '102', 'Post 2');`);

      // 1. Check cascade impact
      const checkRes = await app.request('/api/tables/test_authors/cascade-check', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ colName: 'id', newType: 'INTEGER' }),
      });
      expect(checkRes.status).toBe(200);
      const checkJson = (await checkRes.json()) as any;
      expect(checkJson.success).toBe(true);
      expect(checkJson.data.hasDependents).toBe(true);
      expect(checkJson.data.dependents.length).toBe(1);
      expect(checkJson.data.dependents[0].table).toBe('test_posts');
      expect(checkJson.data.dependents[0].column).toBe('author_id');
      expect(checkJson.data.isNumericOnly).toBe(true);
      expect(checkJson.data.needsReindexing).toBe(false);

      // 2. Apply schema migration with cascading
      const migrateRes = await app.request('/api/tables/test_authors/schema', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            pendingEdits: { id: { type: 'INTEGER' } },
            cascadeFkTypes: true,
         }),
      });
      expect(migrateRes.status).toBe(200);
      const migrateJson = (await migrateRes.json()) as any;
      expect(migrateJson.success).toBe(true);

      // 3. Verify authors schema
      const authorsSchema = await adapter.getSchema('test_authors');
      const authorIdCol = authorsSchema.find((c) => c.name === 'id');
      expect(authorIdCol?.type).toBe('INTEGER');

      // 4. Verify posts schema cascaded
      const postsSchema = await adapter.getSchema('test_posts');
      const postAuthorIdCol = postsSchema.find((c) => c.name === 'author_id');
      expect(postAuthorIdCol?.type).toBe('INTEGER');

      // 5. Verify data preserved
      const postsData = await adapter.getData('test_posts', 10, 0);
      expect(postsData.rows.length).toBe(2);
      expect(Number(postsData.rows[0].author_id)).toBe(101);
   });

   test('14. Cascading PK to FK type migration with smart re-indexing: non-numeric TEXT -> INTEGER', async () => {
      await adapter.executeSql(`
         CREATE TABLE test_categories (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL
         );
      `);
      await adapter.executeSql(`
         CREATE TABLE test_products (
            id INTEGER PRIMARY KEY,
            cat_code TEXT NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY (cat_code) REFERENCES test_categories(code)
         );
      `);

      await adapter.executeSql(`INSERT INTO test_categories (code, name) VALUES ('electronics', 'Electronics'), ('books', 'Books');`);
      await adapter.executeSql(`INSERT INTO test_products (id, cat_code, name) VALUES (1, 'electronics', 'Laptop'), (2, 'books', 'Novel'), (3, 'electronics', 'Phone');`);

      // 1. Check cascade impact
      const checkRes = await app.request('/api/tables/test_categories/cascade-check', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ colName: 'code', newType: 'INTEGER' }),
      });
      expect(checkRes.status).toBe(200);
      const checkJson = (await checkRes.json()) as any;
      expect(checkJson.success).toBe(true);
      expect(checkJson.data.hasDependents).toBe(true);
      expect(checkJson.data.needsReindexing).toBe(true);
      expect(checkJson.data.isNumericOnly).toBe(false);

      // 2. Attempt migration without autoReindex -> should fail
      const failRes = await app.request('/api/tables/test_categories/schema', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            pendingEdits: { code: { type: 'INTEGER' } },
            cascadeFkTypes: true,
            autoReindex: false,
         }),
      });
      expect(failRes.status).toBe(400);

      // 3. Migrate with autoReindex: true -> should succeed
      const successRes = await app.request('/api/tables/test_categories/schema', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            pendingEdits: { code: { type: 'INTEGER' } },
            cascadeFkTypes: true,
            autoReindex: true,
         }),
      });
      expect(successRes.status).toBe(200);
      const successJson = (await successRes.json()) as any;
      expect(successJson.success).toBe(true);

      // 4. Check schemas
      const catSchema = await adapter.getSchema('test_categories');
      expect(catSchema.find((c) => c.name === 'code')?.type).toBe('INTEGER');

      const prodSchema = await adapter.getSchema('test_products');
      expect(prodSchema.find((c) => c.name === 'cat_code')?.type).toBe('INTEGER');

      // 5. Check data reindexed & relational links preserved
      const catData = await adapter.getData('test_categories', 10, 0);
      const prodData = await adapter.getData('test_products', 10, 0);

      const elecCat = catData.rows.find((r) => r.name === 'Electronics');
      const bookCat = catData.rows.find((r) => r.name === 'Books');
      expect(elecCat).toBeDefined();
      expect(bookCat).toBeDefined();

      const laptop = prodData.rows.find((r) => r.name === 'Laptop');
      const phone = prodData.rows.find((r) => r.name === 'Phone');
      const novel = prodData.rows.find((r) => r.name === 'Novel');

      expect(Number(laptop?.cat_code)).toBe(Number(elecCat?.code));
      expect(Number(phone?.cat_code)).toBe(Number(elecCat?.code));
      expect(Number(novel?.cat_code)).toBe(Number(bookCat?.code));
   });

   test('15. Cascading PK to FK type migration: INTEGER -> TEXT', async () => {
      await adapter.executeSql(`
         CREATE TABLE test_depts (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL
         );
      `);
      await adapter.executeSql(`
         CREATE TABLE test_emps (
            id INTEGER PRIMARY KEY,
            dept_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY (dept_id) REFERENCES test_depts(id)
         );
      `);

      await adapter.executeSql(`INSERT INTO test_depts (id, title) VALUES (10, 'Engineering');`);
      await adapter.executeSql(`INSERT INTO test_emps (id, dept_id, name) VALUES (1, 10, 'Alice');`);

      // Apply schema migration INTEGER -> TEXT
      const migrateRes = await app.request('/api/tables/test_depts/schema', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            pendingEdits: { id: { type: 'TEXT' } },
            cascadeFkTypes: true,
         }),
      });
      expect(migrateRes.status).toBe(200);
      const migrateJson = (await migrateRes.json()) as any;
      expect(migrateJson.success).toBe(true);

      const deptsSchema = await adapter.getSchema('test_depts');
      expect(deptsSchema.find((c) => c.name === 'id')?.type).toBe('TEXT');

      const empsSchema = await adapter.getSchema('test_emps');
      expect(empsSchema.find((c) => c.name === 'dept_id')?.type).toBe('TEXT');

      const empsData = await adapter.getData('test_emps', 10, 0);
      expect(String(empsData.rows[0].dept_id)).toBe('10');
   });

   test('16. Read-Only Mode config check & dynamic toggle', async () => {
      // Check initial readOnly config
      const cfgRes1 = await app.request('/api/config');
      expect(cfgRes1.status).toBe(200);
      const cfg1 = (await cfgRes1.json()) as any;
      expect(cfg1.data.readOnly).toBe(false);

      // Turn on read-only mode
      const toggleOn = await app.request('/api/config/readonly', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ readOnly: true }),
      });
      expect(toggleOn.status).toBe(200);
      const toggleOnJson = (await toggleOn.json()) as any;
      expect(toggleOnJson.success).toBe(true);
      expect(toggleOnJson.data.readOnly).toBe(true);

      // Verify readOnly is true in config
      const cfgRes2 = await app.request('/api/config');
      const cfg2 = (await cfgRes2.json()) as any;
      expect(cfg2.data.readOnly).toBe(true);
   });

   test('17. Read-Only Mode blocks mutating operations (Production Shield)', async () => {
      // Ensure read-only mode is active
      await app.request('/api/config/readonly', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ readOnly: true }),
      });

      // 1. Block create table
      const createTableRes = await app.request('/api/tables', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ tableName: 'should_fail', columns: [] }),
      });
      expect(createTableRes.status).toBe(403);
      const ctJson = (await createTableRes.json()) as any;
      expect(ctJson.success).toBe(false);
      expect(ctJson.error).toContain('Read-Only protection mode');

      // 2. Block insert/update records
      const recordRes = await app.request('/api/tables/test_depts/records', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            inserts: [{ id: '99', title: 'Blocked Dept' }],
         }),
      });
      expect(recordRes.status).toBe(403);

      // 3. Block truncate
      const truncRes = await app.request('/api/tables/test_depts/truncate', {
         method: 'POST',
      });
      expect(truncRes.status).toBe(403);

      // 4. Block mock data generation
      const mockRes = await app.request('/api/tables/test_depts/mock', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ count: 5 }),
      });
      expect(mockRes.status).toBe(403);

      // 5. Block mutating query (DELETE / INSERT)
      const queryRes = await app.request('/api/query', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ query: 'DELETE FROM test_depts;' }),
      });
      expect(queryRes.status).toBe(403);

      // 6. Turn read-only back off and verify operations succeed
      await app.request('/api/config/readonly', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ readOnly: false }),
      });

      const selectQueryRes = await app.request('/api/query', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ query: 'SELECT COUNT(*) as cnt FROM test_depts;' }),
      });
      expect(selectQueryRes.status).toBe(200);
   });
});
