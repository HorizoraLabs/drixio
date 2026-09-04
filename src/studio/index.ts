import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import open from 'open';
import path from 'path';
import pc from 'picocolors';
import { fileURLToPath } from 'url';
import { DBConfig } from '../logic/index.js';
import { registerApiRoutes } from './api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runStudio(dbConfig: DBConfig) {
   const app = new Hono();

   // Register API routes
   registerApiRoutes(app, dbConfig);

   // Check if we are running in dev mode (src/studio) or prod mode (dist/)
   const isDev = __dirname.includes('src') || __dirname.includes('studio');
   const studioDistPath = isDev
      ? path.resolve(__dirname, '../../dist/studio')
      : path.resolve(__dirname, './studio');

   // Custom static middleware for Hono in Node
   const fs = await import('fs/promises');

   // Prevent aggressive browser caching for local development and CLI
   app.use('/*', async (c, next) => {
      c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      await next();
   });

   app.use(
      '/*',
      serveStatic({ root: path.relative(process.cwd(), studioDistPath) }),
   );

   // Fallback to index.html for SPA routing if needed
   app.get('*', async (c) => {
      const indexPath = path.join(studioDistPath, 'index.html');
      try {
         const html = await fs.readFile(indexPath, 'utf-8');
         return c.html(html);
      } catch (e) {
         return c.text(
            'Drixio Studio static files not found. Did you run build?',
            404,
         );
      }
   });

   // Use PORT environment variable if provided, otherwise default to 51213
   const defaultPort = process.env.PORT
      ? parseInt(process.env.PORT, 10)
      : 51213;
   const port = await getAvailablePort(defaultPort);

   console.log(
      pc.cyan(`\nStarting Drixio Studio on http://localhost:${port}...`),
   );
   console.log(pc.dim(`Press Ctrl+C to stop the server.\n`));

   serve({
      fetch: app.fetch,
      port,
   });

   await open(`http://localhost:${port}`);
}

async function getAvailablePort(startPort: number): Promise<number> {
   const net = await import('net');
   let currentPort = startPort;
   while (true) {
      const isAvailable = await new Promise<boolean>((resolve) => {
         const server = net.createServer();
         server.unref();
         server.on('error', () => resolve(false));
         server.listen(currentPort, () => {
            server.close(() => resolve(true));
         });
      });
      if (isAvailable) return currentPort;
      currentPort++;
   }
}
