import pc from 'picocolors';
import { DBConfig, createDBAdapter, truncateTable } from '../logic/index.js';

export async function runTruncateCommand(dbConfig: DBConfig, args: string[]) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.red('Error: No database connection found. Cannot truncate table.'),
      );
      process.exit(1);
   }

   const adapter = createDBAdapter(dbConfig as any);
   let tableName = args[0];

   const { select, confirm } = await import('@inquirer/prompts');

   if (!tableName) {
      const allTables = await adapter.getTables();
      if (allTables.length === 0) {
         console.log(pc.yellow('No tables found in the database.'));
         process.exit(0);
      }

      tableName = await select({
         message: 'Which table do you want to truncate (empty all data)?',
         choices: allTables.map((t) => ({ name: t, value: t })),
      });
   }

   const sure = await confirm({
      message: `Are you sure you want to TRUNCATE '${tableName}'? This will delete all rows and cannot be undone!`,
      default: false,
   });

   if (!sure) {
      console.log(pc.yellow('Aborted.'));
      await adapter.close();
      process.exit(0);
   }

   try {
      const res = await truncateTable(adapter, tableName);
      if (!res.success) {
         throw new Error(res.error || 'Failed to truncate table');
      }
      console.log(pc.green(`✔ Table '${tableName}' successfully truncated.`));
   } catch (e: any) {
      console.log(pc.red(`✘ Failed to truncate table: ${e.message}`));
   } finally {
      await adapter.close();
   }

   process.exit(0);
}
