# LifeOS

A personal "life operating system": goals, tasks and projects, calendar and reminders, habits, a journal, documents
with an encrypted vault, learning (skills, courses, books, roadmaps, study time), career (roles, pay, applications,
interviews, network), finance (multi-currency accounts, ledger, budgets, investments, loans, insurance, taxes, net
worth), health (history, visits, medicines, exercise, sleep, body, food, labs, wellbeing — encrypted and behind
the vault), a **Story Mode** that reads your life as a biography, and a daily **My Day** dashboard that ties them
together. Everything links to everything else (a task to the goal it serves, a
habit to its goal, a reminder to any of them). It's built to *improve* a life, not just log it, so it also gives
plain, rule-based nudges ("your reading streak broke on Wednesday", "this goal hasn't moved in 20 days").

It runs on your own machine. It's multi-user at the data layer (registration + login, every row owned by a user).

| | |
|---|---|
| **Backend** | .NET 10 Web API (`LifeOS.Api`) + class library (`LifeOS.Core`), EF Core (database-first) + Dapper for stored procedures, JWT auth |
| **Frontend** | Angular 22 (standalone components, signals, OnPush) in `lifeos-web/`, Bootstrap 5 / CoreUI (free) / ng-bootstrap, FullCalendar 7, ng2-charts |
| **Database** | SQL Server LocalDB, database `LifeOS_UAT`, one SQL schema per module |

## Status

Month 1 (the seven core modules, Sessions 1–27), Phase 2 (Story Mode, Documents, Learning, Career, Finance, data
export/import, Sessions 28–61) and Health (Sessions 62–65, encrypted and behind the vault) are complete. Next is **Home** (Session 66).

**The main document is [`LifeOS_Development_Plan.md`](LifeOS_Development_Plan.md)**: what LifeOS is, every decision
and deviation from the original blueprint, the session-by-session roadmap with what's done, and the backlog for
Phase 2 onwards. Start there. The rest supports it:

- [`PROGRESS.md`](PROGRESS.md): a detailed log of every session (what shipped, how it was verified, decisions).
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): how the code is put together.
- [`CLAUDE.md`](CLAUDE.md): the working conventions. Read it before changing code (Claude Code loads it automatically).
- [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md): the original product concept and the full 20-module catalogue that the plan
  schedules (converted from the Blueprint Word file, which was removed on 2026-10-15).
- `LifeOS_Development_Plan.docx`: an early Word copy of the plan (as of Session 5). The `.md` is the maintained
  version.

## Prerequisites

- Windows with **SQL Server Express LocalDB** (`sqllocaldb info` lists `MSSQLLocalDB`) and **sqlcmd**
- **.NET 10 SDK** (`dotnet --version` → 10.x)
- **Node.js 24** and npm
- Optional: `dotnet-ef` (`dotnet tool install -g dotnet-ef`), only needed to re-scaffold after a schema change

## First-time setup

### 1. Create the database

The schema lives in plain SQL scripts, applied in file-name order, then the stored procedures. Every script is
re-runnable. From the repository root, in **PowerShell**:

```powershell
sqllocaldb start MSSQLLocalDB
Get-ChildItem database\schema\*.sql | Sort-Object Name | ForEach-Object { sqlcmd -S "(localdb)\mssqllocaldb" -b -I -i $_.FullName }
Get-ChildItem database\procedures\*.sql | ForEach-Object { sqlcmd -S "(localdb)\mssqllocaldb" -b -I -i $_.FullName }
```

Or in **Git Bash** (sqlcmd needs Windows-style paths):

```bash
for f in database/schema/*.sql database/procedures/*.sql; do sqlcmd -S "(localdb)\mssqllocaldb" -b -I -i "$(cygpath -w "$f")"; done
```

`00_create_database.sql` creates `LifeOS_UAT`. `01_shared.sql` seeds the six life areas. There are no seeded users:
you register in the app.

### 2. Install the frontend packages

```bash
cd lifeos-web
npm install
```

### 3. JWT signing key

`LifeOS.Api/appsettings.Development.json` holds a development-only signing key, so the API runs as-is when started
in Development. For anything beyond your own machine, set a long random key outside the repo, for example with
`dotnet user-secrets set "Jwt:Key" "<64+ random characters>" --project LifeOS.Api`. A non-Development environment
has no key configured and won't start without one.

### 4. File storage (documents, attachments)

Uploaded files are kept on disk, one folder per user, outside the repo and any web root — by default
`%LOCALAPPDATA%\LifeOS\files`. To put them elsewhere, set `FileStorage:RootPath` (e.g.
`dotnet user-secrets set "FileStorage:RootPath" "D:\LifeOS-files\UAT" --project LifeOS.Api`); give UAT and Live
different folders, as they have different databases. `FileStorage:MaxFileBytes` (default 20 MB) caps a single file.
Back this folder up together with the database — SQL holds only the files' names and hashes.

Files of sensitive (vault) documents are encrypted with ASP.NET Core Data Protection. Its key ring lives in
`%LOCALAPPDATA%\LifeOS\keys` (DPAPI-wrapped on Windows, so it opens only for the Windows account running the API);
set `FileStorage:KeysPath` to move it. **Back the keys folder up with the files folder** — without it, vault files
can't be read. Each environment (UAT, Live) gets its own keys folder, like its own files folder.

