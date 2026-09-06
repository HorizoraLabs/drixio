import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   generateAndInsertMockData,
} from '../logic/index.js';

export async function runSeedCommand(dbConfig: DBConfig, args: string[]) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.red('Error: No database connection found. Cannot run seed.'),
      );
      process.exit(1);
   }

   const adapter = createDBAdapter(dbConfig);
   let tableName = args[0];
   let countStr = args[1];

   const { input, select } = await import('@inquirer/prompts');

   if (!tableName) {
      const allTables = await adapter.getTables();
      if (allTables.length === 0) {
         console.log(
            pc.yellow('No tables found. Please create a table first.'),
         );
         process.exit(1);
      }
      tableName = await select({
         message: 'Which table do you want to seed with realistic fake data?',
         choices: allTables.map((t) => ({ name: t, value: t })),
      });
   }

   let count = parseInt(countStr);
   if (isNaN(count) || count <= 0) {
      const res = await input({
         message: 'How many rows to generate?',
         default: '50',
      });
      count = parseInt(res);
      if (isNaN(count) || count <= 0) {
         console.log(pc.red('Error: Invalid count number.'));
         process.exit(1);
      }
   }

   console.log(
      pc.cyan(`\nAnalyzing schema & foreign keys for table '${tableName}'...`),
   );

   try {
      const seedRes = await generateAndInsertMockData(
         adapter,
         tableName,
         count,
         (current, total) => {
            process.stdout.write(
               `\r${pc.dim(`Progress: ${current} / ${total}`)}`,
            );
         },
      );

      if (!seedRes.success) {
         console.log(pc.red(`\n\n✘ Seed failed: ${seedRes.error}`));
      } else {
         console.log(
            pc.green(
               `\n\n✔ Successfully generated and seeded ${seedRes.data.insertedCount} realistic records into ${tableName}!`,
            ),
         );
      }
   } catch (e: any) {
      console.log(pc.red(`\n✘ Seed failed: ${e.message}`));
   } finally {
      await adapter.close();
   }

   process.exit(0);
}
