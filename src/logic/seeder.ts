import { DBAdapter, ColumnSchema, Result, ok, err } from './types.js';

export interface MockStrategy {
   type: string;
   label: string;
   target?: { table: string; column: string };
   values?: string[];
}

export interface MockColumnRule {
   column: ColumnSchema;
   strategy: MockStrategy;
}

export interface MockPreviewData {
   tableName: string;
   rules: MockColumnRule[];
   previewRows: Record<string, any>[];
}

const FIRST_NAMES = [
   'James',
   'Mary',
   'John',
   'Patricia',
   'Robert',
   'Jennifer',
   'Michael',
   'Linda',
   'William',
   'Elizabeth',
   'David',
   'Barbara',
   'Richard',
   'Susan',
   'Joseph',
   'Jessica',
   'Thomas',
   'Sarah',
   'Charles',
   'Karen',
   'Lucas',
   'Emma',
   'Alex',
   'Olivia',
];

const LAST_NAMES = [
   'Smith',
   'Johnson',
   'Williams',
   'Brown',
   'Jones',
   'Garcia',
   'Miller',
   'Davis',
   'Rodriguez',
   'Martinez',
   'Hernandez',
   'Lopez',
   'Gonzalez',
   'Wilson',
   'Anderson',
   'Taylor',
];

const DOMAINS = [
   'gmail.com',
   'outlook.com',
   'yahoo.com',
   'example.com',
   'company.io',
];

const CITIES = [
   'New York',
   'San Francisco',
   'London',
   'Tokyo',
   'Berlin',
   'Paris',
   'Sydney',
   'Toronto',
   'Singapore',
   'Amsterdam',
];

const TITLES = [
   'Getting started with database design',
   '10 tips for clean and maintainable code',
   'Understanding indexing and performance',
   'How to optimize complex SQL queries',
   'Modern web application architecture',
   'Best practices for database migrations',
   'A deep dive into relational models',
   'Improving frontend latency and responsiveness',
];

const PARAGRAPHS = [
   'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
   'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
   'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
   'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
];

const STATUSES = ['active', 'pending', 'completed', 'inactive', 'archived'];
const ROLES = ['admin', 'editor', 'member', 'viewer', 'moderator'];

