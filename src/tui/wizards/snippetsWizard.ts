import { select, input } from '@inquirer/prompts';
import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   loadSnippets,
   extractSnippetParams,
   substituteSnippetParams,
} from '../../logic/index.js';

export async function runSnippetsWizard(dbConfig: DBConfig) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.yellow(
            '\nNo database connection found. Please setup database first.',
         ),
      );
      return;
   }

   const snippets = await loadSnippets();
   if (snippets.length === 0) {
      console.log(pc.yellow('\nNo SQL snippets found in workspace.'));
      return;
   }

   console.log(pc.cyan('\n--- SQL Snippets & Operational Templates ---'));
   console.log(
      pc.dim(
         'Run parameterized diagnostic queries and high-frequency templates.\n',
      ),
   );

   const snippetChoices = snippets.map((s) => ({
      name: `${s.title} ${pc.dim(`(${s.tags?.join(', ') || 'general'})`)}`,
      value: s.id,
      description: s.description || s.sql,
   }));

   const chosenId = await select({
      message: 'Select a snippet to execute:',
      choices: snippetChoices,
   });

   const snippet = snippets.find((s) => s.id === chosenId);
   if (!snippet) return;

   console.log(pc.bold(pc.cyan(`\nTemplate SQL:`)));
   console.log(pc.dim(snippet.sql));

   const params = extractSnippetParams(snippet.sql);
   const paramValues: Record<string, any> = {};

   if (params.length > 0) {
      console.log(pc.yellow(`\nThis query requires ${params.length} parameter(s):`));
      for (const param of params) {
         let defaultVal = '';
         if (param === 'limit') defaultVal = '20';
         if (param === 'table') defaultVal = 'users';

         const val = await input({
            message: `Enter value for :${pc.bold(param)}:`,
            default: defaultVal,
         });
         paramValues[param] = val;
      }
   }

   const finalSql = substituteSnippetParams(
      snippet.sql,
      paramValues,
      dbConfig.type,
   );

   console.log(pc.bold(pc.cyan(`\nExecuting Query:`)));
   console.log(pc.white(finalSql));

   const adapter = createDBAdapter(dbConfig as any);
   try {
      const startTime = performance.now();
      const result = await adapter.query(finalSql);
      const elapsed = Math.round(performance.now() - startTime);

      console.log(
         pc.green(
            `\n✔ Query executed successfully in ${elapsed}ms (${result.rows.length} row(s) returned):\n`,
         ),
      );

      if (result.rows.length > 0) {
         console.table(result.rows.slice(0, 50));
         if (result.rows.length > 50) {
            console.log(
               pc.dim(`... and ${result.rows.length - 50} more row(s) hidden.`),
            );
         }
      } else {
         console.log(pc.dim('(No rows returned)'));
      }
   } catch (e: any) {
      console.log(pc.red(`\n✘ Query execution failed: ${e.message}`));
   } finally {
      await adapter.close();
   }
}
