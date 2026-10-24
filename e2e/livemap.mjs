// Acceptance run for the UniPop Live Map (planning view + carte.html).
// node scripts/build-single.mjs && node e2e/livemap.mjs   → screenshots in e2e/out-carte/
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const OUT = 'e2e/out-carte';
mkdirSync(OUT, { recursive: true });
const lux = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Luxembourg' }).format(d);
const TODAY = lux();
const plus = (n) => { const d = new Date(`${TODAY}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const WD = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const fr = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
let n = 0;
const course = (date, time, dur, localite, nom, theme = 'Intelligence artificielle', salle = 'C1.03') => ({
  id: 700000 + ++n, coursCode: `T-${n}`, intitule: `${theme} — atelier ${n}`, matiereNom: theme, categorieCodeUnipop: 'TIC', categorieNom: 'NUMERIQUE',
  description: 'DESCRIPTION-INTERNE', dateDebut: fr(date), dateFin: fr(date),
  horaires: [{ jour: WD[new Date(`${date}T12:00:00Z`).getUTCDay()], heure: time, duree: dur }],
  adresseCours: { nom, localite, salle }, enseignants: [{ prenom: 'Formatrice', nom: 'Réelle' }], nbInscrits: 8, nbPlaces: 12,
  format: localite === 'DISTANCE' ? 'DISTANCE' : 'PRESENTIEL', organisateur: { code: 'UNIPOP', nom: 'UniPop' },
});
const belval = [['08:00', '1h'], ['08:30', '1h30'], ['09:00', '1h30'], ['10:00', '1h30'], ['10:30', '1h30'], ['13:30', '1h30'], ['14:00', '2h'], ['16:00', '2h'], ['17:30', '1h30'], ['18:30', '2h']]
  .map(([t, d]) => course(TODAY, t, d, 'Esch-sur-Alzette', 'Université Populaire Belval'));
const trainings = [
  ...belval,
  course(TODAY, '14:00', '2h', 'Luxembourg (Clausen)', 'Ancienne école', 'Luxembourgeois'), course(TODAY, '18:00', '2h', 'Luxembourg (Clausen)', 'Ancienne école', 'Français'),
  course(TODAY, '15:00', '1h30', 'Luxembourg (Kirchberg)', 'Centre', 'Anglais'), course(TODAY, '19:00', '1h30', 'Luxembourg', 'Centre-ville', 'Photographie'),
  course(TODAY, '13:00', '2h', 'Dudelange', 'Centre de formation', 'Informatique'), course(TODAY, '18:00', '2h', 'Dudelange', 'Centre de formation', 'Yoga'),
  course(TODAY, '14:15', '2h', 'Ettelbruck', 'Lycée', 'Histoire'), course(TODAY, '17:00', '1h30', 'Diekirch', 'Salle', 'Biologie'),
  course(TODAY, '18:30', '2h', 'Wiltz', 'Château', 'Cuisine'), course(TODAY, '14:00', '3h', 'Echternach', 'Trifolion', 'Bien-être'),
  course(TODAY, '19:00', '2h', 'Grevenmacher', 'Salle', 'Français'), course(TODAY, '18:00', '2h', 'Remich', 'Salle', 'Anglais'),
  course(TODAY, '14:00', '2h', 'Differdange', 'Aalt Stadhaus', 'Photographie'), course(TODAY, '17:45', '1h30', 'Clervaux', 'Cube 521', 'Yoga'),
  course(TODAY, '09:00', '3h', 'DISTANCE', 'DISTANCE', 'Luxembourgeois'), course(TODAY, '18:00', '2h', 'DISTANCE', 'DISTANCE', 'Français'),
  course(TODAY, '18:00', '2h', 'Hameau Inconnu', 'Salle des fêtes', 'Coaching'),
  course(plus(1), '10:00', '2h', 'Diekirch', 'Salle', 'Biologie'), course(plus(1), '14:00', '2h', 'Wiltz', 'Château', 'Cuisine'),
];
const feed = {
  format: 'unipop-live-map-public', version: 1, generatedAt: new Date().toISOString(), placeOverrides: {},
  events: [
    { id: 'p1', title: 'Conférence « IA et formation des adultes »', type: 'Conférence', startDate: TODAY, endDate: TODAY, startTime: '18:30', endTime: '21:00', place: 'Belval', placeId: 'belval', cancelled: false, notes: 'NOTE-SECRETE', ownerId: 'mbr_x' },
    { id: 'p2', title: 'Journées portes ouvertes', type: 'Portes ouvertes', startDate: plus(-1), endDate: plus(1), startTime: '10:00', endTime: '17:00', place: 'Luxembourg', placeId: 'luxembourg', cancelled: false },
    { id: 'p3', title: 'Atelier annulé', type: 'Réunion', startDate: TODAY, endDate: TODAY, startTime: '16:00', endTime: '17:00', place: 'Ettelbruck', placeId: 'ettelbruck', cancelled: true },
  ],
};
writeFileSync(`${OUT}/trainings-fixture.json`, JSON.stringify(trainings));

let offline = false;
const files = { '/': 'dist-single/index.html', '/index.html': 'dist-single/index.html', '/carte.html': 'dist-single/carte.html' };
const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (offline && path.endsWith('.json')) { req.socket.destroy(); return; }
  if (path === '/trainings.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(trainings)); }
  if (path === '/carte-evenements.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(feed)); }
  if (files[path]) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(readFileSync(files[path])); }
  res.writeHead(404); res.end();
}).listen(4180);
const BASE = 'http://127.0.0.1:4180';

const results = [];
const errors = [];
const expect = (c, m) => { if (!c) throw new Error(m); };
async function step(name, fn) {
  try { const note = await fn(); results.push({ name, ok: true, note }); console.log(`PASS  ${name}${note ? `  (${note})` : ''}`); }
  catch (e) { results.push({ name, ok: false, note: String(e.message).split('\n')[0] }); console.log(`FAIL  ${name}  ${String(e.message).split('\n')[0]}`); }
}
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true, locale: 'fr-LU', timezoneId: 'Europe/Luxembourg' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
const CARTE = (q) => `${BASE}/carte.html?cours=/trainings.json&evenements=/carte-evenements.json&rotation=0&${q}`;
const bubble = (name) => page.locator('.lmb:not(.is-leaving)', { has: page.locator('.lmb-label b', { hasText: new RegExp(`^${name}$`) }) });

await step('Display A/B/D : 14:30, Belval 5 cours dont 2 en cours, + 1 événement', async () => {
  await page.goto(CARTE(`date=${TODAY}&heure=14:30`));
  await bubble('Belval').waitFor({ timeout: 15000 });
  const num = await bubble('Belval').locator('.lmb-num').innerText();
  const sat = await bubble('Belval').locator('.lmb-sat-num').innerText();
  const cap = await bubble('Belval').locator('.lmb-label span').innerText();
  expect(num === '5' && sat === '1' && cap === '2 en cours', `${num} / ${sat} / ${cap}`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/carte-1920-1430.png` });
  return `${num} cours, ${sat} événement, « ${cap} »`;
});

