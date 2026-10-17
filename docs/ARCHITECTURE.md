# LifeOS architecture

How the pieces fit together, for someone about to change the code. The rules themselves (naming, the checklist for a
schema change, the gotchas) are in [`CLAUDE.md`](../CLAUDE.md); the *why* behind the big decisions is in
[`LifeOS_Development_Plan.md`](../LifeOS_Development_Plan.md) Sections 2–3.

## The shape of it

```mermaid
flowchart LR
  subgraph Browser["Angular app (lifeos-web)"]
    Pages["features/* pages"] --> Svc["core/services/*.service.ts<br/>(one per API area)"]
    Shared["shared/components<br/>(tag picker, linked items,<br/>quick add, reminders)"] --> Svc
    Svc --> Int["authInterceptor<br/>(JWT, 401 → login)"]
  end
  Int -- "/api/* via dev proxy" --> Ctl
  subgraph Api["LifeOS.Api"]
    Ctl["Areas/&lt;Module&gt;/Controllers<br/>(thin: bind, call, wrap)"]
  end
  subgraph Core["LifeOS.Core"]
    Ctl --> S["&lt;Module&gt;/Services<br/>(rules, OperationResult)"]
    S --> EF["AppDbContext (EF Core)<br/>+ global user/soft-delete filters"]
    S --> Dap["Dapper → stored procedures<br/>(multi-join / aggregation)"]
    S --> Pure["Pure logic<br/>(streaks, recurrence, progress,<br/>insights, life balance)"]
  end
  EF --> DB[("SQL Server LocalDB<br/>LifeOS_UAT")]
  Dap --> DB
```

A request: the page calls its service → `HttpClient` → the interceptor adds the token → the controller binds and
validates the request → the module's service applies the rules and returns `OperationResult<T>` → the controller
wraps it in `ApiResponse<T>` (200 with `data`, or 400/404 with `message`). Unexpected exceptions go to
`GlobalExceptionHandler`, validation failures to `ValidationResponse`: same envelope either way, so the client reads
every error with `apiErrorMessage(err, fallback)`.

## Modules

| Module | SQL schema | Tables | Server (`LifeOS.Core/…`) | Pages (`features/…`) |
|---|---|---|---|---|
| Shared platform | `shared` | Users, LifeAreas (seeded, global), Tags, EntityLinks, InboxItems, UserHiddenModules, UserHiddenLifeAreas, RecoveryCodes | `Shared/` — Auth, JWT, current user, Tags, EntityLinks, Inbox, LifeAreas, Search, Settings | `auth`, `inbox`, `tags`, `search`, `settings` |
| Goals & Milestones | `goals` | Goals, GoalMilestones, GoalTags, GoalHistory | `Goals/` | `goals` |
| Tasks & Projects | `tasks` | TaskItems, Projects, TaskTags | `Tasks/` | `tasks`, `projects` |
| Calendar & Reminders | `calendar` | Events (one-off or recurring series), EventExceptions (skipped occurrences), Reminders (one-time or repeating; occurrence reminders of events) | `Calendar/` (+ proc `calendar.GetCalendarFeed`) | `calendar`, `reminders` |
| Habits | `habits` | Habits, HabitEntries | `Habits/` | `habits` |
| Journal | `journal` | JournalEntries, WeeklyReflections | `Journal/` | `journal` |
| Story Mode (Phase 2) | `story` | Chapters, MissionPrerequisites, MissionDebriefs, LifeAreaRatings | `Story/` — Chapters, Life Story (+ proc `story.GetLifeStory`, recap), Missions, life-area levels + monthly ratings (+ proc `story.GetLifeAreaStats`), achievements (+ proc `story.GetAchievementFacts`); pure `MissionKinds`/`MissionGraph`/`ChapterRules`/`LifeStoryBuilder`/`LifeAreaLevels`/`StoryRecap`/`Achievements` | `story` (`/story`, `/missions`, `/life-areas`, Mission passed dialog, goal-page Story card, `/achievements`, "Previously on…" card on My Day) |
| Documents (Phase 2) | `documents` | Documents (kind, issuer, last 4 of the number, issued/expiry, vault flag), DocumentFiles (stored name, original name, type, size, SHA-256), DocumentTags | `Shared/` — `IFileStore`/`DiskFileStore` + pure `FileRules` (Session 38); `Documents/` — `DocumentsService`, `DocumentLinkableProvider`, pure `DocumentRules` (last 4, expiry reminder time) | `documents` (`/documents` library, `/documents/:id` with upload + preview, "Documents expiring" card on My Day) |
| Dashboard & Insights | `dashboard` (procedures only) | — | `Dashboard/` (+ procs `dashboard.GetMyDay`, `dashboard.GetLifeBalance`) | `dashboard` (My Day) |

