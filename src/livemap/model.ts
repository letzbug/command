import { addDays, eachDay, nowTimeHM, startOfWeek, todayISO } from '../domain/dates';
import { expandEvents } from '../domain/recurrence';
import { CATEGORY_LABEL } from '../domain/reference';
import type { Course, ISODate, PlanningEvent, TimeHM } from '../domain/types';
import { matchPlace, Place, PLACE_BY_ID } from './places';

/**
 * Live-map model. Pure functions only (no React, no storage, no network) so
 * the same rules run in the planning tool, on the public display and in tests.
 * All clock values are wall-clock times in Europe/Luxembourg.
 */
export type ActivityKind = 'cours' | 'evenement';
export type LiveStatus = 'a_venir' | 'en_cours' | 'termine' | 'journee' | 'indetermine' | 'annule';

export interface Activity {
  id: string;
  kind: ActivityKind;
  title: string;
  /** Theme for courses, type label for events (original planning labels). */
  label: string;
  /** The day this occurrence is shown on. */
  date: ISODate;
  /** Full span for multi-day events. */
  startDate: ISODate;
  endDate: ISODate;
  start: TimeHM | null;
  end: TimeHM | null;
  locality: string;
  location: string;
  room: string | null;
  placeId: string | null;
  remote: boolean;
  cancelled: boolean;
  estimated: boolean;
  code?: string | null;
}

export interface LuxNow { date: ISODate; time: TimeHM }

/** Current date and time in Europe/Luxembourg (DST-aware, independent of the device timezone). */
export function luxNow(at: Date = new Date()): LuxNow {
  return { date: todayISO(at), time: nowTimeHM(at) };
}

const key = (d: ISODate, t: TimeHM) => `${d}T${t}`;

/**
 * Status rules (documented in docs/LIVE_MAP.md):
 * - cancelled → annule (never shown as taking place)
 * - known start and end → a_venir / en_cours / termine from the clock
 * - start known, end missing → a_venir before the start, then "indetermine":
 *   no invented duration, so it is neither claimed running nor finished
 * - no time at all → "journee" on that day (all-day) for events,
 *   "indetermine" for courses (schedule not communicated)
 * - other days → a_venir (future) or termine (past)
 */
export function statusAt(a: Activity, now: LuxNow): LiveStatus {
  if (a.cancelled) return 'annule';
  if (now.date > a.endDate) return 'termine';
  if (now.date < a.startDate) return 'a_venir';
  if (!a.start) {
    if (a.kind === 'evenement') return 'journee';
    return now.date === a.date ? 'indetermine' : now.date > a.date ? 'termine' : 'a_venir';
  }
  const nowK = key(now.date, now.time);
  const startK = key(a.startDate, a.start);
  if (nowK < startK) return 'a_venir';
  if (a.end) return nowK >= key(a.endDate, a.end) ? 'termine' : 'en_cours';
  return now.date < a.endDate ? 'en_cours' : 'indetermine';
}

/* ---------------- Adapters ---------------- */

export function courseActivities(courses: Course[], from: ISODate, to: ISODate, overrides: Record<string, string>): Activity[] {
  const out: Activity[] = [];
  for (const c of courses) {
    if (c.endDate < from || c.startDate > to) continue;
    const m = matchPlace(c.locality, c.location, overrides);
    c.sessions.forEach((s, i) => {
      if (s.date < from || s.date > to) return;
      out.push({
        id: `c:${c.id}:${s.date}:${s.start ?? i}`, kind: 'cours', title: c.title, label: c.theme, date: s.date, startDate: s.date, endDate: s.date,
        start: s.start ?? null, end: s.end ?? null, locality: c.locality, location: c.location, room: c.room ?? null,
        placeId: m.placeId, remote: m.remote || c.format === 'À distance', cancelled: false, estimated: s.estimated, code: c.code,
      });
    });
  }
  return out;
}

export interface EventLike {
  id: string; title: string; type: string; startDate: ISODate; endDate: ISODate; startTime: TimeHM | null; endTime: TimeHM | null;
  location: string; placeId?: string | null; cancelled: boolean;
}

