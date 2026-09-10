import { describe, it, expect } from 'vitest';
import {
   toPascalCase,
   toCamelCase,
   generatePrismaSchema,
   generateDrizzleSchema,
   generateTypeScriptDefinitions,
 } from '../src/logic/orm.js';
import { TableSchemaInfo } from '../src/logic/types.js';

const mockTables: TableSchemaInfo[] = [
   {
      tableName: 'user_accounts',
      columns: [
         {
            name: 'id',
            type: 'INTEGER',
            isPk: true,
            nullable: false,
            defaultValue: null,
         },
         {
            name: 'email',
            type: 'VARCHAR(255)',
            isPk: false,
            nullable: false,
            defaultValue: null,
         },
         {
            name: 'bio',
            type: 'TEXT',
            isPk: false,
            nullable: true,
            defaultValue: null,
         },
         {
            name: 'is_active',
            type: 'BOOLEAN',
            isPk: false,
            nullable: false,
            defaultValue: 'true',
         },
      ],
      indexes: [],
      foreignKeys: [],
   },
];

describe('orm: naming helpers', () => {
   it('should convert identifiers to PascalCase singular', () => {
      expect(toPascalCase('users')).toBe('User');
      expect(toPascalCase('user_accounts')).toBe('UserAccount');
      expect(toPascalCase('orders')).toBe('Order');
   });

   it('should convert identifiers to camelCase', () => {
      expect(toCamelCase('first_name')).toBe('firstName');
      expect(toCamelCase('is_active')).toBe('isActive');
   });
});

describe('orm: generatePrismaSchema', () => {
   it('should generate valid Prisma Schema models', () => {
      const prisma = generatePrismaSchema(mockTables, 'postgres');
      expect(prisma).toContain('datasource db {');
      expect(prisma).toContain('provider = "postgresql"');
      expect(prisma).toContain('model UserAccount {');
      expect(prisma).toMatch(/id\s+Int\s+@id/);
      expect(prisma).toMatch(/email\s+String/);
      expect(prisma).toMatch(/isActive\s+Boolean/);
   });
});

describe('orm: generateDrizzleSchema', () => {
   it('should generate Drizzle Schema for PostgreSQL', () => {
      const drizzle = generateDrizzleSchema(mockTables, 'postgres');
      expect(drizzle).toContain("from 'drizzle-orm/pg-core'");
      expect(drizzle).toContain('export const userAccounts = pgTable(');
   });

   it('should generate Drizzle Schema for SQLite', () => {
      const drizzle = generateDrizzleSchema(mockTables, 'sqlite');
      expect(drizzle).toContain("from 'drizzle-orm/sqlite-core'");
      expect(drizzle).toContain('export const userAccounts = sqliteTable(');
   });
});

describe('orm: generateTypeScriptDefinitions', () => {
   it('should generate TypeScript interfaces', () => {
      const ts = generateTypeScriptDefinitions(mockTables);
      expect(ts).toContain('export interface UserAccount {');
      expect(ts).toContain('id: number;');
      expect(ts).toContain('email: string;');
      expect(ts).toContain('bio?: string;');
      expect(ts).toContain('is_active: boolean;');
   });
});

