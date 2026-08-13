import { select, Separator } from "@inquirer/prompts";
import pc from "picocolors";
import { createDBAdapter } from "../../core/factory.js";
import { selectTable } from "../menus/table.js";
import {
  runBeginnerAdd,
  runBeginnerEdit,
  runBeginnerDelete,
  runExpertMode,
} from "../wizards/dataEditor.js";
import { drawTable } from "../ui/table.js";
import { printCustomDashboard } from "../ui/logo.js";

interface DBConfigProps {
  type: "sqlite" | "postgres" | "mysql" | "unknown";
  targetUrl: string;
  source: ".env" | "auto-detected" | "manual";
}

export async function viewTables(dbConfig: DBConfigProps) {
  const adapter = createDBAdapter(dbConfig as any);
  let viewing = true;

  while (viewing) {
    console.clear();

    let tables: string[] = [];
    let totalRows = 0;
    let totalDataCount = "Scanning...";
    try {
      tables = await adapter.getTables();
      for (const table of tables) {
        try {
          // Quote table names properly based on dialect
          const quote = dbConfig.type === "mysql" ? "`" : '"';
          const res = await adapter.query(`SELECT COUNT(*) as count FROM ${quote}${table}${quote}`);
          if (res.rows.length > 0 && res.rows[0].count != null) {
            totalRows += Number(res.rows[0].count);
          }
        } catch (e) {
          // Ignore tables that can't be queried
        }
      }
      totalDataCount = `${totalRows.toLocaleString()} rows across ${tables.length} tables`;
    } catch (e: any) {
      totalDataCount = pc.red(e.message);
    }

    const targetVal = dbConfig.targetUrl;
    const sourceVal =
      dbConfig.source === ".env"
        ? "Loaded from project .env file"
        : dbConfig.source === "auto-detected"
          ? "Auto-detected local SQLite file"
          : "Manual connection config";

    printCustomDashboard(` Data Browser & Editor  •  [${dbConfig.type.toUpperCase()}]`, [
      { label: "Database", value: dbConfig.type.toUpperCase() },
      { label: "Target", value: targetVal.length > 45 ? "..." + targetVal.slice(-42) : targetVal },
      { label: "Source", value: sourceVal },
      { label: "Total Data", value: totalDataCount }
    ]);

    try {
      if (tables.length === 0) {
        console.log(pc.yellow("No tables found in this database."));
        await waitForEnter();
        await adapter.close();
        return;
      }

      const tableChoices = [
        ...tables.map((table) => ({
          name: table,
          value: table,
        })),
        new Separator(),
        {
          name: pc.dim(" Back"),
          value: "BACK",
        },
      ];

      const selectedTable = await selectTable(tableChoices);

      if (selectedTable === "BACK") {
        viewing = false;
        continue;
      }

      let tableLoop = true;
      let currentPage = 1;
      let currentWhere = "";
      const limit = 50;

      while (tableLoop) {
        console.clear();
        const offset = (currentPage - 1) * limit;
        const schema = await adapter.getSchema(selectedTable);
        const colNames = schema.map((c) => c.name);

        let data;
        try {
          data = await adapter.getData(
            selectedTable,
            limit,
            offset,
            currentWhere,
          );
        } catch (e: any) {
          console.log(pc.red(`\nError fetching data: ${e.message}\n`));
          currentWhere = "";
          const { input } = await import("@inquirer/prompts");
          await input({ message: "Click Enter to continue..." });
          continue;
        }
        const rows = data.rows;

        const detailHeaderTitle = ` ${selectedTable} (Page ${currentPage}) `;
        drawTable(colNames, rows, {
          title: detailHeaderTitle,
          maxColWidth: 30,
        });

        const hasNextPage = rows.length === limit;
        const hasPrevPage = currentPage > 1;
        const actionChoices: any[] = [
          { name: "Add Data", value: "add" },
          { name: "Edit Data", value: "edit" },
          { name: "Delete Data", value: "delete" },
          new Separator(),
          { name: "Search Data", value: "search" },
          {
            name: currentWhere
              ? "Clear Search"
              : pc.dim("Clear Search (disabled)"),
            value: currentWhere ? "clear_search" : "noop",
          },
          new Separator(),
          { name: "Export to CSV", value: "exportCsv" },
          { name: "Export to JSON", value: "exportJson" },
          new Separator(),
        ];
        if (hasPrevPage)
          actionChoices.push({ name: "Previous Page", value: "prev" });
        if (hasNextPage)
          actionChoices.push({ name: "Next Page", value: "next" });
        actionChoices.push({ name: pc.dim(" Back"), value: "BACK" });

        const action = await select({
          message: "Select an action for this table:",
          theme: {
            prefix: pc.cyan("✓ "),
            icon: {
              cursor: pc.cyan("› "),
            },
            style: {
              message: (text: string) => pc.bold(pc.white(text)),
              highlight: (text: string) => {
                const clean = text.replace(/\x1b\[[0-9;]*m/g, "");
                return clean.includes(" Back") ? pc.red(clean) : pc.cyan(clean);
              },
            },
          },
          choices: actionChoices,
        });

        if (action === "prev") {
          currentPage--;
          continue;
        }
        if (action === "next") {
          currentPage++;
          continue;
        }
        if (action === "noop") {
          continue;
        }

        if (action === "BACK") {
          tableLoop = false;
          continue;
        }

        if (action === "clear_search") {
          currentWhere = "";
          currentPage = 1;
          continue;
        }

        if (action === "search") {
          const { input } = await import("@inquirer/prompts");
          const searchInput = await input({
            message:
              "Enter Search (e.g. `age > 18` or `John` for fuzzy search):",
          });
          const searchVal = searchInput.trim();
          if (searchVal) {
            // Check if it looks like a SQL condition (contains =, >, <, LIKE, etc.)
            const isSqlCondition = /[=<>]|LIKE|IN|AND|OR/i.test(searchVal);
            if (isSqlCondition) {
              currentWhere = searchVal;
            } else {
              // Fuzzy search across all string columns
              const strCols = schema.filter(
                (c) =>
                  c.type.toLowerCase().includes("char") ||
                  c.type.toLowerCase().includes("text"),
              );
              if (strCols.length > 0) {
                const likeOp = dbConfig.type === "postgres" ? "ILIKE" : "LIKE";
                const conditions = strCols.map(
                  (c) =>
                    `${adapter.quoteIdentifier(c.name)} ${likeOp} '%${searchVal.replace(/'/g, "''")}%'`,
                );
                currentWhere = conditions.join(" OR ");
              } else {
                currentWhere = `${adapter.quoteIdentifier(schema[0].name)} = '${searchVal}'`;
              }
            }
            currentPage = 1;
          }
          continue;
        }

        if (action === "exportCsv" || action === "exportJson") {
          try {
            console.log(pc.yellow("\nExporting data..."));
            // Fetch all rows in batches to avoid OOM on large tables
            const batchSize = 1000;
            let batchOffset = 0;
            const allExportRows: Record<string, any>[] = [];
            let exportColumns: string[] = [];
            let lastBatch;
            do {
              lastBatch = await adapter.getData(
                selectedTable,
                batchSize,
                batchOffset,
                currentWhere,
              );
              if (exportColumns.length === 0) exportColumns = lastBatch.columns;
              allExportRows.push(...lastBatch.rows);
              batchOffset += batchSize;
            } while (lastBatch.rows.length === batchSize);

            const allData = { columns: exportColumns, rows: allExportRows };
            const fs = await import("fs/promises");
            const path = await import("path");

            const exportDir = path.join(process.cwd(), "drixio_exports");
            await fs.mkdir(exportDir, { recursive: true });

            if (action === "exportCsv") {
              const headers = allData.columns.join(",") + "\n";
              const rowsStr = allData.rows
                .map((r: any) => {
                  return allData.columns
                    .map((c) => {
                      const val = String(r[c] ?? "").replace(/"/g, '""');
                      return `"${val}"`;
                    })
                    .join(",");
                })
                .join("\n");

              const fp = path.join(exportDir, `${selectedTable}.csv`);
              await fs.writeFile(fp, headers + rowsStr, "utf-8");
              console.log(pc.green(`\nExported to ${fp}`));
            } else {
              const fp = path.join(exportDir, `${selectedTable}.json`);
              await fs.writeFile(
                fp,
                JSON.stringify(allData.rows, null, 2),
                "utf-8",
              );
              console.log(pc.green(`\nExported to ${fp}`));
            }
          } catch (e: any) {
            console.log(pc.red(`\nExport Error: ${e.message}`));
          }
          const { input } = await import("@inquirer/prompts");
          await input({ message: "Click Enter to continue..." });
          continue;
        }

        const mode = await select({
          message: `Select mode for ${action} data:`,
          choices: [
            { name: "Beginner (Interactive Step-by-Step)", value: "beginner" },
            {
              name: "Expert (Load SQL from .sql or .md file)",
              value: "expert",
            },
            new Separator(),
            { name: pc.dim("Cancel"), value: "cancel" },
          ],
        });

        if (mode === "cancel") {
          continue;
        }

        if (mode === "expert") {
          await runExpertMode(adapter);
          await waitForEnter();
          continue;
        }

        if (action === "add") {
          await runBeginnerAdd(adapter, dbConfig.type, selectedTable, schema);
          await waitForEnter();
        } else if (action === "edit") {
          await runBeginnerEdit(adapter, dbConfig.type, selectedTable, schema);
          await waitForEnter();
        } else if (action === "delete") {
          await runBeginnerDelete(
            adapter,
            dbConfig.type,
            selectedTable,
            schema,
          );
          await waitForEnter();
        }
      }
    } catch (error: any) {
      console.log(pc.red(`\nx Error: ${error.message}`));
      await waitForEnter();
      viewing = false;
    }
  }

  await adapter.close();
}

async function waitForEnter() {
  const { input } = await import("@inquirer/prompts");
  await input({
    message: "Press Enter to continue...",
  });
}
