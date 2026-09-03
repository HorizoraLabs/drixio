import { Hono } from 'hono';
import { DBConfig, DBAdapter } from '../core/types.js';
import { createDBAdapter } from '../core/factory.js';
import { previewMockData, generateAndInsertMockData } from '../core/seeder.js';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

function nodeToWebStream(nodeStream: Readable) {
   return new ReadableStream({
      start(controller) {
         nodeStream.on('data', (chunk) => controller.enqueue(chunk));
         nodeStream.on('end', () => controller.close());
         nodeStream.on('error', (err) => controller.error(err));
      },
      cancel() {
         nodeStream.destroy();
      },
   });
}

export function registerApiRoutes(app: Hono, dbConfig: DBConfig) {
   const api = new Hono();

   // Helper to lazily create adapter per request or use a global one
   const adapter = createDBAdapter(dbConfig as any);

   const getDbName = () => {
      let dbName = 'database';
      if (dbConfig.targetUrl) {
         if (dbConfig.type === 'sqlite') {
            dbName =
               dbConfig.targetUrl.replace('file:', '').split(/[/\\]/).pop() ||
               dbName;
         } else {
            dbName =
               dbConfig.targetUrl.split('/').pop()?.split('?')[0] || dbName;
         }
      }
      // Remove extension if sqlite
      dbName = dbName.replace(/\.sqlite$|\.db$/, '');
      return dbName.replace(/[^a-zA-Z0-9_-]/g, '');
   };

   const getDatetimeStr = () => {
      const d = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
   };

   api.get('/tables', async (c) => {
      try {
         const tables = await adapter.getTables();
         return c.json({ success: true, data: tables });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.get('/config', (c) => {
      let dbName = 'Database';
      if (dbConfig.targetUrl) {
         if (dbConfig.type === 'sqlite') {
            dbName =
               dbConfig.targetUrl.replace('file:', '').split(/[/\\]/).pop() ||
               dbName;
         } else {
            dbName =
               dbConfig.targetUrl.split('/').pop()?.split('?')[0] || 'Database';
         }
      }
      return c.json({ success: true, data: { dbType: dbConfig.type, dbName } });
   });

   api.get('/status', async (c) => {
      try {
         const status = await adapter.getStatus();

         // Calculate total tables
         const tables = await adapter.getTables();
         (status as any).totalTables = tables.length;

         // Attach OS metrics for SQLite (which is local)
         if (status.dbType === 'sqlite') {
            let modOs = 'node:os';
            const os = await import(modOs);
            status.osMemTotal = os.totalmem();
            status.osMemUsed = os.totalmem() - os.freemem();
            status.osCpuUsage = os.loadavg()[0]; // 1 minute load avg
         }

         return c.json({ success: true, data: status });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.get('/tables/stats', async (c) => {
      try {
         const tables = await adapter.getTables();
         const stats: Record<string, number> = {};
         for (const t of tables) {
            try {
               const res = await adapter.query(
                  `SELECT COUNT(*) as c FROM ${adapter.quoteIdentifier(t)}`,
               );
               // Different adapters might return row keys differently, try to extract count safely
               if (res && res.rows && res.rows.length > 0) {
                  const row = res.rows[0];
                  const countVal = Object.values(row)[0];
                  stats[t] = parseInt(String(countVal), 10) || 0;
               } else {
                  stats[t] = 0;
               }
            } catch (e) {
               stats[t] = 0;
            }
         }
         return c.json({ success: true, data: stats });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.get('/tables/:name/schema', async (c) => {
      const tableName = c.req.param('name');
      try {
         const schema = await adapter.getSchema(tableName);
         return c.json({ success: true, data: schema });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.get('/tables/:name/indexes', async (c) => {
      const tableName = c.req.param('name');
      try {
         const indexes = await adapter.getIndexes(tableName);
         return c.json({ success: true, data: indexes });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.get('/tables/:name/data', async (c) => {
      const tableName = c.req.param('name');
      const limit = parseInt(c.req.query('limit') || '50', 10);
      const offset = parseInt(c.req.query('offset') || '0', 10);
      const whereClause = c.req.query('where') || '';
      const orderCol = c.req.query('orderCol');
      const orderAscStr = c.req.query('orderAsc');

      let orderBy = undefined;
      if (orderCol) {
         orderBy = { col: orderCol, asc: orderAscStr !== 'false' };
      }

      try {
         const data = await adapter.getData(
            tableName,
            limit,
            offset,
            whereClause,
            orderBy,
         );
         return c.json({ success: true, data });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.get('/tables/:name/mock/preview', async (c) => {
      try {
         const tableName = c.req.param('name');
         const data = await previewMockData(adapter, tableName, 3);
         return c.json({ success: true, data });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/tables/:name/mock', async (c) => {
      try {
         const tableName = c.req.param('name');
         const body = await c.req.json().catch(() => ({}));
         const count = Math.min(Math.max(Number(body.count) || 10, 1), 1000);
         const inserted = await generateAndInsertMockData(
            adapter,
            tableName,
            count,
         );
         return c.json({ success: true, count: inserted });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/query', async (c) => {
      try {
         const { sql } = await c.req.json();
         const result = await adapter.query(sql);
         return c.json({ success: true, data: result });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.get('/tables/:name/export', async (c) => {
      const tableName = c.req.param('name');
      const format = c.req.query('format') || 'csv';
      const whereClause = c.req.query('where') || '';
      const orderCol = c.req.query('orderCol');
      const orderAscStr = c.req.query('orderAsc');

      let orderBy = undefined;
      if (orderCol) {
         orderBy = { col: orderCol, asc: orderAscStr !== 'false' };
      }

      try {
         // Fetch data in batches to avoid OOM on large tables
         const batchSize = 1000;
         let batchOffset = 0;
         const allRows: Record<string, any>[] = [];
         let exportColumns: string[] = [];
         let lastBatch;
         do {
            lastBatch = await adapter.getData(
               tableName,
               batchSize,
               batchOffset,
               whereClause,
               orderBy,
            );
            if (exportColumns.length === 0) exportColumns = lastBatch.columns;
            allRows.push(...lastBatch.rows);
            batchOffset += batchSize;
         } while (lastBatch.rows.length === batchSize);
         const rows = allRows;
         const timestamp = getDatetimeStr();
         const exportFilename = `${tableName}_export_${timestamp}`;

         if (format === 'json') {
            const jsonStr = JSON.stringify(rows, null, 2);
            c.header(
               'Content-Disposition',
               `attachment; filename="${exportFilename}.json"`,
            );
            c.header('Content-Type', 'application/json');
            return c.body(jsonStr);
         } else {
            // Simple CSV converter
            let csvStr = '';
            if (rows.length > 0) {
               const headers = Object.keys(rows[0]);
               const headerStr = headers.join(',');
               const rowStrs = rows.map((r) => {
                  return headers
                     .map((h) => {
                        let val = r[h];
                        if (val === null || val === undefined) val = '';
                        val = String(val);
                        if (
                           val.includes(',') ||
                           val.includes('"') ||
                           val.includes('\n')
                        ) {
                           val = `"${val.replace(/"/g, '""')}"`;
                        }
                        return val;
                     })
                     .join(',');
               });
               csvStr = [headerStr, ...rowStrs].join('\n');
            }

            c.header(
               'Content-Disposition',
               `attachment; filename="${exportFilename}.csv"`,
            );
            c.header('Content-Type', 'text/csv');
            return c.body(csvStr);
         }
      } catch (e: any) {
         return c.text(`Export Failed: ${e.message}`, 500);
      }
   });

   api.get('/database/export', async (c) => {
      try {
         const type = dbConfig.type;
         const url = dbConfig.targetUrl;
         let child;
         let filename = 'backup.sql';

         // Native Dump Wrapper Promise
         const executeNativeDump = (
            cmd: string,
            args: string[],
            envName: string,
         ) => {
            return new Promise<ReadableStream>((resolve, reject) => {
               const cp = spawn(cmd, args);
               let started = false;
               cp.on('error', (err: any) => {
                  if (!started)
                     reject(
                        new Error(
                           `Native tool '${cmd}' not found. Please install ${envName}.`,
                        ),
                     );
               });
               // Wait briefly to ensure it spawned successfully
               setTimeout(() => {
                  if (!cp.killed) {
                     started = true;
                     resolve(nodeToWebStream(cp.stdout));
                  }
               }, 100);
            });
         };

         try {
            let stream;
            const baseName = getDbName();
            const timeStr = getDatetimeStr();
            filename = `${baseName}_backup_${timeStr}.sql`;

            if (type === 'sqlite') {
               const dbPath = url.replace('file:', '');
               stream = await executeNativeDump(
                  'sqlite3',
                  [dbPath, '.dump'],
                  'SQLite CLI',
               );
            } else if (type === 'mysql') {
               const parsed = new URL(url);
               const user = parsed.username;
               const pass = parsed.password;
               const host = parsed.hostname;
               const port = parsed.port || '3306';
               const dbname = parsed.pathname.substring(1);
               stream = await executeNativeDump(
                  'mysqldump',
                  ['-u', user, `-p${pass}`, '-h', host, '-P', port, dbname],
                  'MySQL Client',
               );
            } else if (type === 'postgres') {
               stream = await executeNativeDump(
                  'pg_dump',
                  [url],
                  'PostgreSQL CLI',
               );
            } else {
               throw new Error('Unsupported database type for native export');
            }

            c.header(
               'Content-Disposition',
               `attachment; filename="${filename}"`,
            );
            c.header('Content-Type', 'application/sql');
            return c.body(stream);
         } catch (err: any) {
            // Fallback to JS dump if native tool is missing
            if (err.message.includes('Native tool')) {
               let sql = '';
               const baseName = getDbName();
               const timeStr = getDatetimeStr();
               if (type === 'sqlite') {
                  sql = await generateSqliteDump(adapter);
               } else if (type === 'mysql') {
                  sql = await generateMysqlDump(adapter);
               } else {
                  throw err;
               }
               c.header(
                  'Content-Disposition',
                  `attachment; filename="${baseName}_backup_${timeStr}.sql"`,
               );
               c.header('Content-Type', 'application/sql');
               return c.body(sql);
            }
            throw err;
         }
      } catch (e: any) {
         const errorHtml = `<html><body><h3>Database Export Failed</h3><p>${e.message}</p></body></html>`;
         c.header('Content-Type', 'text/html');
         return c.body(errorHtml);
      }
   });

   api.post('/database/import', async (c) => {
      try {
         const body = await c.req.parseBody();
         const file = body['file'];
         if (!(file instanceof File)) {
            return c.json({ success: false, error: 'No file uploaded' }, 400);
         }

         const sqlContent = await file.text();
         const type = dbConfig.type;
         const url = dbConfig.targetUrl;

         const executeNativeImport = (
            cmd: string,
            args: string[],
            fileContent: string,
            envName: string,
         ) => {
            return new Promise<void>((resolve, reject) => {
               const cp = spawn(cmd, args);
               let started = false;
               let errStr = '';
               cp.on('error', (err: any) => {
                  if (!started)
                     reject(
                        new Error(
                           `Native tool '${cmd}' not found. Please install ${envName}.`,
                        ),
                     );
               });
               cp.stderr.on('data', (d) => (errStr += d.toString()));
               cp.on('close', (code) => {
                  if (code === 0) resolve();
                  else reject(new Error(`Native import failed: ${errStr}`));
               });
               cp.stdin.write(fileContent);
               cp.stdin.end();
               started = true;
            });
         };

         try {
            if (type === 'sqlite') {
               const dbPath = url.replace('file:', '');
               await executeNativeImport(
                  'sqlite3',
                  [dbPath],
                  sqlContent,
                  'SQLite CLI',
               );
            } else if (type === 'mysql') {
               const parsed = new URL(url);
               const user = parsed.username;
               const pass = parsed.password;
               const host = parsed.hostname;
               const port = parsed.port || '3306';
               const dbname = parsed.pathname.substring(1);
               await executeNativeImport(
                  'mysql',
                  ['-u', user, `-p${pass}`, '-h', host, '-P', port, dbname],
                  sqlContent,
                  'MySQL Client',
               );
            } else if (type === 'postgres') {
               await executeNativeImport(
                  'psql',
                  [url],
                  sqlContent,
                  'PostgreSQL CLI',
               );
            } else {
               throw new Error('Unsupported database type for native import');
            }
         } catch (err: any) {
            if (err.message.includes('Native tool')) {
               // JS Fallback — all adapters now support multi-statement executeSql
               await adapter.executeSql(sqlContent);
            } else {
               throw err;
            }
         }

         return c.json({
            success: true,
            message: 'Import completed successfully',
         });
      } catch (e: any) {
         return c.json(
            { success: false, error: `Import Failed: ${e.message}` },
            500,
         );
      }
   });

   api.get('/database/dictionary', async (c) => {
      try {
         const dbName = getDbName();
         let md = `# Data Dictionary: ${dbName}\n\n`;
         const tables = await adapter.getTables();
         for (const t of tables) {
            md += `## Table: \`${t}\`\n\n`;
            md += `| Column | Type | PK | Nullable |\n|---|---|---|---|\n`;
            const schema = await adapter.getSchema(t);
            for (const col of schema) {
               md += `| ${col.name} | ${col.type} | ${col.isPk ? 'Yes' : 'No'} | ${col.nullable ? 'Yes' : 'No'} |\n`;
            }
            md += `\n`;
         }
         c.header(
            'Content-Disposition',
            `attachment; filename="${dbName}_dictionary_${getDatetimeStr()}.md"`,
         );
         c.header('Content-Type', 'text/markdown');
         return c.body(md);
      } catch (e: any) {
         return c.text(`Data Dictionary Export Failed: ${e.message}`, 500);
      }
   });

   api.get('/database/schema-only', async (c) => {
      try {
         const type = dbConfig.type;
         const url = dbConfig.targetUrl;
         const filename = `${getDbName()}_schema_${getDatetimeStr()}.sql`;

         if (type === 'sqlite') {
            let sqlDump = '-- Drixio SQLite Schema Dump\n\n';
            const tablesResult = await adapter.query(
               "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';",
            );
            for (const row of tablesResult.rows) {
               if (row.sql) sqlDump += `${row.sql};\n\n`;
            }
            c.header(
               'Content-Disposition',
               `attachment; filename="${filename}"`,
            );
            c.header('Content-Type', 'application/sql');
            return c.body(sqlDump);
         } else {
            // For Postgres/MySQL we could implement native spawn, but for now we'll return an error or build one.
            // The user only strictly requested DB dump. Schema only for SQLite works via sqlite_master.
            // For MySQL/Postgres we can just send back a message or basic DDL.
            return c.text(
               'Schema-only export for this DB type currently requires manual DDL extraction. Coming soon!',
               501,
            );
         }
      } catch (e: any) {
         return c.text(`Schema Export Failed: ${e.message}`, 500);
      }
   });

   app.route('/api', api);
}

// Fallback SQL generator for SQLite
async function generateSqliteDump(adapter: DBAdapter): Promise<string> {
   let sqlDump = '-- Drixio SQLite Fallback Backup\n\n';
   try {
      const tablesResult = await adapter.query(
         "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';",
      );
      for (const row of tablesResult.rows) {
         if (!row.sql) continue;
         sqlDump += `${row.sql};\n\n`;
         const data = await adapter.query(
            `SELECT * FROM ${adapter.quoteIdentifier(row.name as string)}`,
         );
         for (const d of data.rows) {
            const keys = Object.keys(d)
               .map((k) => adapter.quoteIdentifier(k))
               .join(', ');
            const vals = Object.values(d)
               .map((v) => {
                  if (v === null) return 'NULL';
                  if (typeof v === 'number') return v;
                  return `'${String(v).replace(/'/g, "''")}'`;
               })
               .join(', ');
            sqlDump += `INSERT INTO ${adapter.quoteIdentifier(row.name as string)} (${keys}) VALUES (${vals});\n`;
         }
         sqlDump += '\n';
      }
   } catch (e) {
      sqlDump += `-- Error generating backup: ${e}\n`;
   }
   return sqlDump;
}

// Fallback SQL generator for MySQL
async function generateMysqlDump(adapter: DBAdapter): Promise<string> {
   let sqlDump = '-- Drixio MySQL Fallback Backup\n\n';
   try {
      const tables = await adapter.getTables();
      for (const table of tables) {
         try {
            const createTableResult = await adapter.query(
               `SHOW CREATE TABLE ${adapter.quoteIdentifier(table)}`,
            );
            if (createTableResult.rows && createTableResult.rows.length > 0) {
               const row = createTableResult.rows[0] as Record<string, any>;
               const vals = Object.values(row);
               const createSql =
                  row['Create Table'] ||
                  row['Create View'] ||
                  (vals.length > 1 ? vals[1] : null);
               if (createSql) {
                  sqlDump += `${createSql};\n\n`;
               }
            }

            const data = await adapter.query(
               `SELECT * FROM ${adapter.quoteIdentifier(table)}`,
            );
            for (const d of data.rows) {
               const keys = Object.keys(d)
                  .map((k) => adapter.quoteIdentifier(k))
                  .join(', ');
               const vals = Object.values(d)
                  .map((v) => {
                     if (v === null) return 'NULL';
                     if (typeof v === 'number') return v;
                     let str = String(v);
                     str = str.replace(/\\/g, '\\\\');
                     str = str.replace(/'/g, "''");
                     str = str.replace(/\n/g, '\\n');
                     str = str.replace(/\r/g, '\\r');
                     return `'${str}'`;
                  })
                  .join(', ');
               sqlDump += `INSERT INTO ${adapter.quoteIdentifier(table)} (${keys}) VALUES (${vals});\n`;
            }
            sqlDump += '\n';
         } catch (tableErr) {
            sqlDump += `-- Error backing up table ${table}: ${tableErr}\n\n`;
         }
      }
   } catch (e) {
      sqlDump += `-- Error generating backup: ${e}\n`;
   }
   return sqlDump;
}
