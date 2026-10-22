/**
 * UniPop COMMAND — domain model.
 * Dates are calendar dates (YYYY-MM-DD) interpreted in Europe/Luxembourg.
 * Times are 24h "HH:MM". No Date objects are stored, which keeps
 * persistence, backups and a future Postgres schema timezone-safe.
 */
export type ISODate = string;
export type TimeHM = string;

export type Priority = 'basse' | 'normale' | 'haute' | 'critique';
export type TaskStatus = 'a_faire' | 'en_cours' | 'en_attente' | 'termine';
export type EventStatus = 'planifie' | 'en_preparation' | 'confirme' | 'termine' | 'annule';
export type EventKind = 'evenement' | 'projet';
export type EventCategory =
  | 'conference' | 'portes_ouvertes' | 'lancement_cours' | 'campagne'
  | 'institutionnel' | 'technique' | 'reunion' | 'formation' | 'autre';
export type Role = 'administrateur' | 'coordinateur' | 'collaborateur' | 'lecture_seule';
export type RecurrenceFreq = 'yearly' | 'monthly' | 'weekly' | 'daily';

/** Fields every persisted record carries (rev enables optimistic concurrency later). */
export interface RecordMeta {
  id: string;
  createdAt: string; // ISO timestamp
  updatedAt: string;
  rev: number;
  demo?: boolean;
}

export interface Attachment { id: string; name: string; url: string }
export interface HistoryEntry { at: string; by?: string | null; text: string }

export interface Recurrence {
  freq: RecurrenceFreq;
  interval: number;
  until?: ISODate | null;
  count?: number | null;
}

/** Per-occurrence change, keyed by the occurrence's original start date. */
export interface OccurrenceOverride {
  cancelled?: boolean;
  startDate?: ISODate;
  endDate?: ISODate;
  startTime?: TimeHM | null;
  endTime?: TimeHM | null;
  title?: string;
  location?: string;
  notes?: string;
}

export interface PlanningEvent extends RecordMeta {
  kind: EventKind;
  title: string;
  description: string;
  category: EventCategory;
  location: string;
  startDate: ISODate;
  endDate: ISODate;
  startTime?: TimeHM | null;
  endTime?: TimeHM | null;
  organizer: string;
  ownerId?: string | null;
  priority: Priority;
  status: EventStatus;
  notes: string;
  attachments: Attachment[];
  recurrence?: Recurrence | null;
  exceptions: Record<ISODate, OccurrenceOverride>;
  seriesId?: string | null;
  templateId?: string | null;
  archived: boolean;
  history: HistoryEntry[];
}

export interface ChecklistItem { id: string; text: string; done: boolean }
export interface TaskComment { id: string; authorId?: string | null; text: string; at: string }

export interface Task extends RecordMeta {
  title: string;
  description: string;
  eventId?: string | null;
  /** For recurring events: the occurrence (original start date) this task prepares. */
  occurrenceKey?: ISODate | null;
  assigneeId?: string | null;
  startDate?: ISODate | null;
  dueDate?: ISODate | null;
  priority: Priority;
  status: TaskStatus;
  progress: number; // 0..100
  dependsOn: string[];
  checklist: ChecklistItem[];
  comments: TaskComment[];
  attachments: Attachment[];
  notes: string;
  milestone: boolean;
  /** Days relative to the event start (from a template). Used to recalculate deadlines. */
  offsetDays?: number | null;
  /** True once someone changed the dates by hand: recalculation never overwrites silently. */
  manualDates: boolean;
  completedAt?: string | null;
  history: HistoryEntry[];
}

export interface TeamMember extends RecordMeta {
  code: string; // fictional identifier, e.g. ORG-01
  label: string; // function, never a real person's name in seed data
  kind: 'personne' | 'equipe';
  role: Role;
  color: string;
  active: boolean;
}

export interface Settings {
  organisationName: string;
  courseSourceUrl: string;
  courseAutoSyncHours: number; // 0 = manual only
  publicAppUrl: string;
  reminderThresholds: number[];
  currentUserId: string | null;
  theme: 'system' | 'light' | 'dark';
  showHolidays: boolean;
}

export interface ReminderState {
  id: string;
  acknowledgedAt?: string | null;
  snoozedUntil?: ISODate | null;
}

export interface CourseSession {
  date: ISODate;
  start?: TimeHM | null;
  end?: TimeHM | null;
  /** True when derived from a weekly pattern (holidays are not known to the source). */
  estimated: boolean;
}

export interface Course {
  id: string;
  code: string;
  title: string;
  theme: string;
  themeCode: string;
  category: string;
  categoryCode: string;
  description: string;
  location: string;
  locality: string;
  room?: string | null;
  format: string;
  trainer?: string | null;
  enrolled?: number | null;
  capacity?: number | null;
  language?: string | null;
  level?: string | null;
  organizer?: string | null;
  startDate: ISODate;
  endDate: ISODate;
  scheduleText?: string | null;
  registrationUrl?: string | null;
  sessions: CourseSession[];
}

export type CourseSourceKind = 'live' | 'demo' | 'file';

export interface CourseSnapshot {
  source: CourseSourceKind;
  sourceUrl?: string | null;
  fileName?: string | null;
  fetchedAt: string;
  lastSuccessAt?: string | null;
  warning?: string | null;
  skipped?: number;
  courses: Course[];
}
