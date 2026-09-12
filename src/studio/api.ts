import { Hono } from 'hono';
import {
   DBConfig,
   DBAdapter,
   createDBAdapter,
   detectDatabase,
   saveDatabaseUrl,
   createDatabase,
   createTable,
   previewMockData,
   generateAndInsertMockData,
   batchMutateTableData,
   applySchemaChanges,
   truncateTable,
   importDataToTable,
   generatePrismaSchema,
   generateDrizzleSchema,
   getTableSchemas,
   getTablesWithRowCount,
   generateDataDictionary,
   analyzeDangerousQuery,
   generateDatabaseSqlDumpStream,
   exportDatabaseSchemaDdl,
   exportQueryResult,
   exportTable,
   restoreTableFromJsonContent,
   createSchemaSnapshot,
   diffDatabases,
   diffDatabaseWithSnapshot,
   SchemaSnapshot,
   loadSnippets,
   saveSnippet,
   updateSnippet,
   deleteSnippet,
   getDrixioVersion,
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

   api.post('/tables', async (c) => {
      try {
         const { tableName, columns } = await c.req.json().catch(() => ({}));
         if (!tableName || typeof tableName !== 'string') {
            return c.json(
               { success: false, error: 'Table name is required' },
               400,
            );
         }
         if (!columns || !Array.isArray(columns) || columns.length === 0) {
            return c.json(
               { success: false, error: 'At least one column is required' },
               400,
            );
         }
         const adapter = getAdapter();
         const res = await createTable(
            adapter,
            currentDbConfig.type,
            tableName.trim(),
            columns,
         );
         if (res.success) {
            return c.json({
               success: true,
               message: `Table "${tableName.trim()}" created successfully`,
            });
         } else {
            return c.json({ success: false, error: res.error }, 400);
         }
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   const detectHostEnvironment = (
      cfg: DBConfig,
   ): { isRemote: boolean; host: string; badgeLabel: string } => {
      if (cfg.type === 'sqlite') {
         return {
            isRemote: false,
            host: 'local',
            badgeLabel: 'LOCAL (SQLite)',
         };
      }
      if (cfg.type === 'mysql' || cfg.type === 'postgres') {
         let host = 'localhost';
         const match = cfg.targetUrl.match(/@([^:/@?]+)/);
         if (match) host = match[1];

         const isLocal =
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host === '::1' ||
            host === '0.0.0.0' ||
            host === 'host.docker.internal';

         return {
            isRemote: !isLocal,
            host,
            badgeLabel: isLocal
               ? `LOCAL (${cfg.type.toUpperCase()})`
               : `REMOTE (${host})`,
         };
      }
      return { isRemote: false, host: '', badgeLabel: 'DISCONNECTED' };
   };

   api.get('/config', (c) => {
      const isConnected =
         !!currentAdapter && currentDbConfig.type !== 'unknown';
      const envInfo = detectHostEnvironment(currentDbConfig);
      return c.json({
         success: true,
         data: {
            appVersion: getDrixioVersion(),
            connected: isConnected,
            dbType: isConnected ? currentDbConfig.type : 'none',
            dbName: isConnected ? getDbName() : 'No Database',
            targetUrl: currentDbConfig.targetUrl || '',
            isRemote: envInfo.isRemote,
            host: envInfo.host,
            badgeLabel: isConnected ? envInfo.badgeLabel : 'DISCONNECTED',
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

         const schemasRes = await getTableSchemas(adapter, targetTables);
         if (!schemasRes.success) {
            return c.json({ success: false, error: schemasRes.error }, 500);
         }
         const schemaInfos = schemasRes.data;

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

   api.post('/query/explain', async (c) => {
      try {
         const { sql } = await c.req.json().catch(() => ({}));
         if (!sql || typeof sql !== 'string') {
            return c.json(
               { success: false, error: 'SQL query is required for explain' },
               400,
            );
         }

         const adapter = getAdapter();
         // 1. Strip comments and trailing semicolons
         let cleanSql = sql
            .replace(/--.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .trim()
            .replace(/;+$/, '')
            .trim();

         if (!cleanSql) {
            return c.json(
               {
                  success: false,
                  error: 'SQL query is empty after stripping comments',
               },
               400,
            );
         }

         // 2. Reject DDL statements that cannot be explained
         if (/^(CREATE|DROP|ALTER|TRUNCATE)\s+/i.test(cleanSql)) {
            return c.json(
               {
                  success: false,
                  error: 'DDL statements (CREATE, DROP, ALTER, TRUNCATE) do not have query execution plans to explain.',
               },
               400,
            );
         }

         // 3. Strip redundant user-provided EXPLAIN prefixes if present
         const hasUserExplain = /^EXPLAIN\b/i.test(cleanSql);
         let targetSql = cleanSql;
         if (hasUserExplain) {
            targetSql = cleanSql
               .replace(/^EXPLAIN\s+(QUERY\s+PLAN\s+)?/i, '')
               .replace(
                  /^\((ANALYZE|COSTS|VERBOSE|BUFFERS|FORMAT\s+\w+|,|\s)+\)\s*/i,
                  '',
               )
               .trim();
         }

         let explainSql = '';
         const isDmlWrite = /^(INSERT|UPDATE|DELETE)\s+/i.test(targetSql);

         if (currentDbConfig.type === 'sqlite') {
            explainSql = `EXPLAIN QUERY PLAN ${targetSql}`;
         } else if (currentDbConfig.type === 'postgres') {
            // For write statements (INSERT/UPDATE/DELETE), DO NOT use ANALYZE to prevent accidental data changes!
            // Use COSTS and VERBOSE instead, which only plans without executing.
            if (isDmlWrite) {
               explainSql = `EXPLAIN (COSTS, VERBOSE) ${targetSql}`;
            } else {
               explainSql = `EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS) ${targetSql}`;
            }
         } else if (currentDbConfig.type === 'mysql') {
            explainSql = `EXPLAIN ${targetSql}`;
         } else {
            explainSql = `EXPLAIN ${targetSql}`;
         }

         const startTime = performance.now();
         let res;
         try {
            res = await adapter.query(explainSql);
         } catch (primaryErr: any) {
            // Postgres fallback if ANALYZE or BUFFERS fails
            if (currentDbConfig.type === 'postgres') {
               explainSql = `EXPLAIN ${targetSql}`;
               res = await adapter.query(explainSql);
            } else {
               throw primaryErr;
            }
         }
         const durationMs = Math.round(performance.now() - startTime);

         return c.json({
            success: true,
            data: {
               columns: res.columns,
               rows: res.rows,
               durationMs,
               explainSql,
               dialect: currentDbConfig.type,
            },
         });
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
      const format = (c.req.query('format') || 'csv') as 'csv' | 'json';
      const whereClause = c.req.query('where') || '';
      const orderCol = c.req.query('orderCol');
      const orderAscStr = c.req.query('orderAsc');

      let orderBy = undefined;
      if (orderCol) {
         orderBy = { col: orderCol, asc: orderAscStr !== 'false' };
      }

      try {
         const res = await exportTable(getAdapter(), tableName, {
            format,
            whereClause,
            orderBy,
         });

         if (!res.success) {
            return c.text(`Export Failed: ${res.error}`, 500);
         }

         const timestamp = getDatetimeStr();
         const exportFilename = `${tableName}_export_${timestamp}`;

         c.header(
            'Content-Disposition',
            `attachment; filename="${exportFilename}.${format}"`,
         );
         c.header(
            'Content-Type',
            format === 'json' ? 'application/json' : 'text/csv',
         );
         return c.body(res.data);
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
            const res = await restoreTableFromJsonContent(
               getAdapter(),
               currentDbConfig.type,
               raw,
               file.name.replace(/\.json$/i, ''),
            );
            if (!res.success) {
               return c.json({ success: false, error: res.error }, 400);
            }
            return c.json({
               success: true,
               message: `Table '${res.data.restoredTables.join(', ')}' restored successfully (${res.data.totalRows} rows)`,
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

   api.get('/schema/snapshot', async (c) => {
      try {
         if (!currentAdapter || currentDbConfig.type === 'unknown') {
            return c.json(
               { success: false, error: 'No database connected' },
               400,
            );
         }
         const dbName = getDbName();
         const res = await createSchemaSnapshot(
            getAdapter(),
            currentDbConfig.type,
            dbName,
         );
         if (!res.success) {
            return c.json({ success: false, error: res.error }, 500);
         }

         const filename = `${dbName}_snapshot_${getDatetimeStr()}.json`;
         c.header('Content-Disposition', `attachment; filename="${filename}"`);
         c.header('Content-Type', 'application/json');
         return c.body(JSON.stringify(res.data, null, 2));
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/schema/diff', async (c) => {
      try {
         if (!currentAdapter || currentDbConfig.type === 'unknown') {
            return c.json(
               { success: false, error: 'No database connected' },
               400,
            );
         }

         const body = await c.req.json().catch(() => ({}));
         const { targetUrl, snapshot, reverse } = body;

         if (!targetUrl && !snapshot) {
            return c.json(
               {
                  success: false,
                  error: 'Either targetUrl or snapshot JSON must be provided.',
               },
               400,
            );
         }

         if (targetUrl) {
            const targetConfig = await detectDatabase(targetUrl);
            const targetAdapter = createDBAdapter(targetConfig as any);
            try {
               const diffRes = await diffDatabases(
                  getAdapter(),
                  targetAdapter,
                  currentDbConfig.type,
                  getDbName(),
                  targetUrl,
               );
               if (!diffRes.success) {
                  return c.json({ success: false, error: diffRes.error }, 400);
               }
               return c.json({
                  success: true,
                  data: {
                     diff: diffRes.data,
                     migrationSql: reverse
                        ? diffRes.data.rollbackSql
                        : diffRes.data.migrationSql,
                     rollbackSql: diffRes.data.rollbackSql,
                  },
               });
            } finally {
               await targetAdapter.close().catch(() => {});
            }
         } else {
            // Snapshot mode
            let snapshotData: SchemaSnapshot = snapshot;
            if (typeof snapshot === 'string') {
               try {
                  snapshotData = JSON.parse(snapshot);
               } catch {
                  return c.json(
                     {
                        success: false,
                        error: 'Invalid JSON snapshot provided.',
                     },
                     400,
                  );
               }
            }

            const diffRes = await diffDatabaseWithSnapshot(
               getAdapter(),
               snapshotData,
               currentDbConfig.type,
               getDbName(),
               snapshotData.dbName
                  ? `Snapshot (${snapshotData.dbName})`
                  : undefined,
            );

            if (!diffRes.success) {
               return c.json({ success: false, error: diffRes.error }, 400);
            }

            return c.json({
               success: true,
               data: {
                  diff: diffRes.data,
                  migrationSql: reverse
                     ? diffRes.data.rollbackSql
                     : diffRes.data.migrationSql,
                  rollbackSql: diffRes.data.rollbackSql,
               },
            });
         }
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/schema/apply-migration', async (c) => {
      try {
         if (!currentAdapter || currentDbConfig.type === 'unknown') {
            return c.json(
               { success: false, error: 'No database connected' },
               400,
            );
         }

         const { sql } = await c.req.json().catch(() => ({}));
         if (!sql || typeof sql !== 'string' || !sql.trim()) {
            return c.json(
               { success: false, error: 'SQL migration script is required.' },
               400,
            );
         }

         await getAdapter().executeSql(sql);
         return c.json({
            success: true,
            message: 'Migration SQL executed successfully.',
         });
      } catch (e: any) {
         return c.json(
            {
               success: false,
               error: `Migration execution failed: ${e.message}`,
            },
            500,
         );
      }
   });

   // Saved Queries / Snippets Endpoints
   api.get('/snippets', async (c) => {
      try {
         const snippets = await loadSnippets();
         return c.json({ success: true, data: snippets });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/snippets', async (c) => {
      try {
         const body = await c.req.json().catch(() => ({}));
         const { title, sql, description, tags } = body;
         if (!sql || typeof sql !== 'string' || !sql.trim()) {
            return c.json(
               { success: false, error: 'SQL query text is required.' },
               400,
            );
         }
         const snippet = await saveSnippet({
            title: title || 'Untitled Snippet',
            sql,
            description,
            tags,
         });
         return c.json({ success: true, data: snippet });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.put('/snippets/:id', async (c) => {
      try {
         const id = c.req.param('id');
         const body = await c.req.json().catch(() => ({}));
         const updated = await updateSnippet(id, body);
         if (!updated) {
            return c.json(
               { success: false, error: `Snippet "${id}" not found.` },
               404,
            );
         }
         return c.json({ success: true, data: updated });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.delete('/snippets/:id', async (c) => {
      try {
         const id = c.req.param('id');
         const deleted = await deleteSnippet(id);
         if (!deleted) {
            return c.json(
               { success: false, error: `Snippet "${id}" not found.` },
               404,
            );
         }
         return c.json({
            success: true,
            message: 'Snippet deleted successfully.',
         });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
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

   // ====================== SCHEMA SWITCHING (PostgreSQL) ======================

   api.get('/schemas', async (c) => {
      try {
         const adapter = currentAdapter;
         const supported =
            !!adapter &&
            typeof adapter.getSchemas === 'function' &&
            currentDbConfig.type === 'postgres';

         if (!supported || !adapter) {
            return c.json({
               success: true,
               data: { supported: false, schemas: [], currentSchema: 'public' },
            });
         }

         const schemas = await adapter.getSchemas!();
         const currentSchema = adapter.getCurrentSchema
            ? adapter.getCurrentSchema()
            : 'public';

         return c.json({
            success: true,
            data: { supported: true, schemas, currentSchema },
         });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   api.post('/schemas/switch', async (c) => {
      try {
         const { schema } = await c.req.json().catch(() => ({}));
         if (!schema || typeof schema !== 'string') {
            return c.json(
               { success: false, error: 'Schema name is required' },
               400,
            );
         }

         const adapter = currentAdapter;
         if (
            !adapter ||
            typeof adapter.setSchema !== 'function' ||
            currentDbConfig.type !== 'postgres'
         ) {
            return c.json(
               {
                  success: false,
                  error: 'Schema switching is only supported for PostgreSQL',
               },
               400,
            );
         }

         await adapter.setSchema(schema);
         // Verify the schema is usable by fetching tables
         const tables = await adapter.getTables();

         return c.json({
            success: true,
            data: {
               schema,
               tableCount: tables.length,
            },
         });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   // ====================== DATABASE ENUMS ======================

   api.get('/database/enums', async (c) => {
      try {
         const adapter = currentAdapter;
         if (!adapter) {
            return c.json({ success: true, data: [] });
         }

         // 1. If PostgreSQL, use native catalog getCustomEnums()
         if (adapter.getCustomEnums) {
            const enums = await adapter.getCustomEnums();
            return c.json({ success: true, data: enums });
         }

         // 2. Cross-dialect fallback: scan enums from existing tables
         const enumsMap = new Map<string, string[]>();
         try {
            const tables = await adapter.getTables();
            for (const t of tables.slice(0, 30)) {
               const cols = await adapter.getSchema(t);
               for (const col of cols) {
                  if (col.enumValues && col.enumValues.length > 0) {
                     const key =
                        col.type &&
                        ![
                           'enum',
                           'varchar',
                           'varchar(255)',
                           'text',
                           'string',
                        ].includes(col.type.toLowerCase())
                           ? col.type
                           : col.name;
                     if (!enumsMap.has(key)) {
                        enumsMap.set(key, col.enumValues);
                     }
                  }
               }
            }
         } catch {}

         const data = Array.from(enumsMap.entries()).map(([name, values]) => ({
            name,
            values,
         }));

         return c.json({ success: true, data });
      } catch (e: any) {
         return c.json({ success: false, error: e.message }, 500);
      }
   });

   app.route('/api', api);
}
