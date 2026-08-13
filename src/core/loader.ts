import fs from "node:fs/promises";
import path from "node:path";
import { DBConfig } from "./types.js";

export async function detectDatabase(databaseUrl?: string): Promise<DBConfig> {
  const cwd = process.cwd();

  if (databaseUrl) {
    let type: "sqlite" | "postgres" | "mysql" | "unknown" = "sqlite";
    if (
      databaseUrl.startsWith("postgres://") ||
      databaseUrl.startsWith("postgresql://")
    ) {
      type = "postgres";
    } else if (databaseUrl.startsWith("mysql://")) {
      type = "mysql";
    } else {
      type = "sqlite";
    }

    // Resolve relative SQLite paths to absolute
    let targetUrl = databaseUrl.replace("file:", "");
    if (type === "sqlite" && !path.isAbsolute(targetUrl)) {
      targetUrl = path.resolve(cwd, targetUrl);
    }
    return {
      type,
      targetUrl,
      source: "manual",
    };
  }
  // 1. Scan root and common subdirectories for SQLite files
  const searchDirs = [
    ".",
    "prisma",
    "db",
    "database",
    "src/db",
    "src/database",
  ];
  for (const dir of searchDirs) {
    try {
      const targetDir = path.join(cwd, dir);
      const files = await fs.readdir(targetDir);
      const sqliteFile = files.find(
        (file) =>
          file.endsWith(".db") ||
          file.endsWith(".sqlite") ||
          file.endsWith(".sqlite3"),
      );

      if (sqliteFile) {
        return {
          type: "sqlite",
          targetUrl: path.join(targetDir, sqliteFile),
          source: "auto-detected",
        };
      }
    } catch {
      // Skip folders that don't exist or are inaccessible
    }
  }

  // 2. Parse Prisma schema configuration if it exists
  const prismaSchemaPath = path.join(cwd, "prisma", "schema.prisma");
  try {
    const schemaContent = await fs.readFile(prismaSchemaPath, "utf-8");
    const providerMatch = schemaContent.match(
      /provider\s*=\s*["']([^"']+)["']/,
    );
    const urlMatch = schemaContent.match(
      /url\s*=\s*(?:env\(["']([^"']+)["']\)|["']([^"']+)["'])/,
    );

    if (providerMatch) {
      let provider = providerMatch[1];
      if (provider === "postgresql") provider = "postgres";

      let targetUrl = "";
      if (urlMatch && urlMatch[2]) {
        targetUrl = urlMatch[2];
        if (targetUrl.startsWith("file:")) {
          targetUrl = path.join(cwd, "prisma", targetUrl.replace("file:", ""));
        }
      }

      if (
        targetUrl &&
        (provider === "sqlite" ||
          provider === "postgres" ||
          provider === "mysql")
      ) {
        return {
          type: provider as any,
          targetUrl,
          source: ".env", // Treats static config as .env source or configuration
        };
      }
    }
  } catch {
    // Ignore
  }

  // 3. Scan .env for multiple common database connection variable keys
  const envPath = path.join(cwd, ".env");
  try {
    const envContent = await fs.readFile(envPath, "utf-8");
    const dbKeys = [
      "DATABASE_URL",
      "DB_URL",
      "POSTGRES_URL",
      "POSTGRES_PRISMA_URL",
      "MYSQL_URL",
    ];

    for (const key of dbKeys) {
      const regex = new RegExp(`${key}\\s*=\\s*["']?([^"'\\r\\n]+)["']?`);
      const match = envContent.match(regex);

      if (match) {
        const url = match[1];

        if (
          url.startsWith("file:") ||
          url.endsWith(".db") ||
          url.includes(".sqlite")
        ) {
          // Strip file: prefix then resolve relative paths to absolute
          let targetUrl = url.replace("file:", "");
          if (!path.isAbsolute(targetUrl)) {
            targetUrl = path.resolve(cwd, targetUrl);
          }
          return {
            type: "sqlite",
            targetUrl,
            source: ".env",
          };
        } else if (
          url.startsWith("postgres://") ||
          url.startsWith("postgresql://")
        ) {
          return {
            type: "postgres",
            targetUrl: url,
            source: ".env",
          };
        } else if (url.startsWith("mysql://")) {
          return {
            type: "mysql",
            targetUrl: url,
            source: ".env",
          };
        }
      }
    }
  } catch (error) {
    // .env file doesn't exist or is not readable
  }

  return {
    type: "unknown",
    targetUrl: "",
    source: "manual",
  };
}

export async function saveDatabaseUrl(url: string): Promise<void> {
  const envPath = path.join(process.cwd(), ".env");
  let envContent = "";
  try {
    envContent = await fs.readFile(envPath, "utf-8");
  } catch (e) {
    // File doesn't exist, which is fine
  }

  const regex = /DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/;
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `DATABASE_URL="${url}"`);
  } else {
    // Append to end of file, making sure there is a newline if file is not empty
    if (envContent && !envContent.endsWith("\n")) {
      envContent += "\n";
    }
    envContent += `DATABASE_URL="${url}"\n`;
  }

  await fs.writeFile(envPath, envContent, "utf-8");
}
