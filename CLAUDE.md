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
- Base columns on every table: `CreatedAt`/`UpdatedAt`, `IsDeleted`/`DeletedAt` (soft delete via global query filter — never hard-delete), all dates/times stored UTC via `SYSUTCDATETIME()`.
- **Multi-user, not single-tenant**: every user-owned table gets a `UserId` column (FK to `shared.Users`) — confirmed with you. `shared.Users` is a real multi-row table populated by registration, not a single seeded account. `LifeAreas` is the one shared/global exception (fixed seeded taxonomy, not personal data, no `UserId`).
- Soft delete is implemented once, centrally: `LifeOS.Core/Shared/ModelExtensions/ISoftDeletable.cs` + a partial-class declaration per scaffolded entity + one reflective global query filter wired through the scaffolded `OnModelCreatingPartial` hook (`AppDbContext.SoftDelete.cs`). New entities just need `public partial class Xxx : ISoftDeletable;` added alongside the others — the filter picks them up automatically, nothing per-entity to configure.
- **Auth exists**: JWT bearer (`Areas/Shared/Controllers/AuthController` — register/login/me), `IAuthService`/`AuthService` using `PasswordHasher<User>`, `IJwtTokenService`, `ICurrentUserService` (reads JWT claims via `IHttpContextAccessor`). Expected business failures (duplicate email/tag name, wrong password, not found) return `OperationResult<T>` (generic `Success`/`Data`/`Error`, `Shared/DTOs/OperationResult.cs`) from the service, not exceptions — exceptions stay for genuinely unexpected errors only, caught by the global handler. Reuse `OperationResult<T>` for every new module's service, don't make a bespoke per-module result type.
- **Per-user query scoping is now global** (added Session 5): `IUserOwned` (`Shared/ModelExtensions/IUserOwned.cs`, just `int UserId`) alongside `ISoftDeletable` — the same reflective filter in `AppDbContext.SoftDelete.cs` combines both (`!IsDeleted && UserId == CurrentUserId`) per entity type automatically. A new user-owned entity just needs `public partial class Xxx : ISoftDeletable, IUserOwned;` — nothing else to configure. `AppDbContext` takes `ICurrentUserService` via a second constructor (in the same partial file, since the scaffolded one can't be touched); EF Core's DI resolves the richer constructor automatically.
- **Race safety on unique business constraints**: a real race was hit in practice during Session 5 (two concurrent create-with-same-name requests) — `CreateAsync`/`RenameAsync`-style methods should catch `DbUpdateException` where `InnerException is SqlException { Number: 2627 or 2601 }` and translate it to the same `OperationResult.Fail(...)` message the pre-check uses, as a safety net alongside (not instead of) the upfront duplicate check.
- `LifeOS.Core` needs `<FrameworkReference Include="Microsoft.AspNetCore.App" />` (not an old standalone NuGet package) for any ASP.NET Core types (e.g. `IHttpContextAccessor`) — the old `Microsoft.AspNetCore.Http.Abstractions`/`Microsoft.Extensions.Identity.Core` NuGet packages are obsolete now that .NET ships these in the shared framework.
- SQL schema script gotchas (`sqlcmd` specific): always `SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON;` at the top — filtered indexes (`WHERE IsDeleted = 0`) fail under sqlcmd's default session settings otherwise. Keep index-creation statements **outside** the `IF NOT EXISTS (SELECT 1 FROM sys.tables...)` table-creation guard (check `sys.indexes` separately) so scripts stay safely re-runnable even after the table already exists.
- Use the shared `Tags` entity for all free-form categorization; no bespoke per-module category enums.

## Frontend conventions
- Standalone components only, feature-folder structure under `src/app/features/<module>`.
- One data-access service per feature wrapping `HttpClient`; no `HttpClient` in components.
- Signals for local state, OnPush change detection, reactive forms.
- One shared layout/shell (`core/layout/shell.ts`) wraps every route; style with CoreUI/Bootstrap utilities + shared SCSS partials, not bespoke per-component CSS — exception only for modules that genuinely need custom visuals (Dashboard, Calendar).
- `angular-eslint` + Prettier must pass before a session is considered done. `tsconfig.json` needs `"strict": true` set explicitly — Angular 22's `ng new` no longer sets the bundled flag by default.
- **No `.spec.ts` maintenance** as routine scaffolding — only write/keep tests for components or services with real logic (progress/streak/recurrence calculations, date math), not for templates or thin wrappers.
- `lifeos-web/` lives directly at the repo root (not nested under a `client/` folder).
- `@coreui/coreui/dist/css/coreui.min.css` is the *one* global CSS framework (Bootstrap-compatible superset) — don't also load plain `bootstrap.css`, that duplicates/conflicts with it.
- ag-Grid (v36+) uses the newer JS-based Theming API (e.g. `theme={themeQuartz}` set per-grid in code), not a global CSS theme file — wire it where a grid is actually built, not globally.
- **Visual consistency convention (confirmed Session 5)**: cards (`.card.shadow-sm`) are the one content-grouping unit used everywhere — narrow centered cards for single-purpose forms (login/register), full-width `.card` sections stacked in a `.container` for content/feature pages (Home, and every future module page). The shell's content area has a `bg-body-tertiary` background so cards read as distinct white panels. Don't invent a different grouping pattern per screen.
- Reusable cross-feature UI (tag-picker, future quick-add, linked-items widget) lives in `src/app/shared/components/<name>/`, is standalone/OnPush, uses signal `input()`/`output()` (not `@Input()`/`@Output()` decorators), and owns its own data fetching via the relevant `core/services/*.ts` — it's not just a dumb presentational component.

## Workflow
- See `LifeOS_Development_Plan.md` for the full roadmap, deviations from the original blueprint, and the Month 2–4 timeline.
- See `PROGRESS.md` for "where we left off" before starting a session.
- End every session with: build clean, feature verified (ideally in the actual browser), git commit, `PROGRESS.md` updated.
