import pc from "picocolors";
import fs from "fs/promises";
import path from "path";

export async function runInitCommand(args: string[]) {
  const { select, input, password } = await import("@inquirer/prompts");

  let dialect = args[0];
  if (
    !dialect ||
    !["sqlite", "mysql", "postgres"].includes(dialect.toLowerCase())
  ) {
    dialect = await select({
      message: "Which database do you want to initialize locally?",
      choices: [
        { name: "SQLite (Local File)", value: "sqlite" },
        { name: "MySQL (Local Server)", value: "mysql" },
        { name: "PostgreSQL (Local Server)", value: "postgres" },
      ],
    });
  }

  dialect = dialect.toLowerCase();
  console.log(pc.cyan(`\nInitializing a local ${dialect} database...`));

  let dbUrl = "";

  if (dialect === "sqlite") {
    let dbName = args[1] || "database.sqlite";
    if (!dbName.endsWith(".sqlite") && !dbName.endsWith(".db")) {
      dbName += ".sqlite";
    }
    const dbPath = path.resolve(process.cwd(), dbName);

    try {
      await fs.access(dbPath);
      console.log(pc.yellow(`File ${dbName} already exists.`));
    } catch {
      // Touch file
      await fs.writeFile(dbPath, "");
      console.log(pc.green(`✔ Created local database file: ${dbName}`));
    }

    dbUrl = `file:${dbName}`;
  } else {
    // MySQL or Postgres
    console.log(
      pc.dim(
        "Please provide credentials for your local server (e.g. running via XAMPP, Homebrew, etc.)",
      ),
    );

    const host = await input({ message: "Server Host:", default: "localhost" });
    const port = await input({
      message: "Server Port:",
      default: dialect === "mysql" ? "3306" : "5432",
    });
    const user = await input({
      message: "Username:",
      default: dialect === "mysql" ? "root" : "postgres",
    });
    const pass = await password({ message: "Password (leave empty if none):" });
    let dbName = args[1];
    if (!dbName) {
      dbName = await input({ message: "New Database Name (e.g. my_project):" });
    }

    if (!dbName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
      console.log(
        pc.red(
          "Invalid database name. Please use only letters, numbers, and underscores.",
        ),
      );
      process.exit(1);
    }

    console.log(
      pc.cyan(`\nConnecting to local server to create database '${dbName}'...`),
    );

    try {
      if (dialect === "mysql") {
        const mysql = await import("mysql2/promise");
        const conn = await mysql.createConnection({
          host,
          port: parseInt(port),
          user,
          password: pass,
        });
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await conn.end();
      } else if (dialect === "postgres") {
        const pg = await import("pg");
        const conn = new pg.Client({
          host,
          port: parseInt(port),
          user,
          password: pass,
          database: "postgres", // Explicitly connect to default maintenance db
        });
        await conn.connect();
        // Postgres does not support CREATE DATABASE IF NOT EXISTS natively in a simple query easily,
        // we check existence first.
        const res = await conn.query(
          "SELECT 1 FROM pg_database WHERE datname = $1",
          [dbName],
        );
        if (res.rowCount === 0) {
          await conn.query(`CREATE DATABASE "${dbName}"`);
        }
        await conn.end();
      }
      console.log(pc.green(`✔ Created local database: ${dbName}`));
    } catch (e: any) {
      console.log(
        pc.red(`✘ Failed to create database on server: ${e.message}`),
      );
      console.log(
        pc.dim(
          `\nCould not connect to the local ${dialect} server on ${host}:${port}.`,
        ),
      );

      if (
        e.code === "ECONNREFUSED" ||
        e.message.includes("ECONNREFUSED") ||
        e.message.includes("connect")
      ) {
        console.log(
          pc.yellow(
            `\n💡 It seems you don't have ${dialect} installed or running locally.`,
          ),
        );
        if (dialect === "mysql") {
          console.log(
            pc.white(
              `👉 Download MySQL here: ${pc.cyan("https://dev.mysql.com/downloads/installer/")}`,
            ),
          );
        } else if (dialect === "postgres") {
          console.log(
            pc.white(
              `👉 Download PostgreSQL here: ${pc.cyan("https://www.postgresql.org/download/")}`,
            ),
          );
          console.log(
            pc.white(
              `👉 Or use Postgres.app for Mac: ${pc.cyan("https://postgresapp.com/")}`,
            ),
          );
        }
        console.log(
          pc.dim(
            `(Alternatively, you can run 'drixio init sqlite' for a zero-install local database!)`,
          ),
        );
      }
      process.exit(1);
    }

    const scheme = dialect === "postgres" ? "postgres://" : "mysql://";
    const auth = pass ? `${user}:${pass}` : `${user}`;
    dbUrl = `${scheme}${auth}@${host}:${port}/${dbName}`;
  }

  // Create .env file
  const envPath = path.resolve(process.cwd(), ".env");
  let envContent = "";
  try {
    envContent = await fs.readFile(envPath, "utf-8");
  } catch {
    // .env doesn't exist, which is fine
  }

  if (envContent.includes("DATABASE_URL=")) {
    // Replace existing
    envContent = envContent.replace(
      /DATABASE_URL=.*/g,
      `DATABASE_URL=${dbUrl}`,
    );
    console.log(
      pc.yellow(`✔ Updated existing .env file with new DATABASE_URL`),
    );
  } else {
    // Append or create new
    envContent +=
      (envContent.endsWith("\n") || envContent.length === 0 ? "" : "\n") +
      `DATABASE_URL=${dbUrl}\n`;
    console.log(pc.green(`✔ Saved connection string to .env file`));
  }

  await fs.writeFile(envPath, envContent, "utf-8");

  console.log(pc.green(`\n🎉 Initialization Complete!`));
  console.log(
    pc.white(
      `You can now run ${pc.bold("npx drixio")} to manage it!`,
    ),
  );

  process.exit(0);
}
