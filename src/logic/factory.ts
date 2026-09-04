import { DBAdapter, DBConfig } from './types.js';
import {
   SqliteAdapter,
   PostgresAdapter,
   MysqlAdapter,
} from './adapters/index.js';

export function createDBAdapter(config: DBConfig): DBAdapter {
   switch (config.type) {
      case 'sqlite':
         return new SqliteAdapter(config.targetUrl);
      case 'postgres':
         return new PostgresAdapter(config.targetUrl);
      case 'mysql':
         return new MysqlAdapter(config.targetUrl);
      default:
         throw new Error(`Unsupported database type: ${config.type}`);
   }
}
