import fs from 'node:fs/promises';
import path from 'node:path';
import { DBConfig, Result, okVoid, err } from './types.js';

/**
 * Common environment variable names used for database connection strings.
 */
const DB_ENV_KEYS = [
   'DATABASE_URL',
   'DB_URL',
   'DATABASE_URI',
   'DB_URI',
   'DIRECT_URL',
   'POSTGRES_URL',
   'POSTGRESQL_URL',
   'POSTGRES_PRISMA_URL',
   'POSTGRES_URL_NON_POOLING',
   'SUPABASE_DB_URL',
   'MYSQL_URL',
   'MYSQL_DATABASE_URL',
   'JAWSDB_URL',
   'CLEARDB_DATABASE_URL',
];

/**
 * Parses raw .env content into key-value pairs.
 * Correctly strips surrounding quotes and inline comments.
 */
export function parseEnvContent(content: string): Record<string, string> {
   const env: Record<string, string> = {};
   const lines = content.split(/\r?\n/);

   for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('export ')) {
         line = line.slice(7).trim();
      }
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;

      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();

      if (val.startsWith('"')) {
         const endQuote = val.indexOf('"', 1);
         val = endQuote !== -1 ? val.slice(1, endQuote) : val.slice(1);
      } else if (val.startsWith("'")) {
         const endQuote = val.indexOf("'", 1);
         val = endQuote !== -1 ? val.slice(1, endQuote) : val.slice(1);
      } else {
         const commentIdx = val.indexOf('#');
         if (commentIdx !== -1) {
            val = val.slice(0, commentIdx).trim();
         }
      }

      if (key) {
         env[key] = val;
      }
   }

   return env;
}

/**
 * Loads and merges environment variables from cascaded env files and runtime process.env.
 * Priority (lowest to highest):
 * .env -> .env.production -> .env.development -> .env.local -> .env.development.local -> process.env
 */
export async function loadCascadedEnv(
   cwd: string,
): Promise<Record<string, string>> {
   const envFiles = [
      '.env',
      '.env.production',
      '.env.development',
      '.env.local',
      '.env.development.local',
   ];

   const mergedEnv: Record<string, string> = {};

   for (const file of envFiles) {
      try {
         const filePath = path.join(cwd, file);
         const content = await fs.readFile(filePath, 'utf-8');
         const parsed = parseEnvContent(content);
         Object.assign(mergedEnv, parsed);
      } catch {
         // File does not exist or inaccessible, skip
      }
   }

   // Merge runtime process.env with highest priority
   for (const [key, val] of Object.entries(process.env)) {
      if (typeof val === 'string' && val.trim() !== '') {
         mergedEnv[key] = val.trim();
      }
   }

   return mergedEnv;
}

/**
 * Classifies a database connection URL string or path into DB type and normalized target URL.
 */
export function classifyDatabaseUrl(
   rawUrl: string,
   cwd: string,
): { type: 'sqlite' | 'postgres' | 'mysql'; targetUrl: string } | null {
   let trimmed = rawUrl.trim();
   if (!trimmed) return null;

   // Strip wrapping quotes if any
   if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
   ) {
      trimmed = trimmed.slice(1, -1).trim();
   }

   if (
      trimmed.startsWith('postgres://') ||
      trimmed.startsWith('postgresql://')
   ) {
      return { type: 'postgres', targetUrl: trimmed };
   }

   if (trimmed.startsWith('mysql://')) {
      return { type: 'mysql', targetUrl: trimmed };
   }

   const lower = trimmed.toLowerCase();
   const isSqlitePrefix =
      lower.startsWith('file:') ||
      lower.startsWith('sqlite://') ||
      lower.startsWith('sqlite:');
   const isSqliteExt =
      lower.endsWith('.db') ||
      lower.endsWith('.sqlite') ||
      lower.endsWith('.sqlite3') ||
      lower.endsWith('.db3');
   const isMemory = lower === ':memory:';

   if (isSqlitePrefix || isSqliteExt || isMemory) {
      let cleanPath = trimmed
         .replace(/^sqlite:\/\//i, '')
         .replace(/^sqlite:/i, '')
         .replace(/^file:/i, '');

      // Retain in-memory database target
      if (cleanPath === ':memory:') {
         return { type: 'sqlite', targetUrl: ':memory:' };
      }

      if (!path.isAbsolute(cleanPath)) {
         cleanPath = path.resolve(cwd, cleanPath);
      }

      return { type: 'sqlite', targetUrl: cleanPath };
   }

   return null;
}

