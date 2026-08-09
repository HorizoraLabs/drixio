import type { DatabaseSync } from "node:sqlite";
import { DBAdapter, ColumnSchema } from "../core/types.js";

export class SqliteAdapter implements DBAdapter {
  private dbPath: string;
  private db: DatabaseSync | null = null;

  constructor(connection: string) {
    this.dbPath = connection;
  }

  private async getDb(): Promise<DatabaseSync> {
    if (!this.db) {
      const fs = await import("node:" + "fs");
      if (!fs.existsSync(this.dbPath)) {
        throw new Error(`Failed to found database file at: ${this.dbPath}`);
      }
      const sqlite = await import("node:" + "sqlite");
      this.db = new sqlite.DatabaseSync(this.dbPath);
    }
    return this.db!;
  }

  quoteIdentifier(name: string): string {
    // SQLite uses double quotes for identifiers; escape any embedded double quotes
    return `"${name.replace(/"/g, '""')}"`;
  }

  async getStatus(): Promise<import("../core/types.js").DatabaseStatus> {
    try {
      const db = await this.getDb();
      
      const vQuery = db.prepare("SELECT sqlite_version() as v");
      const vRow = vQuery.get() as { v: string };
      
      const fs = await import("node:fs");
      const stats = fs.statSync(this.dbPath);

      // Extract filename as dbName
      const path = await import("node:path");
      const dbName = path.basename(this.dbPath);

      return {
        status: "connected",
        dbType: "sqlite",
        dbName,
        version: vRow?.v,
        activeConnections: 1, // SQLite is single file, essentially 1 active connection for the app
        sizeBytes: stats.size,
        uptime: process.uptime()
      };
    } catch (e: any) {
      return {
        status: "error",
        dbType: "sqlite"
      };
    }
  }


  async getTables(): Promise<string[]> {
    const db = await this.getDb();
    const results = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
      )
      .all() as { name: string }[];
    return results.map((row) => row.name);
  }

  async getSchema(tableName: string): Promise<ColumnSchema[]> {
    const db = await this.getDb();
    const quoted = this.quoteIdentifier(tableName);

    const pragmaQuery = db.prepare(`PRAGMA table_info(${quoted})`);
    const info = pragmaQuery.all() as {
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: any;
      pk: number;
    }[];

    const fkQuery = db.prepare(`PRAGMA foreign_key_list(${quoted})`);
    const fks = fkQuery.all() as {
      from: string;
      table: string;
      to: string;
    }[];

    return info.map((col) => {
      const fk = fks.find((f) => f.from === col.name);
      return {
        name: col.name,
        type: col.type,
        isPk: col.pk > 0,
        nullable: col.notnull === 0,
        defaultValue: col.dflt_value != null ? String(col.dflt_value) : undefined,
        fkTarget: fk ? { table: fk.table, column: fk.to } : undefined,
      };
    });
  }

  async getIndexes(tableName: string): Promise<import("../core/types.js").IndexSchema[]> {
    const db = await this.getDb();
    const quoted = this.quoteIdentifier(tableName);
    
    // Get list of indexes for the table
    const indexListQuery = db.prepare(`PRAGMA index_list(${quoted})`);
    const indexList = indexListQuery.all() as { name: string; unique: number; origin: string }[];
    
    const indexes: import("../core/types.js").IndexSchema[] = [];
    
    for (const idx of indexList) {
      // origin 'c' means created via CREATE INDEX, 'u' means created by UNIQUE constraint, 'pk' means primary key
      // We generally want to show 'c' and 'u', maybe skip 'pk' if it's already handled by the PK column
      if (idx.origin === 'pk') continue;
      
      const indexInfoQuery = db.prepare(`PRAGMA index_info(${this.quoteIdentifier(idx.name)})`);
      const columns = indexInfoQuery.all() as { name: string }[];
      
      indexes.push({
        name: idx.name,
        columns: columns.map(c => c.name),
        isUnique: idx.unique > 0
      });
    }
    
    return indexes;
  }

  async getData(
    tableName: string,
    limit: number = 50,
    offset: number = 0,
    whereClause?: string,
    orderBy?: { col: string; asc: boolean },
  ): Promise<{ columns: string[]; rows: Record<string, any>[] }> {
    const db = await this.getDb();

    const schema = await this.getSchema(tableName);
    const columns = schema.map((col) => col.name);

    let sql = `SELECT * FROM ${this.quoteIdentifier(tableName)}`;
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }
    if (orderBy) {
      sql += ` ORDER BY ${this.quoteIdentifier(orderBy.col)} ${orderBy.asc ? "ASC" : "DESC"}`;
    }
    sql += ` LIMIT ${limit} OFFSET ${offset}`;

    const dataQuery = db.prepare(sql);
    const rows = dataQuery.all() as Record<string, any>[];
    return { columns, rows };
  }

  async query(
    sql: string,
  ): Promise<{ columns: string[]; rows: Record<string, any>[] }> {
    const db = await this.getDb();
    const trimmed = sql.trim().toUpperCase();
    const isRead =
      trimmed.startsWith("SELECT") ||
      trimmed.startsWith("PRAGMA") ||
      trimmed.startsWith("EXPLAIN") ||
      trimmed.startsWith("WITH");

    if (isRead) {
      const query = db.prepare(sql);
      const rows = query.all() as Record<string, any>[];
      let columns: string[] = [];
      if (rows.length > 0) {
        columns = Object.keys(rows[0]);
      }
      return { columns, rows };
    } else {
      const query = db.prepare(sql);
      query.run();
      return { columns: ["Result"], rows: [{ Result: "Success" }] };
    }
  }

  async executeSql(sql: string): Promise<void> {
    const db = await this.getDb();
    db.exec(sql);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async insert(
    tableName: string,
    rows: Record<string, any>[],
  ): Promise<void> {
    if (rows.length === 0) return;
    const db = await this.getDb();
    const cols = Object.keys(rows[0]);
    const colsQuoted = cols.map((c) => this.quoteIdentifier(c)).join(", ");
    const placeholders = cols.map(() => "?").join(", ");
    const sql = `INSERT INTO ${this.quoteIdentifier(tableName)} (${colsQuoted}) VALUES (${placeholders})`;
    const stmt = db.prepare(sql);
    for (const row of rows) {
      const values = cols.map((c) => row[c]);
      stmt.run(...values);
    }
  }
}
