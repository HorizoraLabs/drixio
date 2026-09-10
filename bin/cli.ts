#!/usr/bin/env node
import pc from 'picocolors';
import { parseArgs } from 'node:util';
import { detectDatabase, getDrixioVersion } from '../src/logic/index.js';
import { runQuickCommand } from '../src/commands/index.js';
import { runTui } from '../src/tui/index.js';

async function main() {
   const args = process.argv.slice(2);
   let customUrl: string | undefined;

   // Handle URL shortcut if the first argument looks like a database connection string
   if (
      args.length > 0 &&
      (args[0].startsWith('postgres://') ||
         args[0].startsWith('postgresql://') ||
         args[0].startsWith('mysql://') ||
         args[0].startsWith('file:'))
   ) {
      customUrl = args[0];
   }

   const { positionals, values } = parseArgs({
      args,
      options: {
         version: { type: 'boolean', short: 'v' },
         json: { type: 'boolean' },
         format: { type: 'string' },
         'schema-only': { type: 'boolean' },
         table: { type: 'string' },
         out: { type: 'string' },
         print: { type: 'boolean' },
         force: { type: 'boolean' },
         y: { type: 'boolean' },
         snapshot: { type: 'boolean' },
         apply: { type: 'boolean' },
         reverse: { type: 'boolean' },
         help: { type: 'boolean' },
      },
      strict: false,
      allowPositionals: true,
   });

   if (values.version) {
      console.log(`drixio v${getDrixioVersion()}`);
      process.exit(0);
   }

   if (values.help) {
      console.log(pc.cyan(`\nDrixio - Modern Database Manager\n`));
      console.log(`${pc.bold('Usage:')} npx drixio [command] [options]\n`);
      console.log(`${pc.bold('Tiers & Interfaces:')}`);
      console.log(
         `  Interactive TUI:      ${pc.green('npx drixio')} (Terminal UI with beginner wizards)`,
      );
      console.log(
         `  Web Studio:           ${pc.green('npx drixio studio')} (Browser UI for bulk inspection)`,
      );
      console.log(`\n${pc.bold('Quick Commands (Headless / Pro):')}`);
      console.log(
         `  ${pc.green('tables')}                 List all database tables and row counts (alias: ls)`,
      );
      console.log(
         `  ${pc.green('describe')} [table]       Inspect columns, types, PKs, and indexes (alias: desc)`,
      );
      console.log(
         `  ${pc.green('query')} "<sql>"         Run a quick SQL query`,
      );
      console.log(
         `  ${pc.green('exec')} <file.sql>       Execute a SQL script file`,
      );
      console.log(
         `  ${pc.green('export')} [table]        Export table(s) to CSV/JSON`,
      );
      console.log(
         `  ${pc.green('import')} [file]         Import JSON/CSV into a table`,
      );
      console.log(
         `  ${pc.green('seed')} [table] [count]  Generate realistic fake data for a table`,
      );
      console.log(
         `  ${pc.green('truncate')} [table]      Empty all data in a table and reset sequence`,
      );
      console.log(
         `  ${pc.green('diagram')}               Generate a Mermaid ER diagram`,
      );
      console.log(
         `  ${pc.green('generate-types')}        Generate TypeScript interfaces`,
      );
      console.log(
         `  ${pc.green('generate-orm')} [target] Generate Prisma or Drizzle ORM schema`,
      );
      console.log(
         `  ${pc.green('diff')} [target]         Compare schemas & generate migration SQL`,
      );
      console.log(
         `  ${pc.green('snippets')}              List saved SQL snippets & templates (alias: snip)`,
      );
      console.log(
         `  ${pc.green('run')} [snippet]         Execute a saved snippet or parametric query`,
      );
      console.log(
         `  ${pc.green('backup')}                Backup the entire database`,
      );
      console.log(
         `  ${pc.green('restore')} [dir|file]    Restore database from a backup directory or .sql file`,
      );
      console.log(
         `  ${pc.green('init')} [db_type]        Initialize a local database & .env`,
      );
      console.log(
         `  ${pc.green('drop-db')} [db_type]     Drop a local database`,
      );
      console.log(`\n${pc.bold('Options:')}`);
      console.log(`  -v, --version         Show drixio version`);
      console.log(`  --help                Show this help message`);
      console.log(`  --json                Output results as JSON`);
      console.log(`  --format <type>       Specify export format (csv|json)`);
      console.log(`  --schema-only         Export schema without data`);
      console.log(
         `  --table <name>        Specify table for import/export/orm`,
      );
      console.log(
         `  --out <file>          Specify output file for schema/SQL/snapshot`,
      );
      console.log(
         `  --snapshot            Export schema snapshot JSON for git tracking`,
      );
      console.log(
         `  --apply               Apply generated migration SQL to current database`,
      );
      console.log(
         `  --reverse             Generate rollback (down) migration SQL`,
      );
      console.log(
         `  --print               Print generated schema directly to terminal`,
      );
      console.log(
         `\nIf you don't provide a command, Drixio will launch the Interactive TUI!`,
      );
      process.exit(0);
   }

   let command: string | undefined;
   let commandArgs: string[] = [];

   if (customUrl) {
      // e.g. npx drixio "postgres://..." tables OR npx drixio "postgres://..." studio
      command = positionals[1];
      commandArgs = positionals.slice(2);
   } else {
      command = positionals[0];
      commandArgs = positionals.slice(1);
   }

   // 1. Studio Tier
   if (command === 'studio') {
      const { runStudio } = await import('../src/studio/index.js');
      const customTarget = customUrl || positionals[1];
      const dbConfig = await detectDatabase(customTarget);
      await runStudio(dbConfig);
      return;
   }

   // 2. Quick Command Tier
   if (command) {
      const dbConfig = await detectDatabase(customUrl);
      const handled = await runQuickCommand(
         command,
         commandArgs,
         values as any,
         dbConfig,
      );
      if (handled) return;
   }

   // 3. TUI Tier (Interactive Terminal UI)
   await runTui(undefined, customUrl);
}

main().catch((error) => {
   if (error.name === 'ExitPromptError') {
      console.log('\n Exit Drixio.');
      process.exit(0);
   }
   console.error('\n Error: ', error);
   process.exit(1);
});
