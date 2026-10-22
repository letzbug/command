import type { PlanningEvent, Task } from '../../domain/types';
import type { DataStore } from '../contracts';

/**
 * PLANNED adapter — not wired into the app. It documents the row mapping for
 * supabase/migrations/0001_init.sql so the Supabase implementation of
 * DataStore can be written without touching UI or domain code.
 * Requires @supabase/supabase-js and an anon key (never a service-role key).
 */
export interface EventRow {
  id: string; kind: string; title: string; description: string; category: string; location: string;
  start_date: string; end_date: string; start_time: string | null; end_time: string | null; organizer: string;
  owner_id: string | null; priority: string; status: string; notes: string; attachments: unknown; recurrence: unknown;
  exceptions: unknown; series_id: string | null; template_id: string | null; archived: boolean; history: unknown;
  rev: number; created_at: string; updated_at: string;
}

export function eventToRow(e: PlanningEvent): EventRow {
  return {
    id: e.id, kind: e.kind, title: e.title, description: e.description, category: e.category, location: e.location,
    start_date: e.startDate, end_date: e.endDate, start_time: e.startTime ?? null, end_time: e.endTime ?? null, organizer: e.organizer,
    owner_id: e.ownerId ?? null, priority: e.priority, status: e.status, notes: e.notes, attachments: e.attachments, recurrence: e.recurrence ?? null,
    exceptions: e.exceptions, series_id: e.seriesId ?? null, template_id: e.templateId ?? null, archived: e.archived, history: e.history,
    rev: e.rev, created_at: e.createdAt, updated_at: e.updatedAt,
  };
}

export function taskToRow(t: Task) {
  return {
    id: t.id, title: t.title, description: t.description, event_id: t.eventId ?? null, occurrence_key: t.occurrenceKey ?? null,
    assignee_id: t.assigneeId ?? null, start_date: t.startDate ?? null, due_date: t.dueDate ?? null, priority: t.priority, status: t.status,
    progress: t.progress, depends_on: t.dependsOn, checklist: t.checklist, comments: t.comments, attachments: t.attachments, notes: t.notes,
    milestone: t.milestone, offset_days: t.offsetDays ?? null, manual_dates: t.manualDates, completed_at: t.completedAt ?? null,
    history: t.history, rev: t.rev, created_at: t.createdAt, updated_at: t.updatedAt,
  };
}

export function createSupabaseStore(): DataStore {
  throw new Error('Adaptateur Supabase non configuré : voir docs/SUPABASE.md. L’application fonctionne en mode local.');
}
