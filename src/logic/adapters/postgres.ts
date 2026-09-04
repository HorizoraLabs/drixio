import {
   DBAdapter,
   ColumnSchema,
   DatabaseStatus,
   IndexSchema,
} from '../types.js';
import pg from 'pg';

export class PostgresAdapter implements DBAdapter {
   private connectionString: string;
   private pool: pg.Pool | null = null;

   constructor(connection: string) {
      this.connectionString = connection;
   }

   private getPool(): pg.Pool {
      if (!this.pool) {
         this.pool = new pg.Pool({
            connectionString: this.connectionString,
         });
         // Prevent unhandled error events from crashing the process
         this.pool.on('error', () => {});
      }
      return this.pool;
   }

   quoteIdentifier(name: string): string {
      // Postgres uses double quotes for identifiers; escape any embedded double quotes
      return `"${name.replace(/"/g, '""')}"`;
   }

   async getStatus(): Promise<DatabaseStatus> {
      try {
         const dbRes = await this.getPool().query(
            'SELECT current_database() as db, version() as version',
         );
         const dbName = dbRes.rows[0]?.db;
         const version =
            dbRes.rows[0]?.version?.split(' ')[1] || dbRes.rows[0]?.version; // Try to extract just version number

         let activeConnections = 0;
         let transactions = 0;
         let uptime = 0;

         try {
            const uptimeRes = await this.getPool().query(
               'SELECT EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time())) as uptime',
            );
            uptime = parseInt(uptimeRes.rows[0]?.uptime || '0', 10);
         } catch (e) {
            // ignore
         }

         // requires pg_stat_database permission but usually available
         try {
            const statRes = await this.getPool().query(
               'SELECT sum(numbackends) as conns, sum(xact_commit + xact_rollback) as txs FROM pg_stat_database',
            );
            activeConnections = parseInt(statRes.rows[0]?.conns || '0', 10);
            transactions = parseInt(statRes.rows[0]?.txs || '0', 10);
         } catch (e) {
            // ignore if no permission
         }

         let sizeBytes = 0;
         try {
            const sizeRes = await this.getPool().query(
               'SELECT pg_database_size(current_database()) as size',
            );
            sizeBytes = parseInt(sizeRes.rows[0]?.size || '0', 10);
         } catch (e) {
            // ignore
         }

         return {
            status: 'connected',
            dbType: 'postgres',
            dbName,
            version,
            activeConnections,
            sizeBytes,
            transactions,
            uptime,
         };
      } catch (e: any) {
         return {
            status: 'error',
            dbType: 'postgres',
         };
      }
   }

   async getTables(): Promise<string[]> {
      const query = `
      SELECT tablename 
      FROM pg_catalog.pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `;
      const res = await this.getPool().query(query);
      return res.rows.map((row) => row.tablename);
   }

