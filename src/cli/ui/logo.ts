import pc from "picocolors";

export interface DBConfigProps {
  type: "sqlite" | "postgres" | "mysql" | "unknown";
  targetUrl: string;
  source: ".env" | "auto-detected" | "manual";
}

// Helper to generate 24-bit RGB ANSI escape codes for smooth gradients
const rgb = (r: number, g: number, b: number) => (text: string) =>
  `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;

const l1 = rgb(0, 255, 255); // Pure Electric Cyan
const l2 = rgb(0, 230, 245); // Bright Cyan
const l3 = rgb(0, 210, 235); // Vivid Cyan
const l4 = rgb(0, 188, 220); // Medium Cyan
const l5 = rgb(0, 168, 205); // Cyan-Blue
const l6 = rgb(0, 148, 188); // Deep Cyan

export function printLogo() {
  console.log(
    "\n\n\n" +
      pc.bold(
        l1("\t\t██████╗  ██████╗  ██╗ ██╗  ██╗ ██╗  ██████╗ \n") +
          l2("\t\t██╔══██╗ ██╔══██╗ ██║ ╚██╗██╔╝ ██║ ██╔═══██╗\n") +
          l3("\t\t██║  ██║ ██████╔╝ ██║  ╚███╔╝  ██║ ██║   ██║\n") +
          l4("\t\t██║  ██║ ██╔══██╗ ██║  ██╔██╗  ██║ ██║   ██║\n") +
          l5("\t\t██████╔╝ ██║  ██║ ██║ ██╔╝ ██╗ ██║ ╚██████╔╝\n") +
          l6("\t\t╚═════╝  ╚═╝  ╚═╝ ╚═╝ ╚═╝  ╚═╝ ╚═╝  ╚═════╝"),
      ),
  );
}

export function printCustomDashboard(
  title: string,
  rows: { label: string; value: string }[],
) {
  const terminalWidth = 74;
  const dashes = "═".repeat(terminalWidth - 2);
  console.log(pc.cyan(`\n╔${dashes}╗`));
  const spacesNeeded = terminalWidth - 2 - title.length;
  const leftSpace = Math.max(0, Math.floor(spacesNeeded / 2));
  const rightSpace = Math.max(0, spacesNeeded - leftSpace);
  const titleContent =
    " ".repeat(leftSpace) + pc.bold(pc.white(title)) + " ".repeat(rightSpace);
  console.log(pc.cyan("║") + titleContent + pc.cyan("║"));
  console.log(pc.cyan(`╠${"═".repeat(terminalWidth - 2)}╣`));

  const printLine = (label: string, value: string) => {
    const paddedLabel = label.padEnd(12);
    const lineContent = `  ${pc.bold(paddedLabel)}: ${value}`;
    const rawText = `  ${paddedLabel}: ` + value.replace(/\x1b\[[0-9;]*m/g, "");
    const padding = " ".repeat(Math.max(0, terminalWidth - 2 - rawText.length));
    console.log(pc.cyan("║") + lineContent + padding + pc.cyan("║"));
  };

  for (const row of rows) {
    printLine(row.label, row.value);
  }

  console.log(pc.cyan(`╚${"═".repeat(terminalWidth - 2)}╝`));
  console.log(
    pc.dim(
      "      Use arrow keys to navigate • Enter to select • Ctrl+C to exit\n",
    ),
  );
}

export function printDashboard(dbConfig: DBConfigProps) {
  const headerTitle = ` Lightweight Interactive TUI Database Client  •  v${process.env.npm_package_version} `;

  let dbTypeVal = "None";
  let targetVal = "-";
  let sourceVal = "None";

  if (dbConfig.type === "unknown") {
    sourceVal = pc.dim(
      "No configuration found. Please run check to configure.",
    );
  } else {
    dbTypeVal = dbConfig.type.toUpperCase();
    targetVal = dbConfig.targetUrl;
    sourceVal =
      dbConfig.source === ".env"
        ? "Loaded from project .env file"
        : dbConfig.source === "auto-detected"
          ? "Auto-detected local SQLite file"
          : "Manual connection config";
  }

  printCustomDashboard(headerTitle, [
    { label: "Database", value: dbTypeVal },
    {
      label: "Target",
      value: targetVal.length > 45 ? "..." + targetVal.slice(-42) : targetVal,
    },
    { label: "Source", value: sourceVal },
    {
      label: "Working Dir",
      value:
        process.cwd().length > 45
          ? "..." + process.cwd().slice(-42)
          : process.cwd(),
    },
  ]);
}
