import { addDays, daysInMonth, diffDays, formatDate, MONTHS_FR, parts, rangesOverlap, WEEKDAYS_FR, weekdayMon0, ymd } from './dates';
import type { ISODate, OccurrenceOverride, PlanningEvent, Recurrence, TimeHM } from './types';

export interface Occurrence {
  event: PlanningEvent;
  /** Original start date of this occurrence: the stable key for overrides. */
  key: ISODate;
  index: number;
  startDate: ISODate;
  endDate: ISODate;
  startTime?: TimeHM | null;
  endTime?: TimeHM | null;
  title: string;
  location: string;
  notes: string;
  recurring: boolean;
  modified: boolean;
}

const MAX_OCCURRENCES = 3000;

/**
 * nth occurrence start date. Monthly/yearly rules clamp to the end of the
 * month (31 Jan → 28/29 Feb; 29 Feb → 28 Feb in non-leap years) and always
 * compute from the series start, so clamping never drifts later occurrences.
 */
export function nthStart(start: ISODate, rec: Recurrence, n: number): ISODate {
  const interval = Math.max(1, Math.floor(rec.interval || 1));
  const [y, m, d] = parts(start);
  switch (rec.freq) {
    case 'daily': return addDays(start, n * interval);
    case 'weekly': return addDays(start, n * 7 * interval);
    case 'monthly': {
      const total = m - 1 + n * interval;
      const yy = y + Math.floor(total / 12);
      const mm = (total % 12) + 1;
      return ymd(yy, mm, Math.min(d, daysInMonth(yy, mm)));
    }
    case 'yearly': {
      const yy = y + n * interval;
      return ymd(yy, m, Math.min(d, daysInMonth(yy, m)));
    }
  }
}

function build(ev: PlanningEvent, key: ISODate, index: number, ov: OccurrenceOverride | undefined): Occurrence {
  const span = Math.max(0, diffDays(ev.endDate, ev.startDate));
  const startDate = ov?.startDate ?? key;
  const endDate = ov?.endDate ?? addDays(startDate, span);
  return {
    event: ev, key, index, startDate, endDate,
    startTime: ov?.startTime !== undefined ? ov.startTime : ev.startTime,
    endTime: ov?.endTime !== undefined ? ov.endTime : ev.endTime,
    title: ov?.title ?? ev.title,
    location: ov?.location ?? ev.location,
    notes: ov?.notes ?? ev.notes,
    recurring: !!ev.recurrence,
    modified: !!ov && Object.keys(ov).length > 0,
  };
}

/** All occurrences of an event in chronological order of their keys (cancelled ones skipped). */
export function* occurrences(ev: PlanningEvent): Generator<Occurrence> {
  const rec = ev.recurrence;
  if (!rec) {
    yield build(ev, ev.startDate, 0, undefined);
    return;
  }
  for (let n = 0; n < MAX_OCCURRENCES; n++) {
    if (rec.count && n >= rec.count) return;
    const key = nthStart(ev.startDate, rec, n);
    if (rec.until && key > rec.until) return;
    const ov = ev.exceptions?.[key];
    if (ov?.cancelled) continue;
    yield build(ev, key, n, ov);
  }
}

/** Occurrences overlapping [from, to]. Overrides can move an occurrence by up to ~1 year. */
export function expandEvent(ev: PlanningEvent, from: ISODate, to: ISODate): Occurrence[] {
  const out: Occurrence[] = [];
  const stopAfter = addDays(to, 400);
  for (const occ of occurrences(ev)) {
    if (occ.key > stopAfter) break;
    if (rangesOverlap(occ.startDate, occ.endDate, from, to)) out.push(occ);
  }
  return out;
}

export function expandEvents(events: PlanningEvent[], from: ISODate, to: ISODate): Occurrence[] {
  const out: Occurrence[] = [];
  for (const ev of events) if (!ev.archived) out.push(...expandEvent(ev, from, to));
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
}

/** First occurrence that ends on or after `from`. */
export function nextOccurrence(ev: PlanningEvent, from: ISODate): Occurrence | null {
  for (const occ of occurrences(ev)) {
    if (occ.endDate >= from) return occ;
  }
  return null;
}

