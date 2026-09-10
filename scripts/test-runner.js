import pc from 'picocolors';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

let drixioVersion = '0.0.0';
try {
   const pkgPath = path.resolve(process.cwd(), 'package.json');
   const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
   if (pkg.version) drixioVersion = pkg.version;
} catch {}

const detectedEnvDb =
   process.env.DATABASE_URL ||
   process.env.DB_URL ||
   process.env.POSTGRES_URL ||
   process.env.MYSQL_URL ||
   'None (Isolated in-memory & local fallback)';

const platformStr = `${os.platform()} (${os.arch()}) ${os.release()}`;
const nodeVersion = process.version;
const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

function stripAnsi(str) {
   return str.replace(/\u001b\[[0-9;]*m/g, '');
}

const INNER_WIDTH = 71;

function makeCenterRow(text) {
   const visibleLen = stripAnsi(text).length;
   const totalPad = Math.max(0, INNER_WIDTH - visibleLen);
   const leftPad = ' '.repeat(Math.floor(totalPad / 2));
   const rightPad = ' '.repeat(totalPad - leftPad.length);
   return pc.cyan('║') + leftPad + text + rightPad + pc.cyan('║');
}

function printRow(label, styledValue) {
   const labelPart = `  ${label}`.padEnd(22);
   const visibleLen = labelPart.length + 2 + stripAnsi(styledValue).length;
   const padding = ' '.repeat(Math.max(0, INNER_WIDTH - visibleLen));
   console.log(
      pc.cyan('║') +
         pc.bold(labelPart) +
         ': ' +
         styledValue +
         padding +
         pc.cyan('║'),
   );
}

console.log('');
console.log(pc.cyan('╔' + '═'.repeat(INNER_WIDTH) + '╗'));
console.log(
   makeCenterRow(
      pc.bold(pc.white('DRIXIO UNIFIED TEST SUITE & DIAGNOSTIC ENVIRONMENT')),
   ),
);
console.log(pc.cyan('╠' + '═'.repeat(INNER_WIDTH) + '╣'));
printRow('Drixio Version', pc.green(`v${drixioVersion}`));
printRow('Node.js Runtime', pc.yellow(nodeVersion));
printRow('OS Platform', pc.white(platformStr));
printRow(
   'Primary DB Driver',
   pc.magenta('SQLite (:memory: & Universal DB Adapter)'),
);
const shortEnv =
   detectedEnvDb.length > 44
      ? detectedEnvDb.slice(0, 41) + '...'
      : detectedEnvDb;
printRow('Detected Env DB', pc.dim(shortEnv));
printRow('Test Executed At', pc.gray(timestamp));
console.log(pc.cyan('╚' + '═'.repeat(INNER_WIDTH) + '╝'));
console.log('');

// Run vitest passing through any extra CLI args
const extraArgs = process.argv.slice(2).join(' ');
const cmd = `npx vitest run ${extraArgs}`.trim();
const child = spawn(cmd, {
   stdio: 'inherit',
   shell: true,
   env: {
      ...process.env,
      DRIXIO_DIAG_PRINTED: '1',
   },
});

child.on('close', (code) => {
   process.exit(code || 0);
});
