import { MongoClient, Db, ObjectId } from 'mongodb';
import {
   DBAdapter,
   ColumnSchema,
   IndexSchema,
   DatabaseStatus,
} from '../types.js';

/**
 * MongoDB Adapter for Drixio
 * Provides seamless NoSQL Document-to-Relational grid mapping,
 * schema sampling, index extraction, and collection management.
 */
export class MongoAdapter implements DBAdapter {
   private client: MongoClient | null = null;
   private db: Db | null = null;
   private targetUrl: string;
   private dbName: string;

   constructor(targetUrl: string) {
      this.targetUrl = targetUrl;
      this.dbName = this.extractDatabaseName(targetUrl);
   }

   /**
    * Extract database name from connection URL
    */
   private extractDatabaseName(urlStr: string): string {
      try {
         const clean = urlStr.trim();
         const url = new URL(clean);
         const pathname = url.pathname.replace(/^\//, '');
         const dbFromPath = pathname.split('?')[0]?.trim();
         if (dbFromPath) return decodeURIComponent(dbFromPath);

         // Check query parameter ?authSource=... or fallback to 'admin' / 'default'
         const authSource = url.searchParams.get('authSource');
         if (authSource) return authSource;
      } catch {
         // Fallback if URL parsing fails
      }
      return 'test';
   }

   /**
    * Lazy connection helper
    */
   private async getDb(): Promise<Db> {
      if (!this.client) {
         this.client = new MongoClient(this.targetUrl, {
            serverSelectionTimeoutMS: 8000,
            connectTimeoutMS: 8000,
         });
         await this.client.connect();
      }
      if (!this.db) {
         this.db = this.client.db(this.dbName);
      }
      return this.db;
   }

   async getStatus(): Promise<DatabaseStatus> {
      try {
         const db = await this.getDb();
         // Ping server
         await db.command({ ping: 1 });

         let version = 'unknown';
         let activeConnections: number | undefined;
         let uptime: number | undefined;
         let sizeBytes: number | undefined;

         try {
            const buildInfo = await db.admin().command({ buildInfo: 1 });
            if (buildInfo?.version) {
               version = `MongoDB ${buildInfo.version}`;
            }
         } catch {
            // Some restricted users cannot run buildInfo
         }

         try {
            const stats = await db.stats();
            if (stats) {
               sizeBytes = stats.dataSize || stats.storageSize;
            }
         } catch {
            // Ignore stats errors
         }

         try {
            const serverStatus = await db.admin().command({ serverStatus: 1 });
            if (serverStatus) {
               activeConnections = serverStatus.connections?.current;
               uptime = serverStatus.uptime;
            }
         } catch {
            // Ignore serverStatus errors
         }

         return {
            status: 'connected',
            dbType: 'mongodb' as any,
            dbName: this.dbName,
            version,
            activeConnections,
            uptime,
            sizeBytes,
         };
      } catch (err: any) {
         return {
            status: 'error',
            dbType: 'mongodb' as any,
            dbName: this.dbName,
            version: err.message || 'Connection failed',
         };
      }
   }

   async getTables(): Promise<string[]> {
      const db = await this.getDb();
      const collections = await db.listCollections({}, { nameOnly: true }).toArray();
      return collections
         .map((c) => c.name)
         .filter((name) => !name.startsWith('system.') && !name.startsWith('_drixio_trash_'))
         .sort();
   }

   async getTrashTables(): Promise<string[]> {
      const db = await this.getDb();
      const collections = await db.listCollections({}, { nameOnly: true }).toArray();
      return collections
         .map((c) => c.name)
         .filter((name) => name.startsWith('_drixio_trash_'))
         .sort();
   }

   /**
    * Infer BSON / JS data type of a value
    */
   private inferBsonType(val: any): string {
      if (val === null || val === undefined) return 'Null';
      if (val instanceof ObjectId || (val && val._bsontype === 'ObjectId')) return 'ObjectId';
      if (val instanceof Date) return 'Date';
      if (Array.isArray(val)) return 'Array';
      if (typeof val === 'boolean') return 'Boolean';
      if (typeof val === 'number') {
         return Number.isInteger(val) ? 'Int32' : 'Double';
      }
      if (typeof val === 'string') {
         // Detect ISO date strings
         if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) return 'Date';
         return 'String';
      }
      if (typeof val === 'object') return 'Object';
      return 'String';
   }