/** Planning events → event-like records. Projects are planning objects, not happenings: excluded. */
export function planningEventsToEventLike(events: PlanningEvent[], from: ISODate, to: ISODate): EventLike[] {
  return expandEvents(events.filter((e) => e.kind === 'evenement'), from, to).map((o) => ({
    id: `${o.event.id}:${o.key}`, title: o.title, type: CATEGORY_LABEL[o.event.category] ?? 'Événement',
    startDate: o.startDate, endDate: o.endDate, startTime: o.startTime ?? null, endTime: o.endTime ?? null,
    location: o.location, cancelled: o.event.status === 'annule',
  }));
}

/** One activity per day of the event's span (multi-day events appear on every day). */
export function eventActivities(events: EventLike[], from: ISODate, to: ISODate, overrides: Record<string, string>): Activity[] {
  const out: Activity[] = [];
  for (const e of events) {
    if (e.endDate < from || e.startDate > to) continue;
    const m = e.placeId && PLACE_BY_ID.has(e.placeId) ? { placeId: e.placeId, remote: false } : matchPlace('', e.location, overrides);
    for (const d of eachDay(e.startDate < from ? from : e.startDate, e.endDate > to ? to : e.endDate)) {
      out.push({
        id: `e:${e.id}:${d}`, kind: 'evenement', title: e.title, label: e.type, date: d, startDate: e.startDate, endDate: e.endDate,
        start: e.startTime, end: e.endTime, locality: '', location: e.location, room: null,
        placeId: m.placeId, remote: m.remote, cancelled: e.cancelled, estimated: false,
      });
    }
  }
  return out;
}

/* ---------------- Views ---------------- */

export type ViewMode = 'live' | 'jour' | 'semaine';

export interface StatusedActivity extends Activity { status: LiveStatus }

export interface Counts { total: number; enCours: number; aVenir: number; aConfirmer: number; journee: number; termine: number; annule: number }

export interface PlaceGroup {
  place: Place;
  items: StatusedActivity[];
  courses: Counts;
  events: Counts;
  live: boolean;
  nextStart: TimeHM | null;
}

const emptyCounts = (): Counts => ({ total: 0, enCours: 0, aVenir: 0, aConfirmer: 0, journee: 0, termine: 0, annule: 0 });

/**
 * live:  only what is still relevant today (ended activities disappear);
 *        the headline counts running + upcoming + not-yet-determinable items.
 * jour:  full day overview for any date (past days are not emptied).
 * semaine: everything of the week, no live status.
 */
export function visibleActivities(all: Activity[], mode: ViewMode, day: ISODate, now: LuxNow): StatusedActivity[] {
  const from = mode === 'semaine' ? startOfWeek(day) : day;
  const to = mode === 'semaine' ? addDays(startOfWeek(day), 6) : day;
  return all
    .filter((a) => a.date >= from && a.date <= to)
    .map((a) => ({ ...a, status: mode === 'semaine' ? (a.cancelled ? 'annule' : 'a_venir') as LiveStatus : statusAt(a, now) }))
    // live: ended activities disappear, cancelled ones too once their time slot is over
    .filter((a) => mode !== 'live' || (a.status !== 'termine' && !(a.status === 'annule' && statusAt({ ...a, cancelled: false }, now) === 'termine')))
    .sort((x, y) => x.date.localeCompare(y.date) || (x.start ?? '99').localeCompare(y.start ?? '99') || x.title.localeCompare(y.title, 'fr'));
}

const relevant = (s: LiveStatus) => s === 'en_cours' || s === 'a_venir' || s === 'indetermine' || s === 'journee';

