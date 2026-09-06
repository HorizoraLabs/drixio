import { input, select } from '@inquirer/prompts';
import pc from 'picocolors';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
   DBAdapter,
   ColumnSchema,
   batchMutateTableData,
   executeDatabaseScript,
   extractSqlFromMarkdown,
} from '../../logic/index.js';

export async function runBeginnerAdd(
   adapter: DBAdapter,
   dbType: string,
   tableName: string,
   columns: ColumnSchema[],
) {
   console.log(pc.cyan(`\n--- Add Data to [${tableName}] ---`));
   console.log(
      pc.dim(
         'Leave a field completely empty (press Enter) to skip it (e.g. for AutoInc or NULL)',
      ),
   );

   const rowData: Record<string, any> = {};

   for (const col of columns) {
      if (
         col.isPk &&
         (col.type.toLowerCase().includes('int') ||
            col.type.toLowerCase() === 'integer')
      ) {
         console.log(
            pc.dim(`Skipping '${col.name}' (Auto Increment Primary Key)`),
         );
         continue;
      }

      const val = await input({
         message: `Value for '${col.name}' (${col.type}):`,
      });
      if (val.trim() !== '') {
         rowData[col.name] = val.trim();
      }
   }

   if (Object.keys(rowData).length === 0) {
      console.log(pc.yellow('No data entered. Aborted.'));
      return;
   }

   try {
      const res = await batchMutateTableData(adapter, dbType, {
         tableName,
         inserts: [rowData],
         schema: columns,
      });
      if (res.success) {
         console.log(pc.green('✓ Data added successfully!'));
      } else {
         console.log(pc.red(`x Failed to add data: ${res.error}`));
      }
   } catch (e: any) {
      console.log(pc.red(`x Failed to add data: ${e.message}`));
   }
}

export async function runBeginnerEdit(
   adapter: DBAdapter,
   dbType: string,
   tableName: string,
   columns: ColumnSchema[],
) {
   console.log(pc.cyan(`\n--- Edit Data in [${tableName}] ---`));
   if (columns.length === 0) return;

   const pkColSchema = columns.find((c) => c.isPk) || columns[0];
   const pkCol = pkColSchema.name;

   const pkVal = await input({
      message: `Enter the '${pkCol}' of the record you want to edit:`,
   });

   if (!pkVal.trim()) {
      console.log(pc.yellow('Aborted.'));
      return;
   }

   const targetCol = await select({
      message: 'Which column do you want to update?',
      choices: columns.map((c) => ({ name: c.name, value: c.name })),
   });

   const newVal = await input({
      message: `New value for '${targetCol}' (leave empty for NULL):`,
   });

   try {
      const res = await batchMutateTableData(adapter, dbType, {
         tableName,
         pkColumn: pkCol,
         edits: {
            [pkVal.trim()]: {
               [targetCol]: newVal.trim() === '' ? null : newVal,
            },
         },
         schema: columns,
      });
      if (res.success) {
         console.log(pc.green('✓ Data updated successfully!'));
      } else {
         console.log(pc.red(`x Failed to update data: ${res.error}`));
      }
   } catch (e: any) {
      console.log(pc.red(`x Failed to update data: ${e.message}`));
   }
}

export async function runBeginnerDelete(
   adapter: DBAdapter,
   dbType: string,
   tableName: string,
   columns: ColumnSchema[],
) {
   console.log(pc.cyan(`\n--- Delete Data from [${tableName}] ---`));
   if (columns.length === 0) return;

   const pkColSchema = columns.find((c) => c.isPk) || columns[0];
   const pkCol = pkColSchema.name;

   const pkVal = await input({
      message: `Enter the '${pkCol}' of the record you want to delete:`,
   });

   if (!pkVal.trim()) {
      console.log(pc.yellow('Aborted.'));
      return;
   }

   try {
      const res = await batchMutateTableData(adapter, dbType, {
         tableName,
         pkColumn: pkCol,
         deletes: [pkVal.trim()],
         schema: columns,
      });
      if (res.success) {
         console.log(pc.green('✓ Data deleted successfully!'));
      } else {
         console.log(pc.red(`x Failed to delete data: ${res.error}`));
      }
   } catch (e: any) {
      console.log(pc.red(`x Failed to delete data: ${e.message}`));
   }
}

export async function runExpertMode(adapter: DBAdapter) {
   console.log(pc.cyan(`\n--- Expert Mode: Execute Raw SQL ---`));

   try {
      const filePath = await input({
         message: 'Enter the path to your .md or .sql file:',
      });

      if (filePath && filePath.trim()) {
         const absolutePath = path.resolve(process.cwd(), filePath.trim());
         let fileContent = '';
         try {
            fileContent = await fs.readFile(absolutePath, 'utf-8');
         } catch (err: any) {
            console.log(pc.red(`\nx Failed to read file: ${err.message}`));
            return;
         }

         let sqlToExecute = fileContent;
         if (absolutePath.toLowerCase().endsWith('.md')) {
            sqlToExecute = extractSqlFromMarkdown(fileContent);
         }

         if (sqlToExecute.trim()) {
            console.log(pc.dim('\nExecuting SQL...'));
            console.log(pc.yellow(sqlToExecute));
            const execRes = await executeDatabaseScript(adapter, sqlToExecute);
            if (execRes.success) {
               console.log(pc.green('\n✓ SQL executed successfully!'));
            } else {
               console.log(pc.red(`\nx Error executing SQL: ${execRes.error}`));
            }
         } else {
            console.log(pc.yellow('\n⚠️  No SQL found in the file. Aborted.'));
         }
      } else {
         console.log(pc.yellow('\nNo file path entered. Aborted.'));
      }
   } catch (e: any) {
      console.log(pc.red(`\nError: ${e.message}`));
   }
}
