import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   importDataToTable,
} from '../logic/index.js';
import fs from 'fs/promises';
import path from 'path';

export async function runImportCommand(
   dbConfig: DBConfig,
   args: string[],
   options: Record<string, string | boolean>,
) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.red('Error: No database connection found. Cannot run import.'),
      );
      process.exit(1);
   }

   const adapter = createDBAdapter(dbConfig as any);
   let filePath = args[0];
   let tableName = options.table as string;

   const { input, select } = await import('@inquirer/prompts');

   if (!filePath) {
      filePath = await input({
         message: 'Enter the path to your CSV or JSON file:',
      });
   }

   const resolvedPath = path.resolve(process.cwd(), filePath);

   try {
      await fs.access(resolvedPath);
   } catch {
      console.log(pc.red(`Error: File not found at ${resolvedPath}`));
      process.exit(1);
   }

   if (!tableName) {
      const allTables = await adapter.getTables();
      if (allTables.length === 0) {
         console.log(
            pc.yellow('No tables found. Please create a table first.'),
         );
         process.exit(1);
      }
      tableName = await select({
         message: 'Which table do you want to import data into?',
         choices: allTables.map((t) => ({ name: t, value: t })),
      });
   }

   console.log(pc.cyan(`\nReading file...`));
   const fileContent = await fs.readFile(resolvedPath, 'utf-8');
   const isJson = filePath.toLowerCase().endsWith('.json');
   const isCsv = filePath.toLowerCase().endsWith('.csv');

   if (!isJson && !isCsv) {
      console.log(
         pc.red(
            'Error: Unsupported file extension. Please provide a .csv or .json file.',
         ),
      );
      process.exit(1);
   }

   const format = isJson ? 'json' : 'csv';
   console.log(pc.cyan(`Importing data into '${tableName}'...`));

   try {
      const res = await importDataToTable(
         adapter,
         tableName,
         format,
         fileContent,
      );
      if (!res.success) {
         console.log(pc.red(`\n✘ Import failed: ${res.error}`));
      } else {
         console.log(
            pc.green(
               `\n✔ Successfully imported ${res.data.count} rows into ${tableName}!`,
            ),
         );
      }
   } catch (e: any) {
      console.log(pc.red(`\n✘ Import failed: ${e.message}`));
   } finally {
      await adapter.close();
   }

   process.exit(0);
}
