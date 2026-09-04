import { DBAdapter, DBConfig } from './types.js';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

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

export async function exportTableToCsv(
   adapter: DBAdapter,
   tableName: string,
   options: ExportTableOptions = {},
): Promise<string> {
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
         csvStr += headers.join(',') + '\n';
         isFirst = false;
      }

      for (const row of batch.rows) {
         const rowStr = headers.map((h) => formatCsvValue(row[h])).join(',');
         csvStr += rowStr + '\n';
      }

      offset += batchSize;
      if (batch.rows.length < batchSize) hasMore = false;
   }

   return csvStr;
}

export async function exportTableToJson(
   adapter: DBAdapter,
   tableName: string,
   options: ExportTableOptions = {},
): Promise<Record<string, any>[]> {
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

   return allRows;
}

export async function importDataToTable(
   adapter: DBAdapter,
   tableName: string,
   format: 'csv' | 'json',
   content: string,
): Promise<{ count: number }> {
   let rows: Record<string, any>[] = [];

   if (format === 'json') {
      const parsed = JSON.parse(content);
      rows = Array.isArray(parsed) ? parsed : [parsed];
   } else {
      // Parse CSV
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) return { count: 0 };

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

   return { count: rows.length };
}

export async function executeDatabaseScript(
   adapter: DBAdapter,
   sqlContent: string,
): Promise<void> {
   await adapter.executeSql(sqlContent);
}
