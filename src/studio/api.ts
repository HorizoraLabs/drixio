import { Hono } from 'hono';
import {
   DBConfig,
   DBAdapter,
   createDBAdapter,
   detectDatabase,
   saveDatabaseUrl,
   createDatabase,
   previewMockData,
   generateAndInsertMockData,
   batchMutateTableData,
   applySchemaChanges,
   createTable,
   truncateTable,
   importDataToTable,
   generatePrismaSchema,
   generateDrizzleSchema,
   TableSchemaInfo,
   getTablesWithRowCount,
   generateDataDictionary,
   analyzeDangerousQuery,
   generateDatabaseSqlDumpStream,
   exportDatabaseSchemaDdl,
   exportQueryResult,
} from '../logic/index.js';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import path from 'node:path';
import fs from 'node:fs';

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

   // Dynamic database connection state
   let currentDbConfig: DBConfig = { ...dbConfig };
   let currentAdapter: DBAdapter | null = null;

   const initAdapter = (cfg: DBConfig): DBAdapter | null => {
      if (cfg.type === 'unknown' || !cfg.targetUrl) return null;
      try {
         return createDBAdapter(cfg);
      } catch {
         return null;
      }
   };

   currentAdapter = initAdapter(currentDbConfig);

   const getAdapter = (): DBAdapter => {
      if (!currentAdapter) {
         throw new Error(
            'No database connected. Please connect or create a database first.',
         );
      }
      return currentAdapter;
   };

   const getDbName = () => {
      let dbName = 'database';
      if (currentDbConfig.targetUrl) {
         if (currentDbConfig.type === 'sqlite') {
            dbName =
               currentDbConfig.targetUrl
                  .replace('file:', '')
                  .split(/[/\\]/)
                  .pop() || dbName;
         } else {
            dbName =
               currentDbConfig.targetUrl.split('/').pop()?.split('?')[0] ||
               dbName;
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
         if (!currentAdapter || currentDbConfig.type === 'unknown') {
            return c.json({ success: true, data: [] });
         }
         const tables = await currentAdapter.getTables();
         return c.json({ success: true, data: tables });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.get('/config', (c) => {
      const isConnected =
         !!currentAdapter && currentDbConfig.type !== 'unknown';
      return c.json({
         success: true,
         data: {
            connected: isConnected,
            dbType: isConnected ? currentDbConfig.type : 'none',
            dbName: isConnected ? getDbName() : 'No Database',
            targetUrl: currentDbConfig.targetUrl || '',
         },
      });
   });

   api.get('/status', async (c) => {
      try {
         if (!currentAdapter || currentDbConfig.type === 'unknown') {
            return c.json({
               success: true,
               data: {
                  status: 'disconnected',
                  dbType: 'none',
                  dbName: 'No Database',
                  totalTables: 0,
               },
            });
         }
         const status = await currentAdapter.getStatus();

         // Calculate total tables
         const tables = await currentAdapter.getTables();
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
         if (!currentAdapter || currentDbConfig.type === 'unknown') {
            return c.json({ success: true, data: {} });
         }
         const res = await getTablesWithRowCount(currentAdapter);
         if (!res.success) {
            return c.json({ success: false, error: res.error }, 500);
         }
         const stats: Record<string, number> = {};
         for (const t of res.data) {
            stats[t.name] = typeof t.rows === 'number' ? t.rows : 0;
         }
         return c.json({ success: true, data: stats });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.get('/tables/:name/schema', async (c) => {
      const tableName = c.req.param('name');
      try {
         const schema = await getAdapter().getSchema(tableName);
         return c.json({ success: true, data: schema });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/tables/:name/schema', async (c) => {
      const tableName = c.req.param('name');
      try {
         const body = await c.req.json().catch(() => ({}));
         const res = await applySchemaChanges(
            getAdapter(),
            currentDbConfig.type,
            {
               tableName,
               ...body,
            },
         );
         if (res.success) {
            return c.json({ success: true });
         } else {
            return c.json({ success: false, error: res.error }, 400);
         }
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.get('/generate-orm', async (c) => {
      const target = c.req.query('target') || 'prisma';
      const requestedTable = c.req.query('table');

      try {
         const adapter = getAdapter();
         const allTables = await adapter.getTables();
         const targetTables =
            requestedTable && requestedTable !== '*'
               ? allTables.filter(
                    (t) => t.toLowerCase() === requestedTable.toLowerCase(),
                 )
               : allTables;

         if (
            targetTables.length === 0 &&
            requestedTable &&
            requestedTable !== '*'
         ) {
            return c.json(
               {
                  success: false,
                  error: `Table "${requestedTable}" not found.`,
               },
               404,
            );
         }

         const schemaInfos: TableSchemaInfo[] = [];
         for (const tbl of targetTables) {
            const cols = await adapter.getSchema(tbl);
            schemaInfos.push({ tableName: tbl, columns: cols });
         }

         let code = '';
         if (target === 'drizzle') {
            code = generateDrizzleSchema(schemaInfos, currentDbConfig.type);
         } else {
            code = generatePrismaSchema(schemaInfos, currentDbConfig.type);
         }

         return c.json({
            success: true,
            data: {
               target,
               table: requestedTable || '*',
               dialect: currentDbConfig.type,
               code,
            },
         });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/tables/:name/records', async (c) => {
      const tableName = c.req.param('name');
      try {
         const body = await c.req.json().catch(() => ({}));
         const { pkColumn, edits, inserts, deletes, schema } = body;
         const res = await batchMutateTableData(
            getAdapter(),
            currentDbConfig.type,
            {
               tableName,
               pkColumn,
               edits,
               inserts,
               deletes,
               schema,
            },
         );
         if (res.success) {
            return c.json({ success: true, count: res.data.executedCount });
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
         const res = await truncateTable(getAdapter(), tableName);
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
         const res = await importDataToTable(
            getAdapter(),
            tableName,
            format,
            text,
         );
         if (!res.success) {
            return c.json({ success: false, error: res.error }, 400);
         }
         return c.json({
            success: true,
            message: `Imported ${res.data.count} records successfully`,
         });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.get('/tables/:name/indexes', async (c) => {
      const tableName = c.req.param('name');
      try {
         const indexes = await getAdapter().getIndexes(tableName);
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
         const data = await getAdapter().getData(
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
         const res = await previewMockData(getAdapter(), tableName, 3);
         if (!res.success) {
            return c.json({ success: false, error: res.error }, 400);
         }
         return c.json({ success: true, data: res.data });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/tables/:name/mock', async (c) => {
      try {
         const tableName = c.req.param('name');
         const body = await c.req.json().catch(() => ({}));
         const count = Math.min(Math.max(Number(body.count) || 10, 1), 1000);
         const res = await generateAndInsertMockData(
            getAdapter(),
            tableName,
            count,
         );
         if (!res.success) {
            return c.json({ success: false, error: res.error }, 400);
         }
         return c.json({ success: true, count: res.data.insertedCount });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/analyze-query', async (c) => {
      try {
         const { sql } = await c.req.json().catch(() => ({}));
         const result = analyzeDangerousQuery(sql);
         return c.json({ success: true, ...result });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/query', async (c) => {
      try {
         const { sql } = await c.req.json();
         if (!sql || typeof sql !== 'string') {
            return c.json(
               { success: false, error: 'SQL query is required' },
               400,
            );
         }

         const trimmed = sql.trim();

         // 1. Intercept CONNECT <url> command
         const connectMatch = trimmed.match(/^CONNECT\s+([^\s;]+)\s*;?$/i);
         if (connectMatch) {
            const rawUrl = connectMatch[1];
            const newConfig = await detectDatabase(rawUrl);
            const newAdapter = createDBAdapter(newConfig);
            await newAdapter.getTables();

            if (currentAdapter) {
               try {
                  await currentAdapter.close();
               } catch {}
            }

            currentDbConfig = newConfig;
            currentAdapter = newAdapter;

            return c.json({
               success: true,
               data: {
                  columns: ['Result', 'Database', 'Type'],
                  rows: [
                     {
                        Result: 'Connected successfully',
                        Database: getDbName(),
                        Type: newConfig.type,
                     },
                  ],
                  affectedRows: 1,
                  connectionChanged: true,
                  dbConfig: {
                     type: newConfig.type,
                     dbName: getDbName(),
                  },
               },
            });
         }

         // 2. Intercept DISCONNECT command
         if (/^DISCONNECT\s*;?$/i.test(trimmed)) {
            if (currentAdapter) {
               try {
                  await currentAdapter.close();
               } catch {}
            }
            currentDbConfig = {
               type: 'unknown',
               targetUrl: '',
               source: 'manual',
            };
            currentAdapter = null;

            return c.json({
               success: true,
               data: {
                  columns: ['Result'],
                  rows: [{ Result: 'Disconnected from database' }],
                  affectedRows: 1,
                  connectionChanged: true,
                  dbConfig: {
                     type: 'none',
                     dbName: 'No Database',
                  },
               },
            });
         }

         // 3. Intercept CREATE DATABASE <name> command
         const createDbMatch = trimmed.match(
            /^CREATE\s+DATABASE\s+(?:IF\s+NOT\s+EXISTS\s+)?['"`]?([^'";`\s]+)['"`]?\s*;?$/i,
         );
         if (createDbMatch) {
            const dbName = createDbMatch[1];
            // If currently connected to Postgres or MySQL, run CREATE DATABASE on the server
            if (
               currentAdapter &&
               (currentDbConfig.type === 'postgres' ||
                  currentDbConfig.type === 'mysql')
            ) {
               const quote = currentDbConfig.type === 'mysql' ? '`' : '"';
               await currentAdapter.executeSql(
                  `CREATE DATABASE ${quote}${dbName}${quote};`,
               );
               return c.json({
                  success: true,
                  data: {
                     columns: ['Result', 'Database'],
                     rows: [{ Result: 'Database Created', Database: dbName }],
                     affectedRows: 1,
                  },
               });
            }

            // Otherwise (disconnected or SQLite): create a new SQLite file using shared createDatabase!
            const result = await createDatabase({
               dialect: 'sqlite',
               dbName,
            });

            if (!result.success) {
               return c.json({ success: false, error: result.error }, 400);
            }

            const newConfig: DBConfig = {
               type: 'sqlite',
               targetUrl: result.data.targetUrl,
               source: 'manual',
            };

            const newAdapter = createDBAdapter(newConfig);
            await newAdapter.getTables();

            if (currentAdapter) {
               try {
                  await currentAdapter.close();
               } catch {}
            }

            currentDbConfig = newConfig;
            currentAdapter = newAdapter;

            return c.json({
               success: true,
               data: {
                  columns: ['Result', 'Database', 'Path'],
                  rows: [
                     {
                        Result: 'Created & Connected',
                        Database: result.data.dbName,
                        Path: result.data.targetUrl.replace('file:', ''),
                     },
                  ],
                  affectedRows: 1,
                  connectionChanged: true,
                  dbConfig: {
                     type: 'sqlite',
                     dbName: result.data.dbName,
                  },
               },
            });
         }

         // 4. Normal SQL execution
         if (!currentAdapter) {
            return c.json(
               {
                  success: false,
                  error: 'No database connected. Run CREATE DATABASE <name> or CONNECT <url> to start.',
               },
               400,
            );
         }

         const result = await currentAdapter.query(sql);
         return c.json({ success: true, data: result });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/query/export', async (c) => {
      try {
         const body = await c.req.json();
         let rows = body.rows;
         if (!rows && body.sql) {
            const result = await getAdapter().query(body.sql);
            rows = result.rows;
         }
         if (!rows) {
            return c.json(
               { success: false, error: 'No SQL query or rows provided' },
               400,
            );
         }

         const format = (c.req.query('format') || 'csv').toLowerCase() as
            | 'csv'
            | 'json';
         const timestamp = getDatetimeStr();
         const exportFilename = `query_result_${timestamp}`;
         const content = exportQueryResult(rows, format);

         c.header(
            'Content-Disposition',
            `attachment; filename="${exportFilename}.${format}"`,
         );
         c.header(
            'Content-Type',
            format === 'json' ? 'application/json' : 'text/csv',
         );
         return c.body(content);
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
                     const batch = await getAdapter().getData(
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
         if (!currentAdapter || currentDbConfig.type === 'unknown') {
            throw new Error('No database connected');
         }
         const type = currentDbConfig.type;
         const url = currentDbConfig.targetUrl;
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
               const baseName = getDbName();
               const timeStr = getDatetimeStr();
               const fallbackStream = generateDatabaseSqlDumpStream(
                  getAdapter(),
                  type,
               );
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

         if (!currentAdapter || currentDbConfig.type === 'unknown') {
            return c.json(
               { success: false, error: 'No database connected' },
               400,
            );
         }

         if (file.name.toLowerCase().endsWith('.json')) {
            const raw = await file.text();
            const parsed = JSON.parse(raw);
            const tableName = parsed.table || file.name.replace(/\.json$/i, '');
            const schema = parsed.schema || [];
            const rows = Array.isArray(parsed.data)
               ? parsed.data
               : Array.isArray(parsed)
                 ? parsed
                 : [];
            const existingTables = await getAdapter().getTables();

            if (!existingTables.includes(tableName)) {
               if (schema.length > 0) {
                  const ctRes = await createTable(
                     getAdapter(),
                     currentDbConfig.type,
                     tableName,
                     schema,
                  );
                  if (!ctRes.success) {
                     return c.json({ success: false, error: ctRes.error }, 400);
                  }
               }
            } else {
               try {
                  await getAdapter().truncateTable(tableName);
               } catch {
                  await getAdapter().executeSql(
                     `DELETE FROM ${getAdapter().quoteIdentifier(tableName)};`,
                  );
               }
            }

            if (rows.length > 0) {
               const CHUNK_SIZE = 500;
               for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
                  await getAdapter().insert(
                     tableName,
                     rows.slice(i, i + CHUNK_SIZE),
                  );
               }
            }

            return c.json({
               success: true,
               message: `Table '${tableName}' restored successfully (${rows.length} rows)`,
            });
         }

         const sqlContent = await file.text();
         const type = currentDbConfig.type;
         const url = currentDbConfig.targetUrl;

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
               await getAdapter().executeSql(sqlContent);
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
         if (!currentAdapter || currentDbConfig.type === 'unknown') {
            return c.text('No database connected', 400);
         }
         const dbName = getDbName();
         const md = await generateDataDictionary(getAdapter(), dbName);
         const res = await generateDataDictionary(getAdapter(), dbName);
         if (!res.success) {
            return c.text(`Data Dictionary Export Failed: ${res.error}`, 500);
         }
         c.header(
            'Content-Disposition',
            `attachment; filename="${dbName}_dictionary_${getDatetimeStr()}.md"`,
         );
         c.header('Content-Type', 'text/markdown');
         return c.body(res.data);
      } catch (e: any) {
         return c.text(`Data Dictionary Export Failed: ${e.message}`, 500);
      }
   });

   api.get('/database/schema-only', async (c) => {
      try {
         if (!currentAdapter || currentDbConfig.type === 'unknown') {
            return c.text('No database connected', 400);
         }
         const type = currentDbConfig.type;
         const filename = `${getDbName()}_schema_${getDatetimeStr()}.sql`;
         const dumpRes = await exportDatabaseSchemaDdl(getAdapter(), type);
         if (!dumpRes.success) {
            return c.text(`Schema Export Failed: ${dumpRes.error}`, 500);
         }

         c.header('Content-Disposition', `attachment; filename="${filename}"`);
         c.header('Content-Type', 'application/sql');
         return c.body(dumpRes.data);
      } catch (e: any) {
         return c.text(`Schema Export Failed: ${e.message}`, 500);
      }
   });

   api.post('/connect', async (c) => {
      try {
         const body = await c.req.json().catch(() => ({}));
         const {
            mode,
            dbType,
            host,
            port,
            user,
            password,
            dbName,
            saveToEnv,
            createIfNotExist,
         } = body;

         let targetUrl = '';
         let newConfig: DBConfig;

         // 1. Create mode (PostgreSQL, MySQL, or SQLite) via shared createDatabase
         if (mode === 'create') {
            const dialect = (dbType || 'sqlite').toLowerCase() as
               | 'sqlite'
               | 'postgres'
               | 'mysql';
            const result = await createDatabase({
               dialect,
               dbName: dbName || body.sqlitePath || 'database.sqlite',
               host,
               port,
               user,
               password,
            });

            if (!result.success) {
               return c.json({ success: false, error: result.error }, 400);
            }

            targetUrl = result.data.targetUrl;
            newConfig = await detectDatabase(targetUrl);
         } else {
            // 2. Direct connect mode or SQLite existing file
            const rawInput = body.url || body.sqlitePath;
            if (!rawInput || typeof rawInput !== 'string') {
               return c.json(
                  { success: false, error: 'Database URL or path is required' },
                  400,
               );
            }
            targetUrl = rawInput.trim();

            if (
               (dbType === 'sqlite' ||
                  targetUrl.startsWith('file:') ||
                  targetUrl.endsWith('.sqlite') ||
                  targetUrl.endsWith('.db')) &&
               createIfNotExist
            ) {
               // Use createDatabase for sqlite if requested
               const result = await createDatabase({
                  dialect: 'sqlite',
                  dbName: targetUrl.replace(/^file:/, ''),
               });
               if (!result.success) {
                  return c.json({ success: false, error: result.error }, 400);
               }
               targetUrl = result.data.targetUrl;
            }

            newConfig = await detectDatabase(targetUrl);
         }

         const newAdapter = createDBAdapter(newConfig);
         await newAdapter.getTables();

         if (currentAdapter) {
            try {
               await currentAdapter.close();
            } catch {}
         }
         currentDbConfig = newConfig;
         currentAdapter = newAdapter;

         if (saveToEnv) {
            try {
               await saveDatabaseUrl(targetUrl);
            } catch {}
         }

         return c.json({
            success: true,
            data: {
               dbType: newConfig.type,
               dbName: getDbName(),
               targetUrl: newConfig.targetUrl,
            },
         });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/test-connect', async (c) => {
      const startTime = Date.now();
      try {
         const body = await c.req.json().catch(() => ({}));
         const { mode, dbType, host, port, user, password, dbName } = body;

         const dialect = (dbType || 'sqlite').toLowerCase();

         if (dialect === 'sqlite') {
            const rawPath =
               body.url || body.sqlitePath || dbName || 'drixio.sqlite';
            const cleanPath = rawPath.replace(/^file:/, '').trim();
            const fullPath = path.isAbsolute(cleanPath)
               ? cleanPath
               : path.resolve(process.cwd(), cleanPath);

            if (mode === 'create') {
               const dir = path.dirname(fullPath);
               if (!fs.existsSync(dir)) {
                  return c.json(
                     {
                        success: false,
                        error: `Directory "${dir}" does not exist.`,
                     },
                     400,
                  );
               }
               const exists = fs.existsSync(fullPath);
               const latencyMs = Date.now() - startTime;
               return c.json({
                  success: true,
                  data: {
                     latencyMs,
                     message: exists
                        ? `File already exists at "${path.basename(fullPath)}". Will connect and reuse.`
                        : `Target path is valid. File will be created on connect.`,
                     fullPath,
                  },
               });
            } else {
               if (!fs.existsSync(fullPath)) {
                  return c.json(
                     {
                        success: false,
                        error: `Database file not found at: ${fullPath}`,
                     },
                     400,
                  );
               }
               const stats = fs.statSync(fullPath);
               if (stats.isDirectory()) {
                  return c.json(
                     {
                        success: false,
                        error: `Specified path is a directory, not a database file.`,
                     },
                     400,
                  );
               }
               const tempConfig = await detectDatabase(fullPath);
               const tempAdapter = createDBAdapter(tempConfig);
               const tables = await tempAdapter.getTables();
               await tempAdapter.close();
               const latencyMs = Date.now() - startTime;
               return c.json({
                  success: true,
                  data: {
                     latencyMs,
                     message: `SQLite database file verified (${tables.length} table${tables.length === 1 ? '' : 's'} found).`,
                     fullPath,
                     tablesCount: tables.length,
                  },
               });
            }
         }

         // Server databases (PostgreSQL, MySQL)
         let targetUrl = '';
         if (mode === 'create') {
            const targetHost = host || 'localhost';
            const targetPort =
               port || (dialect === 'postgres' ? '5432' : '3306');
            const targetUser =
               user || (dialect === 'postgres' ? 'postgres' : 'root');
            const auth = password
               ? `${encodeURIComponent(targetUser)}:${encodeURIComponent(password)}`
               : encodeURIComponent(targetUser);
            const defaultDb = dialect === 'postgres' ? 'postgres' : '';
            targetUrl = `${dialect}://${auth}@${targetHost}:${targetPort}/${defaultDb}`;
         } else {
            const rawUrl = body.url;
            if (!rawUrl) {
               return c.json(
                  { success: false, error: 'Connection URI is required.' },
                  400,
               );
            }
            targetUrl = rawUrl.trim();
         }

         const testConfig = await detectDatabase(targetUrl);
         const testAdapter = createDBAdapter(testConfig);
         await testAdapter.query('SELECT 1 as connected;');
         let tablesCount = 0;
         try {
            const tables = await testAdapter.getTables();
            tablesCount = tables.length;
         } catch {}
         await testAdapter.close();

         const latencyMs = Date.now() - startTime;
         return c.json({
            success: true,
            data: {
               latencyMs,
               message:
                  mode === 'create'
                     ? `Server instance is reachable. Ready to execute CREATE DATABASE.`
                     : `Connected successfully (${tablesCount} table${tablesCount === 1 ? '' : 's'} found).`,
               tablesCount,
            },
         });
      } catch (e: any) {
         const latencyMs = Date.now() - startTime;
         return c.json(
            {
               success: false,
               latencyMs,
               error: e.message || 'Connection test failed',
            },
            400,
         );
      }
   });

   api.post('/disconnect', async (c) => {
      try {
         if (currentAdapter) {
            try {
               await currentAdapter.close();
            } catch {}
         }
         currentDbConfig = {
            type: 'unknown',
            targetUrl: '',
            source: 'manual',
         };
         currentAdapter = null;

         return c.json({
            success: true,
            data: {
               connected: false,
               dbType: 'none',
               dbName: 'No Database',
            },
         });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
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
