import { createContext, useContext, useSyncExternalStore } from 'react';
import { formatDate, todayISO } from '../domain/dates';
import { generateTemplateTasks, templateById, withStatus } from '../domain/planning';
import { splitSeries } from '../domain/recurrence';
import { EVENT_STATUS_LABEL, nowStamp, Permission, PRIORITY_LABEL, ROLE_PERMISSIONS, ROLE_LABEL, TASK_STATUS_LABEL, uid } from '../domain/reference';
import type { CourseSnapshot, HistoryEntry, ISODate, OccurrenceOverride, PlanningEvent, ReminderState, Role, Settings, Task, TeamMember } from '../domain/types';
import type { DataStore, PlanningData } from '../data/contracts';
import { CURRENT_SCHEMA_VERSION, migrate, normalizeEvent, normalizeMember, normalizeSettings, normalizeTask } from '../data/schema';
import { buildDemoData } from '../data/seed';
import { defaultSettings } from '../data/schema';
import { demoSnapshot, needsAutoSync, snapshotFromRaw, syncCourses } from '../integrations/courses/courseService';
import { ENV } from '../config';

export interface AppState {
  ready: boolean;
  fatal: string | null;
  today: ISODate;
  events: PlanningEvent[];
  tasks: Task[];
  team: TeamMember[];
  settings: Settings;
  reminderStates: Record<string, ReminderState>;
  courseSnapshot: CourseSnapshot | null;
  courseSyncing: boolean;
  storageKind: DataStore['kind'];
}

export class PermissionError extends Error {}
type Undo = () => Promise<void>;

const HISTORY_LIMIT = 60;

export class AppStore {
  private listeners = new Set<() => void>();
  state: AppState;

  constructor(private repo: DataStore) {
    this.state = {
      ready: false, fatal: null, today: todayISO(), events: [], tasks: [], team: [],
      settings: normalizeSettings(undefined, ENV), reminderStates: {}, courseSnapshot: null, courseSyncing: false,
      storageKind: repo.kind,
    };
  }

