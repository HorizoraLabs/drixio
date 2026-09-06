import {
   DBAdapter,
   ColumnSchema,
   TableMutationOptions,
   Result,
   ok,
   err,
} from './types.js';
import { getDialect } from './dialect.js';

export interface BatchMutateData {
   modifiedCount: number;
   executedCount: number;
   error?: string;
}

export type BatchMutateResult = Result<BatchMutateData>;
export type MutationResult = BatchMutateResult;

export async function batchMutateTableData(
   adapter: DBAdapter,
   dbType: string,
   options: TableMutationOptions,
): Promise<BatchMutateResult> {
   const {
      tableName,
      pkColumn,
      edits = {},
      inserts = [],
      deletes = [],
      schema = [],
   } = options;

   if (!tableName) {
      return err('Missing tableName.');
   }

   const hasEditsOrDeletes =
      Object.keys(edits).length > 0 || deletes.length > 0;
   if (hasEditsOrDeletes && !pkColumn) {
      return err('Primary key (pkColumn) is required for updates and deletes.');
   }

   const dialect = getDialect(dbType as any);
   const quotedTable = dialect.quoteIdentifier(tableName);
   const quotedPk = pkColumn ? dialect.quoteIdentifier(pkColumn) : '';

   const sqls: string[] = [];

   // 1. Process Updates
   for (const [pkVal, colEdits] of Object.entries(edits)) {
      if (!colEdits || Object.keys(colEdits).length === 0) continue;

      const setClauses: string[] = [];
      for (const [col, rawVal] of Object.entries(colEdits)) {
         const colSchema = schema.find((c) => c.name === col);
         const typeUpper = (colSchema?.type || '').toUpperCase();
         const isBool =
            typeUpper.includes('BOOL') || typeUpper === 'TINYINT(1)';
         const isText =
            typeUpper.includes('CHAR') ||
            typeUpper.includes('TEXT') ||
            typeUpper.includes('STRING');
         const quotedCol = dialect.quoteIdentifier(col);

         if (rawVal === '' || rawVal === null || rawVal === undefined) {
            if (colSchema && colSchema.nullable === false && isText) {
               setClauses.push(`${quotedCol} = ''`);
            } else {
               setClauses.push(`${quotedCol} = NULL`);
            }
         } else if (isBool) {
            const str = String(rawVal).toLowerCase();
            if (rawVal === '1' || rawVal === 1 || str === 'true') {
               setClauses.push(`${quotedCol} = TRUE`);
            } else {
               setClauses.push(`${quotedCol} = FALSE`);
            }
         } else {
            const escaped = dialect.escapeString(String(rawVal));
            setClauses.push(`${quotedCol} = '${escaped}'`);
         }
      }

      if (setClauses.length > 0) {
         const escapedPk = dialect.escapeString(String(pkVal));
         sqls.push(
            `UPDATE ${quotedTable} SET ${setClauses.join(', ')} WHERE ${quotedPk} = '${escapedPk}';`,
         );
      }
   }

   // 2. Process Inserts
   for (const row of inserts) {
      if (!row || Object.keys(row).length === 0) continue;
      const hasAnyVal = Object.values(row).some(
         (v) => v !== '' && v !== null && v !== undefined,
      );
      if (!hasAnyVal) continue;

      const cols: string[] = [];
      const vals: string[] = [];

      for (const [col, rawVal] of Object.entries(row)) {
         const colSchema = schema.find((c) => c.name === col);
         const typeUpper = (colSchema?.type || '').toUpperCase();
         const isBool =
            typeUpper.includes('BOOL') || typeUpper === 'TINYINT(1)';
         const isText =
            typeUpper.includes('CHAR') ||
            typeUpper.includes('TEXT') ||
            typeUpper.includes('STRING');

         cols.push(dialect.quoteIdentifier(col));

         if (rawVal === '' || rawVal === null || rawVal === undefined) {
            if (colSchema && colSchema.nullable === false && isText) {
               vals.push("''");
            } else {
               vals.push('NULL');
            }
         } else if (isBool) {
            const str = String(rawVal).toLowerCase();
            if (rawVal === '1' || rawVal === 1 || str === 'true') {
               vals.push('TRUE');
            } else {
               vals.push('FALSE');
            }
         } else {
            vals.push(`'${dialect.escapeString(String(rawVal))}'`);
         }
      }

      if (cols.length > 0) {
         sqls.push(
            `INSERT INTO ${quotedTable} (${cols.join(', ')}) VALUES (${vals.join(', ')});`,
         );
      }
   }

   // 3. Process Deletes
   for (const pk of deletes) {
      if (pk === undefined || pk === null) continue;
      const escapedPk = dialect.escapeString(String(pk));
      sqls.push(
         `DELETE FROM ${quotedTable} WHERE ${quotedPk} = '${escapedPk}';`,
      );
   }

   if (sqls.length === 0) {
      return ok({ modifiedCount: 0, executedCount: 0 });
   }

   // 4. Execute queries sequentially
   let executedCount = 0;
   try {
      for (const sql of sqls) {
         await adapter.executeSql(sql);
         executedCount++;
      }
      return ok({ modifiedCount: executedCount, executedCount });
   } catch (e: any) {
      return err(
         e.message || 'Failed to execute database mutations',
         undefined,
         e,
      );
   }
}
