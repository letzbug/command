import { addDays, ymd } from './dates';
import type { EventCategory, EventStatus, ISODate, Priority, Role, TaskStatus } from './types';

/* ---------- Identifiers ---------- */

export function uid(prefix: string): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  const raw = c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${raw}`;
}

export const nowStamp = () => new Date().toISOString();

/* ---------- Luxembourg public holidays (jours fériés légaux) ---------- */

export function easterSunday(year: number): ISODate {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

export interface Holiday { date: ISODate; name: string }

export function luxembourgHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const list: Holiday[] = [
    { date: ymd(year, 1, 1), name: "Jour de l'an" },
    { date: addDays(easter, 1), name: 'Lundi de Pâques' },
    { date: ymd(year, 5, 1), name: 'Fête du Travail' },
    { date: addDays(easter, 39), name: 'Ascension' },
    { date: addDays(easter, 50), name: 'Lundi de Pentecôte' },
    { date: ymd(year, 6, 23), name: 'Fête nationale' },
    { date: ymd(year, 8, 15), name: 'Assomption' },
    { date: ymd(year, 11, 1), name: 'Toussaint' },
    { date: ymd(year, 12, 25), name: 'Noël' },
    { date: ymd(year, 12, 26), name: 'Saint-Étienne' },
  ];
  if (year >= 2019) list.push({ date: ymd(year, 5, 9), name: "Journée de l'Europe" });
  return list.sort((x, y) => x.date.localeCompare(y.date));
}

/* ---------- Vacances scolaires Luxembourg (MENJE, 2026–2028) ---------- */
export interface SchoolBreak { start: ISODate; end: ISODate; name: string }
export const LUX_SCHOOL_BREAKS: SchoolBreak[] = [
  { start: '2025-12-20', end: '2026-01-04', name: 'Vacances de Noël' },
  { start: '2026-02-14', end: '2026-02-22', name: 'Congé de Carnaval' },
  { start: '2026-03-28', end: '2026-04-12', name: 'Vacances de Pâques' },
  { start: '2026-05-23', end: '2026-05-31', name: 'Congé de Pentecôte' },
  { start: '2026-07-16', end: '2026-09-14', name: 'Vacances d’été' },
  { start: '2026-10-31', end: '2026-11-08', name: 'Congé de la Toussaint' },
  { start: '2026-12-19', end: '2027-01-03', name: 'Vacances de Noël' },
  { start: '2027-02-06', end: '2027-02-14', name: 'Congé de Carnaval' },
  { start: '2027-03-27', end: '2027-04-11', name: 'Vacances de Pâques' },
  { start: '2027-05-29', end: '2027-06-06', name: 'Congé de Pentecôte' },
  { start: '2027-07-16', end: '2027-09-14', name: 'Vacances d’été' },
  { start: '2027-10-30', end: '2027-11-07', name: 'Congé de la Toussaint' },
  { start: '2027-12-18', end: '2028-01-02', name: 'Vacances de Noël' },
  { start: '2028-02-12', end: '2028-02-20', name: 'Congé de Carnaval' },
  { start: '2028-04-01', end: '2028-04-16', name: 'Vacances de Pâques' },
  { start: '2028-05-27', end: '2028-06-04', name: 'Congé de Pentecôte' },
  { start: '2028-07-15', end: '2028-09-14', name: 'Vacances d’été' },
  { start: '2028-10-28', end: '2028-11-05', name: 'Congé de la Toussaint' },
  { start: '2028-12-16', end: '2028-12-31', name: 'Vacances de Noël' },
];
export function schoolBreakOn(date: ISODate): string | undefined {
  return LUX_SCHOOL_BREAKS.find((v) => date >= v.start && date <= v.end)?.name;
}

/* ---------- Labels (French UI vocabulary, one source of truth) ---------- */

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  a_faire: 'À faire', en_cours: 'En cours', en_attente: 'En attente', termine: 'Terminé',
};
export const TASK_STATUSES: TaskStatus[] = ['a_faire', 'en_cours', 'en_attente', 'termine'];

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  planifie: 'Planifié', en_preparation: 'En préparation', confirme: 'Confirmé', termine: 'Terminé', annule: 'Annulé',
};
export const EVENT_STATUSES: EventStatus[] = ['planifie', 'en_preparation', 'confirme', 'termine', 'annule'];

export const PRIORITY_LABEL: Record<Priority, string> = {
  basse: 'Basse', normale: 'Normale', haute: 'Haute', critique: 'Critique',
};
export const PRIORITIES: Priority[] = ['basse', 'normale', 'haute', 'critique'];
export const PRIORITY_RANK: Record<Priority, number> = { critique: 0, haute: 1, normale: 2, basse: 3 };

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  conference: 'Conférence',
  portes_ouvertes: 'Portes ouvertes',
  lancement_cours: 'Lancement de cours',
  campagne: 'Campagne de communication',
  institutionnel: 'Événement institutionnel',
  technique: 'Préparation technique',
  reunion: 'Réunion',
  formation: 'Coordination des formations',
  autre: 'Autre',
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL) as EventCategory[];

export const ROLE_LABEL: Record<Role, string> = {
  administrateur: 'Administrateur', coordinateur: 'Coordinateur', collaborateur: 'Collaborateur', lecture_seule: 'Lecture seule',
};
export const ROLES: Role[] = ['administrateur', 'coordinateur', 'collaborateur', 'lecture_seule'];

/* ---------- Permissions (UI representation only; real enforcement = backend + RLS) ---------- */

export type Permission =
  | 'event.write' | 'event.delete' | 'task.write' | 'task.delete'
  | 'team.manage' | 'settings.manage' | 'data.manage';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  administrateur: ['event.write', 'event.delete', 'task.write', 'task.delete', 'team.manage', 'settings.manage', 'data.manage'],
  coordinateur: ['event.write', 'event.delete', 'task.write', 'task.delete'],
  collaborateur: ['task.write'],
  lecture_seule: [],
};

export const PERMISSION_LABEL: Record<Permission, string> = {
  'event.write': 'Créer et modifier des événements',
  'event.delete': 'Supprimer des événements',
  'task.write': 'Créer et modifier des tâches',
  'task.delete': 'Supprimer des tâches',
  'team.manage': "Gérer l'équipe",
  'settings.manage': 'Modifier les paramètres',
  'data.manage': 'Sauvegarder, restaurer, réinitialiser',
};
