import type { CourseSnapshot, PlanningEvent, ReminderState, Settings, Task, TeamMember } from '../domain/types';

/**
 * Persistence contracts. The UI and store only see these interfaces, never
 * IndexedDB or Supabase directly. Projects are PlanningEvents with
 * kind = 'projet' and share the events repository (one table later).
 */
export interface EntityRepository<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  upsert(items: T[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  clear(): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<Settings | undefined>;
  save(settings: Settings): Promise<void>;
}

export interface StoreMeta {
  schemaVersion: number;
  createdAt: string;
  seededDemo: boolean;
  lastBackupAt?: string | null;
}

export interface MetaRepository {
  get(): Promise<StoreMeta | undefined>;
  save(meta: StoreMeta): Promise<void>;
}

/** Cached course snapshot: read-only data kept apart from planning data. */
export interface CourseCacheRepository {
  get(): Promise<CourseSnapshot | undefined>;
  save(snapshot: CourseSnapshot): Promise<void>;
  clear(): Promise<void>;
}

export interface DataStore {
  readonly kind: 'local-indexeddb' | 'memory' | 'supabase';
  readonly isShared: boolean;
  events: EntityRepository<PlanningEvent>;
  tasks: EntityRepository<Task>;
  team: EntityRepository<TeamMember>;
  reminders: EntityRepository<ReminderState>;
  settings: SettingsRepository;
  meta: MetaRepository;
  courseCache: CourseCacheRepository;
  /** Atomic replace of all planning data (restore, demo reset). */
  replaceAll(data: PlanningData): Promise<void>;
}

export interface PlanningData {
  events: PlanningEvent[];
  tasks: Task[];
  team: TeamMember[];
  reminders: ReminderState[];
  settings: Settings;
}
