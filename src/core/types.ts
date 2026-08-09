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
  defaultValue?: string;
  enumValues?: string[];
  fkTarget?: { table: string; column: string };
}

export interface DatabaseStatus {
  status: "connected" | "disconnected" | "error";
  dbType: "mysql" | "postgres" | "sqlite" | "unknown";
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
    orderBy?: { col: string; asc: boolean }
  ): Promise<{ columns: string[]; rows: Record<string, any>[] }>;
  query(sql: string): Promise<{ columns: string[]; rows: Record<string, any>[] }>;
  executeSql(sql: string): Promise<void>;
  insert(tableName: string, rows: Record<string, any>[]): Promise<void>;
  close(): Promise<void>;
  /** Quote a table/column identifier using the correct syntax for this database engine. */
  quoteIdentifier(name: string): string;
}

export interface DBConfig {
  type: "sqlite" | "postgres" | "mysql" | "unknown";
  targetUrl: string;
  source: ".env" | "auto-detected" | "manual";
}
