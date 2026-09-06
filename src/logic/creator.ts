import fs from 'fs/promises';
import path from 'path';
import { Result, ok, err } from './types.js';

export interface CreateDatabaseOptions {
   dialect: 'sqlite' | 'postgres' | 'mysql';
   dbName: string;
   host?: string;
   port?: number | string;
   user?: string;
   password?: string;
}

export interface CreateDatabaseData {
   targetUrl: string;
   dbName: string;
   dialect: 'sqlite' | 'postgres' | 'mysql';
}

export type CreateDatabaseResult = Result<CreateDatabaseData>;

/**
 * Common logic to create a new database on the local filesystem or remote/local database server.
 * Shared by CLI (`drixio init`) and Studio (`POST /api/connect` and SQL Console).
 */
export async function createDatabase(
   options: CreateDatabaseOptions,
): Promise<CreateDatabaseResult> {
   try {
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

         return ok({
            targetUrl: `file:${absPath}`,
            dbName: path
               .basename(absPath)
               .replace(/\.(sqlite|db|sqlite3)$/, ''),
            dialect: 'sqlite',
         });
      }

      // MySQL and PostgreSQL validation
      if (!dbName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
         return err(
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

         const auth = password ? `${user}:${password}` : user;
         const targetUrl = `mysql://${auth}@${host}:${port}/${dbName}`;

         return ok({
            targetUrl,
            dbName,
            dialect: 'mysql',
         });
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

         return ok({
            targetUrl,
            dbName,
            dialect: 'postgres',
         });
      }

      return err(`Unsupported database dialect: ${dialect}`);
   } catch (e: any) {
      return err(e.message || 'Failed to create database', undefined, e);
   }
}

export interface DropDatabaseOptions {
   dialect: 'sqlite' | 'postgres' | 'mysql';
   dbName: string;
   host?: string;
   port?: number | string;
   user?: string;
   password?: string;
}

export interface DropDatabaseData {
   dialect: 'sqlite' | 'postgres' | 'mysql';
   dbName: string;
   message: string;
}

export type DropDatabaseResult = Result<DropDatabaseData>;

/**
 * Common logic to drop an existing physical database (SQLite file, MySQL database, or PostgreSQL database).
 * Symmetrical to `createDatabase`.
 */
export async function dropDatabase(
   options: DropDatabaseOptions,
): Promise<DropDatabaseResult> {
   try {
      const dialect = options.dialect.toLowerCase() as
         | 'sqlite'
         | 'postgres'
         | 'mysql';
      let dbName = (options.dbName || '').trim();

      if (!dbName) {
         return err('Database name is required to drop a database.');
      }

      if (dialect === 'sqlite') {
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

         await fs.unlink(absPath);

         return ok({
            dialect: 'sqlite',
            dbName,
            message: `Deleted local database file: ${dbName}`,
         });
      }

      if (dialect === 'mysql') {
         const host = options.host || 'localhost';
         const port = parseInt(String(options.port || 3306), 10);
         const user = options.user || 'root';
         const password = options.password || '';

         const mysql = await import('mysql2/promise');
         const conn = await mysql.createConnection({
            host,
            port,
            user,
            password,
         });

         try {
            await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
         } finally {
            await conn.end();
         }

         return ok({
            dialect: 'mysql',
            dbName,
            message: `Dropped database '${dbName}' on MySQL (${host}:${port})`,
         });
      }

      if (dialect === 'postgres') {
         const host = options.host || 'localhost';
         const port = parseInt(String(options.port || 5432), 10);
         const user = options.user || 'postgres';
         const password = options.password || '';

         const pg = await import('pg');
         const Client = (pg as any).default?.Client || pg.Client;
         const conn = new Client({
            host,
            port,
            user,
            password,
            database: 'postgres',
         });

         await conn.connect();
         try {
            await conn.query(`DROP DATABASE IF EXISTS "${dbName}"`);
         } finally {
            await conn.end();
         }

         return ok({
            dialect: 'postgres',
            dbName,
            message: `Dropped database '${dbName}' on PostgreSQL (${host}:${port})`,
         });
      }

      return err(`Unsupported database dialect: ${dialect}`);
   } catch (e: any) {
      return err(e.message || 'Failed to drop database', undefined, e);
   }
}
