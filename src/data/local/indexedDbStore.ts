import type { CourseSnapshot, Settings } from '../../domain/types';
import type { DataStore, EntityRepository, PlanningData, StoreMeta } from '../contracts';

/**
 * Local adapter (first implementation of DataStore). IndexedDB object-store
 * layout is versioned by DB_VERSION; the *data* schema is versioned
 * separately by StoreMeta.schemaVersion and migrated in ../migrations.ts.
 */
const DB_NAME = 'unipop-command';
const DB_VERSION = 1;
const ENTITY_STORES = ['events', 'tasks', 'team', 'reminders'] as const;
const KV = 'kv';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction annulée'));
  });
}

export function openDatabase(name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB n’est pas disponible dans ce navigateur.'));
      return;
    }
    const open = indexedDB.open(name, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      for (const s of ENTITY_STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV, { keyPath: 'key' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('Base locale bloquée : fermez les autres onglets de l’application.'));
  });
}

class IdbEntityRepo<T extends { id: string }> implements EntityRepository<T> {
  constructor(private db: IDBDatabase, private store: string) {}
  list() { return req(this.db.transaction(this.store).objectStore(this.store).getAll()) as Promise<T[]>; }
  get(id: string) { return req(this.db.transaction(this.store).objectStore(this.store).get(id)) as Promise<T | undefined>; }
  async upsert(items: T[]) {
    if (!items.length) return;
    const tx = this.db.transaction(this.store, 'readwrite');
    const os = tx.objectStore(this.store);
    for (const it of items) os.put(it);
    await done(tx);
  }
  async remove(ids: string[]) {
    if (!ids.length) return;
    const tx = this.db.transaction(this.store, 'readwrite');
    const os = tx.objectStore(this.store);
    for (const id of ids) os.delete(id);
    await done(tx);
  }
  async clear() {
    const tx = this.db.transaction(this.store, 'readwrite');
    tx.objectStore(this.store).clear();
    await done(tx);
  }
}

class IdbKv<T> {
  constructor(private db: IDBDatabase, private key: string) {}
  async get(): Promise<T | undefined> {
    const row = (await req(this.db.transaction(KV).objectStore(KV).get(this.key))) as { value: T } | undefined;
    return row?.value;
  }
  async save(value: T) {
    const tx = this.db.transaction(KV, 'readwrite');
    tx.objectStore(KV).put({ key: this.key, value });
    await done(tx);
  }
  async clear() {
    const tx = this.db.transaction(KV, 'readwrite');
    tx.objectStore(KV).delete(this.key);
    await done(tx);
  }
}

export async function createIndexedDbStore(name = DB_NAME): Promise<DataStore> {
  const db = await openDatabase(name);
  const settings = new IdbKv<Settings>(db, 'settings');
  const meta = new IdbKv<StoreMeta>(db, 'meta');
  const courseCache = new IdbKv<CourseSnapshot>(db, 'courseSnapshot');
  return {
    kind: 'local-indexeddb',
    isShared: false,
    events: new IdbEntityRepo(db, 'events'),
    tasks: new IdbEntityRepo(db, 'tasks'),
    team: new IdbEntityRepo(db, 'team'),
    reminders: new IdbEntityRepo(db, 'reminders'),
    settings: { get: () => settings.get(), save: (s) => settings.save(s) },
    meta: { get: () => meta.get(), save: (m) => meta.save(m) },
    courseCache: { get: () => courseCache.get(), save: (s) => courseCache.save(s), clear: () => courseCache.clear() },
    async replaceAll(data: PlanningData) {
      const tx = db.transaction([...ENTITY_STORES, KV], 'readwrite');
      const put = (store: string, rows: { id: string }[]) => {
        const os = tx.objectStore(store);
        os.clear();
        for (const r of rows) os.put(r);
      };
      put('events', data.events);
      put('tasks', data.tasks);
      put('team', data.team);
      put('reminders', data.reminders);
      tx.objectStore(KV).put({ key: 'settings', value: data.settings });
      await done(tx);
    },
  };
}

