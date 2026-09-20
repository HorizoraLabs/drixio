import { describe, it, expect } from 'vitest';
import { MssqlDialect, getDialect } from '../src/logic/dialect.js';
import { MssqlAdapter } from '../src/logic/adapters/mssql.js';
import { ColumnSchema } from '../src/logic/types.js';

describe('MSSQL Dialect', () => {
   const dialect = new MssqlDialect();

   it('should quote identifiers with brackets and escape closing brackets', () => {
      expect(dialect.quoteIdentifier('users')).toBe('[users]');
      expect(dialect.quoteIdentifier('user]name')).toBe('[user]]name]');
   });

   it('should escape single quotes in strings', () => {
      expect(dialect.escapeString("O'Reilly")).toBe("O''Reilly");
   });

   it('should generate valid CREATE TABLE statement with IDENTITY and MSSQL types', () => {
      const columns: ColumnSchema[] = [
         {
            name: 'id',
            type: 'int',
            isPk: true,
            nullable: false,
         },
         {
            name: 'username',
            type: 'varchar(255)',
            isPk: false,
            nullable: false,
            isUnique: true,
         },
         {
            name: 'bio',
            type: 'text',
            isPk: false,
            nullable: true,
         },
         {
            name: 'is_active',
            type: 'boolean',
            isPk: false,
            nullable: false,
            defaultValue: 'true',
         },
         {
            name: 'created_at',
            type: 'datetime',
            isPk: false,
            nullable: false,
            defaultValue: 'CURRENT_TIMESTAMP',
         },
      ];

      const sql = dialect.buildCreateTable('users', columns);

      expect(sql).toContain('CREATE TABLE [users]');
      expect(sql).toContain('[id] INT IDENTITY(1,1) PRIMARY KEY');
      expect(sql).toContain('[username] NVARCHAR(255) NOT NULL UNIQUE');
      expect(sql).toContain('[bio] NVARCHAR(MAX)');
      expect(sql).toContain('[is_active] BIT NOT NULL DEFAULT TRUE');
      expect(sql).toContain('[created_at] DATETIME2 NOT NULL DEFAULT CURRENT_TIMESTAMP');
   });

   it('should handle composite primary keys', () => {
      const columns: ColumnSchema[] = [
         { name: 'order_id', type: 'int', isPk: true, nullable: false },
         { name: 'item_id', type: 'int', isPk: true, nullable: false },
         { name: 'quantity', type: 'int', isPk: false, nullable: false },
      ];

      const sql = dialect.buildCreateTable('order_items', columns);
      expect(sql).toContain('PRIMARY KEY ([order_id], [item_id])');
      // In composite PK, individual columns should not have IDENTITY / PRIMARY KEY inline
      expect(sql).not.toContain('[order_id] INT IDENTITY');
   });

   it('should handle foreign key constraints with ON DELETE / ON UPDATE', () => {
      const columns: ColumnSchema[] = [
         {
            name: 'user_id',
            type: 'int',
            isPk: false,
            nullable: false,
            fkTarget: {
               table: 'users',
               column: 'id',
               onDelete: 'CASCADE',
               onUpdate: 'SET NULL',
            },
         },
      ];

      const sql = dialect.buildCreateTable('profiles', columns);
      expect(sql).toContain('FOREIGN KEY ([user_id]) REFERENCES [users]([id]) ON DELETE CASCADE ON UPDATE SET NULL');
   });

   it('should resolve MssqlDialect from getDialect("mssql")', () => {
      const d = getDialect('mssql');
      expect(d).toBeInstanceOf(MssqlDialect);
   });
});

describe('MssqlAdapter', () => {
   it('should instantiate adapter and quote table identifiers correctly', () => {
      const adapter = new MssqlAdapter('mssql://sa:password@localhost:1433/mydb');
      expect(adapter.quoteIdentifier('tbl')).toBe('[tbl]');
      expect(adapter.quoteTable('tbl')).toBe('[tbl]'); // Default schema is dbo
      expect(adapter.getCurrentSchema()).toBe('dbo');
   });

   it('should handle custom schema in connection URL query or string', () => {
      const adapter = new MssqlAdapter('mssql://sa:password@localhost:1433/mydb?schema=sales');
      expect(adapter.getCurrentSchema()).toBe('sales');
      expect(adapter.quoteTable('orders')).toBe('[sales].[orders]');
   });
});

