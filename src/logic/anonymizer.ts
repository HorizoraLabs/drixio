/**
 * PII Data Masking and Anonymization Engine
 * 
 * Provides deterministic pseudonymization so that identical sensitive inputs
 * map to identical masked outputs across rows, preserving relational integrity.
 */

export interface AnonymizeOptions {
   preserveDomain?: boolean;
   salt?: string;
}

// Simple deterministic hash helper for reproducible pseudonyms
function hashString(str: string, seed: string = 'drixio_salt'): number {
   let hash = 0;
   const combined = seed + ':' + str;
   for (let i = 0; i < combined.length; i++) {
      hash = (hash << 5) - hash + combined.charCodeAt(i);
      hash |= 0;
   }
   return Math.abs(hash);
}

const FIRST_NAMES = [
   'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Sam', 'Chris', 'Pat',
   'Jamie', 'Robin', 'Jesse', 'Riley', 'Avery', 'Cameron', 'Dakota', 'Skyler'
];

const LAST_NAMES = [
   'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson',
   'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez'
];

const CITIES = [
   'Metro City', 'Springfield', 'Riverdale', 'Oakwood', 'Fairview', 'Pinecrest'
];

/**
 * Categorizes a column name by PII sensitivity pattern.
 */
export type PiiCategory =
   | 'email'
   | 'phone'
   | 'password'
   | 'name'
   | 'address'
   | 'ip'
   | 'card_id'
   | 'none';

export function detectPiiCategory(colName: string): PiiCategory {
   const lower = colName.toLowerCase().replace(/[-_]/g, '');

   // Ignore system / structural columns that happen to contain 'name'
   if (
      lower === 'tablename' ||
      lower === 'columnname' ||
      lower === 'classname' ||
      lower === 'schemaname' ||
      lower === 'appname' ||
      lower === 'projectname' ||
      lower === 'rolename'
   ) {
      return 'none';
   }

   if (lower.includes('email') || lower.includes('mail')) {
      return 'email';
   }

   if (
      lower.includes('phone') ||
      lower.includes('mobile') ||
      lower.includes('tel') ||
      lower.includes('cell')
   ) {
      return 'phone';
   }

   if (
      lower.includes('password') ||
      lower.includes('passwd') ||
      lower.includes('secret') ||
      lower.includes('apikey') ||
      lower.includes('token') ||
      lower.includes('salt') ||
      lower.includes('authhash')
   ) {
      return 'password';
   }

   if (
      lower.includes('ipaddress') ||
      lower === 'ip' ||
      lower.includes('clientip') ||
      lower.includes('hostip')
   ) {
      return 'ip';
   }

   if (
      lower.includes('creditcard') ||
      lower.includes('cardnumber') ||
      lower.includes('idcard') ||
      lower.includes('ssn') ||
      lower.includes('passport')
   ) {
      return 'card_id';
   }

   if (
      lower.includes('address') ||
      lower.includes('street') ||
      lower.includes('postalcode') ||
      lower.includes('zipcode')
   ) {
      return 'address';
   }

   if (
      lower === 'name' ||
      lower.includes('fullname') ||
      lower.includes('firstname') ||
      lower.includes('lastname') ||
      lower.includes('realname') ||
      lower.includes('username') ||
      lower.includes('contactname')
   ) {
      return 'name';
   }

   return 'none';
}

/**
 * Mask an individual cell value according to detected PII category.
 */
export function maskPiiValue(
   value: any,
   category: PiiCategory,
   options: AnonymizeOptions = {},
): any {
   if (value === null || value === undefined || value === '') {
      return value;
   }

   const str = String(value).trim();
   if (!str) return value;

   const seed = options.salt || 'drixio_pii_salt';
   const hash = hashString(str, seed);

   switch (category) {
      case 'email': {
         const hex = hash.toString(16).slice(0, 4);
         if (options.preserveDomain && str.includes('@')) {
            const domain = str.split('@')[1];
            return `user_${hex}@${domain}`;
         }
         return `user_${hex}@example.com`;
      }

      case 'phone': {
         const last4 = (hash % 10000).toString().padStart(4, '0');
         return `+1-555-***-${last4}`;
      }

      case 'password': {
         return `[REDACTED_HASH]`;
      }

      case 'name': {
         const first = FIRST_NAMES[hash % FIRST_NAMES.length];
         const last = LAST_NAMES[(hash >> 4) % LAST_NAMES.length];
         return `${first} ${last}`;
      }

      case 'address': {
         const streetNum = (hash % 900) + 100;
         const city = CITIES[hash % CITIES.length];
         return `${streetNum} Main St, ${city}`;
      }

      case 'ip': {
         const b1 = (hash % 200) + 10;
         const b2 = (hash >> 3) % 255;
         return `${b1}.${b2}.***.***`;
      }

      case 'card_id': {
         const last4 = (hash % 10000).toString().padStart(4, '0');
         return `****-****-****-${last4}`;
      }

      default:
         return value;
   }
}

/**
 * Masks all detected sensitive fields in a dataset of rows.
 */
export function anonymizeRows(
   rows: Record<string, any>[],
   options: AnonymizeOptions = {},
): Record<string, any>[] {
   if (!rows || rows.length === 0) return [];

   // Detect PII categories for columns in the first row
   const colCategories: Record<string, PiiCategory> = {};
   const firstRow = rows[0];
   for (const col of Object.keys(firstRow)) {
      colCategories[col] = detectPiiCategory(col);
   }

   // Anonymize rows
   return rows.map((row) => {
      const newRow: Record<string, any> = {};
      for (const [col, val] of Object.entries(row)) {
         const category = colCategories[col] || 'none';
         if (category !== 'none') {
            newRow[col] = maskPiiValue(val, category, options);
         } else {
            newRow[col] = val;
         }
      }
      return newRow;
   });
}

/**
 * Convenience alias for maskPiiValue accepting column name or direct category.
 */
export function anonymizeValue(
   value: any,
   colOrCategory: string,
   options: AnonymizeOptions = {},
): any {
   const detected = detectPiiCategory(colOrCategory);
   const cat = detected !== 'none' ? detected : (colOrCategory as PiiCategory);
   return maskPiiValue(value, cat, options);
}

export const anonymizeRecords = anonymizeRows;

