import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { addDays, addMonths, diffDays, formatDate, isoWeek, isValidISODate, parseDurationFr, parseFrDate, todayISO, weekdayMon0 } from '../src/domain/dates';
import { applyReschedule, computeProgress, generateTemplateTasks, proposeReschedule, templateById, validateDependencies, withStatus } from '../src/domain/planning';
import { describeRecurrence, expandEvent, nextOccurrence, nthStart, overrideOccurrence, splitSeries } from '../src/domain/recurrence';
import { easterSunday, luxembourgHolidays } from '../src/domain/reference';
import { activeReminders, computeReminders, thresholdLevel } from '../src/domain/reminders';
import { searchAll } from '../src/domain/search';
import type { PlanningEvent, Task } from '../src/domain/types';
import { createMemoryStore } from '../src/data/memory/memoryStore';
import { buildBackup, mergeData, summarizeMerge, validateBackup } from '../src/data/schema';
import { buildDemoData } from '../src/data/seed';
import { demoCourses } from '../src/integrations/courses/demoCourses';
import { syncCourses } from '../src/integrations/courses/courseService';
import { buildCourseIndex, groupByTheme, mapUniPopCourses, parseSchedulePattern } from '../src/integrations/courses/unipopAdapter';
import { buildAnnualInput, buildChecklistInput, buildOpsInput } from '../src/print/builders';
import { layoutAnnual, layoutChecklist, layoutOperational } from '../src/print/layouts';
import { sanitize } from '../src/print/model';
import { createMeasure, renderPdf } from '../src/print/pdf';
import { encodeQr } from '../src/print/qr';

const TODAY = '2026-10-22';
const ev = (p: Partial<PlanningEvent>): PlanningEvent => ({
  id: 'e1', createdAt: '', updatedAt: '', rev: 1, kind: 'evenement', title: 'Test', description: '', category: 'autre', location: '',
  startDate: '2026-01-31', endDate: '2026-01-31', organizer: '', priority: 'normale', status: 'planifie', notes: '', attachments: [],
  recurrence: null, exceptions: {}, archived: false, history: [], ...p,
});
const task = (p: Partial<Task>): Task => ({
  id: 't1', createdAt: '', updatedAt: '', rev: 1, title: 'T', description: '', priority: 'normale', status: 'a_faire', progress: 0,
  dependsOn: [], checklist: [], comments: [], attachments: [], notes: '', milestone: false, manualDates: false, history: [], ...p,
});

