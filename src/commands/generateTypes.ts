import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   generateTypeScriptDefinitions,
   TableSchemaInfo,
} from '../logic/index.js';
import fs from 'fs/promises';
import path from 'path';

export async function runGenerateTypesCommand(dbConfig: DBConfig) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.red('Error: No database connection found. Cannot generate types.'),
      );
      process.exit(1);
   }

   const adapter = createDBAdapter(dbConfig as any);
   console.log(
      pc.cyan(`\nScanning database to generate TypeScript interfaces...`),
   );

   try {
      const allTables = await adapter.getTables();

      if (allTables.length === 0) {
         console.log(pc.yellow('No tables found in the database.'));
         process.exit(0);
      }

      const tableInfos: TableSchemaInfo[] = [];
      for (const table of allTables) {
         const columns = await adapter.getSchema(table);
         tableInfos.push({ tableName: table, columns });
      }

      const tsCode = generateTypeScriptDefinitions(tableInfos, dbConfig.type);

      const outPath = path.resolve(process.cwd(), 'drixio-types.d.ts');
      await fs.writeFile(outPath, tsCode, 'utf-8');

      console.log(pc.green(`✔ TypeScript interfaces generated successfully!`));
      console.log(pc.white(`Output saved to: ${pc.bold(outPath)}`));
   } catch (e: any) {
      console.log(pc.red(`\n✘ Failed to generate types: ${e.message}`));
   } finally {
      await adapter.close();
   }

   process.exit(0);
}