await step('Display : quartiers regroupés, annulé non compté, lieu inconnu absent, distance à part', async () => {
  const lux = await bubble('Luxembourg').locator('.lmb-num').innerText();
  expect(lux === '4', `Luxembourg ${lux}`);
  expect(await page.locator('.lmb-label b', { hasText: 'Clausen' }).count() === 0, 'Clausen non regroupé');
  expect(await page.locator('.lmb-label b', { hasText: 'Hameau' }).count() === 0, 'lieu inconnu affiché');
  const ett = await bubble('Ettelbruck').locator('.lmb-sat-num').count();
  expect(ett === 0, 'événement annulé compté');
  const remote = await page.locator('.carte-remote').innerText();
  expect(/1 cours à distance/.test(remote), remote); // 09:00–12:00 is over at 14:30, 18:00 is still to come
  const stats = await page.locator('.carte-stats').innerText();
  return stats.replace(/\n/g, ' ').slice(0, 120);
});

await step('Display C : à 21:00 la bulle de Belval a disparu', async () => {
  await page.goto(CARTE(`date=${TODAY}&heure=21:00`));
  await page.locator('.carte-map .lm').waitFor();
  await page.waitForTimeout(800);
  const n = await bubble('Belval').count();
  const any = await page.locator('.lmb:not(.is-leaving)').count();
  expect(n === 0, 'Belval encore visible');
  return `${any} bulle(s) restante(s) à 21:00`;
});

