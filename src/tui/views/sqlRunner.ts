import fs from 'node:fs/promises';
import path from 'node:path';
import { input } from '@inquirer/prompts';
import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   executeDatabaseScript,
} from '../../logic/index.js';

export async function runSqlRunner(dbConfig: DBConfig) {
   console.log(
      pc.green(
         '\nInitiating SQL runner for experts. Please ensure database connection is properly configured.',
      ),
   );
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.yellow(`\nNo database connection found. Please setup first.`),
      );
      return;
   }

   try {
      const filePath = await input({
         message: 'Enter the path to your .md or .sql file:',
      });

      if (filePath && filePath.trim()) {
         const absolutePath = path.resolve(process.cwd(), filePath.trim());
         let fileContent = '';
         try {
            fileContent = await fs.readFile(absolutePath, 'utf-8');
         } catch (err: any) {
            console.log(pc.red(`\nx Failed to read file: ${err.message}`));
            return;
         }

         let sqlToExecute = fileContent;
         if (absolutePath.toLowerCase().endsWith('.md')) {
            const matches = [
               ...fileContent.matchAll(/```(?:sql)?\n([\s\S]*?)```/gi),
            ];
            if (matches.length > 0) {
               sqlToExecute = matches.map((m) => m[1].trim()).join('\n\n');
            }
         }

         if (sqlToExecute.trim()) {
            console.log(pc.dim('Executing SQL...'));
            const adapter = createDBAdapter(dbConfig as any);
            try {
               await adapter.executeSql(sqlToExecute);
               console.log(pc.green('\n✓ SQL executed successfully!'));
            } finally {
               await adapter.close();
            }
         } else {
            console.log(pc.yellow('\n⚠️  No SQL found in the file. Aborted.'));
         }
      } else {
         console.log(pc.yellow('\nNo file path entered. Aborted.'));
      }
   } catch (e: any) {
      console.log(pc.red(`\nError executing SQL: ${e.message}`));
   }
}
