# Status

Verified with `npm test` (26 unit tests) and `npm run e2e` (Playwright acceptance run on the built app).

## Works today (local, no credentials)

- Annual wall planner: 12 months × 31 days in four quarters, multi-day bars, deadlines, milestones,
  course density, Luxembourg public holidays, hover preview, day panel, today highlight, year navigation.
- Calendar modes: year, quarter, month, week, day; agenda on phones. Filters: location, activity type,
  course theme, project, responsible, status. "Aujourd’hui" action and keyboard navigation.
- Course themes per day with a popover listing time, title, location, room and enrolment.
- Dashboard brief: today, next 7 days, overdue, active projects, link to reminders.
- Projects & events: create, edit, duplicate, archive, delete (with undo and task handling), five templates
  that generate preparation tasks, milestones and dependencies; detail page with overview, planning
  (Gantt), tasks, team, documents (links), history.
- Recurrence: yearly, monthly, weekly, custom interval; edit one occurrence; "this and following" split
  that preserves history; per-occurrence preparation from templates; cancel an occurrence.
- Rescheduling: moving an event previews deadline recalculation; hand-edited tasks are never selected by default.
- Gantt: drag to move, drag edges to resize, keyboard equivalents, person/status filters, dependencies,
  today line, month navigation, three zoom levels.
- Tasks: six views, quick add, search, filters, sorting, bulk complete/status/assign/delete, checklist,
  comments, dependencies with cycle detection, history, context menus.
- Reminders: overdue, deadlines, milestones, preparation, recurring, unassigned; configurable thresholds;
  open, complete, snooze, acknowledge, restore; type and person filters.
- Courses: live sync with explicit failure handling, demo fallback clearly labelled, manual JSON import,
  search and filters, read-only course panel.
- Team: fictional identifiers, roles, workload, add/edit/delete with reassignment; demo user switch
  (labelled as simulation).
- Printing: annual planner (A0/A1/A3/A4, landscape/portrait), operational Gantt (paginated), A4 checklist,
  vector PDF, live preview, optional QR code from the configured public URL, browser print when not
  embedded.
- Data: IndexedDB persistence, schema versioning and migrations, JSON backup export, validated restore
  (merge or replace, never silent), demo reset, start empty.
- Global search / command palette (Ctrl K), shortcuts (N, A, ., 1–5, ?), dark mode, reduced motion.

## Requires cloud infrastructure

- Shared multi-user data and realtime updates → Supabase (schema and RLS ready in `supabase/`).
- Real accounts and enforced permissions → Supabase Auth + RLS (the demo role switch is not security).
- Reliable course sync from browsers → Cloudflare Worker proxy (`workers/course-sync`).
- Reminders delivered while the app is closed → Cloudflare Cron Worker (contract in `src/integrations/cloudflare`).
- File attachments → Supabase Storage (links only today).
- PWA install is wired for the Pages build (manifest + small service worker); not active inside claude.ai.

## Known limitations

- Course sessions for multi-week courses are estimated from the weekly pattern; school holidays and
  irregular dates (e.g. four specific Thursdays) are not in the feed.
- Trainer names from the live feed are shown as provided by UniPop; demo data never contains real names.
- PDFs use Helvetica; Gotham would need a licensed font file to embed.
- Local data lives in one browser on one device until Supabase is connected; use backups.
- The UI layer (`src/app`, `src/features`, `src/ui`) has not been type-checked yet: `@types/react` was not
  available in the environment used for this delivery. It compiles with esbuild and is exercised end to end
  by the acceptance run, but `npm run typecheck` may still report typing issues to fix. The core layers
  (domain, data, integrations, print, services) pass `npm run typecheck:core` in strict mode.
