import type { CourseSnapshot, Settings } from '../../domain/types';
import type { DataStore, EntityRepository, PlanningData, StoreMeta } from '../contracts';

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

class MemoryRepo<T extends { id: string }> implements EntityRepository<T> {
  rows = new Map<string, T>();
  async list() { return [...this.rows.values()].map(clone); }
  async get(id: string) { return clone(this.rows.get(id)); }
  async upsert(items: T[]) { for (const it of items) this.rows.set(it.id, clone(it)); }
  async remove(ids: string[]) { for (const id of ids) this.rows.delete(id); }
  async clear() { this.rows.clear(); }
}

/** Same contract as the IndexedDB adapter; data lives only for the process lifetime. */
export function createMemoryStore(): DataStore {
  let settings: Settings | undefined;
  let meta: StoreMeta | undefined;
  let course: CourseSnapshot | undefined;
  const events = new MemoryRepo<PlanningData['events'][number]>();
  const tasks = new MemoryRepo<PlanningData['tasks'][number]>();
  const team = new MemoryRepo<PlanningData['team'][number]>();
  const reminders = new MemoryRepo<PlanningData['reminders'][number]>();
  return {
    kind: 'memory',
    isShared: false,
    events, tasks, team, reminders,
    settings: { get: async () => clone(settings), save: async (s) => { settings = clone(s); } },
    meta: { get: async () => clone(meta), save: async (m) => { meta = clone(m); } },
    courseCache: {
      get: async () => clone(course),
      save: async (s) => { course = clone(s); },
      clear: async () => { course = undefined; },
    },
    async replaceAll(data) {
      for (const [repo, rows] of [[events, data.events], [tasks, data.tasks], [team, data.team], [reminders, data.reminders]] as const) {
        await repo.clear();
        await (repo as MemoryRepo<{ id: string }>).upsert(rows as { id: string }[]);
      }
      settings = clone(data.settings);
    },
  };
}
