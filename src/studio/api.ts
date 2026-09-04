import { Hono } from 'hono';
import {
   DBConfig,
   DBAdapter,
   createDBAdapter,
   previewMockData,
   generateAndInsertMockData,
   batchMutateTableData,
   applySchemaChanges,
   truncateTable,
   importDataToTable,
} from '../logic/index.js';
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

   api.post('/tables/:name/schema', async (c) => {
      const tableName = c.req.param('name');
      try {
         const body = await c.req.json().catch(() => ({}));
         const res = await applySchemaChanges(adapter, dbConfig.type, {
            tableName,
            ...body,
         });
         if (res.success) {
            return c.json({ success: true });
         } else {
            return c.json({ success: false, error: res.error }, 400);
         }
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/tables/:name/records', async (c) => {
      const tableName = c.req.param('name');
      try {
         const body = await c.req.json().catch(() => ({}));
         const { pkColumn, edits, inserts, deletes, schema } = body;
         const res = await batchMutateTableData(adapter, dbConfig.type, {
            tableName,
            pkColumn,
            edits,
            inserts,
            deletes,
            schema,
         });
         if (res.success) {
            return c.json({ success: true, count: res.executedCount });
         } else {
            return c.json({ success: false, error: res.error }, 400);
         }
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/tables/:name/truncate', async (c) => {
      const tableName = c.req.param('name');
      try {
         const res = await truncateTable(adapter, tableName);
         if (res.success) {
            return c.json({ success: true });
         } else {
            return c.json({ success: false, error: res.error }, 400);
         }
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/tables/:name/import', async (c) => {
      const tableName = c.req.param('name');
      try {
         const body = await c.req.parseBody();
         const file = body['file'];
         const format = (body['format'] as 'csv' | 'json') || 'csv';
         if (!(file instanceof File)) {
            return c.json({ success: false, error: 'No file uploaded' }, 400);
         }
         const text = await file.text();
         const res = await importDataToTable(adapter, tableName, format, text);
         return c.json({
            success: true,
            message: `Imported ${res.count} records successfully`,
         });
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

   api.post('/query/export', async (c) => {
      try {
         const { sql } = await c.req.json();
         if (!sql) {
            return c.json(
               { success: false, error: 'No SQL query provided' },
               400,
            );
         }

         const result = await adapter.query(sql);
         const rows = result.rows;
         const timestamp = getDatetimeStr();
         const format = c.req.query('format') || 'csv';
         const exportFilename = `query_result_${timestamp}`;

         if (format === 'json') {
            const jsonStr = JSON.stringify(rows, null, 2);
            c.header(
               'Content-Disposition',
               `attachment; filename="${exportFilename}.json"`,
            );
            c.header('Content-Type', 'application/json');
            return c.body(jsonStr);
         } else {
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
         const timestamp = getDatetimeStr();
         const exportFilename = `${tableName}_export_${timestamp}`;

         const stream = new ReadableStream({
            async start(controller) {
               const encoder = new TextEncoder();
               try {
                  const batchSize = 1000;
                  let batchOffset = 0;
                  let hasMore = true;
                  let isFirstChunk = true;

                  if (format === 'json') {
                     controller.enqueue(encoder.encode('[\n'));
                  }

                  while (hasMore) {
                     const batch = await adapter.getData(
                        tableName,
                        batchSize,
                        batchOffset,
                        whereClause,
                        orderBy,
                     );

                     if (batch.rows.length === 0) {
                        break;
                     }

                     if (format === 'json') {
                        let jsonStr = '';
                        for (let i = 0; i < batch.rows.length; i++) {
                           if (!isFirstChunk || i > 0) {
                              jsonStr += ',\n';
                           }
                           jsonStr += JSON.stringify(batch.rows[i], null, 2);
                        }
                        controller.enqueue(encoder.encode(jsonStr));
                     } else {
                        // CSV format
                        let csvStr = '';
                        const headers =
                           batch.columns || Object.keys(batch.rows[0] || {});

                        if (isFirstChunk && headers.length > 0) {
                           csvStr += headers.join(',') + '\n';
                        }

                        for (const r of batch.rows) {
                           const rowStr = headers
                              .map((h) => {
                                 let val = r[h];
                                 if (val === null || val === undefined)
                                    val = '';
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
                           csvStr += rowStr + '\n';
                        }
                        controller.enqueue(encoder.encode(csvStr));
                     }

                     isFirstChunk = false;
                     batchOffset += batchSize;
                     if (batch.rows.length < batchSize) {
                        hasMore = false;
                     }
                  }

                  if (format === 'json') {
                     controller.enqueue(encoder.encode('\n]'));
                  }

                  controller.close();
               } catch (e) {
                  // If headers are already sent, we can only close the stream with an error
                  controller.error(e);
               }
            },
         });

         c.header(
            'Content-Disposition',
            `attachment; filename="${exportFilename}.${format}"`,
         );
         c.header(
            'Content-Type',
            format === 'json' ? 'application/json' : 'text/csv',
         );
         return c.body(stream);
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

               // Initialize the stream immediately so we don't miss the 'end' event
               // if the native tool completes extremely fast (< 100ms)
               const stream = nodeToWebStream(cp.stdout);

               cp.on('error', (err: any) => {
                  if (!started)
                     reject(
                        new Error(
                           `Native tool '${cmd}' not found. Please install ${envName}.`,
                        ),
                     );
               });

               // Wait briefly to ensure it spawned successfully before returning the stream
               setTimeout(() => {
                  if (!cp.killed) {
                     started = true;
                     resolve(stream);
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
               let fallbackStream: ReadableStream;
               const baseName = getDbName();
               const timeStr = getDatetimeStr();
               if (type === 'sqlite') {
                  fallbackStream = generateSqliteDumpStream(adapter);
               } else if (type === 'mysql') {
                  fallbackStream = generateMysqlDumpStream(adapter);
               } else {
                  throw err;
               }
               c.header(
                  'Content-Disposition',
                  `attachment; filename="${baseName}_backup_${timeStr}.sql"`,
               );
               c.header('Content-Type', 'application/sql');
               return c.body(fallbackStream);
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
function generateSqliteDumpStream(adapter: DBAdapter): ReadableStream {
   return new ReadableStream({
      async start(controller) {
         const encoder = new TextEncoder();
         try {
            controller.enqueue(
               encoder.encode('-- Drixio SQLite Fallback Backup\n\n'),
            );
            const tablesResult = await adapter.query(
               "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';",
            );

            for (const row of tablesResult.rows) {
               if (!row.sql) continue;
               controller.enqueue(encoder.encode(`${row.sql};\n\n`));

               const tableName = row.name as string;
               const batchSize = 1000;
               let offset = 0;
               let hasMore = true;

               while (hasMore) {
                  const batch = await adapter.getData(
                     tableName,
                     batchSize,
                     offset,
                  );
                  if (batch.rows.length === 0) {
                     break;
                  }

                  let insertStrs = '';
                  for (const d of batch.rows) {
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
                     insertStrs += `INSERT INTO ${adapter.quoteIdentifier(tableName)} (${keys}) VALUES (${vals});\n`;
                  }
                  controller.enqueue(encoder.encode(insertStrs));

                  offset += batchSize;
                  if (batch.rows.length < batchSize) {
                     hasMore = false;
                  }
               }
               controller.enqueue(encoder.encode('\n'));
            }
            controller.close();
         } catch (e) {
            controller.enqueue(
               encoder.encode(`-- Error generating backup: ${e}\n`),
            );
            controller.close();
         }
      },
   });
}

// Fallback SQL generator for MySQL
function generateMysqlDumpStream(adapter: DBAdapter): ReadableStream {
   return new ReadableStream({
      async start(controller) {
         const encoder = new TextEncoder();
         try {
            controller.enqueue(
               encoder.encode('-- Drixio MySQL Fallback Backup\n\n'),
            );
            const tables = await adapter.getTables();

            for (const table of tables) {
               try {
                  const createTableResult = await adapter.query(
                     `SHOW CREATE TABLE ${adapter.quoteIdentifier(table)}`,
                  );
                  if (
                     createTableResult.rows &&
                     createTableResult.rows.length > 0
                  ) {
                     const row = createTableResult.rows[0] as Record<
                        string,
                        any
                     >;
                     const vals = Object.values(row);
                     const createSql =
                        row['Create Table'] ||
                        row['Create View'] ||
                        (vals.length > 1 ? vals[1] : null);
                     if (createSql) {
                        controller.enqueue(encoder.encode(`${createSql};\n\n`));
                     }
                  }

                  const batchSize = 1000;
                  let offset = 0;
                  let hasMore = true;

                  while (hasMore) {
                     const batch = await adapter.getData(
                        table,
                        batchSize,
                        offset,
                     );
                     if (batch.rows.length === 0) {
                        break;
                     }

                     let insertStrs = '';
                     for (const d of batch.rows) {
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
                        insertStrs += `INSERT INTO ${adapter.quoteIdentifier(table)} (${keys}) VALUES (${vals});\n`;
                     }
                     controller.enqueue(encoder.encode(insertStrs));

                     offset += batchSize;
                     if (batch.rows.length < batchSize) {
                        hasMore = false;
                     }
                  }
                  controller.enqueue(encoder.encode('\n'));
               } catch (tableErr) {
                  controller.enqueue(
                     encoder.encode(
                        `-- Error backing up table ${table}: ${tableErr}\n\n`,
                     ),
                  );
               }
            }
            controller.close();
         } catch (e) {
            controller.enqueue(
               encoder.encode(`-- Error generating backup: ${e}\n`),
            );
            controller.close();
         }
      },
   });
}
