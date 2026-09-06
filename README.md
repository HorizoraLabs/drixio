# Drixio

Drixio is a lightweight database manager for local development. It provides a
terminal UI, a browser-based Studio, and scriptable CLI commands for inspecting
and changing SQLite, PostgreSQL, and MySQL databases.

## Requirements

- Node.js 22 or newer
- SQLite, PostgreSQL, or MySQL, depending on the database you want to use

## Install and connect

Run Drixio from a project that contains a supported database:

```bash
npx drixio
```

Drixio looks for a database in this order:

1. SQLite files in the project root, `prisma`, `db`, `database`, `src/db`, or
   `src/database`
2. A Prisma schema in `prisma/schema.prisma`
3. A connection URL in `.env`

The following environment variable names are recognized: `DATABASE_URL`,
`DB_URL`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, and `MYSQL_URL`.

You can also pass a connection URL directly:

```bash
npx drixio "postgresql://user:password@localhost:5432/mydb"
npx drixio "mysql://user:password@localhost:3306/mydb"
npx drixio "file:./database.sqlite"
```

## Interfaces

### Interactive TUI

Running `npx drixio` opens the terminal interface. It includes database setup,
table browsing and editing, table creation and modification wizards, and a SQL
REPL.

### Drixio Studio

Open the browser-based interface with:

```bash
npx drixio studio
npx drixio studio "postgresql://user:password@localhost:5432/mydb"
```

Studio starts a local server, opens the browser automatically, and chooses an
available port starting at `51213` (or the value of `PORT`). It includes:

- **Connect Workbench**: Zero-config database setup, dialect switching (SQLite, PostgreSQL, MySQL), pre-flight overview, live connection diagnostics, and smart `DATABASE_URL` auto-fill.
- **Data View**: High-performance grid with pagination, inline editing, column sorting, search filtering, and CSV/JSON export/import.
- **Schema & Table Manager**: Visual table inspector, column editor, foreign key explorer, table creation wizards, and modern ORM generator (Prisma & Drizzle).
- **SQL Console**: Multi-tab SQL runner with intelligent autocomplete, query history, Safe Mode guard for destructive queries (DELETE/UPDATE without WHERE, DROP, TRUNCATE), and beginner-friendly query snippets.
- **Status & Analytics**: Real-time database metrics, table size breakdown, and row distribution statistics.
- **Interactive ERD**: Pan-and-zoom entity relationship diagram with table node dragging and relation link visualization.

## CLI commands

All commands use the database detected from the current project unless a
connection URL is supplied where noted.

| Command                                        | Description                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `npx drixio tables`                            | List all tables with row counts in terminal. `ls` is an alias.           |
| `npx drixio describe [table]`                  | Inspect table columns, types, PKs, FKs, and indexes. `desc` is an alias. |
| `npx drixio query "<sql>"`                     | Run SQL and print the result as a table.                                 |
| `npx drixio exec <file.sql>`                   | Execute a SQL script file.                                               |
| `npx drixio export [table]`                    | Export one table or all tables as CSV or JSON.                           |
| `npx drixio import [file]`                     | Import a `.csv` or `.json` file into a table.                            |
| `npx drixio seed [table] [count]`              | Generate realistic mock rows for a table. `mock` is an alias.            |
| `npx drixio truncate [table]`                  | Delete all rows from a table and reset its sequence.                     |
| `npx drixio backup`                            | Create a timestamped backup directory with schema and data JSON files.   |
| `npx drixio restore [dir\|file]`               | Restore database from a backup directory, JSON dump, or SQL script.      |
| `npx drixio diagram`                           | Generate `drixio_schema.md` with Mermaid schema output.                  |
| `npx drixio generate-types`                    | Generate `drixio-types.d.ts` from the database schema.                   |
| `npx drixio generate-orm [prisma\|drizzle]`    | Generate Prisma (`schema.prisma`) or Drizzle (`schema.ts`) ORM schema.   |
| `npx drixio init [sqlite\|postgres\|mysql]`    | Create or configure a local database and save `DATABASE_URL` to `.env`.  |
| `npx drixio drop-db [sqlite\|postgres\|mysql]` | Permanently delete a local database after confirmation.                  |

### Common options

```bash
npx drixio tables
npx drixio tables --json
npx drixio describe users
npx drixio export users --format csv
npx drixio export --format json --schema-only
npx drixio import data.json --table users
npx drixio --version
npx drixio --help
```

- `-v, --version` prints the drixio version.
- `--json` outputs result as structured JSON (supported by `tables`, `describe`).
- `--format csv|json` selects the export format.
- `--schema-only` exports table definitions without data.
- `--table <name>` selects the destination table for imports or ORM generation.
- `--force`, `-y` skips confirmation prompts during restore or database drops.

Exports are written to `drixio_exports/` in the current directory. Backups are
written to a timestamped `drixio_backup_<timestamp>/` directory.

## Local database setup

SQLite needs no server:

```bash
npx drixio init sqlite
npx drixio init sqlite my-app
```

For PostgreSQL and MySQL, `init` asks for local server credentials, creates the
database, and writes the resulting connection URL to `.env`:

```bash
npx drixio init postgres mydb
npx drixio init mysql mydb
```

`drop-db` permanently removes a SQLite file or drops a PostgreSQL/MySQL
database. `truncate` permanently removes all rows from one table. Both commands
ask for confirmation; use them carefully.

## Development

Install dependencies and run the project locally:

```bash
pnpm install
pnpm dev
pnpm dev:studio
```

Build both the CLI and Studio bundles:

```bash
pnpm build
```

The package is published as `drixio`, and `prepublishOnly` builds both bundles
before publishing.

## License

MIT
