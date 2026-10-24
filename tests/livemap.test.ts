import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Course, PlanningEvent } from '../src/domain/types';
import { buildPublicFeed, feedToEventLike, parsePublicFeed } from '../src/livemap/feed';
import { layoutBubbles } from '../src/livemap/layout';
import {
  Activity, courseActivities, dayRibbon, eventActivities, groupByPlace, luxNow, planningEventsToEventLike, statusAt, summarize, unresolvedLocations, visibleActivities,
} from '../src/livemap/model';
import { matchPlace } from '../src/livemap/places';

const DAY = '2026-10-24';
const at = (time: string, date = DAY) => ({ date, time });

function course(id: string, sessions: { start: string | null; end: string | null; date?: string }[], locality = 'Esch-sur-Alzette', location = 'Université Populaire Belval'): Course {
  return {
    id, code: id, title: `Cours ${id}`, theme: 'Intelligence artificielle', themeCode: 'IA', category: 'Numérique', categoryCode: 'TIC', description: 'interne',
    location, locality, room: 'C1.03', format: 'Présentiel', trainer: 'Personne Réelle', enrolled: 5, capacity: 10,
    startDate: [DAY, ...sessions.map((s) => s.date ?? DAY)].sort()[0], endDate: [DAY, ...sessions.map((s) => s.date ?? DAY)].sort().slice(-1)[0],
    sessions: sessions.map((s) => ({ date: s.date ?? DAY, start: s.start, end: s.end, estimated: false })),
  };
}

const ev = (p: Partial<PlanningEvent>): PlanningEvent => ({
  id: 'e1', createdAt: '', updatedAt: '', rev: 1, kind: 'evenement', title: 'Conférence IA', description: 'note interne confidentielle', category: 'conference',
  location: 'Belval', startDate: DAY, endDate: DAY, startTime: '18:00', endTime: '20:00', organizer: 'UniPop', ownerId: 'mbr_secret', priority: 'haute',
  status: 'confirme', notes: 'Code alarme 1234', attachments: [], recurrence: null, exceptions: {}, archived: false, history: [], ...p,
});

const live = (acts: Activity[], time: string) => {
  const v = visibleActivities(acts, 'live', DAY, at(time));
  return { v, groups: groupByPlace(v, 'live') };
};

describe('Zeitlogik (Szenarien A, B, C, G, L)', () => {
  const ten = course('dix', [
    { start: '08:00', end: '09:00' }, { start: '08:30', end: '10:00' }, { start: '09:00', end: '10:30' }, { start: '10:00', end: '11:30' }, { start: '10:30', end: '12:00' },
    { start: '13:30', end: '15:00' }, { start: '14:00', end: '16:00' }, { start: '16:00', end: '18:00' }, { start: '17:30', end: '19:00' }, { start: '18:30', end: '20:30' },
  ]);
  const acts = courseActivities([ten], DAY, DAY, {});

  it('A: zehn Kurse, fünf beendet → Bubble zeigt fünf', () => {
    const { groups } = live(acts, '14:30');
    assert.equal(groups.length, 1);
    assert.equal(groups[0].place.id, 'belval');
    assert.equal(groups[0].courses.total, 5);
    assert.equal(groups[0].courses.enCours, 2);
    assert.equal(groups[0].courses.aVenir, 3);
  });
  it('Tagesverlauf 08:00 → 21:00 aus echten Zeiten', () => {
    const counts = ['07:59', '10:30', '12:30', '16:00', '21:00'].map((t) => live(acts, t).groups[0]?.courses.total ?? 0);
    assert.deepEqual(counts, [10, 7, 5, 3, 0]);
  });
  it('B: einer läuft, zwei später → drei zählen, Status unterscheidet sich', () => {
    const c = course('b', [{ start: '14:00', end: '15:00' }, { start: '16:00', end: '17:00' }, { start: '18:00', end: '19:00' }]);
    const { v, groups } = live(courseActivities([c], DAY, DAY, {}), '14:20');
    assert.equal(groups[0].courses.total, 3);
    assert.deepEqual(v.map((a) => a.status), ['en_cours', 'a_venir', 'a_venir']);
    assert.ok(groups[0].live);
  });
  it('C: letzter Kurs endet → Bubble verschwindet (genau am Endzeitpunkt)', () => {
    const c = course('c', [{ start: '18:00', end: '20:00' }]);
    const a = courseActivities([c], DAY, DAY, {});
    assert.equal(live(a, '19:59').groups.length, 1);
    assert.equal(live(a, '20:00').groups.length, 0);
  });
  it('G: fehlende Zeiten → keine falsche Behauptung', () => {
    const noEnd = course('g1', [{ start: '10:00', end: null }]);
    const noTime = course('g2', [{ start: null, end: null }]);
    const a = courseActivities([noEnd, noTime], DAY, DAY, {});
    assert.equal(statusAt(a[0], at('09:00')), 'a_venir');
    assert.equal(statusAt(a[0], at('15:00')), 'indetermine');
    assert.equal(statusAt(a[1], at('15:00')), 'indetermine');
    const { groups } = live(a, '15:00');
    assert.equal(groups[0].courses.enCours, 0);
    assert.equal(groups[0].courses.aConfirmer, 2);
    assert.equal(statusAt(a[0], at('09:00', '2026-10-25')), 'termine');
  });
  it('L: Sommer-/Winterzeit in Europe/Luxembourg', () => {
    assert.deepEqual(luxNow(new Date('2026-10-24T12:00:00Z')), { date: '2026-10-24', time: '14:00' }); // CEST, UTC+2
    assert.deepEqual(luxNow(new Date('2026-10-25T12:00:00Z')), { date: '2026-10-25', time: '13:00' }); // CET, UTC+1
    assert.deepEqual(luxNow(new Date('2026-03-29T12:00:00Z')), { date: '2026-03-29', time: '14:00' });
    assert.deepEqual(luxNow(new Date('2026-12-31T23:30:00Z')), { date: '2027-01-01', time: '00:30' });
    const c = course('l', [{ start: '14:00', end: '16:00', date: '2026-10-25' }]);
    const a = courseActivities([c], '2026-10-25', '2026-10-25', {});
    assert.equal(statusAt(a[0], luxNow(new Date('2026-10-25T13:30:00Z'))), 'en_cours'); // 14:30 local
    assert.equal(statusAt(a[0], luxNow(new Date('2026-10-25T12:30:00Z'))), 'a_venir'); // 13:30 local
  });
});

