import {
   DBAdapter,
   ColumnSchema,
   DatabaseStatus,
   IndexSchema,
} from '../types.js';
import type sql from 'mssql';

// ─── Connection config builder ────────────────────────────────────────────────

function buildMssqlConfig(connectionString: string): sql.config {
   const lower = connectionString.toLowerCase().trim();

   // ── URL format: mssql:// or sqlserver:// ──────────────────────────────────
   if (lower.startsWith('mssql://') || lower.startsWith('sqlserver://')) {
      try {
         const normalized = connectionString.replace(/^sqlserver:\/\//i, 'mssql://');
         const url = new URL(normalized);
         const host = url.hostname;
         const port = url.port ? parseInt(url.port, 10) : 1433;
         const user = decodeURIComponent(url.username || '');
         const password = decodeURIComponent(url.password || '');
         const database = url.pathname.replace(/^\//, '') || undefined;
         const params = url.searchParams;

         const encrypt = params.get('encrypt') !== 'false';
         const trustServerCertificate =
            params.get('trustServerCertificate') === 'true' ||
            params.get('TrustServerCertificate') === 'true' ||
            params.get('trustservercertificate') === 'true';
         const connectionTimeout = params.has('connectionTimeout')
            ? parseInt(params.get('connectionTimeout')!, 10)
            : 10000;
         const requestTimeout = params.has('requestTimeout')
            ? parseInt(params.get('requestTimeout')!, 10)
            : 30000;

         const isAzure =
            host.includes('.database.windows.net') ||
            host.includes('.sql.azuresynapse.net');

         return {
            server: host,
            port,
            user,
            password,
            database,
            options: {
               encrypt: isAzure || encrypt,
               trustServerCertificate: !isAzure && trustServerCertificate,
               enableArithAbort: true,
            },
            connectionTimeout,
            requestTimeout,
            pool: {
               max: 10,
               min: 0,
               idleTimeoutMillis: 30000,
            },
         };
      } catch {
         // Fall through to key-value parser
      }
   }

   // ── ADO.NET / ODBC style: Server=xxx;Database=yyy;User Id=zzz;Password=ppp; ──
   const map = new Map<string, string>();
   for (const pair of connectionString.split(';')) {
      const idx = pair.indexOf('=');
      if (idx > 0) {
         map.set(
            pair.slice(0, idx).trim().toLowerCase(),
            pair.slice(idx + 1).trim(),
         );
      }
   }

   const serverVal =
      map.get('server') || map.get('data source') || 'localhost';
   let host = serverVal;
   let port = 1433;
   if (serverVal.includes(',')) {
      const parts = serverVal.split(',');
      host = parts[0].trim();
      port = parseInt(parts[1].trim(), 10) || 1433;
   }

   const user = map.get('user id') || map.get('uid') || map.get('user') || '';
   const password = map.get('password') || map.get('pwd') || '';
   const database = map.get('database') || map.get('initial catalog') || undefined;

   const encryptStr = map.get('encrypt') || '';
   const trustStr = map.get('trustservercertificate') || '';
   const isAzure = host.includes('.database.windows.net');

   return {
      server: host,
      port,
      user,
      password,
      database,
      options: {
         encrypt: isAzure || encryptStr === 'true' || encryptStr === 'yes',
         trustServerCertificate: !isAzure && (trustStr === 'true' || trustStr === 'yes'),
         enableArithAbort: true,
      },
      connectionTimeout: 10000,
      requestTimeout: 30000,
      pool: {
         max: 10,
         min: 0,
         idleTimeoutMillis: 30000,
      },
   };
}

// ─── MssqlAdapter ─────────────────────────────────────────────────────────────

export class MssqlAdapter implements DBAdapter {
   private connectionString: string;
   private pool: sql.ConnectionPool | null = null;
   private sqlDriver: typeof sql | null = null;
   private currentSchema: string;

   constructor(connection: string) {
      this.connectionString = connection;
      this.currentSchema = MssqlAdapter.extractSchema(connection);
   }

   private async getSql(): Promise<typeof sql> {
      if (!this.sqlDriver) {
         const mod = await import('mssql');
         this.sqlDriver = ((mod as any).default || mod) as typeof sql;
      }
      return this.sqlDriver;
   }

   // ── Schema extraction ──────────────────────────────────────────────────────

   private static extractSchema(connectionString: string): string {
      try {
         const url = new URL(connectionString.replace(/^sqlserver:\/\//i, 'mssql://'));
         const s = url.searchParams.get('schema');
         if (s) return s;
      } catch {}
      const m = connectionString.match(/(?:^|;)\s*schema\s*=\s*([^;]+)/i);
      if (m) return m[1].trim();
      return 'dbo';
   }

   // ── Pool management ────────────────────────────────────────────────────────

   private async getPool(): Promise<sql.ConnectionPool> {
      if (!this.pool || !this.pool.connected) {
         const sql = await this.getSql();
         const config = buildMssqlConfig(this.connectionString);
         const pool = new sql.ConnectionPool(config);
         await pool.connect();
         this.pool = pool;
      }
      return this.pool;
   }

   // ── Identifier quoting ─────────────────────────────────────────────────────

   quoteIdentifier(name: string): string {
      // MSSQL uses square brackets; escape embedded closing brackets
      return `[${name.replace(/\]/g, ']]')}]`;
   }

   quoteTable(tableName: string): string {
      if (this.currentSchema === 'dbo') {
         return this.quoteIdentifier(tableName);
      }
      return `${this.quoteIdentifier(this.currentSchema)}.${this.quoteIdentifier(tableName)}`;
   }

   // ── getStatus ──────────────────────────────────────────────────────────────

   async getStatus(): Promise<DatabaseStatus> {
      try {
         const pool = await this.getPool();

         const dbRes = await pool
            .request()
            .query('SELECT DB_NAME() AS db, @@VERSION AS ver');
         const dbName: string = dbRes.recordset[0]?.db;
         const versionRaw: string = dbRes.recordset[0]?.ver || '';
         const verMatch = versionRaw.match(/(\d+\.\d+\.\d+)/);
         const version = verMatch ? verMatch[1] : versionRaw.split('\n')[0].trim();

         let activeConnections = 0;
         try {
            const connRes = await pool
               .request()
               .query(
                  'SELECT COUNT(*) AS cnt FROM sys.dm_exec_sessions WHERE is_user_process = 1',
               );
            activeConnections = connRes.recordset[0]?.cnt ?? 0;
         } catch {}

         let sizeBytes = 0;
         try {
            const sizeRes = await pool
               .request()
               .query(
                  'SELECT SUM(CAST(size AS BIGINT)) * 8 * 1024 AS sz FROM sys.database_files',
               );
            sizeBytes = Number(sizeRes.recordset[0]?.sz ?? 0);
         } catch {}

         let uptime = 0;
         try {
            const uptimeRes = await pool
               .request()
               .query(
                  'SELECT DATEDIFF(SECOND, sqlserver_start_time, GETDATE()) AS up FROM sys.dm_os_sys_info',
               );
            uptime = uptimeRes.recordset[0]?.up ?? 0;
         } catch {}

         return {
            status: 'connected',
            dbType: 'mssql' as any,
            dbName,
            version,
            activeConnections,
            sizeBytes,
            uptime,
         };
      } catch {
         return { status: 'error', dbType: 'mssql' as any };
      }
   }

   // ── getTables ──────────────────────────────────────────────────────────────

   async getTables(): Promise<string[]> {
      const pool = await this.getPool();
      const sql = await this.getSql();
      const result = await pool
         .request()
         .input('schema', sql.NVarChar, this.currentSchema)
         .query(`
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE'
              AND TABLE_SCHEMA = @schema
              AND TABLE_NAME NOT LIKE '_drixio_trash_%'
            ORDER BY TABLE_NAME
         `);
      return result.recordset.map((r: any) => r.TABLE_NAME as string);
   }

   async getTrashTables(): Promise<string[]> {
      const pool = await this.getPool();
      const sql = await this.getSql();
      const result = await pool
         .request()
         .input('schema', sql.NVarChar, this.currentSchema)
         .query(`
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE'
              AND TABLE_SCHEMA = @schema
              AND TABLE_NAME LIKE '_drixio_trash_%'
            ORDER BY TABLE_NAME DESC
         `);
      return result.recordset.map((r: any) => r.TABLE_NAME as string);
   }

   // ── getSchema ─────────────────────────────────────────────────────────────

   async getSchema(tableName: string): Promise<ColumnSchema[]> {
      const pool = await this.getPool();
      const sql = await this.getSql();

      // Single comprehensive query joining INFORMATION_SCHEMA views
      const result = await pool
         .request()
         .input('tableName', sql.NVarChar, tableName)
         .input('schema', sql.NVarChar, this.currentSchema)
         .query(`
            SELECT
              c.COLUMN_NAME,
              c.DATA_TYPE,
              c.CHARACTER_MAXIMUM_LENGTH,
              c.NUMERIC_PRECISION,
              c.NUMERIC_SCALE,
              c.IS_NULLABLE,
              c.COLUMN_DEFAULT,
              COLUMNPROPERTY(
                OBJECT_ID(
                  QUOTENAME(c.TABLE_SCHEMA) + '.' + QUOTENAME(c.TABLE_NAME)
                ),
                c.COLUMN_NAME, 'IsIdentity'
              ) AS IS_IDENTITY,
              -- Primary key flag
              CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS IS_PK,
              -- Unique (non-PK) flag
              CASE WHEN uq.COLUMN_NAME IS NOT NULL
                        AND pk.COLUMN_NAME IS NULL THEN 1 ELSE 0 END AS IS_UNIQUE,
              -- FK info
              fk.FK_TABLE,
              fk.FK_COLUMN,
              fk.FK_CONSTRAINT_NAME,
              fk.FK_ON_DELETE,
              fk.FK_ON_UPDATE
            FROM INFORMATION_SCHEMA.COLUMNS c
            LEFT JOIN (
              SELECT kcu.COLUMN_NAME
              FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
              JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
               AND tc.TABLE_SCHEMA    = kcu.TABLE_SCHEMA
              WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                AND tc.TABLE_NAME   = @tableName
                AND tc.TABLE_SCHEMA = @schema
            ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
            LEFT JOIN (
              SELECT DISTINCT kcu.COLUMN_NAME
              FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
              JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
               AND tc.TABLE_SCHEMA    = kcu.TABLE_SCHEMA
              WHERE tc.CONSTRAINT_TYPE = 'UNIQUE'
                AND tc.TABLE_NAME   = @tableName
                AND tc.TABLE_SCHEMA = @schema
            ) uq ON c.COLUMN_NAME = uq.COLUMN_NAME
            LEFT JOIN (
              SELECT
                kcu.COLUMN_NAME,
                rc.DELETE_RULE         AS FK_ON_DELETE,
                rc.UPDATE_RULE         AS FK_ON_UPDATE,
                fkref.TABLE_NAME       AS FK_TABLE,
                fkref.COLUMN_NAME      AS FK_COLUMN,
                tc.CONSTRAINT_NAME     AS FK_CONSTRAINT_NAME
              FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
              JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
               AND tc.TABLE_SCHEMA    = kcu.TABLE_SCHEMA
              JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
                ON tc.CONSTRAINT_NAME  = rc.CONSTRAINT_NAME
               AND tc.TABLE_SCHEMA     = rc.CONSTRAINT_SCHEMA
              JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE fkref
                ON rc.UNIQUE_CONSTRAINT_NAME   = fkref.CONSTRAINT_NAME
               AND rc.UNIQUE_CONSTRAINT_SCHEMA = fkref.TABLE_SCHEMA
               AND fkref.ORDINAL_POSITION      = kcu.ORDINAL_POSITION
              WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
                AND tc.TABLE_NAME   = @tableName
                AND tc.TABLE_SCHEMA = @schema
            ) fk ON c.COLUMN_NAME = fk.COLUMN_NAME
            WHERE c.TABLE_NAME   = @tableName
              AND c.TABLE_SCHEMA = @schema
            ORDER BY c.ORDINAL_POSITION
         `);

      return result.recordset.map((col: any): ColumnSchema => {
         // Build full type string with size/precision
         let colType: string = col.DATA_TYPE;
         if (col.CHARACTER_MAXIMUM_LENGTH != null) {
            colType += `(${col.CHARACTER_MAXIMUM_LENGTH === -1 ? 'MAX' : col.CHARACTER_MAXIMUM_LENGTH})`;
         } else if (
            col.NUMERIC_PRECISION != null &&
            ['decimal', 'numeric'].includes(col.DATA_TYPE)
         ) {
            colType += `(${col.NUMERIC_PRECISION}, ${col.NUMERIC_SCALE ?? 0})`;
         }

         // Default value: SQL Server wraps all defaults in extra parens like ((0)) or (N'val')
         let defaultValue: string | undefined;
         if (col.IS_IDENTITY) {
            defaultValue = 'IDENTITY';
         } else if (col.COLUMN_DEFAULT != null) {
            let def = String(col.COLUMN_DEFAULT).trim();
            // Unwrap nested parens: ((0)) → 0,  (N'active') → N'active'
            while (def.startsWith('(') && def.endsWith(')')) {
               def = def.slice(1, -1).trim();
            }
            defaultValue = def || undefined;
         }

         let fkTarget: ColumnSchema['fkTarget'];
         if (col.FK_TABLE) {
            fkTarget = {
               table: col.FK_TABLE,
               column: col.FK_COLUMN,
               constraintName: col.FK_CONSTRAINT_NAME || undefined,
               onDelete:
                  col.FK_ON_DELETE &&
                  col.FK_ON_DELETE.toUpperCase() !== 'NO ACTION'
                     ? col.FK_ON_DELETE.toUpperCase()
                     : undefined,
               onUpdate:
                  col.FK_ON_UPDATE &&
                  col.FK_ON_UPDATE.toUpperCase() !== 'NO ACTION'
                     ? col.FK_ON_UPDATE.toUpperCase()
                     : undefined,
            };
         }

         return {
            name: col.COLUMN_NAME,
            type: colType,
            isPk: col.IS_PK === 1,
            nullable: col.IS_PK === 1 ? false : col.IS_NULLABLE === 'YES',
            isUnique: col.IS_PK === 1 || col.IS_UNIQUE === 1,
            defaultValue,
            fkTarget,
         };
      });
   }

   // ── getIndexes ─────────────────────────────────────────────────────────────

   async getIndexes(tableName: string): Promise<IndexSchema[]> {
      const pool = await this.getPool();
      const sql = await this.getSql();
      const result = await pool
         .request()
         .input('tableName', sql.NVarChar, tableName)
         .input('schema', sql.NVarChar, this.currentSchema)
         .query(`
            SELECT
              i.name          AS index_name,
              c.name          AS column_name,
              i.is_unique     AS is_unique,
              i.is_primary_key AS is_primary
            FROM sys.indexes i
            JOIN sys.index_columns ic
              ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            JOIN sys.columns c
              ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            JOIN sys.tables t ON i.object_id = t.object_id
            JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE t.name = @tableName
              AND s.name = @schema
              AND i.name IS NOT NULL
            ORDER BY i.name, ic.key_ordinal
         `);

      const indexMap = new Map<string, IndexSchema>();
      for (const row of result.recordset as any[]) {
         if (row.is_primary) continue; // Skip PK index — shown via isPk in schema
         if (!indexMap.has(row.index_name)) {
            indexMap.set(row.index_name, {
               name: row.index_name,
               columns: [],
               isUnique: !!row.is_unique,
            });
         }
         indexMap.get(row.index_name)!.columns.push(row.column_name);
      }
      return Array.from(indexMap.values());
   }

   // ── getData ────────────────────────────────────────────────────────────────

   async getData(
      tableName: string,
      limit: number = 50,
      offset: number = 0,
      whereClause?: string,
      orderBy?: { col: string; asc: boolean },
   ): Promise<{ columns: string[]; rows: Record<string, any>[] }> {
      const schema = await this.getSchema(tableName);
      const columns = schema.map((col) => col.name);

      let querySql = `SELECT * FROM ${this.quoteTable(tableName)}`;
      if (whereClause) {
         querySql += ` WHERE ${whereClause}`;
      }
      // OFFSET...FETCH NEXT requires an ORDER BY clause
      const orderExpr = orderBy
         ? `${this.quoteIdentifier(orderBy.col)} ${orderBy.asc ? 'ASC' : 'DESC'}`
         : '(SELECT NULL)';
      querySql += ` ORDER BY ${orderExpr}`;
      querySql += ` OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;

      const pool = await this.getPool();
      const result = await pool.request().query(querySql);
      return { columns, rows: result.recordset };
   }

   // ── query ──────────────────────────────────────────────────────────────────

   async query(querySql: string): Promise<{
      columns: string[];
      rows: Record<string, any>[];
      affectedRows?: number;
   }> {
      const pool = await this.getPool();
      const result = await pool.request().query(querySql);
      const affected = result.rowsAffected?.[0];

      // SELECT: recordset has column metadata
      if (
         result.recordset &&
         result.recordset.columns &&
         Object.keys(result.recordset.columns).length > 0
      ) {
         return {
            columns: Object.keys(result.recordset.columns),
            rows: result.recordset,
            affectedRows: affected,
         };
      }

      // Try first non-empty recordset (batched statements)
      if (result.recordsets) {
         for (const rs of result.recordsets as any[]) {
            if (rs?.columns && Object.keys(rs.columns).length > 0) {
               return {
                  columns: Object.keys(rs.columns),
                  rows: rs,
                  affectedRows: affected,
               };
            }
         }
      }

      // DML / no rows
      const count = affected ?? 0;
      return {
         columns: ['Result', 'AffectedRows'],
         rows: [{ Result: 'Success', AffectedRows: count }],
         affectedRows: count,
      };
   }

   // ── executeSql ────────────────────────────────────────────────────────────

   async executeSql(querySql: string): Promise<void> {
      const pool = await this.getPool();
      await pool.request().query(querySql);
   }

   // ── insert ─────────────────────────────────────────────────────────────────

   async insert(
      tableName: string,
      rows: Record<string, any>[],
   ): Promise<void> {
      if (rows.length === 0) return;
      const pool = await this.getPool();
      const cols = Object.keys(rows[0]);
      const colsQuoted = cols.map((c) => this.quoteIdentifier(c)).join(', ');
      const placeholders = cols.map((_, i) => `@v${i}`).join(', ');
      const insertSql = `INSERT INTO ${this.quoteTable(tableName)} (${colsQuoted}) VALUES (${placeholders})`;

      const sql = await this.getSql();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
         for (const row of rows) {
            const req = new sql.Request(transaction);
            cols.forEach((c, i) => {
               req.input(`v${i}`, row[c] ?? null);
            });
            await req.query(insertSql);
         }
         await transaction.commit();
      } catch (e) {
         await transaction.rollback();
         throw e;
      }
   }

   // ── truncateTable ──────────────────────────────────────────────────────────

   async truncateTable(tableName: string): Promise<void> {
      // MSSQL TRUNCATE also resets IDENTITY counters
      await this.executeSql(`TRUNCATE TABLE ${this.quoteTable(tableName)};`);
   }

   // ── close ──────────────────────────────────────────────────────────────────

   async close(): Promise<void> {
      if (this.pool) {
         await this.pool.close();
         this.pool = null;
      }
   }

   // ── Schema management ──────────────────────────────────────────────────────

   async getSchemas(): Promise<string[]> {
      const pool = await this.getPool();
      const result = await pool.request().query(`
         SELECT schema_name
         FROM INFORMATION_SCHEMA.SCHEMATA
         WHERE schema_name NOT IN (
           'information_schema', 'guest', 'sys',
           'db_owner', 'db_accessadmin', 'db_securityadmin', 'db_ddladmin',
           'db_backupoperator', 'db_datareader', 'db_datawriter',
           'db_denydatareader', 'db_denydatawriter'
         )
         ORDER BY schema_name
      `);
      return result.recordset.map((r: any) => r.schema_name as string);
   }

   getCurrentSchema(): string {
      return this.currentSchema;
   }

   async setSchema(schema: string): Promise<void> {
      this.currentSchema = schema;
      // No need to recreate pool — we pass schema as a param in each query
   }

   // ── renameTable ────────────────────────────────────────────────────────────

   async renameTable(oldName: string, newName: string): Promise<void> {
      // MSSQL uses sp_rename; provide schema-qualified old name
      const oldFull = `${this.currentSchema}.${oldName}`;
      const escapedOld = oldFull.replace(/'/g, "''");
      const escapedNew = newName.replace(/'/g, "''");
      await this.executeSql(
         `EXEC sp_rename '${escapedOld}', '${escapedNew}';`,
      );
   }
}

