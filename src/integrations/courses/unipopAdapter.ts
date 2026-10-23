import { addMinutes, eachDay, parseDurationFr, parseFrDate, weekdayMon0 } from '../../domain/dates';
import { normalize } from '../../domain/search';
import type { Course, CourseSession, ISODate } from '../../domain/types';

/**
 * Shape of https://www.unipop.lu/private/trainings.json as observed on
 * 2026-10-22 (top-level array). Every field is optional on purpose: the
 * adapter must survive missing or renamed fields without crashing.
 */
export interface RawUniPopCourse {
  id?: number | string;
  coursId?: string;
  coursCode?: string;
  intitule?: string;
  description?: string;
  categorieCode?: string;
  categorieCodeUnipop?: string;
  categorieNom?: string;
  matiereCode?: string;
  matiereNom?: string;
  dateDebut?: string; // DD/MM/YYYY
  dateFin?: string;
  horairePrevu?: string; // "Lundi à 19:00 (durée 2h)" | "Samedi 24-10-2026 à 10:20 (durée 1h40)"
  horaires?: { jour?: string; heure?: string; duree?: string }[];
  adresseCours?: { nom?: string; localite?: string; codePostal?: string; rueNumero?: string; salle?: string };
  enseignants?: { nom?: string; prenom?: string }[];
  nbInscrits?: number;
  nbPlaces?: number;
  format?: string; // PRESENTIEL | DISTANCE
  langueCoursNom?: string;
  niveau?: string;
  onlineRegistrationUrl?: string;
  organisateur?: { code?: string; nom?: string };
}

export const CATEGORY_LABELS: Record<string, string> = {
  ACP: 'Activité physique et bien-être',
  ART: 'Arts et artisanat',
  TIC: 'Technologies de l’information',
  LAN: 'Langues',
  SCM: 'Sciences naturelles et mathématiques',
  SCH: 'Sciences humaines et sociales',
  CIN: 'Accès à la nationalité',
};

const WEEKDAY_INDEX: Record<string, number> = {
  lundi: 0, mardi: 1, mercredi: 2, jeudi: 3, vendredi: 4, samedi: 5, dimanche: 6,
};
const MAX_SESSIONS_PER_COURSE = 400;

const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

function sentenceCase(s: string): string {
  const t = clean(s).toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

interface Slot { weekday: number; time: string | null; minutes: number | null; date?: ISODate }

/** Parses "Jour [DD-MM-YYYY] à HH:MM (durée XhYY)" fragments. */
export function parseSchedulePattern(text: string | undefined): Slot[] {
  if (!text) return [];
  const re = /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?:\s+(\d{2})-(\d{2})-(\d{4}))?\s+à\s+(\d{1,2}:\d{2})(?:\s*\(durée\s*([^)]+)\))?/gi;
  const out: Slot[] = [];
  for (const m of text.matchAll(re)) {
    const date = m[2] ? parseFrDate(`${m[2]}/${m[3]}/${m[4]}`) ?? undefined : undefined;
    out.push({
      weekday: WEEKDAY_INDEX[normalize(m[1])],
      time: m[5].padStart(5, '0'),
      minutes: parseDurationFr(m[6]),
      date,
    });
  }
  return out;
}