   /**
    * Dynamic Schema Inference:
    * Samples the first 100 documents to synthesize field definitions
    */
   async getSchema(collectionName: string): Promise<ColumnSchema[]> {
      const db = await this.getDb();
      const coll = db.collection(collectionName);

      const samples = await coll.find({}).limit(100).toArray();

      if (samples.length === 0) {
         // Default empty collection schema with mandatory _id primary key
         return [
            {
               name: '_id',
               type: 'ObjectId',
               isPk: true,
               nullable: false,
               isUnique: true,
            },
         ];
      }

      const fieldMap = new Map<
         string,
         {
            type: string;
            isPk: boolean;
            nullable: boolean;
            occurrences: number;
         }
      >();

      // Ensure _id is always the first column
      fieldMap.set('_id', {
         type: 'ObjectId',
         isPk: true,
         nullable: false,
         occurrences: samples.length,
      });

      for (const doc of samples) {
         for (const [key, val] of Object.entries(doc)) {
            if (key === '_id') {
               const existing = fieldMap.get('_id')!;
               existing.type = this.inferBsonType(val);
               continue;
            }

            const currentType = this.inferBsonType(val);
            if (!fieldMap.has(key)) {
               fieldMap.set(key, {
                  type: currentType,
                  isPk: false,
                  nullable: val === null,
                  occurrences: 1,
               });
            } else {
               const meta = fieldMap.get(key)!;
               meta.occurrences++;
               if (val === null) {
                  meta.nullable = true;
               } else if (meta.type === 'Null' && currentType !== 'Null') {
                  meta.type = currentType;
               }
            }
         }
      }

      // If a field did not occur in all sampled documents, mark it nullable
      for (const [name, meta] of fieldMap.entries()) {
         if (name !== '_id' && meta.occurrences < samples.length) {
            meta.nullable = true;
         }
      }

      // Convert to ColumnSchema array
      const columns: ColumnSchema[] = [];
      for (const [name, meta] of fieldMap.entries()) {
         columns.push({
            name,
            type: meta.type,
            isPk: meta.isPk,
            nullable: meta.nullable,
            isUnique: meta.isPk,
         });
      }

      return columns;
   }

   async getIndexes(collectionName: string): Promise<IndexSchema[]> {
      const db = await this.getDb();
      const coll = db.collection(collectionName);

      try {
         const indexes = await coll.indexes();
         return indexes.map((idx) => {
            const columns = Object.keys(idx.key || {});
            return {
               name: idx.name || columns.join('_'),
               columns,
               isUnique: !!idx.unique,
            };
         });
      } catch {
         return [];
      }
   }

