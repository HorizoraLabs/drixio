import { DBConfig } from '../logic/index.js';
import { runQueryCommand } from './query.js';
import { runExportCommand } from './export.js';
import { runImportCommand } from './import.js';
import { runSeedCommand } from './seed.js';
import { runTruncateCommand } from './truncate.js';
import { runExecCommand } from './exec.js';
import { runBackupCommand } from './backup.js';
import { runDiagramCommand } from './diagram.js';
import { runGenerateTypesCommand } from './generateTypes.js';
import { runInitCommand } from './init.js';
import { runDropDbCommand } from './drop.js';

export {
   runQueryCommand,
   runExportCommand,
   runImportCommand,
   runSeedCommand,
   runTruncateCommand,
   runExecCommand,
   runBackupCommand,
   runDiagramCommand,
   runGenerateTypesCommand,
   runInitCommand,
   runDropDbCommand,
};

export async function runQuickCommand(
   command: string,
   args: string[],
   options: Record<string, any>,
   dbConfig: DBConfig,
): Promise<boolean> {
   switch (command) {
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
      case 'exec':
         await runExecCommand(dbConfig, args);
         return true;
      case 'diagram':
         await runDiagramCommand(dbConfig);
         return true;
      case 'generate-types':
         await runGenerateTypesCommand(dbConfig);
         return true;
      case 'init':
         await runInitCommand(args);
         return true;
      case 'drop-db':
         await runDropDbCommand(args);
         return true;
      default:
         return false;
   }
}
