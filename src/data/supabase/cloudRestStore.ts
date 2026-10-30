import type { CourseSnapshot, PlanningEvent, ReminderState, Settings, Task, TeamMember } from '../../domain/types';
import type { DataStore, EntityRepository, StoreMeta, PlanningData } from '../contracts';
import { defaultSettings } from '../schema';

// Public browser configuration; never use a service_role or secret key here.
export const CLOUD_URL = 'https://nhprnkesgjhlqgklzpxu.supabase.co';
export const CLOUD_PUBLISHABLE_KEY = 'sb_publishable_MO7RpWV1Bw1Hk9Ckjp9mHQ_kQmrPjEm';
export type CloudSession = { url: string; publishableKey: string; accessToken: string; refreshToken: string; expiresAt: number; memberId: string; userId: string };
const SESSION_KEY = 'unipop-command-cloud-test-session-v2';
let sessionStorageKind: 'session' | 'local' = 'session';
let refreshing: Promise<void> | undefined;
function selectedStorage() { return sessionStorageKind === 'local' ? localStorage : sessionStorage; }
export function forgetCloudSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}
function persistSession(session: CloudSession) { selectedStorage().setItem(SESSION_KEY, JSON.stringify(session)); }
export async function cloudRefresh(session: CloudSession): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const res = await fetch(`${CLOUD_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: CLOUD_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    if (!res.ok) { forgetCloudSession(); throw new Error('Session expirée. Veuillez vous reconnecter.'); }
    const auth = await res.json();
    session.accessToken = auth.access_token;
    session.refreshToken = auth.refresh_token;
    session.expiresAt = Date.now() + (auth.expires_in ?? 3600) * 1000;
    persistSession(session);
  })();
  try { await refreshing; } finally { refreshing = undefined; }
}
async function checkCloudProfile(session: CloudSession) {
  const res = await fetch(`${CLOUD_URL}/rest/v1/profiles?user_id=eq.${encodeURIComponent(session.userId)}&select=member_id,team_members(role,active)`, {
    headers: { apikey: CLOUD_PUBLISHABLE_KEY, Authorization: `Bearer ${session.accessToken}` },
  });
  if (!res.ok) throw new Error('Profil COMMAND inaccessible.');
  const rows = await res.json();
  if (!rows[0]?.member_id || !rows[0]?.team_members?.active) throw new Error('Accès COMMAND non autorisé.');
  session.memberId = rows[0].member_id;
}
export async function restoreCloudSession(): Promise<CloudSession | null> {
  const stored = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  sessionStorageKind = sessionStorage.getItem(SESSION_KEY) ? 'session' : 'local';
  try {
    const s = JSON.parse(stored) as CloudSession;
    if (s.url !== CLOUD_URL || s.publishableKey !== CLOUD_PUBLISHABLE_KEY || !s.refreshToken || !s.userId) throw new Error('Session invalide.');
    if (Date.now() > s.expiresAt - 60000) await cloudRefresh(s);
    await checkCloudProfile(s);
    persistSession(s);
    return s;
  } catch { forgetCloudSession(); return null; }
}
export async function cloudLogout(session: CloudSession) {
  forgetCloudSession();
  try { await fetch(`${CLOUD_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: CLOUD_PUBLISHABLE_KEY, Authorization: `Bearer ${session.accessToken}` } }); } catch { /* local logout always succeeds */ }
}
const fields = (key: string) => key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
const camel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const plain = (v: Record<string, unknown>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [fields(k), x]));
const expand = <T>(v: Record<string, unknown>): T => Object.fromEntries(Object.entries(v).map(([k, x]) => [camel(k), x])) as T;
const cleanTime = (s: unknown) => typeof s === 'string' ? s.slice(0, 5) : s;
const CONFLICT = 'Cette fiche a été modifiée par un collègue. Rechargez la page avant de réessayer.';

