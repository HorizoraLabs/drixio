import pc from 'picocolors';
import { DBConfig, createDBAdapter } from '../logic/index.js';
import { drawTable } from '../tui/ui/table.js';

export async function runQueryCommand(dbConfig: DBConfig, args: string[]) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.red('Error: No database connection found. Cannot run query.'),
      );
      process.exit(1);
   }

   const adapter = createDBAdapter(dbConfig);
   let sql = args[0];

   if (!sql) {
      const { input } = await import('@inquirer/prompts');
      sql = await input({
         message: 'Enter your SQL query:',
      });
   }

   if (!sql || sql.trim() === '') {
      console.log(pc.yellow('No query provided. Exiting.'));
      process.exit(0);
   }

   try {
      const result = await adapter.query(sql);

      if (result.columns.length === 0) {
         console.log(pc.yellow('Query executed successfully. (No output)'));
         process.exit(0);
      }

      // Format output nicely as a table
      drawTable(result.columns, result.rows, {
         title: 'Query Result',
         maxColWidth: 50,
      });
      console.log(pc.dim(`\n(${result.rows.length} rows)`));

      await adapter.close();
      process.exit(0);
   } catch (e: any) {
      console.log(pc.red(`\nQuery Error: ${e.message}\n`));
      process.exit(1);
   }
}
