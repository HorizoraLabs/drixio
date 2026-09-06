import { select, Separator } from '@inquirer/prompts';
import pc from 'picocolors';
import {
   createDBAdapter,
   getTablesWithRowCount,
   buildSearchWhereClause,
   exportTable,
} from '../../logic/index.js';
import { selectTable } from '../menus/table.js';
import {
   runBeginnerAdd,
   runBeginnerEdit,
   runBeginnerDelete,
   runExpertMode,
} from '../wizards/dataEditor.js';
import { drawTable } from '../ui/table.js';
import { printCustomDashboard } from '../ui/logo.js';

interface DBConfigProps {
   type: 'sqlite' | 'postgres' | 'mysql' | 'unknown';
   targetUrl: string;
   source: '.env' | 'auto-detected' | 'manual';
}

export async function viewTables(dbConfig: DBConfigProps) {
   const adapter = createDBAdapter(dbConfig as any);
   let viewing = true;

   while (viewing) {
      console.clear();

      let tables: string[] = [];
      let totalRows = 0;
      let totalDataCount = 'Scanning...';
      try {
         const statsRes = await getTablesWithRowCount(adapter);
         if (statsRes.success) {
            const tableStats = statsRes.data;
            tables = tableStats.map((t) => t.name);
            totalRows = tableStats.reduce(
               (acc, t) => acc + (typeof t.rows === 'number' ? t.rows : 0),
               0,
            );
            totalDataCount = `${totalRows.toLocaleString()} rows across ${tables.length} tables`;
         } else {
            totalDataCount = pc.red(statsRes.error);
         }
      } catch (e: any) {
         totalDataCount = pc.red(e.message);
      }

      const targetVal = dbConfig.targetUrl;
      const sourceVal =
         dbConfig.source === '.env'
            ? 'Loaded from project .env file'
            : dbConfig.source === 'auto-detected'
              ? 'Auto-detected local SQLite file'
              : 'Manual connection config';

      printCustomDashboard(
         ` Data Browser & Editor  •  [${dbConfig.type.toUpperCase()}]`,
         [
            { label: 'Database', value: dbConfig.type.toUpperCase() },
            {
               label: 'Target',
               value:
                  targetVal.length > 45
                     ? '...' + targetVal.slice(-42)
                     : targetVal,
            },
            { label: 'Source', value: sourceVal },
            { label: 'Total Data', value: totalDataCount },
         ],
      );

      try {
         if (tables.length === 0) {
            console.log(pc.yellow('No tables found in this database.'));
            await waitForEnter();
            await adapter.close();
            return;
         }

         const tableChoices = [
            ...tables.map((table) => ({
               name: table,
               value: table,
            })),
            new Separator(),
            {
               name: pc.dim(' Back'),
               value: 'BACK',
            },
         ];

         const selectedTable = await selectTable(tableChoices);

         if (selectedTable === 'BACK') {
            viewing = false;
            continue;
         }

         let tableLoop = true;
         let currentPage = 1;
         let currentWhere = '';
         const limit = 50;

         while (tableLoop) {
            console.clear();
            const offset = (currentPage - 1) * limit;
            const schema = await adapter.getSchema(selectedTable);
            const colNames = schema.map((c) => c.name);

            let data;
            try {
               data = await adapter.getData(
                  selectedTable,
                  limit,
                  offset,
                  currentWhere,
               );
            } catch (e: any) {
               console.log(pc.red(`\nError fetching data: ${e.message}\n`));
               currentWhere = '';
               const { input } = await import('@inquirer/prompts');
               await input({ message: 'Click Enter to continue...' });
               continue;
            }
            const rows = data.rows;

            const detailHeaderTitle = ` ${selectedTable} (Page ${currentPage}) `;
            drawTable(colNames, rows, {
               title: detailHeaderTitle,
               maxColWidth: 30,
            });

            const hasNextPage = rows.length === limit;
            const hasPrevPage = currentPage > 1;
            const actionChoices: any[] = [
               { name: 'Add Data', value: 'add' },
               { name: 'Edit Data', value: 'edit' },
               { name: 'Delete Data', value: 'delete' },
               new Separator(),
               { name: 'Search Data', value: 'search' },
               {
                  name: currentWhere
                     ? 'Clear Search'
                     : pc.dim('Clear Search (disabled)'),
                  value: currentWhere ? 'clear_search' : 'noop',
               },
               new Separator(),
               { name: 'Export to CSV', value: 'exportCsv' },
               { name: 'Export to JSON', value: 'exportJson' },
               new Separator(),
            ];
            if (hasPrevPage)
               actionChoices.push({ name: 'Previous Page', value: 'prev' });
            if (hasNextPage)
               actionChoices.push({ name: 'Next Page', value: 'next' });
            actionChoices.push({ name: pc.dim(' Back'), value: 'BACK' });

            const action = await select({
               message: 'Select an action for this table:',
               theme: {
                  prefix: pc.cyan('✓ '),
                  icon: {
                     cursor: pc.cyan('› '),
                  },
                  style: {
                     message: (text: string) => pc.bold(pc.white(text)),
                     highlight: (text: string) => {
                        const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
                        return clean.includes(' Back')
                           ? pc.red(clean)
                           : pc.cyan(clean);
                     },
                  },
               },
               choices: actionChoices,
            });

            if (action === 'prev') {
               currentPage--;
               continue;
            }
            if (action === 'next') {
               currentPage++;
               continue;
            }
            if (action === 'noop') {
               continue;
            }

            if (action === 'BACK') {
               tableLoop = false;
               continue;
            }

            if (action === 'clear_search') {
               currentWhere = '';
               currentPage = 1;
               continue;
            }

            if (action === 'search') {
               const { input } = await import('@inquirer/prompts');
               const searchInput = await input({
                  message:
                     'Enter Search (e.g. `age > 18` or `John` for fuzzy search):',
               });
               currentWhere = buildSearchWhereClause(
                  adapter,
                  dbConfig.type,
                  schema,
                  searchInput,
               );
               currentPage = 1;
               continue;
            }

            if (action === 'exportCsv' || action === 'exportJson') {
               try {
                  console.log(pc.yellow('\nExporting data...'));
                  const format = action === 'exportCsv' ? 'csv' : 'json';
                  const exportRes = await exportTable(adapter, selectedTable, {
                     format,
                     whereClause: currentWhere,
                  });

                  if (!exportRes.success) {
                     console.log(pc.red(`\nExport Error: ${exportRes.error}`));
                  } else {
                     const fs = await import('fs/promises');
                     const path = await import('path');

                     const exportDir = path.join(
                        process.cwd(),
                        'drixio_exports',
                     );
                     await fs.mkdir(exportDir, { recursive: true });

                     const fp = path.join(
                        exportDir,
                        `${selectedTable}.${format}`,
                     );
                     await fs.writeFile(fp, exportRes.data, 'utf-8');
                     console.log(pc.green(`\n✔ Exported to ${fp}`));
                  }
               } catch (e: any) {
                  console.log(pc.red(`\nExport Error: ${e.message}`));
               }
               const { input } = await import('@inquirer/prompts');
               await input({ message: 'Click Enter to continue...' });
               continue;
            }

            const mode = await select({
               message: `Select mode for ${action} data:`,
               choices: [
                  {
                     name: 'Beginner (Interactive Step-by-Step)',
                     value: 'beginner',
                  },
                  {
                     name: 'Expert (Load SQL from .sql or .md file)',
                     value: 'expert',
                  },
                  new Separator(),
                  { name: pc.dim('Cancel'), value: 'cancel' },
               ],
            });

            if (mode === 'cancel') {
               continue;
            }

            if (mode === 'expert') {
               await runExpertMode(adapter);
               await waitForEnter();
               continue;
            }

            if (action === 'add') {
               await runBeginnerAdd(
                  adapter,
                  dbConfig.type,
                  selectedTable,
                  schema,
               );
               await waitForEnter();
            } else if (action === 'edit') {
               await runBeginnerEdit(
                  adapter,
                  dbConfig.type,
                  selectedTable,
                  schema,
               );
               await waitForEnter();
            } else if (action === 'delete') {
               await runBeginnerDelete(
                  adapter,
                  dbConfig.type,
                  selectedTable,
                  schema,
               );
               await waitForEnter();
            }
         }
      } catch (error: any) {
         console.log(pc.red(`\nx Error: ${error.message}`));
         await waitForEnter();
         viewing = false;
      }
   }

   await adapter.close();
}

async function waitForEnter() {
   const { input } = await import('@inquirer/prompts');
   await input({
      message: 'Press Enter to continue...',
   });
}
