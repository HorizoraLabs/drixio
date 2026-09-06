import pc from 'picocolors';
import { DBConfig, createDBAdapter, exportTable } from '../logic/index.js';
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
   let format = (options.format as string)?.toLowerCase();
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

   if (!format || !['csv', 'json'].includes(format)) {
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
         const exportRes = await exportTable(adapter, table, {
            format: format as 'csv' | 'json',
            schemaOnly,
         });

         if (!exportRes.success) {
            console.log(
               pc.red(`✘ Failed to export table ${table}: ${exportRes.error}`),
            );
            continue;
         }

         const content = exportRes.data;
         const suffix = schemaOnly ? '_schema' : '_data';
         const ext = format === 'json' ? '.json' : '.csv';
         const fp = path.join(exportDir, `${table}${suffix}${ext}`);

         await fs.writeFile(fp, content, 'utf-8');
         const typeLabel = schemaOnly ? 'Schema' : 'Data';
         console.log(
            pc.green(
               `✔ Exported ${typeLabel} (${format.toUpperCase()}): ${table}`,
            ),
         );
      } catch (e: any) {
         console.log(pc.red(`✘ Failed to export table ${table}: ${e.message}`));
      }
   }

   await adapter.close();
   console.log(pc.cyan('\nExport complete.\n'));
   process.exit(0);
}
