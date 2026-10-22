import { addDays, diffDays } from './dates';
import { nowStamp, uid } from './reference';
import type { EventCategory, ISODate, PlanningEvent, Priority, Task } from './types';

/* ---------- Event templates ---------- */

export interface TemplateTask {
  title: string;
  /** Due date relative to the event start (negative = before). */
  offset: number;
  /** Working span in days, ending on the due date. */
  duration: number;
  /** Team code used as default assignee when that member exists. */
  assignee?: string;
  milestone?: boolean;
  priority?: Priority;
  /** Indexes of template tasks this one depends on. */
  after?: number[];
}

export interface EventTemplate {
  id: string;
  name: string;
  category: EventCategory;
  kind: 'evenement' | 'projet';
  defaultDurationDays: number;
  description: string;
  tasks: TemplateTask[];
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: 'tpl-conference', name: 'Conférence', category: 'conference', kind: 'evenement', defaultDurationDays: 1,
    description: 'Conférence publique avec intervenants, inscriptions et communication.',
    tasks: [
      { title: 'Définir le thème et le programme', offset: -90, duration: 14, assignee: 'ORG-02', priority: 'haute' },
      { title: 'Réserver la salle et le matériel', offset: -75, duration: 5, assignee: 'ORG-03' },
      { title: 'Confirmer les intervenants', offset: -60, duration: 10, assignee: 'ORG-02', milestone: true, priority: 'haute' },
      { title: 'Lancer la communication', offset: -45, duration: 7, assignee: 'COM-01', after: [2] },
      { title: 'Ouvrir les inscriptions', offset: -40, duration: 1, assignee: 'ORG-03', after: [3] },
      { title: 'Préparer la technique (son, projection, diffusion)', offset: -10, duration: 5, assignee: 'TECH-01', after: [1] },
      { title: 'Briefing de l’équipe sur place', offset: -2, duration: 1, assignee: 'ORG-01' },
      { title: 'Jour J : conférence', offset: 0, duration: 1, milestone: true, assignee: 'ORG-01', priority: 'critique', after: [5, 6] },
      { title: 'Bilan, remerciements et diffusion des supports', offset: 10, duration: 7, assignee: 'COM-01' },
    ],
  },
  {
    id: 'tpl-portes-ouvertes', name: 'Journée portes ouvertes', category: 'portes_ouvertes', kind: 'evenement', defaultDurationDays: 1,
    description: 'Présentation des formations au public, ateliers découverte et accueil.',
    tasks: [
      { title: 'Valider le concept et le parcours visiteurs', offset: -60, duration: 10, assignee: 'ORG-01', priority: 'haute' },
      { title: 'Planifier les ateliers découverte avec les formateurs', offset: -45, duration: 14, assignee: 'ORG-02' },
      { title: 'Commander signalétique et supports imprimés', offset: -30, duration: 5, assignee: 'COM-01' },
      { title: 'Campagne réseaux sociaux et presse locale', offset: -21, duration: 21, assignee: 'COM-01', after: [2] },
      { title: 'Organiser l’accueil et le planning des bénévoles', offset: -10, duration: 7, assignee: 'ORG-03' },
      { title: 'Installer bornes d’inscription et Wi-Fi invités', offset: -1, duration: 2, assignee: 'TECH-01' },
      { title: 'Jour J : portes ouvertes', offset: 0, duration: 1, milestone: true, assignee: 'ORG-01', priority: 'critique' },
      { title: 'Analyser la fréquentation et les inscriptions', offset: 7, duration: 5, assignee: 'ORG-02' },
    ],
  },
  {
    id: 'tpl-lancement', name: 'Lancement de cours', category: 'lancement_cours', kind: 'evenement', defaultDurationDays: 1,
    description: 'Ouverture d’une nouvelle offre de cours : programme, salles, inscriptions.',
    tasks: [
      { title: 'Finaliser l’offre et les descriptifs de cours', offset: -60, duration: 14, assignee: 'ORG-02', priority: 'haute' },
      { title: 'Attribuer les salles et créneaux', offset: -45, duration: 7, assignee: 'ORG-03' },
      { title: 'Publication du programme', offset: -40, duration: 1, milestone: true, assignee: 'COM-01', after: [0, 1] },
      { title: 'Vérifier les inscriptions en ligne', offset: -30, duration: 3, assignee: 'TECH-01' },
      { title: 'Relancer les cours sous le seuil minimal', offset: -14, duration: 7, assignee: 'ORG-02' },
      { title: 'Préparer les dossiers formateurs', offset: -5, duration: 5, assignee: 'ORG-03' },
      { title: 'Premier jour des cours', offset: 0, duration: 1, milestone: true, assignee: 'ORG-02' },
    ],
  },
  {
    id: 'tpl-campagne', name: 'Campagne de communication', category: 'campagne', kind: 'projet', defaultDurationDays: 42,
    description: 'Campagne multicanale autour d’un programme ou d’un événement.',
    tasks: [
      { title: 'Brief et objectifs de la campagne', offset: -14, duration: 5, assignee: 'COM-01', priority: 'haute' },
      { title: 'Création des visuels et textes', offset: -3, duration: 10, assignee: 'COM-01' },
      { title: 'Validation par la direction', offset: -1, duration: 2, assignee: 'ORG-01', milestone: true, after: [1] },
      { title: 'Diffusion vague 1 (newsletter, réseaux)', offset: 0, duration: 3, assignee: 'COM-01' },
      { title: 'Diffusion vague 2 (affichage, partenaires)', offset: 14, duration: 7, assignee: 'COM-01' },
      { title: 'Rapport de performance', offset: 42, duration: 5, assignee: 'COM-01' },
    ],
  },
  {
    id: 'tpl-institutionnel', name: 'Événement institutionnel annuel', category: 'institutionnel', kind: 'evenement', defaultDurationDays: 1,
    description: 'Assemblée, cérémonie ou rendez-vous annuel avec les partenaires institutionnels.',
    tasks: [
      { title: 'Fixer l’ordre du jour avec la direction', offset: -45, duration: 7, assignee: 'ORG-01', priority: 'haute' },
      { title: 'Envoyer les invitations officielles', offset: -30, duration: 2, assignee: 'ORG-03', milestone: true },
      { title: 'Préparer le rapport d’activité', offset: -14, duration: 14, assignee: 'ORG-02' },
      { title: 'Logistique, salle et traiteur', offset: -7, duration: 5, assignee: 'ORG-03' },
      { title: 'Jour J', offset: 0, duration: 1, milestone: true, assignee: 'ORG-01', priority: 'critique' },
      { title: 'Procès-verbal et suivi des décisions', offset: 7, duration: 5, assignee: 'ORG-01' },
    ],
  },
];

