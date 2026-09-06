import {
   DBAdapter,
   DBConfig,
   ColumnSchema,
   Result,
   ok,
   okVoid,
   err,
} from './types.js';
import { createTable } from './schema.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface ExportTableOptions {
   whereClause?: string;
   orderBy?: { col: string; asc: boolean };
   batchSize?: number;
}

export function formatCsvValue(val: any): string {
   if (val === null || val === undefined) return '';
   const str = String(val);
   if (
      str.includes(',') ||
      str.includes('"') ||
      str.includes('\n') ||
      str.includes('\r')
   ) {
      return `"${str.replace(/"/g, '""')}"`;
   }
   return str;
}

/**
 * Format in-memory query rows into a standardized CSV string.
 */
export function exportRowsToCsv(rows: Record<string, any>[]): string {
   if (!rows || rows.length === 0) return '';
   const headers = Object.keys(rows[0]);
   const headerStr = headers.map((h) => formatCsvValue(h)).join(',');
   const rowStrs = rows.map((r) =>
      headers.map((h) => formatCsvValue(r[h])).join(','),
   );
   return [headerStr, ...rowStrs].join('\n');
}

/**
 * Export in-memory rows to either CSV or JSON format.
 */
export function exportQueryResult(
   rows: Record<string, any>[],
   format: 'csv' | 'json' = 'csv',
): string {
   if (format === 'json') {
      return JSON.stringify(rows, null, 2);
   }
   return exportRowsToCsv(rows);
}

export async function exportTableToCsv(
   adapter: DBAdapter,
   tableName: string,
   options: ExportTableOptions = {},
): Promise<Result<string>> {
   try {
      const { whereClause = '', orderBy, batchSize = 1000 } = options;
      let offset = 0;
      let hasMore = true;
      let csvStr = '';
      let isFirst = true;

      while (hasMore) {
         const batch = await adapter.getData(
            tableName,
            batchSize,
            offset,
            whereClause,
            orderBy,
         );
         if (batch.rows.length === 0) break;

         const headers = batch.columns || Object.keys(batch.rows[0] || {});
         if (isFirst && headers.length > 0) {
            csvStr += headers.map((h) => formatCsvValue(h)).join(',') + '\n';
            isFirst = false;
         }

         for (const row of batch.rows) {
            const rowStr = headers.map((h) => formatCsvValue(row[h])).join(',');
            csvStr += rowStr + '\n';
         }

         offset += batchSize;
         if (batch.rows.length < batchSize) hasMore = false;
      }

      return ok(csvStr);
   } catch (e: any) {
      return err(e.message || 'Failed to export table to CSV', undefined, e);
   }
}

export async function exportTableToJson(
   adapter: DBAdapter,
   tableName: string,
   options: ExportTableOptions = {},
): Promise<Result<Record<string, any>[]>> {
   try {
      const { whereClause = '', orderBy, batchSize = 1000 } = options;
      let offset = 0;
      let hasMore = true;
      const allRows: Record<string, any>[] = [];

      while (hasMore) {
         const batch = await adapter.getData(
            tableName,
            batchSize,
            offset,
            whereClause,
            orderBy,
         );
         if (batch.rows.length === 0) break;
         allRows.push(...batch.rows);
         offset += batchSize;
         if (batch.rows.length < batchSize) hasMore = false;
      }

      return ok(allRows);
   } catch (e: any) {
      return err(e.message || 'Failed to export table to JSON', undefined, e);
   }
}

/**
 * Format table schema definition into standard CSV.
 */
export function exportSchemaToCsv(columns: ColumnSchema[]): string {
   const headers = 'Name,Type,IsPrimaryKey,Nullable,DefaultValue,Extra\n';
   const rows = columns
      .map((c) => {
         let extra = '-';
         if (c.fkTarget) {
            extra = `FK -> ${c.fkTarget.table}(${c.fkTarget.column})`;
         } else if (c.isUnique) {
            extra = 'UNIQUE';
         }
         return `"${c.name}","${c.type}","${c.isPk}","${c.nullable}","${c.defaultValue ?? ''}","${extra}"`;
      })
      .join('\n');
   return headers + rows;
}

export interface UnifiedExportOptions {
   format: 'csv' | 'json';
   schemaOnly?: boolean;
   whereClause?: string;
   orderBy?: { col: string; asc: boolean };
   batchSize?: number;
}