await step('Display 4K, thème nuit et mobile', async () => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto(CARTE(`date=${TODAY}&heure=18:40`));
  await bubble('Belval').waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/carte-4k-1840.png` });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(CARTE(`date=${TODAY}&heure=18:40&theme=nuit`));
  await bubble('Belval').waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/carte-nuit-1840.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(CARTE(`date=${TODAY}&heure=14:30`));
  await bubble('Belval').waitFor();
  await page.screenshot({ path: `${OUT}/carte-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  return '3840×2160, nuit, 390×844';
});

await step('Display K : aucune donnée interne visible', async () => {
  await page.goto(CARTE(`date=${TODAY}&heure=18:40&rotation=2`));
  await bubble('Belval').waitFor();
  await page.waitForTimeout(5000);
  const text = await page.locator('body').innerText();
  const cache = await page.evaluate(() => localStorage.getItem('unipop-livemap-display-v1') ?? '');
  for (const s of ['Réelle', 'DESCRIPTION-INTERNE', 'NOTE-SECRETE', 'mbr_x']) { expect(!text.includes(s), `affiché : ${s}`); expect(!cache.includes(s), `en cache : ${s}`); }
  return 'formateurs, descriptions, notes et identifiants absents de l’écran et du cache';
});

await step('Display I : coupure réseau, la dernière vue valide reste affichée', async () => {
  offline = true;
  await page.reload();
  await bubble('Belval').waitFor({ timeout: 15000 });
  await page.locator('.carte-foot .warn').waitFor({ timeout: 20000 });
  const w = await page.locator('.carte-foot').innerText();
  offline = false;
  return w.replace(/\n/g, ' ').slice(0, 110);
});

await step('Menu : « UniPop Live Map » juste sous Équipe', async () => {
  await page.goto(`${BASE}/#annee`);
  await page.locator('.nav a .nav-label').first().waitFor();
  const labels = await page.locator('.nav a .nav-label').allInnerTexts();
  const i = labels.indexOf('Équipe');
  expect(i >= 0 && labels[i + 1] === 'UniPop Live Map', labels.join(' | '));
  await page.locator('.nav a', { hasText: 'UniPop Live Map' }).click();
  await page.locator('.topbar h1', { hasText: 'UniPop Live Map' }).waitFor();
  return labels.slice(i, i + 3).join(' → ');
});

await step('Planning : import des cours, carte UniPop Live Map, survol', async () => {
  await page.goto(`${BASE}/#formations`);
  await page.locator('input[type="file"]').first().setInputFiles(`${OUT}/trainings-fixture.json`);
  await page.locator('.toast-text', { hasText: /formations importées/ }).waitFor();
  await page.goto(`${BASE}/#carte`);
  await page.locator('.lms .lm').waitFor();
  const live = page.getByRole('checkbox', { name: 'En direct' });
  if (await live.count() && await live.isChecked()) await page.locator('.lms .toggle', { hasText: 'En direct' }).click();
  await page.locator('.lms .lmb', { has: page.locator('b', { hasText: /^Belval$/ }) }).waitFor();
  await page.locator('.lms .lmb', { has: page.locator('b', { hasText: /^Belval$/ }) }).hover();
  await page.locator('.lm-tip').waitFor();
  const tip = await page.locator('.lm-tip').innerText();
  expect(/Belval/.test(tip) && !/Réelle/.test(tip), tip.slice(0, 80));
  await page.screenshot({ path: `${OUT}/planning-carte.png` });
  return tip.split('\n').slice(0, 2).join(' ');
});

