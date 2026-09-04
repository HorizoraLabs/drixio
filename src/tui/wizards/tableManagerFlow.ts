import pc from 'picocolors';
import { DBConfig, createDBAdapter } from '../../logic/index.js';
import { selectTableManager } from '../menus/tableManager.js';
import { runWizard } from './buildTable.js';
import { runSqlRunner } from '../views/sqlRunner.js';
import { runDropTable, runModifyTable } from './modifyTable.js';
import { runMockWizard } from './mockWizard.js';
import { runTruncateWizard } from './truncateWizard.js';
import { select, Separator } from '@inquirer/prompts';
import { printCustomDashboard } from '../ui/logo.js';

export async function runTableManagerFlow(dbConfig: DBConfig) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.yellow(
            `\nNo database connection found. Please setup database first.`,
         ),
      );
      await waitForEnter();
      return;
   }

   const adapter = createDBAdapter(dbConfig as any);

   let running = true;
   while (running) {
      console.clear();

      let tablesCount = 'Scanning...';
      try {
         const tables = await adapter.getTables();
         tablesCount = `${tables.length} tables detected`;
      } catch (e: any) {
         tablesCount = pc.red(e.message);
      }

      const targetVal = dbConfig.targetUrl;
      printCustomDashboard(
         ` Table Builder & Manager  •  [${dbConfig.type.toUpperCase()}]`,
         [
            { label: 'Database', value: dbConfig.type.toUpperCase() },
            {
               label: 'Target',
               value:
                  targetVal.length > 45
                     ? '...' + targetVal.slice(-42)
                     : targetVal,
            },
            { label: 'Tables', value: tablesCount },
         ],
      );

      const action = await selectTableManager();

      switch (action) {
         case 'create':
            const createMethod = await select({
               message: 'How do you want to create the table?',
               theme: {
                  prefix: pc.cyan('✓ '),
                  icon: {
                     cursor: pc.cyan('› '),
                  },
                  style: {
                     message: (text: string) => pc.bold(pc.white(text)),
                     highlight: (text: string) => {
                        const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
                        return clean.includes('Cancel')
                           ? pc.red(clean)
                           : pc.cyan(clean);
                     },
                  },
               },
               choices: [
                  {
                     name: ' Interactive Wizard (Beginner Friendly)',
                     value: 'wizard',
                     description:
                        'Follow the step-by-step guide to build your table.',
                  },
                  {
                     name: ' Raw SQL (Experts)',
                     value: 'sql',
                     description:
                        'Write / Import your own CREATE TABLE statement.',
                  },
                  new Separator(),
                  {
                     name: pc.dim(' Cancel'),
                     value: 'cancel',
                     description: 'Back to Table Manager',
                  },
               ],
            });
            if (createMethod === 'wizard') await runWizard(dbConfig);
            else if (createMethod === 'sql') await runSqlRunner(dbConfig);
            break;
         case 'modify':
            await handleModifyMenu(dbConfig);
            break;
         case 'mock':
            await runMockWizard(dbConfig);
            await waitForEnter();
            break;
         case 'truncate':
            await runTruncateWizard(dbConfig);
            await waitForEnter();
            break;
         case 'drop':
            await runDropTable(dbConfig);
            await waitForEnter();
            break;
         case 'back':
            running = false;
            break;
      }
   }

   await adapter.close();
}

async function handleModifyMenu(dbConfig: DBConfig) {
   const action = await select({
      message: 'Modify Table Actions:',
      choices: [
         { name: 'Add Column', value: 'add_col' },
         { name: 'Rename Column', value: 'rename_col' },
         {
            name: 'Modify Column Settings',
            value: 'mod_col',
         },
         { name: 'Delete Column', value: 'del_col' },
         { name: ' Back', value: 'back' },
      ],
   });

   if (action === 'back') return;

   switch (action) {
      case 'add_col':
         await runModifyTable(dbConfig, 'add');
         break;
      case 'rename_col':
         await runModifyTable(dbConfig, 'rename');
         break;
      case 'mod_col':
         await runModifyTable(dbConfig, 'modify');
         break;
      case 'del_col':
         await runModifyTable(dbConfig, 'delete');
         break;
   }

   await waitForEnter();
}

async function waitForEnter() {
   const { input } = await import('@inquirer/prompts');
   await input({
      message: 'Press Enter to continue...',
   });
}
