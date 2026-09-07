import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { QuerySnippet } from './types.js';
import { getDialect } from './dialect.js';

export const DEFAULT_SNIPPETS: QuerySnippet[] = [
   {
      id: 'snip_recent_records',
      title: 'Recent Records by Limit',
      description:
         'Fetch the most recent rows from a table ordered by ID or timestamp',
      sql: 'SELECT * FROM :table ORDER BY id DESC LIMIT :limit;',
      tags: ['general', 'inspection'],
      isBuiltin: true,
      createdAt: new Date().toISOString(),
   },
   {
      id: 'snip_search_keyword',
      title: 'Keyword Search in Column',
      description: 'Search for text matches across a specific column',
      sql: "SELECT * FROM :table WHERE :column LIKE '%:keyword%' LIMIT 50;",
      tags: ['search', 'filter'],
      isBuiltin: true,
      createdAt: new Date().toISOString(),
   },
   {
      id: 'snip_date_range',
      title: 'Filter by Date & Status',
      description:
         'Query records created after a certain date with a given status',
      sql: "SELECT * FROM :table WHERE created_at >= ':start_date' AND status = ':status' LIMIT :limit;",
      tags: ['analytics', 'filter'],
      isBuiltin: true,
      createdAt: new Date().toISOString(),
   },
   {
      id: 'snip_orphaned_fk',
      title: 'Find Orphaned Foreign Key Records',
      description:
         'Locate child records where the referenced parent row has been deleted',
      sql: 'SELECT c.* FROM :child_table c LEFT JOIN :parent_table p ON c.:fk_col = p.:pk_col WHERE p.:pk_col IS NULL;',
      tags: ['cleanup', 'integrity'],
      isBuiltin: true,
      createdAt: new Date().toISOString(),
   },
];

function getSnippetsFilePath(workspaceDir: string = process.cwd()): string {
   return path.resolve(workspaceDir, '.drixio', 'snippets.json');
}

/**
 * Load all saved queries from .drixio/snippets.json.
 * If file does not exist, returns built-in default snippets.
 */
export async function loadSnippets(
   workspaceDir?: string,
): Promise<QuerySnippet[]> {
   const filePath = getSnippetsFilePath(workspaceDir);
   try {
      if (!existsSync(filePath)) {
         return [...DEFAULT_SNIPPETS];
      }
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
         const savedIds = new Set(data.map((s: QuerySnippet) => s.id));
         const builtins = DEFAULT_SNIPPETS.filter((b) => !savedIds.has(b.id));
         return [...data, ...builtins];
      }
      return [...DEFAULT_SNIPPETS];
   } catch {
      return [...DEFAULT_SNIPPETS];
   }
}

/**
 * Save or append a new query snippet into .drixio/snippets.json.
 */
