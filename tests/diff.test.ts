import { describe, it, expect } from 'vitest';
import { normalizeType, normalizeDefault, compareSchemas } from '../src/logic/diff.js';
import { TableSchemaInfo } from '../src/logic/types.js';

describe('diff: normalizeType and normalizeDefault', () => {
   it('should normalize integer aliases across dialects', () => {
      expect(normalizeType('int4')).toBe('INTEGER');
      expect(normalizeType('serial')).toBe('INTEGER');
      expect(normalizeType('int(11)')).toBe('INTEGER');
      expect(normalizeType('bigint(20)')).toBe('BIGINT');
      expect(normalizeType('tinyint(1)')).toBe('BOOLEAN');
   });

   it('should normalize default expressions', () => {
      expect(normalizeDefault('now()')).toBe('CURRENT_TIMESTAMP');
      expect(normalizeDefault("'active'")).toBe('active');
      expect(normalizeDefault('NULL')).toBeUndefined();
   });
});

describe('diff: compareSchemas', () => {
   const sourceTables: TableSchemaInfo[] = [
      {
         tableName: 'users',
         columns: [
            { name: 'id', type: 'INTEGER', isPk: true, nullable: false, defaultValue: null },
            { name: 'name', type: 'VARCHAR(100)', isPk: false, nullable: false, defaultValue: null },
         ],
         indexes: [],
         foreignKeys: [],
      },
   ];

   const targetTables: TableSchemaInfo[] = [
      {
         tableName: 'users',
         columns: [
            { name: 'id', type: 'INTEGER', isPk: true, nullable: false, defaultValue: null },
            { name: 'name', type: 'VARCHAR(100)', isPk: false, nullable: false, defaultValue: null },
            { name: 'avatar', type: 'TEXT', isPk: false, nullable: true, defaultValue: null },
         ],
         indexes: [],
         foreignKeys: [],
      },
      {
         tableName: 'posts',
         columns: [
            { name: 'id', type: 'INTEGER', isPk: true, nullable: false, defaultValue: null },
            { name: 'title', type: 'VARCHAR(255)', isPk: false, nullable: false, defaultValue: null },
         ],
         indexes: [],
         foreignKeys: [],
      },
   ];

   it('should accurately detect added tables, added columns, and generate migration SQL', () => {
      const diffResult = compareSchemas(sourceTables, targetTables, 'postgres');

      expect(diffResult.hasChanges).toBe(true);
      expect(diffResult.stats.addedTablesCount).toBe(1); // 'posts'
      expect(diffResult.stats.addedColumnsCount).toBe(3); // 1 in 'users' + 2 in 'posts'

      // Check migration SQL
      expect(diffResult.migrationSql).toContain('CREATE TABLE');
      expect(diffResult.migrationSql).toContain('ALTER TABLE');
      expect(diffResult.migrationSql).toContain('avatar');

      // Check rollback SQL
      expect(diffResult.rollbackSql).toContain('DROP TABLE');
   });

   it('should return hasChanges=false when schemas match identical', () => {
      const diffResult = compareSchemas(sourceTables, sourceTables, 'postgres');
      expect(diffResult.hasChanges).toBe(false);
      expect(diffResult.tables).toHaveLength(0);
   });
});
