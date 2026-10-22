# UniPop COMMAND

**Planification & coordination** — annual planning and operations platform for UniPop.
Built by Frank & Cameron.

A working local-first web app: annual wall planner, calendar (year / quarter / month / week / day / agenda),
projects and events with templates and recurrence, tasks, Gantt, reminders, read-only UniPop course
integration, team and roles, A0–A4 vector PDF printing, backup and restore. Everything runs in the
browser with IndexedDB; Supabase and Cloudflare are prepared but not required.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 26 unit tests (dates, recurrence, reminders, mapping, storage, backup, print)
npm run typecheck    # full strict type-check (UI included)
npm run build        # production build in dist/ (Cloudflare Pages ready)
```

Node 20.19+ is required. The first launch seeds a fictional demonstration year (all records flagged `demo`).
Reset it any time in **Paramètres → Données**.

### Single-file build

```bash
npm run build:single   # dist-single/index.html, JS + CSS inlined (used for the hosted preview)
npx playwright install chromium
npm run e2e            # acceptance run: 23 workflows, downloads checked, screenshots in e2e/out/
```

## What is where

```
src/
  domain/        pure logic: types, dates (Europe/Luxembourg), recurrence, planning, reminders, search
  data/          repository contracts, IndexedDB adapter, memory adapter, schema + migrations, backup, demo seed
    supabase/    planned adapter (row mapping only, not wired)
  integrations/
    courses/     trainings.json adapter (real field names), demo courses, sync service
    cloudflare/  reminder dispatch contract for a future Cron Worker
  print/         vector layouts (A0–A4), pdf-lib renderer, QR encoder
  services/      file saving (browser download or claude.ai downloads capability)
  app/           store (state + permissions + persistence), derived hooks, shared actions, shell
  features/      calendar, events, tasks, gantt, reminders, courses, team, print, settings, search
  ui/            UI store (panels, dialogs, toasts, menus), component kit, icons
  styles/        design tokens and component styles (light + dark)
tests/           node:test suites (run with tsx)
e2e/             Playwright acceptance script
supabase/        SQL schema with RLS (planned)
workers/         Cloudflare Worker: course feed proxy + cache (planned)
docs/            architecture, data model, Supabase and Cloudflare guides, status
```

## Configuration

Copy `.env.example` to `.env.local`. Only public values belong in `VITE_*` variables.
Runtime settings (course source URL, public URL for QR codes, reminder thresholds, theme) are editable
in **Paramètres** and stored locally.

## Documentation

- `docs/ARCHITECTURE.md` — layers, data flow, design decisions, data model
- `docs/SUPABASE.md` — implementing the shared backend
- `docs/CLOUDFLARE.md` — deploying Pages and the course-sync Worker
- `docs/STATUS.md` — what works today, what needs cloud infrastructure, known limitations
