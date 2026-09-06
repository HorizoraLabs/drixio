import { select, input, confirm } from '@inquirer/prompts';
import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   truncateTable,
   generateAndInsertMockData,
} from '../../logic/index.js';

export async function runMockWizard(dbConfig: DBConfig) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.yellow(
            '\nNo database connection found. Please setup database first.',
         ),
      );
      return;
   }

   const adapter = createDBAdapter(dbConfig as any);

   try {
      const tables = await adapter.getTables();
      if (tables.length === 0) {
         console.log(
            pc.yellow('\nNo tables found. Please create a table first.'),
         );
         return;
      }

      console.log(pc.cyan('\n--- Mock Data Generation Wizard ---'));
      console.log(
         pc.dim(
            'Generate realistic names, emails, timestamps, and foreign key relations.\n',
         ),
      );

      const tableName = await select({
         message: 'Select table to generate mock data for:',
         choices: tables.map((t) => ({ name: t, value: t })),
      });

      const schema = await adapter.getSchema(tableName);
      console.log(
         pc.dim(
            `Table '${tableName}' has ${schema.length} columns (${schema
               .map((c) => c.name)
               .join(', ')})`,
         ),
      );

      const countStr = await input({
         message: 'How many mock records to generate?',
         default: '25',
      });

      const count = parseInt(countStr) || 25;
      if (count <= 0) {
         console.log(pc.yellow('Invalid count. Aborting mock generation.'));
         return;
      }

      const shouldTruncate = await confirm({
         message: `Empty table '${tableName}' before generating mock data?`,
         default: false,
      });

      if (shouldTruncate) {
         const truncRes = await truncateTable(adapter, tableName);
         if (truncRes.success) {
            console.log(pc.dim(`Cleared existing data from '${tableName}'.`));
         } else {
            console.log(
               pc.yellow(`Warning: Could not clear table: ${truncRes.error}`),
            );
         }
      }

      console.log(
         pc.cyan(
            `\nGenerating ${count} realistic records for '${tableName}'...`,
         ),
      );

      const res = await generateAndInsertMockData(
         adapter,
         tableName,
         count,
         (curr, total) => {
            process.stdout.write(`\r${pc.dim(`Progress: ${curr} / ${total}`)}`);
         },
      );

      if (!res.success) {
         console.log(pc.red(`\n\n✘ Mock data generation failed: ${res.error}`));
      } else {
         console.log(
            pc.green(
               `\n\n✔ Successfully generated and inserted ${res.data.insertedCount} mock records into '${tableName}'!`,
            ),
         );
      }
   } catch (e: any) {
      console.log(pc.red(`\n✘ Mock data generation failed: ${e.message}`));
   } finally {
      await adapter.close();
   }
}
