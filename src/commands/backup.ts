import pc from 'picocolors';
import { DBConfig, createDBAdapter } from '../logic/index.js';
import fs from 'fs/promises';
import path from 'path';

export async function runBackupCommand(dbConfig: DBConfig) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.red('Error: No database connection found. Cannot run backup.'),
      );
      process.exit(1);
   }

   const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
   const backupDir = path.join(process.cwd(), `drixio_backup_${timestamp}`);

   console.log(pc.cyan(`\nStarting database backup...`));
   console.log(pc.dim(`Database: ${dbConfig.type}`));
   console.log(pc.dim(`Target: ${dbConfig.targetUrl}`));
   console.log(pc.dim(`Backup Directory: ${backupDir}\n`));

   await fs.mkdir(backupDir, { recursive: true });

   // For SQLite, copy the physical file as it's the safest backup
   if (dbConfig.type === 'sqlite') {
      try {
         const targetFileName =
            path.basename(dbConfig.targetUrl) || 'database.sqlite';
         const destFile = path.join(backupDir, targetFileName);
         await fs.copyFile(dbConfig.targetUrl, destFile);
         console.log(pc.green(`✔ Copied raw SQLite file to ${destFile}`));
      } catch (e: any) {
         console.log(pc.red(`✘ Failed to copy SQLite file: ${e.message}`));
      }
   }

   // Also dump schema and data to JSON for all databases (including SQLite, as a textual backup)
   const adapter = createDBAdapter(dbConfig as any);
   try {
      const tables = await adapter.getTables();
      if (tables.length === 0) {
         console.log(pc.yellow('No tables found to backup.'));
      }

      for (const table of tables) {
         try {
            const schema = await adapter.getSchema(table);
            // Fetch data in batches to avoid OOM on large tables
            const batchSize = 1000;
            let batchOffset = 0;
            const allRows: Record<string, any>[] = [];
            let lastBatch;
            do {
               lastBatch = await adapter.getData(table, batchSize, batchOffset);
               allRows.push(...lastBatch.rows);
               batchOffset += batchSize;
            } while (lastBatch.rows.length === batchSize);

            const dumpObj = {
               table: table,
               schema: schema,
               totalRows: allRows.length,
               data: allRows,
            };

            const fp = path.join(backupDir, `${table}.json`);
            await fs.writeFile(fp, JSON.stringify(dumpObj, null, 2), 'utf-8');
            console.log(
               pc.green(`✔ Dumped table: ${table} (${allRows.length} rows)`),
            );
         } catch (e: any) {
            console.log(
               pc.red(`✘ Failed to dump table ${table}: ${e.message}`),
            );
         }
      }
   } catch (e: any) {
      console.log(pc.red(`\nBackup Error: ${e.message}`));
   } finally {
      await adapter.close();
   }

   console.log(pc.cyan(`\nBackup successfully completed at ${backupDir}`));
   process.exit(0);
}