function slotsFrom(raw: RawUniPopCourse): Slot[] {
  const fromList = (raw.horaires ?? [])
    .map((h) => {
      const wd = WEEKDAY_INDEX[normalize(h.jour)];
      if (wd === undefined) return null;
      const time = /^\d{1,2}:\d{2}$/.test(clean(h.heure)) ? clean(h.heure).padStart(5, '0') : null;
      return { weekday: wd, time, minutes: parseDurationFr(h.duree) } as Slot;
    })
    .filter((s): s is Slot => !!s);
  const slots = fromList.length ? fromList : parseSchedulePattern(raw.horairePrevu);
  const seen = new Set<string>();
  return slots.filter((s) => {
    const k = `${s.weekday}|${s.time}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * The feed gives a date range plus a weekly pattern, not individual session
 * dates. Single-day courses are exact; multi-day courses are expanded on the
 * listed weekdays and flagged `estimated` (school holidays are not in the feed).
 */
export function buildSessions(raw: RawUniPopCourse, start: ISODate, end: ISODate): CourseSession[] {
  const slots = slotsFrom(raw);
  const mk = (date: ISODate, s: Slot | undefined, estimated: boolean): CourseSession => ({
    date,
    start: s?.time ?? null,
    end: s?.time && s.minutes ? addMinutes(s.time, s.minutes) : null,
    estimated,
  });
  if (start === end) return [mk(start, slots[0], false)];
  if (!slots.length) return [mk(start, undefined, true)];
  const sessions: CourseSession[] = [];
  for (const day of eachDay(start, end)) {
    const wd = weekdayMon0(day);
    for (const s of slots) {
      if (s.weekday !== wd) continue;
      sessions.push(mk(day, s, !(s.date && s.date === day)));
      if (sessions.length >= MAX_SESSIONS_PER_COURSE) return sessions;
    }
  }
  return sessions.length ? sessions : [mk(start, slots[0], true)];
}

export interface MapResult { courses: Course[]; skipped: number; warnings: string[] }

function extractArray(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    for (const key of ['trainings', 'formations', 'cours', 'data', 'items']) {
      const v = (raw as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v;
    }
  }
  return null;
}

export function mapUniPopCourses(raw: unknown): MapResult {
  const list = extractArray(raw);
  if (!list) return { courses: [], skipped: 0, warnings: ['Format inattendu : la source ne contient pas de liste de formations.'] };
  const courses: Course[] = [];
  const ids = new Set<string>();
  let skipped = 0;
  for (const item of list) {
    if (!item || typeof item !== 'object') { skipped++; continue; }
    const r = item as RawUniPopCourse;
    // Only UniPop-owned courses, regardless of the other organisers in the feed.
    if (clean(r.organisateur?.code).toUpperCase() !== 'UNIPOP') continue;
    const start = parseFrDate(r.dateDebut);
    const end = parseFrDate(r.dateFin) ?? start;
    const title = clean(r.intitule);
    if (!start || !end || !title || end < start) { skipped++; continue; }
    let id = clean(String(r.id ?? r.coursId ?? r.coursCode ?? ''));
    if (!id || ids.has(id)) id = `${id || 'cours'}-${courses.length}`;
    ids.add(id);
    const catCode = clean(r.categorieCodeUnipop || r.categorieCode).toUpperCase();
    const addr = r.adresseCours ?? {};
    const distance = clean(r.format).toUpperCase() === 'DISTANCE' || normalize(addr.nom) === 'distance';
    const trainers = (r.enseignants ?? []).map((e) => clean(`${e.prenom ?? ''} ${e.nom ?? ''}`)).filter(Boolean);
    courses.push({
      id,
      code: clean(r.coursCode || r.coursId) || id,
      title,
      theme: clean(r.matiereNom) || CATEGORY_LABELS[catCode] || sentenceCase(r.categorieNom ?? '') || 'Autre',
      themeCode: clean(r.matiereCode) || catCode,
      category: CATEGORY_LABELS[catCode] ?? (sentenceCase(r.categorieNom ?? '') || 'Autre'),
      categoryCode: catCode || 'AUTRE',
      description: '',
      location: distance ? 'À distance' : clean(addr.nom) || 'Lieu à préciser',
      locality: distance ? 'À distance' : clean(addr.localite),
      room: clean(addr.salle) || null,
      format: distance ? 'À distance' : 'Présentiel',
      trainer: trainers.length ? trainers.join(', ') : null,
      enrolled: typeof r.nbInscrits === 'number' ? r.nbInscrits : null,
      capacity: typeof r.nbPlaces === 'number' ? r.nbPlaces : null,
      language: null,
      level: null,
      organizer: null,
      startDate: start,
      endDate: end,
      scheduleText: clean(r.horairePrevu) || null,
      registrationUrl: null,
      sessions: buildSessions(r, start, end),
    });
  }
  const warnings = skipped ? [`${skipped} entrée${skipped > 1 ? 's' : ''} ignorée${skipped > 1 ? 's' : ''} (dates ou intitulé manquants).`] : [];
  return { courses, skipped, warnings };
}

/* ---------- Indexes for fast calendar rendering ---------- */

export interface SessionRef { course: Course; session: CourseSession }

export interface CourseIndex {
  byDate: Map<ISODate, SessionRef[]>;
  themes: string[];
  categories: string[];
  locations: string[];
}

export function buildCourseIndex(courses: Course[]): CourseIndex {
  const byDate = new Map<ISODate, SessionRef[]>();
  const themes = new Set<string>(), categories = new Set<string>(), locations = new Set<string>();
  for (const course of courses) {
    themes.add(course.theme);
    categories.add(course.category);
    locations.add(course.locality || course.location);
    for (const session of course.sessions) {
      const arr = byDate.get(session.date);
      if (arr) arr.push({ course, session }); else byDate.set(session.date, [{ course, session }]);
    }
  }
  for (const arr of byDate.values()) arr.sort((a, b) => (a.session.start ?? '').localeCompare(b.session.start ?? '') || a.course.title.localeCompare(b.course.title));
  const sort = (s: Set<string>) => [...s].filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'));
  return { byDate, themes: sort(themes), categories: sort(categories), locations: sort(locations) };
}

export interface ThemeGroup { theme: string; category: string; categoryCode: string; items: SessionRef[] }

export function groupByTheme(items: SessionRef[]): ThemeGroup[] {
  const map = new Map<string, ThemeGroup>();
  for (const it of items) {
    const g = map.get(it.course.theme);
    if (g) g.items.push(it);
    else map.set(it.course.theme, { theme: it.course.theme, category: it.course.category, categoryCode: it.course.categoryCode, items: [it] });
  }
  return [...map.values()].sort((a, b) => b.items.length - a.items.length || a.theme.localeCompare(b.theme, 'fr'));
}

export function shortLabel(s: string, max = 22): string {
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}