/**
 * Canonical table export function handling both data and schema-only across CSV/JSON.
 * Single source of truth for CLI and TUI.
 */
export async function exportTable(
   adapter: DBAdapter,
   tableName: string,
   options: UnifiedExportOptions,
): Promise<Result<string>> {
   try {
      const { format, schemaOnly, whereClause, orderBy, batchSize } = options;

      if (schemaOnly) {
         const schema = await adapter.getSchema(tableName);
         if (format === 'json') {
            return ok(JSON.stringify(schema, null, 2));
         }
         return ok(exportSchemaToCsv(schema));
      }

      if (format === 'json') {
         const rowsRes = await exportTableToJson(adapter, tableName, {
            whereClause,
            orderBy,
            batchSize,
         });
         if (!rowsRes.success) {
            return rowsRes;
         }
         return ok(JSON.stringify(rowsRes.data, null, 2));
      }

      return await exportTableToCsv(adapter, tableName, {
         whereClause,
         orderBy,
         batchSize,
      });
   } catch (e: any) {
      return err(e.message || 'Failed to export table', undefined, e);
   }
}

export async function importDataToTable(
   adapter: DBAdapter,
   tableName: string,
   format: 'csv' | 'json',
   content: string,
): Promise<Result<{ count: number }>> {
   try {
      let rows: Record<string, any>[] = [];

      if (format === 'json') {
         const parsed = JSON.parse(content);
         rows = Array.isArray(parsed) ? parsed : [parsed];
      } else {
         // Parse CSV
         const lines = content
            .split(/\r?\n/)
            .filter((l) => l.trim().length > 0);
         if (lines.length < 2) return ok({ count: 0 });

         // Simple CSV line parser handling quotes
         const parseCsvLine = (line: string): string[] => {
            const result: string[] = [];
            let cur = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
               const char = line[i];
               if (char === '"' && line[i + 1] === '"') {
                  cur += '"';
                  i++;
               } else if (char === '"') {
                  inQuotes = !inQuotes;
               } else if (char === ',' && !inQuotes) {
                  result.push(cur);
                  cur = '';
               } else {
                  cur += char;
               }
            }
            result.push(cur);
            return result;
         };

         const headers = parseCsvLine(lines[0]);
         for (let i = 1; i < lines.length; i++) {
            const vals = parseCsvLine(lines[i]);
            const row: Record<string, any> = {};
            headers.forEach((h, idx) => {
               row[h] = vals[idx] !== undefined ? vals[idx] : null;
            });
            rows.push(row);
         }
      }

      if (rows.length > 0) {
         const CHUNK_SIZE = 500;
         for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const chunk = rows.slice(i, i + CHUNK_SIZE);
            await adapter.insert(tableName, chunk);
         }
      }

      return ok({ count: rows.length });
   } catch (e: any) {
      return err(e.message || 'Failed to import data to table', undefined, e);
   }
}

export async function executeDatabaseScript(
   adapter: DBAdapter,
   sqlContent: string,
): Promise<Result<void>> {
   try {
      await adapter.executeSql(sqlContent);
      return okVoid();
   } catch (e: any) {
      return err(
         e.message || 'Failed to execute database script',
         undefined,
         e,
      );
   }
}

export interface RestoreResult {
   restoredTables: string[];
   totalRows: number;
   message?: string;
}

export async function restoreTableFromJsonContent(
   adapter: DBAdapter,
   dbType: string,
   content: string,
   defaultTableName?: string,
): Promise<Result<{ restoredTables: string[]; totalRows: number }>> {
   try {
      const parsed = JSON.parse(content);
      const tableName =
         parsed.table || defaultTableName || 'restored_table';
      const schema = parsed.schema || [];
      const rows = Array.isArray(parsed.data)
         ? parsed.data
         : Array.isArray(parsed)
           ? parsed
           : [];

      const existingTables = await adapter.getTables();
      if (!existingTables.includes(tableName)) {
         if (schema.length > 0) {
            const createRes = await createTable(
               adapter,
               dbType,
               tableName,
               schema,
            );
            if (!createRes.success) {
               return createRes;
            }
         }
      } else {
         try {
            await adapter.truncateTable(tableName);
         } catch {
            await adapter.executeSql(
               `DELETE FROM ${adapter.quoteIdentifier(tableName)};`,
            );
         }
      }

      if (rows.length > 0) {
         const CHUNK_SIZE = 500;
         for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const chunk = rows.slice(i, i + CHUNK_SIZE);
            await adapter.insert(tableName, chunk);
         }
      }

      return ok({ restoredTables: [tableName], totalRows: rows.length });
   } catch (e: any) {
      return err(e.message || 'Failed to restore table from JSON', undefined, e);
   }
}