function getRandomItem<T>(arr: T[]): T {
   return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min: number, max: number): number {
   return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomFloat(min: number, max: number, decimals = 2): number {
   const str = (Math.random() * (max - min) + min).toFixed(decimals);
   return parseFloat(str);
}

function getRandomDate(pastDays = 30): string {
   const d = new Date();
   d.setDate(d.getDate() - getRandomInt(0, pastDays));
   d.setHours(getRandomInt(0, 23), getRandomInt(0, 59), getRandomInt(0, 59));
   return d.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Infer generator strategy based on column name, type, and schema
 */
export function inferColumnStrategy(col: ColumnSchema): MockStrategy {
   const name = col.name.toLowerCase();
   const type = (col.type || '').toUpperCase();

   if (col.fkTarget) {
      return {
         type: 'fk',
         label: `FK → ${col.fkTarget.table}.${col.fkTarget.column}`,
         target: col.fkTarget,
      };
   }

   if (col.isPk && (type.includes('INT') || type === 'SERIAL')) {
      return {
         type: 'pk_auto',
         label: 'Auto-increment (Skip / Handled by DB)',
      };
   }

   if (col.enumValues && col.enumValues.length > 0) {
      return {
         type: 'enum',
         label: `Enum (${col.enumValues.slice(0, 3).join(', ')})`,
         values: col.enumValues,
      };
   }

   if (
      type.includes('BOOL') ||
      type === 'TINYINT(1)' ||
      name.startsWith('is_') ||
      name.startsWith('has_')
   ) {
      return { type: 'boolean', label: 'Boolean (true / false)' };
   }

   if (name.includes('email')) {
      return { type: 'email', label: 'Email Address' };
   }

   if (
      name.includes('phone') ||
      name.includes('tel') ||
      name.includes('mobile')
   ) {
      return { type: 'phone', label: 'Phone Number' };
   }

   if (name.includes('first_name')) {
      return { type: 'first_name', label: 'First Name' };
   }

   if (name.includes('last_name')) {
      return { type: 'last_name', label: 'Last Name' };
   }

   if (
      name.includes('name') ||
      name.includes('author') ||
      name.includes('user')
   ) {
      return { type: 'full_name', label: 'Full Name' };
   }

   if (
      name.includes('avatar') ||
      name.includes('image') ||
      name.includes('photo') ||
      name.includes('thumbnail')
   ) {
      return { type: 'avatar', label: 'Avatar / Image URL' };
   }

   if (
      name === 'city' ||
      name.endsWith('_city') ||
      name.startsWith('city_') ||
      name.includes('city_name')
   ) {
      return { type: 'city', label: 'City Name' };
   }

   if (name.includes('capacity')) {
      return { type: 'integer', label: 'Capacity (1 - 10)' };
   }

   if (name === 'type' || name.endsWith('_type') || name.startsWith('type_')) {
      return {
         type: 'enum',
         label: 'Type (Standard/Deluxe...)',
         values: ['Standard', 'Deluxe', 'Suite', 'Single', 'Double'],
      };
   }

   if (name.includes('country')) {
      return { type: 'country', label: 'Country Name' };
   }

   if (name.includes('address')) {
      return { type: 'address', label: 'Street Address' };
   }

   if (
      name.includes('title') ||
      name.includes('subject') ||
      name.includes('headline')
   ) {
      return { type: 'title', label: 'Title / Headline' };
   }

   if (
      name.includes('desc') ||
      name.includes('content') ||
      name.includes('body') ||
      name.includes('bio') ||
      name.includes('comment') ||
      type.includes('TEXT')
   ) {
      return { type: 'paragraph', label: 'Text / Paragraph' };
   }

   if (name.includes('status')) {
      return { type: 'status', label: 'Status (active/pending...)' };
   }

   if (name.includes('role')) {
      return { type: 'role', label: 'Role (admin/member...)' };
   }

   if (
      name.includes('price') ||
      name.includes('amount') ||
      name.includes('cost') ||
      name.includes('salary') ||
      type.includes('DECIMAL') ||
      type.includes('FLOAT') ||
      type.includes('REAL') ||
      type.includes('NUMERIC')
   ) {
      return { type: 'price', label: 'Price / Currency' };
   }

   if (type.includes('DATE') || type.includes('TIME')) {
      return { type: 'date', label: 'Date / Timestamp' };
   }

   if (
      type.includes('INT') ||
      name.includes('age') ||
      name.includes('count') ||
      name.includes('qty') ||
      name.includes('quantity')
   ) {
      return { type: 'integer', label: 'Integer (1 - 500)' };
   }

   if (type.includes('UUID')) {
      return { type: 'uuid', label: 'UUID v4' };
   }

   return { type: 'string', label: 'Random Word / Code' };
}

/**
 * Generate a single field value from strategy
 */
export function generateFieldValue(
   strategy: MockStrategy,
   fkCache: Record<string, any[]> = {},
): any {
   switch (strategy.type) {
      case 'pk_auto':
         return undefined; // Don't include in insert
      case 'fk': {
         if (!strategy.target) return 1;
         const { table, column } = strategy.target;
         const ids = fkCache[`${table}.${column}`] || [];
         if (ids.length > 0) {
            return getRandomItem(ids);
         }
         return 1;
      }
      case 'enum':
         return strategy.values && strategy.values.length > 0
            ? getRandomItem(strategy.values)
            : 'Default';
      case 'boolean':
         return Math.random() > 0.5 ? 1 : 0;
      case 'email': {
         const f = getRandomItem(FIRST_NAMES).toLowerCase();
         const l = getRandomItem(LAST_NAMES).toLowerCase();
         return `${f}.${l}${getRandomInt(1, 99)}@${getRandomItem(DOMAINS)}`;
      }
      case 'phone':
         return `+1 (${getRandomInt(200, 999)}) ${getRandomInt(200, 999)}-${getRandomInt(1000, 9999)}`;
      case 'first_name':
         return getRandomItem(FIRST_NAMES);
      case 'last_name':
         return getRandomItem(LAST_NAMES);
      case 'full_name':
         return `${getRandomItem(FIRST_NAMES)} ${getRandomItem(LAST_NAMES)}`;
      case 'avatar':
         return `https://picsum.photos/seed/${getRandomInt(100, 9999)}/200`;
      case 'city':
         return getRandomItem(CITIES);
      case 'country':
         return getRandomItem([
            'United States',
            'United Kingdom',
            'Germany',
            'Japan',
            'Canada',
            'Singapore',
         ]);
      case 'address':
         return `${getRandomInt(10, 999)} ${getRandomItem(['Market St', 'Broadway', 'Highland Ave', 'Pine Rd', 'Maple St'])}`;
      case 'title':
         return getRandomItem(TITLES);
      case 'paragraph':
         return getRandomItem(PARAGRAPHS);
      case 'status':
         return getRandomItem(STATUSES);
      case 'role':
         return getRandomItem(ROLES);
      case 'price':
         return getRandomFloat(9.99, 499.99);
      case 'date':
         return getRandomDate(30);
      case 'integer':
         if (strategy.label?.includes('Capacity')) return getRandomInt(1, 8);
         return getRandomInt(1, 500);
      case 'uuid':
         return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
         });
      default:
         return `Item_${getRandomInt(100, 9999)}`;
   }
}

