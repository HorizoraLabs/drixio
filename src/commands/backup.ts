import pc from 'picocolors';
import { DBConfig, createDBAdapter, backupDatabase } from '../logic/index.js';

export async function runBackupCommand(dbConfig: DBConfig) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.red('Error: No database connection found. Cannot run backup.'),
      );
      process.exit(1);
   }

   console.log(pc.cyan(`\nStarting database backup...`));
   console.log(pc.dim(`Database: ${dbConfig.type}`));
   console.log(pc.dim(`Target: ${dbConfig.targetUrl}`));

   const adapter = createDBAdapter(dbConfig as any);
   try {
      const result = await backupDatabase(adapter, dbConfig, {
         onProgress: (ev) => {
            if (ev.type === 'sqlite_copy') {
               console.log(pc.green(`✔ ${ev.message}`));
            } else if (ev.type === 'table_dump') {
               console.log(
                  pc.green(`✔ Dumped table: ${ev.table} (${ev.rows} rows)`),
               );
            } else if (ev.type === 'warn') {
               console.log(pc.yellow(`! ${ev.message}`));
            }
         },
      });

      if (!result.success) {
         console.log(pc.red(`\nBackup Error: ${result.error}\n`));
         process.exit(1);
      }

      console.log(
         pc.cyan(
            `\nBackup successfully completed at ${result.data.backupDir}\n`,
         ),
      );
   } catch (e: any) {
      console.log(pc.red(`\nBackup Error: ${e.message}\n`));
      process.exit(1);
   } finally {
      await adapter.close();
   }

   process.exit(0);
}
