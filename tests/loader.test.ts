import { describe, it, expect } from 'vitest';
import { parseEnvContent, classifyDatabaseUrl } from '../src/logic/loader.js';

describe('loader: parseEnvContent', () => {
   it('should parse standard key=value pairs', () => {
      const content = `
         KEY1=value1
         KEY2=value2
      `;
      const result = parseEnvContent(content);
      expect(result.KEY1).toBe('value1');
      expect(result.KEY2).toBe('value2');
   });

   it('should strip double quotes and single quotes', () => {
      const content = `
         DB_URL="postgres://user:pass@localhost:5432/db"
         DB_HOST='127.0.0.1'
      `;
      const result = parseEnvContent(content);
      expect(result.DB_URL).toBe('postgres://user:pass@localhost:5432/db');
      expect(result.DB_HOST).toBe('127.0.0.1');
   });

   it('should ignore full comment lines and inline comments without corrupting quotes', () => {
      const content = `
         # This is a full comment
         PORT=3306 # MySQL default port
         DATABASE_URL="mysql://root:p#ss@localhost/mydb" # inline comment
         export APP_ENV=production
      `;
      const result = parseEnvContent(content);
      expect(result.PORT).toBe('3306');
      expect(result.DATABASE_URL).toBe('mysql://root:p#ss@localhost/mydb');
      expect(result.APP_ENV).toBe('production');
      expect(result['# This is a full comment']).toBeUndefined();
   });
});

describe('loader: classifyDatabaseUrl', () => {
   const cwd = process.cwd();

   it('should classify postgres connection URLs', () => {
      const res1 = classifyDatabaseUrl('postgres://user:pass@localhost:5432/db', cwd);
      expect(res1).toEqual({
         type: 'postgres',
         targetUrl: 'postgres://user:pass@localhost:5432/db',
      });

      const res2 = classifyDatabaseUrl('postgresql://admin@10.0.0.1/production', cwd);
      expect(res2?.type).toBe('postgres');
   });

   it('should classify mysql connection URLs', () => {
      const res = classifyDatabaseUrl('mysql://root:pass@127.0.0.1:3306/dev', cwd);
      expect(res).toEqual({
         type: 'mysql',
         targetUrl: 'mysql://root:pass@127.0.0.1:3306/dev',
      });
   });

   it('should classify sqlite file URLs and extensions', () => {
      const res1 = classifyDatabaseUrl('file:./dev.db', cwd);
      expect(res1?.type).toBe('sqlite');
      expect(res1?.targetUrl.endsWith('dev.db')).toBe(true);

      const res2 = classifyDatabaseUrl('app.sqlite3', cwd);
      expect(res2?.type).toBe('sqlite');

      const mem = classifyDatabaseUrl(':memory:', cwd);
      expect(mem).toEqual({
         type: 'sqlite',
         targetUrl: ':memory:',
      });
   });

   it('should return null for invalid non-database strings', () => {
      expect(classifyDatabaseUrl('http://google.com', cwd)).toBeNull();
      expect(classifyDatabaseUrl('', cwd)).toBeNull();
   });
});