  getState = () => this.state;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  };
  private set(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /* ---------- Lifecycle ---------- */

  async init() {
    try {
      const meta = await this.repo.meta.get();
      if (!meta) {
        const stamp = nowStamp();
        const members: Array<[string, string, Role, string, TeamMember['kind']]> = [
          ['EXPLOSE', 'Consultation (conseil)', 'lecture_seule', '#6B7280', 'personne'],
          ['FRANK', 'Event / Formations', 'coordinateur', '#3B4A6B', 'equipe'],
          ['GILLES', 'Formations UniPop', 'collaborateur', '#1F63D0', 'personne'],
          ['MARIA', 'Accueil et inscriptions', 'collaborateur', '#7048E8', 'personne'],
          ['SONJA', 'Coordination des formations', 'coordinateur', '#0F8A7A', 'personne'],
          ['STUP', 'Support technique', 'collaborateur', '#B45F06', 'personne'],
          ['YVES', 'Communication', 'administrateur', '#C2416B', 'personne'],
        ];
        const team: TeamMember[] = members.map(([code, label, role, color, kind]) => ({
          id: uid('mbr'), createdAt: stamp, updatedAt: stamp, rev: 1,
          code, label, role, color, kind, active: true, demo: false,
        }));
        await this.repo.replaceAll({ events: [], tasks: [], team, reminders: [], settings: defaultSettings(ENV) });
        await this.repo.meta.save({ schemaVersion: CURRENT_SCHEMA_VERSION, createdAt: stamp, seededDemo: false });
      } else if (meta.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        const loaded = await this.loadAll();
        const migrated = migrate(loaded, meta.schemaVersion);
        await this.repo.replaceAll(migrated);
        await this.repo.meta.save({ ...meta, schemaVersion: CURRENT_SCHEMA_VERSION });
      }
      const data = await this.loadAll();
      const snapshot = (await this.repo.courseCache.get()) ?? null;
      this.set({
        ready: true, events: data.events.filter((e) => !e.demo), tasks: data.tasks.filter((t) => !t.demo), team: data.team, settings: data.settings,
        reminderStates: Object.fromEntries(data.reminders.map((r) => [r.id, r])),
        courseSnapshot: snapshot?.source === 'demo' ? null : snapshot,
      });
      if (needsAutoSync(snapshot?.source === 'demo' ? null : snapshot, data.settings.courseAutoSyncHours)) void this.refreshCourses();
    } catch (e) {
      this.set({ ready: true, fatal: e instanceof Error ? e.message : String(e) });
    }
  }

  private async loadAll(): Promise<PlanningData> {
    const [events, tasks, team, reminders, settings] = await Promise.all([
      this.repo.events.list(), this.repo.tasks.list(), this.repo.team.list(), this.repo.reminders.list(), this.repo.settings.get(),
    ]);
    return {
      events: events.map(normalizeEvent), tasks: tasks.map(normalizeTask), team: team.map(normalizeMember),
      reminders, settings: normalizeSettings(settings, ENV),
    };
  }

  setToday(today: ISODate) {
    if (today !== this.state.today) this.set({ today });
  }

  /* ---------- Identity & permissions (demo only: real enforcement = backend + RLS) ---------- */

  currentMember(): TeamMember | null {
    return this.state.team.find((m) => m.id === this.state.settings.currentUserId) ?? null;
  }
  role(): Role {
    return this.currentMember()?.role ?? 'lecture_seule';
  }
  can(p: Permission): boolean {
    return ROLE_PERMISSIONS[this.role()].includes(p);
  }
  private ensure(p: Permission) {
    if (!this.can(p)) throw new PermissionError(`Action non autorisée pour le rôle « ${ROLE_LABEL[this.role()]} » (mode démo).`);
  }

  private hist<T extends { history: HistoryEntry[] }>(rec: T, text: string): T {
    const entry = { at: nowStamp(), by: this.state.settings.currentUserId, text };
    return { ...rec, history: [...rec.history, entry].slice(-HISTORY_LIMIT) };
  }
  private touch<T extends { updatedAt: string; rev: number }>(rec: T): T {
    return { ...rec, updatedAt: nowStamp(), rev: rec.rev + 1 };
  }

  /* ---------- Events ---------- */

  newEventDraft(p: Partial<PlanningEvent> = {}): PlanningEvent {
    const stamp = nowStamp();
    const start = p.startDate ?? this.state.today;
    return normalizeEvent({
      id: uid('evt'), createdAt: stamp, updatedAt: stamp, rev: 0, kind: 'evenement', category: 'autre', title: '',
      startDate: start, endDate: p.endDate ?? start, organizer: this.state.settings.organisationName,
      ownerId: this.state.settings.currentUserId, priority: 'normale', status: 'planifie', ...p,
    });
  }

  async createEvent(draft: PlanningEvent, templateId: string | null): Promise<{ event: PlanningEvent; created: number }> {
    this.ensure('event.write');
    const stamp = nowStamp();
    const event = this.hist({ ...draft, rev: 1, createdAt: stamp, updatedAt: stamp, templateId }, 'Événement créé');
    let tasks: Task[] = [];
    const tpl = templateById(templateId);
    if (tpl) {
      const codes = Object.fromEntries(this.state.team.map((m) => [m.code, m.id]));
      const occ = event.recurrence ? { key: event.startDate, startDate: event.startDate } : undefined;
      tasks = generateTemplateTasks(tpl, event, codes, occ);
    }
    await this.repo.events.upsert([event]);
    await this.repo.tasks.upsert(tasks);
    this.set({ events: [...this.state.events, event], tasks: [...this.state.tasks, ...tasks] });
    return { event, created: tasks.length };
  }

  private describeEventChange(a: PlanningEvent, b: PlanningEvent): string {
    const parts: string[] = [];
    if (a.title !== b.title) parts.push(`Titre : « ${b.title} »`);
    if (a.startDate !== b.startDate || a.endDate !== b.endDate) parts.push(`Dates : ${formatDate(a.startDate, 'medium')} → ${formatDate(b.startDate, 'medium')}`);
    if (a.status !== b.status) parts.push(`Statut : ${EVENT_STATUS_LABEL[a.status]} → ${EVENT_STATUS_LABEL[b.status]}`);
    if (a.ownerId !== b.ownerId) parts.push('Responsable modifié');
    if (a.priority !== b.priority) parts.push(`Priorité : ${PRIORITY_LABEL[b.priority]}`);
    if (JSON.stringify(a.recurrence) !== JSON.stringify(b.recurrence)) parts.push('Récurrence modifiée');
    return parts.length ? parts.join(' ; ') : 'Informations mises à jour';
  }

  async updateEvent(next: PlanningEvent, rescheduled: Task[] = []) {
    this.ensure('event.write');
    const prev = this.state.events.find((e) => e.id === next.id);
    const saved = this.touch(this.hist(next, prev ? this.describeEventChange(prev, next) : 'Mis à jour'));
    await this.repo.events.upsert([saved]);
    if (rescheduled.length) await this.repo.tasks.upsert(rescheduled);
    const byId = new Map(rescheduled.map((t) => [t.id, t]));
    this.set({
      events: this.state.events.map((e) => (e.id === saved.id ? saved : e)),
      tasks: byId.size ? this.state.tasks.map((t) => byId.get(t.id) ?? t) : this.state.tasks,
    });
    return saved;
  }

  async saveOccurrence(eventId: string, key: ISODate, patch: OccurrenceOverride, rescheduled: Task[] = []) {
    this.ensure('event.write');
    const ev = this.state.events.find((e) => e.id === eventId);
    if (!ev) return;
    const next = this.hist({ ...ev, exceptions: { ...ev.exceptions, [key]: { ...(ev.exceptions[key] ?? {}), ...patch } } },
      patch.cancelled ? `Occurrence du ${formatDate(key, 'medium')} annulée` : `Occurrence du ${formatDate(key, 'medium')} modifiée`);
    const saved = this.touch(next);
    await this.repo.events.upsert([saved]);
    if (rescheduled.length) await this.repo.tasks.upsert(rescheduled);
    const byId = new Map(rescheduled.map((t) => [t.id, t]));
    this.set({ events: this.state.events.map((e) => (e.id === eventId ? saved : e)), tasks: this.state.tasks.map((t) => byId.get(t.id) ?? t) });
  }

  async saveFollowing(eventId: string, key: ISODate, patch: Partial<PlanningEvent>) {
    this.ensure('event.write');
    const ev = this.state.events.find((e) => e.id === eventId);
    if (!ev) return null;
    const { original, created } = splitSeries(ev, key, patch, uid('evt'), nowStamp());
    const o = this.touch(this.hist(original, created ? `Série arrêtée au ${formatDate(key, 'medium')} (suite dans une nouvelle série)` : this.describeEventChange(ev, original)));
    const items = created ? [o, created] : [o];
    await this.repo.events.upsert(items);
    // Preparation tasks of future occurrences follow the new series.
    const moved = created
      ? this.state.tasks.filter((t) => t.eventId === ev.id && t.occurrenceKey && t.occurrenceKey >= key).map((t) => this.touch({ ...t, eventId: created.id }))
      : [];
    if (moved.length) await this.repo.tasks.upsert(moved);
    const mv = new Map(moved.map((t) => [t.id, t]));
    this.set({
      events: [...this.state.events.map((e) => (e.id === o.id ? o : e)), ...(created ? [created] : [])],
      tasks: this.state.tasks.map((t) => mv.get(t.id) ?? t),
    });
    return created ?? o;
  }

  async archiveEvent(id: string, archived: boolean) {
    const ev = this.state.events.find((e) => e.id === id);
    if (ev) await this.updateEvent(this.hist({ ...ev, archived }, archived ? 'Archivé' : 'Désarchivé'));
  }

  async duplicateEvent(id: string): Promise<PlanningEvent | null> {
    this.ensure('event.write');
    const ev = this.state.events.find((e) => e.id === id);
    if (!ev) return null;
    const stamp = nowStamp();
    const copy: PlanningEvent = {
      ...ev, id: uid('evt'), title: `${ev.title} (copie)`, createdAt: stamp, updatedAt: stamp, rev: 1, demo: false,
      status: 'planifie', archived: false, exceptions: {}, seriesId: null, history: [{ at: stamp, text: `Dupliqué depuis « ${ev.title} »` }],
    };
    const idMap = new Map<string, string>();
    const src = this.state.tasks.filter((t) => t.eventId === id && (!t.occurrenceKey || t.occurrenceKey === ev.startDate));
    src.forEach((t) => idMap.set(t.id, uid('tsk')));
    const tasks = src.map((t) => ({
      ...t, id: idMap.get(t.id)!, eventId: copy.id, occurrenceKey: t.occurrenceKey ? copy.startDate : null, status: 'a_faire' as const, progress: 0,
      completedAt: null, demo: false, createdAt: stamp, updatedAt: stamp, rev: 1, comments: [],
      checklist: t.checklist.map((c) => ({ ...c, id: uid('chk'), done: false })),
      dependsOn: t.dependsOn.map((d) => idMap.get(d)).filter((x): x is string => !!x),
      history: [{ at: stamp, text: 'Dupliquée avec l’événement' }],
    }));
    await this.repo.events.upsert([copy]);
    await this.repo.tasks.upsert(tasks);
    this.set({ events: [...this.state.events, copy], tasks: [...this.state.tasks, ...tasks] });
    return copy;
  }

  async deleteEvent(id: string, mode: 'delete_tasks' | 'keep_tasks'): Promise<Undo> {
    this.ensure('event.delete');
    const ev = this.state.events.find((e) => e.id === id);
    if (!ev) return async () => {};
    const related = this.state.tasks.filter((t) => t.eventId === id);
    const relatedIds = new Set(related.map((t) => t.id));
    const before = this.state.tasks;
    let after: Task[];
    if (mode === 'delete_tasks') {
      after = before.filter((t) => !relatedIds.has(t.id)).map((t) => (t.dependsOn.some((d) => relatedIds.has(d)) ? { ...t, dependsOn: t.dependsOn.filter((d) => !relatedIds.has(d)) } : t));
      await this.repo.tasks.remove([...relatedIds]);
    } else {
      after = before.map((t) => (relatedIds.has(t.id) ? this.hist({ ...t, eventId: null, occurrenceKey: null }, `Détachée de « ${ev.title} » (supprimé)`) : t));
    }
    const changed = after.filter((t) => !before.includes(t));
    await this.repo.tasks.upsert(changed);
    await this.repo.events.remove([id]);
    this.set({ events: this.state.events.filter((e) => e.id !== id), tasks: after });
    return async () => {
      await this.repo.events.upsert([ev]);
      await this.repo.tasks.upsert(before.filter((t) => relatedIds.has(t.id) || changed.some((c) => c.id === t.id)));
      this.set({ events: [...this.state.events, ev], tasks: before });
    };
  }

  /** Builds the preparation timeline of one occurrence of a recurring event from its template. */
  async generateOccurrencePrep(eventId: string, occ: { key: ISODate; startDate: ISODate }): Promise<number> {
    this.ensure('task.write');
    const ev = this.state.events.find((e) => e.id === eventId);
    const tpl = templateById(ev?.templateId);
    if (!ev || !tpl) return 0;
    if (this.state.tasks.some((t) => t.eventId === eventId && t.occurrenceKey === occ.key)) return 0;
    const codes = Object.fromEntries(this.state.team.map((m) => [m.code, m.id]));
    const tasks = generateTemplateTasks(tpl, ev, codes, occ).map((t) => ({ ...t, demo: false }));
    await this.repo.tasks.upsert(tasks);
    this.set({ tasks: [...this.state.tasks, ...tasks] });
    return tasks.length;
  }

  /* ---------- Tasks ---------- */

  newTaskDraft(p: Partial<Task> = {}): Task {
    const stamp = nowStamp();
    return normalizeTask({ id: uid('tsk'), createdAt: stamp, updatedAt: stamp, rev: 0, title: '', status: 'a_faire', priority: 'normale', ...p });
  }

  private describeTaskChange(a: Task, b: Task): string {
    const parts: string[] = [];
    if (a.title !== b.title) parts.push('Titre modifié');
    if (a.status !== b.status) parts.push(`Statut : ${TASK_STATUS_LABEL[a.status]} → ${TASK_STATUS_LABEL[b.status]}`);
    if (a.dueDate !== b.dueDate || a.startDate !== b.startDate) parts.push(`Dates : ${formatDate(b.startDate, 'dayMonth')} – ${formatDate(b.dueDate, 'dayMonth')}`);
    if (a.assigneeId !== b.assigneeId) parts.push('Responsable modifié');
    if (a.priority !== b.priority) parts.push(`Priorité : ${PRIORITY_LABEL[b.priority]}`);
    if (a.progress !== b.progress && a.status === b.status) parts.push(`Avancement : ${b.progress} %`);
    return parts.join(' ; ');
  }

  async saveTask(task: Task, opts: { datesEditedByHand?: boolean } = {}): Promise<Task> {
    this.ensure('task.write');
    const prev = this.state.tasks.find((t) => t.id === task.id);
    let next = task;
    if (prev && opts.datesEditedByHand && (prev.dueDate !== task.dueDate || prev.startDate !== task.startDate) && task.offsetDays != null) {
      next = { ...next, manualDates: true };
    }
    if (prev) {
      const text = this.describeTaskChange(prev, next);
      next = this.touch(text ? this.hist(next, text) : next);
    } else {
      const stamp = nowStamp();
      next = this.hist({ ...next, rev: 1, createdAt: stamp, updatedAt: stamp }, 'Tâche créée');
    }
    await this.repo.tasks.upsert([next]);
    this.set({ tasks: prev ? this.state.tasks.map((t) => (t.id === next.id ? next : t)) : [...this.state.tasks, next] });
    return next;
  }

  async setTaskStatus(ids: string[], status: Task['status']): Promise<Undo> {
    this.ensure('task.write');
    const before = this.state.tasks.filter((t) => ids.includes(t.id));
    const changed = before.filter((t) => t.status !== status).map((t) => this.touch(this.hist(withStatus(t, status), `Statut : ${TASK_STATUS_LABEL[t.status]} → ${TASK_STATUS_LABEL[status]}`)));
    await this.repo.tasks.upsert(changed);
    const map = new Map(changed.map((t) => [t.id, t]));
    this.set({ tasks: this.state.tasks.map((t) => map.get(t.id) ?? t) });
    return async () => {
      await this.repo.tasks.upsert(before);
      const back = new Map(before.map((t) => [t.id, t]));
      this.set({ tasks: this.state.tasks.map((t) => back.get(t.id) ?? t) });
    };
  }

  async assignTasks(ids: string[], assigneeId: string | null) {
    this.ensure('task.write');
    const changed = this.state.tasks.filter((t) => ids.includes(t.id) && t.assigneeId !== assigneeId)
      .map((t) => this.touch(this.hist({ ...t, assigneeId }, 'Responsable modifié')));
    await this.repo.tasks.upsert(changed);
    const map = new Map(changed.map((t) => [t.id, t]));
    this.set({ tasks: this.state.tasks.map((t) => map.get(t.id) ?? t) });
  }

  async deleteTasks(ids: string[]): Promise<Undo> {
    this.ensure('task.delete');
    const selected = new Set(ids);
    const before = this.state.tasks;
    const removed = before.filter((t) => selected.has(t.id));
    // Removing a dependency edits existing tasks. Their rev must increase,
    // otherwise the cloud repository interprets rev=1 as an INSERT and hits tasks_pkey.
    const cleaned = before
      .filter((t) => !selected.has(t.id) && t.dependsOn.some((d) => selected.has(d)))
      .map((t) => this.touch(this.hist({ ...t, dependsOn: t.dependsOn.filter((d) => !selected.has(d)) }, 'Dépendance supprimée')));

    // Update referencing tasks first. A stale revision must fail BEFORE deletion.
    await this.repo.tasks.upsert(cleaned);
    await this.repo.tasks.remove(ids);
    const changed = new Map(cleaned.map((t) => [t.id, t]));
    this.set({ tasks: before.filter((t) => !selected.has(t.id)).map((t) => changed.get(t.id) ?? t) });
    return async () => {
      // Restored deleted records are new INSERTs, irrespective of their old revision.
      await this.repo.tasks.upsert(removed.map((t) => ({ ...t, rev: 1 })));
      const restoredDependencies = before
        .filter((t) => changed.has(t.id))
        .map((t) => this.touch({ ...t, rev: changed.get(t.id)!.rev }));
      await this.repo.tasks.upsert(restoredDependencies);
      const restored = new Map(restoredDependencies.map((t) => [t.id, t]));
      this.set({ tasks: before.map((t) => restored.get(t.id) ?? (selected.has(t.id) ? { ...t, rev: 1 } : t)) });
    };
  }

  /* ---------- Team ---------- */

  async saveMember(m: TeamMember) {
    this.ensure('team.manage');
    const code = m.code.trim().toUpperCase();
    if (!code) throw new Error('L’identifiant est obligatoire.');
    if (this.state.team.some((x) => x.id !== m.id && x.code === code)) throw new Error(`L’identifiant ${code} existe déjà.`);
    const exists = this.state.team.some((x) => x.id === m.id);
    const saved = exists ? this.touch({ ...m, code }) : { ...m, code, rev: 1 };
    await this.repo.team.upsert([saved]);
    this.set({ team: exists ? this.state.team.map((x) => (x.id === m.id ? saved : x)) : [...this.state.team, saved] });
  }

  async deleteMember(id: string, reassignTo: string | null) {
    this.ensure('team.manage');
    if (id === this.state.settings.currentUserId) throw new Error('Impossible de supprimer l’utilisateur actuellement sélectionné.');
    const tasks = this.state.tasks.filter((t) => t.assigneeId === id).map((t) => this.touch(this.hist({ ...t, assigneeId: reassignTo }, 'Réassignée (membre supprimé)')));
    const events = this.state.events.filter((e) => e.ownerId === id).map((e) => this.touch(this.hist({ ...e, ownerId: reassignTo }, 'Responsable réassigné (membre supprimé)')));
    await this.repo.tasks.upsert(tasks);
    await this.repo.events.upsert(events);
    await this.repo.team.remove([id]);
    const tm = new Map(tasks.map((t) => [t.id, t]));
    const em = new Map(events.map((e) => [e.id, e]));
    this.set({
      team: this.state.team.filter((m) => m.id !== id),
      tasks: this.state.tasks.map((t) => tm.get(t.id) ?? t),
      events: this.state.events.map((e) => em.get(e.id) ?? e),
    });
  }

  /* ---------- Settings & reminders ---------- */

  async updateSettings(patch: Partial<Settings>, opts: { asUserSwitch?: boolean } = {}) {
    if (!opts.asUserSwitch) this.ensure('settings.manage');
    const settings = normalizeSettings({ ...this.state.settings, ...patch }, ENV);
    await this.repo.settings.save(settings);
    this.set({ settings });
  }

  async setReminderState(id: string, patch: Partial<ReminderState>) {
    const next = { ...(this.state.reminderStates[id] ?? { id }), ...patch, id };
    await this.repo.reminders.upsert([next]);
    this.set({ reminderStates: { ...this.state.reminderStates, [id]: next } });
  }

  /* ---------- Courses (read-only source) ---------- */

  async refreshCourses(): Promise<CourseSnapshot> {
    this.set({ courseSyncing: true });
    try {
      const prev = this.state.courseSnapshot;
      const snap = await syncCourses(this.state.settings.courseSourceUrl, prev && prev.source !== 'demo' ? prev : null);
      await this.repo.courseCache.save(snap);
      this.set({ courseSnapshot: snap });
      return snap;
    } finally {
      this.set({ courseSyncing: false });
    }
  }

  async importCourseFile(fileName: string, text: string): Promise<CourseSnapshot> {
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { throw new Error('Le fichier n’est pas un JSON valide.'); }
    const snap = snapshotFromRaw(raw, 'file', { fileName });
    await this.repo.courseCache.save(snap);
    this.set({ courseSnapshot: snap });
    return snap;
  }

  async useDemoCourses() {
    throw new Error('Les formations fictives ne sont pas disponibles.');
    const snap = demoSnapshot('indisponibles.', this.state.courseSnapshot?.lastSuccessAt ?? null);
    await this.repo.courseCache.save(snap);
    this.set({ courseSnapshot: snap });
  }

  /* ---------- Data management ---------- */

  exportData(): PlanningData {
    const s = this.state;
    return { events: s.events, tasks: s.tasks, team: s.team, reminders: Object.values(s.reminderStates), settings: s.settings };
  }

  async replaceData(data: PlanningData) {
    this.ensure('data.manage');
    await this.repo.replaceAll(data);
    this.set({
      events: data.events, tasks: data.tasks, team: data.team, settings: data.settings,
      reminderStates: Object.fromEntries(data.reminders.map((r) => [r.id, r])),
    });
  }

  async resetDemo() {
    this.ensure('data.manage');
    await this.replaceData(buildDemoData(this.state.today, ENV));
    const meta = await this.repo.meta.get();
    await this.repo.meta.save({ ...(meta ?? { createdAt: nowStamp() }), schemaVersion: CURRENT_SCHEMA_VERSION, seededDemo: true });
  }

  async startEmpty() {
    this.ensure('data.manage');
    const stamp = nowStamp();
    const admin: TeamMember = { id: uid('mbr'), createdAt: stamp, updatedAt: stamp, rev: 1, code: 'ADMIN-01', label: 'Administration', kind: 'personne', role: 'administrateur', color: '#1F63D0', active: true };
    await this.replaceData({ events: [], tasks: [], team: [admin], reminders: [], settings: { ...this.state.settings, currentUserId: admin.id } });
  }
}

export const StoreContext = createContext<AppStore | null>(null);

export function useStore(): AppStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreContext manquant');
  return s;
}

/** Subscribe to a slice. Selectors must return existing references (slices), not new objects. */
export function useAppState<T>(selector: (s: AppState) => T): T {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}
