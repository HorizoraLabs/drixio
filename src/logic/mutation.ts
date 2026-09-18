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

function buildPkWhereClause(
   dialect: any,
   pkCols: string[],
   pkVal: string,
): string {
   if (pkCols.length > 1) {
      try {
         const parsed = JSON.parse(pkVal);
         if (parsed && typeof parsed === 'object') {
            const conditions: string[] = [];
            for (const col of pkCols) {
               const val = parsed[col] !== undefined ? parsed[col] : '';
               const quotedCol = dialect.quoteIdentifier(col);
               if (val === null || val === undefined) {
                  conditions.push(`${quotedCol} IS NULL`);
               } else {
                  conditions.push(
                     `${quotedCol} = '${dialect.escapeString(String(val))}'`,
                  );
               }
            }
            if (conditions.length > 0) {
               return conditions.join(' AND ');
            }
         }
      } catch {
         // Fallback to single column if not JSON
      }
   }
   const quotedPk = dialect.quoteIdentifier(pkCols[0] || 'id');
   const escapedPk = dialect.escapeString(String(pkVal));
   return `${quotedPk} = '${escapedPk}'`;
}

export async function batchMutateTableData(
   adapter: DBAdapter,
   dbType: string,
   options: TableMutationOptions,
): Promise<BatchMutateResult> {
   const {
      tableName,
      pkColumn,
      pkColumns,
      edits = {},
      inserts = [],
      deletes = [],
      schema = [],
   } = options;

   if (!tableName) {
      return err('Missing tableName.');
   }

   const effectivePkCols =
      pkColumns && pkColumns.length > 0
         ? pkColumns
         : pkColumn
           ? [pkColumn]
           : [];

   const hasEditsOrDeletes =
      Object.keys(edits).length > 0 || deletes.length > 0;
   if (hasEditsOrDeletes && effectivePkCols.length === 0) {
      return err(
         'Primary key (pkColumn or pkColumns) is required for updates and deletes.',
      );
   }

   const dialect = getDialect(dbType as any);
   const quotedTable = dialect.quoteIdentifier(tableName);

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
         const whereClause = buildPkWhereClause(
            dialect,
            effectivePkCols,
            String(pkVal),
         );
         sqls.push(
            `UPDATE ${quotedTable} SET ${setClauses.join(', ')} WHERE ${whereClause};`,
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
      const whereClause = buildPkWhereClause(
         dialect,
         effectivePkCols,
         String(pk),
      );
      sqls.push(
         `DELETE FROM ${quotedTable} WHERE ${whereClause};`,
      );
   }

   if (sqls.length === 0) {
      return ok({ modifiedCount: 0, executedCount: 0 });
   }

   // 4. Execute queries sequentially
   // 4. Execute queries within a transaction for atomicity
   let executedCount = 0;
   try {
      await adapter.executeSql('BEGIN;');
      for (const sql of sqls) {
         await adapter.executeSql(sql);
         executedCount++;
      }
      await adapter.executeSql('COMMIT;');
      return ok({ modifiedCount: executedCount, executedCount });
   } catch (e: any) {
      try {
         await adapter.executeSql('ROLLBACK;');
      } catch {
         // Ignore rollback error if connection is already broken
      }
      return err(
         e.message || 'Failed to execute database mutations',
         undefined,
         e,
      );
   }
}
