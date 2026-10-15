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

## Last session: 2026-10-14 — Sessions 6 + 7 — EntityLinks & Quick Add
- Shipped (backend):
  - **EntityLinks** (`IEntityLinksService`/`EntityLinksService`, `EntityLinksController`): list links for an entity (both directions, shown as "the other end" with resolved titles), search link candidates, create, unlink (soft), plus `RemoveAllForEntityAsync` for modules to call from their own deletes. Links are **undirected and stored canonically** (ordinally smaller Type/Id = Source), so the new `UX_EntityLinks_Pair` unique index rejects duplicates in either direction. Race safety via `DbUpdateException` catch, as per convention.
  - **Pluggable linkable types**: `ILinkableEntityProvider` (EntityType, DisplayName, `GetTitlesAsync`, `SearchAsync`), discovered via `IEnumerable<>` DI. Providers query through `AppDbContext`, so existence + ownership checks come free from the global filters (verified: user 2 can't link to user 1's item, gets "Linked item not found.").
  - **Quick Add capture inbox**: `shared.InboxItems` (Kind CHECK constraint: Task/Note/Journal/Idea, Title, Notes, ProcessedAt), `IInboxService`/`InboxService`, `InboxController` (list with kind/includeProcessed filters, create, mark processed/reopen, delete, which also removes the item's links). `InboxLinkableProvider` is the first linkable type.
  - `DbUpdateExceptionExtensions.IsUniqueConstraintViolation()` extracted from `TagsService` (now shared by Tags + EntityLinks).
- Shipped (frontend):
  - `shared/components/linked-items/`: reusable widget (signal inputs `entityType`/`entityId`, fetches its own data, debounced candidate search, hides already-linked items, unlink).
  - `shared/components/quick-add/`: FAB + `q` keyboard shortcut (ignored while typing in a field), mounted once in the shell; ng-bootstrap modal with Kind segmented control, per-kind example placeholder, inline validation per the `fieldError` convention, success toast.
  - `features/inbox/`: Inbox screen — kind filter pills with open counts, show-processed switch, mark processed/reopen, delete with SweetAlert2 confirm, linked-items panel per item, empty state. Refreshes itself after any Quick Add (via `InboxService.capturedVersion` signal).
  - Shared `core/services/api-response.ts` (was copy-pasted in each service). Shell got minimal Home/Inbox links (full nav is still Session 8). `sweetalert2` added to `allowedCommonJsDependencies` (first real use; its CommonJS build warning would otherwise break "no new warnings").
- Fixed along the way (both found during this session, both cross-cutting):
  - **UTC dates came back without `Z`** when read from the DB (EF materializes `datetime2` as `DateTimeKind.Unspecified`), so the browser would have shown UTC times as local time. One value converter in `AppDbContext.SoftDelete.cs` now marks every `DateTime`/`DateTime?` as UTC on read — matters a lot for Calendar/streaks later.
  - **Scaffold determinism** (per your request that re-scaffolding mustn't introduce issues): every PK had a random SQL-generated name (`PK__Users__3214EC07...`) baked into `AppDbContext.cs`, so recreating the DB anywhere (e.g. `LifeOS_Live`) would have churned the scaffold. PKs are now named `PK_<Table>` in `01_shared.sql`, with an idempotent `sp_rename` upgrade block for existing databases (applied to UAT). Convention added to `CLAUDE.md`.
- Verified:
  - Schema script applied twice in a row (idempotent). Re-scaffold diff was purely additive (new `DbSet`, `InboxItem` mapping, pair index, `User.InboxItems`); `HasName("PK__...")` lines gone. **Built a throwaway DB from the scripts alone, scaffolded it, and diffed against `Models/`: identical**, except that `User.Username`'s property position differs (UAT got the column via Session 5's `ALTER TABLE ADD`, so it's last there). Cosmetic and harmless; a fresh `LifeOS_Live` would just reorder those two lines once. Not worth rebuilding `shared.Users` in UAT over. Scratch DB dropped.
  - curl, full API matrix: link → reverse-direction duplicate rejected → self-link rejected → unknown type rejected → visible from both ends → candidates exclude self → cross-user isolation → deleting an item cascades its links → processed toggle + filters → unlink → second unlink 404. Same flow repeated through the Angular dev proxy (`:4200/api/...`).
  - `dotnet build` 0 warnings; `npm run lint` clean; `npm run build` clean with no warnings; Prettier clean on all changed files.
  - **Not yet verified in a real browser** — the Claude in Chrome extension wasn't connected this session. The UI compiles, lints and is served (inbox lazy chunk built), but nobody has clicked through the Quick Add modal, the `q` shortcut, the Inbox screen or the linked-items widget yet. **Do this first next session** (or you can: press `q` on any page, capture items of a couple of kinds, open Inbox, link two items via the 🔗 button, check the link from both sides, mark processed, delete).
- Open decisions / notes for future sessions:
  - Sessions 6 and 7 went into **one commit**: EntityLinks needed a real linkable type to verify against, and InboxItems was the first one. The schema file and scaffold output mix both, so a split wasn't clean.
  - Repo-wide Prettier hasn't been applied to files from earlier sessions (running `prettier --write` reformatted 10 untouched files; reverted to keep this diff focused). Worth one standalone `npm run format` commit.
  - Test users `linkuser1`/`linkuser2` plus inbox items/links from verification now exist in `LifeOS_UAT` (dev data).
  - Python isn't installed on this machine — don't plan on Python scripts for file edits/verification.

## Last session: 2026-10-14 — Session 8 — Nav shell (+ Session 7's outstanding browser check)
- Shipped:
  - **Sidebar shell** (`core/layout/shell.{html,ts,scss}`): fixed ink sidebar on desktop, off-canvas drawer (NgbOffcanvas) behind a slim top bar below `lg`, one `ng-template` rendered in both so they can't drift. Blueprint nav groups trimmed to Month 1, defined once in `core/layout/nav-items.ts`. Sidebar has a Quick add button (with the `Q` hint), an Inbox open-count badge, and a user block (initials avatar, username, log out). Active link = brand gradient spine.
  - **My Day** (`features/dashboard/my-day`) replaces Home as the landing route: large Sora date heading (the one display-type moment, per the design pass), time-of-day greeting, live "Waiting in your Inbox" counts per kind, and a "Today" card stating what will gather there. Home and the now-unused `PingService` deleted (`PingController` stays as an API health endpoint).
  - **Placeholders, no dead links**: one `ModulePlaceholder` component, driven by route data, for Calendar/Goals/Tasks/Habits/Journal. Each says what the module will let you do; Tasks/Journal offer "capture now" buttons that open Quick Add with that kind preselected.
  - **Tags page** (System → Tags): create, inline rename (autofocused, Esc cancels), delete with confirm, inline validation per convention. Replaces the Home tag-picker demo. API side: `TagRequest` now `[Required, StringLength(100)]` and names are trimmed (blank / whitespace / >100 chars → 400; `"  Padded  "` no longer creates a near-duplicate of `"Padded"`).
  - `QuickAddService` (open from anywhere, optional kind preset), `InboxService.openCounts`/`openTotal`/`openCountsLoaded` (refreshed after every inbox change, reset on logout so the next user never sees the previous user's counts). Route titles on every page; `**` → My Day.
- Fixed via the browser pass (all found by actually looking at it):
  - Active-link gradient spine was clipped by the nav's `overflow-y: auto` → scroll container now extends to the sidebar edge.
  - Nav overflowed on a ~670px-tall viewport (Tags cut off, bright default scrollbar) → tighter spacing, thin dark scrollbar.
  - `.btn-outline-primary` was CoreUI indigo (same hardcoded-variable gotcha as `.btn-primary`) → overridden in `styles.scss`.
  - My Day flashed "Nothing waiting" before counts loaded → "Checking your Inbox..." until the first count arrives.
  - Quick Add dialog's `aria-labelledby` pointed at the title *input*, not the heading → fixed.
  - Placeholder/Tags pages were centred while Inbox was left-aligned → all left-aligned in the same container.
- Verified **in a real browser** (Chrome connected this time):
  - Session 7 click-through, finally: `q` opens Quick Add with the title focused → empty submit shows the inline error → capture shows toast, sidebar badge 2→3 and My Day updates live → Inbox → link widget search ("health") → link created, already-linked item drops out of candidates → the link shows from the other item too → mark processed: badge 3→2. Capture times display in local time (UTC fix confirmed end-to-end).
  - Session 8: every nav entry renders with the right page title; unknown URL redirects to My Day; Tasks/Journal capture buttons preset the kind; Tags create / empty-name error / duplicate rename rejected (toast, field stays open) / valid rename; drawer contains all 8 links + badge and closes on navigation; zero console errors.
  - Lint, both builds (0 warnings), Prettier on all changed files clean; curl checks for the Tags validation.
  - **Not visually verified at phone width**: `resize_window` didn't change the (probably maximised) Chrome window (`innerWidth` stayed 1536), and screenshots repeatedly timed out after window-level actions. The drawer was checked *functionally* via DOM (opens, lists links, closes on nav). Worth a 10-second look in DevTools' device mode next session.
- Notes:
  - Browser-automation gotchas, round 2: `computer` clicks occasionally don't land/register (same as Session 4's note) — `element.click()` via `javascript_tool` is reliable. `javascript_tool` output containing `localStorage` tokens or CSS `url(...?...)` text gets blocked by the extension ("Cookie/query string data") — keep JS probes free of credentials/URLs. Screenshot capture can time out for 30s after window changes; one retry usually works, more than that doesn't.
  - Test tags `Side project`, `Health & fitness` (linkuser1) and `Padded` (linkuser2) exist in UAT from verification.

## Last session: 2026-10-14 — Session 9 — Goals schema + scaffold
- Shipped:
  - `database/schema/02_goals.sql` → schema `goals`:
    - `goals.Goals`: `LifeAreaId` (required — "Personal / Fun" covers recreational goals, and the Life Balance Wheel needs every goal in an area), `Title`, `Description`, `GoalType` (`ShortTerm`/`LongTerm`/`BucketList`), `Status` (`Active` default/`Completed`/`Postponed`/`Abandoned`), `TargetDate` (**`DATE`** — a calendar date with no timezone to shift), `CompletedAt`. CHECK constraints on type/status, plus `CK_Goals_CompletedAt` (only a Completed goal may have `CompletedAt`).
    - `goals.GoalMilestones`: `GoalId`, `Title`, `TargetDate` (`DATE`), `CompletedAt` (non-null = done), `SortOrder`. Progress % is computed from these (Session 10), never stored.
    - `goals.GoalTags`: real FK join to `shared.Tags` (surrogate Id + filtered unique pair index, so untag-then-retag works under soft delete).
    - All PKs/constraints explicitly named; indexes outside the create-table guards; re-runnable.
  - Re-scaffolded: `Goal`, `GoalMilestone`, `GoalTag` + navigations on `User`/`LifeArea`/`Tag`. Partials added (`ISoftDeletable, IUserOwned` on all three), so per-user + soft-delete filtering applies automatically.
  - New conventions in `CLAUDE.md`: DATE vs DATETIME2, per-module tag join tables, NVARCHAR+CHECK for status/type, join fan-out.
- Verified:
  - Script applied twice (idempotent). Scaffold diff purely additive, no `HasName("PK__…")`. **Fresh DB from `01`+`02` scripts scaffolds identically to `Models/`** (only the known, documented `User.Username` position difference).
  - The "done when": inserted "Become a Technical Lead" (Career, LongTerm, 3 milestones/1 done, tag *Side project*) and "Finish GTA V" (Personal / Fun, ShortTerm, tag *Gaming*) for linkuser1 — read back side by side via SQL (33.3% / 0% progress computed from milestones).
  - Constraints reject: bad GoalType, bad Status (`'Revised'`), CompletedAt on an Active goal, duplicate goal-tag; untag-then-retag allowed.
  - EF level via a temporary endpoint (removed before commit, `PingController` restored byte-identical): linkuser1 gets both goals with life area, milestones and tags; linkuser2 gets `[]`; anonymous 401. `targetDate` serializes as `"2027-12-31"`, `createdAt` with `Z`. `dotnet build` 0 warnings.
- Notes for Session 10 (Goals API + UI):
  - My first verification query had a real **join fan-out bug** (tags repeated ×3 because milestones were joined in the same GROUP BY) — fixed with `OUTER APPLY`. EF flagged the same shape: `MultipleCollectionIncludeWarning` when projecting milestones + tags together. In `GoalsService`, use `.AsSplitQuery()` for detail loads and project counts (not collections) for list views.
  - EF doesn't scaffold CHECK constraints — validate GoalType/Status values in the service/DTO (`[AllowedValues]`) so bad input returns a clean 400, not a SQL exception → 500.
  - The two seeded goals (+ tag `Gaming`) remain in UAT for linkuser1 — handy real data for building the Goals list/detail screens.
  - Multi-agents: offered, not used this session — Sessions 8 and 9 were sequential and both touched the shared shell/`AppDbContext`, so a fork would have cost more coordination than it saved (see the fork history above).

## Last session: 2026-10-14 — Session 10 — Goals API + UI
- Shipped (backend):
  - `LifeOS.Core/Goals/{DTOs,ServiceContracts,Services,AutoMapper}` + `Areas/Goals/Controllers`: `GoalsController` (`api/Goals/Goals`: list with optional `status`, get, create, update, delete) and `GoalMilestonesController` (nested `api/Goals/Goals/{goalId}/Milestones`: add, edit, `PUT {id}/completed`, `PUT order`, delete).
  - **Progress is computed, never stored**: `GoalProgress.Percent` = floor(done / total × 100), a Completed goal is always 100 %, no milestones = 0. List projects milestone *counts* + next open milestone (no collection fan-out); detail uses `.AsSplitQuery()` for milestones + tags. No `MultipleCollectionIncludeWarning` in the log.
  - Validation: `[AllowedValues]` on GoalType, `[Range]` on LifeAreaId, life area must exist, every tag id must be the caller's (per-user filter makes another user's tag "Tag not found."). Tags synced on update (soft-delete removed, new row for re-added).
  - Goal delete soft-deletes its milestones + goal tags (`ExecuteUpdate`) and its EntityLinks, in one transaction. Milestone changes touch `Goal.UpdatedAt` (keeps Session 24's "goal untouched 14+ days" rule honest).
  - **Fixed a gap from Session 9**: deleting a Tag left its `goals.GoalTags` rows alive → `TagsService.DeleteAsync` now detaches the tag (each future module tag-join table gets a line there).
  - `LifeAreasController` (`GET api/Shared/LifeAreas`, read-only) + `ILifeAreasService`.
  - `GoalLinkableProvider` ("Goal") registered — pulled forward from Session 11 since delete needed the type constant anyway; goal detail already shows the linked-items widget.
- Shipped (frontend):
  - `features/goals/`: list (status pills with counts + life-area filter, cards with progress bar, "x of y milestones", next milestone, overdue target date in red, tags), detail (progress, milestones: tick / inline edit / move up-down / delete with confirm / add with optional date; details card; linked items), shared create/edit form (title, life area, goal-type segmented control with hint, target date, description, tag picker). Placeholder route replaced by 4 real routes.
  - `core/services/goals.service.ts`, `life-areas.service.ts` (cached with `shareReplay`).
  - **App-wide date format `14/Oct/2026`** (your mid-session request): `core/dates/date-format.ts` — `DATE_PIPE_DEFAULT_OPTIONS`, `AppDateParserFormatter`, `IsoDateAdapter`, `dateFieldError`; My Day heading ("Wednesday, 14/Oct/2026"), Inbox capture time, all goal dates. Native `type="date"` inputs replaced by ng-bootstrap datepickers (typed `14/Oct/2026`, `14 october 2026`, `14/10/2026` all parse; junk shows an inline error).
- Fixed via the browser pass:
  - Enter in the tag picker submitted the surrounding goal form → `keydown.enter` + `preventDefault()`.
  - Datepicker popup had no month/year navigation: `$localize is not defined` — ng-bootstrap needs `@angular/localize`, never installed (modals/toasts didn't need it). Added via `ng add`.
  - After adding a milestone, blurring the (refocused, empty) add box showed "Enter a milestone." → add-form title error only after a submit attempt.
  - Truncated "Target date (optional)" placeholder shortened.
- Tooling:
  - `ng test` had never actually run: vitest couldn't resolve `vite` (nested under `@angular/build`) → `vite@8.3.0` added as a direct devDependency. Stale Session 1 `app.spec.ts` assertion (`.navbar-brand`, gone since the Session 8 shell) removed. First real spec: `date-format.spec.ts` (formatter/parser + ISO adapter). 6/6 green.
  - npm installs need `--legacy-peer-deps` (ngx-toastr peer range) — noted in CLAUDE.md.
- Verified:
  - curl matrix (scratch script, two fresh users): every validation path (blank/whitespace title, bad type, life area 0 / 999, foreign or unknown tag) → 400 with a clean message; cross-user get/update/add-milestone → not found, list `[]`; milestone add → tick (33 %) → tick (66 %, next milestone advances) → untick → edit → reorder (incomplete / duplicate id lists rejected) → delete → second delete 404; untag → retag; tag delete detaches it from the goal; goal searchable as a link candidate; goal delete → 404 for goal and its milestones; anonymous 401.
  - Browser (goaluser1): empty state → empty submit shows both inline errors → create → detail → 3 milestones (typed date, picked date, invalid text error) → tick → 33 % on detail and list card → edit (type + tag via Enter) → reorder up/down → all dates in `dd/MMM/yyyy`. No console errors (the existing `NG0913` logo-size warning is pre-existing).
  - `dotnet build` 0 warnings; lint clean; `ng build` 0 warnings; tests green.
- Notes:
  - Sandbox gotcha: sandboxed `curl` can't reach localhost and a sandboxed `Stop-Process` silently fails — run local API/dev-server commands unsandboxed. `TaskStop` on a background `ng serve` leaves the node child running (kill the port owner).
  - Test users `goaluser1`/`goaluser2` (password in the scratch script, not committed) + goal "Run a half marathon" exist in UAT. The Session 9 seed goals still belong to `linkuser1`.

- Next up: Session 11 (done the same day, below).

## Last session: 2026-10-14 — Session 11 — Goal review flow + linking
- Shipped (database): `goals.GoalHistory` appended to `02_goals.sql` (named PK/FKs, `CK_GoalHistory_EventType` StatusChanged/Revised, `CK_GoalHistory_StatusChange` requires from+to for status rows, filtered `IX_GoalHistory_Goal`). Applied twice (idempotent); re-scaffold diff purely additive (entity + `DbSet` + two navigations). Partial `GoalHistory : ISoftDeletable, IUserOwned`.
- Shipped (backend):
  - `PUT api/Goals/Goals/{id}/status` (`SetGoalStatusRequest`: `[AllowedValues]` status + optional note ≤1000): same-status → clean 400, logs `StatusChanged` (from → to, trimmed note), sets `CompletedAt` only for Completed and clears it otherwise (matches `CK_Goals_CompletedAt`).
  - Update = revision: compares title/description/life area/type/target date/tag set *before* applying; if anything changed, logs `Revised` with the changed field names, the old → new target date (when moved) and the optional `RevisionNote`. A no-op save logs nothing.
  - Detail DTO carries `History` (newest first; 3 collections now, still `.AsSplitQuery()`). Goal delete also soft-deletes its history.
- Shipped (frontend):
  - Goal detail: **Status card** (current status + "since", actions by state: Active → Mark completed / Postpone / Abandon; Postponed/Abandoned → Reactivate / Mark completed; Completed → Reactivate), each a SweetAlert2 dialog with an optional note. **History card** timeline (status icons, "Reactivated" wording, revision summary like "Changed title · target date 30/Jun/2027 → 31/Dec/2027", notes in quotes, "Goal set" at the bottom). "Edit" became **Revise**; the form in edit mode asks "Why are you revising this?" (logged with the revision).
  - Logic in `features/goals/goal-status.ts` (actions per status, history titles, revision summary) with `goal-status.spec.ts` — 12/12 tests green.
- Linking: tasks don't exist until Session 13, so "linked tasks visible on goal detail" was verified with a Task captured via Quick Add (`q`) and linked from the goal's Linked items panel — visible from both sides. When Tasks land, `TaskLinkableProvider` makes real tasks appear in the same picker with no goal-side change.
- Verified:
  - curl (scratch script): invalid status 400, same status 400, other user → not found; postpone (note trimmed) → reactivate → complete (`CompletedAt` set) → reopen (cleared) all logged; no-op edit logs nothing; edit logs `["Title","TargetDate"]` with 30/Jun → 31/Dec + note; description-only edit logs `["Description"]`; `?status=Abandoned` filter; delete → all 7 history rows soft-deleted (checked in SQL).
  - Browser: postpone with note → badge + History entry; revise target date 30/Sep/2026 → 15/Mar/2027 with reason → logged and displayed; reactivate; Quick Add task → linked to goal → visible from the Inbox side; mark completed → 100 % + Completed date, reactivate → back to 33 % and Completed date gone. No console errors.
  - `dotnet build` 0 warnings; lint clean; `ng build` 0 warnings; tests 12/12.
- Notes:
  - The Session 10 test revision (type → Long-term + Fitness tag) predates the history table, so goal 7's history starts at today's postponement.
  - Didn't redo the "fresh DB from scripts scaffolds identically" check this time — the diff was purely additive and every constraint is explicitly named, same as Session 9's verified pattern. Worth repeating before `LifeOS_Live` is created.

- Next up: Session 12 (done the same day, below).

## Interim (same day) — ngx-toastr replaced with ng-bootstrap's NgbToast
- Your question: ngx-toastr's latest (20.0.5, Feb 2026) only declares Angular 21 as a peer — the reason every install needed `--legacy-peer-deps`. Replaced with `core/services/toast.service.ts` (signal queue, same `success()`/`error()` shape, max 4 stacked) + `shared/components/toasts/` (`NgbToast`, mounted in `App` so auth screens get toasts too; errors stay 6 s, successes 4 s). Considered ngx-sonner (supports ≥19) but it would add a dependency; ng-bootstrap is already in the stack.
- Removed `provideAnimations()` (only ngx-toastr used it) and `toastr.css`. Plain `npm install` works again. Verified in the browser: wrong-password error toast on Login, success toast on Tags, auto-hide, no console errors. Commit `5294b2c`.

## Last session: 2026-10-14 — Session 12 — Tasks schema + scaffold
- Shipped: `database/schema/03_tasks.sql` → schema `tasks`:
  - `tasks.Projects` (Name, Description, Status Active/Completed/Archived, `UX_Projects_User_Name` filtered unique — same rule as Tags).
  - `tasks.TaskItems`: ProjectId (nullable FK), Title, Notes, **DueDate `DATE` (NULL = Someday)**, Priority None/Low/Medium/High (default None), Status Open/Done + CompletedAt (`CK_TaskItems_CompletedAt`), **recurrence as structured columns** — `RecurrenceFrequency` Daily/Weekly/Monthly/Yearly + `RecurrenceInterval` 1–999 + `RecurrenceAnchorDate` (series' first due date; occurrences are computed from the anchor so monthly can't drift 31→28→28) — `CK_TaskItems_Recurrence` requires all three or none, plus a due date. `NextOccurrenceTaskId` (self-FK) records the spawned next instance so complete → reopen → complete can't spawn twice.
  - `tasks.TaskTags` (same shape as GoalTags). `TagsService.DeleteAsync` now detaches task tags too.
  - Partials `Project`/`TaskItem`/`TaskTag : ISoftDeletable, IUserOwned`.
- **Deviation from the plan**: the table is `TaskItems`, not `Tasks`. First scaffold produced entity `Task` → `CS0104 'Task' is an ambiguous reference` across every async signature in Core. Dropped the two (empty) tables, renamed, re-applied. Rule added to CLAUDE.md.
- Verified:
  - Script applied twice (idempotent). Scaffold diff purely additive; no `PK__` names.
  - **Fresh DB from `00`–`03` scripts scaffolds identically to `Models/`** (only the known `User.Username` position difference) — the check skipped in Session 11 is now done; scratch DB dropped.
  - Constraints, in a rolled-back transaction: recurrence without due date, partial recurrence, interval 0, bad priority, CompletedAt on an open task, duplicate project name — all rejected; a valid weekly task accepted.
  - `dotnet build` 0 warnings.

- Next up: Session 13 (done the same day, below).

## Last session: 2026-10-14 — Session 13 — Tasks API + UI
- Shipped (backend):
  - `LifeOS.Core/Tasks/{DTOs,ServiceContracts,Services,AutoMapper}` + `Areas/Tasks/Controllers/TasksController` (`api/Tasks/Tasks`): list `?status=Open|Done` (Done = latest 100), get, create, update, `PUT {id}/completed` (body `{ completed, today }`), delete, `POST from-inbox/{inboxItemId}`.
  - **`TaskRecurrence`** (pure): occurrence k computed from the anchor (no month-end drift; 29 Feb clamps); next due = first occurrence after the completed due date that isn't before the client's `today` (early completion moves past the due date; late completion skips missed ones; a daily task done a day late still gets today's instance). Completing a recurring task spawns the next instance (copies title/notes/priority/project/tags/rule) in a transaction and records `NextOccurrenceTaskId`, so reopen + complete never spawns twice. Editing the rule or moving the due date re-anchors the series.
  - Validation: `[AllowedValues]` priority/frequency, interval 1–999, "A repeating task needs a due date", project/tag ownership. Delete soft-deletes task tags + links.
  - **Inbox → task**: creates the task, **moves** the item's links to it, marks the item processed (one transaction); already-processed / other user's item → 400. `IEntityLinksService.CopyLinksAsync` added.
  - `TaskLinkableProvider` ("Task") — goals can now link real tasks (and the goal detail widget lists them).
  - **New `LifeOS.Core.Tests`** (xUnit): 14 recurrence cases + 8 goal-progress cases, 22/22.
  - **Security fix found on the way**: the first unsandboxed build surfaced NuGet audit warnings — `System.Security.Cryptography.Pkcs` 9.0.11 (high + moderate advisories) via EF Core SqlServer → SqlClient 6.1.6. Pinned 10.0.13 in `LifeOS.Core`; `dotnet list package --vulnerable` now clean. Pre-existing, not caused by this session — sandboxed builds just never ran the audit.
- Shipped (frontend):
  - `features/tasks/`: Tasks page (Today with an Overdue section + red count badge, Upcoming grouped by day — "Tomorrow" / weekday + date, Someday, Done with completion time), quick-add row that adds *to the current view* (Today → today, Upcoming → tomorrow, Someday → no date), rows with tick box, repeat label ("Every 3 days"), priority flag, notes marker, tags; click a row to edit. `task-editor` dialog (title, due date picker, priority segmented control, repeat + "every N unit", notes, tags, delete) — also used by Inbox's new **Make it a task** button on open Task items. Bucketing/sorting/labels in `task-views.ts` + spec. `core/dates/today.ts` (moved from Goals, + `addDaysIso`). Tasks placeholder route replaced.
  - **Toasts restyled per your feedback**: light green / light red tint, dark ink text, colored left edge, solid background (Bootstrap's toast was also translucent).
- Fixed via the browser pass:
  - Inbox conversion first *copied* links, so the goal listed "Inbox item: Book a physio appointment" *and* "Task: Book a physio appointment" → now moves them; the two duplicate test links were soft-deleted in UAT.
- Verified:
  - curl matrix: all validation paths; cross-user get/complete/convert → not found; weekly spawn on 21/Oct with tag + priority; reopen + complete → no second spawn; monthly re-anchored to 31/Oct → next 30/Nov; Open/Done lists; Task link candidates; inbox convert → task carries the goal link, inbox item has none, second convert rejected; delete → 404; anonymous 401.
  - Browser: quick add to Today; New task (daily, High, Fitness tag) sorts first; **tick → "Done. Next one is due 15/Oct/2026."**, Upcoming 3→4 under "Tomorrow 15/Oct/2026"; Done view; Inbox "Make it a task" (prefilled, typed due date) → inbox empty, badge cleared; goal detail lists the real tasks; new toasts. No console errors.
  - `dotnet build` 0 warnings (unsandboxed, with NuGet audit); lint clean; `ng build` 0 warnings; tests 22 backend + 19 frontend.
- Notes:
  - Linked items aren't shown inside the task editor yet, and there's no Projects UI — both are Session 14 (projects + task↔goal linking from the task side + sort options).
  - The Tasks page fixes "today" when it loads; a page left open past midnight needs a reload to re-bucket.
  - UAT test data for goaluser1: tasks Water the plants (weekly), Pay rent (monthly), Take vitamins (daily), Call mum, Buy running shoes, Book a physio appointment, Stretch after runs; tags Errands, Home.

- Next up: **Session 14 — Projects + linking**: Projects CRUD + grouping UI, project picker in the task editor, linked-items in the task editor (task → goal from the task side), sort options (priority / due date).

## Last session: 2026-10-14 — Session 14 — Projects + linking
- Shipped (backend):
  - `ProjectsService`/`IProjectsService` + `Areas/Tasks/Controllers/ProjectsController` (`api/Tasks/Projects`): list (all statuses, with `OpenTaskCount`/`DoneTaskCount`/`NextDueDate` as scalar subqueries — no fan-out), get, create, update (name/description), `PUT {id}/status` (Active/Completed/Archived), delete. Duplicate-name pre-check + `DbUpdateException` safety net (same as Tags). **Delete keeps the tasks** (ProjectId → null) and removes the project's links.
  - `ProjectLinkableProvider` ("Project") — projects link to the goal they serve.
  - `GET api/Tasks/Tasks?projectId=` filter. Task validation: only an **Active** project accepts a newly assigned task ("That project is archived. Reopen it to add tasks."); a task already in a completed/archived project can still be edited and keep it.
- Shipped (frontend):
  - `features/projects/`: Projects page (Active/Completed/Archived pills with counts, cards with open/done counts + next due date), project detail (description, quick-add into the project, "Task with details", open tasks soonest-first, collapsible Done, status card with Mark completed/Archive/Reopen — confirms when completing with open tasks, linked items defaulting to Goal, edit/delete dialogs). Nav entry + routes; "Projects" button on the Tasks page.
  - `features/tasks/task-row` — extracted shared row component (Tasks page + project detail), now also shows the project name.
  - Task editor: **project picker** (active projects + the task's current one) and **linked items** when editing (picker starts on Goal) — task → goal linking from the task side.
  - **Sort options** on the Tasks page: Due date (default, = previous behaviour) / Priority / Recently added, remembered per browser in localStorage (try/catch). `sortTasks` + `groupByDueDate` no longer assumes date-sorted input; 6 new specs.
  - `LinkedItems`: optional `preferredLinkType` input; Enter in its search box no longer submits a surrounding form (it now lives inside the task editor form).
- Fixed via the browser pass: the sort `<select>` showed "Due date" after reload while the list was sorted by the remembered option (`[value]` on the select runs before the `@for` options exist) → `[selected]` per option.
- Verified:
  - curl matrix (new users `projuser1`/`projuser2`, password in the scratch script, not committed): create/trim, duplicate + empty name, counts + next due, project filter, cross-user get/assign/filter → not found/empty, rename duplicate, bad status, archive → new task rejected but existing task editable, link candidates, delete → tasks survive with no project, name reusable, anonymous 401.
  - Browser (projuser1): empty-name inline error → created "Plan the Japan trip" → quick-added 2 tasks → editor shows the project preselected, set date + High, linked goal "Visit Japan" from the task (Enter in search didn't submit) → linked the project to the goal → ticked a task (1 open · 1 done) → goal detail lists both Project and Task → Upcoming with Priority/Recently added sorts + project chip → archive (quick add hidden, Reopen offered). No console errors.
  - `dotnet build` 0 warnings (unsandboxed, NuGet audit clean); lint clean; `ng build` clean; tests 22 backend + 25 frontend.
- Notes:
  - Project "progress" is deliberately just counts, not a %: recurring tasks keep adding done instances, so done/total would mislead.
  - Links made in the task editor apply immediately (like everywhere else) — Cancel doesn't undo them.

- Next up: **Session 15 — Calendar schema + scaffold** (`04_calendar.sql`, Events/Reminders, first stored procedure + Dapper for the unified feed).

## Last session: 2026-10-14 — Session 15 — Calendar schema + scaffold + first stored procedure
- Shipped:
  - `database/schema/04_calendar.sql` → schema `calendar`:
    - `calendar.Events`: Title, Notes, Location, **`IsAllDay` + either `StartDate`/`EndDate` (DATE, inclusive) or `StartsAt`/`EndsAt` (DATETIME2 UTC)** — `CK_Events_Shape` allows exactly one shape, end ≥ start. Filtered indexes per shape for range overlap.
    - `calendar.Reminders`: Title, Notes, `RemindAt` (UTC), `DismissedAt`, optional `EntityType`/`EntityId` target (`CK_Reminders_Target`: both or neither), indexes for "due and not dismissed" and by target. CRUD/surfacing is Session 17.
  - Partials `Event`/`Reminder : ISoftDeletable, IUserOwned`. Scaffold diff purely additive.
  - **First stored procedure** `database/procedures/calendar.GetCalendarFeed.sql`: one row shape across five UNION ALL branches — all-day events (date overlap), timed events (UTC overlap, half-open), task due dates (open + done, LEFT JOIN project name), milestone targets (with goal title) and goal targets; abandoned goals and their milestones excluded; explicit `UserId`/`IsDeleted` filters on every branch and joined parent; `THROW` on a reversed range. Takes local `@FromDate/@ToDate` **and** `@FromUtc/@ToUtc` (client-computed) so timed events land on the user's local day.
  - **Dapper 2.1.89** added to `LifeOS.Core`. `Calendar/{DTOs,ServiceContracts,Services}` — `CalendarFeedService` calls the proc on the context's own connection with explicit `DbType`s, reads into a private row class, converts DATE → `DateOnly` and DATETIME2 → UTC kind. `GET api/Calendar/Feed?from&to[&fromUtc&toUtc]` (`Areas/Calendar/Controllers/FeedController`): from/to required (`[BindRequired]`), max 92 days, UTC bounds default to UTC midnights.
- Decisions (mine — say if you want them changed): goal target dates are on the calendar too (plan said milestones only); abandoned goals are not; done tasks/milestones are included with `isDone` so the UI can show them struck through; no event recurrence yet.
- Fixed along the way: a missing `from` bound to 0001-01-01 and got a misleading "at most 92 days" error → now a 400 "A value for the 'from' parameter … was not provided."
- Verified:
  - UAT backed up first; script applied twice (idempotent); proc applied.
  - **Fresh DB from `00`–`04` + the proc scaffolds identically to `Models/`** (only the known `User.Username` position). Scratch DB dropped.
  - Constraints in a rolled-back transaction: valid all-day/timed event and free reminder accepted; end-before-start (both shapes), all-day with times, timed without end, half a reminder target, reversed proc range — all rejected.
  - Seeded projuser1 (kept in UAT for Session 16): Mum's birthday (18/Oct), Diwali break (30/Oct–2/Nov), Dentist (21/Oct 10:00Z), Late call with Tokyo (31/Oct 20:00Z = 1/Nov 01:30 IST), a deleted event, milestones "Shortlist cities" (25/Oct) + "Check passport validity" (10/Oct, done) on Visit Japan, goal "Finish the Kanji N5 deck" (28/Oct), abandoned goal "Learn to unicycle" + milestone; projuser2: one event on 18/Oct.
  - Proc direct + via API for an IST October: 9 items from all 4 sources in order, month-crossing holiday included; deleted / other user's / abandoned excluded; the late call is in **November** with IST bounds and in October with default UTC bounds — the reason the UTC bounds exist. Dates serialize as `"2026-10-10"`, instants with `Z`. projuser2 sees only their own event; validation 400s; anonymous 401.
  - `dotnet build` 0 warnings (unsandboxed, NuGet audit; `--vulnerable` clean); 22 backend tests. No frontend changes this session.

- Next up: **Session 16 — Calendar UI**: month/week view on the feed, Events CRUD (`api/Calendar/Events`) + `EventLinkableProvider`, client computes `fromUtc`/`toUtc` from local midnights.

## Last session: 2026-10-14 — Session 16 — Calendar UI + Events CRUD (browser pass partly done — finish it first next session)
- Shipped (backend):
  - `EventsService`/`IEventsService` + `Areas/Calendar/Controllers/EventsController` (`api/Calendar/Events`): get, create, update, delete. Validation mirrors `CK_Events_Shape`: all-day needs a start date (end defaults to it, end ≥ start); timed needs both times **with a timezone** (no `Z`/offset → 400), stored as UTC; switching shape clears the other pair. Delete soft-deletes the event, its links and any reminders targeting it.
  - `EventLinkableProvider` ("Event"); `CalendarProfile` (AutoMapper).
- Shipped (frontend):
  - **New library: FullCalendar 7.1.2** (`@fullcalendar/angular`, `fullcalendar`, `temporal-polyfill`; MIT, supports Angular 16–22) — the plan's "free Angular calendar component". Chosen over angular-calendar (needs two drag libs + date-fns). Plan doc library list updated. `angular.json` loads `skeleton.css` + the `forma` theme CSS; **no palette file** — `features/calendar/calendar.scss` maps `--fc-forma-*` onto the LifeOS tokens on `:host`.
  - New accent tokens in `styles.scss`: `--lifeos-blue`, `--lifeos-amber`, `--lifeos-violet` (calendar source colours: Event teal, Task blue, Milestone amber, Goal violet).
  - `features/calendar/`: Calendar page (month + week, `en-gb` locale → Monday-first, "October 2026" / 24h times), legend chips that show/hide each source, "New event" button, drag-select to create (all-day range in month, time range in week), click → event editor / task editor / goal page (milestones go to their goal). `calendar-feed.ts` (pure, 7 specs): `feedRange()` turns FullCalendar's visible span into local `from`/`to` + `fromUtc`/`toUtc`; `toEventInput()`; local↔UTC helpers. `event-editor` dialog: title, all-day switch, start/end date pickers + ng-bootstrap timepickers (5-min steps), location, notes, linked items when editing, delete.
  - `core/dates/today.ts`: `toLocalIsoDate`, `localMidnight`; `TasksService.get(id)`. Calendar placeholder route replaced.
- FullCalendar v7 gotchas found (also in CLAUDE.md): event `className` is a space-separated **string** (arrays don't type-check); `color: 'var(--x)'` works (it becomes the event's `--fc-event-color`); per-view `views.timeGridWeek.height` leaves the time grid at **0px** — use calendar-level `height` only; `@fullcalendar/angular/locales/*` points at files that don't exist — import `fullcalendar/locales/en-gb`.
- Verified:
  - curl: all-day (end defaulted), timed with `+05:30` offset → stored `01:30Z`, no-timezone / end-before-start / missing end / reversed all-day / no start / blank title → 400; timed → all-day switch clears times; other user get/put/delete → not found; link candidate; event in the feed; delete → 404; anonymous 401.
  - Browser (projuser1, IST): month view shows all four sources in their colours, done milestone struck through, Diwali break spans the week break, Dentist (10:00Z) at **15:30**, Tokyo call (20:00Z on 31 Oct) on **1 Nov at 01:30**; week view grid opens around working hours with Dentist 15:30–16:00. 
  - lint clean; `ng build` clean; tests 22 backend + 32 frontend; `dotnet build` 0 warnings.
- **Verified later the same session (browser)**: drag-select in month view opens the editor prefilled as an all-day range; empty submit shows "Give the event a title."; created "Cousin's wedding" 15–17 Oct (Nashik) → toast + bar spanning the 3 days; reopening it shows "Edit event" with linked items; switching All day off shows 24h timepickers (09:00–10:00 default); start 18:00 with end 10:00 on the same day shows "It can't end before it starts." inline, cleared once the end became 22:00.
- **Still to verify in the browser (do this first next session)**: saving that timed edit (UTC round-trip back onto 15 Oct 18:00–22:00); "New event" button; delete from the editor; linking from the event editor; clicking a task (task editor) and a milestone/goal (navigation); legend toggles; month/week navigation reloading the feed; console errors. The "Cousin's wedding" event in UAT is still all-day 15–17 Oct (the timed edit was not saved). Also check the "+N more" popover is themed (it may render outside the component host, where the `--fc-forma-*` mapping doesn't reach).
- Test data added for projuser1: event "Team offsite" (23/Oct, all-day).

- Next up: finish the Session 16 browser checks above, then **Session 17 — Reminders** (CRUD + due reminders surfaced on load; deleting a task/goal should also drop reminders targeting it, like events already do).

## Last session: 2026-10-15 — Session 16 (finished) + Session 17 — Reminders
- **Session 16 browser checks, finished:**
  - Timed edit of "Cousin's wedding" (all-day off, 15 Oct 18:00–22:00 IST) → saved, shows "18:00" on 15 Oct; DB has `12:30Z`–`16:30Z` with the dates cleared. The end-before-start inline error fired again on the way (as intended).
  - "New event" button (today 09:00–10:00 prefilled) → created; linking from the event editor (event ↔ event) works; delete from the editor (SweetAlert) → event, its link **and its reminder** all soft-deleted.
  - Click a task → task editor; click a goal target → goal page; legend toggle hides/shows Tasks; next month reloads the feed (Diwali break, Tokyo call on 1 Nov 01:30). No console errors.
  - **Fixed: the "+N more" popover was unthemed** (transparent, default colours, header overlapping) — FullCalendar appends it to `<body>`, outside the component host where the `--fc-forma-*` mapping lived. The mapping, `--lifeos-cal-*` source colours, `.fc` font size and `.lifeos-cal-done` moved to `styles.scss` (`:root`). Re-checked with 4 events on one day (test events deleted afterwards).
- Shipped (Session 17, backend):
  - `RemindersService`/`IRemindersService` + `Areas/Calendar/Controllers/RemindersController` (`api/Calendar/Reminders`): `?status=Pending|Dismissed[&entityType&entityId]` (Pending soonest first; Dismissed = latest 50), `GET due` (pending with `RemindAt <= now`), get, create, update, `PUT {id}/dismissed` (`{ dismissed }`, dismissing twice keeps the first time), `PUT {id}/snooze` (`{ until }`, must be in the future; makes it pending again), delete.
  - Validation: title, time with a timezone (same rule as events), target both-or-neither, target type = any linkable provider except `InboxItem`, target must exist for this user (checked through the provider). Responses carry the target's current title (`entityTitle`).
  - **Deleting a task / goal / project / event now drops reminders about it** (`RemoveAllForEntityAsync`, in the same transaction as the links cleanup); `EventsService` switched from its inline query to the service.
- Shipped (Session 17, frontend):
  - `core/services/reminders.service.ts`: one `due` signal for the whole app + `changedVersion`; announces newly-due reminders as a new amber **reminder toast** kind (bell icon, 10 s; at most 3, then "N more reminders are due."). The shell refreshes on load, every 60 s and when the tab becomes visible; reset on logout. Client deletes of tasks/goals/projects/events call `notifyChanged()`.
  - `features/reminders/`: Reminders page (nav under Overview, **Due now** in amber / **Coming up** / **Done** with Restore), reminder editor dialog (title, day picker, 5-min timepicker, notes, "About Task: …"), `ReminderRow` (Done, snooze menu: in 1 hour / this evening 18:00 / tomorrow 09:00 / pick a time), `reminder-times.ts` (pure, 7 specs), `ReminderTargetOpener`.
  - `shared/components/entity-reminders` on the task editor, event editor, goal detail and project detail ("+ Remind me" prefills the item's title and target).
  - My Day: "Reminders due" card when anything is due; amber sidebar badge on Reminders.
- Verified:
  - curl matrix: free + targeted create (`+05:30` offset stored as UTC, `task` normalised to `Task`), no-timezone / blank title / missing time / half target / inbox target / unknown type / other user's task → 400; due vs pending vs by-entity lists; other user get/dismiss/delete → not found, lists empty; dismiss → gone from due, in Dismissed; snooze into the past rejected, future accepted; update; delete → 404; anonymous 401; deleting a task drops its reminders.
  - Browser (projuser1, IST): from the task editor, reminder "Order the soil online" at 08:33 → at 08:33 the **sidebar badge appeared without a reload** (toast seen by you); after a reload: toast + My Day card + badge; snooze "In 1 hour" → 09:34 and the card/badge cleared; empty title → inline error; new free reminder at the default time (next hour ≥ 30 min away); Done → Done view with "done 8:34 AM", Restore → back in Coming up; target link → task editor. No console errors.
  - `dotnet build` 0 warnings (unsandboxed, NuGet audit; `--vulnerable` clean); lint + Prettier clean; `ng build` clean; tests 22 backend + 39 frontend.
- Notes:
  - Reminders fire only while LifeOS is open in a tab (as planned: no job server until Phase 2). No browser `Notification` permission yet — could be added later without a server.
  - Reminders aren't drawn on the calendar; they'd be a sixth feed branch if wanted.
  - UAT test data for projuser1: reminders "Order the soil online" (09:34), "Pay the electricity bill" (10:00), "Start on this" (11:19, task Get soil); "Cousin's wedding" is now timed 15 Oct 18:00–22:00.

- Next up: **Session 18 — Habits schema + scaffold + streak logic**.

## Last session: 2026-10-15 — Session 18 — Habits schema + scaffold + streak logic
- Shipped:
  - `database/schema/05_habits.sql` → schema `habits`:
    - `habits.Habits`: Title (unique per user while live, `UX_Habits_User_Title`), Description, optional `LifeAreaId` (shared taxonomy, like goals), **`ScheduleDays` TINYINT weekday bitmask** (ISO order Mon = 1 … Sun = 64; 127 = every day, default; `CK_Habits_ScheduleDays` 1–127), `StartDate` (DATE — nothing before it can be missed), `Status` Active/Archived (`CK_Habits_Status`).
    - `habits.HabitEntries`: one row per day done (`EntryDate` DATE, the user's local day), `UserId` repeated for the global filter, `UX_HabitEntries_Habit_Date` filtered on `IsDeleted = 0` (un-tick = soft delete, re-tick works), `IX_HabitEntries_User_Date` for the grid's date-range reads.
    - Streaks are **not stored** — always computed from entries.
  - Re-scaffold: `Habit`, `HabitEntry`, nav properties on `User`/`LifeArea` — purely additive. Partials `Habit`/`HabitEntry : ISoftDeletable, IUserOwned`.
  - **`HabitStreaks`** (`LifeOS.Core/Habits/Services/`, pure): `IsScheduled(mask, day)` and `Calculate(mask, startDate, doneDates, today)` → `HabitStreak(Current, Longest, DoneToday, DueToday, LastMissed)`. Only scheduled days from the start date to today count; today not yet done doesn't break the streak; unscheduled days neither break nor extend it; ticks on unscheduled days / before the start / in the future are ignored; `LastMissed` is what Session 24's "streak broken" insight will read. 21 xUnit cases (written by a parallel sub-agent, reviewed).
- Decisions (mine — say if you want them changed): weekday schedule (e.g. Mon/Wed/Fri) rather than "N times per week"; no pause state (archive instead); linking a habit to its goal goes through EntityLinks (Session 19 adds `HabitLinkableProvider`), not a column.
- Verified:
  - UAT backed up first (`LifeOS_UAT_pre18.bak` in the session scratchpad); script applied twice (idempotent).
  - Constraints in a rolled-back transaction: default mask 127 / status Active; mask 0 and 128, status "Paused", duplicate live title, duplicate entry for the same day → rejected; un-tick + re-tick and reusing a deleted habit's title → accepted.
  - **Fresh DB from `00`–`05` + the proc scaffolds identically to `Models/`** (only the known `User.Username` position). Scratch DB dropped.
  - `dotnet build` 0 warnings; tests **43 backend** (22 + 21 new) + 39 frontend.
- Notes:
  - At the end of the session the local API wouldn't rebind `127.0.0.1:5217` ("address already in use", with no listener visible) after a stuck `LifeOS.Api.exe` was killed — an OS socket left behind, not a code issue (the build is clean and nothing in Session 18 touches the API surface). If it persists after a reboot, change the port in `launchSettings.json` + `proxy.conf.json`.

- Next up: **Session 19 — Habits UI**: Habits API (CRUD, tick/un-tick a day with the client's `today`, streaks via `HabitStreaks`), `HabitLinkableProvider`, daily check-off grid + streak display; replace the Habits placeholder route.

## Last session: 2026-10-15 — Session 19 — Habits API + UI
- Shipped (backend):
  - `HabitsService`/`IHabitsService` + `Areas/Habits/Controllers/HabitsController` (`api/Habits/Habits`): list/get with `?today&from` (streak as of the client's today from the full history; `doneDates` only for the window, max 400 days), create, update, `PUT {id}/status` (Active/Archived), `PUT {id}/entries/{date}` (`{ done, today }` → `{ entryDate, done, streak }`), delete. Duplicate-title pre-check + `DbUpdateException` safety net; a double-click race on a tick is treated as done.
  - Tick rules: not in the future, not before the start date, only on scheduled days, only while Active. **Un-ticking is allowed on any past day** (so a day ticked before a schedule/start change can still be removed). Ticking twice / un-ticking an undone day are no-ops.
  - Delete soft-deletes the habit, its entries, its links and reminders about it. `HabitLinkableProvider` ("Habit") → habits link to goals and can be reminder targets.
  - `HabitsProfile` (AutoMapper; streak + done dates filled in after `ProjectTo`).
- Shipped (frontend):
  - `core/services/habits.service.ts`; `features/habits/habit-schedule.ts` (pure: `isScheduled`, `scheduleLabel`, `daysEnding`, `dayState`, `canToggle`, `applyEntry`; 9 specs).
  - **Habits page**: Active/Archived pills, "N of M done today", a 7-day check-off grid ending today with previous/next week paging, current + best streak per habit; header row on desktop, weekday letters above the cells on phones.
  - `app-habit-day` cell component (done = teal tick, today open = dashed, missed = red tint, off schedule / before start = dot, future = dashed outline) — small bespoke SCSS on LifeOS tokens.
  - **Habit page** (`/habits/:id`): current/longest/days-in-12-weeks, today's state + last missed, a 12-week Monday-aligned history you can tick from, Archive/Restore, Edit, Delete (SweetAlert), linked items (defaults to Goal), reminders.
  - Habit editor dialog: name, weekday toggles + Every day/Weekdays presets, start date (ngbDatepicker), optional life area, "why it matters". Inline errors on every field.
  - `ReminderTargetType` + `ReminderTargetOpener` know `Habit`; Habits placeholder route replaced. New `APP_DAY_MONTH_FORMAT` (`dd/MMM`) for the week-range label.
- Verified:
  - curl (new users `habituser1`/`habituser2`, password in the scratch script, not committed): create (trimmed, life area name), duplicate (case-insensitive) / blank / mask 0 and 200 / no start / unknown life area → 400; streak walk (tick 12–15 Oct → 4, un-tick 13 → 2 with `lastMissed` 13, re-tick → 4); idempotent tick/un-tick; future / before start / off-schedule → 400; un-tick an off-schedule day → allowed; archived → tick rejected; bad status / bad windows → 400; other user list empty, get/tick/status/delete → 404; link candidates; delete → entries, reminders and links gone; anonymous 401.
  - Browser (projuser1, IST): empty-name inline error → created "Morning walk" (Weekdays, from 05/Oct) → ticked Mon–Thu → 🔥4 / best 4 (Fri 9 shown missed, weekend dotted) → un-ticked Tue → 2 / best 2 → habit page with history, "Last missed 13/Oct/2026" → linked goal "Visit Japan" (shows on the goal too) → Archive (days inert, Restore offered) → Restore → "+ Remind me" → reminder shows "Habit: Morning walk" and opens the habit. Phone width (375px): no horizontal scroll. No console errors.
  - Fixed via the browser pass: off-schedule and before-start cells were invisible (now a dot); archived done-days lost their tick mark.
  - `dotnet build` 0 warnings; lint + Prettier clean (`src/app`; `src/index.html` has a pre-existing Prettier warning, untouched); `ng build` clean; tests 43 backend + 48 frontend.
- Notes:
  - The API port problem from Session 18 was gone after the restart.
  - UAT test data: projuser1 habit "Morning walk" (linked to Visit Japan, reminder 15 Oct 21:00); habituser1 habit "Gym".

- Next up: **Session 20 — Journal schema + scaffold** (`06_journal.sql`).

## Last session: 2026-10-15 — Session 20 — Journal schema + scaffold
- Shipped:
  - `database/schema/06_journal.sql` → schema `journal`:
    - `journal.JournalEntries`: `EntryDate` (DATE, the user's local day), optional `Title`, `Content`, `Mood` TINYINT 1–5 (`CK_JournalEntries_Mood`), optional `LifeAreaId`; `CK_JournalEntries_NotEmpty` (content or mood); **one live entry per user per day** (`UX_JournalEntries_User_Date`, filtered, includes Mood for the trend view).
    - `journal.WeeklyReflections`: one per user per ISO week (`UX_WeeklyReflections_User_Week`, filtered), `WeekStartDate` must be a Monday (`CK_WeeklyReflections_Monday`, DATEFIRST-independent), three prompts `WentWell` / `WasHard` / `NextFocus`, not all empty.
  - Re-scaffold: `JournalEntry`, `WeeklyReflection`, nav properties on `User`/`LifeArea` — purely additive. Partials `: ISoftDeletable, IUserOwned`.
  - `JournalWeeks` (`LifeOS.Core/Journal/Services/`, pure): `WeekStart`, `IsWeekStart`, `Range`; 7 xUnit cases.
- Decisions (mine — say if you want them changed): one entry per day (the plan's "daily entry"), mood as a 1–5 number, weekly reflections stored as their own small table (the plan named only JournalEntries, but the Session 21 prompt screen needs somewhere to keep answers); no tags on journal entries for now (Life Area only, as planned).
- Verified:
  - UAT backed up first (`LifeOS_UAT_pre20.bak` in the session scratchpad); script applied twice (idempotent).
  - Constraints in a rolled-back transaction: words-only / mood-only entries, a Monday reflection, rewriting a deleted day, a Monday under `SET DATEFIRST 7` → accepted; empty entry, mood 0 and 6, second entry same day, Tuesday/Sunday week start, empty reflection, second reflection same week → rejected.
  - **Fresh DB from `00`–`06` + the proc scaffolds identically to `Models/`** (only the known `User.Username` position). Scratch DB dropped.
  - `dotnet build` 0 warnings; tests **50 backend** + 48 frontend; API starts and queries fine with the new entities in the model.

- Next up: **Session 21 — Journal UI**: Journal API (entry by day, upsert, delete, mood trend, weekly reflection get/save), process inbox `Journal` items into entries, `JournalEntryLinkableProvider`; daily editor + mood picker, trend view, weekly reflection screen; replace the Journal placeholder route.