export async function restoreDatabase(
   adapter: DBAdapter,
   dbType: string,
   sourcePath: string,
): Promise<Result<RestoreResult>> {
   try {
      const stat = await fs.stat(sourcePath);
      const restoredTables: string[] = [];
      let totalRows = 0;

      if (stat.isDirectory()) {
         const files = await fs.readdir(sourcePath);
         const jsonFiles = files.filter((f) =>
            f.toLowerCase().endsWith('.json'),
         );

         if (jsonFiles.length === 0) {
            const sqliteFile = files.find(
               (f) => f.endsWith('.sqlite') || f.endsWith('.db'),
            );
            if (sqliteFile && dbType === 'sqlite') {
               return err(
                  `Directory contains raw SQLite file (${sqliteFile}). Please use the file directly to connect.`,
               );
            }
            return err(
               `No JSON backup files found in directory: ${sourcePath}`,
            );
         }

         for (const jf of jsonFiles) {
            const fullFilePath = path.join(sourcePath, jf);
            const content = await fs.readFile(fullFilePath, 'utf-8');
            const res = await restoreTableFromJsonContent(
               adapter,
               dbType,
               content,
               path.basename(jf, '.json'),
            );
            if (!res.success) {
               return res;
            }
            restoredTables.push(...res.data.restoredTables);
            totalRows += res.data.totalRows;
         }

         return ok({ restoredTables, totalRows });
      } else {
         // Single file restore
         const lower = sourcePath.toLowerCase();
         if (lower.endsWith('.sql')) {
            const sqlContent = await fs.readFile(sourcePath, 'utf-8');
            const execRes = await executeDatabaseScript(adapter, sqlContent);
            if (!execRes.success) {
               return execRes;
            }
            return ok({
               restoredTables: ['* (SQL script execution)'],
               totalRows: 0,
               message: 'Executed SQL script successfully',
            });
         } else if (lower.endsWith('.json')) {
            const content = await fs.readFile(sourcePath, 'utf-8');
            return await restoreTableFromJsonContent(
               adapter,
               dbType,
               content,
               path.basename(sourcePath, '.json'),
            );
         } else {
            return err(
               `Unsupported backup file format: ${sourcePath}. Expected directory, .json, or .sql`,
            );
         }
      }
   } catch (e: any) {
      return err(e.message || 'Failed to restore database', undefined, e);
   }
}

export interface BackupOptions {
   customBackupDir?: string;
   onProgress?: (event: {
      type: 'sqlite_copy' | 'table_dump' | 'warn';
      table?: string;
      rows?: number;
      message?: string;
   }) => void;
}

export interface BackupResult {
   backupDir: string;
   tableCount: number;
   dumpedTables: { table: string; rows: number }[];
   sqliteCopied?: boolean;
}

/**
 * Backup entire database (schema + data) into timestamped directory.
 * SQLite raw files are copied, and all tables are serialized to per-table JSON dumps.
 */
