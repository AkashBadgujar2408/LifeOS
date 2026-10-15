# lifeos-web

The Angular 22 frontend of LifeOS. Setup, running the whole app and the project overview are in the
[root README](../README.md); how the frontend is organised is in [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md#frontend);
the conventions (forms, dates, errors, styling) are in [`CLAUDE.md`](../CLAUDE.md).

## Commands

| | |
|---|---|
| `npm start` | dev server on http://localhost:4200, proxying `/api` to the API on :5217 (`proxy.conf.json`) |
| `npm run build` | production build into `dist/` |
| `npm test -- --watch=false` | unit tests (vitest) |
| `npm run test:tz` | unit tests once per timezone (New York, London, LA, UTC+14, UTC−11, Lord Howe) |
| `npm run lint` | angular-eslint |
| `npm run format` | Prettier over `src/` |

The API must be running for anything beyond the login page: `dotnet run --project LifeOS.Api --launch-profile http`
from the repository root.

## Layout

```
src/app/
  core/       dates/ (format, local-date helpers), guards/, interceptors/, layout/ (shell, nav), services/ (one per API area)
  features/   one folder per page/module: dashboard (My Day), inbox, goals, tasks, projects, calendar, reminders,
              habits, journal, tags, auth
  shared/     reusable components: tag-picker, linked-items, quick-add, entity-reminders, load-error, auth-layout,
              module-placeholder, toasts
styles.scss   LifeOS colour tokens (--lifeos-*), CoreUI/Bootstrap overrides, a few utilities
```
