import { select, confirm } from '@inquirer/prompts';
import pc from 'picocolors';
import { DBConfig, createDBAdapter, truncateTable } from '../../logic/index.js';

export async function runTruncateWizard(dbConfig: DBConfig) {
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
         console.log(pc.yellow('\nNo tables found in the database.'));
         return;
      }

      console.log(pc.cyan('\n--- Truncate Table Wizard ---'));
      console.log(
         pc.dim(
            'Empty all rows in a table and reset the auto-increment counter.\n',
         ),
      );

      const tableName = await select({
         message: 'Select a table to truncate:',
         choices: tables.map((t) => ({ name: t, value: t })),
      });

      const sure = await confirm({
         message: `Are you sure you want to TRUNCATE '${tableName}'? All records will be wiped out!`,
         default: false,
      });

      if (!sure) {
         console.log(pc.yellow('Operation cancelled.'));
         return;
      }

      console.log(pc.cyan(`\nTruncating '${tableName}'...`));
      const res = await truncateTable(adapter, tableName);
      if (res.success) {
         console.log(
            pc.green(`✔ Table '${tableName}' has been successfully emptied!`),
         );
      } else {
         console.log(pc.red(`✘ Failed to truncate table: ${res.error}`));
      }
   } catch (e: any) {
      console.log(pc.red(`\n✘ Error: ${e.message}`));
   } finally {
      await adapter.close();
   }
}
