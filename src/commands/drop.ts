import pc from "picocolors";
import fs from "fs/promises";
import path from "path";

export async function runDropDbCommand(args: string[]) {
  const { select, input, password, confirm } = await import("@inquirer/prompts");

  let dialect = args[0];
  if (!dialect || !["sqlite", "mysql", "postgres"].includes(dialect.toLowerCase())) {
    dialect = await select({
      message: "Which database type do you want to drop?",
      choices: [
        { name: "SQLite (Local File)", value: "sqlite" },
        { name: "MySQL (Local Server)", value: "mysql" },
        { name: "PostgreSQL (Local Server)", value: "postgres" }
      ]
    });
  }

  dialect = dialect.toLowerCase();

  let dbName = args[1];
  
  if (dialect === "sqlite") {
    if (!dbName) {
      dbName = await input({ message: "Enter the SQLite filename to delete (e.g. database.sqlite):", default: "database.sqlite" });
    }
    if (!dbName.endsWith(".sqlite") && !dbName.endsWith(".db")) {
      dbName += ".sqlite";
    }

    const sure = await confirm({ message: `Are you absolutely sure you want to delete ${dbName}? This cannot be undone!`, default: false });
    if (!sure) {
      console.log(pc.yellow("Aborted."));
      process.exit(0);
    }

    const dbPath = path.resolve(process.cwd(), dbName);
    try {
      await fs.unlink(dbPath);
      console.log(pc.green(`✔ Deleted local database file: ${dbName}`));
    } catch (e: any) {
      console.log(pc.red(`✘ Failed to delete file: ${e.message}`));
    }
  } else {
    // MySQL or Postgres
    console.log(pc.dim(`Please provide credentials for your local ${dialect} server to drop a database.`));
    
    const host = await input({ message: "Server Host:", default: "localhost" });
    const port = await input({ message: "Server Port:", default: dialect === "mysql" ? "3306" : "5432" });
    const user = await input({ message: "Username:", default: dialect === "mysql" ? "root" : "postgres" });
    const pass = await password({ message: "Password (leave empty if none):" });
    
    if (!dbName) {
      dbName = await input({ message: "Which Database Name do you want to DROP?" });
    }

    const sure = await confirm({ message: `Are you absolutely sure you want to DROP DATABASE '${dbName}' from ${host}? All data will be lost!`, default: false });
    if (!sure) {
      console.log(pc.yellow("Aborted."));
      process.exit(0);
    }

    console.log(pc.cyan(`\nConnecting to local server to drop database '${dbName}'...`));
    
    try {
      if (dialect === "mysql") {
        const mysql = await import("mysql2/promise");
        const conn = await mysql.createConnection({ host, port: parseInt(port), user, password: pass });
        await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        await conn.end();
      } else if (dialect === "postgres") {
        const pg = await import("pg");
        const conn = new pg.Client({ host, port: parseInt(port), user, password: pass, database: "postgres" });
        await conn.connect();
        await conn.query(`DROP DATABASE IF EXISTS "${dbName}"`);
        await conn.end();
      }
      console.log(pc.green(`✔ Dropped database: ${dbName}`));
    } catch (e: any) {
      console.log(pc.red(`✘ Failed to drop database on server: ${e.message}`));
      process.exit(1);
    }
  }

  process.exit(0);
}
