export interface IndexSchema {
   name: string;
   columns: string[];
   isUnique: boolean;
}

export interface ColumnSchema {
   name: string;
   type: string;
   isPk: boolean;
   nullable: boolean;
   isUnique?: boolean;
   defaultValue?: string;
   enumValues?: string[];
   fkTarget?: { table: string; column: string };
}

export interface TableSchemaInfo {
   tableName: string;
   columns: ColumnSchema[];
}

export interface DatabaseStatus {
   status: 'connected' | 'disconnected' | 'error';
   dbType: 'mysql' | 'postgres' | 'sqlite' | 'unknown';
   dbName?: string;
   version?: string;
   activeConnections?: number;
   sizeBytes?: number;
   queries?: number;
   uptime?: number;
   transactions?: number;
   osCpuUsage?: number;
   osMemTotal?: number;
   osMemUsed?: number;
}

export interface DBAdapter {
   getStatus(): Promise<DatabaseStatus>;
   getTables(): Promise<string[]>;
   getSchema(tableName: string): Promise<ColumnSchema[]>;
   getIndexes(tableName: string): Promise<IndexSchema[]>;
   getData(
      tableName: string,
      limit?: number,
      offset?: number,
      whereClause?: string,
      orderBy?: { col: string; asc: boolean },
   ): Promise<{ columns: string[]; rows: Record<string, any>[] }>;
   query(sql: string): Promise<{
      columns: string[];
      rows: Record<string, any>[];
      affectedRows?: number;
   }>;
   executeSql(sql: string): Promise<void>;
   insert(tableName: string, rows: Record<string, any>[]): Promise<void>;
   truncateTable(tableName: string): Promise<void>;
   close(): Promise<void>;
   /** Quote a table/column identifier using the correct syntax for this database engine. */
   quoteIdentifier(name: string): string;
   /** Re-create a table with new column definitions while preserving existing data. */
   recreateTable?(
      tableName: string,
      newColumns: ColumnSchema[],
      renames?: Record<string, string>,
   ): Promise<void>;
}

export interface DBConfig {
   type: 'sqlite' | 'postgres' | 'mysql' | 'unknown';
   targetUrl: string;
   source: '.env' | 'auto-detected' | 'manual';
}

export interface TableMutationOptions {
   tableName: string;
   pkColumn?: string;
   edits?: Record<string, Record<string, any>>; // { [pk]: { col: newVal } }
   inserts?: Record<string, any>[]; // [ { col: val } ]
   deletes?: string[]; // [ pk ]
   schema?: ColumnSchema[];
}

export interface PendingIndexEdits {
   added: { name?: string; columns: string[]; isUnique?: boolean }[];
   dropped: string[];
}

export interface SchemaChangeOptions {
   tableName: string;
   columns?: ColumnSchema[];
   renames?: Record<string, string>;
   pendingEdits?: Record<string, Partial<ColumnSchema>>;
   pendingInserts?: Partial<ColumnSchema>[];
   pendingDeletes?: string[];
   pendingIndexEdits?: PendingIndexEdits;
}

/**
 * Standard Result type for operations that may fail.
 * Encapsulates success state with data or error message.
 */
export type Result<T = void> =
   | { success: true; data: T }
   | { success: false; error: string; code?: string; cause?: unknown };

export function ok<T>(data: T): Result<T> {
   return { success: true, data };
}

export function okVoid(): Result<void> {
   return { success: true, data: undefined };
}

export function err<T = void>(
   error: string,
   code?: string,
   cause?: unknown,
): Result<T> {
   return { success: false, error, code, cause };
}

export type SchemaResult = Result<void>;