export async function backupDatabase(
   adapter: DBAdapter,
   dbConfig: DBConfig,
   options: BackupOptions = {},
): Promise<Result<BackupResult>> {
   try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir =
         options.customBackupDir ||
         path.join(process.cwd(), `drixio_backup_${timestamp}`);

      await fs.mkdir(backupDir, { recursive: true });
      let sqliteCopied = false;

      // 1. For SQLite, copy the physical file
      if (dbConfig.type === 'sqlite') {
         try {
            const targetFileName =
               path.basename(dbConfig.targetUrl) || 'database.sqlite';
            const destFile = path.join(backupDir, targetFileName);
            await fs.copyFile(dbConfig.targetUrl, destFile);
            sqliteCopied = true;
            options.onProgress?.({
               type: 'sqlite_copy',
               message: `Copied raw SQLite file to ${destFile}`,
            });
         } catch (e: any) {
            options.onProgress?.({
               type: 'warn',
               message: `Failed to copy SQLite file: ${e.message}`,
            });
         }
      }

      // 2. Dump schema and data to JSON per table
      const tables = await adapter.getTables();
      const dumpedTables: { table: string; rows: number }[] = [];

      if (tables.length === 0) {
         options.onProgress?.({
            type: 'warn',
            message: 'No tables found to backup.',
         });
      }

      for (const table of tables) {
         try {
            const schema = await adapter.getSchema(table);
            const batchSize = 1000;
            let batchOffset = 0;
            const allRows: Record<string, any>[] = [];
            let lastBatch;

            do {
               lastBatch = await adapter.getData(table, batchSize, batchOffset);
               allRows.push(...lastBatch.rows);
               batchOffset += batchSize;
            } while (lastBatch.rows.length === batchSize);

            const dumpObj = {
               table,
               schema,
               totalRows: allRows.length,
               data: allRows,
            };

            const fp = path.join(backupDir, `${table}.json`);
            await fs.writeFile(fp, JSON.stringify(dumpObj, null, 2), 'utf-8');
            dumpedTables.push({ table, rows: allRows.length });

            options.onProgress?.({
               type: 'table_dump',
               table,
               rows: allRows.length,
            });
         } catch (e: any) {
            options.onProgress?.({
               type: 'warn',
               message: `Failed to dump table ${table}: ${e.message}`,
            });
         }
      }

      return ok({
         backupDir,
         tableCount: tables.length,
         dumpedTables,
         sqliteCopied,
      });
   } catch (e: any) {
      return err(e.message || 'Failed to backup database', undefined, e);
   }
}

/**
 * Extract SQL query blocks from a Markdown string (```sql ... ```).
 */
export function extractSqlFromMarkdown(content: string): string {
   const matches = [...content.matchAll(/```(?:sql)?\n([\s\S]*?)```/gi)];
   if (matches.length > 0) {
      return matches.map((m) => m[1].trim()).join('\n\n');
   }
   return content;
}

/**
 * Generate a streaming SQL backup dump (DDL + batch INSERTs) for SQLite or MySQL.
 */
export function generateDatabaseSqlDumpStream(
   adapter: DBAdapter,
   dbType: string,
): ReadableStream {
   return new ReadableStream({
      async start(controller) {
         const encoder = new TextEncoder();
         try {
            if (dbType === 'sqlite') {
               controller.enqueue(
                  encoder.encode('-- Drixio SQLite Backup Dump\n\n'),
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
                     if (batch.rows.length === 0) break;

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
                     if (batch.rows.length < batchSize) hasMore = false;
                  }
                  controller.enqueue(encoder.encode('\n'));
               }
            } else if (dbType === 'mysql') {
               controller.enqueue(
                  encoder.encode('-- Drixio MySQL Backup Dump\n\n'),
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
                        const createSql =
                           row['Create Table'] ||
                           row['Create View'] ||
                           Object.values(row)[1];
                        if (createSql) {
                           controller.enqueue(
                              encoder.encode(`${createSql};\n\n`),
                           );
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
                        if (batch.rows.length === 0) break;

                        let insertStrs = '';
                        for (const d of batch.rows) {
                           const keys = Object.keys(d)
                              .map((k) => adapter.quoteIdentifier(k))
                              .join(', ');
                           const vals = Object.values(d)
                              .map((v) => {
                                 if (v === null) return 'NULL';
                                 if (typeof v === 'number') return v;
                                 return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
                              })
                              .join(', ');
                           insertStrs += `INSERT INTO ${adapter.quoteIdentifier(table)} (${keys}) VALUES (${vals});\n`;
                        }
                        controller.enqueue(encoder.encode(insertStrs));

                        offset += batchSize;
                        if (batch.rows.length < batchSize) hasMore = false;
                     }
                     controller.enqueue(encoder.encode('\n'));
                  } catch (err) {
                     controller.enqueue(
                        encoder.encode(
                           `-- Error dumping table ${table}: ${err}\n`,
                        ),
                     );
                  }
               }
            } else {
               controller.enqueue(
                  encoder.encode(
                     `-- Fallback SQL dump stream not supported for ${dbType}\n`,
                  ),
               );
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
