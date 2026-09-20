import pc from 'picocolors';
import { dropDatabase } from '../logic/index.js';

export async function runDropDbCommand(args: string[]) {
   const { select, input, password, confirm } =
      await import('@inquirer/prompts');

   let dialect = args[0];
   if (
      !dialect ||
      !['sqlite', 'mysql', 'postgres', 'mssql', 'mongodb'].includes(
         dialect.toLowerCase(),
      )
   ) {
      dialect = await select({
         message: 'Which database type do you want to drop?',
         choices: [
            { name: 'SQLite (Local File)', value: 'sqlite' },
            { name: 'MySQL (Local Server)', value: 'mysql' },
            { name: 'PostgreSQL (Local Server)', value: 'postgres' },
            { name: 'Microsoft SQL Server (Local/Docker)', value: 'mssql' },
            { name: 'MongoDB (NoSQL Document)', value: 'mongodb' },
         ],
      });
   }

   dialect = dialect.toLowerCase();

   let dbName = args[1];

   if (dialect === 'sqlite') {
      if (!dbName) {
         dbName = await input({
            message:
               'Enter the SQLite filename to delete (e.g. database.sqlite):',
            default: 'database.sqlite',
         });
      }

      const sure = await confirm({
         message: `Are you absolutely sure you want to delete ${dbName}? This cannot be undone!`,
         default: false,
      });
      if (!sure) {
         console.log(pc.yellow('Aborted.'));
         process.exit(0);
      }

      try {
         const result = await dropDatabase({ dialect: 'sqlite', dbName });
         if (!result.success) {
            console.log(pc.red(`✘ Failed to delete file: ${result.error}`));
            process.exit(1);
         }
         console.log(pc.green(`✔ ${result.data.message}`));
      } catch (e: any) {
         console.log(pc.red(`✘ Failed to delete file: ${e.message}`));
         process.exit(1);
      }
   } else {
      // MySQL, Postgres, MSSQL, or MongoDB
      console.log(
         pc.dim(
            `Please provide credentials for your local ${dialect} server to drop a database.`,
         ),
      );

      const defaultPort =
         dialect === 'mysql'
            ? '3306'
            : dialect === 'mssql'
              ? '1433'
              : dialect === 'mongodb'
                ? '27017'
                : '5432';

      const defaultUser =
         dialect === 'mysql'
            ? 'root'
            : dialect === 'mssql'
              ? 'sa'
              : dialect === 'mongodb'
                ? ''
                : 'postgres';

      const host = await input({
         message: 'Server Host:',
         default: 'localhost',
      });
      const port = await input({
         message: 'Server Port:',
         default: defaultPort,
      });
      const user = await input({
         message: 'Username:',
         default: defaultUser,
      });
      const pass = await password({
         message: 'Password (leave empty if none):',
      });

      if (!dbName) {
         dbName = await input({
            message: 'Which Database Name do you want to DROP?',
         });
      }

      const sure = await confirm({
         message: `Are you absolutely sure you want to DROP DATABASE '${dbName}' from ${host}? All data will be lost!`,
         default: false,
      });
      if (!sure) {
         console.log(pc.yellow('Aborted.'));
         process.exit(0);
      }

      console.log(
         pc.cyan(
            `\nConnecting to local server to drop database '${dbName}'...`,
         ),
      );

      try {
         const result = await dropDatabase({
            dialect: dialect as 'mysql' | 'postgres',
            dbName,
            host,
            port,
            user,
            password: pass,
         });
         if (!result.success) {
            console.log(
               pc.red(`✘ Failed to drop database on server: ${result.error}`),
            );
            process.exit(1);
         }
         console.log(pc.green(`✔ ${result.data.message}`));
      } catch (e: any) {
         console.log(
            pc.red(`✘ Failed to drop database on server: ${e.message}`),
         );
         process.exit(1);
      }
   }

   process.exit(0);
}