export const templateById = (id: string | null | undefined) => EVENT_TEMPLATES.find((t) => t.id === id) ?? null;

/** Builds preparation tasks for an event from a template. Assignee codes resolve to team ids. */
export function generateTemplateTasks(
  template: EventTemplate,
  event: Pick<PlanningEvent, 'id' | 'startDate' | 'demo'>,
  memberIdByCode: Record<string, string>,
  occurrence?: { key: ISODate; startDate: ISODate },
): Task[] {
  const stamp = nowStamp();
  const anchor = occurrence?.startDate ?? event.startDate;
  const ids = template.tasks.map(() => uid('tsk'));
  return template.tasks.map((t, i) => {
    const due = addDays(anchor, t.offset);
    const start = addDays(due, -(Math.max(1, t.duration) - 1));
    return {
      id: ids[i],
      createdAt: stamp, updatedAt: stamp, rev: 1, demo: event.demo,
      title: t.title, description: '', eventId: event.id, occurrenceKey: occurrence?.key ?? null,
      assigneeId: t.assignee ? memberIdByCode[t.assignee] ?? null : null,
      startDate: t.milestone ? due : start, dueDate: due,
      priority: t.priority ?? 'normale', status: 'a_faire', progress: 0,
      dependsOn: (t.after ?? []).map((k) => ids[k]).filter(Boolean),
      checklist: [], comments: [], attachments: [], notes: '',
      milestone: !!t.milestone, offsetDays: t.offset, manualDates: false, completedAt: null,
      history: [{ at: stamp, text: `Créée depuis le modèle « ${template.name} »` }],
    };
  });
}

/* ---------- Task helpers ---------- */

export const isDone = (t: Task) => t.status === 'termine';
export const isOverdue = (t: Task, today: ISODate) => !isDone(t) && !!t.dueDate && t.dueDate < today;
export const taskStart = (t: Task) => t.startDate ?? t.dueDate ?? null;
export const taskEnd = (t: Task) => t.dueDate ?? t.startDate ?? null;

