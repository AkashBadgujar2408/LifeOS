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

- Next up: **Session 3 — Database & base entities (multi-user)**, then **Session 4 — Auth: registration + login**.