Every module has the same server layout: `DTOs/` (request/response shapes, status constants), `ServiceContracts/`
(interfaces), `Services/` (implementations and pure helpers), `AutoMapper/` (entity → DTO profiles). Controllers live
in `LifeOS.Api/Areas/<Module>/Controllers/` and are routed `api/<Module>/<Controller>`.

## Data rules that apply everywhere

- **Database-first.** `database/schema/NN_<module>.sql` is the source of truth; `LifeOS.Core/Models/` is generated
  from the database by `dotnet ef dbcontext scaffold` and never edited. Hand additions to entities are partial classes
  in `Shared/ModelExtensions/`.
- **Every user-owned row has a `UserId`, and soft delete is the only delete.** One reflective global query filter
  (`AppDbContext.SoftDelete.cs`) applies `!IsDeleted && UserId == CurrentUserId` to every entity that implements
  `ISoftDeletable` and `IUserOwned`, so EF queries can't see another user's data or deleted rows. Stored procedures
  sit outside EF, so each one filters `UserId` and `IsDeleted` itself, joined parents included.
- **Two kinds of time.** Calendar days (due dates, habit days, journal days, all-day events) are `DATE` and mean the
  user's local day. Moments (`CreatedAt`, `CompletedAt`, timed events, reminders) are `DATETIME2` in UTC and come back
  with a `Z`. The server doesn't know the user's timezone, so anything that depends on "today" takes it from the
  client (`today=2026-10-15`), and range queries take the local days *plus* the same span as UTC instants
  (`fromUtc`/`toUtc`, local midnight to local midnight).
- **Business failures are values, not exceptions.** Services return `OperationResult<T>` (`Ok`/`Fail(message)`);
  exceptions are for the unexpected. Unique constraints are checked up front *and* backed by catching SQL errors
  2627/2601, since two requests can race.
- **Recurring events** (Session 33): a series is one `calendar.Events` row whose own dates are its first occurrence,
  plus `RecurrenceFrequency`/`RecurrenceInterval`/`RecurrenceUntil` and, for timed series, the IANA `TimeZone` whose
  wall clock it follows (09:00 stays 09:00 across DST). Occurrences are named by the day they start (in that zone) —
  that's the key of a skipped day in `calendar.EventExceptions`, and "change just this one" is a skip plus a new
  one-off event. Reminders and links attach to the series.
- **Repeating reminders** (Session 34): a reminder can carry the same rule (plus its zone and anchor); its `RemindAt`
  is always the next time, and "done" moves it on (`ReminderRecurrence.NextAfter`) until the rule runs out. A timed
  repeating event can "remind me N minutes before each": nothing is generated ahead — when an occurrence's reminder
  moment comes, reading due reminders writes it as an ordinary reminder about the event (`OccurrenceDate` set,
  unique per occurrence), so done/snooze/history need no special cases.
- **Computed, never stored:** goal progress (`GoalProgress`), habit streaks (`HabitStreaks`), the next occurrence of
  a repeating task (`TaskRecurrence`), the occurrences of a recurring event (`EventRecurrence`), insights (`DashboardInsights`), life balance (`LifeBalance`). Each is a pure
  static class with xUnit tests, so it can't drift from the data it summarises.

