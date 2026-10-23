import { addDays, diffDays, ymd } from '../domain/dates';
import { generateTemplateTasks, templateById } from '../domain/planning';
import { nowStamp, uid } from '../domain/reference';
import type { ISODate, PlanningEvent, Priority, Task, TaskStatus, TeamMember } from '../domain/types';
import type { PlanningData } from './contracts';
import { defaultSettings } from './schema';

/**
 * Demonstration year. Everything is fictional and flagged `demo: true`.
 * Dates are anchored on the current Luxembourg date so that overdue tasks,
 * upcoming reminders and the active project always make sense.
 */
export function buildDemoData(today: ISODate, env?: Partial<Record<string, string>>): PlanningData {
  const Y = Number(today.slice(0, 4));
  const stamp = nowStamp();
  const meta = { createdAt: stamp, updatedAt: stamp, rev: 1, demo: true };
  const created = [{ at: stamp, text: 'Créé (données de démonstration)' }];

  const team: TeamMember[] = [
    ['YVES', 'Communication', 'personne', 'administrateur', '#C2416B'],
    ['SONJA', 'Coordination des formations', 'personne', 'coordinateur', '#0F8A7A'],
    ['MARIA', 'Accueil et inscriptions', 'personne', 'collaborateur', '#7048E8'],
    ['STUP', 'Support technique', 'personne', 'collaborateur', '#B45F06'],
    ['GILLES', 'Formations UniPop', 'personne', 'collaborateur', '#1F63D0'],
    ['FRANK', 'Event / Formations', 'equipe', 'coordinateur', '#3B4A6B'],
    ['EXPLOSE', 'Consultation (conseil)', 'personne', 'lecture_seule', '#6B7280'],
  ].map(([code, label, kind, role, color]) => ({
    ...meta, id: uid('mbr'), code, label, kind: kind as TeamMember['kind'], role: role as TeamMember['role'], color, active: true,
  }));
  const M = Object.fromEntries(team.map((m) => [m.code, m.id])) as Record<string, string>;

  const events: PlanningEvent[] = [];
  const tasks: Task[] = [];

  const ev = (p: Partial<PlanningEvent> & Pick<PlanningEvent, 'title' | 'startDate'>): PlanningEvent => {
    const e: PlanningEvent = {
      ...meta, id: uid('evt'), kind: 'evenement', description: '', category: 'autre', location: 'Université Populaire Belval, Esch-sur-Alzette',
      endDate: p.startDate, startTime: null, endTime: null, organizer: 'UniPop', ownerId: M['YVES'], priority: 'normale',
      status: 'planifie', notes: '', attachments: [], recurrence: null, exceptions: {}, seriesId: null, templateId: null,
      archived: false, history: created, ...p,
    };
    events.push(e);
    return e;
  };

  /** Template tasks with plausible statuses relative to today; `late` keeps chosen ones open. */
  const fromTemplate = (e: PlanningEvent, templateId: string, late: string[] = [], occ?: { key: ISODate; startDate: ISODate }) => {
    const tpl = templateById(templateId)!;
    for (const t of generateTemplateTasks(tpl, e, M, occ)) {
      let status: TaskStatus = 'a_faire';
      let progress = 0;
      if (t.dueDate! < today) { status = 'termine'; progress = 100; }
      else if (t.startDate! <= today) { status = 'en_cours'; progress = 40; }
      if (late.includes(t.title)) { status = t.title.startsWith('Lancer') ? 'en_cours' : 'a_faire'; progress = t.title.startsWith('Lancer') ? 70 : 0; }
      tasks.push({ ...t, status, progress, completedAt: status === 'termine' ? stamp : null });
    }
  };

  const task = (p: Partial<Task> & Pick<Task, 'title'>) => {
    const t: Task = {
      ...meta, id: uid('tsk'), description: '', eventId: null, occurrenceKey: null, assigneeId: null, startDate: null, dueDate: null,
      priority: 'normale' as Priority, status: 'a_faire', progress: 0, dependsOn: [], checklist: [], comments: [], attachments: [],
      notes: '', milestone: false, offsetDays: null, manualDates: false, completedAt: null, history: created, ...p,
    };
    if (t.status === 'termine') { t.progress = 100; t.completedAt = stamp; }
    tasks.push(t);
    return t;
  };

  // Q1–Q4: annual coordination project
  const coord = ev({
    kind: 'projet', title: `Coordination annuelle des formations ${Y}`, category: 'formation', startDate: `${Y}-01-05`, endDate: `${Y}-12-18`,
    ownerId: M['SONJA'], priority: 'haute', status: 'en_preparation',
    description: 'Pilotage des programmes saisonniers : appels aux formateurs, validation, publication et bilans.',
  });
  task({ title: 'Programme de printemps validé', eventId: coord.id, assigneeId: M['SONJA'], startDate: `${Y}-03-13`, dueDate: `${Y}-03-13`, milestone: true, status: 'termine' });
  task({ title: 'Bilan du programme d’hiver', eventId: coord.id, assigneeId: M['SONJA'], startDate: `${Y}-03-16`, dueDate: `${Y}-03-27`, status: 'termine' });
  task({ title: 'Programme d’automne validé', eventId: coord.id, assigneeId: M['YVES'], startDate: `${Y}-06-26`, dueDate: `${Y}-06-26`, milestone: true, status: 'termine' });
  const survey = task({
    title: 'Enquête de satisfaction des participants', eventId: coord.id, assigneeId: M['MARIA'], startDate: addDays(today, -26), dueDate: addDays(today, -5),
    status: 'en_cours', progress: 60, priority: 'haute',
    checklist: [
      { id: uid('chk'), text: 'Questionnaire validé', done: true },
      { id: uid('chk'), text: 'Envoi aux participants', done: true },
      { id: uid('chk'), text: 'Relance', done: false },
      { id: uid('chk'), text: 'Synthèse des résultats', done: false },
    ],
  });
  const call = task({ title: `Programme d’hiver ${Y + 1} : appel aux formateurs`, eventId: coord.id, assigneeId: M['SONJA'], startDate: addDays(today, -8), dueDate: addDays(today, 12), status: 'en_cours', progress: 30, dependsOn: [survey.id] });
  task({ title: `Programme d’hiver ${Y + 1} validé`, eventId: coord.id, assigneeId: M['YVES'], startDate: `${Y}-12-11`, dueDate: `${Y}-12-11`, milestone: true, priority: 'haute', dependsOn: [call.id] });

  // Q1: recurring steering committee (one cancelled and one moved occurrence)
  ev({
    title: 'Comité de pilotage mensuel', category: 'reunion', startDate: `${Y}-01-13`, startTime: '09:30', endTime: '11:00', location: 'Salle du conseil, Belval',
    status: 'confirme', recurrence: { freq: 'monthly', interval: 1, until: null, count: null },
    exceptions: { [`${Y}-08-13`]: { cancelled: true }, [`${Y}-11-13`]: { startDate: `${Y}-11-17`, endDate: `${Y}-11-17`, notes: 'Décalé (pont de la Toussaint).' } },
    description: 'Suivi des indicateurs, arbitrages budgétaires et validation des priorités du mois.',
  });
  ev({ title: 'Remise du rapport d’activité', category: 'institutionnel', startDate: `${Y}-02-27`, priority: 'haute', status: 'termine', recurrence: { freq: 'yearly', interval: 1 } });

  // Q1: past conference (template, all done)
  const conf1 = ev({ title: 'Conférence « Apprendre à tout âge »', category: 'conference', templateId: 'tpl-conference', startDate: `${Y}-03-19`, startTime: '18:30', endTime: '21:00', status: 'termine', ownerId: M['FRANK'] });
  fromTemplate(conf1, 'tpl-conference');

  // Q2
  const jpo = ev({ title: 'Journée portes ouvertes de printemps', category: 'portes_ouvertes', templateId: 'tpl-portes-ouvertes', startDate: `${Y}-05-16`, startTime: '10:00', endTime: '17:00', status: 'termine', ownerId: M['FRANK'] });
  fromTemplate(jpo, 'tpl-portes-ouvertes');
  const camp = ev({ kind: 'projet', title: 'Campagne « Programme d’automne »', category: 'campagne', templateId: 'tpl-campagne', startDate: `${Y}-06-15`, endDate: `${Y}-07-26`, status: 'termine', ownerId: M['GILLES'] });
  fromTemplate(camp, 'tpl-campagne');
  const ag = ev({
    title: 'Assemblée générale annuelle', category: 'institutionnel', templateId: 'tpl-institutionnel', startDate: `${Y}-06-04`, startTime: '18:00', endTime: '20:00',
    status: 'confirme', priority: 'haute', recurrence: { freq: 'yearly', interval: 1 }, location: 'Auditorium, Belval',
  });
  fromTemplate(ag, 'tpl-institutionnel', [], { key: `${Y}-06-04`, startDate: `${Y}-06-04` });
  fromTemplate(ag, 'tpl-institutionnel', [], { key: `${Y + 1}-06-04`, startDate: `${Y + 1}-06-04` });

  // Q3
  const tech = ev({ kind: 'projet', title: 'Préparation technique de la rentrée', category: 'technique', startDate: `${Y}-07-06`, endDate: `${Y}-09-18`, ownerId: M['STUP'], status: 'termine' });
  [
    ['Audit Wi-Fi des salles de Belval', `${Y}-07-06`, `${Y}-07-17`],
    ['Mise à jour des postes de la salle informatique', `${Y}-07-20`, `${Y}-08-14`],
    ['Test de bout en bout des inscriptions en ligne', `${Y}-08-24`, `${Y}-09-04`],
    ['Écrans d’affichage du hall : planning du jour', `${Y}-09-07`, `${Y}-09-18`],
  ].forEach(([title, s, d]) => task({ title, eventId: tech.id, assigneeId: M['STUP'], startDate: s, dueDate: d, status: d < today ? 'termine' : 'en_cours' }));
  const launch = ev({ title: 'Lancement des cours d’automne', category: 'lancement_cours', templateId: 'tpl-lancement', startDate: `${Y}-09-28`, status: 'termine', ownerId: M['SONJA'] });
  fromTemplate(launch, 'tpl-lancement');

  // Q4: the active event, with overdue preparation
  const confDate = addDays(today, 28);
  const conf2 = ev({
    title: 'Conférence « IA et formation des adultes »', category: 'conference', templateId: 'tpl-conference', startDate: confDate, startTime: '18:30', endTime: '21:00',
    status: 'en_preparation', priority: 'haute', ownerId: M['FRANK'],
    description: 'Table ronde sur les usages de l’intelligence artificielle dans la formation continue, suivie d’ateliers découverte.',
  });
  fromTemplate(conf2, 'tpl-conference', ['Lancer la communication', 'Ouvrir les inscriptions']);

  const soiree = ev({ title: 'Soirée des formateurs', category: 'institutionnel', startDate: addDays(today, 42), startTime: '18:30', endTime: '22:00', ownerId: M['YVES'], location: 'Foyer, Belval' });
  task({ title: 'Réserver la salle', eventId: soiree.id, startDate: addDays(today, -2), dueDate: addDays(today, 3), priority: 'haute' });
  task({ title: 'Envoyer les invitations aux formateurs', eventId: soiree.id, assigneeId: M['MARIA'], startDate: addDays(today, 5), dueDate: addDays(today, 10) });
  task({ title: 'Commander le traiteur', eventId: soiree.id, assigneeId: M['FRANK'], startDate: addDays(today, 20), dueDate: addDays(today, 30) });

  ev({ title: 'Bilan annuel et planification', category: 'institutionnel', startDate: `${Y}-12-10`, startTime: '09:00', endTime: '16:00', priority: 'haute', recurrence: { freq: 'yearly', interval: 1 }, location: 'Salle du conseil, Belval' });

  // Standalone tasks
  task({ title: 'Renouveler les licences logicielles', assigneeId: M['STUP'], startDate: addDays(today, -14), dueDate: addDays(today, -3), priority: 'haute' });
  task({ title: 'Mettre à jour la charte des supports imprimés', assigneeId: M['GILLES'], startDate: addDays(today, 2), dueDate: addDays(today, 20), status: 'en_attente', notes: 'En attente des nouveaux gabarits.' });
  task({ title: 'Inventaire du matériel de projection', startDate: addDays(today, 4), dueDate: addDays(today, 9) });
  task({
    title: `Préparer le budget formations ${Y + 1}`, assigneeId: M['YVES'], startDate: addDays(today, -10), dueDate: ymd(Y, 11, 30) > today ? ymd(Y, 11, 30) : addDays(today, 30),
    status: 'en_cours', progress: 40, priority: 'critique',
    checklist: [
      { id: uid('chk'), text: 'Coûts formateurs par thème', done: true },
      { id: uid('chk'), text: 'Locations de salles', done: false },
      { id: uid('chk'), text: 'Validation direction', done: false },
    ],
    comments: [{ id: uid('cmt'), authorId: M['YVES'], text: 'Reprendre la ventilation par trimestre de l’an dernier.', at: stamp }],
  });

  // Keep the demo coherent if "today" is very early in the year (all dates stay valid).
  for (const t of tasks) if (t.startDate && t.dueDate && diffDays(t.dueDate, t.startDate) < 0) t.startDate = t.dueDate;

  const settings = { ...defaultSettings(env), currentUserId: M['YVES'] };
  return { events, tasks, team, reminders: [], settings };
}
