# LifeOS — Development Plan

**A session-based build plan for a personal Life OS / ERP, scoped for Claude Code + Claude Pro, .NET Core Web API + Angular.**

Prepared: 2026-10-13

---

## 0. Purpose of this document

This is the working plan for building LifeOS: what we're building, in what order, and how we'll split the work into sessions that fit a **Claude Pro + Claude Code** workflow on a **1-month timeline at ~2 hours/day**. It is a living document — update it as scope, decisions, or priorities change. It is based on `LifeOS_Complete_Life_Management_Blueprint.docx` (a ChatGPT-authored concept document), but **deviates from it in several places** where I think the blueprint needs adjusting for a real, buildable, one-person project. Those deviations are called out explicitly in Section 2 so you can push back on any of them.

---

## 1. What LifeOS actually is (confirmed with you)

A single-user personal application to **manage and actively improve** your life — not a passive record-keeping tool. Confirmed scope and intent:

- Full-fledged **Personal Life OS / ERP** — the long-term ambition is all 20 life domains from the blueprint (goals, tasks, finance, health, career, learning, family, home, documents, journal, habits, travel, values, ideas, safety, purchases, contribution, analytics), connected rather than siloed.
- **Goals must be flexible**, not just "serious" career/life goals. The same Goals engine needs to comfortably hold things like "Become a Technical Lead" *and* "Finish GTA V" *and* "Travel to Goa" *and* "Try that new ramen place" — different categories, same underlying mechanic (title, progress, milestones, status).
- You are actively learning Angular while this gets built — the plan should let you **dogfood the app** to track that learning (as a Goal/Project) even before a dedicated Learning module exists.
- Local machine only, for now — but **multi-user capable at the data layer** (confirmed in Session 2): every user-owned table carries a `UserId`, and there's a real registration screen, not just a single seeded account. Local-only hosting and multi-user schema aren't in tension — this just means the app is ready to have more than one person's data in it later without a schema rework.
- Deadline: **1 month, ~2 hours/day (~50–60 hours total)**. Given that budget, "perfect" for 20 modules in a month isn't realistic — so we're scoping Month 1 to a **small set of modules built genuinely well**, with the rest of the 20-module catalogue fully documented (Section 7) so later months can move fast.

---

## 2. Where this plan deviates from the blueprint (please confirm or override)

The blueprint is a good *concept* document but was written without engineering constraints in mind. Here's what I'm changing and why — flag anything you disagree with.

