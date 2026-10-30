import { formatDate, formatRange, formatTimestamp, ymd } from '../domain/dates';
import { computeProgress, isDone, isOverdue, taskEnd, taskStart } from '../domain/planning';
import { expandEvents } from '../domain/recurrence';
import { CATEGORY_LABEL, EVENT_STATUS_LABEL, luxembourgHolidays, TASK_STATUS_LABEL } from '../domain/reference';
import type { Course, ISODate, PlanningEvent, Task, TeamMember } from '../domain/types';
import { AnnualCourseDay, AnnualInput, AnnualOptions, ChecklistInput, OpsGroup, OpsInput } from './layouts';
import { Orientation, PaperFormat } from './model';
import { encodeQr } from './qr';
import { memberDisplayName } from '../ui/kit';

export const CATEGORY_SHORT: Record<string, string> = {
  ACP: 'Bien-être', ART: 'Arts', TIC: 'Numérique', LAN: 'Langues', SCM: 'Sciences', SCH: 'Sc. humaines', CIN: 'Nationalité',
};

export interface PrintData {
  events: PlanningEvent[];
  tasks: Task[];
  team: TeamMember[];
  courses: Course[];
  today: ISODate;
  publicAppUrl: string;
}

export interface PrintScope { ownerId: string | null; eventId: string | null }

export function validPublicUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function scopeText(scope: PrintScope, data: PrintData): string | undefined {
  const parts: string[] = [];
  if (scope.ownerId) parts.push(`Responsable : ${memberDisplayName(data.team.find((m) => m.id === scope.ownerId))}`);
  if (scope.eventId) parts.push(`Projet : ${data.events.find((e) => e.id === scope.eventId)?.title ?? '?'}`);
  return parts.length ? parts.join('  |  ') : undefined;
}

const taskInScope = (t: Task, s: PrintScope) => (!s.ownerId || t.assigneeId === s.ownerId) && (!s.eventId || t.eventId === s.eventId);
const eventInScope = (e: PlanningEvent, s: PrintScope) => (!s.ownerId || e.ownerId === s.ownerId) && (!s.eventId || e.id === s.eventId);

export function buildAnnualInput(
  data: PrintData,
  o: { year: number; format: PaperFormat; orientation: Orientation; include: AnnualOptions; scope: PrintScope; demoCourses: boolean },
): AnnualInput {
  const from = ymd(o.year, 1, 1), to = ymd(o.year, 12, 31);
  const items = expandEvents(data.events.filter((e) => eventInScope(e, o.scope)), from, to).map((occ) => ({
    title: occ.title, startDate: occ.startDate, endDate: occ.endDate, kind: occ.event.kind, cancelled: occ.event.status === 'annule',
  }));
  const markers = data.tasks
    .filter((t) => t.dueDate && t.dueDate >= from && t.dueDate <= to && taskInScope(t, o.scope) && (t.milestone || !isDone(t)))
    .map((t) => ({ date: t.dueDate!, title: t.title, milestone: t.milestone, overdue: isOverdue(t, data.today) }));
  const courseDays = new Map<ISODate, AnnualCourseDay>();
  if (o.include.courses) {
    const tmp = new Map<ISODate, Map<string, number>>();
    for (const c of data.courses) {
      const label = CATEGORY_SHORT[c.categoryCode] ?? c.category;
      for (const s of c.sessions) {
        if (s.date < from || s.date > to) continue;
        let g = tmp.get(s.date);
        if (!g) tmp.set(s.date, (g = new Map()));
        g.set(label, (g.get(label) ?? 0) + 1);
      }
    }
    for (const [d, g] of tmp) {
      const groups = [...g].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
      courseDays.set(d, { total: groups.reduce((a, x) => a + x.count, 0), groups });
    }
  }
  const url = validPublicUrl(data.publicAppUrl);
  const scope = scopeText(o.scope, data);
  return {
    year: o.year, format: o.format, orientation: o.orientation,
    title: `Planning annuel ${o.year}`,
    subtitle: `UniPop COMMAND — Planification & coordination`,
    generatedText: `Généré le ${formatTimestamp(new Date().toISOString())}`,
    filterText: scope,
    items, markers, courseDays,
    holidays: o.include.holidays ? luxembourgHolidays(o.year) : [],
    options: o.include,
    qr: url ? { modules: encodeQr(url), caption: 'Calendrier en ligne' } : null,
  };
}