   /**
    * Serialize BSON documents into JSON-friendly grid rows
    */
   private serializeDocument(doc: any): Record<string, any> {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(doc)) {
         if (v === null || v === undefined) {
            out[k] = null;
         } else if (v instanceof ObjectId || (v && (v as any)._bsontype === 'ObjectId')) {
            out[k] = v.toString();
         } else if (v instanceof Date) {
            out[k] = v.toISOString();
         } else if (typeof v === 'object') {
            // Keep object for frontend JSON formatting or stringify
            out[k] = v;
         } else {
            out[k] = v;
         }
      }
      return out;
   }

   async getData(
      collectionName: string,
      limit = 50,
      offset = 0,
      whereClause?: string,
      orderBy?: { col: string; asc: boolean },
   ): Promise<{ columns: string[]; rows: Record<string, any>[] }> {
      const db = await this.getDb();
      const coll = db.collection(collectionName);

      let filter: Record<string, any> = {};

      if (whereClause && whereClause.trim() !== '') {
         const trimmed = whereClause.trim();
         // If user entered valid JSON query
         if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
               filter = JSON.parse(trimmed);
            } catch {
               // Fallback: search across sampled columns
               filter = {};
            }
         } else {
            // Fuzzy search across text/string fields
            const schema = await this.getSchema(collectionName);
            const searchFields = schema
               .filter((c) => c.type === 'String' || c.type === 'ObjectId')
               .map((c) => c.name);

            if (searchFields.length > 0) {
               filter = {
                  $or: searchFields.map((f) => {
                     if (f === '_id' && ObjectId.isValid(trimmed)) {
                        return { _id: new ObjectId(trimmed) };
                     }
                     return { [f]: { $regex: trimmed, $options: 'i' } };
                  }),
               };
            }
         }
      }

      const sort: Record<string, 1 | -1> = {};
      if (orderBy && orderBy.col) {
         sort[orderBy.col] = orderBy.asc ? 1 : -1;
      } else {
         sort['_id'] = 1;
      }

      const docs = await coll
         .find(filter)
         .sort(sort)
         .skip(offset)
         .limit(limit)
         .toArray();

      // Collect all unique column names present in the result set or fallback to schema
      const colSet = new Set<string>(['_id']);
      const rows = docs.map((d) => {
         Object.keys(d).forEach((k) => colSet.add(k));
         return this.serializeDocument(d);
      });

      const schema = await this.getSchema(collectionName);
      schema.forEach((c) => colSet.add(c.name));

      const columns = Array.from(colSet);

      return { columns, rows };
   }

   async query(input: string): Promise<{
      columns: string[];
      rows: Record<string, any>[];
      affectedRows?: number;
   }> {
      const db = await this.getDb();
      const trimmed = input.trim();

      // Case 0: Health check / ping queries
      if (/^SELECT\s+1/i.test(trimmed) || trimmed.toLowerCase() === 'ping') {
         try {
            await db.command({ ping: 1 });
         } catch {
            // ignore
         }
         return {
            columns: ['connected'],
            rows: [{ connected: 1 }],
         };
      }

      // Case 1: JSON command or query
      // e.g. { "collection": "users", "filter": { ... } } or { "listCollections": 1 }
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
         try {
            const parsed = JSON.parse(trimmed);
            if (parsed.collection) {
               const coll = db.collection(parsed.collection);
               const filter = parsed.filter || parsed.query || {};
               const limit = parsed.limit || 100;
               const docs = await coll.find(filter).limit(limit).toArray();
               const rows = docs.map((d) => this.serializeDocument(d));
               const colSet = new Set<string>();
               rows.forEach((r) => Object.keys(r).forEach((k) => colSet.add(k)));
               return { columns: Array.from(colSet), rows };
            }

            // Raw database command
            const cmdRes = await db.command(parsed);
            return {
               columns: Object.keys(cmdRes),
               rows: [this.serializeDocument(cmdRes)],
            };
         } catch (e: any) {
            throw new Error(`Invalid JSON MongoDB query: ${e.message}`);
         }
      }

      // Case 2: Pseudo-SQL SELECT * FROM <collection> [LIMIT n]
      const selectMatch = trimmed.match(
         /^SELECT\s+\*\s+FROM\s+([a-zA-Z0-9_\-]+)(?:\s+LIMIT\s+(\d+))?/i,
      );
      if (selectMatch) {
         const collectionName = selectMatch[1];
         const limit = selectMatch[2] ? parseInt(selectMatch[2], 10) : 50;
         return this.getData(collectionName, limit, 0);
      }

      throw new Error(
         `MongoDB adapter expects a JSON query (e.g. {"collection": "name", "filter": {}}) or simple "SELECT * FROM <collection>"`,
      );
   }

   async executeSql(sql: string): Promise<void> {
      // For NoSQL, executeSql handles database commands or collection creation/drop
      const trimmed = sql.trim();
      const db = await this.getDb();

      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
         await db.command(JSON.parse(trimmed));
         return;
      }

      const dropMatch = trimmed.match(
         /^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`]?([a-zA-Z0-9_\-]+)["`]?/i,
      );
      if (dropMatch) {
         try {
            await db.collection(dropMatch[1]).drop();
         } catch {}
         return;
      }

      const createMatch = trimmed.match(
         /(?:CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?|db\.createCollection\(["'])([a-zA-Z0-9_\-]+)/i,
      );
      if (createMatch) {
         try {
            await db.createCollection(createMatch[1]);
         } catch {}
         return;
      }
   }

   async insert(collectionName: string, rows: Record<string, any>[]): Promise<void> {
      if (!rows || rows.length === 0) return;
      const db = await this.getDb();
      const coll = db.collection(collectionName);

      // Sanitize rows: convert _id string into ObjectId if valid
      const sanitized = rows.map((r) => {
         const copy = { ...r };
         if (copy._id && typeof copy._id === 'string' && ObjectId.isValid(copy._id)) {
            copy._id = new ObjectId(copy._id);
         }
         return copy;
      });

      await coll.insertMany(sanitized);
   }

   async truncateTable(collectionName: string): Promise<void> {
      const db = await this.getDb();
      await db.collection(collectionName).deleteMany({});
   }

   async renameTable(oldName: string, newName: string): Promise<void> {
      const db = await this.getDb();
      await db.collection(oldName).rename(newName);
   }

   quoteIdentifier(name: string): string {
      return name;
   }

   quoteTable(tableName: string): string {
      return tableName;
   }

   getCurrentSchema(): string {
      return this.dbName;
   }

   async close(): Promise<void> {
      if (this.client) {
         await this.client.close();
         this.client = null;
         this.db = null;
      }
   }
}
