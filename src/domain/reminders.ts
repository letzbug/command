import { addDays, diffDays, formatDate } from './dates';
import { isDone } from './planning';
import { expandEvent } from './recurrence';
import type { ISODate, PlanningEvent, ReminderState, Task } from './types';

export type ReminderType = 'retard' | 'echeance' | 'jalon' | 'preparation' | 'recurrent' | 'non_assignee';
export type Severity = 'critique' | 'haute' | 'moyenne' | 'info';

export const REMINDER_TYPE_LABEL: Record<ReminderType, string> = {
  retard: 'En retard',
  echeance: 'Échéances',
  jalon: 'Jalons',
  preparation: 'Préparation',
  recurrent: 'Récurrents',
  non_assignee: 'Non assignées',
};
export const SEVERITY_RANK: Record<Severity, number> = { critique: 0, haute: 1, moyenne: 2, info: 3 };
export const DEFAULT_THRESHOLDS = [30, 14, 7, 3, 1, 0];

export interface Reminder {
  /** Stable id: acknowledging "J-7" does not hide the later "J-3" reminder. */
  id: string;
  type: ReminderType;
  severity: Severity;
  title: string;
  detail: string;
  date: ISODate;
  daysLeft: number;
  level: string;
  taskId?: string;
  eventId?: string;
  occurrenceKey?: ISODate;
  assigneeId?: string | null;
  acknowledged: boolean;
  snoozed: boolean;
}

export interface ReminderInput {
  tasks: Task[];
  events: PlanningEvent[];
  thresholds: number[];
  today: ISODate;
  states: Record<string, ReminderState>;
}

export function normalizeThresholds(list: number[]): number[] {
  const clean = [...new Set(list.map((n) => Math.round(n)).filter((n) => Number.isFinite(n) && n >= 0 && n <= 365))];
  return clean.sort((a, b) => b - a);
}

/** Smallest configured threshold that the remaining days have crossed. */
export function thresholdLevel(daysLeft: number, thresholds: number[]): number | null {
  const crossed = normalizeThresholds(thresholds).filter((t) => daysLeft <= t);
  return crossed.length ? Math.min(...crossed) : null;
}

const levelLabel = (t: number) => (t === 0 ? 'Jour J' : `J-${t}`);

function severityFor(daysLeft: number): Severity {
  if (daysLeft < 0) return 'critique';
  if (daysLeft <= 1) return 'haute';
  if (daysLeft <= 7) return 'moyenne';
  return 'info';
}

export function computeReminders({ tasks, events, thresholds, today, states }: ReminderInput): Reminder[] {
  const th = normalizeThresholds(thresholds.length ? thresholds : DEFAULT_THRESHOLDS);
  const horizon = th[0] ?? 30;
  const out: Reminder[] = [];
  const eventsById = new Map(events.map((e) => [e.id, e]));

  const decorate = (r: Omit<Reminder, 'acknowledged' | 'snoozed'>): Reminder => {
    const st = states[r.id];
    return { ...r, acknowledged: !!st?.acknowledgedAt, snoozed: !!st?.snoozedUntil && st.snoozedUntil > today };
  };

  for (const t of tasks) {
    if (isDone(t)) continue;
    const ev = t.eventId ? eventsById.get(t.eventId) : undefined;
    if (ev?.archived || ev?.status === 'annule') continue;
    const context = ev ? ev.title : 'Tâche hors projet';
    if (t.dueDate) {
      const days = diffDays(t.dueDate, today);
      if (days < 0) {
        out.push(decorate({
          id: `retard:${t.id}:${t.dueDate}`, type: 'retard', severity: 'critique', title: t.title,
          detail: `${context} — échéance dépassée depuis ${-days} j (${formatDate(t.dueDate, 'medium')})`,
          date: t.dueDate, daysLeft: days, level: `${-days} j de retard`, taskId: t.id, eventId: t.eventId ?? undefined, assigneeId: t.assigneeId,
        }));
      } else {
        const lvl = thresholdLevel(days, th);
        if (lvl !== null) {
          out.push(decorate({
            id: `${t.milestone ? 'jalon' : 'echeance'}:${t.id}:${t.dueDate}:${lvl}`,
            type: t.milestone ? 'jalon' : 'echeance', severity: severityFor(days), title: t.title,
            detail: `${context} — ${days === 0 ? "échéance aujourd'hui" : `échéance le ${formatDate(t.dueDate, 'medium')}`}`,
            date: t.dueDate, daysLeft: days, level: levelLabel(lvl), taskId: t.id, eventId: t.eventId ?? undefined, assigneeId: t.assigneeId,
          }));
        }
      }
    }
    if (!t.assigneeId) {
      const days = t.dueDate ? diffDays(t.dueDate, today) : 999;
      out.push(decorate({
        id: `non_assignee:${t.id}`, type: 'non_assignee', severity: days <= 7 ? 'moyenne' : 'info', title: t.title,
        detail: `${context} — aucun responsable désigné`, date: t.dueDate ?? today, daysLeft: days, level: 'À assigner',
        taskId: t.id, eventId: t.eventId ?? undefined, assigneeId: null,
      }));
    }
  }

  const windowEnd = addDays(today, horizon);
  for (const ev of events) {
    if (ev.archived || ev.status === 'annule' || ev.status === 'termine') continue;
    for (const occ of expandEvent(ev, today, windowEnd)) {
      if (occ.startDate < today) continue;
      const days = diffDays(occ.startDate, today);
      const lvl = thresholdLevel(days, th);
      if (lvl === null) continue;
      const open = tasks.filter((t) => t.eventId === ev.id && !isDone(t)).length;
      const base = { date: occ.startDate, daysLeft: days, level: levelLabel(lvl), eventId: ev.id, occurrenceKey: occ.key, assigneeId: ev.ownerId };
      if (open > 0) {
        out.push(decorate({
          ...base, id: `preparation:${ev.id}:${occ.key}:${lvl}`, type: 'preparation', severity: severityFor(days), title: occ.title,
          detail: `${open} tâche${open > 1 ? 's' : ''} de préparation ouverte${open > 1 ? 's' : ''} — le ${formatDate(occ.startDate, 'medium')}`,
        }));
      } else if (ev.recurrence) {
        out.push(decorate({
          ...base, id: `recurrent:${ev.id}:${occ.key}:${lvl}`, type: 'recurrent', severity: days <= 3 ? 'moyenne' : 'info', title: occ.title,
          detail: `Occurrence récurrente le ${formatDate(occ.startDate, 'medium')}`,
        }));
      } else if (ev.priority === 'haute' || ev.priority === 'critique') {
        out.push(decorate({
          ...base, id: `preparation:${ev.id}:${occ.key}:${lvl}`, type: 'preparation', severity: severityFor(days), title: occ.title,
          detail: `Événement prioritaire sans tâche de préparation — le ${formatDate(occ.startDate, 'medium')}`,
        }));
      }
    }
  }

  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** Visible = not acknowledged and not snoozed. */
export const activeReminders = (list: Reminder[]) => list.filter((r) => !r.acknowledged && !r.snoozed);
