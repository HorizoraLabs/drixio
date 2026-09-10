import { select, input, confirm } from '@inquirer/prompts';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   detectDatabase,
   createSchemaSnapshot,
   diffDatabaseWithSnapshot,
   diffDatabases,
   SchemaDiffResult,
} from '../../logic/index.js';

export async function runDiffWizard(dbConfig: DBConfig) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.yellow(
            '\nNo database connection found. Please setup database first.',
         ),
      );
      return;
   }

   console.log(pc.cyan('\n--- Schema Diff & Migration Wizard ---'));
   console.log(
      pc.dim(
         'Compare schemas against snapshots or external databases, and generate Up/Down migration SQL.\n',
      ),
   );

   const action = await select({
      message: 'Select diff action:',
      choices: [
         {
            name: 'Capture Schema Snapshot (JSON)',
            value: 'snapshot',
            description: 'Save current database structure to a versioned JSON snapshot',
         },
         {
            name: 'Compare with Snapshot File (.json)',
            value: 'compare-file',
            description: 'Compare current database with a saved schema snapshot file',
         },
         {
            name: 'Compare with Another Database URL',
            value: 'compare-url',
            description: 'Compare current database directly with a remote/local database',
         },
      ],
   });

   const adapter = createDBAdapter(dbConfig as any);

   try {
      if (action === 'snapshot') {
         const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
         const defaultFileName = `.drixio/snapshot_${timestamp}.json`;

         const outPath = await input({
            message: 'Enter output file path for snapshot:',
            default: defaultFileName,
         });

         const resolvedPath = path.resolve(process.cwd(), outPath);
         await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

         console.log(pc.dim('\nCapturing schema snapshot...'));
         const snapshotRes = await createSchemaSnapshot(
            adapter,
            dbConfig.type,
            path.basename(outPath, '.json'),
         );

         if (!snapshotRes.success) {
            console.log(pc.red(`\n✘ Failed to create snapshot: ${snapshotRes.error}`));
            return;
         }

         await fs.writeFile(
            resolvedPath,
            JSON.stringify(snapshotRes.data, null, 2),
            'utf-8',
         );

         console.log(
            pc.green(
               `\n✔ Successfully saved snapshot with ${snapshotRes.data.tables.length} table(s) to: ${pc.bold(resolvedPath)}`,
            ),
         );
         return;
      }

      let diffResult: SchemaDiffResult;

      if (action === 'compare-file') {
         const defaultPath = existsSync(path.resolve(process.cwd(), '.drixio/schema.json'))
            ? '.drixio/schema.json'
            : 'schema.json';

         const snapshotPath = await input({
            message: 'Enter path to snapshot JSON file:',
            default: defaultPath,
         });

         const resolvedSnapshot = path.resolve(process.cwd(), snapshotPath);
         if (!existsSync(resolvedSnapshot)) {
            console.log(pc.red(`\n✘ Snapshot file not found: ${resolvedSnapshot}`));
            return;
         }

         console.log(pc.dim('\nComparing current database with snapshot...'));
         const content = await fs.readFile(resolvedSnapshot, 'utf-8');
         let snapshot: any;
         try {
            snapshot = JSON.parse(content);
         } catch {
            console.log(pc.red(`\n✘ Invalid JSON content in snapshot file: ${resolvedSnapshot}`));
            return;
         }

         const res = await diffDatabaseWithSnapshot(
            adapter,
            snapshot,
            dbConfig.type,
            'Current Database',
            `Snapshot (${path.basename(resolvedSnapshot)})`,
         );
         if (!res.success) {
            console.log(pc.red(`\n✘ Diff failed: ${res.error}`));
            return;
         }
         diffResult = res.data;
      } else {
         const targetUrl = await input({
            message: 'Enter target database connection URL (e.g. postgres://user:pass@host:5432/other_db):',
         });

         if (!targetUrl.trim()) {
            console.log(pc.yellow('Target URL cannot be empty.'));
            return;
         }

         console.log(pc.dim('\nConnecting to target database and comparing...'));
         const targetConfig = await detectDatabase(targetUrl.trim());
         const targetAdapter = createDBAdapter(targetConfig);

         try {
            const res = await diffDatabases(
               adapter,
               targetAdapter,
               dbConfig.type,
               'Current Database',
               'Target Database',
            );
            if (!res.success) {
               console.log(pc.red(`\n✘ Diff failed: ${res.error}`));
               return;
            }
            diffResult = res.data;
         } finally {
            await targetAdapter.close();
         }
      }

      if (!diffResult.hasChanges) {
         console.log(pc.green('\n✔ No schema differences detected. Both schemas are identical!'));
         return;
      }

      console.log(pc.bold(pc.yellow(`\n--- Schema Differences Detected ---`)));
      console.log(`  Added Tables:    ${diffResult.stats.addedTablesCount}`);
      console.log(`  Dropped Tables:  ${diffResult.stats.droppedTablesCount}`);
      console.log(`  Altered Tables:  ${diffResult.stats.alteredTablesCount}`);
      console.log(`  Added Columns:   ${diffResult.stats.addedColumnsCount}`);
      console.log(`  Dropped Columns: ${diffResult.stats.droppedColumnsCount}`);
      console.log(`  Added Indexes:   ${diffResult.stats.addedIndexesCount}`);
      console.log(`  Dropped Indexes: ${diffResult.stats.droppedIndexesCount}`);

      const nextStep = await select({
         message: 'What would you like to inspect?',
         choices: [
            {
               name: 'View Forward Migration SQL (Up)',
               value: 'view-up',
            },
            {
               name: 'View Rollback SQL (Down)',
               value: 'view-down',
            },
            {
               name: 'Save Migration SQL to File',
               value: 'save-sql',
            },
         ],
      });

      if (nextStep === 'view-up') {
         console.log(pc.bold(pc.cyan('\n--- Forward Migration SQL (Up) ---')));
         console.log(diffResult.migrationSql);
         console.log(pc.bold(pc.cyan('----------------------------------\n')));
      } else if (nextStep === 'view-down') {
         console.log(pc.bold(pc.cyan('\n--- Rollback SQL (Down) ---')));
         console.log(diffResult.rollbackSql);
         console.log(pc.bold(pc.cyan('---------------------------\n')));
      } else if (nextStep === 'save-sql') {
         const outSqlPath = await input({
            message: 'Enter destination file path:',
            default: 'migration.sql',
         });

         const resolvedOut = path.resolve(process.cwd(), outSqlPath);
         await fs.mkdir(path.dirname(resolvedOut), { recursive: true });
         await fs.writeFile(resolvedOut, diffResult.migrationSql, 'utf-8');

         console.log(
            pc.green(`\n✔ Migration SQL successfully saved to: ${pc.bold(resolvedOut)}`),
         );
      }
   } catch (e: any) {
      console.log(pc.red(`\n✘ Schema diff failed: ${e.message}`));
   } finally {
      await adapter.close();
   }
}
