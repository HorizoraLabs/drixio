import { DBAdapter, DBConfig } from './types.js';
import {
   SqliteAdapter,
   PostgresAdapter,
   MysqlAdapter,
   MssqlAdapter,
   MongoAdapter,
} from './adapters/index.js';

export function createDBAdapter(config: DBConfig): DBAdapter {
   switch (config.type) {
      case 'sqlite':
         return new SqliteAdapter(config.targetUrl);
      case 'postgres':
         return new PostgresAdapter(config.targetUrl);
      case 'mysql':
         return new MysqlAdapter(config.targetUrl);
      case 'mssql':
         return new MssqlAdapter(config.targetUrl);
      case 'mongodb':
         return new MongoAdapter(config.targetUrl);
      default:
         throw new Error(`Unsupported database type: ${config.type}`);
   }
}

