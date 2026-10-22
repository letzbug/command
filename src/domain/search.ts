import type { Course, PlanningEvent, Task } from './types';

export const normalize = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** All query words must appear; earlier and title matches rank higher. */
export function matchScore(query: string, fields: (string | null | undefined)[]): number {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const hay = fields.map(normalize);
  let score = 0;
  for (const w of words) {
    let best = -1;
    hay.forEach((h, i) => {
      const pos = h.indexOf(w);
      if (pos >= 0) best = Math.max(best, (hay.length - i) * 10 + (pos === 0 ? 5 : 0) + (h === w ? 10 : 0));
    });
    if (best < 0) return 0;
    score += best;
  }
  return score;
}

export interface SearchResults {
  events: PlanningEvent[];
  tasks: Task[];
  courses: Course[];
  themes: { theme: string; count: number }[];
  locations: { location: string; count: number }[];
}

export function searchAll(
  query: string,
  data: { events: PlanningEvent[]; tasks: Task[]; courses: Course[] },
  limit = 6,
): SearchResults {
  const q = query.trim();
  const empty: SearchResults = { events: [], tasks: [], courses: [], themes: [], locations: [] };
  if (q.length < 2) return empty;
  const rank = <T>(items: T[], fields: (x: T) => (string | null | undefined)[]) =>
    items.map((x) => ({ x, s: matchScore(q, fields(x)) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map((r) => r.x);

  const themeCount = new Map<string, number>();
  const locCount = new Map<string, number>();
  for (const c of data.courses) {
    if (matchScore(q, [c.theme, c.category]) > 0) themeCount.set(c.theme, (themeCount.get(c.theme) ?? 0) + 1);
    const loc = c.locality && c.location !== c.locality ? `${c.location}, ${c.locality}` : c.location;
    if (matchScore(q, [c.location, c.locality]) > 0) locCount.set(loc, (locCount.get(loc) ?? 0) + 1);
  }
  for (const e of data.events) {
    if (e.location && matchScore(q, [e.location]) > 0) locCount.set(e.location, (locCount.get(e.location) ?? 0) + 1);
  }
  return {
    events: rank(data.events.filter((e) => !e.archived), (e) => [e.title, e.location, e.organizer, e.description]),
    tasks: rank(data.tasks, (t) => [t.title, t.description, t.notes]),
    courses: rank(data.courses, (c) => [c.title, c.theme, c.code, c.location, c.locality, c.category]),
    themes: [...themeCount].map(([theme, count]) => ({ theme, count })).sort((a, b) => b.count - a.count).slice(0, limit),
    locations: [...locCount].map(([location, count]) => ({ location, count })).sort((a, b) => b.count - a.count).slice(0, limit),
  };
}