export interface Progress { total: number; done: number; overdue: number; pct: number }

/** Completion of a project: finished tasks count 100 %, others their own progress. */
export function computeProgress(tasks: Task[], today: ISODate): Progress {
  if (!tasks.length) return { total: 0, done: 0, overdue: 0, pct: 0 };
  let sum = 0, done = 0, overdue = 0;
  for (const t of tasks) {
    if (isDone(t)) { done++; sum += 100; } else sum += Math.min(99, Math.max(0, t.progress || 0));
    if (isOverdue(t, today)) overdue++;
  }
  return { total: tasks.length, done, overdue, pct: Math.round(sum / tasks.length) };
}

/** Status change keeps progress and completion timestamps coherent. */
export function withStatus(t: Task, status: Task['status'], stamp = nowStamp()): Task {
  if (status === t.status) return t;
  return {
    ...t,
    status,
    progress: status === 'termine' ? 100 : t.status === 'termine' ? Math.min(t.progress, 90) : t.progress,
    completedAt: status === 'termine' ? stamp : null,
  };
}

/* ---------- Rescheduling relative deadlines ---------- */

export interface RescheduleLine {
  taskId: string;
  title: string;
  manual: boolean;
  oldStart: ISODate | null;
  oldDue: ISODate | null;
  newStart: ISODate | null;
  newDue: ISODate | null;
  include: boolean;
}

/**
 * Proposal when an event moves from oldStart to newStart. Open tasks shift by
 * the same delta; manually adjusted tasks are listed but not selected, so
 * nothing is ever overwritten without confirmation.
 */
export function proposeReschedule(oldStart: ISODate, newStart: ISODate, tasks: Task[]): RescheduleLine[] {
  const delta = diffDays(newStart, oldStart);
  if (delta === 0) return [];
  return tasks
    .filter((t) => !isDone(t) && (t.dueDate || t.startDate))
    .map((t) => {
      const relDue = t.offsetDays != null && !t.manualDates ? addDays(newStart, t.offsetDays) : null;
      const newDue = t.dueDate ? relDue ?? addDays(t.dueDate, delta) : null;
      const shift = t.dueDate && newDue ? diffDays(newDue, t.dueDate) : delta;
      return {
        taskId: t.id, title: t.title, manual: t.manualDates,
        oldStart: t.startDate ?? null, oldDue: t.dueDate ?? null,
        newStart: t.startDate ? addDays(t.startDate, shift) : null, newDue,
        include: !t.manualDates,
      };
    });
}

export function applyReschedule(tasks: Task[], lines: RescheduleLine[], stamp = nowStamp()): Task[] {
  const byId = new Map(lines.filter((l) => l.include).map((l) => [l.taskId, l]));
  const changed: Task[] = [];
  for (const t of tasks) {
    const l = byId.get(t.id);
    if (!l) continue;
    changed.push({
      ...t,
      startDate: l.newStart, dueDate: l.newDue, updatedAt: stamp, rev: t.rev + 1,
      history: [...t.history, { at: stamp, text: 'Dates recalculées après déplacement de l’événement' }],
    });
  }
  return changed;
}

/* ---------- Dependencies ---------- */

/** Returns an error message, or null when `dependsOn` is valid for `taskId`. */
export function validateDependencies(taskId: string, dependsOn: string[], all: Task[]): string | null {
  const byId = new Map(all.map((t) => [t.id, t]));
  for (const d of dependsOn) {
    if (d === taskId) return 'Une tâche ne peut pas dépendre d’elle-même.';
    if (!byId.has(d)) return 'Une dépendance fait référence à une tâche inexistante.';
  }
  const graph = new Map(all.map((t) => [t.id, t.id === taskId ? dependsOn : t.dependsOn]));
  const seen = new Set<string>();
  const stack = [...dependsOn];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) return 'Cette dépendance créerait un cycle.';
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(graph.get(cur) ?? []));
  }
  return null;
}

/** Dependencies that finish after this task starts. */
export function dependencyConflicts(task: Task, byId: Map<string, Task>): Task[] {
  const start = taskStart(task);
  if (!start) return [];
  return task.dependsOn
    .map((id) => byId.get(id))
    .filter((d): d is Task => !!d && !isDone(d) && !!taskEnd(d) && taskEnd(d)! >= start);
}
