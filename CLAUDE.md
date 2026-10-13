# LifeOS — Project Conventions

Full roadmap and rationale: `LifeOS_Development_Plan.md`. Session-to-session state: `PROGRESS.md`. Read both at the start of a session.

## Stack
.NET 10 LTS Web API (`LifeOS.Core` + `LifeOS.Api`) + Angular 22 (standalone components, Signals). Database: SQL Server LocalDB, database name `LifeOS_UAT` (a separate `LifeOS_Live` gets created only when actually going live).

## Fixed frontend libraries — do not add others without updating the plan doc
Bootstrap 5, ng-bootstrap, @coreui/angular (free tier), ag-Grid Community, SweetAlert2, ngx-toastr, ng2-charts (Chart.js), Bootstrap Icons.

## Backend conventions
- **Areas + per-module folders** (pattern from `OkayToolsEIA4`, confirmed): `LifeOS.Api/Areas/<Module>/Controllers/`, attribute-routed as `api/<Module>/<Controller>`. `LifeOS.Core/<Module>/{DTOs,ServiceContracts,Services,AutoMapper}/` — one interface + implementation pair per domain concern (`IGoalsService`/`GoalsService`). Cross-cutting concerns (Tags/EntityLinks/LifeAreas/Users/Auth) live under the `Shared` module/area, not scattered.
- Controllers are thin; logic lives in Services.
- DTOs + AutoMapper, never return entities (`Models/`) directly from controllers.
- **Database-first**: schema lives in `database/schema/*.sql` (one file per module, each creating its own SQL schema — `goals`, `tasks`, `calendar`, `habits`, `journal`, `shared` — never `dbo`), never EF migrations. Change cycle: edit/add a `.sql` script → apply to `LifeOS_UAT` → `Scaffold-DbContext -force` (exact command in `database/Scaffold-DbContext-Command.txt`) → `LifeOS.Core/Models` regenerates.
- Never hand-edit files under `LifeOS.Core/Models/` — they get overwritten on every re-scaffold. Hand customizations (marker interfaces, computed properties) go in a separate partial class under `LifeOS.Core/Shared/ModelExtensions/`.
- **Dapper + stored procedures** (`database/procedures/*.sql`) for any multi-join/aggregation query (Calendar feed, Dashboard aggregation, later Reports) — deliberate choice so SQL gets learned, not hidden behind LINQ. EF Core stays for simple single-entity CRUD.
- Base columns on every table: `CreatedAt`/`UpdatedAt`, `IsDeleted`/`DeletedAt` (soft delete via global query filter — never hard-delete), all dates/times stored UTC.
- Use the shared `Tags` entity for all free-form categorization; no bespoke per-module category enums.
- `LifeAreas` is a small fixed, seeded taxonomy (not a CRUD module) used by Goals/Habits/Journal/Dashboard.

## Frontend conventions
- Standalone components only, feature-folder structure under `src/app/features/<module>`.
- One data-access service per feature wrapping `HttpClient`; no `HttpClient` in components.
- Signals for local state, OnPush change detection, reactive forms.
- One shared layout/shell wraps every route; style with Bootstrap utilities + shared SCSS partials, not bespoke per-component CSS — exception only for modules that genuinely need custom visuals (Dashboard, Calendar).
- `angular-eslint` + Prettier must pass before a session is considered done.
- `lifeos-web/` lives directly at the repo root (not nested under a `client/` folder).

## Workflow
- See `LifeOS_Development_Plan.md` for the full roadmap, deviations from the original blueprint, and the Month 2–4 timeline.
- See `PROGRESS.md` for "where we left off" before starting a session.
- End every session with: build clean, feature verified (ideally in the actual browser), git commit, `PROGRESS.md` updated.
