import { DBAdapter, ColumnSchema } from "../core/types.js";
import mysql from "mysql2/promise";

export class MysqlAdapter implements DBAdapter {
  private connection: string;
  private pool: mysql.Pool | null = null;

  constructor(connection: string) {
    this.connection = connection;
  }

  private async getPool() {
    if (!this.pool) {
      this.pool = mysql.createPool(this.connection);
      this.pool.on('connection', (connection) => {
        connection.query("SET SESSION sql_mode = 'ANSI_QUOTES'");
      });
    }
    return this.pool;
  }

  quoteIdentifier(name: string): string {
    // MySQL uses backticks for identifiers; escape any embedded backticks
    return `\`${name.replace(/`/g, "``")}\``;
  }

  async getStatus(): Promise<import("../core/types.js").DatabaseStatus> {
    try {
      const pool = await this.getPool();
      
      const [dbRow] = await pool.query("SELECT DATABASE() as db, VERSION() as version");
      const dbName = (dbRow as any[])[0]?.db;
      const version = (dbRow as any[])[0]?.version;

      const [statusRows] = await pool.query("SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected', 'Queries', 'Uptime')");
      let activeConnections = 0;
      let queries = 0;
      let uptime = 0;
      for (const row of (statusRows as any[])) {
        if (row.Variable_name === 'Threads_connected') activeConnections = parseInt(row.Value, 10);
        if (row.Variable_name === 'Queries') queries = parseInt(row.Value, 10);
        if (row.Variable_name === 'Uptime') uptime = parseInt(row.Value, 10);
      }

      let sizeBytes = 0;
      if (dbName) {
        const [sizeRow] = await pool.query("SELECT SUM(data_length + index_length) as size FROM information_schema.TABLES WHERE table_schema = ?", [dbName]);
        sizeBytes = parseInt((sizeRow as any[])[0]?.size || "0", 10);
      }

      return {
        status: "connected",
        dbType: "mysql",
        dbName,
        version,
        activeConnections,
        sizeBytes,
        queries,
        uptime
      };
    } catch (e: any) {
      return {
        status: "error",
        dbType: "mysql"
      };
    }
  }


  async getTables(): Promise<string[]> {
    const pool = await this.getPool();
    const [rows] = await pool.query("SHOW TABLES;");
    // SHOW TABLES returns objects where the key is like "Tables_in_dbname"
    // Extract the first value of each row object
    return (rows as any[]).map((row) => Object.values(row)[0] as string);
  }

  async getSchema(tableName: string): Promise<ColumnSchema[]> {
    const pool = await this.getPool();

    const [rows] = await pool.query(
      `SHOW COLUMNS FROM ${this.quoteIdentifier(tableName)}`,
    );
    const columns = rows as any[];

    const [fkRows] = await pool.query(
      `
      SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = ? 
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `,
      [tableName],
    );
    const fks = fkRows as any[];

    return columns.map((col) => {
      const fk = fks.find((f) => f.COLUMN_NAME === col.Field);

      // Parse ENUM values from type string like "enum('a','b','c')"
      let enumValues: string[] | undefined;
      const typeUpper = (col.Type as string).toUpperCase();
      if (typeUpper.startsWith("ENUM")) {
        const enumMatch = (col.Type as string).match(/enum\((.*?)\)/i);
        if (enumMatch) {
          enumValues = enumMatch[1]
            .split(",")
            .map((s) => s.trim().replace(/^'|'$/g, ""));
        }
      }

      return {
        name: col.Field,
        type: col.Type,
        isPk: col.Key === "PRI",
        nullable: col.Null === "YES",
        defaultValue: col.Default != null ? String(col.Default) : undefined,
        enumValues,
        fkTarget: fk
          ? {
              table: fk.REFERENCED_TABLE_NAME,
              column: fk.REFERENCED_COLUMN_NAME,
            }
          : undefined,
      };
    });
  }

  async getIndexes(tableName: string): Promise<import("../core/types.js").IndexSchema[]> {
    const pool = await this.getPool();
    
    const [rows] = await pool.query(`SHOW INDEX FROM ${this.quoteIdentifier(tableName)}`) as any[];
    
    const indexMap = new Map<string, import("../core/types.js").IndexSchema>();
    
    for (const row of rows) {
      if (row.Key_name === 'PRIMARY') continue; // Skip primary key
      
      const idxName = row.Key_name;
      if (!indexMap.has(idxName)) {
        indexMap.set(idxName, {
          name: idxName,
          columns: [],
          isUnique: row.Non_unique === 0
        });
      }
      
      indexMap.get(idxName)!.columns.push(row.Column_name);
    }
    
    return Array.from(indexMap.values());
  }

  async getData(
    tableName: string,
    limit: number = 50,
    offset: number = 0,
    whereClause?: string,
    orderBy?: { col: string; asc: boolean },
  ): Promise<{ columns: string[]; rows: Record<string, any>[] }> {
    const pool = await this.getPool();

    const schema = await this.getSchema(tableName);
    const columns = schema.map((col) => col.name);

    let sql = `SELECT * FROM ${this.quoteIdentifier(tableName)}`;
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }
    if (orderBy) {
      sql += ` ORDER BY ${this.quoteIdentifier(orderBy.col)} ${orderBy.asc ? "ASC" : "DESC"}`;
    }
    const [rows] = await pool.query(sql + " LIMIT ? OFFSET ?", [limit, offset]);
    return { columns, rows: rows as Record<string, any>[] };
  }

  async query(
    sql: string,
  ): Promise<{ columns: string[]; rows: Record<string, any>[] }> {
    const pool = await this.getPool();
    const [rows, fields] = await pool.query(sql);
    let columns: string[] = [];
    let data: Record<string, any>[] = [];

    if (fields && Array.isArray(fields)) {
      columns = fields.map((f: any) => f.name);
      data = rows as Record<string, any>[];
    } else {
      // It's a mutation query (INSERT/UPDATE/DELETE)
      columns = ["Result"];
      data = [
        { Result: "Success", AffectedRows: (rows as any).affectedRows },
      ];
    }

    return { columns, rows: data };
  }

  async executeSql(sql: string): Promise<void> {
    const pool = await this.getPool();
    await pool.query(sql);
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async insert(
    tableName: string,
    rows: Record<string, any>[],
  ): Promise<void> {
    if (rows.length === 0) return;
    const pool = await this.getPool();
    const cols = Object.keys(rows[0]);
    const colsQuoted = cols.map((c) => this.quoteIdentifier(c)).join(", ");
    const placeholders = cols.map(() => "?").join(", ");
    const sql = `INSERT INTO ${this.quoteIdentifier(tableName)} (${colsQuoted}) VALUES (${placeholders})`;
    for (const row of rows) {
      const values = cols.map((c) => row[c]);
      await pool.query(sql, values);
    }
  }
}