| # | Blueprint said | This plan does instead | Why |
|---|---|---|---|
| 1 | ASP.NET Core Identity, implying registration/roles | ~~Originally: single seeded user, no registration~~ **Reversed per your request (Session 2)**: real multi-user `shared.Users` table + JWT login **and** a registration screen, built in Session 4. Still no password-reset flow or role-based access — those remain out of scope since nothing in the blueprint needs roles. | You asked explicitly for multi-user support and a registration screen alongside login — schema redesigned in Session 3 accordingly (every user-owned table now carries a `UserId`). |
| 2 | Hosted/deployed implied by "application" framing | Local machine only (`localhost`) for Month 1 | Confirmed by you. Saves hosting, HTTPS cert, domain, and security-hardening work entirely for now. |
| 3 | Hangfire for background jobs (reminders etc.) | Deferred. Reminders/due-items computed on page load / simple query, no job server in Month 1 | A background job host is infrastructure, not a feature you'll see or feel in week one. Add it in Phase 2+ when you actually need "notify me at 8am even if the app isn't open." |
| 4 | Angular + CoreUI (implying CoreUI Pro's full widget set) | Bootstrap 5 + ng-bootstrap + **@coreui/angular free tier only** — confirmed with you, see Section 3 | CoreUI's nicer dashboard widgets are mostly in the **Pro (paid)** tier, which this plan avoids unless you already own a license. Free CoreUI + Bootstrap/ng-bootstrap keeps the visual continuity with OkayToolsEIA4 you're used to, at no cost. |
| 5 | EntityLinks (generic cross-module linking) placed late, implied as a later-phase concern | Pulled into the **Foundation milestone (M1)**, built on day one | The whole pitch of LifeOS is "connected, not 20 disconnected tools." If EntityLinks + Tags arrive last, every earlier module has to be retrofitted. Building the link/tag plumbing first means Goals, Tasks, Calendar, Habits, and Journal can all link to each other from the start. |
| 6 | "Smart Insights" / Weekly Review live in Phase 5 (Intelligence & Automation), last | A **lightweight, rule-based** version (no AI) ships in Month 1, inside the Dashboard milestone | You said the goal is to *improve* your life, not just log it. A dashboard that only ever shows raw counts doesn't do that. Simple deterministic rules ("habit streak broken," "goal untouched 14 days," "no journal entry in 5 days") are cheap to build and give you the feedback loop immediately. Full AI/automation stays a true later-phase item. |
| 7 | 5 fixed phases | More, smaller milestones (see Section 6) | You asked not to be boxed into exactly 5 phases — milestones here are sized to roughly 3–5 sessions each so progress is visible weekly, not monthly. |
| 8 | Dapper "where useful" from day one | ~~Originally deferred to Phase 2+~~ **Reversed per your request**: Dapper + hand-written stored procedures are used from Session 15 onward for any multi-join/aggregation query (Calendar feed, Dashboard aggregation, later Reports) | You specifically want to build real SQL/SP fluency alongside the app, not just have EF/LINQ hide every query. Simple CRUD still stays on EF Core — only joins/aggregations get a stored procedure. |
| 9 | "EF Core" without specifying code-first vs database-first | **Database-first via `Scaffold-DbContext`**, confirmed with you | Matches your existing `OkayToolsEIA4` convention exactly (`EIA4.Core/Database-Scaffold-Command.txt` already documents this exact workflow). Schema is hand-designed in SQL first — clearer to reason about for a 20-module system than letting EF infer it from classes — then entity classes are generated from it. |

---

### Gaps in the blueprint worth flagging (it was written with a minimal prompt — these fell through the cracks)

| Gap | What's missing | What this plan does |
|---|---|---|
| **No deletion/recovery model** | Blueprint never addresses what happens when you delete a Goal with linked Tasks, or accidentally delete a Journal entry. For a system holding your life's records, hard deletes are risky. | **Soft delete**: every table gets physical `IsDeleted`/`DeletedAt` columns in the SQL schema (so they appear automatically after scaffolding), plus a shared `ISoftDeletable` marker interface added via a hand-written **partial class** per scaffolded entity, and one reflection-based global query filter configured in a partial `OnModelCreating` extension on the DbContext. Survives re-running `Scaffold-DbContext -force` cleanly since none of this touches the generated files. Nothing is destroyed outright in Month 1. |
| **No date/time convention** | No mention of timezones or storage format — the #1 source of bugs in recurring tasks, streaks, and calendars. | Store all dates/times in **UTC**, convert to local only at display time. Documented in `CLAUDE.md` (Appendix B) and applied from Session 3. |
| **"LifeAreas" entity is referenced but never defined** | The shared-entities table lists `LifeAreas` (used by Goals/Habits/Journal/Dashboard/Life Balance Wheel) but no module ever specifies it as a thing you create or manage. | Treat Life Areas as a small **fixed, seeded taxonomy** (Career, Health, Finance, Relationships, Learning, Personal/Fun, etc.) rather than building a CRUD module for it — Goals/Habits/Journal just tag against it. Keeps the "Life Balance Wheel" visual buildable as a stretch item in Session 24 without a whole extra module. |
| **Backup/export mentioned as a principle, never as a feature** | "Privacy and ownership: backups, data portability" is listed under Section 9 of the blueprint but no module implements it, and it isn't scheduled before Phase 5. | Since this is a single LocalDB file holding your actual life data with no redundancy, add a **minimal manual backup step** (a `BACKUP DATABASE` script you run periodically, or copy the `.mdf`/`.ldf`) in Session 3 — five minutes of setup now versus losing a month of data later. Full export/import UI stays a Phase 2+ feature. |
| **No real global search** | "Search" appears once in the integration diagram and once under Documents, never designed. | Explicitly deferred to Phase 2 — flagging so it's a conscious cut, not a forgotten one. |
| **Attachments/file upload never scheduled** | Blueprint lists `Attachments` as a shared entity and "Files: private local storage" in tech architecture, but no session anywhere builds file upload. | Journal/Notes are **text-only in Month 1**; file upload (photos in Journal, scans in Documents) is a Phase 2 item, built once alongside the Documents module where it matters more. |
| **Tags vs. per-module "Categories" redundancy** | Several modules (Tasks, Ideas) list their own bespoke "Categories" sub-module alongside the separate shared `Tags` entity — same concept, two mechanisms. | One mechanism: the shared **Tags** system (Session 5) is used everywhere free-form categorization is needed. No per-module category enums to build and maintain separately. |

---

## 3. Technical foundation

### Stack
- **Backend:** ASP.NET Core Web API, **.NET 10 LTS** (confirmed on the machine — `.NET 10` is the current LTS release, released Nov 2025; superseded my original ".NET 8" assumption, which wasn't even installed).
- **Data access:** EF Core, **database-first** via `Scaffold-DbContext` (see dedicated subsection below) for standard CRUD — matches your `OkayToolsEIA4` convention, not code-first migrations. **Plus Dapper + hand-written stored procedures for complex/multi-join queries and reports** (confirmed with you — deliberately chosen over pure LINQ so you build real SQL fluency alongside the app; see the "Dapper + stored procedures" subsection below).
- **Database:** SQL Server (LocalDB for local dev). **Database name: `LifeOS_UAT`** (confirmed — a `LifeOS_Live` database gets created separately whenever this actually goes live; UAT is where all Month 1+ development happens).
- **Auth:** ASP.NET Core Identity's password hasher + a minimal `Users` table (not the full Identity UI/registration machinery) + JWT bearer tokens. One seeded user. Login screen in Angular, token stored and attached via an HTTP interceptor.
- **Frontend:** Angular (latest stable — CLI 22.x confirmed installed), **standalone components** (no NgModules), Signals for local component state, lazy-loaded feature routes, OnPush change detection by default, reactive forms, strict TypeScript, `angular-eslint` + Prettier enforced from Session 2.
- **Logging:** Serilog (console + rolling file sink), wired in Session 2.
- **Background jobs:** none yet (see deviation #3).

### Dapper + stored procedures (confirmed — for complex/join-heavy queries)
Simple CRUD per entity stays on EF Core (via the scaffolded `AppDbContext`). But anything with multiple joins or real aggregation — the Calendar unified feed (Session 15/16), Dashboard aggregation (Session 22), Goal progress roll-ups, any later Reports module — is written as a **SQL stored procedure** under `database/procedures/`, called via **Dapper** from the relevant Service class. Two data-access paths in the same app, used deliberately for what each is good at:
- EF Core (scaffolded entities) → single-entity CRUD, simple filters.
- Dapper + stored procs → multi-table joins, aggregations, reports — and a chance to actually write SQL rather than have LINQ hide it.

### Frontend libraries (fixed, confirmed — not re-decided per session)

| Need | Library | Why |
|---|---|---|
| CSS/layout base | **Bootstrap 5** | You're already fluent in it from OkayToolsEIA4. |
| Angular-native components (modals, dropdowns, tooltips) | **ng-bootstrap** | Bootstrap look without a jQuery dependency conflicting with Angular's change detection. |
| Dashboard layout/cards/sidebar | **@coreui/angular** (free tier) | Matches the CoreUI look you already know; Pro-only widgets avoided (see deviation #4). |
| Data tables/grids | **ag-Grid Community** (free) | Sorting/filtering/paging for any list view (Tasks, later Finance transactions) without hand-rolling it. |
| Confirm dialogs & alert popups | **SweetAlert2** | "Delete this goal?" confirmations, success/error popups. |
| Toast notifications | **ngx-toastr** | Lightweight "Task saved" style non-blocking notifications. |
| Charts | **Chart.js** via **ng2-charts** | Free, sufficient for Month 1 dashboard visuals (streaks, progress, trends). |
| Icons | **Bootstrap Icons** | Free, pairs directly with Bootstrap 5. |

These get installed once in Session 1/2 and are the only UI libraries used throughout Month 1 — no ad-hoc library additions mid-build without updating this table.
- **Architecture:** modular monolith — one API solution organized by feature module, one Angular app organized by feature module. Each "module" folder mirrors a blueprint module so new ones slot in later without restructuring.

### Solution layout (confirmed — built in Session 1; mirrors `OkayToolsEIA4`'s Areas/Core-Web conventions, module-first)
```
LifeOS.sln
LifeOS.Core/
  Models/                  -> Scaffold-DbContext output: entity classes + AppDbContext — never hand-edited
  Shared/                  -> cross-cutting, not tied to one module:
    ModelExtensions/       -> partial classes (ISoftDeletable markers, computed properties, nav helpers)
    DTOs/ ServiceContracts/ Services/ AutoMapper/   -> Tags, EntityLinks, LifeAreas, Users/Auth
  Goals/
    DTOs/ ServiceContracts/ Services/ AutoMapper/
  Tasks/
    DTOs/ ServiceContracts/ Services/ AutoMapper/
  Calendar/  Habits/  Journal/  Dashboard/
    DTOs/ ServiceContracts/ Services/ AutoMapper/    -> same per-module shape throughout
LifeOS.Api/
  Areas/
    Shared/Controllers/   -> PingController, AuthController, TagsController, EntityLinksController
    Goals/Controllers/    -> GoalsController
    Tasks/Controllers/    -> TasksController
    Calendar/Controllers/ Habits/Controllers/ Journal/Controllers/ Dashboard/Controllers/
  Program.cs, DI wiring, Swagger, Serilog, JWT auth middleware
database/
  schema/                 -> hand-written SQL DDL, source of truth for the schema (see below), one schema + file per module:
                             01_shared.sql   (schema `shared`:   Users, Tags, EntityLinks, LifeAreas)
                             02_goals.sql    (schema `goals`:    Goals, GoalMilestones)
                             03_tasks.sql    (schema `tasks`:    Tasks, Projects)
                             04_calendar.sql (schema `calendar`: Events, Reminders)
                             05_habits.sql   (schema `habits`:   Habits, HabitEntries)
                             06_journal.sql  (schema `journal`:  JournalEntries)
  procedures/              -> stored procedures for complex/join-heavy queries, called via Dapper (one .sql per proc)
  Scaffold-DbContext-Command.txt -> the exact scaffold command for this project (see below)
lifeos-web/                -> Angular app, directly at repo root (confirmed — not nested under client/)
  src/app/core/            -> auth, http interceptors, guards, shared layout
  src/app/shared/          -> tag picker, quick-add, linked-items widget, reusable UI
  src/app/features/
    goals/ tasks/ calendar/ habits/ journal/ dashboard/
```
Each backend module folder (`LifeOS.Core/Goals/`, `LifeOS.Api/Areas/Goals/`) and each frontend feature folder (`lifeos-web/src/app/features/goals/`) line up 1:1 with the same module name — a new module (Phase 2+) always means adding the same four folders in three places, never touching what's already there.

### Database-first workflow (confirmed — matches `OkayToolsEIA4`, with per-module schemas)
Schema changes are **never** made by editing C# entity classes or running EF migrations. The cycle is:
1. Write or extend a `.sql` DDL script under `database/schema/` (one file per module, each creating its own SQL schema, e.g. `02_goals.sql` creates schema `goals` with `goals.Goals`/`goals.GoalMilestones`).
2. Run that script against the `LifeOS_UAT` database (LocalDB).
3. Re-run `Scaffold-DbContext ... -force` to regenerate `LifeOS.Core/Models` from the live schema.
4. Any custom behavior on an entity (marker interfaces, computed properties, validation) goes in a **separate partial class** under `Shared/ModelExtensions/` — never in the generated files, since step 3 overwrites them.

**Why per-module SQL schemas instead of one flat `dbo`:** confirmed with you — `Scaffold-DbContext` handles multiple schemas cleanly; it only needs to disambiguate class names when two *different* schemas contain a table with the identical name, which won't happen here since every module's tables already have unique names by design (`Goals`, `Tasks`, `Events`, `Habits`, `JournalEntries`, ...). Using `goals.*`, `tasks.*`, `calendar.*`, `habits.*`, `journal.*`, `shared.*` schemas instead of dumping everything in `dbo` reinforces the same module boundaries the rest of the architecture already commits to, visually groups tables in SSMS, and costs nothing extra to scaffold.

The scaffold command (adapted from your existing `Database-Scaffold-Command.txt`), kept in `database/Scaffold-DbContext-Command.txt`:
```
Scaffold-DbContext "Server=(localdb)\mssqllocaldb;Database=LifeOS_UAT;Trusted_Connection=True;TrustServerCertificate=True" Microsoft.EntityFrameworkCore.SqlServer -OutputDir Models -Context AppDbContext -force -NoOnConfiguring -Project LifeOS.Core -StartupProject LifeOS.Api
```
No `-Schemas` filter is passed, so every module schema gets scaffolded together into one `AppDbContext`. The `database/schema/*.sql` scripts are the real "migration history" in source control — there is no `Migrations/` folder.

### Coding conventions (pulled from `OkayToolsEIA4` as your reference style)
Your existing repo uses a consistent layered pattern worth carrying forward: one interface + implementation pair per domain concern (`IGoalsService` / `GoalsService`), DTOs separate from entities, AutoMapper for the translation, controllers thin and delegating to services, and database-first scaffolding — plus its `Areas/<Module>/Controllers` convention (confirmed, carried over exactly: LifeOS uses `Areas/Goals/Controllers`, `Areas/Tasks/Controllers`, etc., attribute-routed as `api/<Area>/<Controller>`). LifeOS follows the same shape in a 2-project split (`LifeOS.Core` + `LifeOS.Api`), identical to `EIA4.Core` + `EIA4.Web`, with one difference confirmed with you: inside `LifeOS.Core`, DTOs/ServiceContracts/Services/AutoMapper are nested **per module** (`Goals/DTOs/`, `Goals/Services/`, ...) rather than one flat top-level folder per concern — keeps each module's files together as the catalogue grows to 20.

Angular side conventions (standards you asked for explicitly):
- Standalone components only, no NgModules.
- Feature-folder structure, one folder per blueprint module.
- Smart/container components (talk to services) vs. dumb/presentational components (inputs/outputs only).
- A thin `data-access` service per feature wrapping `HttpClient` calls — no direct `HttpClient` use in components.
- Signals for local/component state; plain RxJS for HTTP streams. No NgRx for Month 1 — the app isn't big enough yet to need it; revisit if state sharing across many features gets painful.
- **One shared app layout/shell** (`core/layout/`: header, sidebar/nav, content outlet — built in Session 8) wraps every feature route. Styling comes from Bootstrap utility classes + a small set of shared SCSS partials (variables, mixins) — **not** bespoke per-component CSS sprinkled across every module (confirmed with you). Custom CSS is only acceptable where a module genuinely needs it visually (Dashboard widgets/charts, Calendar grid) — the exception, not the default.
- `angular-eslint` + Prettier enforced via a pre-commit check from Session 2 onward.
- **No `.spec.ts` maintenance as routine scaffolding** (confirmed with you in Session 2) — tests only get written for components/services with real logic (progress calculations, streak logic, date aggregation), not for templates or thin wrappers.

---

## 4. How we'll actually run sessions (Claude Code + Claude Pro constraints)

Claude Pro usage resets on a rolling window, and any single Claude Code conversation will eventually hit a context limit and auto-compact older turns — compaction keeps things working but can blur fine detail from much earlier in a long conversation. The plan below is designed around that:

1. **Each session below is scoped to one cohesive, shippable slice** (~2 hours) — not "work on Goals module" but "Goals API CRUD + list/detail screens." That gives every session a natural start and a natural stop.
2. **Start each real-world 2-hour block as its own Claude Code conversation** where practical, rather than one continuous marathon conversation across days. Point it at this plan file plus `PROGRESS.md` (template in Appendix A) so it can pick up cold in under a minute.
3. **The repo is the real memory, not the conversation.** At the end of every session:
   - Code builds and runs.
   - Feature is manually verified in the browser.
   - Git commit with a clear message.
   - `PROGRESS.md` updated: what shipped, what's next, any open decision.
4. If a session runs into a Claude Pro usage limit mid-task, stop at the nearest clean commit point (even if smaller than planned) and note it in `PROGRESS.md` rather than pushing through with a near-empty context budget.
5. `CLAUDE.md` (template in Appendix B) holds the conventions from Section 3 so they don't need re-explaining each session.

---

## 5. Month 1 scope — "the Core Loop"

Seven modules, built in this order, each usable and linked to the others by the end:

1. **Foundation & shared platform** — auth, Tags, EntityLinks, Quick Add, nav shell
2. **Goals & Milestones** — including fun/recreational goals, not just career-serious ones
3. **Tasks & Personal Projects**
4. **Calendar & Reminders**
5. **Habits & Routines**
6. **Journal & Reflections**
7. **Dashboard, My Day & lightweight Insights** — ties everything together

Everything else from the 20-module catalogue (Finance, Health, Career, Learning, Family, Home, Documents, Travel, etc.) is deliberately **out of Month 1** but fully scoped in Section 7 for whenever you continue past day 30.

---

## 6. Session-by-session roadmap (Month 1)

~28 sessions × ~2 hours ≈ 50–56 hours, leaving slack inside the ~60-hour budget for life getting in the way.

### Milestone 0 — Solution Bootstrap & Tooling
| # | Session | Deliverable | Done when |
|---|---|---|---|
| 1 | ✅ Solution & Angular scaffold | `.sln` with `LifeOS.Core` + `LifeOS.Api` (.NET 10, Areas-based controllers), Angular app (`lifeos-web`, standalone, at repo root) created, both run and talk to each other via a hello-world endpoint (`Areas/Shared/Controllers/PingController`) rendered in Angular through the dev proxy; git repo initialized | **Done** — `dotnet run` + `ng serve` both work, browser confirmed rendering live API data end to end |
| 2 | ✅ Tooling & conventions | ESLint/Prettier/strict TS wired; Serilog wired; global exception-handling middleware; standard API response envelope; Swagger; fixed frontend library set installed; shared layout shell built | **Done** — lint clean, build clean, thrown exception returns a clean `ApiResponse` JSON error, Swagger UI loads, shell+Home verified rendering in browser with zero console errors |
| 3 | ✅ Database & base entities (multi-user) | `database/schema/01_shared.sql` creating schema `shared` with `shared.Users` (real multi-row, no seeded account), `shared.Tags`/`shared.EntityLinks` (both `UserId`-scoped), `shared.LifeAreas` (seeded, global/unscoped), base audit columns (CreatedAt/UpdatedAt, **IsDeleted/DeletedAt**, **all dates UTC**) on every table; applied to `LifeOS_UAT` on LocalDB; `Scaffold-DbContext -force` generated `LifeOS.Core/Models`; `ISoftDeletable` partial classes + one reflective global query filter wired; manual DB backup command documented and tested | **Done** — script runs clean on a fresh LocalDB; scaffold regenerates Models without errors; a temporary debug endpoint confirmed EF Core + the soft-delete filter work end-to-end against real data; backup command tested (450 pages backed up successfully) |
| 4 | ✅ Auth — login **and** registration | JWT login endpoint, **registration endpoint** (creates a new `shared.Users` row), Angular login screen, **Angular registration screen**, auth guard + HTTP interceptor, logout, `ICurrentUserService` reading the JWT claims | **Done** — verified in a real browser: unauthenticated redirect to `/login`, registration → auto-login → home, logout → redirect, re-login — all confirmed working, not just curl-tested |

### Milestone 1 — Core Shared Platform
| # | Session | Deliverable | Done when |
|---|---|---|---|
| 5 | ✅ Tags | Tags CRUD API + reusable Angular tag-picker component; per-user global query filter added (`IUserOwned`) | **Done** — verified create/rename/delete via curl and in the browser, including per-user isolation with a second registered user |
| 6 | ✅ EntityLinks | Generic link-between-any-two-entities API + reusable "linked items" widget; pluggable `ILinkableEntityProvider` per entity type; undirected links stored canonically with a unique pair index | **Done** (API-verified; browser click-through pending) — two inbox items linked and visible from both ends; Goals/Tasks plug in by registering a provider when they exist |
| 7 | ✅ Quick Add | Global capture (FAB + `q` shortcut) for a task/note/journal/idea from anywhere. **Deviation:** none of those modules exist yet, so "the right module's inbox" became one shared capture inbox (`shared.InboxItems`, tagged by Kind) + an Inbox screen; each module later processes its Kind's items into real entities | **Done** (API-verified; browser click-through pending) — items land in the inbox under the right Kind |
| 8 | ✅ Nav shell | Sidebar layout (off-canvas drawer on mobile) with the blueprint's nav groups trimmed to Month 1 (Overview / Planning & growth / Wellbeing / System); My Day landing page; route-data-driven placeholder pages for not-yet-built modules; Tags management page; Inbox count badge | **Done** — every nav entry verified in the browser, unknown URLs redirect to My Day, no console errors |

### Milestone 2 — Goals & Milestones
| # | Session | Deliverable | Done when |
|---|---|---|---|
| 9 | ✅ Schema + scaffold | `database/schema/02_goals.sql` creating schema `goals` with `goals.Goals` (title, description, LifeAreaId, GoalType ShortTerm/LongTerm/BucketList, TargetDate as `DATE`, Status Active/Completed/Postponed/Abandoned, CompletedAt), `goals.GoalMilestones` (CompletedAt = done, SortOrder) and `goals.GoalTags` (real FK join to `shared.Tags`); apply + re-scaffold | **Done** — scaffold additive and deterministic (fresh-from-scripts DB scaffolds identically); "Become a Technical Lead" (Career/LongTerm) and "Finish GTA V" (Personal-Fun/ShortTerm) stored side by side with tags + milestones, read back via SQL and via EF with per-user isolation |
| 10 | Goals API + UI | CRUD for goals and milestones, progress % calculation, list/detail/create/edit screens | Can create a goal, add milestones, see progress update |
| 11 | Review flow + linking | Mark goal postponed/abandoned/revised; link goal to tasks via EntityLinks | Goal status changes persist; linked tasks visible on goal detail |

### Milestone 3 — Tasks & Personal Projects
| # | Session | Deliverable | Done when |
|---|---|---|---|
| 12 | Schema + scaffold | `database/schema/03_tasks.sql` creating schema `tasks` with `tasks.Tasks` (title, due date, priority, status, recurrence rule, ProjectId) and `tasks.Projects`; apply + re-scaffold | Scaffold regenerates cleanly, no hand-edited Model files lost |
| 13 | Tasks API + UI | CRUD, Today/Upcoming/Someday views, recurring task generation | Recurring task correctly spawns next instance on completion |
| 14 | Projects + linking | Project grouping UI, task-to-goal linking, priority sorting | A project groups multiple tasks; a task can link back to a goal |

### Milestone 4 — Calendar & Reminders
| # | Session | Deliverable | Done when |
|---|---|---|---|
| 15 | Schema + scaffold | `database/schema/04_calendar.sql` creating schema `calendar` with `calendar.Events`, `calendar.Reminders`; unified calendar query (stored procedure + Dapper, joining across `calendar`, `tasks`, `goals` schemas) aggregating events + task due dates + goal milestones | Scaffold regenerates cleanly; stored procedure returns a merged feed across sources |
| 16 | Calendar UI | Month/week calendar view (free Angular calendar component) wired to the aggregated feed | Items from all 3 sources render on the right days |
| 17 | Reminders | Reminder CRUD + due-items surfaced (computed on load, no job server yet) | A due reminder shows up without a background service running |

### Milestone 5 — Habits & Routines
| # | Session | Deliverable | Done when |
|---|---|---|---|
| 18 | Schema + scaffold | `database/schema/05_habits.sql` creating schema `habits` with `habits.Habits`, `habits.HabitEntries` (daily completion log); apply + re-scaffold; streak calculation logic | Scaffold regenerates cleanly, streak logic unit-tested |
| 19 | Habits UI | Daily check-off grid + streak display | Checking off a day updates the streak correctly, including breaks |

### Milestone 6 — Journal & Reflections
| # | Session | Deliverable | Done when |
|---|---|---|---|
| 20 | Schema + scaffold | `database/schema/06_journal.sql` creating schema `journal` with `journal.JournalEntries` (date, content, mood, LifeAreaId); apply + re-scaffold | Scaffold regenerates cleanly |
| 21 | Journal UI | Daily entry editor, mood picker, simple weekly reflection prompt screen | Can write/edit an entry, mood is stored and shown on a simple trend view |

### Milestone 7 — Dashboard, My Day & Lightweight Insights
| # | Session | Deliverable | Done when |
|---|---|---|---|
| 22 | Dashboard API | Aggregation endpoint backed by a stored procedure + Dapper (joins across `goals`/`tasks`/`calendar`/`habits`/`journal` schemas): today's tasks/events/reminders, active goal summaries, habit streaks, recent journal entry | One call returns everything the dashboard needs |
| 23 | Dashboard UI | "My Day" screen assembling all widgets | Opening the app shows a genuinely useful daily snapshot |
| 24 | Rule-based Insights + stretch Life Balance Wheel | Deterministic checks (habit streak broken, goal untouched 14+ days, no journal in 5+ days) surfaced on dashboard/weekly review; **if time allows**, a simple radar/wheel chart of goal/habit activity per Life Area | At least 3 rules implemented and verifiably trigger on seeded test data; wheel chart is a bonus, not required for milestone completion |

### Milestone 8 — Polish, Hardening, Testing, Docs
| # | Session | Deliverable | Done when |
|---|---|---|---|
| 25 | UX pass | Consistent loading states, error toasts, form validation, responsive check | No silent failures; app usable on a narrower window |
| 26 | Testing pass | Unit tests for progress/streak/recurrence logic (xUnit backend, Jasmine frontend); fix what breaks | Test suite green |
| 27 | Docs | README, `CLAUDE.md`, architecture notes updated; Phase 2 backlog confirmed | A cold reader (or a fresh Claude Code session) can onboard from the docs alone |
| 28 | Buffer | Catch-up for whatever slipped | — |

---

## 7. Beyond Month 1 — the honest full-ERP timeline

**Straight answer to "will all 20 modules be done in a month": no.** Month 1 delivers 6 of 20 modules (plus shared foundation) to a genuinely solid standard. At that same pace and quality bar, the realistic timeline for the **complete 20-module Personal ERP is roughly 3 more months beyond Month 1 — about 4 months total**, not 1. The estimate below makes that explicit instead of leaving the remaining 14 modules as a vague "later."

Session estimates use the same yardstick as Month 1 (schema+scaffold session, API+core-CRUD session(s), specialized UI/logic session(s) per module, scaled to how many sub-modules the blueprint lists for each).

### Phase 2 — Personal Administration & Growth (~Month 2, ~17 sessions ≈ 34h ≈ 2.5 weeks at 2h/day)
Prioritized to match your stated interests (learning Angular, serious career goals) over the blueprint's original ordering.

| Module | Est. sessions | Notes |
|---|---|---|
| Education & Learning | 4 | Lets you formally track "Learning Angular" instead of improvising it inside Goals |
| Career & Professional Growth | 4 | Timeline, goals, applications, achievements |
| Personal Finance & Wealth Management | 5 | Largest module in the blueprint; faster than it looks since you can port logic from your `OkayToolsEIA4`/WealthTrackr-style reference repo |
| Documents & Personal Records | 4 | First module needing real file upload (deferred from Month 1, see Section 2 gaps) |

### Phase 3 — Wellbeing & Life Admin (~Month 3 part 1, ~13 sessions ≈ 26h ≈ 2 weeks)
| Module | Est. sessions | Notes |
|---|---|---|
| Health & Wellness | 4 | Sensitive data — needs an encryption/access pass the blueprint flags but doesn't detail |
| Home, Property & Assets | 3 | |
| Purchases, Shopping & Subscriptions | 3 | |
| Family & Relationships | 3 | |

### Phase 4 — Experiences & Values (~Month 3 part 2, ~10 sessions ≈ 20h ≈ 1.5 weeks)
| Module | Est. sessions | Notes |
|---|---|---|
| Travel & Life Experiences | 3 | |
| Ideas, Creativity & Personal Projects | 3 | |
| Spirituality, Philosophy & Personal Values | 2 | Optional/adaptable per the blueprint itself |
| Social Contribution & Community | 2 | |

### Phase 5 — Security & Intelligence (~Month 4, ~11+ sessions ≈ 22h+ ≈ 1.5+ weeks, open-ended tail)
| Module | Est. sessions | Notes |
|---|---|---|
| Security, Safety & Emergency Planning | 3 | |
| Reports, Analytics & Life Intelligence (full version) | 4 | Month 1 shipped a deliberately small rule-based slice of this; this is the real version |
| Cross-module automation, external integrations, optional AI assistant | 4+ | Genuinely open-ended — treat as "keep going" rather than a fixed-scope milestone |

### Totals
- Phases 2–5 combined: **~51 sessions ≈ ~100 hours ≈ ~7.3 weeks** of actual work at 2h/day.
- Grand total with Month 1: **~79 sessions ≈ ~155 hours**, which spread across real calendar time (accounting for missed days, the Angular learning curve flattening out, and plain life) lands at roughly **4 months to a complete 20-module LifeOS**, not 1.
- Each module retains its full sub-module breakdown from the original blueprint (unchanged) — see `LifeOS_Complete_Life_Management_Blueprint.docx` Section 2 for the complete catalogue. Nothing there needs to change; only the build order and pacing do. Session-level breakdowns per module (like Section 6 has for Month 1) get written once we're actually starting that phase, not now — no point planning Session 47 in detail before Session 12 has taught us anything about real pace.

---

## 8. Risks to the 1-month target

- **Scope creep inside a module** — e.g., Calendar turning into a full scheduling engine. Mitigation: the "Done when" column in Section 6 is the contract — resist adding to it mid-session.
- **UI polish eating backend time** — Month 1's bar is "genuinely usable," not pixel-perfect. Defer visual polish to Milestone 8.
- **Skipped days compound** — missing 3–4 days of the 30 pushes Milestone 8 out, not the core modules; buffer session (28) and the ~4–10 hour slack in the 50–60 hour estimate exist for this.
- **New Angular learning curve** — since you're learning Angular concurrently, early Angular sessions (1, 2, 8) may run long. That's fine — it's also the point.

---

## 9. Definition of Done (applies to every session)

- Builds with no errors (`dotnet build` and `ng build` both clean).
- Feature manually exercised in the browser — not just "compiles."
- No new console errors/warnings introduced.
- Committed to git with a message describing the *why*, not just the *what*.
- `PROGRESS.md` updated before closing the session.

---

## Appendix A — `PROGRESS.md` starter template

```markdown
# LifeOS Progress Log

## Last session: [date] — Session [#] — [title]
- Shipped: ...
- Verified: ...
- Open decisions / questions for next session: ...
- Next up: Session [#] — [title]
```

## Appendix B — `CLAUDE.md` starter outline

(The real file lives at repo root; kept here too so the plan doc stays self-contained.)

```markdown
# LifeOS — Project Conventions

## Stack
.NET 10 LTS Web API (LifeOS.Core + LifeOS.Api) + Angular 22 (standalone components, Signals). Database: SQL Server LocalDB, `LifeOS_UAT`.

## Fixed frontend libraries — do not add others without updating the plan doc
Bootstrap 5, ng-bootstrap, @coreui/angular (free tier), ag-Grid Community, SweetAlert2, ngx-toastr, ng2-charts (Chart.js), Bootstrap Icons.

## Backend conventions
- **Areas + per-module folders** (pattern from OkayToolsEIA4, confirmed): `LifeOS.Api/Areas/<Module>/Controllers/`, attribute-routed as `api/<Module>/<Controller>`. `LifeOS.Core/<Module>/{DTOs,ServiceContracts,Services,AutoMapper}/` — one interface + implementation pair per domain concern (`IGoalsService`/`GoalsService`). Cross-cutting (Tags/EntityLinks/LifeAreas/Users/Auth) lives under the `Shared` module/area, not scattered.
- Controllers are thin; logic lives in Services.
- DTOs + AutoMapper, never return entities (Models/) directly from controllers.
- **Database-first**: schema lives in `database/schema/*.sql` (one file per module, each creating its own SQL schema — `goals`, `tasks`, `calendar`, `habits`, `journal`, `shared` — never `dbo`), never EF migrations. Change cycle: edit/add a .sql script -> apply to `LifeOS_UAT` -> `Scaffold-DbContext -force` (command in `database/Scaffold-DbContext-Command.txt`) -> `LifeOS.Core/Models` regenerates.
- Never hand-edit files under `LifeOS.Core/Models/` — they get overwritten on every re-scaffold. Hand customizations (marker interfaces, computed properties) go in a separate partial class under `LifeOS.Core/Shared/ModelExtensions/`.
- **Dapper + stored procedures** (`database/procedures/*.sql`) for any multi-join/aggregation query (Calendar feed, Dashboard aggregation, Reports); EF Core only for simple single-entity CRUD. Deliberate choice so SQL gets learned, not hidden behind LINQ.
- Base columns on every table: CreatedAt/UpdatedAt, IsDeleted/DeletedAt (soft delete via global query filter, never hard-delete), all dates/times stored UTC.
- Use the shared Tags entity for all free-form categorization; no bespoke per-module category enums.
- Life Areas is a small fixed, seeded taxonomy (not a CRUD module) used by Goals/Habits/Journal/Dashboard.

## Frontend conventions
- Standalone components only, feature-folder structure under src/app/features/<module>.
- One data-access service per feature wrapping HttpClient; no HttpClient in components.
- Signals for local state, OnPush change detection, reactive forms.
- One shared layout/shell wraps every route; style with Bootstrap utilities + shared SCSS partials, not bespoke per-component CSS — exception only for modules that genuinely need custom visuals (Dashboard, Calendar).
- angular-eslint + Prettier must pass before a session is considered done.

## Workflow
- See LifeOS_Development_Plan.md for the full roadmap.
- See PROGRESS.md for "where we left off."
- End every session with: build clean, feature verified, git commit, PROGRESS.md updated.
```