describe('dates', () => {
  it('handles leap years, weekdays and ISO weeks', () => {
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2027-02-28', 1), '2027-03-01');
    assert.equal(diffDays('2026-12-31', '2026-01-01'), 364);
    assert.equal(weekdayMon0('2026-10-22'), 3); // jeudi
    assert.equal(weekdayMon0('2026-10-26'), 0); // lundi
    assert.equal(isoWeek('2026-01-01'), 1);
    assert.equal(isoWeek('2027-01-01'), 53);
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.ok(isValidISODate('2028-02-29'));
    assert.ok(!isValidISODate('2027-02-29'));
  });
  it('computes Luxembourg today independently of the machine timezone', () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Luxembourg (UTC+1).
    assert.equal(todayISO(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
    // 22:30 UTC in summer = 00:30 CEST next day.
    assert.equal(todayISO(new Date('2026-07-14T22:30:00Z')), '2026-07-15');
  });
  it('parses source formats and formats in French', () => {
    assert.equal(parseFrDate('23/10/2026'), '2026-10-23');
    assert.equal(parseFrDate('31/02/2026'), null);
    assert.equal(parseDurationFr('1h40'), 100);
    assert.equal(parseDurationFr('3h'), 180);
    assert.equal(formatDate('2026-10-22', 'long'), 'jeudi 22 octobre 2026');
  });
  it('knows Luxembourg public holidays', () => {
    assert.equal(easterSunday(2026), '2026-04-05');
    assert.equal(easterSunday(2027), '2027-03-28');
    const h = luxembourgHolidays(2026).map((x) => x.date);
    assert.ok(h.includes('2026-04-06') && h.includes('2026-05-14') && h.includes('2026-05-25') && h.includes('2026-06-23') && h.includes('2026-05-09'));
    assert.equal(h.length, 11);
  });
});

describe('recurrence', () => {
  it('clamps monthly and yearly rules without drift', () => {
    const rec = { freq: 'monthly' as const, interval: 1 };
    assert.deepEqual([0, 1, 2, 3].map((n) => nthStart('2026-01-31', rec, n)), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    assert.equal(nthStart('2028-02-29', { freq: 'yearly', interval: 1 }, 1), '2029-02-28');
    assert.equal(nthStart('2028-02-29', { freq: 'yearly', interval: 1 }, 4), '2032-02-29');
    assert.equal(nthStart('2026-01-05', { freq: 'weekly', interval: 2 }, 3), '2026-02-16');
  });
  it('expands within a range with until/count and multi-day spans', () => {
    const e = ev({ startDate: '2026-03-10', endDate: '2026-03-12', recurrence: { freq: 'yearly', interval: 1, count: 3 } });
    const occ = expandEvent(e, '2026-01-01', '2040-12-31');
    assert.deepEqual(occ.map((o) => [o.startDate, o.endDate]), [['2026-03-10', '2026-03-12'], ['2027-03-10', '2027-03-12'], ['2028-03-10', '2028-03-12']]);
    const u = ev({ startDate: '2026-01-13', recurrence: { freq: 'monthly', interval: 1, until: '2026-04-30' } });
    assert.equal(expandEvent(u, '2026-01-01', '2026-12-31').length, 4);
  });
  it('edits one occurrence independently and computes the next occurrence', () => {
    let e = ev({ startDate: '2026-01-13', endDate: '2026-01-13', recurrence: { freq: 'monthly', interval: 1 } });
    e = overrideOccurrence(e, '2026-03-13', { cancelled: true });
    e = overrideOccurrence(e, '2026-04-13', { startDate: '2026-04-15', endDate: '2026-04-15', title: 'Déplacé' });
    const occ = expandEvent(e, '2026-01-01', '2026-05-31');
    assert.deepEqual(occ.map((o) => o.startDate), ['2026-01-13', '2026-02-13', '2026-04-15', '2026-05-13']);
    assert.equal(occ[2].title, 'Déplacé');
    assert.equal(occ[0].title, 'Test');
    assert.equal(nextOccurrence(e, '2026-03-01')?.startDate, '2026-04-15');
    const y = ev({ startDate: '2025-06-04', endDate: '2025-06-04', recurrence: { freq: 'yearly', interval: 1 } });
    assert.equal(nextOccurrence(y, TODAY)?.startDate, '2027-06-04');
  });
  it('splits a series without altering past occurrences', () => {
    const e = ev({ startDate: '2026-01-13', recurrence: { freq: 'monthly', interval: 1, count: 12 }, exceptions: { '2026-02-13': { notes: 'passé' }, '2026-09-13': { notes: 'futur' } } });
    const { original, created } = splitSeries(e, '2026-06-13', { location: 'Nouvelle salle' }, 'e2', 'now');
    assert.ok(created);
    assert.equal(original.recurrence?.until, '2026-06-12');
    assert.equal(original.recurrence?.count, 5);
    assert.equal(original.location, '');
    assert.deepEqual(Object.keys(original.exceptions), ['2026-02-13']);
    assert.equal(created!.startDate, '2026-06-13');
    assert.equal(created!.location, 'Nouvelle salle');
    assert.equal(created!.recurrence?.count, 7);
    assert.deepEqual(Object.keys(created!.exceptions), ['2026-09-13']);
    assert.equal(created!.seriesId, 'e1');
    const all = [...expandEvent(original, '2026-01-01', '2027-12-31'), ...expandEvent(created!, '2026-01-01', '2027-12-31')];
    assert.equal(all.length, 12);
    assert.match(describeRecurrence(e.recurrence, e.startDate), /Chaque mois, le 13/);
  });
});

describe('planning', () => {
  it('generates template tasks with relative dates, assignees and dependencies', () => {
    const tpl = templateById('tpl-conference')!;
    const tasks = generateTemplateTasks(tpl, { id: 'e1', startDate: '2026-11-19' }, { 'ORG-02': 'm2', 'COM-01': 'm5' });
    assert.equal(tasks.length, tpl.tasks.length);
    assert.equal(tasks[0].dueDate, '2026-08-21');
    assert.equal(tasks[0].assigneeId, 'm2');
    assert.equal(tasks[0].startDate, '2026-08-08');
    const comm = tasks.find((t) => t.title === 'Lancer la communication')!;
    assert.deepEqual(comm.dependsOn, [tasks[2].id]);
    assert.ok(tasks.every((t) => t.eventId === 'e1' && t.offsetDays !== null && !t.manualDates));
  });
  it('computes project progress and keeps status coherent', () => {
    const done = withStatus(task({ id: 'a' }), 'termine', 'x');
    assert.equal(done.progress, 100);
    assert.equal(done.completedAt, 'x');
    const p = computeProgress([done, task({ id: 'b', progress: 50 }), task({ id: 'c', dueDate: '2026-01-01' })], TODAY);
    assert.deepEqual(p, { total: 3, done: 1, overdue: 1, pct: 50 });
  });
  it('proposes rescheduling but never selects manually adjusted tasks', () => {
    const tasks = [
      task({ id: 'a', startDate: '2026-11-01', dueDate: '2026-11-05', offsetDays: -14 }),
      task({ id: 'b', startDate: '2026-11-10', dueDate: '2026-11-12', offsetDays: -7, manualDates: true }),
      task({ id: 'c', dueDate: '2026-10-01', status: 'termine' }),
    ];
    const lines = proposeReschedule('2026-11-19', '2026-11-26', tasks);
    assert.equal(lines.length, 2);
    assert.deepEqual(lines.map((l) => [l.taskId, l.newDue, l.include]), [['a', '2026-11-12', true], ['b', '2026-11-19', false]]);
    const changed = applyReschedule(tasks, lines, 'now');
    assert.equal(changed.length, 1);
    assert.equal(changed[0].startDate, '2026-11-08');
  });
  it('rejects self, unknown and cyclic dependencies', () => {
    const all = [task({ id: 'a' }), task({ id: 'b', dependsOn: ['a'] }), task({ id: 'c', dependsOn: ['b'] })];
    assert.match(validateDependencies('a', ['a'], all)!, /elle-même/);
    assert.match(validateDependencies('a', ['zzz'], all)!, /inexistante/);
    assert.match(validateDependencies('a', ['c'], all)!, /cycle/);
    assert.equal(validateDependencies('c', ['a', 'b'], all), null);
  });
});

describe('reminders', () => {
  const thresholds = [30, 14, 7, 3, 1, 0];
  it('maps remaining days to configured thresholds', () => {
    assert.equal(thresholdLevel(5, thresholds), 7);
    assert.equal(thresholdLevel(0, thresholds), 0);
    assert.equal(thresholdLevel(31, thresholds), null);
  });
  it('produces overdue, deadline, milestone, unassigned and preparation reminders', () => {
    const e = ev({ id: 'conf', startDate: '2026-11-10', endDate: '2026-11-10', priority: 'haute' });
    const rec = ev({ id: 'rec', title: 'Comité', startDate: '2026-01-27', recurrence: { freq: 'monthly', interval: 1 } });
    const tasks = [
      task({ id: 'late', dueDate: '2026-10-20', assigneeId: 'm1', eventId: 'conf' }),
      task({ id: 'soon', dueDate: '2026-10-27', assigneeId: 'm1' }),
      task({ id: 'ms', dueDate: '2026-11-05', assigneeId: 'm1', milestone: true }),
      task({ id: 'nobody', dueDate: '2026-12-30' }),
      task({ id: 'done', dueDate: '2026-10-01', status: 'termine', assigneeId: 'm1' }),
    ];
    const r = computeReminders({ tasks, events: [e, rec], thresholds, today: TODAY, states: {} });
    const byType = (t: string) => r.filter((x) => x.type === t);
    assert.equal(byType('retard').length, 1);
    assert.equal(byType('retard')[0].severity, 'critique');
    assert.equal(byType('echeance')[0].level, 'J-7');
    assert.equal(byType('jalon')[0].level, 'J-14');
    assert.equal(byType('non_assignee').length, 1);
    assert.equal(byType('preparation').length, 1);
    assert.equal(byType('recurrent')[0].date, '2026-10-27');
    assert.ok(!r.some((x) => x.taskId === 'done'));
  });
  it('honours acknowledgement and snooze, and re-alerts at the next threshold', () => {
    const tasks = [task({ id: 'soon', dueDate: '2026-10-27', assigneeId: 'm1' })];
    const first = computeReminders({ tasks, events: [], thresholds, today: TODAY, states: {} });
    const id = first[0].id;
    const acked = computeReminders({ tasks, events: [], thresholds, today: TODAY, states: { [id]: { id, acknowledgedAt: 'x' } } });
    assert.equal(activeReminders(acked).length, 0);
    const later = computeReminders({ tasks, events: [], thresholds, today: '2026-10-25', states: { [id]: { id, acknowledgedAt: 'x' } } });
    assert.equal(activeReminders(later).length, 1);
    assert.equal(later[0].level, 'J-3');
    const snoozed = computeReminders({ tasks, events: [], thresholds, today: TODAY, states: { [id]: { id, snoozedUntil: '2026-10-24' } } });
    assert.equal(activeReminders(snoozed).length, 0);
  });
});

describe('UniPop course adapter', () => {
  // Synthetic records using the field names observed in the live feed.
  const raw = [
    { id: 1, coursCode: 'X-1', intitule: 'Atelier ponctuel', matiereNom: 'Yoga', matiereCode: 'YOG', categorieCodeUnipop: 'ACP', categorieNom: 'ACTIVITE PHYSIQUE  ET BIEN-ÊTRE',
      dateDebut: '24/10/2026', dateFin: '24/10/2026', horairePrevu: 'Samedi 24-10-2026 à 10:20 (durée 1h40)', horaires: [{ duree: '1h40', heure: '10:20', jour: 'Samedi' }],
      adresseCours: { nom: 'Salle test', localite: 'Esch-sur-Alzette', salle: 'E.00.02' }, nbInscrits: 7, nbPlaces: 10, format: 'PRESENTIEL', enseignants: [{ nom: 'Test', prenom: 'Personne' }] },
    { id: 2, intitule: 'Cours hebdomadaire', matiereNom: 'Informatique', categorieCodeUnipop: 'TIC', dateDebut: '26/10/2026', dateFin: '10/12/2026',
      horaires: [{ duree: '2h', heure: '11:15', jour: 'Lundi' }, { duree: '2h', heure: '11:15', jour: 'Jeudi' }], adresseCours: { nom: 'École', localite: 'Dudelange' }, format: 'PRESENTIEL' },
    { id: 3, intitule: 'Sans horaires listés', matiereNom: 'Luxembourgeois', categorieCodeUnipop: 'LAN', dateDebut: '02/11/2026', dateFin: '03/12/2026',
      horaires: [], horairePrevu: 'Lundi à 09:00 (durée 3h), Mardi à 09:00 (durée 3h)', adresseCours: { nom: 'DISTANCE', localite: 'DISTANCE' }, format: 'DISTANCE' },
    { id: 4, intitule: '', dateDebut: 'x' },
  ];
  it('maps real field names, sessions and enrollment', () => {
    const { courses, skipped } = mapUniPopCourses(raw);
    assert.equal(skipped, 1);
    const [a, b, c] = courses;
    assert.equal(a.theme, 'Yoga');
    assert.equal(a.category, 'Activité physique et bien-être');
    assert.equal(a.room, 'E.00.02');
    assert.deepEqual(a.sessions, [{ date: '2026-10-24', start: '10:20', end: '12:00', estimated: false }]);
    assert.equal(a.enrolled, 7);
    assert.equal(a.capacity, 10);
    assert.equal(b.sessions.length, 14); // 7 weeks × (lundi + jeudi)
    assert.ok(b.sessions.every((s) => s.estimated && s.start === '11:15' && s.end === '13:15'));
    assert.equal(c.location, 'À distance');
    assert.equal(c.sessions[0].date, '2026-11-02');
    assert.equal(c.sessions.length, 10);
  });
  it('parses free-text schedules and groups by theme', () => {
    assert.deepEqual(parseSchedulePattern('Jeudi 29-10-2026 à 18:00 (durée 2h30)')[0], { weekday: 3, time: '18:00', minutes: 150, date: '2026-10-29' });
    const idx = buildCourseIndex(mapUniPopCourses(demoCourses(2026)).courses);
    const iaDay = [...idx.byDate.entries()].find(([, items]) => groupByTheme(items).some((g) => g.theme === 'Intelligence artificielle' && g.items.length >= 2));
    assert.ok(iaDay, 'demo data has a day with several AI courses');
  });
  it('rejects unexpected formats and falls back to clearly labelled demo data', async () => {
    assert.equal(mapUniPopCourses({ foo: 1 }).courses.length, 0);
    const failing = async () => { throw new TypeError('Failed to fetch'); };
    const snap = await syncCourses('https://example.invalid/x.json', null, failing as never);
    assert.equal(snap.source, 'demo');
    assert.match(snap.warning!, /démonstration/);
    const prev = { ...snap, source: 'live' as const, lastSuccessAt: '2026-10-01T10:00:00Z' };
    const kept = await syncCourses('https://example.invalid/x.json', prev, failing as never);
    assert.equal(kept.source, 'live');
    assert.match(kept.warning!, /dernière synchronisation réussie/);
    const http403 = async () => new Response('no', { status: 403 });
    const s403 = await syncCourses('https://example.invalid/x.json', null, http403 as never);
    assert.match(s403.warning!, /authentification/);
  });
});

describe('storage, seed and backup', () => {
  it('memory store honours the repository contract', async () => {
    const store = createMemoryStore();
    await store.tasks.upsert([task({ id: 'a' }), task({ id: 'b' })]);
    await store.tasks.upsert([task({ id: 'a', title: 'Modifiée' })]);
    assert.equal((await store.tasks.get('a'))?.title, 'Modifiée');
    await store.tasks.remove(['b']);
    assert.equal((await store.tasks.list()).length, 1);
    const data = buildDemoData(TODAY);
    await store.replaceAll(data);
    assert.equal((await store.events.list()).length, data.events.length);
    assert.equal((await store.settings.get())?.currentUserId, data.settings.currentUserId);
  });
  it('demo data is fictional, coherent and covers the year', () => {
    const d = buildDemoData(TODAY);
    assert.ok([...d.events, ...d.tasks, ...d.team].every((r) => r.demo));
    const months = new Set(expandEventsYear(d.events).map((s) => Math.ceil(Number(s.slice(5, 7)) / 3)));
    assert.deepEqual([...months].sort(), [1, 2, 3, 4]);
    const overdue = d.tasks.filter((t) => t.status !== 'termine' && t.dueDate! < TODAY);
    assert.ok(overdue.length >= 3 && overdue.length <= 6, `overdue = ${overdue.length}`);
    const ids = new Set(d.tasks.map((t) => t.id));
    const eventIds = new Set(d.events.map((e) => e.id));
    assert.ok(d.tasks.every((t) => (!t.eventId || eventIds.has(t.eventId)) && t.dependsOn.every((x) => ids.has(x))));
    assert.ok(d.team.every((m) => /^[A-Z]+(-\d\d)?$/.test(m.code)));
    assert.ok(d.events.some((e) => e.recurrence?.freq === 'yearly') && d.events.some((e) => e.recurrence?.freq === 'monthly'));
  });
  it('validates, repairs and merges backups without overwriting', () => {
    const d = buildDemoData(TODAY);
    const ok = validateBackup(JSON.parse(JSON.stringify(buildBackup(d))));
    assert.ok(ok.ok, ok.errors.join(', '));
    assert.equal(ok.data!.tasks.length, d.tasks.length);
    assert.equal(validateBackup({ hello: 1 }).ok, false);
    assert.equal(validateBackup({ ...buildBackup(d), schemaVersion: 99 }).ok, false);
    const dup = buildBackup({ ...d, tasks: [...d.tasks, d.tasks[0]] });
    assert.match(validateBackup(dup).errors.join(' '), /double/);
    const dangling = buildBackup({ ...d, tasks: [{ ...d.tasks[0], eventId: 'nope', assigneeId: 'ghost', dependsOn: ['missing'] }] });
    const repaired = validateBackup(dangling);
    assert.ok(repaired.ok);
    assert.equal(repaired.warnings.length, 3);
    assert.equal(repaired.data!.tasks[0].eventId, null);
    const changed = { ...d, tasks: d.tasks.map((t, i) => (i === 0 ? { ...t, title: 'Version importée' } : t)) };
    const extra = { ...changed, tasks: [...changed.tasks, task({ id: 'nouvelle' })] };
    assert.deepEqual(summarizeMerge(d, extra).tasks, { added: 1, existing: d.tasks.length });
    const merged = mergeData(d, extra);
    assert.equal(merged.tasks.find((t) => t.id === d.tasks[0].id)!.title, d.tasks[0].title);
    assert.equal(merged.tasks.length, d.tasks.length + 1);
  });
  it('searches across events, tasks, courses, themes and locations', () => {
    const d = buildDemoData(TODAY);
    const courses = mapUniPopCourses(demoCourses(2026)).courses;
    const r = searchAll('intelligence artif', { events: d.events, tasks: d.tasks, courses });
    assert.ok(r.themes.some((t) => t.theme === 'Intelligence artificielle'));
    assert.ok(searchAll('conference ia', { events: d.events, tasks: d.tasks, courses }).events.length >= 1);
    assert.ok(searchAll('dudelange', { events: d.events, tasks: d.tasks, courses }).locations.length >= 1);
  });
});

function expandEventsYear(events: PlanningEvent[]) {
  return events.flatMap((e) => expandEvent(e, '2026-01-01', '2026-12-31').map((o) => o.startDate));
}

describe('print', () => {
  it('encodes QR codes of the right version size', () => {
    assert.equal(encodeQr('https://a.b').length, 21);
    assert.equal(encodeQr('https://unipop-command.pages.dev/#annee').length, 29); // 39 bytes -> version 3-M
  });
  it('sanitises text for standard PDF fonts', () => {
    assert.equal(sanitize('Conférence « IA » – œuvre\u202f: 10 €'), 'Conférence « IA » – œuvre : 10 €');
    assert.equal(sanitize('Flèche → ok ✨'), 'Flèche -> ok ');
  });
  it('lays out a legible A0 annual planner and renders a vector PDF of the right size', async () => {
    const { measure } = await createMeasure();
    const d = buildDemoData(TODAY);
    const courses = mapUniPopCourses(demoCourses(2026)).courses;
    const data = { events: d.events, tasks: d.tasks, team: d.team, courses, today: TODAY, publicAppUrl: 'https://example.org/planning' };
    const include = { events: true, projects: true, courses: true, deadlines: true, milestones: true, holidays: true, legend: true };
    const input = buildAnnualInput(data, { year: 2026, format: 'A0', orientation: 'landscape', include, scope: { ownerId: null, eventId: null }, demoCourses: true });
    const doc = layoutAnnual(input, measure);
    assert.equal(doc.pages.length, 1);
    assert.deepEqual([doc.pages[0].w, doc.pages[0].h], [1189, 841]);
    const sizes = doc.pages[0].prims.filter((p) => p.t === 'text').map((p) => (p as { size: number }).size);
    assert.ok(Math.min(...sizes) >= 8, `smallest A0 font ${Math.min(...sizes)} pt`);
    assert.ok(doc.pages[0].prims.some((p) => p.t === 'qr'));
    const bytes = await renderPdf(doc);
    const head = new TextDecoder().decode(bytes.slice(0, 8));
    assert.equal(head.slice(0, 5), '%PDF-');
    const loaded = await PDFDocument.load(bytes);
    const { width, height } = loaded.getPage(0).getSize();
    assert.equal(Math.round(width / 72 * 25.4), 1189);
    assert.equal(Math.round(height / 72 * 25.4), 841);
    const images = loaded.context.enumerateIndirectObjects().filter(([, obj]) => {
      const dict = (obj as { dict?: PDFDict }).dict;
      return dict?.get(PDFName.of('Subtype')) === PDFName.of('Image');
    });
    assert.equal(images.length, 0, 'no raster images');
  });
  it('paginates the operational plan and the A4 checklist', async () => {
    const { measure } = await createMeasure();
    const d = buildDemoData(TODAY);
    const data = { events: d.events, tasks: d.tasks, team: d.team, courses: [], today: TODAY, publicAppUrl: '' };
    const ops = layoutOperational(buildOpsInput(data, { format: 'A4', orientation: 'landscape', rangeStart: '2026-01-01', rangeEnd: '2026-12-31', includeDone: true, scope: { ownerId: null, eventId: null } }), measure);
    assert.ok(ops.pages.length >= 2);
    const conf = d.events.find((e) => e.title.includes('IA et formation'))!;
    const cl = layoutChecklist(buildChecklistInput(data, conf.id), measure);
    assert.deepEqual([cl.pages[0].w, cl.pages[0].h], [210, 297]);
    const bytes = await renderPdf(cl);
    assert.ok(bytes.length > 1000);
  });
});
