# LifeOS Progress Log

## Last session: 2026-10-13 — Session 1 — Solution & Angular scaffold
- Shipped:
  - `.sln` with `LifeOS.Core` (classlib) + `LifeOS.Api` (webapi, `-controllers`, .NET 10), project reference wired.
  - `LifeOS.Core`: EF Core SqlServer + Design, AutoMapper (16.x — DI extensions package dropped, obsolete now that `AddAutoMapper()` ships in the main package).
  - `LifeOS.Api`: Areas-based routing confirmed — `Areas/Shared/Controllers/PingController.cs` (`GET /api/Shared/Ping`), CORS policy for `http://localhost:4200`, default WeatherForecast template cruft removed.
  - `lifeos-web/`: Angular 22 app scaffolded **directly at repo root** (moved out of an initial `client/` folder per your instruction), standalone `App` component calls `PingService` (`core/services/ping.service.ts`) and renders the API's live message; `provideHttpClient()` wired in `app.config.ts`; dev proxy (`proxy.conf.json`, wired into `angular.json`'s serve options) forwards `/api/*` to `http://localhost:5217`.
  - End-to-end verified in an actual browser tab: page rendered "LifeOS API is alive (server time UTC: ...)".
  - Git repo initialized at the LifeOS root (did not exist before); `.gitignore` added (excludes `OkayToolsEIA4/` — separate existing repo, plus the usual `bin/obj/node_modules`).
  - `CLAUDE.md` written at repo root from the plan's Appendix B, updated with everything decided today.
  - `LifeOS_Development_Plan.md`/`.docx` updated: .NET 10 (not 8 — only 10 was installed, and it's the current LTS), database name `LifeOS_UAT` (a `LifeOS_Live` comes later), per-module SQL schemas instead of `dbo` (`shared`/`goals`/`tasks`/`calendar`/`habits`/`journal`), Dapper + stored procedures reinstated for complex/join-heavy queries (explicit SQL-learning goal — reverses the earlier "defer Dapper" deviation), Areas + per-module `Core` folder structure (mirrors `OkayToolsEIA4`'s `Areas/<Module>/Controllers` convention, confirmed), `lifeos-web` at repo root instead of under `client/`, one shared Angular layout/shell instead of per-component bespoke CSS (exception: Dashboard/Calendar where custom visuals are genuinely needed).

- Verified:
  - `dotnet build` clean, 0 warnings/errors.
  - `dotnet run --project LifeOS.Api` → `GET /api/Shared/Ping` returns `{"message":"LifeOS API is alive","serverTimeUtc":"..."}`.
  - `ng serve` (via `npx ng serve` in `lifeos-web/`) compiles and serves on `:4200`; browser-rendered page confirmed showing the live API message (not just a build check).

- Open decisions / notes for future sessions:
  - .NET 10 SDK only is installed on this machine (no .NET 8) — SDK target is `net10.0` everywhere from here on.
  - Dev servers were stopped at the end of this session (no background processes left running) — Session 2 starts by launching both again.
  - Database (`LifeOS_UAT`, schema scripts, scaffold) has **not** been created yet — that's Session 3. Nothing to scaffold yet.
  - `AutoMapper.Extensions.Microsoft.DependencyInjection` was added then removed — `AddAutoMapper()` now ships directly in the `AutoMapper` package (16.x); don't re-add the extensions package.
  - Windows showed a transient "address already in use" on port 5217 after killing a prior `dotnet run` — resolved itself on retry (stale socket release delay, not a real conflict). If it recurs, retry once before troubleshooting further.

