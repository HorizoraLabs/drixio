import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   detectDatabase,
   createSchemaSnapshot,
   diffDatabaseWithSnapshot,
   diffDatabases,
   SchemaSnapshot,
   SchemaDiffResult,
} from '../logic/index.js';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export interface DiffCommandOptions {
   snapshot?: boolean | string;
   apply?: boolean;
   out?: string;
   json?: boolean;
   reverse?: boolean;
   force?: boolean;
   y?: boolean;
}

export async function runDiffCommand(
   dbConfig: DBConfig,
   args: string[],
   options: DiffCommandOptions = {},
) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.red('Error: No database connection found. Cannot run schema diff.'),
      );
      process.exit(1);
   }

   const adapter = createDBAdapter(dbConfig as any);

   try {
      // 1. Snapshot mode: Save schema snapshot to JSON
      if (options.snapshot) {
         const outPath =
            typeof options.snapshot === 'string' && options.snapshot !== 'true'
               ? options.snapshot
               : options.out || args[0] || 'schema.json';

         console.log(
            pc.cyan(
               `\nCapturing schema snapshot for ${dbConfig.type.toUpperCase()} database...`,
            ),
         );

         const snapshotRes = await createSchemaSnapshot(
            adapter,
            dbConfig.type,
            path.basename(outPath, '.json'),
         );

         if (!snapshotRes.success) {
            console.log(
               pc.red(`✘ Failed to create snapshot: ${snapshotRes.error}`),
            );
            process.exit(1);
         }

         const resolvedPath = path.resolve(process.cwd(), outPath);
         await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
         await fs.writeFile(
            resolvedPath,
            JSON.stringify(snapshotRes.data, null, 2),
            'utf-8',
         );

         console.log(
            pc.green(`✔ Schema snapshot saved to: ${pc.bold(outPath)}`),
         );
         console.log(
            pc.gray(
               `  Tables captured: ${snapshotRes.data.tables.length} tables with columns & indexes.`,
            ),
         );
         return;
      }

      // 2. Determine target (file or connection URL)
      let targetArg = args[0];

      if (!targetArg) {
         // Auto-detect schema.json in workspace
         if (existsSync(path.resolve(process.cwd(), 'schema.json'))) {
            targetArg = 'schema.json';
         } else if (
            existsSync(path.resolve(process.cwd(), '.drixio/schema.json'))
         ) {
            targetArg = '.drixio/schema.json';
         } else {
            console.log(
               pc.yellow(
                  `\nNo target specified and no default 'schema.json' found.`,
               ),
            );
            console.log(pc.bold(`\nUsage examples:`));
            console.log(
               `  ${pc.green('npx drixio diff --snapshot')}             Take a snapshot of current DB into schema.json`,
            );
            console.log(
               `  ${pc.green('npx drixio diff schema.json')}           Compare current DB with a snapshot file`,
            );
            console.log(
               `  ${pc.green('npx drixio diff "postgres://..."')}      Compare current DB with another database`,
            );
            console.log(
               `  ${pc.green('npx drixio diff schema.json --apply')}   Compare and apply migration SQL directly`,
            );
            return;
         }
      }

      let diffResult: SchemaDiffResult;

      const isRemoteUrl =
         targetArg.startsWith('postgres://') ||
         targetArg.startsWith('postgresql://') ||
         targetArg.startsWith('mysql://') ||
         targetArg.startsWith('file:');

      if (isRemoteUrl) {
         console.log(
            pc.cyan(
               `\nConnecting to target database and computing schema diff...`,
            ),
         );
         const targetConfig = await detectDatabase(targetArg);
         const targetAdapter = createDBAdapter(targetConfig as any);
         try {
            const diffRes = await diffDatabases(
               adapter,
               targetAdapter,
               dbConfig.type,
               'Current Database',
               'Target Database',
            );
            if (!diffRes.success) {
               console.log(pc.red(`✘ Diff failed: ${diffRes.error}`));
               process.exit(1);
            }
            diffResult = diffRes.data;
         } finally {
            await targetAdapter.close().catch(() => {});
         }
      } else {
         // Target is a snapshot JSON file
         const filePath = path.resolve(process.cwd(), targetArg);
         if (!existsSync(filePath)) {
            console.log(
               pc.red(`✘ Target snapshot file not found: ${targetArg}`),
            );
            process.exit(1);
         }

         console.log(
            pc.cyan(
               `\nComparing current database with snapshot: ${targetArg}...`,
            ),
         );

         const content = await fs.readFile(filePath, 'utf-8');
         let snapshot: SchemaSnapshot;
         try {
            snapshot = JSON.parse(content);
         } catch {
            console.log(
               pc.red(`✘ Invalid JSON content in snapshot file: ${targetArg}`),
            );
            process.exit(1);
         }

         const diffRes = await diffDatabaseWithSnapshot(
            adapter,
            snapshot,
            dbConfig.type,
            'Current Database',
            `Snapshot (${path.basename(targetArg)})`,
         );

         if (!diffRes.success) {
            console.log(pc.red(`✘ Diff failed: ${diffRes.error}`));
            process.exit(1);
         }

         diffResult = diffRes.data;
      }

      // JSON output mode
      if (options.json) {
         console.log(JSON.stringify(diffResult, null, 2));
         return;
      }

      // Output Human-readable Diff Report
      printDiffReport(diffResult, options.reverse);

      const targetSql = options.reverse
         ? diffResult.rollbackSql
         : diffResult.migrationSql;

      // Output SQL to file if requested
      if (options.out) {
         const outResolved = path.resolve(process.cwd(), options.out);
         await fs.mkdir(path.dirname(outResolved), { recursive: true });
         await fs.writeFile(outResolved, targetSql, 'utf-8');
         console.log(
            pc.green(`✔ Migration SQL written to: ${pc.bold(options.out)}`),
         );
      }

      // Apply migration mode
      if (options.apply) {
         if (!diffResult.hasChanges) {
            console.log(
               pc.green(`\nNothing to apply. Schema is already in sync.`),
            );
            return;
         }

         const skipConfirm = options.force || options.y;
         let proceed = skipConfirm;

         if (!proceed) {
            const { confirm } = await import('@inquirer/prompts');
            proceed = await confirm({
               message: `Apply this ${options.reverse ? 'rollback' : 'migration'} to "${dbConfig.type.toUpperCase()}" database?`,
               default: false,
            });
         }

         if (!proceed) {
            console.log(pc.yellow('Migration aborted.'));
            return;
         }

         console.log(pc.cyan('\nExecuting migration statements...'));
         try {
            await adapter.executeSql(targetSql);
            console.log(pc.green('✔ Schema migration applied successfully!'));
         } catch (e: any) {
            console.log(pc.red(`✘ Migration execution failed: ${e.message}`));
            process.exit(1);
         }
      }
   } catch (e: any) {
      console.log(pc.red(`✘ An error occurred: ${e.message}`));
      process.exit(1);
   } finally {
      await adapter.close().catch(() => {});
   }
}

