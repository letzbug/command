-- UniPop COMMAND — initial schema (PLANNED, not yet deployed).
-- Mirrors src/domain/types.ts. Nested structures stay JSONB to keep the
-- model identical to the local adapter. Designed for the Supabase Free plan:
-- few tables, no triggers on hot paths, realtime only on events and tasks.

create table public.team_members (
  id text primary key,
  code text not null unique,
  label text not null default '',
  kind text not null default 'personne' check (kind in ('personne', 'equipe')),
  role text not null default 'collaborateur' check (role in ('administrateur', 'coordinateur', 'collaborateur', 'lecture_seule')),
  color text not null default '#5B6B86',
  active boolean not null default true,
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Links a Supabase Auth user to a team identifier. Roles come from here, never from the browser.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  member_id text not null references public.team_members (id) on delete restrict
);

create table public.events (
  id text primary key,
  kind text not null check (kind in ('evenement', 'projet')),
  title text not null,
  description text not null default '',
  category text not null default 'autre',
  location text not null default '',
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  organizer text not null default '',
  owner_id text references public.team_members (id) on delete set null,
  priority text not null default 'normale',
  status text not null default 'planifie',
  notes text not null default '',
  attachments jsonb not null default '[]',
  recurrence jsonb,
  exceptions jsonb not null default '{}',
  series_id text,
  template_id text,
  archived boolean not null default false,
  history jsonb not null default '[]',
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index events_dates_idx on public.events (start_date, end_date);

create table public.tasks (
  id text primary key,
  title text not null,
  description text not null default '',
  event_id text references public.events (id) on delete set null,
  occurrence_key date,
  assignee_id text references public.team_members (id) on delete set null,
  start_date date,
  due_date date,
  priority text not null default 'normale',
  status text not null default 'a_faire' check (status in ('a_faire', 'en_cours', 'en_attente', 'termine')),
  progress smallint not null default 0 check (progress between 0 and 100),
  depends_on text[] not null default '{}',
  checklist jsonb not null default '[]',
  comments jsonb not null default '[]',
  attachments jsonb not null default '[]',
  notes text not null default '',
  milestone boolean not null default false,
  offset_days integer,
  manual_dates boolean not null default false,
  completed_at timestamptz,
  history jsonb not null default '[]',
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date)
);
create index tasks_due_idx on public.tasks (due_date) where status <> 'termine';
create index tasks_event_idx on public.tasks (event_id);

create table public.reminder_states (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  acknowledged_at timestamptz,
  snoozed_until date,
  primary key (user_id, id)
);

create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Role helper (security definer, fixed search_path).
create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select m.role from public.profiles p join public.team_members m on m.id = p.member_id
  where p.user_id = auth.uid() and m.active
$$;
revoke all on function public.current_role_name() from public;
grant execute on function public.current_role_name() to authenticated;

alter table public.team_members enable row level security;
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.tasks enable row level security;
alter table public.reminder_states enable row level security;
alter table public.app_settings enable row level security;

-- Read: any active member. Write: per role (same matrix as src/domain/reference.ts).
create policy members_read on public.team_members for select to authenticated using (public.current_role_name() is not null);
create policy members_write on public.team_members for all to authenticated using (public.current_role_name() = 'administrateur') with check (public.current_role_name() = 'administrateur');
create policy profiles_self on public.profiles for select to authenticated using (user_id = auth.uid() or public.current_role_name() = 'administrateur');
create policy profiles_admin on public.profiles for all to authenticated using (public.current_role_name() = 'administrateur') with check (public.current_role_name() = 'administrateur');
create policy events_read on public.events for select to authenticated using (public.current_role_name() is not null);
create policy events_insert on public.events for insert to authenticated with check (public.current_role_name() in ('administrateur', 'coordinateur'));
create policy events_update on public.events for update to authenticated using (public.current_role_name() in ('administrateur', 'coordinateur')) with check (public.current_role_name() in ('administrateur', 'coordinateur'));
create policy events_delete on public.events for delete to authenticated using (public.current_role_name() in ('administrateur', 'coordinateur'));
create policy tasks_read on public.tasks for select to authenticated using (public.current_role_name() is not null);
create policy tasks_insert on public.tasks for insert to authenticated with check (public.current_role_name() in ('administrateur', 'coordinateur', 'collaborateur'));
create policy tasks_update on public.tasks for update to authenticated using (public.current_role_name() in ('administrateur', 'coordinateur', 'collaborateur')) with check (public.current_role_name() in ('administrateur', 'coordinateur', 'collaborateur'));
create policy tasks_delete on public.tasks for delete to authenticated using (public.current_role_name() in ('administrateur', 'coordinateur'));
create policy reminders_own on public.reminder_states for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy settings_read on public.app_settings for select to authenticated using (public.current_role_name() is not null);
create policy settings_write on public.app_settings for all to authenticated using (public.current_role_name() = 'administrateur') with check (public.current_role_name() = 'administrateur');

-- Minimum grants: nothing for anon; RLS decides for authenticated.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.team_members, public.events, public.tasks, public.reminder_states, public.app_settings to authenticated;
grant select on public.profiles to authenticated;

-- Realtime only where collaboration needs it (keeps Free-plan usage low).
alter publication supabase_realtime add table public.events, public.tasks;