## Last session: 2026-10-13 — Session 2 — Tooling & conventions
- Shipped (backend, done via a verified fork):
  - Serilog (`Serilog.AspNetCore`, `Serilog.Sinks.Console`, `Serilog.Sinks.File`) wired in `Program.cs` — console + daily rolling file at `logs/lifeos-.log`.
  - `IExceptionHandler`-based global exception handling (`LifeOS.Api/Infrastructure/GlobalExceptionHandler.cs`), returns the new `ApiResponse<T>` envelope (`LifeOS.Core/Shared/DTOs/ApiResponse.cs`, with `Ok(...)`/`Fail(...)` helpers) on any unhandled exception, status 500.
  - Real Swagger UI via `Swashbuckle.AspNetCore` (replaced Microsoft's bare `AddOpenApi()`/`MapOpenApi()`, which only served raw JSON with no browsable page).
  - Verified: clean build, `/swagger/index.html` → 200, `/api/Shared/Ping` unaffected, a temporary throw-test endpoint confirmed the envelope shape and was deleted afterward.

- Shipped (frontend, done directly after a fork twice failed to execute — see note below):
  - ESLint (`@angular-eslint/schematics`) + `eslint-config-prettier` (as last `extends` entry, avoids rule conflicts with Prettier) + `format` npm script. Fixed one real lint failure (`ping.service.ts` using constructor injection instead of `inject()`).
  - `"strict": true` added explicitly to `tsconfig.json` (Angular 22's `ng new` no longer sets this by default — it only sets several individual strict-adjacent flags, not the bundled `strict` flag).
  - Fixed library set installed: `bootstrap`, `@ng-bootstrap/ng-bootstrap`, `@coreui/angular` + `@coreui/coreui` + `@coreui/icons(-angular)` (free tier only), `ag-grid-community` + `ag-grid-angular`, `sweetalert2`, `ngx-toastr` + `@angular/animations`, `ng2-charts` + `chart.js`, `bootstrap-icons`.
    - `ngx-toastr`'s latest (20.0.5) only declares Angular ^21 in peerDependencies (publishing lag right after Angular 22 shipped, no newer version exists yet) — installed with `--legacy-peer-deps`. Low risk; toast libraries rarely touch deep framework internals.
    - `--legacy-peer-deps` also pulled in a stale `@angular/animations@20.1.8` — caught and re-pinned explicitly to `22.2.2` to match the rest of core Angular.
    - **Styling decision**: `@coreui/coreui/dist/css/coreui.min.css` is used as the *one* global CSS framework (it's a Bootstrap-compatible superset — confirmed by grepping for `.btn`/`.navbar`/`.container`/`.row` classes in its output) — plain `bootstrap/dist/css/bootstrap.css` is deliberately **not** also loaded, to avoid duplicate/conflicting base styles. The `bootstrap` package stays installed for its SCSS source if we need variables/mixins later.
    - **ag-Grid decision**: no global ag-Grid CSS wired. `ag-grid-community`/`ag-grid-angular` v36 default to the newer JS-based Theming API (themes are applied per-grid in code, e.g. `theme={themeQuartz}`), not global CSS files — so wiring happens in whichever session first builds an actual grid (Tasks list, later Finance tables), not here.
    - `@angular/animations` and `provideAnimations()` are needed for `ngx-toastr` even though Angular 22 has deprecated the animations package in favor of native `animate.enter`/`animate.leave` — still functional, just a forward-looking note for whenever that package is eventually removed upstream.
  - Shared layout shell: `core/layout/shell.ts` (Bootstrap navbar, "LifeOS" brand, `<router-outlet>`, no nav links yet — those arrive in Session 8 once real feature modules exist). Hello-world ping content moved out of root `App` into `features/home/home.ts`, wired as the `''` route. Root `App` is now just `<app-shell />`.
  - Bumped the production bundle budget in `angular.json` (500kB → 1.5MB warning / 2.5MB error) — the default was never realistic once CoreUI + Bootstrap Icons + ag-Grid + Chart.js + SweetAlert2 + ngx-toastr were deliberately added; this isn't bloat to chase down, it's the cost of the confirmed library set.
  - Per your instruction: **not maintaining `.spec.ts` files going forward** unless there's real logic worth testing (progress/streak/recurrence calculations later) — fixed the one pre-existing broken default spec (`app.spec.ts`, which had been checking for stale "Hello, lifeos-web" text since Session 1 scaffold and was never actually run) but won't be adding new spec files as routine scaffolding.

- Verified:
  - `dotnet build` clean (backend fork).
  - `npm run lint` clean, `npm run build` clean with no budget warning, both `lifeos-web` and `LifeOS.Api` started together and checked in an actual browser tab: shell navbar + Home component rendered, live API message showing (not the fallback), zero console errors on a fresh reload. Both dev servers stopped afterward.

- Open decisions / notes for future sessions:
  - **Fork reliability note**: the first frontend-half fork attempt (and its retry) both returned after 0 tool calls with a prose summary that mimicked the orchestrator's own voice instead of executing — a real failure mode, not a one-off. Did the frontend work directly instead of retrying a third time. If delegating again, insist on seeing actual verification output (build/test logs, curl results) before trusting a "done" report, and treat a suspiciously fast/contentless completion as a sign to take over rather than retry blindly.
  - ag-Grid theming (legacy CSS vs. new Theming API) will need to be decided for real once a grid is actually built — current lean is the new Theming API (`themeQuartz` or similar) since that's v36's default path and avoids depending on a CSS file that may not exist in future versions.
  - User has asked to also support **multiple users** (not just one seeded account) and to add a **registration screen** alongside login — this changes Session 3's schema design (every user-owned table needs a `UserId` column, not just a single implicit user) and Session 4's scope (register + login, not login-only). Both get folded into Sessions 3–4, done next.

## Last session: 2026-10-13 — Session 3 — Database & base entities (multi-user)
- Shipped:
  - `database/schema/00_create_database.sql` (creates `LifeOS_UAT` if missing) and `01_shared.sql` (schema `shared`: `Users`, `LifeAreas`, `Tags`, `EntityLinks`, all with the base audit columns — `CreatedAt`/`UpdatedAt`/`IsDeleted`/`DeletedAt`, UTC via `SYSUTCDATETIME()`).
  - **Multi-user redesign** (per your instruction): `shared.Users` has no seeded single user anymore — it's a real multi-row table (`Email` unique, `PasswordHash`, `DisplayName`), populated by registration in Session 4. `Tags` and `EntityLinks` both carry a `UserId` FK — every user-owned table from here on gets a `UserId` column, not just a single implicit user. `LifeAreas` stays global/unscoped (shared taxonomy, not personal data), seeded with 6 rows (Career, Learning, Health, Finance, Relationships, Personal / Fun).
  - `Scaffold-DbContext` run successfully → `LifeOS.Core/Models/{AppDbContext,User,Tag,EntityLink,LifeArea}.cs`. Had to add `Microsoft.EntityFrameworkCore.Design` to `LifeOS.Api` too (EF tooling needs it on the *startup* project, not just `LifeOS.Core`).
  - Soft-delete: `LifeOS.Core/Shared/ModelExtensions/ISoftDeletable.cs` + partial-class declarations on all 4 scaffolded entities + a reflective global query filter added via the scaffolded `OnModelCreatingPartial` hook (`AppDbContext.SoftDelete.cs`) — applies to every current and future `ISoftDeletable` entity automatically, no per-entity config needed.
  - `AppDbContext` registered in `LifeOS.Api`'s DI (`appsettings.json` → `ConnectionStrings:LifeOS`, LocalDB, Trusted Connection — no password involved, safe to commit).
  - Fixed a real bug along the way: filtered indexes (`WHERE IsDeleted = 0`) fail under `sqlcmd`'s default `QUOTED_IDENTIFIER OFF` session setting — added `SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON;` to the top of schema scripts, and moved index-creation out of the table-creation `IF NOT EXISTS` guards so scripts stay safely re-runnable.
  - Fixed another: the try/catch wrapping `Program.cs` was logging EF Core design-time tooling's benign `HostAbortedException` as a fatal crash every time `dotnet ef` runs — added a specific catch clause to suppress just that one, expected case.
  - `database/Scaffold-DbContext-Command.txt` and `database/Backup-Command.txt` written (backup command actually tested — `BACKUP DATABASE LifeOS_UAT TO DISK = ...` succeeded, 450 pages). `database/backups/` gitignored (binary, local-only).

- Verified:
  - `dotnet build` clean.
  - `dotnet ef dbcontext info` confirmed the context resolves against `LifeOS_UAT` on `(localdb)\mssqllocaldb`.
  - Temporary debug endpoint (`GET /api/Shared/Ping/db-check`, removed afterward) queried `AppDbContext.LifeAreas` through the real running API and returned all 6 seeded rows in the correct sort order — proves EF Core, the scaffolded model, and the soft-delete filter plumbing all work together, not just that it compiles.

- Open decisions / notes for future sessions:
  - **No per-user global query filter yet** — only soft-delete is filtered globally right now. A `UserId == currentUserId` filter (so every query auto-scopes to the logged-in user) needs an `ICurrentUserService` reading the JWT claims, which doesn't exist until Session 4's auth is built. Add it then, not before — doing it now would have nothing real to filter against.
  - LocalDB instance was stopped at the start of this session (`sqllocaldb start MSSQLLocalDB` was needed) — if `sqlcmd` fails with a login/connection-delay error, check `sqllocaldb info MSSQLLocalDB` for `State: Stopped` first.
  - Remember to use `SET QUOTED_IDENTIFIER ON;`/`SET ANSI_NULLS ON;` and keep filtered-index creation outside table-creation guards in every future `database/schema/*.sql` file (Goals, Tasks, Calendar, Habits, Journal all need this).

## Last session: 2026-10-13 — Session 4 — Auth: registration + login
- Shipped (backend, done directly — no forking this time, see note below):
  - JWT packages: `Microsoft.AspNetCore.Authentication.JwtBearer` (Api), `Microsoft.Extensions.Identity.Core` removed in favor of a `<FrameworkReference Include="Microsoft.AspNetCore.App" />` on `LifeOS.Core` (the old standalone `Microsoft.AspNetCore.Http.Abstractions` NuGet package is obsolete on .NET 10 — ASP.NET Core types ship in the shared framework now), `System.IdentityModel.Tokens.Jwt` (Core).
  - `LifeOS.Core/Shared/{DTOs,ServiceContracts,Services}`: `RegisterRequest`/`LoginRequest` (DataAnnotations validation) / `AuthResponse` / `AuthResult`, `IAuthService`/`AuthService` (uses `PasswordHasher<User>`, checks for duplicate email, returns a result object rather than throwing for expected business failures), `IJwtTokenService`/`JwtTokenService` (signs a JWT with NameIdentifier/Email/Name claims), `ICurrentUserService`/`CurrentUserService` (reads the JWT claims via `IHttpContextAccessor`).
  - `Areas/Shared/Controllers/AuthController.cs`: `POST .../register`, `POST .../login` (both `[AllowAnonymous]`), `GET .../me` (`[Authorize]` — a genuinely useful "who am I" endpoint for the Angular app to restore session state, not a throwaway).
  - JWT bearer authentication wired in `Program.cs` (`Jwt:Key`/`Issuer`/`Audience`/`ExpiryMinutes` in `appsettings.Development.json` — a dev-only secret, fine since this is local-only; a real secret-management story is a pre-hosting concern, not a Month-1 one).
  - Dropped the Swagger "Authorize" padlock button wiring — `Swashbuckle.AspNetCore` 10.x pairs with a new major `Microsoft.OpenApi` v2 that restructured `OpenApiSecurityScheme`/`OpenApiReference` into different types; not worth fighting a breaking API change for a nice-to-have when curl/the actual Angular app already exercise the auth flow fully.

- Shipped (frontend, done directly):
  - `core/services/auth.service.ts` (Signals-based `currentUser`/`isAuthenticated`, token+user persisted to `localStorage`), `core/interceptors/auth.interceptor.ts` (attaches `Authorization: Bearer`), `core/guards/auth.guard.ts` (functional guard, redirects to `/login`).
  - `features/auth/{login,register}` — reactive forms, Bootstrap-styled (no bespoke CSS), lazy-loaded routes, `ngx-toastr` for error feedback, password-confirmation cross-field validator on register.
  - Shell now shows the logged-in user's display name + a logout button when authenticated.
  - **LifeOS logo** found at repo root (`LifeOS Connected Wellness Emblem.png`) — copied into `lifeos-web/public/logo.png`, wired as both the favicon and the navbar brand image. (Note: there's also an `okay_logo.png` inside `OkayToolsEIA4` — that's unrelated branding from the reference-only project, not LifeOS's. Worth double-checking before assuming any asset found in that folder is meant for this app.)

- Verified (real browser, not just curl):
  - Backend: curl-verified register → duplicate-email rejection → wrong-password 401 → correct login → JWT returned → `/me` rejected without a token (401) → `/me` accepted with the token (200, correct `userId`).
  - Frontend: loaded `/` unauthenticated → confirmed guard redirect to `/login` → filled and submitted the real registration form in the browser → confirmed auto-login and redirect to `/` showing "Browser Test User" + logout button → clicked logout → confirmed redirect to `/login` → logged back in with the same credentials → confirmed `/` renders authenticated again.
  - `npm run lint` and `npm run build` both clean; `dotnet build` clean.

- Open decisions / notes for future sessions:
  - **Fork reliability, round 2**: did not delegate Session 4 at all, after Session 2's frontend fork failed twice. Built everything directly instead — slower per-step than a working fork would have been, but zero wasted retries. Worth trying forks again for a future session with a cleaner backend/frontend split (e.g., once schema work is done, a module's API + its Angular screens), but verify real tool-call counts before trusting a "done" report, every time.
  - **Browser automation gotcha**: the `computer` tool's coordinate-based clicks did not reliably trigger Angular's `(click)`/form-submit handlers during this verification (synthetic clicks landed on the DOM but the framework's event binding didn't fire) — switched to `javascript_tool` calling `element.click()` directly, which worked immediately. If a future session needs to click a submit button via browser automation and nothing happens with no console error, try this instead of re-clicking coordinates.
  - **Still no per-user global query filter** — `ICurrentUserService` now exists, so this is unblocked. Add a `UserId == currentUserService.UserId` global filter (alongside the existing soft-delete one) in `AppDbContext.SoftDelete.cs` (or a sibling partial) before or during Session 5, so every future user-owned table is automatically scoped without remembering to add `.Where(x => x.UserId == ...)` everywhere by hand.
  - Minor, deferred: `logo.png` triggers an Angular dev-mode NG0913 console warning (1245×1245 source rendered at 32×32) — harmless, dev-only, worth a real resize during the Milestone 8 UX polish pass, not now.
  - Two test accounts (`test@lifeos.local`, `browsertest@lifeos.local`) now exist in `LifeOS_UAT` from verification — left in place; this is a dev/UAT database, not worth cleaning up.

## Last session: 2026-10-13 — Session 5 — Tags (Milestone 1 start)
- Shipped:
  - **Per-user global query filter** (the carried-over item from Session 4): `IUserOwned` interface, combined with `ISoftDeletable` in one reflective filter in `AppDbContext.SoftDelete.cs`. `AppDbContext` now takes `ICurrentUserService` via a second constructor (partial class). `Tag`/`EntityLink` now implement `IUserOwned`; `User`/`LifeArea` don't (correctly — owner and global taxonomy respectively).
  - Generalized `AuthResult` into `OperationResult<T>` (`Shared/DTOs/OperationResult.cs`) — Tags needed the identical shape, so this is now the one result type every module's service uses for expected business failures.
  - Tags CRUD: `TagDto`, `SharedProfile` (first real AutoMapper use — `AddAutoMapper` wired in `Program.cs`), `ITagsService`/`TagsService`, `Areas/Shared/Controllers/TagsController` (`[Authorize]` — first protected business controller). `CreateAsync`/`RenameAsync` catch `DbUpdateException` for the unique-constraint race (see below) as a safety net alongside the upfront duplicate check.
  - Frontend: `core/services/tags.service.ts`, `shared/components/tag-picker/` (first component in `shared/` — signal `input()`/`output()`, fetches its own tags, inline create-or-select, Bootstrap badges/suggestions, no bespoke CSS), wired as a demo into Home (Goals/Tasks don't exist yet to attach tags to for real — said so explicitly in the UI).
  - **New UI convention, per your request**: cards (`.card.shadow-sm`) as the one content-grouping unit everywhere — narrow centered for auth forms, stacked full-width sections for content pages. Shell's content area got a `bg-body-tertiary` background so cards read as distinct panels. Home restructured into two cards (API status, Tag picker demo) to match login/register's existing card look.

- Verified (real, both layers):
  - Backend via curl: empty list → create → duplicate rejected cleanly (not a 500) → rename → list shows renamed → delete (soft) → list empty → delete-again correctly 404s. **Per-user isolation**: registered a second user, confirmed their tag list started empty despite user 1's tags existing, and confirmed they could create a tag with the *same name* user 1 used — proves the unique constraint and the global filter are both scoped by `UserId`, not global.
  - Frontend in a real browser: selected an existing tag suggestion, created a brand-new tag inline, removed a selected tag back to suggestions — all three against the live API, zero console errors, UI updated correctly each time.
  - `npm run lint`, `npm run build`, `dotnet build` all clean.

- Open decisions / notes for future sessions:
  - **Fork reliability, round 3 — likely root cause found**: delegated the frontend tag-picker to a fork again (backend done directly by me, in parallel). It burned 25 real tool calls but delivered **zero** of its assigned frontend files — meanwhile, backend files I was concurrently editing (`ITagsService.cs`, `TagsService.cs`, `TagsController.cs`, `Program.cs`) kept showing up "externally modified" with changes that exactly completed what I was mid-way through writing myself. Best explanation: the fork ignored its "don't touch LifeOS.Core/LifeOS.Api" instruction, spent its budget helping with the backend instead (not badly — the code it left behind was correct and I built on top of it, e.g. the `TagRequest` record and the `AddAutoMapper` call), then never got back to its actual assigned task before running out of room, and its final report was a non-answer. Built the frontend half directly afterward, same as the last two failures. **Pattern across three attempts: forks for self-contained, well-specified frontend-only slices have not worked reliably in this project; backend-only delegation worked cleanly once (Session 2).** Recommend not forking the frontend half of a session again without a stronger signal it'll behave — consider giving the next attempt an isolated `worktree` so it physically can't touch backend files even if it tries.
  - Two more test accounts exist now (`verifyuser2@lifeos.local`) plus assorted test tags across all three test users in `LifeOS_UAT` — still just dev data, not worth cleaning up.
  - `OperationResult<T>.Fail` sets `Data` to `default` — fine for reference types (`null`) and the `bool` case (`false`, but that path isn't actually reached since `Success` is checked first) — worth remembering if a future value-type `T` relies on `default` not being a meaningful "valid" value.

## Interim fix (same day) — validation display, Username login, visual design pass
- Shipped:
  - Fixed real bug: form validation errors were never rendered (only `markAllAsTouched()`, no template markup) — added a `fieldError(name)` pattern + `invalid-feedback` display to login/register, now the convention for all future forms.
  - Login changed from Email to **Username** (confirmed): `shared.Users.Username` added via an idempotent migration in `01_shared.sql` that backfills existing rows from the email local-part (preserved all 4 existing accounts, including the real one — `Akash@gmail.com` → username `Akash`, exactly what was requested). `LoginRequest`/`RegisterRequest`/`AuthResponse`/JWT claims updated accordingly.
  - Full visual design pass (frontend-design skill): design tokens in `styles.scss` (ink/teal/green/canvas/border + gradient), Sora + Manrope fonts, hairline-border cards replacing the generic shadow-card look, and a distinctive split-screen `AuthLayout` for login/register (brand gradient + real headline on one side, form on the other) instead of the generic centered-card login. Routing restructured so auth screens render full-screen (no navbar) while the authenticated app keeps the `Shell` layout — `Shell` moved to be a routed layout component with its own `<router-outlet>` for children, rather than always wrapping everything.
  - Found and fixed a CoreUI theming gotcha along the way: `.btn-primary` hardcodes its own `--cui-btn-bg` rather than referencing `--cui-primary`, so the button stayed indigo until overridden directly.

- Verified: lint/build clean both layers; full browser run of the exact reported bug (bad email + bad username + short password on register → all four errors now display correctly, confirmed via screenshot); registered a new user, logged out, logged back in via Username; confirmed via curl that pre-existing accounts (including the real one) still log in correctly with their backfilled username.

- Next up: **Session 6 — EntityLinks**: generic link-between-any-two-entities API + reusable "linked items" widget. `EntityLink` already implements `IUserOwned`/`ISoftDeletable`, so the per-user scoping is already in place — this session is pure CRUD + UI on top of the existing schema, same shape as Tags.
