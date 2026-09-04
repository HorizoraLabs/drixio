import { select, confirm, input } from '@inquirer/prompts';
import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   dropTable,
   applySchemaChanges,
} from '../../logic/index.js';
import { promptColumnSchema } from './columnWizard.js';

export async function runDropTable(dbConfig: DBConfig) {
   const adapter = createDBAdapter(dbConfig as any);
   try {
      const tables = await adapter.getTables();
      if (tables.length === 0) {
         console.log(pc.yellow('No tables found in the database.'));
         return;
      }
      const targetTable = await select({
         message: 'Select a table to drop:',
         choices: tables.map((t) => ({ name: t, value: t })),
      });

      const sure = await confirm({
         message: `Are you sure you want to DROP TABLE '${targetTable}'? This will delete all its data!`,
         default: false,
      });

      if (sure) {
         const res = await dropTable(adapter, dbConfig.type, targetTable);
         if (res.success) {
            console.log(
               pc.green(`✓ Table '${targetTable}' dropped successfully.`),
            );
         } else {
            console.log(pc.red(`Error dropping table: ${res.error}`));
         }
      }
   } catch (e: any) {
      console.log(pc.red(`Error: ${e.message}`));
   } finally {
      await adapter.close();
   }
}

export async function runModifyTable(
   dbConfig: DBConfig,
   action: 'add' | 'rename' | 'modify' | 'delete',
) {
   const adapter = createDBAdapter(dbConfig as any);

   try {
      const tables = await adapter.getTables();
      if (tables.length === 0) {
         console.log(pc.yellow('No tables found in the database.'));
         return;
      }
      const targetTable = await select({
         message: 'Select a table to modify:',
         choices: tables.map((t) => ({ name: t, value: t })),
      });

      const schema = await adapter.getSchema(targetTable);

      if (action === 'add') {
         const hasPk = schema.some((c) => c.isPk);
         const existingColumns = schema.map((c) => c.name);
         const { col } = await promptColumnSchema(
            adapter,
            hasPk,
            existingColumns,
         );
         if (col) {
            console.log(
               pc.cyan(`\nAdding column '${col.name}' to '${targetTable}'...`),
            );
            const res = await applySchemaChanges(adapter, dbConfig.type, {
               tableName: targetTable,
               pendingInserts: [col],
            });
            if (res.success) {
               console.log(
                  pc.green(`✓ Column '${col.name}' added successfully.`),
               );
            } else {
               console.log(pc.red(`✘ Failed to add column: ${res.error}`));
            }
         }
      } else if (action === 'rename') {
         if (schema.length === 0)
            return console.log(pc.yellow('Table has no columns.'));
         const oldCol = await select({
            message: 'Select a column to rename:',
            choices: schema.map((c) => ({
               name: `${c.name} (${c.type})`,
               value: c.name,
            })),
         });
         const newCol = await input({ message: `New name for '${oldCol}':` });
         if (newCol && newCol !== oldCol) {
            console.log(
               pc.cyan(`\nRenaming column '${oldCol}' to '${newCol}'...`),
            );
            const res = await applySchemaChanges(adapter, dbConfig.type, {
               tableName: targetTable,
               pendingEdits: {
                  [oldCol]: { name: newCol },
               },
            });
            if (res.success) {
               console.log(
                  pc.green(`✓ Column renamed to '${newCol}' successfully.`),
               );
            } else {
               console.log(pc.red(`✘ Failed to rename column: ${res.error}`));
            }
         }
      } else if (action === 'modify') {
         if (schema.length === 0)
            return console.log(pc.yellow('Table has no columns.'));
         const targetCol = await select({
            message: 'Select a column to modify:',
            choices: schema.map((c) => ({
               name: `${c.name} (${c.type})`,
               value: c.name,
            })),
         });

         const hasPk = schema.some((c) => c.isPk && c.name !== targetCol);
         const existingColumns = schema
            .map((c) => c.name)
            .filter((n) => n !== targetCol);
         const { col } = await promptColumnSchema(
            adapter,
            hasPk,
            existingColumns,
            targetCol,
         );

         if (col) {
            console.log(
               pc.cyan(`\nApplying column changes to '${targetTable}'...`),
            );
            const res = await applySchemaChanges(adapter, dbConfig.type, {
               tableName: targetTable,
               pendingEdits: {
                  [targetCol]: {
                     name: col.name,
                     type: col.type,
                     isPk: col.isPk,
                     nullable: col.nullable,
                     defaultValue: col.defaultValue,
                     isUnique: col.isUnique,
                     fkTarget: col.fkTarget,
                  },
               },
            });
            if (res.success) {
               console.log(
                  pc.green(`✓ Column '${targetCol}' modified successfully.`),
               );
            } else {
               console.log(pc.red(`✘ Failed to modify column: ${res.error}`));
            }
         }
      } else if (action === 'delete') {
         if (schema.length === 0)
            return console.log(pc.yellow('Table has no columns.'));
         const targetCol = await select({
            message: 'Select a column to delete:',
            choices: schema.map((c) => ({
               name: `${c.name} (${c.type})`,
               value: c.name,
            })),
         });

         const sure = await confirm({
            message: `Are you sure you want to delete column '${targetCol}'? Data will be lost!`,
            default: false,
         });

         if (sure) {
            console.log(
               pc.cyan(
                  `\nDeleting column '${targetCol}' from '${targetTable}'...`,
               ),
            );
            const res = await applySchemaChanges(adapter, dbConfig.type, {
               tableName: targetTable,
               pendingDeletes: [targetCol],
            });
            if (res.success) {
               console.log(
                  pc.green(`✓ Column '${targetCol}' deleted successfully.`),
               );
            } else {
               console.log(pc.red(`✘ Error deleting column: ${res.error}`));
            }
         }
      }
   } catch (e: any) {
      console.log(pc.red(`Error: ${e.message}`));
   } finally {
      await adapter.close();
   }
}
