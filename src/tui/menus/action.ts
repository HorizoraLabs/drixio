import { select, Separator } from '@inquirer/prompts';
import { DBConfig } from '../../logic/index.js';
import pc from 'picocolors';

export const selectAction = async (dbConfig: DBConfig) =>
   await select({
      message: 'Select an action:',
      theme: {
         prefix: pc.cyan('✓ '),
         icon: {
            cursor: pc.cyan('› '),
         },
         style: {
            message: (text: string) => pc.bold(pc.white(text)),
            highlight: (text: string) => {
               const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
               return clean.includes('Exit') ? pc.red(clean) : pc.cyan(clean);
            },
         },
      },
      choices: [
         {
            name: ' Data Browser & Editor',
            value: 'editor',
            description:
               'View, insert, update, and delete row data in your tables.',
            disabled: dbConfig.type === 'unknown',
         },
         {
            name: ' Run Raw SQL (REPL)',
            value: 'repl',
            description: 'Execute arbitrary SQL queries interactively.',
            disabled: dbConfig.type === 'unknown',
         },
         {
            name: ' Table Builder & Manager',
            value: 'table',
            description: 'Create new tables, or modify/drop existing tables.',
            disabled: dbConfig.type === 'unknown',
         },
         {
            name: '⚡ ORM & Type Generator',
            value: 'orm',
            description:
               'Generate Prisma Schema, Drizzle models, or TypeScript definitions.',
            disabled: dbConfig.type === 'unknown',
         },
         {
            name: '📑 SQL Snippets & Templates',
            value: 'snippets',
            description:
               'Run parameterized diagnostic queries and high-frequency templates.',
            disabled: dbConfig.type === 'unknown',
         },
         {
            name: '🔄 Schema Diff & Migrations',
            value: 'diff',
            description:
               'Compare database schemas with snapshots and generate migration SQL.',
            disabled: dbConfig.type === 'unknown',
         },
         new Separator(),
         {
            name:
               dbConfig.type === 'unknown'
                  ? ' Setup Connection'
                  : ' Connection Settings',
            value: dbConfig.type === 'unknown' ? 'setup' : 're-configure',
            description:
               dbConfig.type === 'unknown'
                  ? 'Setup the database connection manually.'
                  : 'Re-configure the database connection.',
         },
         {
            name: pc.dim(' Exit'),
            value: 'exit',
            description: 'Exit the Drixio CLI application.',
         },
      ],
   });