/**
 * Assembles a connection string from separate DB host, port, user, pass, database variables.
 */
function buildUrlFromComponentEnv(
   env: Record<string, string>,
): { type: 'postgres' | 'mysql'; targetUrl: string } | null {
   const host =
      env.DB_HOST ||
      env.DATABASE_HOST ||
      env.MYSQL_HOST ||
      env.POSTGRES_HOST ||
      env.PGHOST;
   const dbName =
      env.DB_NAME ||
      env.DB_DATABASE ||
      env.DATABASE_NAME ||
      env.MYSQL_DATABASE ||
      env.POSTGRES_DB ||
      env.PGDATABASE;

   if (!host || !dbName) return null;

   const driver = (
      env.DB_CONNECTION ||
      env.DB_TYPE ||
      env.DB_DRIVER ||
      ''
   ).toLowerCase();
   const portStr =
      env.DB_PORT || env.MYSQL_PORT || env.POSTGRES_PORT || env.PGPORT;

   let type: 'postgres' | 'mysql' = 'mysql';

   if (
      driver.includes('postgres') ||
      driver.includes('pgsql') ||
      driver.includes('pg') ||
      env.POSTGRES_HOST ||
      env.PGHOST ||
      portStr === '5432'
   ) {
      type = 'postgres';
   } else if (
      driver.includes('mysql') ||
      driver.includes('mariadb') ||
      env.MYSQL_HOST ||
      portStr === '3306'
   ) {
      type = 'mysql';
   }

   const defaultPort = type === 'postgres' ? 5432 : 3306;
   const port = portStr ? parseInt(portStr, 10) || defaultPort : defaultPort;

   const user =
      env.DB_USER ||
      env.DB_USERNAME ||
      env.MYSQL_USER ||
      env.POSTGRES_USER ||
      env.PGUSER ||
      (type === 'postgres' ? 'postgres' : 'root');

   const pass =
      env.DB_PASSWORD ||
      env.DB_PASS ||
      env.MYSQL_PASSWORD ||
      env.POSTGRES_PASSWORD ||
      env.PGPASSWORD ||
      '';

   const auth = pass
      ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`
      : encodeURIComponent(user);

   const targetUrl = `${type}://${auth}@${host}:${port}/${dbName}`;
   return { type, targetUrl };
}

