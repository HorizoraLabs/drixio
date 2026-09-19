import { describe, it, expect } from 'vitest';
import {
   formatCsvValue,
   exportRowsToCsv,
   exportQueryResult,
   getRestoreCandidates,
   importDataToTable,
} from '../src/logic/transfer.js';
import { SqliteAdapter } from '../src/logic/adapters/sqlite.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('transfer: CSV formatting', () => {
   it('should format simple and special CSV values', () => {
      expect(formatCsvValue('simple')).toBe('simple');
      expect(formatCsvValue(123)).toBe('123');
      expect(formatCsvValue(null)).toBe('');
      expect(formatCsvValue(undefined)).toBe('');

      // Needs escaping if contains comma, quote, or newline
      expect(formatCsvValue('hello, world')).toBe('"hello, world"');
      expect(formatCsvValue('He said "hello"')).toBe('"He said ""hello"""');
      expect(formatCsvValue('Line1\nLine2')).toBe('"Line1\nLine2"');
   });

   it('should export rows into standardized CSV text', () => {
      const rows = [
         { id: 1, name: 'Alice', bio: 'Engineer, Developer' },
         { id: 2, name: 'Bob', bio: 'Designer "UI/UX"' },
      ];
      const csv = exportRowsToCsv(rows);
      const lines = csv.split('\n');

      expect(lines[0]).toBe('id,name,bio');
      expect(lines[1]).toBe('1,Alice,"Engineer, Developer"');
      expect(lines[2]).toBe('2,Bob,"Designer ""UI/UX"""');
   });

   it('should support exportQueryResult in both json and csv format', () => {
      const rows = [{ key: 'status', val: 'active' }];

      const csvResult = exportQueryResult(rows, 'csv');
      expect(csvResult).toContain('key,val');
      expect(csvResult).toContain('status,active');

      const jsonResult = exportQueryResult(rows, 'json');
      const parsed = JSON.parse(jsonResult);
      expect(parsed).toEqual(rows);
   });
});

describe('transfer: getRestoreCandidates', () => {
   it('should scan directory and identify backups', async () => {
      const tempDir = await fs.mkdtemp(
         path.join(os.tmpdir(), 'drixio-transfer-test-'),
      );
      try {
         await fs.mkdir(path.join(tempDir, 'drixio_backup_2026_01'));
         await fs.writeFile(path.join(tempDir, 'dump.sql'), 'SELECT 1;');
         await fs.writeFile(path.join(tempDir, 'export.json'), '[]');
         await fs.writeFile(path.join(tempDir, 'readme.txt'), 'ignore me');

         const candidates = await getRestoreCandidates(tempDir);
         const values = candidates.map((c) => c.value);

         expect(values).toContain('drixio_backup_2026_01');
         expect(values).toContain('dump.sql');
         expect(values).toContain('export.json');
         expect(values).not.toContain('readme.txt');
      } finally {
         await fs.rm(tempDir, { recursive: true, force: true });
      }
   });

   it('should import CSV with multi-line quoted fields without splitting rows', async () => {
      const adapter = new SqliteAdapter(':memory:');
      await adapter.executeSql('CREATE TABLE notes (id INT, content TEXT);');

      const csvContent = `id,content\n1,"First line\nSecond line"\n2,"Simple text"`;
      const res = await importDataToTable(adapter, 'notes', 'csv', csvContent);

      expect(res.success).toBe(true);
      if (res.success) {
         expect(res.data.count).toBe(2);
      }

      const rowsRes = await adapter.getData('notes');
      expect(rowsRes.rows.length).toBe(2);
      expect(rowsRes.rows[0].content).toBe('First line\nSecond line');
      expect(rowsRes.rows[1].content).toBe('Simple text');

      await adapter.close();
   });
});
