import { select } from "@inquirer/prompts";
import pc from "picocolors";

export const selectTable = async (tableChoices: any[]) =>
  await select({
    message: "Select a table to edit data:",
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
    choices: tableChoices,
  });
