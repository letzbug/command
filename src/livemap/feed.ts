import { addDays, isValidISODate, isValidTime } from '../domain/dates';
import type { ISODate, PlanningEvent } from '../domain/types';
import { EventLike, planningEventsToEventLike } from './model';
import { matchPlace, PLACE_BY_ID } from './places';

/**
 * Public, read-only publication structure for the display page.
 * Only events explicitly marked "publier sur la carte" are exported, with a
 * fixed whitelist of fields. No ids from the planning database, no notes,
 * descriptions, owners, tasks, team codes or settings ever leave the tool.
 */
export const FEED_FORMAT = 'unipop-live-map-public';
export const FEED_VERSION = 1;
export const FEED_WINDOW_DAYS = 120;

export interface PublicEvent {
  id: string;
  title: string;
  type: string;
  startDate: ISODate;
  endDate: ISODate;
  startTime: string | null;
  endTime: string | null;
  place: string;
  placeId: string | null;
  cancelled: boolean;
}

export interface PublicFeed {
  format: typeof FEED_FORMAT;
  version: number;
  generatedAt: string;
  events: PublicEvent[];
  placeOverrides: Record<string, string>;
}

/** Short opaque id: never the internal record id. */
function publicId(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `p${(h >>> 0).toString(36)}`;
}

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '');

export function buildPublicFeed(events: PlanningEvent[], publicIds: string[], overrides: Record<string, string>, today: ISODate, generatedAt = new Date().toISOString()): PublicFeed {
  const allowed = new Set(publicIds);
  const chosen = events.filter((e) => allowed.has(e.id) && !e.archived && e.kind === 'evenement');
  const occ: EventLike[] = planningEventsToEventLike(chosen, addDays(today, -1), addDays(today, FEED_WINDOW_DAYS));
  const out: PublicEvent[] = occ.map((o) => {
    const m = matchPlace('', o.location, overrides);
    return {
      id: publicId(o.id), title: clip(o.title, 120), type: clip(o.type, 60), startDate: o.startDate, endDate: o.endDate,
      startTime: o.startTime ?? null, endTime: o.endTime ?? null, place: clip(o.location, 120), placeId: m.placeId, cancelled: o.cancelled,
    };
  });
  // Only overrides that point to known places; values are place ids, keys are normalised venue text.
  const placeOverrides: Record<string, string> = {};
  for (const [k, v] of Object.entries(overrides)) if (v === 'ignore' || PLACE_BY_ID.has(v)) placeOverrides[k.slice(0, 200)] = v;
  return { format: FEED_FORMAT, version: FEED_VERSION, generatedAt, events: out, placeOverrides };
}

/** Strict parser for the display: unknown fields are dropped, invalid records skipped. */
export function parsePublicFeed(raw: unknown): PublicFeed | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<PublicFeed>;
  if (r.format !== FEED_FORMAT || typeof r.version !== 'number' || r.version > FEED_VERSION) return null;
  const events: PublicEvent[] = [];
  for (const e of Array.isArray(r.events) ? r.events.slice(0, 2000) : []) {
    if (!e || typeof e !== 'object') continue;
    const x = e as Partial<PublicEvent>;
    if (!isValidISODate(x.startDate) || !isValidISODate(x.endDate) || x.endDate < x.startDate) continue;
    events.push({
      id: clip(x.id, 40) || 'p', title: clip(x.title, 120), type: clip(x.type, 60) || 'Événement',
      startDate: x.startDate, endDate: x.endDate,
      startTime: isValidTime(x.startTime) ? x.startTime : null, endTime: isValidTime(x.endTime) ? x.endTime : null,
      place: clip(x.place, 120), placeId: typeof x.placeId === 'string' && PLACE_BY_ID.has(x.placeId) ? x.placeId : null, cancelled: x.cancelled === true,
    });
  }
  const placeOverrides: Record<string, string> = {};
  if (r.placeOverrides && typeof r.placeOverrides === 'object') {
    for (const [k, v] of Object.entries(r.placeOverrides)) if (typeof v === 'string' && (v === 'ignore' || PLACE_BY_ID.has(v))) placeOverrides[clip(k, 200)] = v;
  }
  return { format: FEED_FORMAT, version: r.version, generatedAt: clip(r.generatedAt, 40), events, placeOverrides };
}

export const feedToEventLike = (f: PublicFeed): EventLike[] => f.events.map((e) => ({
  id: e.id, title: e.title, type: e.type, startDate: e.startDate, endDate: e.endDate, startTime: e.startTime, endTime: e.endTime,
  location: e.place, placeId: e.placeId, cancelled: e.cancelled,
}));
