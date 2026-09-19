# Drixio

<div align="center">

**The developer-first, zero-overhead database manager & Studio for SQLite, PostgreSQL, and MySQL.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/Databases-SQLite%20%7C%20PostgreSQL%20%7C%20MySQL-orange.svg)](#)

[Features](#-key-features) • [Quick Start](#-quick-start) • [Drixio Studio](#-drixio-studio) • [AI Copilot](#-byok-ai-copilot) • [Safety & Doctor](#-table-recycle-bin--safety) • [CLI Reference](#-cli-commands) • [License](#-license)

</div>

---

## ⚡ Why Drixio?

Traditional database GUIs are often bloated, electron-heavy, subscription-locked, or blind to common production mistakes. **Drixio** is designed from the ground up for modern developers: lightning-fast startup, terminal-native agility, a sleek browser-based Studio, and unique built-in superpowers like zero-overhead BYOK AI, soft-delete Table Recycle Bin, Schema Health Doctor, and deterministic PII data masking.

---

## ✨ Key Features

- 🧠 **Zero-Overhead BYOK AI Copilot**: Bring your own API key (DeepSeek, OpenAI, Ollama local LLMs, Groq). Zero middleman proxy, zero telemetry, schema-aware SQL generation, and instant error debugging.
- ♻️ **Table Recycle Bin & Pre-Drop Snapshots**: Dropping a table never means catastrophic data loss. Recover soft-deleted tables with 1 click. Dual-layer auto-snapshot saved locally to `.drixio/trash/`.
- 🩺 **Schema Health Doctor**: Deep architectural linter and performance auditor. Detects missing PKs, unindexed foreign keys, redundant duplicate indexes, and unconstrained categoricals with 1-click remediation SQL.
- 🛡️ **Deterministic PII Data Masking**: Export production data safely for local staging/dev. Pseudonymizes emails, phones, names, IPs, and credentials (`[PROTECTED]`) while preserving relational joins across tables.
- 🛡️ **Production Shield & Safe Mode**: Intercepts destructive queries (`DELETE`/`UPDATE` without `WHERE`, `DROP`, `TRUNCATE`) with impact analysis and confirmation modals.
- 📊 **High-Performance Data Grid**: Virtualized inline editing, multi-row bulk actions, column sorting, smart type casting, and JSON preview.
- 📥 **Smart Import & Export Wizard**: Resilient CSV/JSON import with auto-type inference, multi-line quoted field support, and one-click data dictionary generation.
- 🗺️ **Interactive Visual ERD**: Pan-and-zoom entity relationship diagram with real-time foreign key mapping and persistent canvas layouts.
- ⚡ **Schema Diff & Migrations**: Compare schemas against live databases or git-tracked snapshots, preview Up/Down migration DDL, and apply changes safely.
- 🖥️ **1-Click Desktop App Launcher**: Double-click an icon on your desktop to silently boot the backend and open Drixio in a clean, frameless App window. No terminal commands needed.
- ⌨️ **Command Palette (Ctrl+K)**: Universal keyboard-first navigation for tables, views, tools, and SQL console snippets.

---

## 🚀 Quick Start

Run Drixio directly inside any project containing a supported database:

```bash
npx drixio
```

Drixio automatically discovers your database in the following order:
1. SQLite files in root, `prisma`, `db`, `database`, `src/db`, or `src/database`
2. Prisma schema at `prisma/schema.prisma`
3. Environment variables in `.env` (`DATABASE_URL`, `POSTGRES_URL`, `MYSQL_URL`, etc.)

You can also pass a connection URL directly:

```bash
# PostgreSQL
npx drixio "postgresql://postgres:password@localhost:5432/mydb"

# MySQL
npx drixio "mysql://root:password@localhost:3306/mydb"

# SQLite
npx drixio "file:./local.db"
```

---

## 🖥️ Drixio Studio

Launch the browser-based studio on an auto-selected local port (`51213`+):

```bash
npx drixio studio
```

### Studio Modules

| View | Capabilities |
| --- | --- |
| **Data Editor** | Inline row editing, multi-row selection, bulk masked export, JSON cell modal, custom filter builders. |
| **SQL Console** | Monaco-powered SQL editor, auto-completion, execution plan analysis, multi-tab query manager, Safe Mode guard. |
| **Schema Manager** | Visual column & constraint designer, foreign key inspector, index viewer, and ORM generator (Prisma & Drizzle). |
| **Visual ERD** | Pan, zoom, and rearrange table nodes with foreign key connection lines. |
| **Health Doctor** | Audit schema quality (0-100 score), view performance antipatterns, and copy/run 1-click remediation SQL. |
| **Recycle Bin** | View soft-deleted tables, review row count & deletion timestamps, restore instantly, or purge cleanly. |
| **Status & Analytics** | Real-time database metrics, table size breakdown, and row distribution statistics. |

---

## 🧠 BYOK AI Copilot

Drixio includes a **Bring-Your-Own-Key (BYOK)** AI assistant that lives directly in your browser and local server:

- **Supported Providers**: DeepSeek (V3 & R1), OpenAI (GPT-4o, GPT-4o-mini), Ollama (Local offline models), Groq, or any OpenAI-compatible API endpoint.
- **Zero Privacy Leakage**: Your API key is stored locally in your browser's `localStorage`. Drixio does not run an intermediary AI proxy server.
- **Context-Aware**: Injects current table schemas, column types, and foreign key relations into prompts for pinpoint SQL generation.
- **Built-in Workflows**:
  - 📝 Natural Language to SQL (`"Find all users with active subscriptions who haven't logged in for 30 days"`)
  - ⚡ Query Optimizer & Performance Diagnosis
  - 🐞 Execution Error Auto-Fixer (1-click diagnostic when a query fails)
  - 📖 Query Explanation in plain English

---

## ♻️ Table Recycle Bin & Safety

Accidental `DROP TABLE` commands in dev or staging can destroy days of test fixtures. Drixio implements an enterprise-grade safety net:

1. **Soft-Delete Recycle Bin**:
   - When dropping a table via Studio or API, tables are renamed into a protected `_drixio_trash_*` namespace.
   - Deleted tables retain their exact rows, structure, and indexes.
   - 1-click restoration restores the table back to its original name.
2. **Pre-Drop File Snapshot**:
   - Simultaneously, a complete schema + record JSON dump is automatically written to `.drixio/trash/` on your disk.
3. **Auto-Maintenance**:
   - Soft-deleted tables automatically purge after 7 days (configurable TTL) or when the recycle bin exceeds 20 tables, preventing database clutter.

---

## 🩺 Schema Health Doctor

Run automated architectural diagnostics on your database schema with one click:

- **Missing Primary Keys**: Flags heap tables lacking a primary key (which breaks ORMs and replication).
- **Unindexed Foreign Keys**: Catches referenced columns without indexes—the #1 cause of full-table locks during parent `UPDATE` or `DELETE` cascades.
- **Duplicate & Redundant Indexes**: Identifies identical multi-column indexes wasting disk space and slowing down write operations.
- **Unconstrained Categoricals**: Recommends `CHECK` constraints or `ENUM`s for status/role columns stored as free-form text.
- **Health Score**: Computes an overall 0–100 health score with letter grades (`A`, `B`, `C`, `D`) and ready-to-run remediation SQL.

---

## 🛡️ Deterministic PII Data Masking

Need to export production data to your local machine or share a bug report with teammates without leaking user credentials or personal data?

- **Deterministic Pseudonymization**: Hashing ensures that the same email (e.g. `alice@company.com`) always translates to the exact same pseudonym (`user_a7f9b2@example.test`) across every table and export file. **Foreign key relationships and join consistency are 100% preserved.**
- **Sensitive Detection**: Automatically detects and handles:
  - **Emails**: Replaced with clean valid pseudonyms (`user_xxxx@example.test`).
  - **Passwords / Secrets / API Keys**: Replaced with `[PROTECTED]`.
  - **Phone Numbers**: Masked with standardized format (`+1-555-xxxx`).
  - **IP Addresses**: Converted into deterministic private subnet IPs (`10.0.x.x`).
  - **Names**: Replaced with realistic pseudonymized handles.
- **Available Everywhere**: One-click in Table Export, SQL Console Query Export, and Bulk Grid Selection.

---

## 🖥️ 1-Click Desktop App (Zero-Command Launcher)

Hate opening the terminal and remembering commands every time you want to inspect your database? Drixio can generate a 1-click desktop app shortcut on your computer:

```bash
npx drixio install-app
```

- **Zero Black Windows**: Executes silently via background launcher with no flashing terminal popups.
- **Standalone Frameless App Window**: Uses Edge/Chrome `--app` standalone window mode. No address bar, no tabs, native window controls.
- **PWA Ready**: Complete with Web App Manifest (`manifest.json`) and high-res vector app icon.
- **In-Studio 1-Click**: You can also install the desktop launcher directly inside Drixio Studio from the Command Palette (`Ctrl+K`) or the sidebar footer button.

---

## 💻 CLI Commands

Drixio provides a rich set of scriptable CLI commands:

| Command | Description |
| --- | --- |
| `npx drixio tables` | List all database tables with row counts (`ls` alias). |
| `npx drixio describe [table]` | Inspect table columns, types, PKs, FKs, and indexes (`desc` alias). |
| `npx drixio query "<sql>"` | Run raw SQL query and output results in a formatted terminal table. |
| `npx drixio exec <file.sql>` | Execute a SQL script file. |
| `npx drixio export [table]` | Export one or all tables as CSV or JSON. |
| `npx drixio import [file]` | Import a `.csv` or `.json` file into a table with schema validation. |
| `npx drixio seed [table] [count]` | Generate realistic mock rows for testing (`mock` alias). |
| `npx drixio truncate [table]` | Delete all rows and reset auto-increment sequences. |
| `npx drixio backup` | Create a timestamped backup directory with schema and data JSON files. |
| `npx drixio restore [dir\|file]` | Restore database from a backup directory, JSON dump, or SQL script. |
| `npx drixio diff [target]` | Compare schemas against a snapshot or database & generate Up/Down migration DDL. |
| `npx drixio snippets` | List saved SQL snippets and templates (`snip` alias). |
| `npx drixio run [snippet]` | Execute a saved snippet or parameterized query interactively. |
| `npx drixio diagram` | Generate `drixio_schema.md` with Mermaid diagram markup. |
| `npx drixio generate-types` | Generate TypeScript definitions (`drixio-types.d.ts`) from schema. |
| `npx drixio generate-orm [prisma\|drizzle]` | Generate Prisma (`schema.prisma`) or Drizzle (`schema.ts`) definitions. |
| `npx drixio init [sqlite\|postgres\|mysql]` | Initialize local database and configure `DATABASE_URL` in `.env`. |
| `npx drixio drop-db [sqlite\|postgres\|mysql]` | Safely remove a local database after explicit confirmation. |
| `npx drixio install-app` | Create a 1-click desktop app launcher shortcut (`shortcut` alias). |

### Common CLI Options

```bash
# Output tables as JSON
npx drixio tables --json

# Export with PII masking
npx drixio export users --format csv

# Generate schema snapshot for Git
npx drixio diff --snapshot

# Apply schema diff migrations automatically
npx drixio diff "postgresql://..." --apply

# Generate Drizzle ORM schema to file
npx drixio generate-orm drizzle --out src/db/schema.ts
```

---

## 🛠️ Local Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/TerKSDev/drixio.git
cd drixio
pnpm install
```

Start development servers:

```bash
# Terminal TUI & core development
pnpm dev

# Studio development server
pnpm dev:studio
```

Run test suite:

```bash
pnpm test
pnpm typecheck
```

Build distribution bundle:

```bash
pnpm build
```

---

## 📄 License

MIT © [TerKSDev](https://github.com/TerKSDev)
