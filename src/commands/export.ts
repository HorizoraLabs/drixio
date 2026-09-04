import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   exportTableToCsv,
   exportTableToJson,
} from '../logic/index.js';
import fs from 'fs/promises';
import path from 'path';

export async function runExportCommand(
   dbConfig: DBConfig,
   args: string[],
   options: Record<string, boolean | string>,
) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.red('Error: No database connection found. Cannot run export.'),
      );
      process.exit(1);
   }

   const adapter = createDBAdapter(dbConfig as any);
   let tableName = args[0];
   let format = options.format as string;
   const schemaOnly = options['schema-only'] as boolean;

   const { select } = await import('@inquirer/prompts');

   if (!tableName) {
      const allTables = await adapter.getTables();
      if (allTables.length === 0) {
         console.log(pc.yellow('No tables found in the database.'));
         process.exit(0);
      }

      const tableChoices = [
         { name: 'All Tables (*)', value: '*' },
         ...allTables.map((t) => ({ name: t, value: t })),
      ];

      tableName = await select({
         message: 'Which table do you want to export?',
         choices: tableChoices,
      });
   }

   if (!format) {
      format = await select({
         message: 'Which format do you want to export?',
         choices: [
            { name: 'CSV', value: 'csv' },
            { name: 'JSON', value: 'json' },
         ],
      });
   }

   const exportDir = path.join(process.cwd(), 'drixio_exports');
   await fs.mkdir(exportDir, { recursive: true });

   const tablesToExport =
      tableName === '*' ? await adapter.getTables() : [tableName];

   console.log(pc.cyan(`\nStarting export to ${exportDir}...`));

   for (const table of tablesToExport) {
      try {
         if (schemaOnly) {
            const schema = await adapter.getSchema(table);
            if (format === 'json') {
               const fp = path.join(exportDir, `${table}_schema.json`);
               await fs.writeFile(fp, JSON.stringify(schema, null, 2), 'utf-8');
               console.log(pc.green(`✔ Exported Schema (JSON): ${table}`));
            } else {
               const fp = path.join(exportDir, `${table}_schema.csv`);
               const headers = 'Name,Type,IsPrimaryKey,Nullable\n';
               const rows = schema
                  .map(
                     (c) =>
                        `"${c.name}","${c.type}","${c.isPk}","${c.nullable}"`,
                  )
                  .join('\n');
               await fs.writeFile(fp, headers + rows, 'utf-8');
               console.log(pc.green(`✔ Exported Schema (CSV): ${table}`));
            }
         } else {
            if (format === 'json') {
               const jsonRows = await exportTableToJson(adapter, table);
               const fp = path.join(exportDir, `${table}_data.json`);
               await fs.writeFile(
                  fp,
                  JSON.stringify(jsonRows, null, 2),
                  'utf-8',
               );
               console.log(pc.green(`✔ Exported Data (JSON): ${table}`));
            } else {
               const csvStr = await exportTableToCsv(adapter, table);
               const fp = path.join(exportDir, `${table}_data.csv`);
               await fs.writeFile(fp, csvStr, 'utf-8');
               console.log(pc.green(`✔ Exported Data (CSV): ${table}`));
            }
         }
      } catch (e: any) {
         console.log(pc.red(`✘ Failed to export table ${table}: ${e.message}`));
      }
   }

   await adapter.close();
   console.log(pc.cyan('Export complete.'));
   process.exit(0);
}
