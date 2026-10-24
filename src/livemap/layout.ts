import { PLACE_BY_ID, Place } from './places';
import type { Counts, PlaceGroup } from './model';

/**
 * Equirectangular projection centred on Luxembourg (distortion < 0.5 % at this
 * scale). ViewBox units: 1000 high, width from the true aspect ratio.
 */
export const BOUNDS = { lonMin: 5.69, lonMax: 6.57, latMin: 49.425, latMax: 50.2 };
const LAT0 = ((BOUNDS.latMin + BOUNDS.latMax) / 2) * (Math.PI / 180);
const KX = Math.cos(LAT0);
export const VIEW_H = 1000;
export const VIEW_W = Math.round((VIEW_H * (BOUNDS.lonMax - BOUNDS.lonMin) * KX) / (BOUNDS.latMax - BOUNDS.latMin));

export function project(lon: number, lat: number): [number, number] {
  return [((lon - BOUNDS.lonMin) * KX * VIEW_H) / (BOUNDS.latMax - BOUNDS.latMin), ((BOUNDS.latMax - lat) * VIEW_H) / (BOUNDS.latMax - BOUNDS.latMin)];
}

/** Kilometres per viewBox unit (for the scale bar). */
export const KM_PER_UNIT = ((BOUNDS.latMax - BOUNDS.latMin) * 111.2) / VIEW_H;

/** Height reserved under a bubble for its two-line label (viewBox units). */
const LABEL_H = 30;

export const bubbleRadius = (total: number) => 20 + 8.5 * Math.sqrt(Math.max(1, total));

export interface LaidOutBubble {
  group: PlaceGroup;
  x: number; y: number; r: number;
  ax: number; ay: number;
  displaced: boolean;
}

const sumCounts = (a: Counts, b: Counts): Counts => ({
  total: a.total + b.total, enCours: a.enCours + b.enCours, aVenir: a.aVenir + b.aVenir, aConfirmer: a.aConfirmer + b.aConfirmer,
  journee: a.journee + b.journee, termine: a.termine + b.termine, annule: a.annule + b.annule,
});

const size = (g: PlaceGroup) => Math.max(1, g.courses.total + g.events.total);

/** Quarters of the same city that would overlap are merged into the city (e.g. Clausen + Kirchberg → Luxembourg). */
export function mergeCityQuarters(groups: PlaceGroup[]): PlaceGroup[] {
  const byParent = new Map<string, PlaceGroup[]>();
  const rest: PlaceGroup[] = [];
  for (const g of groups) {
    if (g.place.kind === 'quartier' && g.place.parent) {
      const arr = byParent.get(g.place.parent) ?? [];
      arr.push(g);
      byParent.set(g.place.parent, arr);
    } else rest.push(g);
  }
  const out = [...rest];
  for (const [parentId, qs] of byParent) {
    const parent = PLACE_BY_ID.get(parentId) as Place;
    const city = out.find((g) => g.place.id === parentId);
    const overlaps = qs.length + (city ? 1 : 0) > 1;
    if (!overlaps) { out.push(...qs); continue; }
    const merged: PlaceGroup = city ?? { place: parent, items: [], courses: { total: 0, enCours: 0, aVenir: 0, aConfirmer: 0, journee: 0, termine: 0, annule: 0 }, events: { total: 0, enCours: 0, aVenir: 0, aConfirmer: 0, journee: 0, termine: 0, annule: 0 }, live: false, nextStart: null };
    for (const q of qs) {
      merged.items = [...merged.items, ...q.items].sort((a, b) => (a.start ?? '99').localeCompare(b.start ?? '99'));
      merged.courses = sumCounts(merged.courses, q.courses);
      merged.events = sumCounts(merged.events, q.events);
      merged.live = merged.live || q.live;
      if (q.nextStart && (!merged.nextStart || q.nextStart < merged.nextStart)) merged.nextStart = q.nextStart;
    }
    if (!city) out.push(merged);
  }
  return out;
}

/** Deterministic relaxation: bubbles never overlap; displaced bubbles keep a leader line to their true position. */
export function layoutBubbles(groups: PlaceGroup[], gap = 6): LaidOutBubble[] {
  const bs: LaidOutBubble[] = mergeCityQuarters(groups).map((group) => {
    const [ax, ay] = project(group.place.lon, group.place.lat);
    const extra = group.events.total > 0 && group.courses.total > 0 ? 10 : 0;
    return { group, ax, ay, x: ax, y: ay, r: bubbleRadius(size(group)) + extra, displaced: false };
  }).sort((a, b) => b.r - a.r || a.group.place.id.localeCompare(b.group.place.id));
  for (let it = 0; it < 120; it++) {
    let moved = false;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const min = a.r + b.r + gap + (d > 0.01 ? (LABEL_H * Math.abs(dy)) / d : LABEL_H);
        if (d >= min) continue;
        if (d < 0.01) { dx = 0.7071; dy = 0.7071; d = 1; }
        const push = (min - d) / 2;
        const ux = dx / d, uy = dy / d;
        const wa = b.r / (a.r + b.r), wb = a.r / (a.r + b.r);
        a.x -= ux * push * 2 * wa; a.y -= uy * push * 2 * wa;
        b.x += ux * push * 2 * wb; b.y += uy * push * 2 * wb;
        moved = true;
      }
    }
    for (const b of bs) {
      b.x += (b.ax - b.x) * 0.04; b.y += (b.ay - b.y) * 0.04;
      b.x = Math.min(VIEW_W - b.r - 4, Math.max(b.r + 4, b.x));
      b.y = Math.min(VIEW_H - b.r - 4, Math.max(b.r + 4, b.y));
    }
    if (!moved && it > 10) break;
  }
  // Final pass without the pull towards anchors: guarantees no overlap remains.
  for (let it = 0; it < 300; it++) {
    let moved = false;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const min = a.r + b.r + gap + (LABEL_H * Math.abs(dy)) / d;
        if (d >= min) continue;
        const push = (min - d) / 2 + 0.01;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push;
        b.x += (dx / d) * push; b.y += (dy / d) * push;
        moved = true;
      }
    }
    for (const b of bs) {
      b.x = Math.min(VIEW_W - b.r - 4, Math.max(b.r + 4, b.x));
      b.y = Math.min(VIEW_H - b.r - 4, Math.max(b.r + 4, b.y));
    }
    if (!moved) break;
  }
  for (const b of bs) b.displaced = Math.hypot(b.x - b.ax, b.y - b.ay) > b.r * 0.35;
  return bs;
}
