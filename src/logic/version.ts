import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

declare const __DRIXIO_VERSION__: string | undefined;

let cachedVersion: string | undefined;

/**
 * Resolves the single source of truth version for Drixio from package.json.
 * Supports compile-time injection (tsup/vite) and dynamic filesystem resolution.
 */
export function getDrixioVersion(): string {
   if (cachedVersion) {
      return cachedVersion;
   }

   // 1. Injected at build time via tsup/vite define
   if (typeof __DRIXIO_VERSION__ === 'string' && __DRIXIO_VERSION__) {
      cachedVersion = __DRIXIO_VERSION__;
      return cachedVersion;
   }

   // 2. Traversal up from current module location to package.json
   try {
      let currentDir = path.dirname(fileURLToPath(import.meta.url));
      for (let i = 0; i < 5; i++) {
         const candidate = path.join(currentDir, 'package.json');
         if (fs.existsSync(candidate)) {
            const pkg = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
            if (pkg.name === 'drixio' && typeof pkg.version === 'string') {
               cachedVersion = pkg.version;
               return pkg.version;
            }
         }
         const parent = path.dirname(currentDir);
         if (parent === currentDir) break;
         currentDir = parent;
      }
   } catch {
      // Ignore and continue fallback
   }

   // 3. Check process.cwd() package.json
   try {
      const cwdPkgPath = path.resolve(process.cwd(), 'package.json');
      if (fs.existsSync(cwdPkgPath)) {
         const pkg = JSON.parse(fs.readFileSync(cwdPkgPath, 'utf-8'));
         if (pkg.name === 'drixio' && typeof pkg.version === 'string') {
            cachedVersion = pkg.version;
            return pkg.version;
         }
      }
   } catch {
      // Ignore and continue fallback
   }

   // 4. Fallback to npm package env if set
   if (typeof process.env.npm_package_version === 'string') {
      cachedVersion = process.env.npm_package_version;
      return cachedVersion;
   }

   cachedVersion = '0.0.0';
   return cachedVersion;
}

