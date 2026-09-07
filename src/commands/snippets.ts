import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   loadSnippets,
   extractSnippetParams,
   substituteSnippetParams,
   QuerySnippet,
} from '../logic/index.js';
import { drawTable } from '../tui/ui/table.js';

export async function runSnippetsCommand(
   _args: string[],
   options: Record<string, any>,
) {
   const projectRoot = process.cwd();
   const snippets = await loadSnippets(projectRoot);

   if (options.json) {
      console.log(JSON.stringify(snippets, null, 2));
      process.exit(0);
   }

   console.log(
      pc.cyan(`\n  Saved Queries & Snippets (${snippets.length} total)\n`),
   );

   const rows = snippets.map((s) => {
      const params = extractSnippetParams(s.sql);
      return {
         ID: s.id,
         Title: s.title,
         Variables:
            params.length > 0
               ? params.map((p) => `:${p}`).join(', ')
               : pc.dim('none'),
         Tags: s.tags && s.tags.length > 0 ? s.tags.join(', ') : pc.dim('-'),
         Type: s.isBuiltin ? pc.yellow('builtin') : pc.green('user'),
      };
   });

   drawTable(['ID', 'Title', 'Variables', 'Tags', 'Type'], rows, {
      title: 'Drixio Snippet Library',
      maxColWidth: 40,
   });

   console.log(
      pc.dim(
         `\nTip: Run a snippet with: ${pc.cyan('npx drixio run <id|name> [param=value]')}\n`,
      ),
   );
   process.exit(0);
}

export async function runRunCommand(
   dbConfig: DBConfig,
   args: string[],
   _options: Record<string, any>,
) {
   const projectRoot = process.cwd();
   const snippets = await loadSnippets(projectRoot);

   if (snippets.length === 0) {
      console.log(pc.yellow('No saved snippets found in .drixio/snippets.json'));
      process.exit(0);
   }

   let targetSnippet: QuerySnippet | undefined;
   const targetIdent = args[0];
   const paramArgs = args.slice(1);

   if (!targetIdent) {
      const { select } = await import('@inquirer/prompts');
      const selectedId = await select({
         message: 'Select a saved query template to run:',
         choices: snippets.map((s) => ({
            name: `${s.title} ${pc.dim(`(${s.id})`)}`,
            value: s.id,
            description: s.description || s.sql.slice(0, 60),
         })),
      });
      targetSnippet = snippets.find((s) => s.id === selectedId);
   } else {
      targetSnippet = snippets.find(
         (s) =>
            s.id.toLowerCase() === targetIdent.toLowerCase() ||
            s.title.toLowerCase() === targetIdent.toLowerCase() ||
            s.title.toLowerCase().includes(targetIdent.toLowerCase()),
      );
   }

   if (!targetSnippet) {
      console.log(pc.red(`Error: Snippet "${targetIdent}" not found.`));
      console.log(
         pc.dim('Use `npx drixio snippets` to see all available queries.'),
      );
      process.exit(1);
   }

   console.log(pc.cyan(`\n  Executing Snippet: ${pc.bold(targetSnippet.title)}`));
   if (targetSnippet.description) {
      console.log(pc.dim(`  ${targetSnippet.description}`));
   }

   const requiredParams = extractSnippetParams(targetSnippet.sql);
   const providedParams: Record<string, string> = {};

   for (const arg of paramArgs) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx > 0) {
         const key = arg.slice(0, eqIdx).trim();
         const val = arg.slice(eqIdx + 1).trim();
         providedParams[key] = val;
      }
   }

   if (requiredParams.length > 0) {
      const { input } = await import('@inquirer/prompts');
      for (const param of requiredParams) {
         if (providedParams[param] === undefined) {
            const val = await input({
               message: `Enter value for :${param}:`,
               validate: (v) =>
                  v.trim() !== '' ? true : `:${param} cannot be empty`,
            });
            providedParams[param] = val;
         }
      }
   }

   const finalSql = substituteSnippetParams(targetSnippet.sql, providedParams);
   console.log(pc.dim(`\nSQL > ${finalSql.replace(/\n/g, ' ')}\n`));

   if (dbConfig.type === 'unknown' || (dbConfig.type as string) === 'none') {
      console.log(
         pc.red(
            'Error: No active database connection found. Cannot execute query.',
         ),
      );
      process.exit(1);
   }

   const adapter = createDBAdapter(dbConfig);
   try {
      const result = await adapter.query(finalSql);

      if (result.columns.length === 0) {
         console.log(pc.yellow('Query executed successfully. (No output)'));
         await adapter.close();
         process.exit(0);
      }

      drawTable(result.columns, result.rows, {
         title: targetSnippet.title,
         maxColWidth: 50,
      });
      console.log(pc.dim(`\n(${result.rows.length} rows)\n`));

      await adapter.close();
      process.exit(0);
   } catch (e: any) {
      console.log(pc.red(`\nQuery Execution Error: ${e.message}\n`));
      await adapter.close().catch(() => {});
      process.exit(1);
   }
}