   async getSchema(tableName: string): Promise<ColumnSchema[]> {
      const query = `
      SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
             (SELECT count(*) 
              FROM information_schema.key_column_usage kcu 
              JOIN information_schema.table_constraints tc 
                ON kcu.constraint_name = tc.constraint_name 
              WHERE tc.constraint_type = 'PRIMARY KEY' 
                AND kcu.table_name = c.table_name 
                AND kcu.column_name = c.column_name
                AND kcu.table_schema = c.table_schema) as is_pk,
             (SELECT count(*)
              FROM information_schema.table_constraints tc2
              JOIN information_schema.constraint_column_usage ccu2
                ON tc2.constraint_name = ccu2.constraint_name
                AND tc2.table_schema = ccu2.table_schema
              WHERE tc2.constraint_type = 'UNIQUE'
                AND tc2.table_name = c.table_name
                AND tc2.table_schema = c.table_schema
                AND ccu2.column_name = c.column_name) as is_unique,
             (SELECT ccu.table_name || '.' || ccu.column_name
              FROM information_schema.table_constraints tc 
              JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
              JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
              WHERE tc.constraint_type = 'FOREIGN KEY' 
                AND tc.table_name = c.table_name
                AND tc.table_schema = c.table_schema
                AND kcu.column_name = c.column_name
              LIMIT 1) as fk_target
      FROM information_schema.columns c
      WHERE c.table_name = $1 AND c.table_schema = 'public'
      ORDER BY c.ordinal_position;
    `;
      const res = await this.getPool().query(query, [tableName]);

      const enumMap = new Map<string, string[]>();
      try {
         const checkQuery = `
            SELECT cc.check_clause
            FROM information_schema.check_constraints cc
            JOIN information_schema.table_constraints tc 
              ON cc.constraint_name = tc.constraint_name 
             AND cc.constraint_schema = tc.constraint_schema
            WHERE tc.table_name = $1 AND tc.table_schema = 'public';
         `;
         const checkRes = await this.getPool().query(checkQuery, [tableName]);
         for (const r of checkRes.rows) {
            const inRegex =
               /["'`]?(\w+)["'`]?\s+(?:COLLATE\s+\w+\s+)?IN\s*\(([^)]+)\)/gi;
            let inMatch;
            while ((inMatch = inRegex.exec(r.check_clause)) !== null) {
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
      } catch {
         // Ignore
      }

      return res.rows.map((col) => {
         let fkTarget;
         if (col.fk_target) {
            const parts = col.fk_target.split('.');
            fkTarget = { table: parts[0], column: parts[1] };
         }
         return {
            name: col.column_name,
            type: col.data_type,
            isPk: parseInt(col.is_pk) > 0,
            nullable:
               parseInt(col.is_pk) > 0 ? false : col.is_nullable === 'YES',
            isUnique: parseInt(col.is_pk) > 0 || parseInt(col.is_unique) > 0,
            defaultValue:
               col.column_default != null
                  ? String(col.column_default)
                  : undefined,
            enumValues: enumMap.get(col.column_name),
            fkTarget,
         };
      });
   }

   async getIndexes(tableName: string): Promise<IndexSchema[]> {
      const query = `
      SELECT
          i.relname as index_name,
          a.attname as column_name,
          ix.indisunique as is_unique,
          ix.indisprimary as is_primary
      FROM
          pg_class t,
          pg_class i,
          pg_index ix,
          pg_attribute a
      WHERE
          t.oid = ix.indrelid
          AND i.oid = ix.indexrelid
          AND a.attrelid = t.oid
          AND a.attnum = ANY(ix.indkey)
          AND t.relkind = 'r'
          AND t.relname = $1
          AND t.relnamespace = 'public'::regnamespace
      ORDER BY
          i.relname, array_position(ix.indkey, a.attnum);
    `;

      const res = await this.getPool().query(query, [tableName]);
      const rows = res.rows;

      const indexMap = new Map<string, IndexSchema>();

      for (const row of rows) {
         if (row.is_primary) continue; // Skip primary key indexes

         const idxName = row.index_name;
         if (!indexMap.has(idxName)) {
            indexMap.set(idxName, {
               name: idxName,
               columns: [],
               isUnique: row.is_unique,
            });
         }

         indexMap.get(idxName)!.columns.push(row.column_name);
      }

      return Array.from(indexMap.values());
   }

   async getData(
      tableName: string,
      limit: number = 50,
      offset: number = 0,
      whereClause?: string,
      orderBy?: { col: string; asc: boolean },
   ): Promise<{ columns: string[]; rows: Record<string, any>[] }> {
      const schema = await this.getSchema(tableName);
      const columns = schema.map((col) => col.name);

      let sql = `SELECT * FROM ${this.quoteIdentifier(tableName)}`;
      if (whereClause) {
         sql += ` WHERE ${whereClause}`;
      }
      if (orderBy) {
         sql += ` ORDER BY ${this.quoteIdentifier(orderBy.col)} ${orderBy.asc ? 'ASC' : 'DESC'}`;
      }
      sql += ` LIMIT $1 OFFSET $2`;

      const res = await this.getPool().query(sql, [limit, offset]);
      return { columns, rows: res.rows };
   }

   async query(sql: string): Promise<{
      columns: string[];
      rows: Record<string, any>[];
      affectedRows?: number;
   }> {
      const res = await this.getPool().query(sql);
      let columns: string[] = [];
      if (res.fields) {
         columns = res.fields.map((f) => f.name);
      }
      return {
         columns,
         rows: res.rows || [],
         affectedRows:
            typeof res.rowCount === 'number' ? res.rowCount : undefined,
      };
   }

   async executeSql(sql: string): Promise<void> {
      await this.getPool().query(sql);
   }

   async close(): Promise<void> {
      if (this.pool) {
         await this.pool.end();
         this.pool = null;
      }
   }

   async insert(tableName: string, rows: Record<string, any>[]): Promise<void> {
      if (rows.length === 0) return;
      const pool = this.getPool();
      const client = await pool.connect();
      try {
         const cols = Object.keys(rows[0]);
         const colsQuoted = cols.map((c) => this.quoteIdentifier(c)).join(', ');
         await client.query('BEGIN');
         for (const row of rows) {
            const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
            const sql = `INSERT INTO ${this.quoteIdentifier(tableName)} (${colsQuoted}) VALUES (${placeholders})`;
            const values = cols.map((c) => row[c]);
            await client.query(sql, values);
         }
         await client.query('COMMIT');
      } catch (e) {
         await client.query('ROLLBACK');
         throw e;
      } finally {
         client.release();
      }
   }

   async truncateTable(tableName: string): Promise<void> {
      const quoted = this.quoteIdentifier(tableName);
      await this.getPool().query(
         `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`,
      );
   }
}