/**
 * Format and print the schema diff report to terminal with colored glyphs.
 */
function printDiffReport(diff: SchemaDiffResult, reverse?: boolean) {
   console.log(`\n${pc.bold('─'.repeat(60))}`);
   console.log(
      `${pc.bold('SCHEMA DIFF:')} ${pc.cyan(diff.sourceName)} ➔ ${pc.cyan(diff.targetName)}`,
   );
   console.log(`${pc.bold('─'.repeat(60))}`);

   if (!diff.hasChanges) {
      console.log(
         pc.green(`\n✔ Schemas are identical. No differences detected.\n`),
      );
      return;
   }

   const { stats } = diff;
   console.log(
      pc.bold(
         `\nSummary: ${stats.addedTablesCount} added tables, ${stats.droppedTablesCount} dropped tables, ${stats.alteredTablesCount} altered tables`,
      ),
   );
   console.log(
      pc.gray(
         `         ${stats.addedColumnsCount} added cols, ${stats.droppedColumnsCount} dropped cols, ${stats.modifiedColumnsCount} modified cols, ${stats.addedIndexesCount + stats.droppedIndexesCount} index changes\n`,
      ),
   );

   for (const table of diff.tables) {
      if (table.type === 'added') {
         console.log(
            pc.green(
               `+ [TABLE ADDED] ${pc.bold(table.tableName)} (${table.addedColumns.length} columns)`,
            ),
         );
         for (const col of table.addedColumns) {
            const pkStr = col.isPk ? ' [PK]' : '';
            const nullStr = col.nullable ? 'NULL' : 'NOT NULL';
            console.log(
               pc.gray(`    + ${col.name} ${col.type} ${nullStr}${pkStr}`),
            );
         }
      } else if (table.type === 'dropped') {
         console.log(
            pc.red(
               `- [TABLE DROPPED] ${pc.bold(table.tableName)} (${table.droppedColumns.length} columns)`,
            ),
         );
      } else if (table.type === 'altered') {
         console.log(
            pc.yellow(`~ [TABLE ALTERED] ${pc.bold(table.tableName)}`),
         );

         for (const col of table.addedColumns) {
            const pkStr = col.isPk ? ' [PK]' : '';
            const nullStr = col.nullable ? 'NULL' : 'NOT NULL';
            console.log(
               pc.green(
                  `    + ADD COLUMN ${col.name} ${col.type} ${nullStr}${pkStr}`,
               ),
            );
         }

         for (const col of table.droppedColumns) {
            console.log(pc.red(`    - DROP COLUMN ${col.name}`));
         }

         for (const mod of table.modifiedColumns) {
            const typeChange =
               mod.oldType !== mod.newType
                  ? ` type: ${mod.oldType} ➔ ${mod.newType}`
                  : '';
            const nullChange =
               mod.oldNullable !== mod.newNullable
                  ? ` nullable: ${mod.oldNullable} ➔ ${mod.newNullable}`
                  : '';
            const defChange =
               mod.oldDefault !== mod.newDefault
                  ? ` default: ${mod.oldDefault || 'none'} ➔ ${mod.newDefault || 'none'}`
                  : '';
            console.log(
               pc.yellow(
                  `    ~ MODIFY COLUMN ${mod.name}${typeChange}${nullChange}${defChange}`,
               ),
            );
         }

         for (const idx of table.addedIndexes) {
            console.log(
               pc.green(
                  `    + ADD INDEX ${idx.name || 'unnamed'} on (${idx.columns.join(', ')})`,
               ),
            );
         }

         for (const idx of table.droppedIndexes) {
            console.log(pc.red(`    - DROP INDEX ${idx.name || 'unnamed'}`));
         }
      }
   }

   console.log(`\n${pc.bold('─'.repeat(60))}`);
   console.log(
      pc.bold(reverse ? 'ROLLBACK SQL (DOWN):' : 'MIGRATION SQL (UP):'),
   );
   console.log(`${pc.bold('─'.repeat(60))}\n`);

   const sqlToPrint = reverse ? diff.rollbackSql : diff.migrationSql;
   console.log(pc.cyan(sqlToPrint));
}