export async function detectDatabase(databaseUrl?: string): Promise<DBConfig> {
   const cwd = process.cwd();

   // 1. If explicit URL or path provided by user/caller
   if (databaseUrl) {
      const classified = classifyDatabaseUrl(databaseUrl, cwd);
      if (classified) {
         return {
            type: classified.type,
            targetUrl: classified.targetUrl,
            source: 'manual',
         };
      }
      return {
         type: 'unknown',
         targetUrl: databaseUrl,
         source: 'manual',
      };
   }

   // 2. Load and merge cascaded environment variables (.env files + process.env)
   const allEnv = await loadCascadedEnv(cwd);

   // 3. Parse Prisma schema configuration if it exists
   const prismaPaths = [
      path.join(cwd, 'prisma', 'schema.prisma'),
      path.join(cwd, 'src', 'prisma', 'schema.prisma'),
   ];

   for (const schemaPath of prismaPaths) {
      try {
         const schemaContent = await fs.readFile(schemaPath, 'utf-8');
         const providerMatch = schemaContent.match(
            /provider\s*=\s*["']([^"']+)["']/,
         );
         const urlMatch = schemaContent.match(
            /url\s*=\s*(?:env\(["']([^"']+)["']\)|["']([^"']+)["'])/,
         );

         if (providerMatch) {
            let provider = providerMatch[1];
            if (provider === 'postgresql') provider = 'postgres';

            let rawUrl: string | undefined;
            if (urlMatch) {
               // url = env("DATABASE_URL")
               if (urlMatch[1]) {
                  rawUrl = allEnv[urlMatch[1]];
               } else if (urlMatch[2]) {
                  // url = "file:./dev.db" or literal connection string
                  rawUrl = urlMatch[2];
               }
            }

            if (rawUrl) {
               if (provider === 'sqlite') {
                  let cleanPath = rawUrl.replace(/^file:/i, '');
                  if (!path.isAbsolute(cleanPath)) {
                     // Prisma resolves relative SQLite paths relative to the schema's directory
                     cleanPath = path.resolve(
                        path.dirname(schemaPath),
                        cleanPath,
                     );
                  }
                  return {
                     type: 'sqlite',
                     targetUrl: cleanPath,
                     source: '.env',
                  };
               }

               const classified = classifyDatabaseUrl(rawUrl, cwd);
               if (classified) {
                  return {
                     type: classified.type,
                     targetUrl: classified.targetUrl,
                     source: '.env',
                  };
               }
            }
         }
      } catch {
         // Ignore if prisma file does not exist or fails to parse
      }
   }

   // 4. Scan environment variables for common DB connection strings
   for (const key of DB_ENV_KEYS) {
      const candidate = allEnv[key];
      if (candidate) {
         const classified = classifyDatabaseUrl(candidate, cwd);
         if (classified) {
            return {
               type: classified.type,
               targetUrl: classified.targetUrl,
               source: '.env',
            };
         }
      }
   }

   // 5. Scan environment variables for component connection parameters (DB_HOST, DB_NAME, etc.)
   const assembled = buildUrlFromComponentEnv(allEnv);
   if (assembled) {
      return {
         type: assembled.type,
         targetUrl: assembled.targetUrl,
         source: '.env',
      };
   }

   // 6. Scan root and common subdirectories for SQLite files as fallback
   const searchDirs = [
      '.',
      'prisma',
      'db',
      'database',
      'src/db',
      'src/database',
   ];

   for (const dir of searchDirs) {
      try {
         const targetDir = path.join(cwd, dir);
         const files = await fs.readdir(targetDir);
         const sqliteFile = files.find((file) => {
            const lower = file.toLowerCase();
            return (
               lower.endsWith('.db') ||
               lower.endsWith('.sqlite') ||
               lower.endsWith('.sqlite3') ||
               lower.endsWith('.db3')
            );
         });

         if (sqliteFile) {
            return {
               type: 'sqlite',
               targetUrl: path.join(targetDir, sqliteFile),
               source: 'auto-detected',
            };
         }
      } catch {
         // Skip folders that don't exist or are inaccessible
      }
   }

   return {
      type: 'unknown',
      targetUrl: '',
      source: 'manual',
   };
}

export async function saveDatabaseUrl(url: string): Promise<Result<void>> {
   try {
      const envPath = path.join(process.cwd(), '.env');
      let envContent = '';
      try {
         envContent = await fs.readFile(envPath, 'utf-8');
      } catch {
         // File doesn't exist, which is fine
      }

      const regex = /DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/;
      if (regex.test(envContent)) {
         envContent = envContent.replace(regex, `DATABASE_URL="${url}"`);
      } else {
         if (envContent && !envContent.endsWith('\n')) {
            envContent += '\n';
         }
         envContent += `DATABASE_URL="${url}"\n`;
      }

      await fs.writeFile(envPath, envContent, 'utf-8');
      return okVoid();
   } catch (e: any) {
      return err(
         e.message || 'Failed to save database URL to .env',
         undefined,
         e,
      );
   }
}
