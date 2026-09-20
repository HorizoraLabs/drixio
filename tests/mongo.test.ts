import { describe, it, expect } from 'vitest';
import { MongoDialect, getDialect } from '../src/logic/dialect.js';
import { MongoAdapter } from '../src/logic/adapters/mongo.js';
import { classifyDatabaseUrl, assembleConnectionUrl } from '../src/logic/loader.js';
import { ColumnSchema } from '../src/logic/types.js';
import { ObjectId } from 'mongodb';

describe('Mongo Dialect', () => {
   const dialect = new MongoDialect();

   it('should keep identifiers unchanged without SQL quotes', () => {
      expect(dialect.quoteIdentifier('users')).toBe('users');
      expect(dialect.quoteIdentifier('orders_2026')).toBe('orders_2026');
   });

   it('should escape double quotes in strings', () => {
      expect(dialect.escapeString('hello "world"')).toBe('hello \\"world\\"');
   });

   it('should generate collection creation snippet and inferred schema comments', () => {
      const columns: ColumnSchema[] = [
         { name: '_id', type: 'ObjectId', isPk: true, nullable: false },
         { name: 'username', type: 'String', isPk: false, nullable: false },
         { name: 'age', type: 'Int32', isPk: false, nullable: true },
         { name: 'tags', type: 'Array', isPk: false, nullable: true },
      ];

      const snippet = dialect.buildCreateTable('users', columns);
      expect(snippet).toContain('// MongoDB Collection: users');
      expect(snippet).toContain('//   _id: ObjectId (Primary Key)');
      expect(snippet).toContain('//   username: String');
      expect(snippet).toContain('//   age: Int32');
      expect(snippet).toContain('//   tags: Array');
      expect(snippet).toContain('db.createCollection("users");');
   });

   it('should resolve MongoDialect from getDialect("mongodb")', () => {
      const d = getDialect('mongodb');
      expect(d).toBeInstanceOf(MongoDialect);
   });
});

describe('Mongo Loader & URL Classification', () => {
   const cwd = process.cwd();

   it('should classify mongodb:// URLs', () => {
      const res = classifyDatabaseUrl('mongodb://localhost:27017/mydb', cwd);
      expect(res).toEqual({
         type: 'mongodb',
         targetUrl: 'mongodb://localhost:27017/mydb',
      });
   });

   it('should classify mongodb+srv:// Atlas cluster URLs', () => {
      const res = classifyDatabaseUrl('mongodb+srv://admin:pass@cluster0.abc.mongodb.net/production', cwd);
      expect(res).toEqual({
         type: 'mongodb',
         targetUrl: 'mongodb+srv://admin:pass@cluster0.abc.mongodb.net/production',
      });
   });

   it('should assemble connection URL for mongodb with default port and database', () => {
      const url = assembleConnectionUrl('mongodb', 'localhost', '', '', '', '');
      expect(url).toBe('mongodb://localhost:27017/test');

      const authed = assembleConnectionUrl('mongodb', 'mongo.internal', '27018', 'appuser', 'secret', 'analytics');
      expect(authed).toBe('mongodb://appuser:secret@mongo.internal:27018/analytics');
   });
});

describe('MongoAdapter Unit Tests', () => {
   const adapter = new MongoAdapter('mongodb://localhost:27017/unit_test_db');

   it('should parse database name correctly from URL', () => {
      expect(adapter.getCurrentSchema()).toBe('unit_test_db');
      expect(adapter.quoteIdentifier('coll')).toBe('coll');
      expect(adapter.quoteTable('coll')).toBe('coll');
   });

   it('should parse fallback database name if none in URL', () => {
      const defaultAdapter = new MongoAdapter('mongodb://localhost:27017');
      expect(defaultAdapter.getCurrentSchema()).toBe('test');
   });

   it('should serialize BSON types into JSON-friendly objects', () => {
      const serialize = (adapter as any).serializeDocument.bind(adapter);
      const testId = new ObjectId('507f1f77bcf86cd799439011');
      const testDate = new Date('2026-09-20T12:00:00.000Z');

      const row = serialize({
         _id: testId,
         name: 'Drixio User',
         createdAt: testDate,
         score: 99.5,
         active: true,
         details: { role: 'admin' },
         nullVal: null,
      });

      expect(row._id).toBe('507f1f77bcf86cd799439011');
      expect(row.name).toBe('Drixio User');
      expect(row.createdAt).toBe('2026-09-20T12:00:00.000Z');
      expect(row.score).toBe(99.5);
      expect(row.active).toBe(true);
      expect(row.details).toEqual({ role: 'admin' });
      expect(row.nullVal).toBeNull();
   });

   it('should infer BSON types accurately from sampled values', () => {
      const infer = (adapter as any).inferBsonType.bind(adapter);

      expect(infer(null)).toBe('Null');
      expect(infer(undefined)).toBe('Null');
      expect(infer(new ObjectId())).toBe('ObjectId');
      expect(infer(new Date())).toBe('Date');
      expect(infer(['a', 'b'])).toBe('Array');
      expect(infer(true)).toBe('Boolean');
      expect(infer(42)).toBe('Int32');
      expect(infer(3.14159)).toBe('Double');
      expect(infer('Hello World')).toBe('String');
      expect(infer('2026-09-20T12:34:56.789Z')).toBe('Date');
      expect(infer({ key: 'value' })).toBe('Object');
   });
});

