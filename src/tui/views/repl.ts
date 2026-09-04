import pc from 'picocolors';
import { DBConfig, createDBAdapter } from '../../logic/index.js';
import { drawTable } from '../ui/table.js';

export async function runRepl(dbConfig: DBConfig) {
   if (dbConfig.type === 'unknown') return;

   const dbAdapter = createDBAdapter(dbConfig);
   let running = true;
   const { input } = await import('@inquirer/prompts');

   console.clear();
   console.log(
      pc.cyan(
         `\n╔════════════════════════════════════════════════════════════════════════╗`,
      ),
   );
   console.log(
      pc.cyan(
         `║                   Interactive SQL REPL                                 ║`,
      ),
   );
   console.log(
      pc.cyan(
         `╠════════════════════════════════════════════════════════════════════════╣`,
      ),
   );
   console.log(
      pc.cyan(`║ `) +
         pc.dim(
            `Type your SQL queries directly. Type 'exit' or 'quit' to  Back.`,
         ) +
         `      ` +
         pc.cyan(`║`),
   );
   console.log(
      pc.cyan(
         `╚════════════════════════════════════════════════════════════════════════╝\n`,
      ),
   );

   while (running) {
      try {
         const queryStr = await input({
            message: pc.green(`${dbConfig.type}>`),
         });

         const sql = queryStr.trim();
         if (sql.toLowerCase() === 'exit' || sql.toLowerCase() === 'quit') {
            running = false;
            continue;
         }
         if (sql === '') continue;

         const result = await dbAdapter.query(sql);

         if (result.columns.length === 0) {
            console.log(pc.yellow('Query executed successfully. (No output)'));
            continue;
         }

         // Format output nicely as a table
         drawTable(result.columns, result.rows, {
            title: 'Query Result',
            maxColWidth: 50,
         });
         console.log(pc.dim(`\n(${result.rows.length} rows)`));
         console.log(); // Spacing
      } catch (e: any) {
         if (e.name === 'ExitPromptError') {
            running = false;
         } else {
            console.log(pc.red(`\nError: ${e.message}\n`));
         }
      }
   }
}
