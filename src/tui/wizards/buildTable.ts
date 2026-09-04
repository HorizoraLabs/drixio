import { input, select, confirm } from '@inquirer/prompts';
import pc from 'picocolors';
import {
   ColumnSchema,
   DBConfig,
   getDialect,
   createDBAdapter,
   createTable,
} from '../../logic/index.js';
import { promptColumnSchema } from './columnWizard.js';

export async function runWizard(dbConfig: DBConfig) {
   const adapter = createDBAdapter(dbConfig as any);

   let tableName = '';
   while (!tableName) {
      tableName = await input({
         message: 'Enter the new table name:',
      });
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
         console.log(
            pc.red(
               'Invalid table name. Use only letters, numbers, and underscores.',
            ),
         );
         tableName = '';
      }
   }

   const columns: ColumnSchema[] = [];
   let hasPk = false;
   let addMore = true;

   while (addMore) {
      printCurrentColumns(tableName, columns);

      const existingColumns = columns.map((c) => c.name);
      const { col, isPk } = await promptColumnSchema(
         adapter,
         hasPk,
         existingColumns,
      );

      if (!col) {
         break; // Empty input means cancel
      }

      if (isPk) hasPk = true;

      columns.push(col);

      addMore = await confirm({
         theme: {
            prefix: pc.cyan('\n✓ '),
            style: {
               message: (text: string) => pc.bold(pc.white(text)),
               highlight: (text: string) => {
                  const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
                  return pc.cyan(clean);
               },
            },
         },
         message: 'Add another column?',
         default: true,
      });
   }

   printCurrentColumns(tableName, columns);
   console.log(pc.dim('Generating SQL...'));
   const dialect = getDialect(dbConfig.type as any);
   const sql = dialect.buildCreateTable(tableName, columns);

   console.log(pc.cyan('\n--- SQL Preview ---'));
   console.log(pc.yellow(sql));
   console.log(pc.cyan('-------------------\n'));

   const proceed = await confirm({
      message: 'Do you want to execute this SQL to build the table?',
      default: true,
   });

   if (proceed) {
      try {
         console.log(pc.dim('Executing SQL...'));
         await adapter.executeSql(sql);
         console.log(
            pc.green(`\n✓ Table '${tableName}' created successfully!`),
         );
      } catch (e: any) {
         console.log(pc.red(`\nx Error creating table: ${e.message}`));
      } finally {
         await adapter.close();
      }
   } else {
      console.log(pc.yellow('Aborted table creation.'));
      await adapter.close();
   }

   await waitForEnter();
}

async function waitForEnter() {
   const { input } = await import('@inquirer/prompts');
   await input({
      message: 'Press Enter to continue...',
   });
}

function printCurrentColumns(tableName: string, columns: ColumnSchema[]) {
   console.clear();
   console.log('\n');

   const colWidths = {
      name: 20,
      type: 18,
      key: 8,
      nullable: 10,
      defaultCol: 16,
   };

   const totalWidth =
      colWidths.name +
      colWidths.type +
      colWidths.key +
      colWidths.nullable +
      colWidths.defaultCol +
      14;

   // Title Box
   console.log(pc.cyan(`╔${'═'.repeat(totalWidth)}╗`));
   const spacesNeeded = totalWidth - tableName.length;
   const leftSpace = Math.max(0, Math.floor(spacesNeeded / 2));
   const rightSpace = Math.max(0, spacesNeeded - leftSpace);
   const titleContent =
      ' '.repeat(leftSpace) +
      pc.bold(pc.white(tableName)) +
      ' '.repeat(rightSpace);
   console.log(pc.cyan('║') + titleContent + pc.cyan('║'));

   const drawDivider = (left: string, mid: string, right: string) => {
      return pc.cyan(
         left +
            '═'.repeat(colWidths.name + 2) +
            mid +
            '═'.repeat(colWidths.type + 2) +
            mid +
            '═'.repeat(colWidths.key + 2) +
            mid +
            '═'.repeat(colWidths.nullable + 2) +
            mid +
            '═'.repeat(colWidths.defaultCol + 2) +
            right,
      );
   };

   console.log(drawDivider('╠', '╦', '╣'));

   // Header
   console.log(
      pc.cyan('║ ') +
         pc.bold(pc.white('Column Name'.padEnd(colWidths.name))) +
         pc.cyan(' ║ ') +
         pc.bold(pc.white('Type'.padEnd(colWidths.type))) +
         pc.cyan(' ║ ') +
         pc.bold(pc.white('Key'.padEnd(colWidths.key))) +
         pc.cyan(' ║ ') +
         pc.bold(pc.white('Nullable'.padEnd(colWidths.nullable))) +
         pc.cyan(' ║ ') +
         pc.bold(pc.white('Default'.padEnd(colWidths.defaultCol))) +
         pc.cyan(' ║'),
   );

   if (columns.length > 0) {
      console.log(drawDivider('╠', '╬', '╣'));
   }

   // Rows
   for (let i = 0; i < columns.length; i++) {
      const col = columns[i];

      // First pad the raw strings, then apply color
      const nameStr = pc.white(col.name.padEnd(colWidths.name));
      const typeStr = pc.white(col.type.padEnd(colWidths.type));

      const pkRaw = col.isPk ? 'PK' : '-';
      const pkStr = col.isPk
         ? pc.green(pkRaw.padEnd(colWidths.key))
         : pc.dim(pkRaw.padEnd(colWidths.key));

      const nullRaw = col.nullable ? 'Yes' : 'No';
      const nullStr = col.nullable
         ? pc.green(nullRaw.padEnd(colWidths.nullable))
         : pc.dim(nullRaw.padEnd(colWidths.nullable));

      const extraRaw = col.defaultValue || '-';
      const extraStr = col.defaultValue
         ? pc.yellow(extraRaw.padEnd(colWidths.defaultCol))
         : pc.dim(extraRaw.padEnd(colWidths.defaultCol));

      console.log(
         pc.cyan('║ ') +
            nameStr +
            pc.cyan(' ║ ') +
            typeStr +
            pc.cyan(' ║ ') +
            pkStr +
            pc.cyan(' ║ ') +
            nullStr +
            pc.cyan(' ║ ') +
            extraStr +
            pc.cyan(' ║'),
      );
   }

   if (columns.length === 0) {
      console.log(drawDivider('╠', '╩', '╣'));
      const emptyMsg = 'No columns added yet';
      const emptyLeft = Math.max(
         0,
         Math.floor((totalWidth - emptyMsg.length) / 2),
      );
      const emptyRight = Math.max(0, totalWidth - emptyMsg.length - emptyLeft);
      console.log(
         pc.cyan('║') +
            ' '.repeat(emptyLeft) +
            pc.dim(emptyMsg) +
            ' '.repeat(emptyRight) +
            pc.cyan('║'),
      );
      console.log(pc.cyan(`╚${'═'.repeat(totalWidth)}╝`));
   } else {
      console.log(drawDivider('╚', '╩', '╝'));
   }

   console.log(pc.dim('\t\t\t  Leave empty the Column Name to cancel.\n'));
}
