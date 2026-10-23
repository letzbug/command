import { useMemo } from 'react';
import { eachDay, maxDate, minDate } from '../domain/dates';
import { isDone, isOverdue } from '../domain/planning';
import { expandEvents, Occurrence } from '../domain/recurrence';
import { luxembourgHolidays, schoolBreakOn } from '../domain/reference';
import { computeReminders } from '../domain/reminders';
import { normalize } from '../domain/search';
import type { ISODate, PlanningEvent, Task, TeamMember } from '../domain/types';
import { buildCourseIndex, SessionRef } from '../integrations/courses/unipopAdapter';
import type { CalFilters } from '../ui/uiStore';
import { useAppState } from './store';

export function useLookups() {
  const team = useAppState((s) => s.team);
  const events = useAppState((s) => s.events);
  const tasks = useAppState((s) => s.tasks);
  return useMemo(() => {
    const memberById = new Map<string, TeamMember>(team.map((m) => [m.id, m]));
    const eventById = new Map<string, PlanningEvent>(events.map((e) => [e.id, e]));
    const taskById = new Map<string, Task>(tasks.map((t) => [t.id, t]));
    const tasksByEvent = new Map<string, Task[]>();
    for (const t of tasks) if (t.eventId) {
      const a = tasksByEvent.get(t.eventId);
      if (a) a.push(t); else tasksByEvent.set(t.eventId, [t]);
    }
    const sortedTeam = [...team].sort((a, b) => a.code.localeCompare(b.code));
    return { memberById, eventById, taskById, tasksByEvent, team: sortedTeam, activeTeam: sortedTeam.filter((m) => m.active) };
  }, [team, events, tasks]);
}

export function useCourseIndex() {
  const snap = useAppState((s) => s.courseSnapshot);
  return useMemo(() => buildCourseIndex(snap?.courses ?? []), [snap]);
}

export function useReminders() {
  const tasks = useAppState((s) => s.tasks);
  const events = useAppState((s) => s.events);
  const settings = useAppState((s) => s.settings);
  const today = useAppState((s) => s.today);
  const states = useAppState((s) => s.reminderStates);
  return useMemo(
    () => computeReminders({ tasks, events, thresholds: settings.reminderThresholds, today, states }),
    [tasks, events, settings.reminderThresholds, today, states],
  );
}

export function useKnownLocations(): string[] {
  const events = useAppState((s) => s.events);
  const idx = useCourseIndex();
  return useMemo(() => {
    const set = new Set<string>(idx.locations);
    for (const e of events) if (e.location) set.add(e.location);
    return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [events, idx]);
}

export interface CalendarData {
  occurrences: Occurrence[];
  occByDate: Map<ISODate, Occurrence[]>;
  dueByDate: Map<ISODate, Task[]>;
  coursesByDate: Map<ISODate, SessionRef[]>;
  holidays: Map<ISODate, string>;
  schoolBreaks: Map<ISODate, string>;
  courseMax: number;
}

/** Filtered view of events, deadlines, courses and holidays for a date range. */
export function useCalendarData(from: ISODate, to: ISODate, f: CalFilters): CalendarData {
  const events = useAppState((s) => s.events);
  const tasks = useAppState((s) => s.tasks);
  const today = useAppState((s) => s.today);
  const showHolidays = useAppState((s) => s.settings.showHolidays);
  const idx = useCourseIndex();
  return useMemo(() => {
    const loc = normalize(f.location);
    const has = (k: CalFilters['layers'][number]) => f.layers.includes(k);
    const overdueEvents = new Set(tasks.filter((t) => isOverdue(t, today) && t.eventId).map((t) => t.eventId as string));

    const evFiltered = events.filter((e) => {
      if (!has(e.kind === 'projet' ? 'projet' : 'evenement')) return false;
      if (f.eventId && e.id !== f.eventId) return false;
      if (f.ownerId && e.ownerId !== f.ownerId) return false;
      if (loc && !normalize(e.location).includes(loc)) return false;
      if (f.status === 'ouvert' && (e.status === 'termine' || e.status === 'annule')) return false;
      if (f.status === 'termine' && e.status !== 'termine') return false;
      if (f.status === 'en_retard' && !overdueEvents.has(e.id)) return false;
      return true;
    });
    const occurrences = expandEvents(evFiltered, from, to);
    const occByDate = new Map<ISODate, Occurrence[]>();
    for (const o of occurrences) {
      for (const d of eachDay(maxDate(o.startDate, from), minDate(o.endDate, to))) {
        const a = occByDate.get(d);
        if (a) a.push(o); else occByDate.set(d, [o]);
      }
    }

    const dueByDate = new Map<ISODate, Task[]>();
    if (!loc && !f.theme) {
      for (const t of tasks) {
        if (!t.dueDate || t.dueDate < from || t.dueDate > to) continue;
        if (!has(t.milestone ? 'jalon' : 'echeance')) continue;
        if (f.eventId && t.eventId !== f.eventId) continue;
        if (f.ownerId && t.assigneeId !== f.ownerId) continue;
        if (f.status === 'ouvert' && isDone(t)) continue;
        if (f.status === 'termine' && !isDone(t)) continue;
        if (f.status === 'en_retard' && !isOverdue(t, today)) continue;
        const a = dueByDate.get(t.dueDate);
        if (a) a.push(t); else dueByDate.set(t.dueDate, [t]);
      }
    }

    const coursesByDate = new Map<ISODate, SessionRef[]>();
    let courseMax = 1;
    if (has('formation') && !f.eventId && !f.ownerId && f.status !== 'en_retard') {
      for (const d of eachDay(from, to)) {
        let list = idx.byDate.get(d);
        if (!list) continue;
        if (f.theme) list = list.filter((r) => r.course.theme === f.theme);
        if (loc) list = list.filter((r) => normalize(r.course.locality).includes(loc) || normalize(r.course.location).includes(loc));
        if (list.length) {
          coursesByDate.set(d, list);
          courseMax = Math.max(courseMax, list.length);
        }
      }
    }

    const holidays = new Map<ISODate, string>();
    if (showHolidays && has('ferie')) {
      for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
        for (const h of luxembourgHolidays(y)) if (h.date >= from && h.date <= to) holidays.set(h.date, h.name);
      }
    }
    const schoolBreaks = new Map<ISODate, string>();
    for (const d of eachDay(from, to)) {
      const name = schoolBreakOn(d);
      if (name) schoolBreaks.set(d, name);
    }
    return { occurrences, occByDate, dueByDate, coursesByDate, holidays, schoolBreaks, courseMax };
  }, [events, tasks, today, showHolidays, idx, from, to, f]);
}

export function activeFilterCount(f: CalFilters): number {
  return (f.layers.length < 6 ? 1 : 0) + [f.location, f.theme, f.eventId, f.ownerId, f.status].filter(Boolean).length;
}