/**
 * Fetch candidate IDs for all foreign keys referenced by the schema
 */
async function getFkCandidates(
   adapter: DBAdapter,
   schema: ColumnSchema[],
): Promise<Record<string, any[]>> {
   const fkCache: Record<string, any[]> = {};
   for (const col of schema) {
      if (col.fkTarget) {
         const key = `${col.fkTarget.table}.${col.fkTarget.column}`;
         if (!fkCache[key]) {
            try {
               const data = await adapter.getData(col.fkTarget.table, 50);
               if (data && data.rows && data.rows.length > 0) {
                  fkCache[key] = data.rows
                     .map((r) => r[col.fkTarget!.column])
                     .filter((v) => v !== null && v !== undefined);
               }
            } catch {
               fkCache[key] = [];
            }
         }
      }
   }
   return fkCache;
}

/**
 * Generate preview data (strategies and 3 sample rows) for UI inspection
 */
export async function previewMockData(
   adapter: DBAdapter,
   tableName: string,
   previewCount = 3,
): Promise<Result<MockPreviewData>> {
   try {
      const schema = await adapter.getSchema(tableName);
      const fkCache = await getFkCandidates(adapter, schema);

      const rules: MockColumnRule[] = schema.map((col) => ({
         column: col,
         strategy: inferColumnStrategy(col),
      }));

      const previewRows: Record<string, any>[] = [];
      for (let i = 0; i < previewCount; i++) {
         const row: Record<string, any> = {};
         for (const { column, strategy } of rules) {
            const val = generateFieldValue(strategy, fkCache);
            row[column.name] = val !== undefined ? val : '(auto)';
         }
         previewRows.push(row);
      }

      return ok({
         tableName,
         rules,
         previewRows,
      });
   } catch (e: any) {
      return err(e.message || 'Failed to generate mock preview', undefined, e);
   }
}

/**
 * Generate and batch insert realistic mock records into the database
 */
export async function generateAndInsertMockData(
   adapter: DBAdapter,
   tableName: string,
   count: number,
   onProgress?: (inserted: number, total: number) => void,
): Promise<Result<{ insertedCount: number }>> {
   try {
      const schema = await adapter.getSchema(tableName);
      const fkCache = await getFkCandidates(adapter, schema);

      const rules: MockColumnRule[] = schema.map((col) => ({
         column: col,
         strategy: inferColumnStrategy(col),
      }));

      const activeRules = rules.filter((r) => r.strategy.type !== 'pk_auto');
      if (activeRules.length === 0) {
         return ok({ insertedCount: 0 });
      }

      const rowsToInsert: Record<string, any>[] = [];
      for (let i = 0; i < count; i++) {
         const row: Record<string, any> = {};
         for (const { column, strategy } of activeRules) {
            const val = generateFieldValue(strategy, fkCache);
            if (val !== undefined) {
               row[column.name] = val;
            }
         }
         rowsToInsert.push(row);
      }

      const CHUNK_SIZE = 250;
      let inserted = 0;

      for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
         const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE);
         await adapter.insert(tableName, chunk);
         inserted += chunk.length;
         if (onProgress) {
            onProgress(inserted, count);
         }
      }

      return ok({ insertedCount: inserted });
   } catch (e: any) {
      return err(
         e.message || 'Failed to generate and insert mock data',
         undefined,
         e,
      );
   }
}
