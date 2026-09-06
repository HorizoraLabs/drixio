import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   generatePrismaSchema,
   generateDrizzleSchema,
   TableSchemaInfo,
} from '../logic/index.js';
import fs from 'fs/promises';
import path from 'path';

export interface GenerateOrmOptions {
   target?: 'prisma' | 'drizzle';
   table?: string;
   out?: string;
   print?: boolean;
}

export async function runGenerateOrmCommand(
   dbConfig: DBConfig,
   options: GenerateOrmOptions = {},
) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.red(
            'Error: No database connection found. Cannot generate ORM schema.',
         ),
      );
      process.exit(1);
   }

   const target = (options.target || 'prisma').toLowerCase() as
      | 'prisma'
      | 'drizzle';
   if (target !== 'prisma' && target !== 'drizzle') {
      console.log(
         pc.red(
            `Error: Unsupported ORM target "${target}". Supported targets: "prisma", "drizzle".`,
         ),
      );
      process.exit(1);
   }

   const adapter = createDBAdapter(dbConfig as any);
   console.log(
      pc.cyan(
         `\nScanning database to generate ${target === 'prisma' ? 'Prisma' : 'Drizzle'} schema...`,
      ),
   );

   try {
      const allTables = await adapter.getTables();
      if (allTables.length === 0) {
         console.log(pc.yellow('No tables found in the database.'));
         process.exit(0);
      }

      const targetTables = options.table
         ? allTables.filter(
              (t) => t.toLowerCase() === options.table!.toLowerCase(),
           )
         : allTables;

      if (targetTables.length === 0 && options.table) {
         console.log(pc.red(`Table "${options.table}" not found in database.`));
         process.exit(1);
      }

      const schemaInfos: TableSchemaInfo[] = [];
      for (const table of targetTables) {
         const cols = await adapter.getSchema(table);
         schemaInfos.push({ tableName: table, columns: cols });
      }

      let generatedCode = '';
      let defaultFileName = '';

      if (target === 'drizzle') {
         generatedCode = generateDrizzleSchema(schemaInfos, dbConfig.type);
         defaultFileName = 'schema.ts';
      } else {
         generatedCode = generatePrismaSchema(schemaInfos, dbConfig.type);
         defaultFileName = 'schema.prisma';
      }

      if (options.print) {
         console.log('\n' + generatedCode);
      } else {
         const outPath = path.resolve(
            process.cwd(),
            options.out || defaultFileName,
         );
         await fs.writeFile(outPath, generatedCode, 'utf-8');

         console.log(
            pc.green(
               `✔ ${target === 'prisma' ? 'Prisma' : 'Drizzle'} schema generated successfully!`,
            ),
         );
         console.log(pc.white(`Output saved to: ${pc.bold(outPath)}`));
      }
   } catch (e: any) {
      console.log(pc.red(`\n✘ Failed to generate ORM schema: ${e.message}`));
   } finally {
      await adapter.close();
   }

   process.exit(0);
}
