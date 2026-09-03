import type { DatabaseSync } from 'node:sqlite';
import { DBAdapter, ColumnSchema } from '../core/types.js';

export class SqliteAdapter implements DBAdapter {
   private dbPath: string;
   private db: DatabaseSync | null = null;

   constructor(connection: string) {
      this.dbPath = connection;
   }

   private async getDb(): Promise<DatabaseSync> {
      if (!this.db) {
         let modFs = 'node:fs';
         const fs = await import(modFs);
         if (!fs.existsSync(this.dbPath)) {
            throw new Error(`Failed to found database file at: ${this.dbPath}`);
         }
         let mod = 'node:sqlite';
         const sqlite = await import(mod);
         this.db = new sqlite.DatabaseSync(this.dbPath);
      }
      return this.db!;
   }

   quoteIdentifier(name: string): string {
      // SQLite uses double quotes for identifiers; escape any embedded double quotes
      return `"${name.replace(/"/g, '""')}"`;
   }

   async getStatus(): Promise<import('../core/types.js').DatabaseStatus> {
      try {
         const db = await this.getDb();

         const vQuery = db.prepare('SELECT sqlite_version() as v');
         const vRow = vQuery.get() as { v: string };

         let modFs = 'node:fs';
         const fs = await import(modFs);
         const stats = fs.statSync(this.dbPath);

         // Extract filename as dbName
         let modPath = 'node:path';
         const path = await import(modPath);
         const dbName = path.basename(this.dbPath);

         return {
            status: 'connected',
            dbType: 'sqlite',
            dbName,
            version: vRow?.v,
            activeConnections: 1, // SQLite is single file, essentially 1 active connection for the app
            sizeBytes: stats.size,
            uptime: process.uptime(),
         };
      } catch (e: any) {
         return {
            status: 'error',
            dbType: 'sqlite',
         };
      }
   }

