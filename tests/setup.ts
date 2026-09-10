import { beforeAll } from 'vitest';
import pc from 'picocolors';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

function stripAnsi(str: string): string {
   return str.replace(/\u001b\[[0-9;]*m/g, '');
}

beforeAll(() => {
   // Prevent duplicate diagnostic output if already rendered
   if (process.env.DRIXIO_DIAG_PRINTED === '1') {
      return;
   }
   process.env.DRIXIO_DIAG_PRINTED = '1';

   let drixioVersion = '1.1.9';
   try {
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.version) drixioVersion = pkg.version;
   } catch {
      // Fallback
   }

   const detectedEnvDb =
      process.env.DATABASE_URL ||
      process.env.DB_URL ||
      process.env.POSTGRES_URL ||
      process.env.MYSQL_URL ||
      'None (Isolated in-memory test suite)';

   const platformStr = `${os.platform()} (${os.arch()}) ${os.release()}`;
   const nodeVersion = process.version;
   const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

   const INNER_WIDTH = 71;

   function makeCenterRow(text: string): string {
      const visibleLen = stripAnsi(text).length;
      const totalPad = Math.max(0, INNER_WIDTH - visibleLen);
      const leftPad = ' '.repeat(Math.floor(totalPad / 2));
      const rightPad = ' '.repeat(totalPad - leftPad.length);
      return pc.cyan('║') + leftPad + text + rightPad + pc.cyan('║');
   }

   function makeDetailRow(label: string, styledValue: string): string {
      const labelPart = `  ${label}`.padEnd(22);
      const visibleLen = labelPart.length + 2 + stripAnsi(styledValue).length;
      const pad = ' '.repeat(Math.max(0, INNER_WIDTH - visibleLen));
      return (
         pc.cyan('║') +
         pc.bold(labelPart) +
         ': ' +
         styledValue +
         pad +
         pc.cyan('║')
      );
   }

   const shortEnv =
      detectedEnvDb.length > 44
         ? detectedEnvDb.slice(0, 41) + '...'
         : detectedEnvDb;

   console.log('');
   console.log(pc.cyan('╔' + '═'.repeat(INNER_WIDTH) + '╗'));
   console.log(
      makeCenterRow(
         pc.bold(
            pc.white('DRIXIO UNIFIED TEST SUITE & DIAGNOSTIC ENVIRONMENT'),
         ),
      ),
   );
   console.log(pc.cyan('╠' + '═'.repeat(INNER_WIDTH) + '╣'));
   console.log(makeDetailRow('Drixio Version', pc.green(`v${drixioVersion}`)));
   console.log(makeDetailRow('Node.js Runtime', pc.yellow(nodeVersion)));
   console.log(makeDetailRow('OS Platform', pc.white(platformStr)));
   console.log(
      makeDetailRow(
         'Primary DB Driver',
         pc.magenta('SQLite (:memory: & Universal DB Adapter)'),
      ),
   );
   console.log(makeDetailRow('Detected Env DB', pc.dim(shortEnv)));
   console.log(makeDetailRow('Test Executed At', pc.gray(timestamp)));
   console.log(pc.cyan('╚' + '═'.repeat(INNER_WIDTH) + '╝'));
   console.log('');
});
