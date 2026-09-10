import type { DatabaseSync } from 'node:sqlite';
import {
   DBAdapter,
   ColumnSchema,
   DatabaseStatus,
   IndexSchema,
} from '../types.js';

export class SqliteAdapter implements DBAdapter {
   private dbPath: string;
   private db: DatabaseSync | null = null;

   constructor(connection: string) {
      this.dbPath = connection.startsWith('file:')
         ? connection.replace(/^file:/, '')
         : connection;
   }

   private async getDb(): Promise<DatabaseSync> {
      if (!this.db) {
         if (this.dbPath !== ':memory:') {
            let modFs = 'node:fs';
            const fs = await import(modFs);
            if (!fs.existsSync(this.dbPath)) {
               throw new Error(
                  `Failed to found database file at: ${this.dbPath}`,
               );
            }
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

   async getStatus(): Promise<DatabaseStatus> {
      try {
         const db = await this.getDb();

         const vQuery = db.prepare('SELECT sqlite_version() as v');
         const vRow = vQuery.get() as { v: string };

         let sizeBytes = 0;
         let dbName = ':memory:';

         if (this.dbPath !== ':memory:') {
            let modFs = 'node:fs';
            const fs = await import(modFs);
            const stats = fs.statSync(this.dbPath);
            sizeBytes = stats.size;

            let modPath = 'node:path';
            const path = await import(modPath);
            dbName = path.basename(this.dbPath);
         }

         return {
            status: 'connected',
            dbType: 'sqlite',
            dbName,
            version: vRow?.v,
            activeConnections: 1, // SQLite is single file, essentially 1 active connection for the app
            sizeBytes,
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
         on_update?: string;
         on_delete?: string;
      }[];

      const indexListQuery = db.prepare(`PRAGMA index_list(${quoted})`);
      const indexList = indexListQuery.all() as {
         name: string;
         unique: number;
         origin: string;
      }[];
      const uniqueCols = new Set<string>();
      for (const idx of indexList) {
         if (idx.origin === 'pk') continue;
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
               `SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`,
            )
            .get(tableName) as { sql: string } | undefined;
         if (createSql?.sql) {
            // Match patterns like:
            // CHECK (status in ('AVAILABLE', ...))
            // CHECK ((status in ('AVAILABLE', ...)))
            // CHECK ("status" IN ('AVAILABLE', ...))
            const checkBlockRegex = /CHECK\s*\(([\s\S]*?)\)(?=\s*[,)]|\s*$)/gi;
            let blockMatch;
            while (
               (blockMatch = checkBlockRegex.exec(createSql.sql)) !== null
            ) {
               const expr = blockMatch[1];
               const inRegex =
                  /["'`]?(\w+)["'`]?\s+(?:COLLATE\s+\w+\s+)?IN\s*\(([^)]+)\)/gi;
               let inMatch;
               while ((inMatch = inRegex.exec(expr)) !== null) {
                  const colName = inMatch[1];
                  const values = inMatch[2]
                     .split(',')
                     .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
                     .filter((s) => s.length > 0);
                  if (values.length > 0) {
                     enumMap.set(colName, values);
                  }
               }
            }

            // Also match ENUM(...) if declared directly in SQLite column definition
            const colEnumRegex =
               /["'`]?(\w+)["'`]?\s+(?:[\w()]+)?\s*ENUM\s*\(([^)]+)\)/gi;
            let colEnumMatch;
            while ((colEnumMatch = colEnumRegex.exec(createSql.sql)) !== null) {
               const colName = colEnumMatch[1];
               const values = colEnumMatch[2]
                  .split(',')
                  .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
                  .filter((s) => s.length > 0);
               if (values.length > 0 && !enumMap.has(colName)) {
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
            isUnique: uniqueCols.has(col.name),
            defaultValue:
               col.dflt_value != null ? String(col.dflt_value) : undefined,
            enumValues: enumMap.get(col.name),
            fkTarget: fk
               ? {
                    table: fk.table,
                    column: fk.to,
                    onDelete:
                       fk.on_delete &&
                       fk.on_delete.toUpperCase() !== 'NO ACTION'
                          ? fk.on_delete.toUpperCase()
                          : undefined,
                    onUpdate:
                       fk.on_update &&
                       fk.on_update.toUpperCase() !== 'NO ACTION'
                          ? fk.on_update.toUpperCase()
                          : undefined,
                 }
               : undefined,
         };
      });
   }

   async getIndexes(tableName: string): Promise<IndexSchema[]> {
      const db = await this.getDb();
      const quoted = this.quoteIdentifier(tableName);

      // Get list of indexes for the table
      const indexListQuery = db.prepare(`PRAGMA index_list(${quoted})`);
      const indexList = indexListQuery.all() as {
         name: string;
         unique: number;
         origin: string;
      }[];

      const indexes: IndexSchema[] = [];

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

   async query(sql: string): Promise<{
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

   async truncateTable(tableName: string): Promise<void> {
      const db = await this.getDb();
      const quoted = this.quoteIdentifier(tableName);
      db.exec('BEGIN TRANSACTION;');
      try {
         db.exec(`DELETE FROM ${quoted};`);
         try {
            db.exec(
               `DELETE FROM sqlite_sequence WHERE name = '${tableName.replace(/'/g, "''")}';`,
            );
         } catch {
            // sqlite_sequence table might not exist
         }
         db.exec('COMMIT;');
      } catch (err) {
         db.exec('ROLLBACK;');
         throw err;
      }
   }

   async recreateTable(
      tableName: string,
      newColumns: ColumnSchema[],
      renames: Record<string, string> = {},
   ): Promise<void> {
      const db = await this.getDb();
      const quotedOldTable = this.quoteIdentifier(tableName);

      // 1. Verify table exists
      const tableCheck = db
         .prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
         )
         .get(tableName);
      if (!tableCheck) {
         throw new Error(`Table "${tableName}" does not exist.`);
      }

      // 2. Fetch existing custom indexes
      const indexRows = db
         .prepare(
            `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`,
         )
         .all(tableName) as { name: string; sql: string }[];

      // 3. Create a unique temporary table name
      const tempTableName = `_drixio_recreate_${Date.now()}`;
      const quotedTempTable = this.quoteIdentifier(tempTableName);

      // 4. Build column definitions for CREATE TABLE
      const pkColumns = newColumns.filter((c) => c.isPk);
      const isCompositePk = pkColumns.length > 1;

      const colDefs: string[] = [];
      for (const col of newColumns) {
         let def = `${this.quoteIdentifier(col.name)} ${col.type || 'TEXT'}`;

         if (col.isPk && !isCompositePk) {
            def += ' PRIMARY KEY';
         }

         if (!col.nullable && (!col.isPk || isCompositePk)) {
            def += ' NOT NULL';
         }

         if (
            col.defaultValue !== undefined &&
            col.defaultValue !== null &&
            col.defaultValue !== ''
         ) {
            def += ` DEFAULT '${String(col.defaultValue).replace(/'/g, "''")}'`;
         }

         if (col.fkTarget && col.fkTarget.table && col.fkTarget.column) {
            def += ` REFERENCES ${this.quoteIdentifier(col.fkTarget.table)}(${this.quoteIdentifier(col.fkTarget.column)})`;
            if (
               col.fkTarget.onDelete &&
               col.fkTarget.onDelete.toUpperCase() !== 'NO ACTION'
            ) {
               def += ` ON DELETE ${col.fkTarget.onDelete.toUpperCase()}`;
            }
            if (
               col.fkTarget.onUpdate &&
               col.fkTarget.onUpdate.toUpperCase() !== 'NO ACTION'
            ) {
               def += ` ON UPDATE ${col.fkTarget.onUpdate.toUpperCase()}`;
            }
         }

         if (col.isUnique && (!col.isPk || isCompositePk)) {
            def += ' UNIQUE';
         }

         colDefs.push(def);
      }

      if (isCompositePk) {
         const pkColsQuoted = pkColumns
            .map((c) => this.quoteIdentifier(c.name))
            .join(', ');
         colDefs.push(`PRIMARY KEY (${pkColsQuoted})`);
      }

      const createSql = `CREATE TABLE ${quotedTempTable} (\n  ${colDefs.join(',\n  ')}\n);`;

      // 5. Build column mapping for data migration
      const newToOldMap: Record<string, string> = {};
      for (const [oldName, newName] of Object.entries(renames)) {
         newToOldMap[newName] = oldName;
      }

      const oldTableCols = (
         db.prepare(`PRAGMA table_info(${quotedOldTable})`).all() as {
            name: string;
         }[]
      ).map((r) => r.name);

      const copyNewCols: string[] = [];
      const copyOldCols: string[] = [];

      for (const col of newColumns) {
         const sourceOldName = newToOldMap[col.name] || col.name;
         if (oldTableCols.includes(sourceOldName)) {
            copyNewCols.push(this.quoteIdentifier(col.name));
            copyOldCols.push(this.quoteIdentifier(sourceOldName));
         }
      }

      let copySql = '';
      if (copyNewCols.length > 0) {
         copySql = `INSERT INTO ${quotedTempTable} (${copyNewCols.join(', ')}) SELECT ${copyOldCols.join(', ')} FROM ${quotedOldTable};`;
      }

      // 6. Execute migration in single transaction with foreign keys temporarily off
      db.exec('PRAGMA foreign_keys = OFF;');
      db.exec('BEGIN TRANSACTION;');
      try {
         db.exec(createSql);
         if (copySql) {
            db.exec(copySql);
         }
         db.exec(`DROP TABLE ${quotedOldTable};`);
         db.exec(`ALTER TABLE ${quotedTempTable} RENAME TO ${quotedOldTable};`);

         // Re-create user indexes
         for (const idx of indexRows) {
            if (!idx.sql) continue;
            let idxSql = idx.sql;
            for (const [oldName, newName] of Object.entries(renames)) {
               idxSql = idxSql.replace(
                  new RegExp(`\\b${oldName}\\b`, 'g'),
                  newName,
               );
            }
            try {
               db.exec(idxSql);
            } catch {
               // Index might reference a dropped column, safe to skip
            }
         }

         db.exec('COMMIT;');
      } catch (err) {
         db.exec('ROLLBACK;');
         throw err;
      } finally {
         db.exec('PRAGMA foreign_keys = ON;');
      }
   }
}
