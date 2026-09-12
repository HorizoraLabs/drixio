import { describe, it, expect, beforeEach } from 'vitest';
// @ts-ignore
import {
   buildTableWhereClause,
   getTableFilterState,
   clearTableFilters,
} from '../studio/app/data/filterBar.js';

describe('Supabase FilterBar SQL Generation', () => {
   const tableName = 'users';
   const schema = [
      { name: 'id', type: 'INTEGER', isPk: true },
      { name: 'email', type: 'VARCHAR(255)' },
      { name: 'name', type: 'TEXT' },
      { name: 'age', type: 'INT' },
   ];

   beforeEach(() => {
      clearTableFilters(tableName);
   });

   it('returns empty string when no filters or search text are present', () => {
      const sql = buildTableWhereClause(tableName, schema);
      expect(sql).toBe('');
   });

   it('handles comparison operators correctly for numeric and string values', () => {
      const state = getTableFilterState(tableName);
      state.activeFilters.push({ id: '1', col: 'age', op: '>=', val: '18' });
      state.activeFilters.push({
         id: '2',
         col: 'name',
         op: '=',
         val: "O'Reilly",
      });

      const sql = buildTableWhereClause(tableName, schema);
      expect(sql).toBe(`"age" >= 18 AND "name" = 'O''Reilly'`);
   });

   it('handles pattern matching operators (LIKE, ILIKE, NOT LIKE)', () => {
      const state = getTableFilterState(tableName);
      state.activeFilters.push({
         id: '1',
         col: 'email',
         op: 'LIKE',
         val: 'gmail',
      });
      state.activeFilters.push({
         id: '2',
         col: 'name',
         op: 'ILIKE',
         val: 'john%',
      });
      state.activeFilters.push({
         id: '3',
         col: 'name',
         op: 'NOT LIKE',
         val: 'bot',
      });

      const sql = buildTableWhereClause(tableName, schema);
      expect(sql).toContain(`"email" LIKE '%gmail%'`);
      expect(sql).toContain(`LOWER("name") LIKE LOWER('john%')`);
      expect(sql).toContain(`"name" NOT LIKE '%bot%'`);
   });

   it('handles null checks (IS NULL, IS NOT NULL)', () => {
      const state = getTableFilterState(tableName);
      state.activeFilters.push({
         id: '1',
         col: 'email',
         op: 'IS NULL',
         val: '',
      });

      const sql = buildTableWhereClause(tableName, schema);
      expect(sql).toBe(`"email" IS NULL`);
   });

   it('handles IN list operator', () => {
      const state = getTableFilterState(tableName);
      state.activeFilters.push({
         id: '1',
         col: 'id',
         op: 'IN',
         val: '1, 2, 3',
      });

      const sql = buildTableWhereClause(tableName, schema);
      expect(sql).toBe(`"id" IN (1, 2, 3)`);
   });

   it('handles free text search fallback across text columns', () => {
      const state = getTableFilterState(tableName);
      state.freeTextSearch = 'admin';

      const sql = buildTableWhereClause(tableName, schema);
      expect(sql).toBe(
         `(LOWER("email") LIKE LOWER('%admin%') OR LOWER("name") LIKE LOWER('%admin%'))`,
      );
   });

   it('handles raw SQL conditions correctly', () => {
      const state = getTableFilterState(tableName);
      state.activeFilters.push({
         id: 'sql-1',
         type: 'sql',
         col: 'SQL',
         op: 'RAW',
         symbol: 'SQL',
         val: "age > 20 AND status = 'active'",
      });

      const sql = buildTableWhereClause(tableName, schema);
      expect(sql).toBe(`(age > 20 AND status = 'active')`);
   });
});