export function buildOpsInput(
  data: PrintData,
  o: { format: PaperFormat; orientation: Orientation; rangeStart: ISODate; rangeEnd: ISODate; includeDone: boolean; scope: PrintScope },
): OpsInput {
  const code = (id?: string | null) => memberDisplayName(data.team.find((m) => m.id === id));
  const inRange = (s: ISODate | null, e: ISODate | null) => !!s && !!e && s <= o.rangeEnd && e >= o.rangeStart;
  const toOps = (t: Task) => ({
    title: t.title, start: taskStart(t), due: taskEnd(t), status: t.status, progress: t.progress, milestone: t.milestone,
    overdue: isOverdue(t, data.today), owner: code(t.assigneeId),
  });
  const pick = (list: Task[]) => list
    .filter((t) => taskInScope(t, o.scope) && (o.includeDone || !isDone(t)) && inRange(taskStart(t), taskEnd(t)))
    .sort((a, b) => (taskStart(a) ?? '').localeCompare(taskStart(b) ?? '') || (taskEnd(a) ?? '').localeCompare(taskEnd(b) ?? ''));
  const groups: OpsGroup[] = [];
  const events = data.events
    .filter((e) => !e.archived && (!o.scope.eventId || e.id === o.scope.eventId))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (const e of events) {
    const all = data.tasks.filter((t) => t.eventId === e.id);
    const tasks = pick(all);
    const visible = inRange(e.startDate, e.endDate) && (!o.scope.ownerId || e.ownerId === o.scope.ownerId);
    if (!tasks.length && (!visible || e.recurrence)) continue;
    groups.push({
      title: e.title, start: e.startDate, end: e.endDate, kind: e.kind, owner: code(e.ownerId),
      progress: all.length ? computeProgress(all, data.today).pct : null, tasks: tasks.map(toOps),
    });
  }
  if (!o.scope.eventId) {
    const loose = pick(data.tasks.filter((t) => !t.eventId));
    if (loose.length) groups.push({ title: 'Tâches hors projet', start: o.rangeStart, end: o.rangeStart, kind: 'evenement', owner: '—', progress: null, tasks: loose.map(toOps) });
  }
  return {
    format: o.format, orientation: o.orientation,
    title: 'Planning opérationnel',
    subtitle: `${formatDate(o.rangeStart, 'medium')} – ${formatDate(o.rangeEnd, 'medium')}`,
    generatedText: `Généré le ${formatTimestamp(new Date().toISOString())}`,
    filterText: scopeText(o.scope, data),
    rangeStart: o.rangeStart, rangeEnd: o.rangeEnd, today: data.today, groups,
  };
}

export function buildChecklistInput(data: PrintData, eventId: string, occurrenceKey?: ISODate | null): ChecklistInput {
  const e = data.events.find((x) => x.id === eventId);
  if (!e) throw new Error('Événement introuvable.');
  const code = (id?: string | null) => {
    const m = data.team.find((x) => x.id === id);
    return m ? memberDisplayName(m) : 'À assigner';
  };
  const tasks = data.tasks
    .filter((t) => t.eventId === e.id && (!occurrenceKey || !t.occurrenceKey || t.occurrenceKey === occurrenceKey))
    .sort((a, b) => (taskEnd(a) ?? '9999').localeCompare(taskEnd(b) ?? '9999'));
  const p = computeProgress(tasks, data.today);
  const time = e.startTime ? `, ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}` : '';
  const categoryLabel = e.kind === 'projet' ? 'Projet' : CATEGORY_LABEL[e.category];
  const subject = (e.description ?? '').split(/\r?\n/).map((line) => line.trim()).find((line) => line && !/^https?:\/\//i.test(line)) ?? '';
  const genericTitle = e.title.trim().toLowerCase() === categoryLabel.toLowerCase();
  return {
    title: genericTitle && subject ? `${e.title} — ${subject}` : e.title,
    lines: [
      ['Date', `${formatRange(e.startDate, e.endDate)}${time}`],
      ['Lieu', e.location || '—'],
      ['Catégorie', categoryLabel],
      ...(subject ? [['Objet', subject] as [string, string]] : []),
      ['Responsable', code(e.ownerId)],
      ['Statut', EVENT_STATUS_LABEL[e.status]],
      ['Avancement', `${p.done} / ${p.total} tâches terminées (${p.pct} %)`],
    ],
    tasks: tasks.map((t) => ({
      title: t.title, description: t.description ?? '', owner: code(t.assigneeId), due: t.dueDate ? formatDate(t.dueDate, 'numeric') : '—',
      status: TASK_STATUS_LABEL[t.status], done: isDone(t), milestone: t.milestone, overdue: isOverdue(t, data.today),
    })),
    generatedText: `UniPop COMMAND — généré le ${formatTimestamp(new Date().toISOString())}`,
    notesLines: 6,
  };
}