await step('Planning E : changer de date met la carte à jour', async () => {
  await page.getByRole('button', { name: 'Jour suivant' }).click();
  await page.waitForTimeout(600);
  const names = await page.locator('.lms .lmb:not(.is-leaving) .lmb-label b').allInnerTexts();
  expect(names.includes('Diekirch') && !names.includes('Belval'), names.join(','));
  await page.getByRole('button', { name: 'Aujourd’hui' }).last().click();
  return `demain : ${names.join(', ')}`;
});

await step('Planning H : lieu non localisé listé puis associé', async () => {
  const row = page.locator('.lms-unres-row', { hasText: 'Salle des fêtes' });
  await row.waitFor();
  await row.locator('select').selectOption('mersch');
  await page.locator('.lms .lmb', { has: page.locator('b', { hasText: /^Mersch$/ }) }).waitFor();
  return 'Hameau Inconnu → Mersch';
});

await step('Planning K : publication, flux public limité aux champs autorisés', async () => {
  await page.keyboard.press('n');
  await page.getByLabel('Titre', { exact: true }).fill('Soirée découverte (public)');
  await page.locator('.toggle', { hasText: 'Toute la journée' }).click();
  await page.getByLabel('Lieu').fill('Université Populaire Belval');
  await page.getByLabel('Notes').fill('Clé du local chez le concierge');
  await page.getByRole('button', { name: 'Créer l’événement' }).click();
  await page.locator('.toast-text', { hasText: 'Événement créé' }).waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.lms-publish summary').click();
  await page.locator('.lms-pub-row', { hasText: 'Soirée découverte' }).locator('input').check();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exporter le flux public/ }).click()]);
  await dl.saveAs(`${OUT}/carte-evenements.json`);
  const out = JSON.parse(readFileSync(`${OUT}/carte-evenements.json`, 'utf8'));
  const txt = JSON.stringify(out);
  expect(out.events.length >= 1 && !txt.includes('concierge') && !txt.includes('evt_'), txt.slice(0, 200));
  return `${out.events.length} occurrence(s), placeId ${out.events[0].placeId}`;
});

await step('Régression J : planning, calendrier, équipe, impression', async () => {
  for (const r of ['annee', 'calendrier', 'projets', 'taches', 'rappels', 'formations', 'equipe', 'carte', 'impression', 'parametres']) {
    await page.goto(`${BASE}/#${r}`);
    await page.locator('.topbar h1').waitFor();
  }
  expect(await page.goto(`${BASE}/#equipe`).then(() => page.locator('.perm-table').waitFor()).then(() => page.locator('.lms').count()) === 0, 'Équipe modifiée');
  await page.goto(`${BASE}/#annee`);
  await page.locator('.planner').waitFor();
  await page.goto(`${BASE}/#impression`);
  await page.locator('.pp-sheet svg').waitFor({ timeout: 15000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Télécharger le PDF A0/ }).click()]);
  await dl.saveAs(`${OUT}/a0.pdf`);
  const info = execFileSync('pdfinfo', [`${OUT}/a0.pdf`]).toString();
  expect(/A0/.test(info), info);
  return 'toutes les pages s’ouvrent, PDF A0 généré';
});

await step('Aucune erreur JavaScript', async () => { expect(!errors.length, errors.slice(0, 2).join(' | ')); return 'console propre'; });
writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, errors }, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} étapes réussies`);
await browser.close();
server.close();