export function createCloudRestStore(session: CloudSession): DataStore {
  const url = session.url.replace(/\/$/, '');
  async function request(path: string, opts: RequestInit = {}) {
    if (Date.now() > session.expiresAt - 60000) await cloudRefresh(session);
    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...opts,
      headers: {
        apikey: session.publishableKey,
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(opts.headers || {}),
      },
    });
    const data = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${data.slice(0, 300)}`);
    return data ? JSON.parse(data) : [];
  }

  // Assign role on the server; no browser-side impersonation.
  class Repo<T extends { id: string; rev?: number }> implements EntityRepository<T> {
    constructor(private table: string, private fieldMap: Record<string, string> = {}) {}
    toRow(x: T) {
      const row = plain(x as Record<string, unknown>);
      // Local-only flag; no "demo" column exists in the Supabase schema.
      delete row.demo;
      for (const [from, to] of Object.entries(this.fieldMap)) {
        if (from in row) { row[to] = row[from]; delete row[from]; }
      }
      return row;
    }
    fromRow(x: Record<string, unknown>): T {
      const result = { ...x };
      for (const [from, to] of Object.entries(this.fieldMap)) {
        if (to in result) { result[from] = result[to]; delete result[to]; }
      }
      const mapped = expand<T>(result);
      if (this.table === 'events') {
        const e = mapped as PlanningEvent;
        e.startTime = cleanTime(e.startTime) as string | null;
        e.endTime = cleanTime(e.endTime) as string | null;
      }
      return mapped;
    }
    async list(): Promise<T[]> {
      const rows = await request(`${this.table}?select=*&order=created_at.asc&limit=1000`);
      return rows.map((x: Record<string, unknown>) => this.fromRow(x));
    }
    async get(id: string): Promise<T | undefined> {
      const rows = await request(`${this.table}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
      return rows[0] ? this.fromRow(rows[0]) : undefined;
    }
    async upsert(items: T[]) {
      for (const item of items) {
        const row = this.toRow(item);
        if (!item.rev || item.rev === 1) {
          // Creating a new id must never silently overwrite an existing record.
          await request(this.table, { method: 'POST', body: JSON.stringify(row) });
        } else {
          // Atomic optimistic check: guard trigger also requires rev = old.rev + 1.
          const priorRev = item.rev - 1;
          const rows = await request(`${this.table}?id=eq.${encodeURIComponent(item.id)}&rev=eq.${priorRev}`,
            { method: 'PATCH', body: JSON.stringify(row) });
          if (!rows.length) throw new Error(CONFLICT);
        }
      }
    }
    async remove(ids: string[]) {
      for (const id of ids) await request(`${this.table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    }
    async clear() { throw new Error('Suppression globale désactivée en mode cloud test.'); }
  }
  const events = new Repo<PlanningEvent>('events');
  const tasks = new Repo<Task>('tasks');
  const team = new Repo<TeamMember>('team_members');
  // Per-user reminder rows are keyed by (user_id,id), not a standalone id.
  const reminders: EntityRepository<ReminderState> = {
    async list() { const xs = await request(`reminder_states?user_id=eq.${session.userId}&select=*`); return xs.map((x: Record<string, unknown>) => expand<ReminderState>(x)); },
    async get(id) { const xs = await request(`reminder_states?user_id=eq.${session.userId}&id=eq.${encodeURIComponent(id)}&select=*`); return xs[0] ? expand<ReminderState>(xs[0]) : undefined; },
    async upsert(items) { for (const x of items) await request('reminder_states?on_conflict=user_id,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ ...plain(x as unknown as Record<string, unknown>), user_id: session.userId }) }); },
    async remove(ids) { for (const id of ids) await request(`reminder_states?user_id=eq.${session.userId}&id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }); },
    async clear() { throw new Error('Suppression globale désactivée en mode cloud test.'); },
  };
  let localSettings: Settings = { ...defaultSettings({}), currentUserId: session.memberId };
  let cache: CourseSnapshot | undefined;
  const stableMeta: StoreMeta = { schemaVersion: 1, createdAt: new Date().toISOString(), seededDemo: false };
  return {
    kind: 'supabase', isShared: true,
    events, tasks, team, reminders,
    settings: { get: async () => localSettings, save: async s => { localSettings = { ...s, currentUserId: session.memberId }; } },
    meta: { get: async () => stableMeta, save: async () => undefined },
    courseCache: { get: async () => cache, save: async s => { cache = s; }, clear: async () => { cache = undefined; } },
    async replaceAll(_data: PlanningData) { throw new Error('Importation globale bloquée en mode cloud test.'); },
  };
}

export async function cloudLogin(email: string, password: string, remember: boolean): Promise<CloudSession> {
  if (!CLOUD_PUBLISHABLE_KEY.startsWith('sb_publishable_')) throw new Error('Configuration invalide.');
  const res = await fetch(`${CLOUD_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: CLOUD_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Connexion refusée : vérifiez vos identifiants.');
  const auth = await res.json();
  const session: CloudSession = {
    url: CLOUD_URL, publishableKey: CLOUD_PUBLISHABLE_KEY,
    accessToken: auth.access_token, refreshToken: auth.refresh_token,
    expiresAt: Date.now() + (auth.expires_in ?? 3600) * 1000,
    memberId: '', userId: auth.user.id,
  };
  await checkCloudProfile(session);
  forgetCloudSession();
  sessionStorageKind = remember ? 'local' : 'session';
  persistSession(session);
  return session;
}
