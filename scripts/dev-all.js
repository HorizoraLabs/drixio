#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';
import pc from 'picocolors';

console.log(pc.bold(pc.cyan('\n🚀 Launching Drixio Full-Stack Dev Environment...\n')));
console.log(`  ${pc.bold('Backend API')} : ${pc.yellow('http://localhost:51213')} (Hono + tsx watch)`);
console.log(`  ${pc.bold('Frontend SPA')} : ${pc.green('http://localhost:51214')} (Vite Dev Server + HMR)`);
console.log(pc.dim('\nPress Ctrl+C to terminate both servers.\n'));

const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

// 1. Start Backend API Server with watch mode
const apiProcess = spawn(
   npxCmd,
   ['tsx', 'watch', 'bin/cli.ts', 'studio'],
   {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
         ...process.env,
         PORT: '51213',
         DRIXIO_NO_OPEN: '1',
      },
      shell: isWin,
   },
);

// 2. Start Frontend Vite Dev Server
const viteProcess = spawn(
   npxCmd,
   ['vite', '--config', 'studio/vite.config.ts', '--port', '51214', '--open'],
   {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
         ...process.env,
      },
      shell: isWin,
   },
);

function pipeWithPrefix(stream, prefix, colorFn) {
   if (!stream) return;
   let buffer = '';
   stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
         if (line.trim()) {
            console.log(`${colorFn(prefix)} ${line}`);
         }
      }
   });
}

pipeWithPrefix(apiProcess.stdout, '[API] ', pc.cyan);
pipeWithPrefix(apiProcess.stderr, '[API] ', pc.red);
pipeWithPrefix(viteProcess.stdout, '[VITE]', pc.green);
pipeWithPrefix(viteProcess.stderr, '[VITE]', pc.yellow);

function shutdown() {
   console.log(pc.yellow('\n\n🛑 Shutting down development servers...'));
   if (isWin) {
      if (apiProcess.pid) {
         spawn('taskkill', ['/pid', String(apiProcess.pid), '/f', '/t'], { shell: true });
      }
      if (viteProcess.pid) {
         spawn('taskkill', ['/pid', String(viteProcess.pid), '/f', '/t'], { shell: true });
      }
   } else {
      apiProcess.kill('SIGTERM');
      viteProcess.kill('SIGTERM');
   }
   setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