## Cross-cutting features

- **EntityLinks**: undirected "related to" links between any two items. Each linkable type registers an
  `ILinkableEntityProvider` (a stable type string, titles and search through `AppDbContext`, so the filters apply).
  Links are stored in one canonical direction, so a unique index rejects duplicates either way. Deleting an item
  removes its links. UI: `<app-linked-items entityType="Goal" [entityId]="id" />`.
- **Global search** (Session 36): `GET api/Shared/Search?q=` (`SearchService`) runs the same
  `ILinkableEntityProvider.SearchAsync` the link picker uses, one provider after another (one DbContext), 5 per type
  + `hasMore`, groups in a fixed order; journal hits get a `SearchSnippets.Around` excerpt of the text. A new linkable
  module is searchable with no change here. UI: the lazy-loaded palette (`features/search/search-palette`) opened by
  Ctrl/Cmd+K, `/` (outside fields), the sidebar Search button or the phone top bar, via `SearchPaletteService.open()`;
  results open through `EntityOpener` (shared with reminder targets).
- **Files** (Session 38): `IFileStore` (`DiskFileStore`, singleton) writes uploads to `<FileStorage:RootPath>/<userId>/`
  under a random stored name (32 hex + extension), streaming to a `.part` file while counting size and SHA-256, then
  checking the type twice — the extension must be on `FileRules`' list (no SVG/HTML/executables) and the first bytes
  must match it — before renaming into place. Callers keep the returned `StoredFile` in SQL and only ever pass a
  stored name back; anything else (slashes, `..`, a drive) is refused. Files are served only through the API.