## Running it

Two terminals:

```bash
# API on http://localhost:5217 (Swagger UI at /swagger)
dotnet run --project LifeOS.Api --launch-profile http

# Web app on http://localhost:4200 (proxies /api to the API)
cd lifeos-web
npm start
```

Open http://localhost:4200, register, and you land on **My Day** — after saving the eight recovery codes registration
shows you (LifeOS sends no email; a code is how a forgotten password is reset, via "Forgot your password?" on the login
page; Settings makes a new set). Press <kbd>Q</kbd> anywhere to capture something into the Inbox, and
<kbd>Ctrl</kbd>+<kbd>K</kbd> (or <kbd>/</kbd>) to search.

## Tests and checks

| What | Command |
|---|---|
| Backend unit tests (pure logic: recurrence, streaks, progress, insights, ...) | `dotnet test LifeOS.Core.Tests` |
| Frontend unit tests (vitest) | `cd lifeos-web && npm test -- --watch=false` |
| Frontend tests in six timezones (run after any date-related change) | `cd lifeos-web && npm run test:tz` |
| Lint / format check | `cd lifeos-web && npm run lint` / `npx prettier --check src/app` |
| Builds | `dotnet build` / `cd lifeos-web && npm run build` |

Tests cover logic with real rules (dates, streaks, recurrence, insight rules), not templates or thin wrappers. See
the testing notes in `CLAUDE.md`.

## Repository layout

```
LifeOS.Api/            Web API: Areas/<Module>/Controllers (thin), Program.cs, Infrastructure/ (errors)
LifeOS.Core/           Everything else on the server
  Models/              Scaffolded EF entities + AppDbContext (generated: never edit by hand)
  Shared/              Cross-cutting: auth, tags, links, inbox, life areas, soft-delete/user filters
  Goals/ Tasks/ Calendar/ Habits/ Journal/ Dashboard/ Story/ Documents/ Learning/ Career/ Finance/
                       Each: DTOs/, ServiceContracts/, Services/, AutoMapper/
LifeOS.Core.Tests/     xUnit tests for the pure logic
database/
  schema/              00_create_database.sql ... 12_finance.sql (one SQL schema per module)
  procedures/          <schema>.<Name>.sql stored procedures (calendar feed, My Day, KPIs, life story, balances, ...)
lifeos-web/            Angular app
  src/app/core/        Services (one per API area), layout/shell, guards, interceptor, date helpers
  src/app/features/    One folder per module/page
  src/app/shared/      Reusable components (tag picker, linked items, quick add, reminders, attachments, load error)
docs/ARCHITECTURE.md   How it fits together
```

## Changing the database

Database-first. Edit or add a script in `database/schema/`, apply it to `LifeOS_UAT`, then re-scaffold:

```bash
dotnet ef dbcontext scaffold "Server=(localdb)\mssqllocaldb;Database=LifeOS_UAT;Trusted_Connection=True;TrustServerCertificate=True" Microsoft.EntityFrameworkCore.SqlServer --output-dir Models --context AppDbContext --force --no-onconfiguring --project LifeOS.Core --startup-project LifeOS.Api
```

Then check that `git diff LifeOS.Core/Models` shows only what the script intended. Hand-written additions to
entities go in partial classes under `LifeOS.Core/Shared/ModelExtensions/`. The full checklist is in `CLAUDE.md`.

## Backups

There's no automatic backup. Your data lives in one LocalDB database, so back it up now and then:

```bash
sqlcmd -S "(localdb)\mssqllocaldb" -Q "BACKUP DATABASE LifeOS_UAT TO DISK = 'D:\My Projects\LifeOS\database\backups\LifeOS_UAT.bak' WITH INIT"
```

Restore and details: `database/Backup-Command.txt`. `database/backups/` is git-ignored. Back up the files and keys
folders (see *File storage* above) at the same time.

Each user can also take their own copy: **Settings › Your data › Download my data** gives a zip (JSON + a CSV per table + the
files, vault files decrypted — keep it somewhere safe), which can be imported into a new, empty account, on this
machine or another one.

## Troubleshooting

- **"Address already in use" on 5217 or 4200.** A previous API or `ng serve` process is still holding the port.
  End the stray `LifeOS.Api.exe` / `node.exe` in Task Manager (or reboot). If it persists, change the port in
  `LifeOS.Api/Properties/launchSettings.json` and `lifeos-web/proxy.conf.json` together.
- **sqlcmd: "Unable to complete login process".** LocalDB is stopped: `sqllocaldb start MSSQLLocalDB`.
- **A script fails on a filtered index ("SET options have incorrect settings").** Run sqlcmd with `-I`
  (QUOTED_IDENTIFIER ON).
- **"Can't reach the LifeOS server" in the app.** The API isn't running, or it runs on a different port from the
  one in `proxy.conf.json`.
- **Sent back to the login page.** Your login lasts 24 hours. Log in again and you return to the page you were on.
- **An ng-bootstrap component renders half-empty.** Check the console for `$localize is not defined` (see `CLAUDE.md`).
