import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   executeDatabaseScript,
} from '../logic/index.js';
import fs from 'fs/promises';
import path from 'path';

export async function runExecCommand(dbConfig: DBConfig, args: string[]) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.red('Error: No database connection found. Cannot run exec.'),
      );
      process.exit(1);
   }

   let filePath = args[0];
   const { input } = await import('@inquirer/prompts');

   if (!filePath) {
      filePath = await input({ message: 'Enter the path to your .sql file:' });
   }

   const resolvedPath = path.resolve(process.cwd(), filePath);

   try {
      await fs.access(resolvedPath);
   } catch {
      console.log(pc.red(`Error: File not found at ${resolvedPath}`));
      process.exit(1);
   }

   const sqlContent = await fs.readFile(resolvedPath, 'utf-8');
   if (!sqlContent.trim()) {
      console.log(pc.yellow('File is empty.'));
      process.exit(0);
   }

   const adapter = createDBAdapter(dbConfig as any);
   console.log(pc.cyan(`\nExecuting SQL script from ${filePath}...`));

   try {
      await executeDatabaseScript(adapter, sqlContent);
      console.log(pc.green(`✔ Script executed successfully!`));
      const res = await executeDatabaseScript(adapter, sqlContent);
      if (!res.success) {
         console.log(pc.red(`✘ Execution failed: ${res.error}`));
      } else {
         console.log(pc.green(`✔ Script executed successfully!`));
      }
   } catch (e: any) {
      console.log(pc.red(`✘ Execution failed: ${e.message}`));
   } finally {
      await adapter.close();
   }

   process.exit(0);
}
