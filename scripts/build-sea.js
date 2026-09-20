#!/usr/bin/env node

/**
 * Node.js Single Executable Application (SEA) Builder for Drixio
 * Generates a standalone, zero-dependency executable that runs without Node.js installed.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const CLI_PATH = path.join(DIST, 'cli.js');
const SEA_CONFIG = path.join(DIST, 'sea-config.json');
const SEA_BLOB = path.join(DIST, 'sea-prep.blob');

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const outExeName = isWindows ? 'drixio.exe' : 'drixio';
const OUT_EXE = path.join(DIST, outExeName);

async function main() {
   console.log(pc.bold(pc.cyan('\n🚀 Drixio Single Executable Application (SEA) Builder\n')));

   // 1. Check/build cli.js
   if (!fs.existsSync(CLI_PATH)) {
      console.log(pc.yellow('➜ dist/cli.js not found, building CLI...'));
      execSync('pnpm build:cli', { stdio: 'inherit' });
   }

   // 2. Create sea-config.json
   console.log(pc.cyan('1. Generating SEA configuration...'));
   const configContent = JSON.stringify(
      {
         main: 'dist/cli.js',
         output: 'dist/sea-prep.blob',
         disableExperimentalSEAWarning: true,
      },
      null,
      2,
   );
   fs.writeFileSync(SEA_CONFIG, configContent, 'utf-8');

   // 3. Generate blob
   console.log(pc.cyan('2. Compiling bytecode blob with Node SEA...'));
   execSync('node --experimental-sea-config dist/sea-config.json', {
      stdio: 'inherit',
   });

   // 4. Copy node binary
   console.log(pc.cyan(`3. Preparing standalone binary target (${outExeName})...`));
   const nodePath = process.execPath;
   fs.copyFileSync(nodePath, OUT_EXE);

   // 5. Inject blob using postject
   console.log(pc.cyan('4. Injecting bytecode blob into executable payload...'));
   const darwinFlag = isMac ? '--macho-segment-name NODE_SEA ' : '';
   const postjectCmd = `npx -y postject "${OUT_EXE}" NODE_SEA_BLOB "${SEA_BLOB}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 ${darwinFlag}`;
   
   try {
      execSync(postjectCmd, { stdio: 'inherit' });
   } catch (err) {
      console.warn(
         pc.yellow(
            '⚠️  postject injection note: If code-signing is required, executable may require signing removal before injection.',
         ),
      );
      throw err;
   }

   // 6. Cleanup temporary build files
   if (fs.existsSync(SEA_CONFIG)) fs.unlinkSync(SEA_CONFIG);
   if (fs.existsSync(SEA_BLOB)) fs.unlinkSync(SEA_BLOB);

   const stats = fs.statSync(OUT_EXE);
   const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

   console.log(pc.green(pc.bold(`\n✓ Standalone binary created successfully!`)));
   console.log(pc.dim(`  Path: ${OUT_EXE}`));
   console.log(pc.dim(`  Size: ${sizeMB} MB (Fully self-contained, no Node.js needed)\n`));
   console.log(pc.cyan(`You can now copy ${outExeName} anywhere or add it to PATH to run directly!\n`));
}

main().catch((err) => {
   console.error(pc.red(`\n❌ SEA Build failed: ${err.message}`));
   process.exit(1);
});

