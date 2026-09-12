import {
   DBAdapter,
   ColumnSchema,
   DatabaseStatus,
   IndexSchema,
} from '../types.js';
import pg from 'pg';

/**
 * Creates a robust PoolConfig supporting cloud PostgreSQL providers (Supabase, Neon, RDS, etc.)
 * with auto SSL negotiation and 10s timeout fuse.
 */
function buildPgPoolConfig(connectionString: string): pg.PoolConfig {
   const config: pg.PoolConfig = {
      connectionString,
      connectionTimeoutMillis: 10000, // 10s timeout to prevent hanging on unreachable hosts
   };

   try {
      const lower = connectionString.toLowerCase();
      const isExplicitSslDisable = lower.includes('sslmode=disable');
      const isExplicitSslRequire =
         lower.includes('sslmode=require') ||
         lower.includes('sslmode=prefer') ||
         lower.includes('ssl=true') ||
         lower.includes('ssl=1');

      let isCloudProvider = false;
      const match = connectionString.match(/@([^/:?#]+)/);
      if (match && match[1]) {
         const host = match[1].toLowerCase();
         isCloudProvider =
            host.includes('supabase.') ||
            host.includes('neon.tech') ||
            host.includes('railway.') ||
            host.includes('render.com') ||
            host.includes('cockroach') ||
            host.includes('aiven') ||
            host.includes('rds.amazonaws.com');
      }

      if (!isExplicitSslDisable && (isExplicitSslRequire || isCloudProvider)) {
         config.ssl = {
            rejectUnauthorized: false,
         };
      }
   } catch {
      // Keep basic config on parse failure
   }

   return config;
}

export class PostgresAdapter implements DBAdapter {
   private connectionString: string;
   private pool: pg.Pool | null = null;
   private currentSchema: string;

   constructor(connection: string) {
      this.connectionString = connection;
      this.currentSchema = PostgresAdapter.extractSchema(connection);
   }

   /**
    * Extract the schema parameter from a PostgreSQL connection URL.
    * Supports both `?schema=xxx` (Prisma-style) and `?options=-c search_path%3Dxxx`.
    * Defaults to 'public' if not found.
    */
   private static extractSchema(url: string): string {
      try {
         const qIdx = url.indexOf('?');
         if (qIdx === -1) return 'public';
         const params = new URLSearchParams(url.slice(qIdx + 1));
         const schema = params.get('schema');
         if (schema) return schema;
         // Fallback: check for options=-c search_path=xxx
         const opts = params.get('options');
         if (opts) {
            const m = opts.match(/search_path[=](\w+)/);
            if (m) return m[1];
         }
      } catch {
         // ignore parse errors
      }
      return 'public';
   }

   private getPool(): pg.Pool {
      if (!this.pool) {
         this.pool = new pg.Pool(buildPgPoolConfig(this.connectionString));
         // Prevent unhandled error events from crashing the process
         this.pool.on('error', () => {});
         // Set search_path for all new connections in the pool
         this.pool.on('connect', (client: pg.PoolClient) => {
            const quoted = this.currentSchema.replace(/"/g, '""');
            client
               .query(`SET search_path TO "${quoted}", public`)
               .catch(() => {});
         });
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
      WHERE schemaname = $1
      ORDER BY tablename;
    `;
      const res = await this.getPool().query(query, [this.currentSchema]);
      return res.rows.map((row) => row.tablename);
   }

   async getSchema(tableName: string): Promise<ColumnSchema[]> {
      const query = `
      SELECT c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default,
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
                 AND tc.table_schema = kcu.table_schema
               JOIN information_schema.constraint_column_usage ccu
                 ON ccu.constraint_name = tc.constraint_name
                 AND ccu.table_schema = tc.table_schema
               WHERE tc.constraint_type = 'FOREIGN KEY' 
                 AND tc.table_name = c.table_name
                 AND tc.table_schema = c.table_schema
                 AND kcu.column_name = c.column_name
               LIMIT 1) as fk_target,
              (SELECT rc.delete_rule
               FROM information_schema.table_constraints tc 
               JOIN information_schema.key_column_usage kcu
                 ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
               JOIN information_schema.referential_constraints rc
                 ON rc.constraint_name = tc.constraint_name
                 AND rc.constraint_schema = tc.constraint_schema
               WHERE tc.constraint_type = 'FOREIGN KEY' 
                 AND tc.table_name = c.table_name
                 AND tc.table_schema = c.table_schema
                 AND kcu.column_name = c.column_name
               LIMIT 1) as fk_on_delete,
              (SELECT rc.update_rule
               FROM information_schema.table_constraints tc 
               JOIN information_schema.key_column_usage kcu
                 ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
               JOIN information_schema.referential_constraints rc
                 ON rc.constraint_name = tc.constraint_name
                 AND rc.constraint_schema = tc.constraint_schema
               WHERE tc.constraint_type = 'FOREIGN KEY' 
                 AND tc.table_name = c.table_name
                 AND tc.table_schema = c.table_schema
                 AND kcu.column_name = c.column_name
               LIMIT 1) as fk_on_update
      FROM information_schema.columns c
      WHERE c.table_name = $1 AND c.table_schema = $2
      ORDER BY c.ordinal_position;
    `;
      const res = await this.getPool().query(query, [
         tableName,
         this.currentSchema,
      ]);

      const enumMap = new Map<string, string[]>();

      // 1. Fetch native PostgreSQL ENUM types from system catalogs (pg_enum, pg_type)
      try {
         const nativeEnumQuery = `
            SELECT 
                a.attname AS column_name,
                t.typname AS enum_name,
                e.enumlabel AS enum_value
            FROM pg_attribute a
            JOIN pg_class c ON a.attrelid = c.oid
            JOIN pg_namespace nc ON nc.oid = c.relnamespace
            JOIN pg_type t ON a.atttypid = t.oid
            JOIN pg_enum e ON t.oid = e.enumtypid
            WHERE c.relname = $1
              AND nc.nspname = $2
              AND a.attnum > 0
              AND NOT a.attisdropped
            ORDER BY a.attnum, e.enumsortorder;
         `;
         const nativeEnumRes = await this.getPool().query(nativeEnumQuery, [
            tableName,
            this.currentSchema,
         ]);
         for (const r of nativeEnumRes.rows) {
            const colName = r.column_name;
            if (!enumMap.has(colName)) {
               enumMap.set(colName, []);
            }
            enumMap.get(colName)!.push(r.enum_value);
         }
      } catch {
         // Ignore if catalog access is restricted
      }

      // 2. Fetch CHECK constraint-based enums (e.g. CHECK (col IN ('A', 'B')))
      try {
         const checkQuery = `
            SELECT cc.check_clause
            FROM information_schema.check_constraints cc
            JOIN information_schema.table_constraints tc 
              ON cc.constraint_name = tc.constraint_name 
             AND cc.constraint_schema = tc.constraint_schema
            WHERE tc.table_name = $1 AND tc.table_schema = $2;
         `;
         const checkRes = await this.getPool().query(checkQuery, [
            tableName,
            this.currentSchema,
         ]);
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
               if (values.length > 0 && !enumMap.has(colName)) {
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
            fkTarget = {
               table: parts[0],
               column: parts[1],
               onDelete:
                  col.fk_on_delete &&
                  col.fk_on_delete.toUpperCase() !== 'NO ACTION'
                     ? col.fk_on_delete.toUpperCase()
                     : undefined,
               onUpdate:
                  col.fk_on_update &&
                  col.fk_on_update.toUpperCase() !== 'NO ACTION'
                     ? col.fk_on_update.toUpperCase()
                     : undefined,
            };
         }

         let colType = col.data_type;
         if (col.data_type === 'USER-DEFINED' && col.udt_name) {
            colType = col.udt_name;
         }

         return {
            name: col.column_name,
            type: colType,
            isPk: parseInt(col.is_pk) > 0,
            nullable:
               parseInt(col.is_pk) > 0 ? false : col.is_nullable === 'YES',
            isUnique: parseInt(col.is_pk) > 0 || parseInt(col.is_unique) > 0,
            defaultValue: (() => {
               if (col.column_default == null) return undefined;
               const raw = String(col.column_default).trim();
               const castMatch = raw.match(/^('[\s\S]*')(?:::[\w\s()]+)$/);
               return castMatch ? castMatch[1] : raw;
            })(),
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
          pg_class t
          JOIN pg_namespace n ON n.oid = t.relnamespace
          JOIN pg_index ix ON t.oid = ix.indrelid
          JOIN pg_class i ON i.oid = ix.indexrelid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      WHERE
          t.relkind = 'r'
          AND t.relname = $1
          AND n.nspname = $2
      ORDER BY
          i.relname, array_position(ix.indkey, a.attnum);
    `;

      const res = await this.getPool().query(query, [
         tableName,
         this.currentSchema,
      ]);
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

      let sql = `SELECT * FROM ${this.quoteTable(tableName)}`;
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
            const sql = `INSERT INTO ${this.quoteTable(tableName)} (${colsQuoted}) VALUES (${placeholders})`;
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
      const quoted = this.quoteTable(tableName);
      await this.getPool().query(
         `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`,
      );
   }

   /**
    * Quote a table name with schema prefix, e.g. "zen_stream"."users".
    * When the schema is 'public', only the table name is quoted for simplicity.
    */
   quoteTable(tableName: string): string {
      if (this.currentSchema === 'public') {
         return this.quoteIdentifier(tableName);
      }
      return `${this.quoteIdentifier(this.currentSchema)}.${this.quoteIdentifier(tableName)}`;
   }

   /**
    * List all user-accessible schemas (excluding internal PostgreSQL schemas).
    */
   async getSchemas(): Promise<string[]> {
      const query = `
         SELECT schema_name
         FROM information_schema.schemata
         WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
           AND schema_name NOT LIKE 'pg_temp_%'
           AND schema_name NOT LIKE 'pg_toast_temp_%'
         ORDER BY schema_name;
      `;
      const res = await this.getPool().query(query);
      return res.rows.map((row) => row.schema_name);
   }

   getCurrentSchema(): string {
      return this.currentSchema;
   }

   async setSchema(schema: string): Promise<void> {
      this.currentSchema = schema;
      // Destroy the existing pool so a fresh one picks up the new search_path
      if (this.pool) {
         await this.pool.end();
         this.pool = null;
      }
   }

   /**
    * List all user-defined enum types in the current schema or public.
    * Prioritizes enums in the current active schema over public.
    */
   async getCustomEnums(): Promise<{ name: string; values: string[] }[]> {
      const query = `
         SELECT 
             t.typname AS name,
             n.nspname AS schema_name,
             array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
         FROM pg_type t
         JOIN pg_enum e ON t.oid = e.enumtypid
         JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = $1 OR n.nspname = 'public'
         GROUP BY t.oid, t.typname, n.nspname
         ORDER BY (CASE WHEN n.nspname = $1 THEN 0 ELSE 1 END), t.typname;
      `;
      try {
         const res = await this.getPool().query(query, [this.currentSchema]);
         const seen = new Set<string>();
         const result: { name: string; values: string[] }[] = [];
         for (const row of res.rows) {
            const lower = row.name.toLowerCase();
            if (!seen.has(lower)) {
               seen.add(lower);
               result.push({
                  name: row.name,
                  values: Array.isArray(row.values) ? row.values : [],
               });
            }
         }
         return result;
      } catch {
         return [];
      }
   }
}
