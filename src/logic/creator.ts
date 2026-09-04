import fs from 'fs/promises';
import path from 'path';

export interface CreateDatabaseOptions {
   dialect: 'sqlite' | 'postgres' | 'mysql';
   dbName: string;
   host?: string;
   port?: number | string;
   user?: string;
   password?: string;
}

export interface CreateDatabaseResult {
   success: boolean;
   targetUrl: string;
   dbName: string;
   dialect: 'sqlite' | 'postgres' | 'mysql';
}

/**
 * Common logic to create a new database on the local filesystem or remote/local database server.
 * Shared by CLI (`drixio init`) and Studio (`POST /api/connect` and SQL Console).
 */
export async function createDatabase(
   options: CreateDatabaseOptions,
): Promise<CreateDatabaseResult> {
   const dialect = options.dialect.toLowerCase() as
      | 'sqlite'
      | 'postgres'
      | 'mysql';
   let dbName = (options.dbName || '').trim();

   if (dialect === 'sqlite') {
      if (!dbName) {
         dbName = 'database.sqlite';
      }
      if (
         !dbName.endsWith('.sqlite') &&
         !dbName.endsWith('.db') &&
         !dbName.endsWith('.sqlite3')
      ) {
         dbName += '.sqlite';
      }

      const cwd = process.cwd();
      const absPath = path.isAbsolute(dbName)
         ? dbName
         : path.resolve(cwd, dbName);
      const dir = path.dirname(absPath);

      await fs.mkdir(dir, { recursive: true });

      try {
         await fs.access(absPath);
      } catch {
         // Create empty sqlite file
         await fs.writeFile(absPath, '');
      }

      return {
         success: true,
         targetUrl: `file:${absPath}`,
         dbName: path.basename(absPath).replace(/\.(sqlite|db|sqlite3)$/, ''),
         dialect: 'sqlite',
      };
   }

   // MySQL and PostgreSQL validation
   if (!dbName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
      throw new Error(
         'Invalid database name. Please use only letters, numbers, and underscores.',
      );
   }

   const host = options.host || 'localhost';
   const user = options.user || (dialect === 'mysql' ? 'root' : 'postgres');
   const password = options.password || '';
   const port = parseInt(
      String(options.port || (dialect === 'mysql' ? 3306 : 5432)),
      10,
   );

   if (dialect === 'mysql') {
      const mysql = await import('mysql2/promise');
      const conn = await mysql.createConnection({
         host,
         port,
         user,
         password,
      });

      try {
         await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
      } finally {
         await conn.end();
      }

      const auth = password
         ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
         : encodeURIComponent(user);
      const targetUrl = `mysql://${auth}@${host}:${port}/${dbName}`;

      return {
         success: true,
         targetUrl,
         dbName,
         dialect: 'mysql',
      };
   }

   if (dialect === 'postgres') {
      const pg = await import('pg');
      const Client = (pg as any).default?.Client || pg.Client;
      const conn = new Client({
         host,
         port,
         user,
         password,
         database: 'postgres', // Connect to default maintenance database
      });

      await conn.connect();
      try {
         const res = await conn.query(
            'SELECT 1 FROM pg_database WHERE datname = $1',
            [dbName],
         );
         if (res.rowCount === 0) {
            await conn.query(`CREATE DATABASE "${dbName}"`);
         }
      } finally {
         await conn.end();
      }

      const auth = password
         ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
         : encodeURIComponent(user);
      const targetUrl = `postgresql://${auth}@${host}:${port}/${dbName}`;

      return {
         success: true,
         targetUrl,
         dbName,
         dialect: 'postgres',
      };
   }

   throw new Error(`Unsupported database dialect: ${dialect}`);
}
