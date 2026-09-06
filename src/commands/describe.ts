import pc from 'picocolors';
import { DBConfig, createDBAdapter } from '../logic/index.js';
import { drawTable } from '../tui/ui/table.js';

export interface DescribeCommandOptions {
   json?: boolean;
}

export async function runDescribeCommand(
   dbConfig: DBConfig,
   args: string[],
   options: DescribeCommandOptions = {},
) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.red('Error: No database connection found. Cannot describe table.'),
      );
      process.exit(1);
   }

   const adapter = createDBAdapter(dbConfig);

   try {
      let tableName = args[0];

      if (!tableName) {
         const tables = await adapter.getTables();
         if (tables.length === 0) {
            console.log(pc.yellow('\nNo tables found in database.\n'));
            await adapter.close();
            process.exit(0);
         }

         if (tables.length === 1) {
            tableName = tables[0];
         } else {
            const { select } = await import('@inquirer/prompts');
            tableName = await select({
               message: 'Select a table to describe:',
               choices: tables.map((t) => ({ name: t, value: t })),
            });
         }
      }

      if (!tableName) {
         console.log(pc.yellow('No table selected. Exiting.'));
         await adapter.close();
         process.exit(0);
      }

      const columns = await adapter.getSchema(tableName);
      const indexes = await adapter.getIndexes(tableName);

      if (columns.length === 0) {
         console.log(
            pc.yellow(`\nTable "${tableName}" not found or has no columns.\n`),
         );
         await adapter.close();
         process.exit(0);
      }

      if (options.json) {
         console.log(
            JSON.stringify(
               {
                  table: tableName,
                  columns,
                  indexes,
               },
               null,
               2,
            ),
         );
         await adapter.close();
         process.exit(0);
      }

      // Format column definitions for ASCII display
      const displayColumns = columns.map((col) => {
         let extra = '-';
         if (col.fkTarget) {
            extra = `FK -> ${col.fkTarget.table}(${col.fkTarget.column})`;
         } else if (col.isUnique) {
            extra = 'UNIQUE';
         }

         return {
            Field: col.name,
            Type: col.type.toUpperCase(),
            PK: col.isPk ? '✓ PK' : '-',
            Nullable: col.nullable ? 'YES' : 'NO',
            Default: col.defaultValue ?? '-',
            Extra: extra,
         };
      });

      drawTable(
         ['Field', 'Type', 'PK', 'Nullable', 'Default', 'Extra'],
         displayColumns,
         {
            title: `Schema: ${tableName} (${columns.length} columns)`,
            maxColWidth: 35,
         },
      );

      // Render indexes if available
      if (indexes.length > 0) {
         console.log(pc.bold(pc.cyan(`\nIndexes for "${tableName}":`)));
         const displayIndexes = indexes.map((idx) => ({
            Name: idx.name,
            Columns: idx.columns.join(', '),
            Unique: idx.isUnique ? 'YES' : 'NO',
         }));
         drawTable(['Name', 'Columns', 'Unique'], displayIndexes, {
            maxColWidth: 35,
         });
      }

      console.log('');
      await adapter.close();
      process.exit(0);
   } catch (e: any) {
      console.log(pc.red(`\nFailed to describe table: ${e.message}\n`));
      await adapter.close().catch(() => {});
      process.exit(1);
   }
}
