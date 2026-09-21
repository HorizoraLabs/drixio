export interface IndexSchema {
   name: string;
   columns: string[];
   isUnique: boolean;
}

export interface ForeignKeyTarget {
   table: string;
   column: string;
   constraintName?: string;
   onDelete?: string;
   onUpdate?: string;
}

export interface ColumnSchema {
   name: string;
   type: string;
   isPk: boolean;
   nullable: boolean;
   isUnique?: boolean;
   defaultValue?: string;
   enumValues?: string[];
   isNewEnum?: boolean;
   fkTarget?: ForeignKeyTarget;
}

export interface TableSchemaInfo {
   tableName: string;
   columns: ColumnSchema[];
   indexes?: IndexSchema[];
}

export interface SchemaSnapshot {
   version: number;
   createdAt: string;
   dbType: string;
   dbName?: string;
   tables: TableSchemaInfo[];
}

export interface ColumnDiff {
   name: string;
   oldType?: string;
   newType?: string;
   oldNullable?: boolean;
   newNullable?: boolean;
   oldDefault?: string;
   newDefault?: string;
   oldPk?: boolean;
   newPk?: boolean;
   oldFk?: ForeignKeyTarget | null;
   newFk?: ForeignKeyTarget | null;
}

export interface TableDiff {
   tableName: string;
   type: 'added' | 'dropped' | 'altered';
   addedColumns: ColumnSchema[];
   droppedColumns: ColumnSchema[];
   modifiedColumns: ColumnDiff[];
   addedIndexes: IndexSchema[];
   droppedIndexes: IndexSchema[];
}

export interface SchemaDiffStats {
   addedTablesCount: number;
   droppedTablesCount: number;
   alteredTablesCount: number;
   addedColumnsCount: number;
   droppedColumnsCount: number;
   modifiedColumnsCount: number;
   addedIndexesCount: number;
   droppedIndexesCount: number;
}

export interface SchemaDiffResult {
   hasChanges: boolean;
   sourceName: string;
   targetName: string;
   tables: TableDiff[];
   stats: SchemaDiffStats;
   migrationSql: string;
   rollbackSql: string;
}

export interface DatabaseStatus {
   status: 'connected' | 'disconnected' | 'error';
   dbType: 'mysql' | 'postgres' | 'sqlite' | 'mssql' | 'mongodb' | 'unknown';
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
   /** List all available schemas in the database (e.g. PostgreSQL schemas). */
   getSchemas?(): Promise<string[]>;
   /** Get the currently active schema name. */
   getCurrentSchema?(): string;
   /** Switch the adapter to operate on a different schema. */
   setSchema?(schema: string): Promise<void>;
   /** Quote a table name with schema prefix (e.g. "zen_stream"."users"). */
   quoteTable?(tableName: string): string;
   /** List user-defined enum types in the database. */
   getCustomEnums?(): Promise<{ name: string; values: string[] }[]>;
   /** Rename an existing table. */
   renameTable?(oldName: string, newName: string): Promise<void>;
   /** Discover soft-deleted trash tables. */
   getTrashTables?(): Promise<string[]>;
   /**
    * Execute a list of SQL statements atomically inside a single transaction.
    * Adapters that manage a connection pool (e.g. Postgres) should check out a
    * dedicated client so that BEGIN / statements / COMMIT all run on the same
    * connection.  Adapters that don't implement this fall back to the sequential
    * executeSql loop in the caller.
    */
   executeTransaction?(sqls: string[]): Promise<void>;
}

export interface DBConfig {
   type: 'sqlite' | 'postgres' | 'mysql' | 'mssql' | 'mongodb' | 'unknown';
   targetUrl: string;
   source: '.env' | 'auto-detected' | 'manual';
   readOnly?: boolean;
}

export interface TableMutationOptions {
   tableName: string;
   pkColumn?: string;
   pkColumns?: string[];
   edits?: Record<string, Record<string, any>>; // { [pk]: { col: newVal } }
   inserts?: Record<string, any>[]; // [ { col: val } ]
   deletes?: string[]; // [ pk ]
   schema?: ColumnSchema[];
}

export interface PendingIndexEdits {
   added: { name?: string; columns: string[]; isUnique?: boolean }[];
   dropped: string[];
}

export interface ReferencingForeignKey {
   table: string;
   column: string;
   targetTable: string;
   targetColumn: string;
   currentType?: string;
   constraintName?: string;
   onDelete?: string;
   onUpdate?: string;
   nullable?: boolean;
}

export interface CascadeImpactResult {
   hasDependents: boolean;
   dependents: ReferencingForeignKey[];
   isNumericOnly: boolean;
   needsReindexing: boolean;
   sampleValues: string[];
}

export interface SchemaChangeOptions {
   tableName: string;
   columns?: ColumnSchema[];
   renames?: Record<string, string>;
   pendingEdits?: Record<string, Partial<ColumnSchema>>;
   pendingInserts?: Partial<ColumnSchema>[];
   pendingDeletes?: string[];
   pendingIndexEdits?: PendingIndexEdits;
   cascadeFkTypes?: boolean;
   autoReindex?: boolean;
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

export interface QuerySnippet {
   id: string;
   title: string;
   sql: string;
   description?: string;
   tags?: string[];
   isBuiltin?: boolean;
   createdAt: string;
   updatedAt?: string;
}