export function groupByPlace(items: StatusedActivity[], mode: ViewMode): PlaceGroup[] {
  const map = new Map<string, PlaceGroup>();
  for (const a of items) {
    if (!a.placeId || a.remote) continue;
    const place = PLACE_BY_ID.get(a.placeId);
    if (!place) continue;
    let g = map.get(place.id);
    if (!g) map.set(place.id, (g = { place, items: [], courses: emptyCounts(), events: emptyCounts(), live: false, nextStart: null }));
    g.items.push(a);
    const c = a.kind === 'cours' ? g.courses : g.events;
    if (a.status === 'annule') { c.annule++; continue; }
    if (a.status === 'termine') c.termine++;
    if (a.status === 'en_cours') c.enCours++;
    if (a.status === 'a_venir') c.aVenir++;
    if (a.status === 'indetermine') c.aConfirmer++;
    if (a.status === 'journee') c.journee++;
    // live: relevant only; jour/semaine: every non-cancelled activity of the period
    if (mode !== 'live' || relevant(a.status)) c.total++;
    if (a.status === 'a_venir' && a.start && (!g.nextStart || a.start < g.nextStart) && a.date === a.startDate) g.nextStart = a.start;
  }
  for (const g of map.values()) g.live = g.courses.enCours + g.events.enCours + g.events.journee > 0;
  return [...map.values()]
    .filter((g) => g.courses.total + g.events.total > 0 || g.courses.annule + g.events.annule > 0)
    .sort((a, b) => (b.courses.total + b.events.total) - (a.courses.total + a.events.total) || a.place.name.localeCompare(b.place.name, 'fr'));
}

export interface Summary {
  coursEnCours: number;
  coursAVenir: number;
  evenementsActifs: number;
  evenementsAVenir: number;
  lieuxActifs: number;
  aDistance: number;
  nonLocalises: number;
  prochain: { time: TimeHM; title: string; place: string } | null;
}

export function summarize(items: StatusedActivity[], groups: PlaceGroup[]): Summary {
  const s: Summary = { coursEnCours: 0, coursAVenir: 0, evenementsActifs: 0, evenementsAVenir: 0, lieuxActifs: groups.filter((g) => g.courses.total + g.events.total > 0).length, aDistance: 0, nonLocalises: 0, prochain: null };
  for (const a of items) {
    if (a.status === 'annule' || a.status === 'termine') continue;
    if (a.remote) { if (a.kind === 'cours') s.aDistance++; continue; }
    if (!a.placeId) { s.nonLocalises++; continue; }
    if (a.kind === 'cours') { if (a.status === 'en_cours') s.coursEnCours++; else if (a.status === 'a_venir') s.coursAVenir++; }
    else if (a.status === 'en_cours' || a.status === 'journee') s.evenementsActifs++;
    else if (a.status === 'a_venir') s.evenementsAVenir++;
    if (a.status === 'a_venir' && a.start && a.date === a.startDate && (!s.prochain || a.start < s.prochain.time)) {
      s.prochain = { time: a.start, title: a.title, place: PLACE_BY_ID.get(a.placeId)?.name ?? '' };
    }
  }
  return s;
}

/** Unplaceable locations (never drawn): raw text + count, for manual assignment. */
export function unresolvedLocations(items: Activity[]): { locality: string; location: string; count: number }[] {
  const m = new Map<string, { locality: string; location: string; count: number }>();
  for (const a of items) {
    if (a.placeId || a.remote) continue;
    const k = `${a.locality}|${a.location}`;
    const e = m.get(k);
    if (e) e.count++; else m.set(k, { locality: a.locality, location: a.location, count: 1 });
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

export interface RibbonSlot { from: TimeHM; count: number; past: boolean }

/** "Le fil de la journée": courses running per half hour, 06:00–23:00, from real session times. */
export function dayRibbon(all: Activity[], day: ISODate, now: LuxNow): RibbonSlot[] {
  const slots: RibbonSlot[] = [];
  const sessions = all.filter((a) => a.date === day && a.kind === 'cours' && !a.cancelled && a.start && a.end && !a.remote);
  for (let m = 6 * 60; m < 23 * 60; m += 30) {
    const from = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const to = `${String(Math.floor((m + 30) / 60)).padStart(2, '0')}:${String((m + 30) % 60).padStart(2, '0')}`;
    const count = sessions.filter((a) => a.start! < to && a.end! > from).length;
    slots.push({ from, count, past: day < now.date || (day === now.date && to <= now.time) });
  }
  return slots;
}

export function liveModeFor(day: ISODate, now: LuxNow, preferLive: boolean): ViewMode {
  return day === now.date && preferLive ? 'live' : 'jour';
}