- **Settings + account** (Session 37): preferences on `shared.Users` (`TimeZone` = the zone new repeating events and
  reminders follow, `BaseCurrency`), switched-off modules and life areas in `shared.UserHiddenModules` /
  `UserHiddenLifeAreas` (soft-deleted to switch back on). The shell loads them once into `SettingsService`; the nav
  (`visibleNavGroups`), My Day (`withoutHiddenModules`) and every life-area picker (`pickableLifeAreas`) read its
  signals — hiding is presentation only. Password reset without email: 8 one-time recovery codes (80 random bits,
  stored as SHA-256 in `shared.RecoveryCodes`) shown at registration or made in Settings; `reset-password` is
  anonymous, gives one answer for every failure and sits behind `RecoveryRateLimit` (ASP.NET's built-in limiter).
- **Inbox / Quick Add**: press <kbd>Q</kbd> anywhere to capture a task, note, journal line or idea into
  `shared.InboxItems`. Modules turn items into real entities ("Make it a task", "Add to journal"), moving the item's
  links and marking it processed in one transaction.
- **Reminders**: point in time + optional target (any linkable type). There's no background job: what's due is
  worked out per request. The shell polls every minute and on tab focus, which feeds the sidebar badge, the My Day
  card and the toasts. Deleting an item removes its reminders.
- **Tags**: one shared `shared.Tags` list per user, attached through a per-module join table (`goals.GoalTags`,
  `tasks.TaskTags`). No per-module category enums.
- **History**: goals log status changes and revisions to `goals.GoalHistory`. New audit trails follow the same
  small per-module table pattern.

## Stored procedures (Dapper)

EF Core handles single-entity CRUD. Queries that join across schemas or aggregate are hand-written procedures in
`database/procedures/`, called through Dapper on the context's own connection:

| Procedure | Used by | Returns |
|---|---|---|
| `calendar.GetCalendarFeed` | `GET api/Calendar/Feed` | set 1: one-off events + task due dates + milestone and goal targets in a range, one row shape; set 2: recurring event series that may fall in the range; set 3: their skipped days — the service expands 2 minus 3 with `EventRecurrence` and merges |
| `dashboard.GetMyDay` | `GET api/Dashboard/MyDay` | ten result sets (`QueryMultiple`): tasks, one-off events, reminders, goals, habits, habit entries, latest journal, recurring event series, their skipped days (expanded for today like the feed), documents expiring within 60 days or expired in the last 30 (Session 40) |
| `dashboard.GetLifeBalance` | `GET api/Dashboard/LifeBalance` | per life area: active goals, completions, habit days, journal entries |
| `story.GetAchievementFacts` | `GET api/Story/Achievements` (and the Life Story) | nine result sets of raw facts (goals passed, objectives, habits + days, journal days, chapters, debriefs, ratings, life-area count) → `Achievements.Evaluate` in C# decides unlocks and their local days |
| `story.GetLifeAreaStats` | `GET api/Story/LifeAreas/stats` | all-time counts per life area (goals passed, objectives, habit days, journal entries) → `LifeAreaLevels` XP and level in C# |
| `story.GetLifeStory` | `GET api/Story/LifeStory` | every story beat (goal events, objectives, habits begun, great/hard days); the service maps moments to local days with the user's IANA timezone |

Rows come back as DATE → `DateTime` and DATETIME2 → unspecified kind; the service converts them to `DateOnly` and UTC
(EF's UTC converter doesn't cover Dapper).

## API surface

All routes need a JWT except register, login and ping.

| Area | Endpoints |
|---|---|
| `api/Shared/Auth` | `POST register` (returns the first recovery codes), `POST login`, `GET me`, `PUT password`, `POST recovery-codes` (new set), anonymous `POST reset-password` (username + recovery code; rate-limited) |
| `api/Shared/Settings` | `GET` (profile, timezone, base currency, hidden modules/life areas, recovery codes left), `PUT profile`, `PUT preferences` (replaces all preferences), `GET currencies` |
| `api/Shared/Tags`, `Inbox`, `LifeAreas`, `EntityLinks`, `Search` | CRUD; Inbox `PUT {id}/processed`; EntityLinks `GET types`, `GET candidates`; `GET Search?q=` (matches grouped per linkable type) |
| `api/Goals/Goals` | CRUD, `PUT {id}/status`; milestones under `Goals/{goalId}/Milestones` (CRUD, `PUT {id}/completed`, `PUT order`) |
| `api/Tasks/Tasks` | CRUD, `PUT {id}/completed`, `POST from-inbox/{id}` |
| `api/Tasks/Projects` | CRUD, `PUT {id}/status` |
| `api/Calendar/Events`, `Feed`, `Reminders` | Events CRUD (a series is one event with `recurrence` + `timeZone`); drag/resize: `PUT Events/{id}/move` (new dates/times; an occurrence adds `occurrenceDate` + `scope` One = becomes a one-off, Series = the whole series shifts by the same wall-clock amount, `EventRecurrence.Shift`); events carry an optional `lifeAreaId` (time blocking; the feed returns it for the week view's "by life area" strip); occurrences: `PUT Events/{id}/occurrences/{date}/skipped`, `POST …/{date}/detach` (change just this one), `POST …/{date}/end` (this and following); `GET Feed?from&to&fromUtc&toUtc` (occurrences carry `isRecurring` + `occurrenceDate`); events take `reminderMinutesBefore` (timed series); Reminders CRUD (optional `recurrence` + `timeZone`), `GET due` (writes due occurrence reminders first), `PUT {id}/dismissed` (a repeating one moves to its next time), `PUT {id}/snooze` |
| `api/Habits/Habits` | CRUD, `PUT {id}/status`, `PUT {id}/entries/{date}` (tick/untick, returns the new streak) |
| `api/Journal/Entries`, `Reflections` | entries by day (`GET`/`PUT`/`DELETE day/{date}`), `GET moods`, `POST from-inbox/{id}`; reflections `GET`/`PUT {monday}` |
| `api/Dashboard/MyDay`, `LifeBalance` | the My Day snapshot (with insights); activity per life area |
| `api/Story/Chapters`, `LifeStory` | Chapters CRUD (a new current chapter closes the previous); the story filed into chapters (`?tz=`); `GET LifeStory/recap?tz=` (current chapter, last 3 beats up to today, current mission) |
| `api/Story/Achievements` | `GET ?tz=` — all 17 achievements, unlocked with the local day or locked with progress/target; unlocks also appear in the Life Story as `AchievementUnlocked` beats |
| `api/Story/LifeAreas` | `GET stats` (XP + level per area), `GET ratings?from&to` (months by first day), `PUT ratings/{month}` (`{ today, ratings: [{ lifeAreaId, rating 1–10 | null, note }] }`, null clears; rewritten in place) |
| `api/Story/Missions` | goals as missions (`GET`, `GET {goalId}`), `POST {goalId}/prerequisites`, `DELETE {goalId}/prerequisites/{requiresGoalId}`, `GET {goalId}/passed`, `PUT {goalId}/debrief` |
| `api/Documents/Documents` | CRUD (`GET ?kind&search&tagId`; `number` is cut to its last 4 characters; `expiryReminderDays` keeps one reminder about the document at 09:00 local, N days before `ExpiresOn`); files: `POST {id}/files` (multipart `files`, 1–10, all or none), `PUT {id}/files/{fileId}` (new version), `DELETE {id}/files/{fileId}`, `GET {id}/files/{fileId}[?download=true | ?raw=true]` (owner only; inline for PDF/images/text, nosniff, `X-Content-SHA256`; `raw` = the app's own fetch: no file name, neutral type, so download managers leave it alone) |

Swagger UI (`/swagger`, Development only) has the full request/response shapes.

## Frontend

- **Shell** (`core/layout/shell.*`): sidebar plus mobile drawer, rendered from `NAV_GROUPS` in `nav-items.ts`. It
  mounts Quick Add and the toasts and polls due reminders. Every route is lazy-loaded and has a `title`.
- **Data access**: one service per API area in `core/services/`, returning plain observables of the unwrapped
  `data`. Components never touch `HttpClient`. Shared lookups (life areas) are cached with `shareReplay` and never
  error.
- **State**: signals in components, OnPush everywhere, reactive forms. Every form field shows its own inline error;
  every input has a placeholder.
- **Dates**: one display format (`14/Oct/2026`) set via `DATE_PIPE_DEFAULT_OPTIONS`; ng-bootstrap datepickers (never
  `<input type="date">`); local-date helpers in `core/dates/today.ts`, tested in six timezones (`npm run test:tz`).
- **Failure handling**: `apiErrorMessage` for toasts; `<app-load-error>` instead of an empty state when a page's
  load fails; a 401 sends the user to login and back.
- **Styling**: CoreUI CSS as the single framework, LifeOS colour tokens in `styles.scss` (`--lifeos-*`), Sora +
  Manrope. Bespoke CSS only where a module needs its own visuals (My Day, Calendar, habit cells, life balance bars).

## Adding a module (checklist)

1. `database/schema/NN_<module>.sql`: its own SQL schema, base columns, `UserId`, named PKs and `CHECK`
   constraints, filtered unique indexes. Apply it to UAT twice (it must be re-runnable), re-scaffold, review the
   `Models/` diff.
2. Partial classes `: ISoftDeletable, IUserOwned` in `Shared/ModelExtensions/EntityPartials.cs`.
3. `LifeOS.Core/<Module>/{DTOs,ServiceContracts,Services,AutoMapper}`; register the service in `Program.cs`. If its
   items should be linkable or remindable, add an `ILinkableEntityProvider`; its delete removes links and reminders.
4. Thin controllers in `LifeOS.Api/Areas/<Module>/Controllers/`.
5. `core/services/<module>.service.ts`, `features/<module>/`, a route replacing the `placeholder(...)` one, and a
   nav entry.
6. Pure rules get xUnit or vitest tests; date logic gets `npm run test:tz`.
7. Build clean, lint and Prettier clean, check it in the browser (including phone width), commit, update
   `PROGRESS.md`.
