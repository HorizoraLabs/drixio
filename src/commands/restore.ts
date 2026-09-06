import pc from 'picocolors';
import { DBConfig, createDBAdapter, restoreDatabase } from '../logic/index.js';
import fs from 'fs/promises';
import path from 'path';

export async function runRestoreCommand(
   dbConfig: DBConfig,
   args: string[],
   options: Record<string, any> = {},
) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.red('Error: No database connection found. Cannot run restore.'),
      );
      process.exit(1);
   }

   let targetPath = args[0];
   const { input, select, confirm } = await import('@inquirer/prompts');

   if (!targetPath) {
      // Find candidate backup directories or files in current working directory
      try {
         const entries = await fs.readdir(process.cwd(), {
            withFileTypes: true,
         });
         const candidates: { name: string; value: string }[] = [];

         for (const entry of entries) {
            if (
               entry.isDirectory() &&
               entry.name.startsWith('drixio_backup_')
            ) {
               candidates.push({
                  name: `📁 ${entry.name} (Backup Directory)`,
                  value: entry.name,
               });
            } else if (
               entry.isFile() &&
               (entry.name.endsWith('.sql') || entry.name.endsWith('.json'))
            ) {
               candidates.push({
                  name: `📄 ${entry.name} (${entry.name.endsWith('.sql') ? 'SQL Script' : 'JSON Dump'})`,
                  value: entry.name,
               });
            }
         }

         if (candidates.length > 0) {
            candidates.push({
               name: '✏️  Enter a custom path manually...',
               value: '__custom__',
            });

            const choice = await select({
               message: 'Select a backup directory or file to restore:',
               choices: candidates,
            });

            if (choice === '__custom__') {
               targetPath = await input({
                  message:
                     'Enter path to backup directory, .sql, or .json file:',
               });
            } else {
               targetPath = choice;
            }
         } else {
            targetPath = await input({
               message: 'Enter path to backup directory, .sql, or .json file:',
            });
         }
      } catch {
         targetPath = await input({
            message: 'Enter path to backup directory, .sql, or .json file:',
         });
      }
   }

   if (!targetPath || !targetPath.trim()) {
      console.log(pc.yellow('No restore source specified. Aborting.'));
      process.exit(0);
   }

   const resolvedPath = path.resolve(process.cwd(), targetPath.trim());

   try {
      await fs.access(resolvedPath);
   } catch {
      console.log(pc.red(`Error: Backup path not found: ${resolvedPath}`));
      process.exit(1);
   }

   // Safety confirmation prompt unless --force or -y is passed
   const isForced = options.force === true || options.y === true;
   if (!isForced) {
      console.log(
         pc.yellow(
            `\n⚠️  WARNING: Restoring will overwrite existing tables and records in the database!`,
         ),
      );
      console.log(pc.dim(`Database: ${dbConfig.type} (${dbConfig.targetUrl})`));
      console.log(pc.dim(`Source:   ${resolvedPath}\n`));

      const proceed = await confirm({
         message: 'Are you sure you want to proceed with the database restore?',
         default: false,
      });

      if (!proceed) {
         console.log(pc.cyan('Restore cancelled.'));
         process.exit(0);
      }
   }

   const adapter = createDBAdapter(dbConfig as any);
   console.log(pc.cyan(`\nStarting database restore from: ${resolvedPath}...`));

   try {
      const result = await restoreDatabase(
         adapter,
         dbConfig.type,
         resolvedPath,
      );

      if (!result.success) {
         console.log(pc.red(`\n✘ Restore failed: ${result.error}`));
      } else {
         console.log(pc.green(`\n✔ Database restore completed successfully!`));
         if (result.data.restoredTables.length > 0) {
            console.log(
               pc.white(
                  `Restored: ${pc.bold(result.data.restoredTables.join(', '))} (${result.data.totalRows} total rows)`,
               ),
            );
         }
         if (result.data.message) {
            console.log(pc.dim(result.data.message));
         }
      }
   } catch (e: any) {
      console.log(pc.red(`\n✘ Restore failed: ${e.message}`));
   } finally {
      await adapter.close();
   }

   process.exit(0);
}
