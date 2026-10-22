# Supabase integration guide (planned)

Nothing in the app requires Supabase today. This guide describes how Cameron can add the shared backend.

## 1. Schema

Apply `supabase/migrations/0001_init.sql` to a new project (Free plan is sufficient for a small team).
It creates `team_members`, `profiles` (auth user → team identifier), `events`, `tasks`,
`reminder_states`, `app_settings`, with Row Level Security enabled on every table.

- Read: any authenticated user linked to an active team member.
- Write: by role, mirroring `ROLE_PERMISSIONS` in `src/domain/reference.ts`.
- `anon` has no access. Only the **anon key** goes into the frontend; the service-role key stays in
  server code (e.g. a Worker) and is never committed.

## 2. Adapter

Implement `DataStore` (`src/data/contracts.ts`) in `src/data/supabase/` using `@supabase/supabase-js`.
Row mappers are already in `plannedSupabaseStore.ts`. Then select the adapter in `src/main.tsx` when
`VITE_DATA_BACKEND=supabase`.

- `list()` → `select('*')` once at startup (the dataset is small).
- `upsert()` → `upsert(rows)`; for concurrency use `update … eq('id', id).eq('rev', previousRev)` and treat
  0 updated rows as a conflict (reload the record and show it to the user rather than overwriting).
- `replaceAll()` → an RPC or an admin-only Edge Function; never expose bulk delete to normal roles.

## 3. Realtime

Subscribe to `events` and `tasks` changes (already added to the `supabase_realtime` publication) and
merge them into `AppStore` state. Avoid polling; Free-plan quotas are generous for this volume.

## 4. Auth

Supabase Auth (magic link or Microsoft SSO). After sign-in, read `profiles` to get the member id and role.
Remove the demo user switch from the UI when the backend is active; the role then comes from the
database, and RLS is the real enforcement.

## 5. Storage

Attachments are links today. Supabase Storage can host files later: one private bucket with RLS that
mirrors `events` permissions.
