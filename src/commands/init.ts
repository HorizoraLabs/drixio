import pc from 'picocolors';
import { createDatabase, saveDatabaseUrl } from '../logic/index.js';

export async function runInitCommand(args: string[]) {
   const { select, input, password } = await import('@inquirer/prompts');

   let dialect = args[0];
   if (
      !dialect ||
      !['sqlite', 'mysql', 'postgres'].includes(dialect.toLowerCase())
   ) {
      dialect = await select({
         message: 'Which database do you want to initialize locally?',
         choices: [
            { name: 'SQLite (Local File)', value: 'sqlite' },
            { name: 'MySQL (Local Server)', value: 'mysql' },
            { name: 'PostgreSQL (Local Server)', value: 'postgres' },
         ],
      });
   }

   dialect = dialect.toLowerCase();
   console.log(pc.cyan(`\nInitializing a local ${dialect} database...`));

   let dbUrl = '';

   if (dialect === 'sqlite') {
      const dbName = args[1] || 'database.sqlite';
      try {
         const result = await createDatabase({
            dialect: 'sqlite',
            dbName,
         });
         if (!result.success) {
            console.log(
               pc.red(
                  `✘ Failed to initialize SQLite database: ${result.error}`,
               ),
            );
            process.exit(1);
         }
         dbUrl = result.data.targetUrl;
         console.log(
            pc.green(
               `✔ Created/verified local database file: ${result.data.dbName}.sqlite`,
            ),
         );
      } catch (e: any) {
         console.log(
            pc.red(`✘ Failed to initialize SQLite database: ${e.message}`),
         );
         process.exit(1);
      }
   } else {
      // MySQL or Postgres
      console.log(
         pc.dim(
            'Please provide credentials for your local server (e.g. running via XAMPP, Homebrew, etc.)',
         ),
      );

      const host = await input({
         message: 'Server Host:',
         default: 'localhost',
      });
      const port = await input({
         message: 'Server Port:',
         default: dialect === 'mysql' ? '3306' : '5432',
      });
      const user = await input({
         message: 'Username:',
         default: dialect === 'mysql' ? 'root' : 'postgres',
      });
      const pass = await password({
         message: 'Password (leave empty if none):',
      });
      let dbName = args[1];
      if (!dbName) {
         dbName = await input({
            message: 'New Database Name (e.g. my_project):',
         });
      }

      console.log(
         pc.cyan(
            `\nConnecting to local server to create database '${dbName}'...`,
         ),
      );

      try {
         const result = await createDatabase({
            dialect: dialect as 'mysql' | 'postgres',
            dbName,
            host,
            port,
            user,
            password: pass,
         });

         if (!result.success) {
            console.log(
               pc.red(`✘ Failed to create database on server: ${result.error}`),
            );
            console.log(
               pc.dim(
                  `\nCould not connect to the local ${dialect} server on ${host}:${port}.`,
               ),
            );

            const errStr = result.error || '';
            if (
               (result as any).code === 'ECONNREFUSED' ||
               errStr.includes('ECONNREFUSED') ||
               errStr.includes('connect')
            ) {
               console.log(
                  pc.yellow(
                     `\n💡 It seems you don't have ${dialect} installed or running locally.`,
                  ),
               );
               if (dialect === 'mysql') {
                  console.log(
                     pc.white(
                        `👉 Download MySQL here: ${pc.cyan('https://dev.mysql.com/downloads/installer/')}`,
                     ),
                  );
               } else if (dialect === 'postgres') {
                  console.log(
                     pc.white(
                        `👉 Download PostgreSQL here: ${pc.cyan('https://www.postgresql.org/download/')}`,
                     ),
                  );
                  console.log(
                     pc.white(
                        `👉 Or use Postgres.app for Mac: ${pc.cyan('https://postgresapp.com/')}`,
                     ),
                  );
               }
               console.log(
                  pc.dim(
                     `(Alternatively, you can run 'drixio init sqlite' for a zero-install local database!)`,
                  ),
               );
            }
            process.exit(1);
         }

         dbUrl = result.data.targetUrl;
         console.log(
            pc.green(`✔ Created local database: ${result.data.dbName}`),
         );
      } catch (e: any) {
         console.log(
            pc.red(`✘ Failed to create database on server: ${e.message}`),
         );
         process.exit(1);
      }
   }

   // Update .env file
   const envRes = await saveDatabaseUrl(dbUrl);
   if (envRes.success) {
      console.log(pc.green(`✔ Saved connection string to .env file`));
   } else {
      console.log(pc.yellow(`⚠️  Could not save to .env: ${envRes.error}`));
   }

   console.log(pc.green(`\n🎉 Initialization Complete!`));
   console.log(
      pc.white(`You can now run ${pc.bold('npx drixio')} to manage it!`),
   );

   process.exit(0);
}
