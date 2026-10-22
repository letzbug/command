import { isValidISODate, isValidTime } from '../domain/dates';
import { CATEGORIES, EVENT_STATUSES, PRIORITIES, ROLES, TASK_STATUSES } from '../domain/reference';
import { DEFAULT_THRESHOLDS, normalizeThresholds } from '../domain/reminders';
import type { PlanningEvent, ReminderState, Settings, Task, TeamMember } from '../domain/types';
import { DEFAULT_COURSE_SOURCE } from '../integrations/courses/courseService';
import type { PlanningData } from './contracts';

/** Bump when the persisted record shape changes and add a migration step below. */
export const CURRENT_SCHEMA_VERSION = 1;
export const BACKUP_FORMAT = 'unipop-command-backup';

type Migration = (data: PlanningData) => PlanningData;
/**
 * MIGRATIONS[n] upgrades data from schema n-1 to n. Example for a future v2:
 *   2: (d) => ({ ...d, tasks: d.tasks.map((t) => ({ ...t, estimateHours: null })) }),
 */
export const MIGRATIONS: Record<number, Migration> = {};

export function migrate(data: PlanningData, from: number): PlanningData {
  if (from > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Données au format v${from}, plus récent que cette version de l’application (v${CURRENT_SCHEMA_VERSION}). Mettez l’application à jour.`);
  }
  let d = data;
  for (let v = from + 1; v <= CURRENT_SCHEMA_VERSION; v++) d = MIGRATIONS[v] ? MIGRATIONS[v](d) : d;
  return d;
}

export function defaultSettings(env: Partial<Record<string, string>> = {}): Settings {
  return {
    organisationName: 'UniPop',
    courseSourceUrl: env.VITE_COURSE_SOURCE_URL || DEFAULT_COURSE_SOURCE,
    courseAutoSyncHours: 12,
    publicAppUrl: env.VITE_PUBLIC_APP_URL || '',
    reminderThresholds: [...DEFAULT_THRESHOLDS],
    currentUserId: null,
    theme: 'system',
    showHolidays: true,
  };
}

/* ---------- Normalisation: fills defaults so older or partial records stay usable ---------- */

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const optDate = (v: unknown) => (isValidISODate(v) ? v : null);
const optTime = (v: unknown) => (isValidTime(v) ? v : null);
const stampOr = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : new Date().toISOString());

export function normalizeEvent(r: Partial<PlanningEvent>): PlanningEvent {
  const start = optDate(r.startDate) ?? '1970-01-01';
  const end = optDate(r.endDate) ?? start;
  const rec = r.recurrence && typeof r.recurrence === 'object'
    ? {
        freq: oneOf(r.recurrence.freq, ['yearly', 'monthly', 'weekly', 'daily'] as const, 'yearly'),
        interval: Math.max(1, Math.floor(Number(r.recurrence.interval) || 1)),
        until: optDate(r.recurrence.until),
        count: r.recurrence.count ? Math.max(1, Math.floor(Number(r.recurrence.count))) : null,
      }
    : null;
  return {
    id: str(r.id), createdAt: stampOr(r.createdAt), updatedAt: stampOr(r.updatedAt), rev: Number(r.rev) || 1, demo: !!r.demo,
    kind: oneOf(r.kind, ['evenement', 'projet'] as const, 'evenement'),
    title: str(r.title).trim() || 'Sans titre',
    description: str(r.description), category: oneOf(r.category, CATEGORIES, 'autre'), location: str(r.location),
    startDate: start, endDate: end < start ? start : end,
    startTime: optTime(r.startTime), endTime: optTime(r.endTime),
    organizer: str(r.organizer), ownerId: typeof r.ownerId === 'string' ? r.ownerId : null,
    priority: oneOf(r.priority, PRIORITIES, 'normale'), status: oneOf(r.status, EVENT_STATUSES, 'planifie'),
    notes: str(r.notes), attachments: arr(r.attachments), recurrence: rec,
    exceptions: r.exceptions && typeof r.exceptions === 'object' ? r.exceptions : {},
    seriesId: typeof r.seriesId === 'string' ? r.seriesId : null,
    templateId: typeof r.templateId === 'string' ? r.templateId : null,
    archived: !!r.archived, history: arr(r.history),
  };
}

export function normalizeTask(r: Partial<Task>): Task {
  return {
    id: str(r.id), createdAt: stampOr(r.createdAt), updatedAt: stampOr(r.updatedAt), rev: Number(r.rev) || 1, demo: !!r.demo,
    title: str(r.title).trim() || 'Sans titre', description: str(r.description),
    eventId: typeof r.eventId === 'string' ? r.eventId : null,
    occurrenceKey: optDate(r.occurrenceKey),
    assigneeId: typeof r.assigneeId === 'string' ? r.assigneeId : null,
    startDate: optDate(r.startDate), dueDate: optDate(r.dueDate),
    priority: oneOf(r.priority, PRIORITIES, 'normale'), status: oneOf(r.status, TASK_STATUSES, 'a_faire'),
    progress: Math.min(100, Math.max(0, Number(r.progress) || 0)),
    dependsOn: arr<string>(r.dependsOn).filter((x) => typeof x === 'string'),
    checklist: arr(r.checklist), comments: arr(r.comments), attachments: arr(r.attachments), notes: str(r.notes),
    milestone: !!r.milestone, offsetDays: typeof r.offsetDays === 'number' ? r.offsetDays : null,
    manualDates: !!r.manualDates, completedAt: typeof r.completedAt === 'string' ? r.completedAt : null,
    history: arr(r.history),
  };
}

export function normalizeMember(r: Partial<TeamMember>): TeamMember {
  return {
    id: str(r.id), createdAt: stampOr(r.createdAt), updatedAt: stampOr(r.updatedAt), rev: Number(r.rev) || 1, demo: !!r.demo,
    code: str(r.code).trim().toUpperCase() || 'SANS-CODE', label: str(r.label),
    kind: oneOf(r.kind, ['personne', 'equipe'] as const, 'personne'),
    role: oneOf(r.role, ROLES, 'collaborateur'), color: /^#[0-9a-f]{6}$/i.test(str(r.color)) ? str(r.color) : '#5B6B86',
    active: r.active !== false,
  };
}

export function normalizeSettings(r: Partial<Settings> | undefined, env?: Partial<Record<string, string>>): Settings {
  const d = defaultSettings(env);
  if (!r) return d;
  return {
    organisationName: str(r.organisationName, d.organisationName),
    courseSourceUrl: str(r.courseSourceUrl, d.courseSourceUrl) || d.courseSourceUrl,
    courseAutoSyncHours: Number.isFinite(Number(r.courseAutoSyncHours)) ? Math.max(0, Number(r.courseAutoSyncHours)) : d.courseAutoSyncHours,
    publicAppUrl: str(r.publicAppUrl, d.publicAppUrl),
    reminderThresholds: normalizeThresholds(arr<number>(r.reminderThresholds)).length ? normalizeThresholds(arr<number>(r.reminderThresholds)) : d.reminderThresholds,
    currentUserId: typeof r.currentUserId === 'string' ? r.currentUserId : null,
    theme: oneOf(r.theme, ['system', 'light', 'dark'] as const, 'system'),
    showHolidays: r.showHolidays !== false,
  };
}

/* ---------- Backup ---------- */

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  app: string;
  data: PlanningData;
}

export function buildBackup(data: PlanningData): BackupFile {
  return { format: BACKUP_FORMAT, schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: new Date().toISOString(), app: 'UniPop COMMAND', data };
}

export interface BackupValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  data: PlanningData | null;
  exportedAt: string | null;
}

/** Strict structural checks + referential repair (reported as warnings, never silent). */
export function validateBackup(raw: unknown): BackupValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (msg: string): BackupValidation => ({ ok: false, errors: [...errors, msg], warnings, data: null, exportedAt: null });
  if (!raw || typeof raw !== 'object') return fail('Le fichier ne contient pas un objet JSON.');
  const b = raw as Partial<BackupFile>;
  if (b.format !== BACKUP_FORMAT) return fail('Ce fichier n’est pas une sauvegarde UniPop COMMAND.');
  if (typeof b.schemaVersion !== 'number') return fail('Version de schéma absente.');
  if (b.schemaVersion > CURRENT_SCHEMA_VERSION) return fail(`Sauvegarde au format v${b.schemaVersion}, plus récent que l’application (v${CURRENT_SCHEMA_VERSION}).`);
  const d = b.data as Partial<PlanningData> | undefined;
  if (!d || typeof d !== 'object') return fail('Section « data » manquante.');
  for (const key of ['events', 'tasks', 'team'] as const) if (!Array.isArray(d[key])) errors.push(`Liste « ${key} » manquante ou invalide.`);
  if (errors.length) return { ok: false, errors, warnings, data: null, exportedAt: null };

  const uniq = <T extends { id: string }>(label: string, rows: T[]) => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      if (!r.id) { errors.push(`${label} : un enregistrement n’a pas d’identifiant.`); return false; }
      if (seen.has(r.id)) { errors.push(`${label} : identifiant en double (${r.id}).`); return false; }
      seen.add(r.id);
      return true;
    });
  };
  const rawEvents = arr<Partial<PlanningEvent>>(d.events);
  for (const e of rawEvents) {
    if (!isValidISODate(e.startDate)) errors.push(`Événement « ${str(e.title) || e.id} » : date de début invalide.`);
    else if (e.endDate && isValidISODate(e.endDate) && e.endDate < e.startDate) errors.push(`Événement « ${str(e.title)} » : la fin précède le début.`);
  }
  const events = uniq('Événements', rawEvents.map(normalizeEvent));
  const team = uniq('Équipe', arr<Partial<TeamMember>>(d.team).map(normalizeMember));
  let tasks = uniq('Tâches', arr<Partial<Task>>(d.tasks).map(normalizeTask));
  const reminders = arr<ReminderState>(d.reminders).filter((r) => r && typeof r.id === 'string');
  if (errors.length) return { ok: false, errors, warnings, data: null, exportedAt: null };

  const eventIds = new Set(events.map((e) => e.id));
  const memberIds = new Set(team.map((m) => m.id));
  const taskIds = new Set(tasks.map((t) => t.id));
  let detached = 0, unassigned = 0, deps = 0;
  tasks = tasks.map((t) => {
    let x = t;
    if (x.eventId && !eventIds.has(x.eventId)) { x = { ...x, eventId: null, occurrenceKey: null }; detached++; }
    if (x.assigneeId && !memberIds.has(x.assigneeId)) { x = { ...x, assigneeId: null }; unassigned++; }
    const kept = x.dependsOn.filter((id) => taskIds.has(id) && id !== x.id);
    if (kept.length !== x.dependsOn.length) { deps += x.dependsOn.length - kept.length; x = { ...x, dependsOn: kept }; }
    return x;
  });
  const fixedEvents = events.map((e) => (e.ownerId && !memberIds.has(e.ownerId) ? (unassigned++, { ...e, ownerId: null }) : e));
  if (detached) warnings.push(`${detached} tâche(s) liée(s) à un événement absent seront importées sans événement.`);
  if (unassigned) warnings.push(`${unassigned} responsable(s) inconnu(s) retiré(s).`);
  if (deps) warnings.push(`${deps} dépendance(s) vers des tâches absentes retirée(s).`);

  let data: PlanningData = { events: fixedEvents, tasks, team, reminders, settings: normalizeSettings(d.settings) };
  if (data.settings.currentUserId && !memberIds.has(data.settings.currentUserId)) data.settings = { ...data.settings, currentUserId: null };
  data = migrate(data, b.schemaVersion);
  return { ok: true, errors, warnings, data, exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : null };
}

export interface MergeSummary {
  events: { added: number; existing: number };
  tasks: { added: number; existing: number };
  team: { added: number; existing: number };
}

export function summarizeMerge(current: PlanningData, incoming: PlanningData): MergeSummary {
  const count = <T extends { id: string }>(cur: T[], inc: T[]) => {
    const ids = new Set(cur.map((x) => x.id));
    const existing = inc.filter((x) => ids.has(x.id)).length;
    return { added: inc.length - existing, existing };
  };
  return { events: count(current.events, incoming.events), tasks: count(current.tasks, incoming.tasks), team: count(current.team, incoming.team) };
}

/** Merge: add records whose id is new; existing records are kept untouched. */
export function mergeData(current: PlanningData, incoming: PlanningData): PlanningData {
  const add = <T extends { id: string }>(cur: T[], inc: T[]) => {
    const ids = new Set(cur.map((x) => x.id));
    return [...cur, ...inc.filter((x) => !ids.has(x.id))];
  };
  const reminderIds = new Set(current.reminders.map((r) => r.id));
  return {
    events: add(current.events, incoming.events),
    tasks: add(current.tasks, incoming.tasks),
    team: add(current.team, incoming.team),
    reminders: [...current.reminders, ...incoming.reminders.filter((r) => !reminderIds.has(r.id))],
    settings: current.settings,
  };
}