export async function saveSnippet(
   snippet: Omit<QuerySnippet, 'id' | 'createdAt'> & { id?: string },
   workspaceDir?: string,
): Promise<QuerySnippet> {
   const filePath = getSnippetsFilePath(workspaceDir);
   const snippets = await loadSnippets(workspaceDir);

   const id =
      snippet.id ||
      `snip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
   const now = new Date().toISOString();

   const newSnippet: QuerySnippet = {
      id,
      title: snippet.title.trim() || 'Untitled Snippet',
      sql: snippet.sql.trim(),
      description: snippet.description?.trim(),
      tags: snippet.tags && snippet.tags.length > 0 ? snippet.tags : ['custom'],
      isBuiltin: false,
      createdAt: now,
      updatedAt: now,
   };

   // Check if updating existing
   const existingIndex = snippets.findIndex((s) => s.id === id);
   if (existingIndex >= 0) {
      newSnippet.createdAt = snippets[existingIndex].createdAt;
      snippets[existingIndex] = newSnippet;
   } else {
      snippets.unshift(newSnippet);
   }

   // Keep only user snippets or overridden built-ins in JSON file
   const toSave = snippets.filter((s) => !s.isBuiltin || s.id === id);
   if (!toSave.some((s) => s.id === id)) {
      toSave.unshift(newSnippet);
   }

   await fs.mkdir(path.dirname(filePath), { recursive: true });
   await fs.writeFile(filePath, JSON.stringify(toSave, null, 2), 'utf-8');

   return newSnippet;
}

/**
 * Update an existing snippet by ID.
 */
export async function updateSnippet(
   id: string,
   patch: Partial<Omit<QuerySnippet, 'id' | 'createdAt'>>,
   workspaceDir?: string,
): Promise<QuerySnippet | null> {
   const filePath = getSnippetsFilePath(workspaceDir);
   const snippets = await loadSnippets(workspaceDir);

   const index = snippets.findIndex((s) => s.id === id);
   if (index < 0) return null;

   const existing = snippets[index];
   const updated: QuerySnippet = {
      ...existing,
      ...patch,
      id: existing.id,
      isBuiltin: false,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
   };

   snippets[index] = updated;

   const toSave = snippets.filter((s) => !s.isBuiltin || s.id === id);
   await fs.mkdir(path.dirname(filePath), { recursive: true });
   await fs.writeFile(filePath, JSON.stringify(toSave, null, 2), 'utf-8');

   return updated;
}

/**
 * Delete a snippet by ID.
 */
export async function deleteSnippet(
   id: string,
   workspaceDir?: string,
): Promise<boolean> {
   const filePath = getSnippetsFilePath(workspaceDir);
   if (!existsSync(filePath)) return false;

   try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return false;

      const filtered = data.filter((s: QuerySnippet) => s.id !== id);
      if (filtered.length === data.length) return false;

      await fs.writeFile(filePath, JSON.stringify(filtered, null, 2), 'utf-8');
      return true;
   } catch {
      return false;
   }
}

/**
 * Extract parameter tokens from SQL text.
 * Finds :param_name and {{param_name}} tokens, avoiding PostgreSQL type casts like ::text.
 */
export function extractSnippetParams(sql: string): string[] {
   if (!sql) return [];
   const params = new Set<string>();

   // 1. Match {{ param }}
   const mustacheRegex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
   let m: RegExpExecArray | null;
   while ((m = mustacheRegex.exec(sql)) !== null) {
      if (m[1]) params.add(m[1]);
   }

   // 2. Match :param (ensure not preceded by another colon for PostgreSQL ::type cast)
   const colonRegex = /(?:^|[^:]):([a-zA-Z0-9_]+)/g;
   while ((m = colonRegex.exec(sql)) !== null) {
      if (m[1]) params.add(m[1]);
   }

   return Array.from(params);
}

/**
 * Safely substitute parameters into a SQL template.
 */
export function substituteSnippetParams(
   sql: string,
   params: Record<string, any>,
   dbType: string = 'sqlite',
): string {
   if (!sql) return '';
   const dialect = getDialect(dbType as any);

   let result = sql;

   for (const [key, rawValue] of Object.entries(params)) {
      const valStr =
         rawValue !== undefined && rawValue !== null ? String(rawValue) : '';
      const isNumber = !isNaN(Number(valStr)) && valStr.trim() !== '';

      // Pattern 1: Match '{{key}}' or ':key' inside single quotes: ':id' -> 'value'
      const quotedMustache = new RegExp(`'\\{\\{\\s*${key}\\s*\\}\\}'`, 'g');
      const quotedColon = new RegExp(`':${key}'`, 'g');
      const escapedVal = dialect.escapeString(valStr);

      result = result.replace(quotedMustache, `'${escapedVal}'`);
      result = result.replace(quotedColon, `'${escapedVal}'`);

      // Pattern 2: Match unquoted {{key}}
      const rawMustache = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      result = result.replace(rawMustache, () => {
         return isNumber ? valStr : valStr;
      });

      // Pattern 3: Match unquoted :key (ensure not preceded by colon)
      const rawColon = new RegExp(`(^|[^:]):${key}\\b`, 'g');
      result = result.replace(rawColon, (_match, prefix) => {
         return `${prefix}${valStr}`;
      });
   }

   return result;
}
