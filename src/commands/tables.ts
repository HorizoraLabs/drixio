import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   getTablesWithRowCount,
} from '../logic/index.js';
import { drawTable } from '../tui/ui/table.js';

export interface TablesCommandOptions {
   json?: boolean;
}

export async function runTablesCommand(
   dbConfig: DBConfig,
   options: TablesCommandOptions = {},
) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.red('Error: No database connection found. Cannot list tables.'),
      );
      process.exit(1);
   }

   const adapter = createDBAdapter(dbConfig);

   try {
      const res = await getTablesWithRowCount(adapter);
      if (!res.success) {
         console.log(pc.red(`\nFailed to list tables: ${res.error}\n`));
         await adapter.close().catch(() => {});
         process.exit(1);
      }
      const tableData = res.data;

      if (tableData.length === 0) {
         if (options.json) {
            console.log(JSON.stringify([], null, 2));
         } else {
            console.log(pc.yellow('\nNo tables found in database.\n'));
         }
         await adapter.close();
         process.exit(0);
      }

      if (options.json) {
         console.log(JSON.stringify(tableData, null, 2));
      } else {
         const displayRows = tableData.map((t) => ({
            'Table Name': t.name,
            Rows: typeof t.rows === 'number' ? t.rows.toLocaleString() : t.rows,
         }));

         drawTable(['Table Name', 'Rows'], displayRows, {
            title: `Database Tables (${tableData.length})`,
            maxColWidth: 45,
         });
         console.log(pc.dim(`\nTotal: ${tableData.length} tables found\n`));
      }

      await adapter.close();
      process.exit(0);
   } catch (e: any) {
      console.log(pc.red(`\nFailed to list tables: ${e.message}\n`));
      await adapter.close().catch(() => {});
      process.exit(1);
   }
}
