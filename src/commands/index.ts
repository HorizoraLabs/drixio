import { DBConfig } from '../logic/index.js';
import { runQueryCommand } from './query.js';
import { runExportCommand } from './export.js';
import { runImportCommand } from './import.js';
import { runSeedCommand } from './seed.js';
import { runTruncateCommand } from './truncate.js';
import { runExecCommand } from './exec.js';
import { runBackupCommand } from './backup.js';
import { runRestoreCommand } from './restore.js';
import { runDiagramCommand } from './diagram.js';
import { runGenerateTypesCommand } from './generateTypes.js';
import { runGenerateOrmCommand } from './generateOrm.js';
import { runInitCommand } from './init.js';
import { runDropDbCommand } from './drop.js';
import { runTablesCommand } from './tables.js';
import { runDescribeCommand } from './describe.js';
import { runDiffCommand } from './diff.js';
import { runSnippetsCommand, runRunCommand } from './snippets.js';

export {
   runQueryCommand,
   runExportCommand,
   runImportCommand,
   runSeedCommand,
   runTruncateCommand,
   runExecCommand,
   runBackupCommand,
   runRestoreCommand,
   runDiagramCommand,
   runGenerateTypesCommand,
   runGenerateOrmCommand,
   runInitCommand,
   runDropDbCommand,
   runTablesCommand,
   runDescribeCommand,
   runDiffCommand,
   runSnippetsCommand,
   runRunCommand,
};

export async function runQuickCommand(
   command: string,
   args: string[],
   options: Record<string, any>,
   dbConfig: DBConfig,
): Promise<boolean> {
   switch (command) {
      case 'tables':
      case 'ls':
         await runTablesCommand(dbConfig, options);
         return true;
      case 'describe':
      case 'desc':
         await runDescribeCommand(dbConfig, args, options);
         return true;
      case 'query':
         await runQueryCommand(dbConfig, args);
         return true;
      case 'export':
         await runExportCommand(dbConfig, args, options);
         return true;
      case 'import':
         await runImportCommand(dbConfig, args, options);
         return true;
      case 'seed':
      case 'mock':
         await runSeedCommand(dbConfig, args);
         return true;
      case 'truncate':
         await runTruncateCommand(dbConfig, args);
         return true;
      case 'backup':
         await runBackupCommand(dbConfig);
         return true;
      case 'restore':
         await runRestoreCommand(dbConfig, args, options);
         return true;
      case 'exec':
         await runExecCommand(dbConfig, args);
         return true;
      case 'diagram':
         await runDiagramCommand(dbConfig);
         return true;
      case 'generate-types':
         await runGenerateTypesCommand(dbConfig);
         return true;
      case 'generate-orm':
      case 'orm':
         await runGenerateOrmCommand(dbConfig, {
            target: args[0] as any,
            table: options.table,
            out: options.out,
            print: options.print,
         });
         return true;
      case 'init':
         await runInitCommand(args);
         return true;
      case 'drop-db':
         await runDropDbCommand(args);
         return true;
      case 'diff':
         await runDiffCommand(dbConfig, args, options);
         return true;
      case 'snippets':
      case 'snip':
         await runSnippetsCommand(args, options);
         return true;
      case 'run':
         await runRunCommand(dbConfig, args, options);
         return true;
      default:
         return false;
   }
}
