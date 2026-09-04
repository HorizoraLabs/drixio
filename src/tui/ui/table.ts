import pc from "picocolors";

export interface TableOptions {
  title?: string;
  emptyMessage?: string;
  maxColWidth?: number;
}

export function drawTable(columns: string[], rows: Record<string, any>[], options: TableOptions = {}) {
  const { title, emptyMessage = "No records found", maxColWidth = 30 } = options;
  
  // 1. Calculate column widths
  const colWidths: Record<string, number> = {};
  let totalMinWidth = 0;
  for (const col of columns) {
    let maxValLength = col.length;
    for (const row of rows) {
      const valStr = String((row as any)[col] ?? "");
      if (valStr.length > maxValLength) {
        maxValLength = valStr.length;
      }
    }
    const finalW = Math.max(col.length, Math.min(maxColWidth, maxValLength));
    colWidths[col] = finalW;
    totalMinWidth += finalW;
  }

  // 2. Calculate dynamic terminalWidth (minimum 74 characters)
  const dividerWidths = 3 * (columns.length - 1);
  const dynamicWidth = totalMinWidth + dividerWidths + 4;
  const currentTerminalWidth = Math.max(74, dynamicWidth);
  const availableTextWidth = currentTerminalWidth - 4 - dividerWidths;

  // Distribute remaining spaces to the last column
  if (totalMinWidth < availableTextWidth && columns.length > 0) {
    const lastCol = columns[columns.length - 1];
    colWidths[lastCol] += availableTextWidth - totalMinWidth;
  }

  // Helper to truncate long cell values
  const truncate = (str: string, maxLen: number) => {
    if (str.length > maxLen) {
      return str.slice(0, maxLen - 3) + "...";
    }
    return str;
  };

  const dashes = "═".repeat(currentTerminalWidth - 2);

  // 3. Draw outer Box Header with Title (if provided)
  console.log(pc.cyan(`\n╔${dashes}╗`));
  if (title) {
    const spacesNeeded = currentTerminalWidth - 2 - title.length;
    const leftSpace = Math.max(0, Math.floor(spacesNeeded / 2));
    const rightSpace = Math.max(0, spacesNeeded - leftSpace);
    const titleContent = " ".repeat(leftSpace) + pc.bold(pc.white(title)) + " ".repeat(rightSpace);
    console.log(pc.cyan("║") + titleContent + pc.cyan("║"));
    console.log(pc.cyan(`╠${dashes}╣`));
  }

  // 4. Draw Table Column Headers inside outer borders
  if (columns.length > 0) {
    const headerRow = columns
      .map((col) => pc.bold(pc.white(truncate(col, colWidths[col]).padEnd(colWidths[col]))))
      .join(pc.cyan(" ║ "));
    console.log(pc.cyan("║ ") + headerRow + pc.cyan(" ║"));
    console.log(pc.cyan(`╠${dashes}╣`));
  }

  // 5. Draw Table Data Rows inside outer borders
  if (rows.length === 0) {
    const emptySpaces = currentTerminalWidth - 4 - emptyMessage.length;
    const leftPad = Math.max(0, Math.floor(emptySpaces / 2));
    const rightPad = Math.max(0, emptySpaces - leftPad);
    console.log(
      pc.cyan("║ ") +
        " ".repeat(leftPad) +
        pc.yellow(emptyMessage) +
        " ".repeat(rightPad) +
        pc.cyan(" ║")
    );
  } else {
    for (const row of rows) {
      const rowContent = columns
        .map((col) =>
          pc.white(truncate(String((row as any)[col] ?? ""), colWidths[col]).padEnd(colWidths[col]))
        )
        .join(pc.cyan(" ║ "));
      console.log(pc.cyan("║ ") + rowContent + pc.cyan(" ║"));
    }
  }

  console.log(pc.cyan(`╚${dashes}╝`));
}
