import pc from 'picocolors';
import { printLogo, printDashboard } from './ui/logo.js';
import { DBConfig, detectDatabase } from '../logic/index.js';
import { viewTables } from './views/editor.js';
import { runSetup } from './wizards/setupConn.js';
import { selectAction } from './menus/action.js';
import { runRepl } from './views/repl.js';

export async function runTui(initialConfig?: DBConfig, customUrl?: string) {
   let running = true;
   let dbConfig = initialConfig || (await detectDatabase(customUrl));

   while (running) {
      console.clear();
      printLogo();
      printDashboard(dbConfig);

      const action = await selectAction(dbConfig);

      switch (action) {
         case 'editor':
            if (dbConfig.type === 'unknown') {
               console.log(
                  pc.yellow(
                     `\nNo database connection found. Please setup database first.`,
                  ),
               );
               await waitForEnter();
            } else {
               await viewTables(dbConfig);
            }
            break;
         case 'table':
            const { runTableManagerFlow } =
               await import('./wizards/tableManagerFlow.js');
            await runTableManagerFlow(dbConfig);
            break;
         case 'repl':
            await runRepl(dbConfig);
            break;
         case 'orm': {
            const { runOrmWizard } = await import('./wizards/ormWizard.js');
            await runOrmWizard(dbConfig);
            await waitForEnter();
            break;
         }
         case 'snippets': {
            const { runSnippetsWizard } = await import(
               './wizards/snippetsWizard.js'
            );
            await runSnippetsWizard(dbConfig);
            await waitForEnter();
            break;
         }
         case 'diff': {
            const { runDiffWizard } = await import('./wizards/diffWizard.js');
            await runDiffWizard(dbConfig);
            await waitForEnter();
            break;
         }
         case 'setup':
         case 're-configure':
            dbConfig = await runSetup(dbConfig);
            await waitForEnter();
            break;
         case 'exit':
            running = false;
            console.log(pc.dim('\nThanks for using Drixio. Goodbye!'));
            break;
      }
   }

   async function waitForEnter() {
      const { input } = await import('@inquirer/prompts');
      await input({
         message: 'Click Enter to continue...',
      });
   }
}
