import { select, input } from '@inquirer/prompts';
import pc from 'picocolors';
import {
   detectDatabase,
   saveDatabaseUrl,
   DBConfig,
   createDBAdapter,
} from '../../logic/index.js';

export async function runSetup(currentConfig: DBConfig): Promise<DBConfig> {
   const setupMethod = await select({
      message: 'What method you want to use to setup database connection?',
      choices: [
         {
            name: ' Auto-Config',
            value: 'auto',
            description:
               'Automatically detect and setup database connection (May fail for some cases).',
         },
         {
            name: ' Manual Config',
            value: 'manual',
            description:
               'Manually setup database connection by entering parameters step by step.',
         },
      ],
   });

   let newConfig = currentConfig;

   switch (setupMethod) {
      case 'auto':
         const retryConfig = await detectDatabase();
         if (retryConfig.type !== 'unknown') {
            newConfig = retryConfig;
            console.log(pc.green('\nDatabase connection setup successfully.'));
         } else {
            console.log(
               pc.red(
                  '\nFailed to auto-detect database connection. Please try manual configuration.',
               ),
            );
         }
         break;
      case 'manual':
         const databaseUrl = await input({
            message: 'Enter the database connection URL: ',
         });
         if (databaseUrl) {
            const tempConfig = await detectDatabase(databaseUrl);
            console.log(pc.dim('\nTesting connection...'));
            try {
               const adapter = createDBAdapter(tempConfig as any);
               await adapter.getTables();
               await adapter.close();

               newConfig = tempConfig;
               await saveDatabaseUrl(databaseUrl);
               console.log(
                  pc.green(
                     '✓ Database connection setup successfully and saved to .env!',
                  ),
               );
            } catch (e: any) {
               console.log(
                  pc.red(
                     `\nx Connection failed: ${e.message}\nPlease enter a valid database URL or check your database status.`,
                  ),
               );
            }
         } else {
            console.log(
               pc.red(
                  '\nFailed to detect database connection. Please enter valid database URL.',
               ),
            );
         }
         break;
   }

   return newConfig;
}
