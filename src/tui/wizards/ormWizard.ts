import { select, confirm, input } from '@inquirer/prompts';
import fs from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   getTableSchemas,
   generatePrismaSchema,
   generateDrizzleSchema,
   generateTypeScriptDefinitions,
} from '../../logic/index.js';

export async function runOrmWizard(dbConfig: DBConfig) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.yellow(
            '\nNo database connection found. Please setup database first.',
         ),
      );
      return;
   }

   const adapter = createDBAdapter(dbConfig as any);

   try {
      const allSchemasRes = await getTableSchemas(adapter, undefined, true);
      if (!allSchemasRes.success) {
         console.log(
            pc.red(`\n✘ Failed to inspect schema: ${allSchemasRes.error}`),
         );
         return;
      }

      const allTables = allSchemasRes.data;
      if (allTables.length === 0) {
         console.log(pc.yellow('\nNo tables found in this database.'));
         return;
      }

      console.log(pc.cyan('\n--- Modern ORM & Type Definition Generator ---'));
      console.log(
         pc.dim(
            'Generate production-ready Prisma, Drizzle, or TypeScript definitions.\n',
         ),
      );

      const targetFormat = await select({
         message: 'Select target ORM or definition format:',
         choices: [
            {
               name: 'Prisma Schema (schema.prisma)',
               value: 'prisma',
               description: 'Standard Prisma models with data source and generator',
            },
            {
               name: 'Drizzle ORM (schema.ts)',
               value: 'drizzle',
               description: 'Type-safe Drizzle table definitions with core packages',
            },
            {
               name: 'TypeScript Interfaces (drixio-types.d.ts)',
               value: 'types',
               description: 'Pure TypeScript interface definitions for database records',
            },
         ],
      });

      const scope = await select({
         message: 'Select generation scope:',
         choices: [
            {
               name: `All Tables (${allTables.length} tables)`,
               value: 'all',
            },
            {
               name: 'Single Table',
               value: 'single',
            },
         ],
      });

      let selectedTables = allTables;
      if (scope === 'single') {
         const chosenTableName = await select({
            message: 'Select table to generate code for:',
            choices: allTables.map((t) => ({
               name: t.tableName,
               value: t.tableName,
            })),
         });
         selectedTables = allTables.filter((t) => t.tableName === chosenTableName);
      }

      let generatedCode = '';
      let defaultFileName = 'schema.ts';

      if (targetFormat === 'prisma') {
         generatedCode = generatePrismaSchema(selectedTables, dbConfig.type);
         defaultFileName = 'schema.prisma';
      } else if (targetFormat === 'drizzle') {
         generatedCode = generateDrizzleSchema(selectedTables, dbConfig.type);
         defaultFileName = 'schema.ts';
      } else {
         generatedCode = generateTypeScriptDefinitions(selectedTables, dbConfig.type);
         defaultFileName = 'drixio-types.d.ts';
      }

      const outputAction = await select({
         message: 'What would you like to do with the generated code?',
         choices: [
            {
               name: `Save to file (${defaultFileName})`,
               value: 'save',
            },
            {
               name: 'Print directly to terminal',
               value: 'print',
            },
         ],
      });

      if (outputAction === 'print') {
         console.log(pc.bold(pc.cyan(`\n--- Generated Code ---`)));
         console.log(generatedCode);
         console.log(pc.bold(pc.cyan(`----------------------\n`)));
      } else {
         const outPath = await input({
            message: 'Enter destination file path:',
            default: defaultFileName,
         });

         const resolvedPath = path.resolve(process.cwd(), outPath);
         await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
         await fs.writeFile(resolvedPath, generatedCode, 'utf-8');

         console.log(
            pc.green(
               `\n✔ Successfully generated and saved to: ${pc.bold(resolvedPath)}`,
            ),
         );
      }
   } catch (e: any) {
      console.log(pc.red(`\n✘ Code generation failed: ${e.message}`));
   } finally {
      await adapter.close();
   }
}

