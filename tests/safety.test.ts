import { describe, it, expect } from 'vitest';
import { analyzeDangerousQuery, stripSqlComments } from '../src/logic/safety.js';

describe('safety: stripSqlComments', () => {
   it('should remove line and block comments', () => {
      const sql = `
         -- select something
         SELECT * FROM users /* inline block comment */ WHERE id = 1;
      `;
      const cleaned = stripSqlComments(sql);
      expect(cleaned).toBe('SELECT * FROM users  WHERE id = 1;');
   });
});

describe('safety: analyzeDangerousQuery', () => {
   it('should intercept DROP TABLE / DROP DATABASE', () => {
      const res1 = analyzeDangerousQuery('DROP TABLE users;');
      expect(res1.isDangerous).toBe(true);
      expect(res1.type).toBe('DROP TABLE');

      const res2 = analyzeDangerousQuery('DROP DATABASE mydb;');
      expect(res2.isDangerous).toBe(true);
      expect(res2.type).toBe('DROP DATABASE');
   });

   it('should intercept TRUNCATE TABLE', () => {
      const res = analyzeDangerousQuery('TRUNCATE TABLE logs;');
      expect(res.isDangerous).toBe(true);
      expect(res.type).toBe('TRUNCATE TABLE');
   });

   it('should intercept DELETE without WHERE', () => {
      const res = analyzeDangerousQuery('DELETE FROM users;');
      expect(res.isDangerous).toBe(true);
      expect(res.type).toBe('DELETE without WHERE');
   });

   it('should intercept DELETE with trivial WHERE 1=1', () => {
      const res = analyzeDangerousQuery('DELETE FROM users WHERE 1=1;');
      expect(res.isDangerous).toBe(true);
      expect(res.type).toBe('DELETE with Trivial WHERE');
   });

   it('should intercept UPDATE without WHERE', () => {
      const res = analyzeDangerousQuery("UPDATE users SET status = 'banned';");
      expect(res.isDangerous).toBe(true);
      expect(res.type).toBe('UPDATE without WHERE');
   });

   it('should intercept UPDATE with trivial WHERE', () => {
      const res = analyzeDangerousQuery("UPDATE users SET status = 'active' WHERE true;");
      expect(res.isDangerous).toBe(true);
      expect(res.type).toBe('UPDATE with Trivial WHERE');
   });

   it('should permit safe SELECT and queries with real WHERE clauses', () => {
      const res1 = analyzeDangerousQuery('SELECT * FROM users;');
      expect(res1.isDangerous).toBe(false);

      const res2 = analyzeDangerousQuery('DELETE FROM users WHERE id = 42;');
      expect(res2.isDangerous).toBe(false);

      const res3 = analyzeDangerousQuery("UPDATE users SET name = 'Alice' WHERE id = 1;");
      expect(res3.isDangerous).toBe(false);
   });
});