   async getTables(): Promise<string[]> {
      const db = await this.getDb();
      const results = db
         .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
         )
         .all() as { name: string }[];
      return results.map((row) => row.name);
   }

   async getSchema(tableName: string): Promise<ColumnSchema[]> {
      const db = await this.getDb();
      const quoted = this.quoteIdentifier(tableName);

      const pragmaQuery = db.prepare(`PRAGMA table_info(${quoted})`);
      const info = pragmaQuery.all() as {
         cid: number;
         name: string;
         type: string;
         notnull: number;
         dflt_value: any;
         pk: number;
      }[];

      const fkQuery = db.prepare(`PRAGMA foreign_key_list(${quoted})`);
      const fks = fkQuery.all() as {
         from: string;
         table: string;
         to: string;
      }[];

      const indexListQuery = db.prepare(`PRAGMA index_list(${quoted})`);
      const indexList = indexListQuery.all() as {
         name: string;
         unique: number;
         origin: string;
      }[];
      const uniqueCols = new Set<string>();
      for (const idx of indexList) {
         if (idx.unique === 1) {
            const infoQuery = db.prepare(
               `PRAGMA index_info(${this.quoteIdentifier(idx.name)})`,
            );
            const cols = infoQuery.all() as { name: string }[];
            if (cols.length === 1 && cols[0].name) {
               uniqueCols.add(cols[0].name);
            }
         }
      }

      // Parse CHECK constraints from CREATE TABLE for enum-like values
      const enumMap = new Map<string, string[]>();
      try {
         const createSql = db
            .prepare(
               `SELECT sql FROM sqlite_master WHERE type='table' AND name=${quoted}`,
            )
            .get() as { sql: string } | undefined;
         if (createSql?.sql) {
            // Match patterns like: CHECK(col IN ('a','b','c')) or CHECK("col" IN ('a','b','c'))
            const checkRegex =
               /CHECK\s*\(\s*["']?(\w+)["']?\s+IN\s*\(([^)]+)\)\s*\)/gi;
            let match;
            while ((match = checkRegex.exec(createSql.sql)) !== null) {
               const colName = match[1];
               const valuesStr = match[2];
               const values = valuesStr
                  .split(',')
                  .map((s) => s.trim().replace(/^'|'$/g, ''))
                  .filter((s) => s.length > 0);
               if (values.length > 0) {
                  enumMap.set(colName, values);
               }
            }
         }
      } catch {
         // Ignore parse errors
      }

      return info.map((col) => {
         const fk = fks.find((f) => f.from === col.name);
         return {
            name: col.name,
            type: col.type,
            isPk: col.pk > 0,
            nullable: col.pk > 0 ? false : col.notnull === 0,
            isUnique: col.pk > 0 || uniqueCols.has(col.name),
            defaultValue:
               col.dflt_value != null ? String(col.dflt_value) : undefined,
            enumValues: enumMap.get(col.name),
            fkTarget: fk ? { table: fk.table, column: fk.to } : undefined,
         };
      });
   }

   async getIndexes(
      tableName: string,
   ): Promise<import('../core/types.js').IndexSchema[]> {
      const db = await this.getDb();
      const quoted = this.quoteIdentifier(tableName);

      // Get list of indexes for the table
      const indexListQuery = db.prepare(`PRAGMA index_list(${quoted})`);
      const indexList = indexListQuery.all() as {
         name: string;
         unique: number;
         origin: string;
      }[];

      const indexes: import('../core/types.js').IndexSchema[] = [];

      for (const idx of indexList) {
         // origin 'c' means created via CREATE INDEX, 'u' means created by UNIQUE constraint, 'pk' means primary key
         // We generally want to show 'c' and 'u', maybe skip 'pk' if it's already handled by the PK column
         if (idx.origin === 'pk') continue;

         const indexInfoQuery = db.prepare(
            `PRAGMA index_info(${this.quoteIdentifier(idx.name)})`,
         );
         const columns = indexInfoQuery.all() as { name: string }[];

         indexes.push({
            name: idx.name,
            columns: columns.map((c) => c.name),
            isUnique: idx.unique > 0,
         });
      }

      return indexes;
   }

   async getData(
      tableName: string,
      limit: number = 50,
      offset: number = 0,
      whereClause?: string,
      orderBy?: { col: string; asc: boolean },
   ): Promise<{ columns: string[]; rows: Record<string, any>[] }> {
      const db = await this.getDb();

      const schema = await this.getSchema(tableName);
      const columns = schema.map((col) => col.name);

      let sql = `SELECT * FROM ${this.quoteIdentifier(tableName)}`;
      if (whereClause) {
         sql += ` WHERE ${whereClause}`;
      }
      if (orderBy) {
         sql += ` ORDER BY ${this.quoteIdentifier(orderBy.col)} ${orderBy.asc ? 'ASC' : 'DESC'}`;
      }
      sql += ` LIMIT ${limit} OFFSET ${offset}`;

      const dataQuery = db.prepare(sql);
      const rows = dataQuery.all() as Record<string, any>[];
      return { columns, rows };
   }

   async query(
      sql: string,
   ): Promise<{
      columns: string[];
      rows: Record<string, any>[];
      affectedRows?: number;
   }> {
      const db = await this.getDb();
      // Strip leading comments and whitespace to detect statement type
      const stripped = sql.replace(
         /^(\s*--[^\n]*\n|\s*\/\*[\s\S]*?\*\/\s*|\s+)*/g,
         '',
      );
      const upper = stripped.toUpperCase();
      const isRead =
         upper.startsWith('SELECT') ||
         upper.startsWith('PRAGMA') ||
         upper.startsWith('EXPLAIN') ||
         upper.startsWith('WITH') ||
         upper.startsWith('(');
      // Write statements with RETURNING clause should be treated as reads
      const hasReturning = /\bRETURNING\b/i.test(sql);

      if (isRead || hasReturning) {
         const stmt = db.prepare(sql);
         const rows = stmt.all() as Record<string, any>[];
         let columns: string[] = [];
         if (rows.length > 0) {
            columns = Object.keys(rows[0]);
         } else {
            // Use stmt.columns() to get column metadata even for empty result sets
            try {
               const colMeta = (stmt as any).columns();
               if (Array.isArray(colMeta)) {
                  columns = colMeta.map((c: any) => c.name || c.column);
               }
            } catch {
               // Fallback: columns remain empty
            }
         }
         return { columns, rows };
      } else {
         const stmt = db.prepare(sql);
         const result = stmt.run() as unknown as { changes: number };
         const changes = result.changes ?? 0;
         return {
            columns: ['Result', 'AffectedRows'],
            rows: [{ Result: 'Success', AffectedRows: changes }],
            affectedRows: changes,
         };
      }
   }

   async executeSql(sql: string): Promise<void> {
      const db = await this.getDb();
      db.exec(sql);
   }

   async close(): Promise<void> {
      if (this.db) {
         this.db.close();
         this.db = null;
      }
   }

   async insert(tableName: string, rows: Record<string, any>[]): Promise<void> {
      if (rows.length === 0) return;
      const db = await this.getDb();
      const cols = Object.keys(rows[0]);
      const colsQuoted = cols.map((c) => this.quoteIdentifier(c)).join(', ');
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT INTO ${this.quoteIdentifier(tableName)} (${colsQuoted}) VALUES (${placeholders})`;
      const stmt = db.prepare(sql);
      db.exec('BEGIN');
      try {
         for (const row of rows) {
            const values = cols.map((c) => row[c]);
            stmt.run(...values);
         }
         db.exec('COMMIT');
      } catch (e) {
         db.exec('ROLLBACK');
         throw e;
      }
   }
}