export function findOccurrence(ev: PlanningEvent, key: ISODate): Occurrence | null {
  for (const occ of occurrences(ev)) {
    if (occ.key === key) return occ;
    if (occ.key > key) break;
  }
  return null;
}

/** Edit one occurrence only. Past and other occurrences are untouched. */
export function overrideOccurrence(ev: PlanningEvent, key: ISODate, patch: OccurrenceOverride): PlanningEvent {
  return { ...ev, exceptions: { ...ev.exceptions, [key]: { ...(ev.exceptions?.[key] ?? {}), ...patch } } };
}

export function cancelOccurrence(ev: PlanningEvent, key: ISODate): PlanningEvent {
  return overrideOccurrence(ev, key, { cancelled: true });
}

/**
 * "This and following occurrences": ends the original series the day before
 * `key` (history preserved) and returns a new series starting at `key`
 * carrying the patch. If `key` is the first occurrence, the whole series is
 * updated in place instead.
 */
export function splitSeries(
  ev: PlanningEvent,
  key: ISODate,
  patch: Partial<PlanningEvent>,
  newId: string,
  stamp: string,
): { original: PlanningEvent; created: PlanningEvent | null } {
  if (!ev.recurrence || key <= ev.startDate) {
    return { original: { ...ev, ...patch, id: ev.id }, created: null };
  }
  const before: Record<ISODate, OccurrenceOverride> = {};
  const after: Record<ISODate, OccurrenceOverride> = {};
  for (const [k, v] of Object.entries(ev.exceptions ?? {})) (k < key ? before : after)[k] = v;

  let countBefore = 0;
  for (const occ of occurrences({ ...ev, exceptions: {} })) {
    if (occ.key >= key) break;
    countBefore++;
  }
  const span = diffDays(ev.endDate, ev.startDate);
  const original: PlanningEvent = {
    ...ev,
    recurrence: { ...ev.recurrence, until: addDays(key, -1), count: ev.recurrence.count ? countBefore : null },
    exceptions: before,
  };
  const startDate = patch.startDate ?? key;
  const created: PlanningEvent = {
    ...ev,
    ...patch,
    id: newId,
    createdAt: stamp,
    updatedAt: stamp,
    rev: 1,
    startDate,
    endDate: patch.endDate ?? addDays(startDate, span),
    recurrence: {
      ...ev.recurrence,
      ...(patch.recurrence ?? {}),
      count: ev.recurrence.count ? Math.max(1, ev.recurrence.count - countBefore) : null,
    },
    exceptions: startDate === key ? after : {},
    seriesId: ev.seriesId ?? ev.id,
    history: [{ at: stamp, text: `Série scindée à partir du ${formatDate(key, 'medium')}` }],
  };
  return { original, created };
}

export function describeRecurrence(rec: Recurrence | null | undefined, start: ISODate): string {
  if (!rec) return 'Ponctuel';
  const n = Math.max(1, rec.interval || 1);
  const [, m, d] = parts(start);
  let txt: string;
  switch (rec.freq) {
    case 'yearly': txt = n === 1 ? `Chaque année, le ${d} ${MONTHS_FR[m - 1]}` : `Tous les ${n} ans, le ${d} ${MONTHS_FR[m - 1]}`; break;
    case 'monthly': txt = n === 1 ? `Chaque mois, le ${d}` : `Tous les ${n} mois, le ${d}`; break;
    case 'weekly': txt = n === 1 ? `Chaque semaine, le ${WEEKDAYS_FR[weekdayMon0(start)]}` : `Toutes les ${n} semaines, le ${WEEKDAYS_FR[weekdayMon0(start)]}`; break;
    case 'daily': txt = n === 1 ? 'Chaque jour' : `Tous les ${n} jours`; break;
  }
  if (rec.until) txt += `, jusqu'au ${formatDate(rec.until, 'medium')}`;
  else if (rec.count) txt += `, ${rec.count} fois`;
  return txt;
}
