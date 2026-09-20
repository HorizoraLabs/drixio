import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
   root: './studio',
   base: './',
   define: {
      __DRIXIO_VERSION__: JSON.stringify(pkg.version),
   },
   build: {
      outDir: '../dist/studio',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
         output: {
            manualChunks(id) {
               if (id.includes('node_modules/sql-formatter')) {
                  return 'sql-formatter';
               }
            },
         },
      },
   },
   server: {
      port: 51214,
      proxy: {
         '/api': {
            target: 'http://localhost:51213',
            changeOrigin: true,
         },
      },
   },
});
