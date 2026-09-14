import { describe, it, expect } from 'vitest';
import { parseReplCommand } from '../src/logic/repl.js';

describe('REPL: parseReplCommand', () => {
   it('should parse CONNECT command with url', () => {
      const res1 = parseReplCommand('CONNECT sqlite:///tmp/test.db;');
      expect(res1.type).toBe('connect');
      expect(res1.url).toBe('sqlite:///tmp/test.db');

      const res2 = parseReplCommand(
         'connect postgres://user:pass@localhost:5432/mydb',
      );
      expect(res2.type).toBe('connect');
      expect(res2.url).toBe('postgres://user:pass@localhost:5432/mydb');
   });

   it('should parse DISCONNECT command', () => {
      const res1 = parseReplCommand('DISCONNECT;');
      expect(res1.type).toBe('disconnect');

      const res2 = parseReplCommand('   disconnect   ');
      expect(res2.type).toBe('disconnect');
   });

   it('should parse CREATE DATABASE command with quotes or plain identifier', () => {
      const res1 = parseReplCommand('CREATE DATABASE my_analytics_db;');
      expect(res1.type).toBe('create_database');
      expect(res1.dbName).toBe('my_analytics_db');

      const res2 = parseReplCommand(
         'create database if not exists "custom_db";',
      );
      expect(res2.type).toBe('create_database');
      expect(res2.dbName).toBe('custom_db');

      const res3 = parseReplCommand('CREATE DATABASE `store_db`;');
      expect(res3.type).toBe('create_database');
      expect(res3.dbName).toBe('store_db');
   });

   it('should treat standard SQL statements as sql type', () => {
      const res1 = parseReplCommand('SELECT * FROM users;');
      expect(res1.type).toBe('sql');

      const res2 = parseReplCommand(
         "INSERT INTO posts (title) VALUES ('Hello World');",
      );
      expect(res2.type).toBe('sql');
   });
});
