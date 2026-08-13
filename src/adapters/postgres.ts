import { DBAdapter, ColumnSchema } from "../core/types.js";
import pg from "pg";

export class PostgresAdapter implements DBAdapter {
  private client: pg.Client;
  private connected: boolean = false;

  constructor(connection: string) {
    this.client = new pg.Client({
      connectionString: connection,
    });
  }

  private async connectIfNecessary() {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  quoteIdentifier(name: string): string {
    // Postgres uses double quotes for identifiers; escape any embedded double quotes
    return `"${name.replace(/"/g, '""')}"`;
  }

  async getStatus(): Promise<import("../core/types.js").DatabaseStatus> {
    try {
      await this.connectIfNecessary();
      
      const dbRes = await this.client.query("SELECT current_database() as db, version() as version");
      const dbName = dbRes.rows[0]?.db;
      const version = dbRes.rows[0]?.version?.split(" ")[1] || dbRes.rows[0]?.version; // Try to extract just version number

      let activeConnections = 0;
      let transactions = 0;
      let uptime = 0;
      
      try {
         const uptimeRes = await this.client.query("SELECT EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time())) as uptime");
         uptime = parseInt(uptimeRes.rows[0]?.uptime || "0", 10);
      } catch (e) {
         // ignore
      }
      
      // requires pg_stat_database permission but usually available
      try {
         const statRes = await this.client.query("SELECT sum(numbackends) as conns, sum(xact_commit + xact_rollback) as txs FROM pg_stat_database");
         activeConnections = parseInt(statRes.rows[0]?.conns || "0", 10);
         transactions = parseInt(statRes.rows[0]?.txs || "0", 10);
      } catch (e) {
         // ignore if no permission
      }

      let sizeBytes = 0;
      try {
         const sizeRes = await this.client.query("SELECT pg_database_size(current_database()) as size");
         sizeBytes = parseInt(sizeRes.rows[0]?.size || "0", 10);
      } catch (e) {
         // ignore
      }

      return {
        status: "connected",
        dbType: "postgres",
        dbName,
        version,
        activeConnections,
        sizeBytes,
        transactions,
        uptime
      };
    } catch (e: any) {
      return {
        status: "error",
        dbType: "postgres"
      };
    }
  }


  async getTables(): Promise<string[]> {
    await this.connectIfNecessary();
    const query = `
      SELECT tablename 
      FROM pg_catalog.pg_tables 
      WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'
      ORDER BY tablename;
    `;
    const res = await this.client.query(query);
    return res.rows.map((row) => row.tablename);
  }

  async getSchema(tableName: string): Promise<ColumnSchema[]> {
    await this.connectIfNecessary();

    const query = `
      SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
             (SELECT count(*) 
              FROM information_schema.key_column_usage kcu 
              JOIN information_schema.table_constraints tc 
                ON kcu.constraint_name = tc.constraint_name 
              WHERE tc.constraint_type = 'PRIMARY KEY' 
                AND kcu.table_name = c.table_name 
                AND kcu.column_name = c.column_name
                AND kcu.table_schema = c.table_schema) as is_pk,
             (SELECT ccu.table_name || '.' || ccu.column_name
              FROM information_schema.table_constraints tc 
              JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
              JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
              WHERE tc.constraint_type = 'FOREIGN KEY' 
                AND tc.table_name = c.table_name
                AND tc.table_schema = c.table_schema
                AND kcu.column_name = c.column_name
              LIMIT 1) as fk_target
      FROM information_schema.columns c
      WHERE c.table_name = $1 AND c.table_schema = 'public'
      ORDER BY c.ordinal_position;
    `;
    const res = await this.client.query(query, [tableName]);

    return res.rows.map((col) => {
      let fkTarget;
      if (col.fk_target) {
        const parts = col.fk_target.split(".");
        fkTarget = { table: parts[0], column: parts[1] };
      }
      return {
        name: col.column_name,
        type: col.data_type,
        isPk: parseInt(col.is_pk) > 0,
        nullable: col.is_nullable === "YES",
        defaultValue:
          col.column_default != null ? String(col.column_default) : undefined,
        fkTarget,
      };
    });
  }

  async getIndexes(tableName: string): Promise<import("../core/types.js").IndexSchema[]> {
    await this.connectIfNecessary();
    
    const query = `
      SELECT
          i.relname as index_name,
          a.attname as column_name,
          ix.indisunique as is_unique,
          ix.indisprimary as is_primary
      FROM
          pg_class t,
          pg_class i,
          pg_index ix,
          pg_attribute a
      WHERE
          t.oid = ix.indrelid
          AND i.oid = ix.indexrelid
          AND a.attrelid = t.oid
          AND a.attnum = ANY(ix.indkey)
          AND t.relkind = 'r'
          AND t.relname = $1
      ORDER BY
          i.relname, a.attnum;
    `;
    
    const res = await this.client.query(query, [tableName]);
    const rows = res.rows;
    
    const indexMap = new Map<string, import("../core/types.js").IndexSchema>();
    
    for (const row of rows) {
      if (row.is_primary) continue; // Skip primary key indexes
      
      const idxName = row.index_name;
      if (!indexMap.has(idxName)) {
        indexMap.set(idxName, {
          name: idxName,
          columns: [],
          isUnique: row.is_unique
        });
      }
      
      indexMap.get(idxName)!.columns.push(row.column_name);
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
    await this.connectIfNecessary();

    const schema = await this.getSchema(tableName);
    const columns = schema.map((col) => col.name);

    let sql = `SELECT * FROM ${this.quoteIdentifier(tableName)}`;
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }
    if (orderBy) {
      sql += ` ORDER BY ${this.quoteIdentifier(orderBy.col)} ${orderBy.asc ? "ASC" : "DESC"}`;
    }
    sql += ` LIMIT $1 OFFSET $2`;

    const res = await this.client.query(sql, [limit, offset]);
    return { columns, rows: res.rows };
  }

  async query(
    sql: string,
  ): Promise<{ columns: string[]; rows: Record<string, any>[] }> {
    await this.connectIfNecessary();
    const res = await this.client.query(sql);
    let columns: string[] = [];
    if (res.fields) {
      columns = res.fields.map((f) => f.name);
    }
    return { columns, rows: res.rows || [] };
  }

  async executeSql(sql: string): Promise<void> {
    await this.connectIfNecessary();
    await this.client.query(sql);
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.client.end();
      this.connected = false;
    }
  }

  async insert(
    tableName: string,
    rows: Record<string, any>[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.connectIfNecessary();
    const cols = Object.keys(rows[0]);
    const colsQuoted = cols.map((c) => this.quoteIdentifier(c)).join(", ");
    // Postgres placeholder format is $1, $2, $3 etc.
    for (const row of rows) {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const sql = `INSERT INTO ${this.quoteIdentifier(tableName)} (${colsQuoted}) VALUES (${placeholders})`;
      const values = cols.map((c) => row[c]);
      await this.client.query(sql, values);
    }
  }
}
