# Architecture

## Principles

- **Local first, cloud ready.** The UI talks to an `AppStore`, which talks to a `DataStore` interface
  (`src/data/contracts.ts`). Today the implementation is IndexedDB; a Supabase implementation can replace
  it without touching domain or UI code. Nothing in `src/` imports Supabase.
- **Pure domain.** `src/domain` has no React, no storage, no network. It is fully unit-tested.
- **Calendar dates, not timestamps.** Planning dates are `YYYY-MM-DD` strings interpreted in
  Europe/Luxembourg and computed on day numbers, so DST and the device timezone never move a deadline.
  "Today" is computed with `Intl` in Europe/Luxembourg.
- **One print pipeline.** Layouts emit vector primitives in millimetres; the same primitives render the
  on-screen SVG preview and the pdf-lib PDF. Text is measured with real Helvetica metrics.
- **Honest states.** Course data that could not be loaded is shown as demo data with a warning; downloads
  report declined or unavailable saves; demo roles are labelled as simulation.

## Layers

| Layer | Responsibility |
|---|---|
| `domain/` | Types, date maths, Luxembourg holidays, recurrence (expand, override, split), templates, progress, rescheduling, dependency validation, reminders, search |
| `data/` | Repository contracts, IndexedDB adapter (atomic `replaceAll`), memory adapter, schema version + migrations, normalisation, backup validation/merge, demo seed |
| `integrations/courses` | Mapping of the real `trainings.json` fields, session expansion, indexes by date/theme, sync policy |
| `print/` | Annual wall planner, operational Gantt, A4 checklist; QR encoder; PDF renderer |
| `app/` | `AppStore` (state, permission checks, write-through persistence, history, undo), derived hooks, actions |
| `features/` | Screens |
| `ui/` | Overlay/route store and component kit |

### State and persistence

All planning data for a small team fits in memory. `AppStore` loads it once, then every mutation writes
only the changed records to the repository and updates the in-memory state (no reload after edits).
React subscribes through `useSyncExternalStore`. Derived data (calendar ranges, reminders, indexes) is
memoised per slice.

### Recurrence

A series stores its rule plus `exceptions` keyed by each occurrence's original start date. Editing one
occurrence writes an override. "This and following" splits the series (`splitSeries`): the original ends
the day before, a new series starts at the occurrence, past occurrences stay untouched. Monthly/yearly
rules clamp to month end without drift (31 Jan → 28 Feb → 31 Mar).

### Templates and relative deadlines

Template tasks carry `offsetDays` relative to the event start. Moving an event proposes a recalculation
(preview dialog). Tasks whose dates were changed by hand are flagged `manualDates` and are never
selected by default.

### Course integration

The feed gives a date range plus a weekly pattern (`horaires` or `horairePrevu`), not individual session
dates. Single-day courses are exact; multi-week courses are expanded on the listed weekdays and flagged
`estimated` (school holidays are not in the feed). Theme = `matiereNom`, category = `categorieCodeUnipop`.
Course data is read-only and stored separately (`courseCache`) from planning data.

## Data model

See `src/domain/types.ts` (authoritative) and `supabase/migrations/0001_init.sql`.

- **PlanningEvent** — `kind` (`evenement` | `projet`), title, category, location, start/end date, optional
  times, organizer, `ownerId`, priority, status, notes, attachments (links), `recurrence`, `exceptions`,
  `seriesId`, `templateId`, `archived`, `history`, `rev`.
- **Task** — title, `eventId`, `occurrenceKey` (for recurring events), `assigneeId`, start/due date,
  priority, status (`a_faire`, `en_cours`, `en_attente`, `termine`), progress, `dependsOn`, checklist,
  comments, attachments, notes, `milestone`, `offsetDays`, `manualDates`, `completedAt`, `history`, `rev`.
- **TeamMember** — `code` (ORG-01…), function label, kind, role, colour, active.
- **Settings** — course source URL, auto-sync interval, public URL (QR), reminder thresholds, current demo
  user, theme, holidays.
- **ReminderState** — acknowledgement / snooze per reminder id. Reminder ids include the threshold level,
  so acknowledging "J-7" does not hide "J-3".
- **CourseSnapshot** — source (`live` | `file` | `demo`), timestamps, warning, mapped courses.

Every record has `id`, `createdAt`, `updatedAt`, `rev` (for optimistic concurrency in the shared version).

## Decisions and deviations from the brief

- **No Tailwind.** A token-based stylesheet (`src/styles/app.css`) keeps the design system explicit and
  supports light/dark themes; Tailwind can be added later if the team prefers it.
- **No calendar or Gantt library.** The wall planner and Gantt are custom because their layouts are the
  product; libraries would have fought the design.
- **pdf-lib + standard Helvetica** for PDFs: vector output at any size. Gotham is the UniPop typeface but
  cannot be embedded without a licensed font file; the UI uses Gotham when installed, else Montserrat.
- **Hash routes as bare tokens** (`#annee`, `#taches`) so deep links also work inside the claude.ai viewer.
