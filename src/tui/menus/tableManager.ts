import { select, Separator } from '@inquirer/prompts';
import pc from 'picocolors';

export const selectTableManager = async () =>
   await select({
      message: 'Table Manager - Choose an action:',
      theme: {
         prefix: pc.cyan('✓ '),
         icon: {
            cursor: pc.cyan('› '),
         },
         style: {
            message: (text: string) => pc.bold(pc.white(text)),
            highlight: (text: string) => {
               const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
               return clean.includes(' Back') ? pc.red(clean) : pc.cyan(clean);
            },
         },
      },
      choices: [
         {
            name: ' Create New Table',
            value: 'create',
            description: 'Build a new database table.',
         },
         {
            name: ' Modify Existing Table',
            value: 'modify',
            description: "Modify an existing table's schema structure.",
         },
         {
            name: ' Generate Mock Data (Wizard)',
            value: 'mock',
            description: 'Generate realistic fake test data with foreign keys.',
         },
         {
            name: ' Truncate Table',
            value: 'truncate',
            description: 'Empty all records from a table.',
         },
         {
            name: ' Drop Table',
            value: 'drop',
            description: 'Delete an entire table and its data.',
         },
         new Separator(),
         {
            name: pc.dim(' Back'),
            value: 'back',
            description: 'Back to the main menu.',
         },
      ],
   });
