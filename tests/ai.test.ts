import { describe, it, expect, vi } from 'vitest';
import {
   buildSchemaContext,
   extractSqlFromResponse,
   generateSqlFromPrompt,
   explainAndOptimizeSql,
   fixSqlError,
} from '../src/logic/ai.js';
import { TableSchemaInfo } from '../src/logic/types.js';

describe('AI: buildSchemaContext', () => {
   const sampleTables: TableSchemaInfo[] = [
      {
         tableName: 'users',
         columns: [
            { name: 'id', type: 'INTEGER', isPk: true, nullable: false, defaultValue: null },
            { name: 'username', type: 'TEXT', isPk: false, nullable: false, defaultValue: null },
            { name: 'email', type: 'TEXT', isPk: false, nullable: true, defaultValue: null },
         ],
         indexes: [],
      },
      {
         tableName: 'orders',
         columns: [
            { name: 'id', type: 'INTEGER', isPk: true, nullable: false, defaultValue: null },
            {
               name: 'user_id',
               type: 'INTEGER',
               isPk: false,
               nullable: false,
               defaultValue: null,
               fkTarget: { table: 'users', column: 'id' },
            },
            { name: 'amount', type: 'REAL', isPk: false, nullable: false, defaultValue: '0' },
         ],
         indexes: [],
      },
   ];

   it('should format schema with columns, types, PK and FK references', () => {
      const context = buildSchemaContext(sampleTables, 'sqlite');
      expect(context).toContain('Database Dialect: SQLITE');
      expect(context).toContain('- users:');
      expect(context).toContain('id INTEGER [PK] NOT NULL');
      expect(context).toContain('username TEXT NOT NULL');
      expect(context).toContain('- orders:');
      expect(context).toContain('[FK -> users.id]');
      expect(context).toContain('amount REAL NOT NULL DEFAULT 0');
   });

   it('should prioritize the current active table first in context', () => {
      const context = buildSchemaContext(sampleTables, 'sqlite', 'orders');
      const usersIdx = context.indexOf('- users:');
      const ordersIdx = context.indexOf('- orders (active):');
      expect(ordersIdx).toBeGreaterThan(-1);
      expect(usersIdx).toBeGreaterThan(-1);
      expect(ordersIdx).toBeLessThan(usersIdx);
   });

   it('should return empty notice if no tables are provided', () => {
      const context = buildSchemaContext([], 'sqlite');
      expect(context).toContain('No tables currently present in database.');
   });
});

describe('AI: extractSqlFromResponse', () => {
   it('should extract SQL from markdown sql fences and retain explanation', () => {
      const response = `Here is the query you requested:
\`\`\`sql
SELECT u.username, COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id;
\`\`\`
This joins users and orders to calculate order counts.`;

      const { sql, explanation } = extractSqlFromResponse(response);
      expect(sql).toContain('SELECT u.username');
      expect(sql).toContain('GROUP BY u.id;');
      expect(explanation).toContain('This joins users and orders');
   });

   it('should extract SQL from generic fences if no sql tag is present', () => {
      const response = `\`\`\`
SELECT * FROM users WHERE id = 1;
\`\`\`
Fetches single user.`;

      const { sql, explanation } = extractSqlFromResponse(response);
      expect(sql).toBe('SELECT * FROM users WHERE id = 1;');
      expect(explanation).toBe('Fetches single user.');
   });

   it('should strip markdown bold and headings if response is plain SQL', () => {
      const response = `SELECT * FROM users;`;
      const { sql } = extractSqlFromResponse(response);
      expect(sql).toBe('SELECT * FROM users;');
   });
});

describe('AI: End-to-End Handlers with mocked fetch', () => {
   const sampleTables: TableSchemaInfo[] = [
      {
         tableName: 'users',
         columns: [
            { name: 'id', type: 'INTEGER', isPk: true, nullable: false, defaultValue: null },
            { name: 'email', type: 'TEXT', isPk: false, nullable: false, defaultValue: null },
         ],
         indexes: [],
      },
   ];

   it('should execute generateSqlFromPrompt against mock OpenAI-compatible endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
         ok: true,
         json: async () => ({
            choices: [
               {
                  message: {
                     role: 'assistant',
                     content: "```sql\nSELECT * FROM users WHERE email LIKE '%@gmail.com';\n```\nQueries all Gmail users.",
                  },
               },
            ],
            model: 'deepseek-chat',
         }),
      });

      // @ts-expect-error mock global fetch
      globalThis.fetch = mockFetch;

      const result = await generateSqlFromPrompt({
         prompt: 'Find users with gmail',
         tables: sampleTables,
         dialect: 'sqlite',
         config: {
            provider: 'deepseek',
            baseUrl: 'https://api.deepseek.com/v1',
            apiKey: 'mock-key',
            model: 'deepseek-chat',
         },
      });

      expect(result.sql).toBe("SELECT * FROM users WHERE email LIKE '%@gmail.com';");
      expect(result.explanation).toContain('Queries all Gmail users.');
      expect(result.model).toBe('deepseek-chat');
      expect(mockFetch).toHaveBeenCalledTimes(1);
   });

   it('should execute explainAndOptimizeSql and parse tips and optimized SQL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
         ok: true,
         json: async () => ({
            choices: [
               {
                  message: {
                     role: 'assistant',
                     content: `### Explanation
This query scans the users table without filtering.

### Performance Tips
- Add an index on email column
- Limit the returned rows using LIMIT

### Optimized SQL
\`\`\`sql
SELECT id, email FROM users LIMIT 50;
\`\`\``,
                  },
               },
            ],
            model: 'gpt-4o-mini',
         }),
      });

      // @ts-expect-error mock global fetch
      globalThis.fetch = mockFetch;

      const result = await explainAndOptimizeSql({
         sql: 'SELECT * FROM users;',
         tables: sampleTables,
         dialect: 'sqlite',
         config: {
            provider: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'mock-key',
            model: 'gpt-4o-mini',
         },
      });

      expect(result.explanation).toContain('scans the users table');
      expect(result.performanceTips).toHaveLength(2);
      expect(result.performanceTips[0]).toContain('Add an index');
      expect(result.optimizedSql).toBe('SELECT id, email FROM users LIMIT 50;');
      expect(result.model).toBe('gpt-4o-mini');
   });

   it('should execute fixSqlError and return diagnosed fix', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
         ok: true,
         json: async () => ({
            choices: [
               {
                  message: {
                     role: 'assistant',
                     content: "```sql\nSELECT id, email FROM users;\n```\nFixed unknown column `user_email` to `email`.",
                  },
               },
            ],
            model: 'llama3',
         }),
      });

      // @ts-expect-error mock global fetch
      globalThis.fetch = mockFetch;

      const result = await fixSqlError({
         sql: 'SELECT id, user_email FROM users;',
         error: 'no such column: user_email',
         tables: sampleTables,
         dialect: 'sqlite',
         config: {
            provider: 'ollama',
            baseUrl: 'http://localhost:11434/v1',
            model: 'llama3',
         },
      });

      expect(result.fixedSql).toBe('SELECT id, email FROM users;');
      expect(result.explanation).toContain('Fixed unknown column');
      expect(result.model).toBe('llama3');
   });
});