describe('Veranstaltungen (Szenarien D, F) und Absagen', () => {
  it('D: zwei Veranstaltungen + Kurse am selben Ort bleiben getrennt erkennbar', () => {
    const c = course('d', [{ start: '17:00', end: '19:00' }, { start: '18:00', end: '20:00' }]);
    const evs = planningEventsToEventLike([ev({ id: 'x1' }), ev({ id: 'x2', title: 'Atelier', category: 'portes_ouvertes', startTime: '17:30', endTime: '21:00' })], DAY, DAY);
    const all = [...courseActivities([c], DAY, DAY, {}), ...eventActivities(evs, DAY, DAY, {})];
    const { groups } = live(all, '17:45');
    assert.equal(groups.length, 1);
    assert.equal(groups[0].courses.total, 2);
    assert.equal(groups[0].events.total, 2);
    assert.equal(groups[0].events.enCours, 1);
    const bubbles = layoutBubbles(groups);
    assert.equal(bubbles.length, 1);
  });
  it('F: mehrtägige Veranstaltung erscheint an allen Tagen ihrer Laufzeit', () => {
    const e = planningEventsToEventLike([ev({ startDate: '2026-10-23', endDate: '2026-10-26', startTime: '09:00', endTime: '17:00' })], '2026-10-20', '2026-10-30');
    const acts = eventActivities(e, '2026-10-20', '2026-10-30', {});
    assert.deepEqual(acts.map((a) => a.date), ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26']);
    assert.equal(statusAt(acts[1], at('08:00')), 'en_cours'); // second day, before nominal hours: event is under way
    assert.equal(statusAt(acts[3], at('17:30', '2026-10-26')), 'termine');
  });
  it('Ganztägig sichtbar, abgesagt nie als stattfindend, Projekte ausgeschlossen', () => {
    const e = planningEventsToEventLike([
      ev({ id: 'allday', startTime: null, endTime: null }), ev({ id: 'cx', status: 'annule' }),
      ev({ id: 'proj', kind: 'projet', startDate: '2026-01-01', endDate: '2026-12-31' }),
    ], DAY, DAY);
    assert.equal(e.length, 2);
    const acts = eventActivities(e, DAY, DAY, {});
    assert.equal(statusAt(acts[0], at('23:00')), 'journee');
    assert.equal(statusAt(acts[1], at('18:30')), 'annule');
    const { groups } = live(acts, '18:30');
    assert.equal(groups[0].events.total, 1);
    assert.equal(groups[0].events.annule, 1);
    assert.equal(live(acts, '20:30').groups.length, 1, 'annulé disparu après son créneau (18–20 h), journée encore là');
    assert.equal(live(acts, '20:30').groups[0].events.annule, 0);
  });
});

describe('Orte (Szenario H)', () => {
  it('ordnet echte Schreibweisen zu, ohne falsche Positionen', () => {
    assert.equal(matchPlace('Esch-sur-Alzette', 'Université Populaire Belval').placeId, 'belval');
    assert.equal(matchPlace('Luxembourg (Clausen)', 'Ancienne école').placeId, 'clausen');
    assert.equal(matchPlace('Ettelbruck', 'Lycée').placeId, 'ettelbruck');
    assert.equal(matchPlace('Esch-sur-Sûre', 'Salle').placeId, 'esch-sur-sure');
    assert.equal(matchPlace('Esch-sur-Alzette', 'Lycée, rue de la Gare').placeId, 'esch-sur-alzette');
    assert.equal(matchPlace('DISTANCE', 'DISTANCE').remote, true);
  });
  it('H: unbekannter Ort → keine Markerposition, aber zur Zuordnung gelistet', () => {
    const c = course('h', [{ start: '18:00', end: '20:00' }], 'Hameau Inconnu', 'Salle des fêtes');
    const acts = courseActivities([c], DAY, DAY, {});
    assert.equal(acts[0].placeId, null);
    const { v, groups } = live(acts, '12:00');
    assert.equal(groups.length, 0);
    assert.deepEqual(unresolvedLocations(v), [{ locality: 'Hameau Inconnu', location: 'Salle des fêtes', count: 1 }]);
    assert.equal(summarize(v, groups).nonLocalises, 1);
    const fixed = courseActivities([c], DAY, DAY, { 'hameau inconnu|salle des fetes': 'mersch' });
    assert.equal(fixed[0].placeId, 'mersch');
  });
});

describe('Datenschutz (Szenario K) und Ansichten (Szenario E)', () => {
  it('K: öffentlicher Feed enthält nur freigegebene Felder freigegebener Veranstaltungen', () => {
    const events = [ev({ id: 'pub' }), ev({ id: 'interne', title: 'Comité de direction', category: 'reunion' })];
    const feed = buildPublicFeed(events, ['pub'], {}, DAY);
    const text = JSON.stringify(feed);
    assert.equal(feed.events.length, 1);
    for (const secret of ['Code alarme', 'note interne', 'mbr_secret', 'Comité de direction', '"pub"', 'ownerId', 'notes', 'description']) assert.ok(!text.includes(secret), secret);
    assert.deepEqual(Object.keys(feed.events[0]).sort(), ['cancelled', 'endDate', 'endTime', 'id', 'place', 'placeId', 'startDate', 'startTime', 'title', 'type']);
    const parsed = parsePublicFeed({ ...feed, events: [{ ...feed.events[0], notes: 'x', ownerId: 'y' }, { title: 'cassé' }] });
    assert.equal(parsed!.events.length, 1);
    assert.ok(!('notes' in parsed!.events[0]));
    assert.equal(parsePublicFeed({ format: 'autre' }), null);
    assert.equal(feedToEventLike(parsed!)[0].placeId, 'belval');
  });
  it('E: Datumswechsel → andere Aktivitäten; Vergangenheit als Tagesbilanz, nicht leer', () => {
    const c = course('e', [{ start: '10:00', end: '12:00', date: '2026-10-23' }, { start: '10:00', end: '12:00', date: '2026-10-24' }, { start: '19:00', end: '21:00', date: '2026-10-24' }]);
    const acts = courseActivities([c], '2026-10-20', '2026-10-30', {});
    const now = at('15:00');
    const yesterday = groupByPlace(visibleActivities(acts, 'jour', '2026-10-23', now), 'jour');
    assert.equal(yesterday[0].courses.total, 1);
    assert.equal(yesterday[0].courses.termine, 1);
    const todayFull = groupByPlace(visibleActivities(acts, 'jour', DAY, now), 'jour');
    assert.equal(todayFull[0].courses.total, 2);
    assert.equal(groupByPlace(visibleActivities(acts, 'live', DAY, now), 'live')[0].courses.total, 1);
    assert.equal(groupByPlace(visibleActivities(acts, 'semaine', DAY, now), 'semaine')[0].courses.total, 3);
  });
  it('Zeitband zählt gleichzeitige Kurse pro halbe Stunde', () => {
    const c = course('r', [{ start: '09:00', end: '10:00' }, { start: '09:30', end: '11:00' }]);
    const slots = dayRibbon(courseActivities([c], DAY, DAY, {}), DAY, at('09:45'));
    const s = Object.fromEntries(slots.map((x) => [x.from, x.count]));
    assert.equal(s['09:00'], 1);
    assert.equal(s['09:30'], 2);
    assert.equal(s['10:30'], 1);
    assert.ok(slots.find((x) => x.from === '09:00')!.past);
  });
});

describe('Gruppierung ohne Überlagerung', () => {
  it('benachbarte Orte überlappen nie; Quartiere werden zur Stadt zusammengefasst', () => {
    const places = [['Luxembourg (Clausen)', 'x'], ['Luxembourg (Kirchberg)', 'x'], ['Strassen', 'x'], ['Bertrange', 'x'], ['Esch-sur-Alzette', 'Belval'], ['Esch-sur-Alzette', 'Lycée'], ['Schifflange', 'x'], ['Mamer', 'x']];
    const courses = places.map(([loc, name], i) => course(`p${i}`, Array.from({ length: 6 + i * 3 }, () => ({ start: '18:00', end: '20:00' })), loc, name));
    const { groups } = live(courseActivities(courses, DAY, DAY, {}), '17:00');
    const bubbles = layoutBubbles(groups);
    assert.ok(bubbles.some((b) => b.group.place.id === 'luxembourg'), 'quartiers fusionnés');
    for (let i = 0; i < bubbles.length; i++) for (let j = i + 1; j < bubbles.length; j++) {
      const a = bubbles[i], b = bubbles[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r - 0.5, `${a.group.place.id} / ${b.group.place.id}`);
    }
    assert.deepEqual(layoutBubbles(groups).map((b) => [b.x, b.y]), bubbles.map((b) => [b.x, b.y]), 'déterministe');
  });
});
