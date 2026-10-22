// Acceptance run against the single-file build: node e2e/acceptance.mjs
// Requires `npm run build:single` first. Screenshots and downloads go to e2e/out/.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const OUT = 'e2e/out';
mkdirSync(OUT, { recursive: true });
const html = readFileSync('dist-single/index.html');
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); }).listen(4173);
const URL0 = 'http://127.0.0.1:4173/';

const results = [];
const errors = [];
async function step(name, fn) {
  try { const note = await fn(); results.push({ name, ok: true, note: note ?? '' }); console.log(`PASS  ${name}${note ? `  (${note})` : ''}`); }
  catch (e) { await page.screenshot({ path: `${OUT}/FAIL-${name.slice(0, 12).replace(/[^a-z0-9]+/gi, '_')}.png` }).catch(() => {}); results.push({ name, ok: false, note: String(e.message ?? e).split('\n')[0] }); console.log(`FAIL  ${name}  ${String(e.message ?? e).split('\n')[0]}`); }
}
const pdfInfo = (file) => execFileSync('pdfinfo', [file]).toString();
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, locale: 'fr-LU', timezoneId: 'Europe/Luxembourg' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource|net::/.test(m.text())) errors.push(`console: ${m.text()}`); });
const toast = (re) => page.locator('.toast-text', { hasText: re }).first().waitFor({ timeout: 6000 });
const period = () => page.locator('.cal-period').innerText();
const today = await (async () => { const d = new Date(); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Luxembourg' }).format(d); })();
const plus = (n) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const EVENT = 'Salon de la formation (test)';
const RECUR = 'Journée des partenaires (test)';

await step('1. Ouvrir l’application', async () => {
  await page.goto(URL0);
  await page.locator('.planner').waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}/01-vue-annuelle-1440.png`, fullPage: false });
  return `${await page.locator('.pbar').count()} barres, ${await page.locator('.pcell').count()} jours`;
});

await step('2. Naviguer dans les quatre trimestres', async () => {
  await page.locator('.pq-label').first().click();
  expect((await period()).startsWith('T1'), `période ${await period()}`);
  const seen = ['T1'];
  for (let i = 0; i < 3; i++) { await page.getByRole('button', { name: 'Période suivante' }).click(); seen.push((await period()).slice(0, 2)); }
  expect(seen.join() === 'T1,T2,T3,T4', seen.join());
  await page.screenshot({ path: `${OUT}/02-trimestre.png` });
  return seen.join(' ');
});

await step('3. Changer d’année', async () => {
  await page.getByRole('radio', { name: 'Année' }).click();
  const y0 = Number(await period());
  await page.getByRole('button', { name: 'Période suivante' }).click();
  expect(Number(await period()) === y0 + 1, await period());
  await page.getByRole('button', { name: 'Période précédente' }).click();
  expect(Number(await period()) === y0, await period());
  return `${y0} → ${y0 + 1} → ${y0}`;
});

await step('4. Ouvrir un jour du calendrier', async () => {
  await page.locator(`.pcell[data-date="${today}"] .pcell-num`).click();
  await page.locator('.panel .pv-title').waitFor();
  const t = await page.locator('.panel .pv-title').innerText();
  expect(/\d{4}/.test(t), t);
  await page.screenshot({ path: `${OUT}/04-panneau-jour.png` });
  await page.keyboard.press('Escape');
  return t;
});

await step('5. Formations groupées par thème (popover)', async () => {
  await page.locator('.nav a', { hasText: 'Calendrier' }).click();
  await page.getByRole('radio', { name: 'Mois' }).click();
  let chip = page.locator('.theme-chip[title^="Intelligence artificielle"]');
  for (let i = 0; i < 6 && !(await chip.count()); i++) { await page.getByRole('button', { name: 'Période suivante' }).click(); chip = page.locator('.theme-chip[title^="Intelligence artificielle"]'); }
  expect(await chip.count(), 'aucune puce IA trouvée');
  const target = chip.filter({ hasText: /2|3|4/ }).first();
  await (await target.count() ? target : chip.first()).click();
  await page.locator('.popover .course-line').first().waitFor();
  const n = await page.locator('.popover .course-line').count();
  await page.screenshot({ path: `${OUT}/05-popover-theme.png` });
  const txt = await page.locator('.popover').innerText();
  expect(/\d\d:\d\d/.test(txt), 'horaires absents');
  await page.keyboard.press('Escape');
  return `${n} cours dans le popover`;
});

await step('6. Créer un événement (modèle Conférence)', async () => {
  await page.keyboard.press('n');
  await page.getByLabel('Titre', { exact: true }).fill(EVENT);
  await page.getByLabel('Modèle').selectOption({ label: 'Conférence' });
  await page.getByLabel('Début').fill(plus(60));
  await page.getByRole('button', { name: 'Créer l’événement' }).click();
  await toast(/Événement créé avec \d+ tâches/);
  await page.locator('.panel .pv-title', { hasText: EVENT }).waitFor();
  return await page.locator('.toast-text').first().innerText();
});

await step('7–8. Ajouter plusieurs tâches et les assigner', async () => {
  const qa = page.locator('.panel .quickadd');
  for (const [title, who] of [['Réserver les stands', 'ORG-03'], ['Imprimer les badges', 'COM-01'], ['Tester la sonorisation', 'TECH-01']]) {
    await qa.getByLabel('Titre de la nouvelle tâche').fill(title);
    await qa.getByLabel('Responsable de la nouvelle tâche').selectOption({ label: who });
    await qa.getByLabel('Titre de la nouvelle tâche').press('Enter');
    await page.locator('.panel .trow', { hasText: title }).waitFor();
  }
  const tags = await page.locator('.panel .trow', { hasText: 'Imprimer les badges' }).locator('.mtag').innerText();
  expect(tags.includes('COM-01'), tags);
  return `${await page.locator('.panel .trow').count()} tâches liées`;
});

await step('9. Modifier une échéance', async () => {
  await page.locator('.panel .trow-main', { hasText: 'Imprimer les badges' }).click();
  await page.getByLabel('Échéance').fill(plus(55));
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await toast(/Tâche enregistrée/);
  return plus(55);
});

await step('10. Voir les tâches dans le Gantt (et glisser une barre)', async () => {
  await page.locator('.panel').getByRole('button', { name: 'Ouvrir la fiche' }).click();
  await page.locator('.detail-title', { hasText: EVENT }).waitFor();
  await page.getByRole('tab', { name: 'Planning' }).click();
  await page.locator('.g-bar').first().waitFor();
  const bars = await page.locator('.g-bar').count();
  const ms = await page.locator('.g-ms').count();
  const bar = page.locator('.g-bar', { hasText: 'Lancer la communication' }).first();
  const box = await bar.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await toast(/Lancer la communication|Attention/);
  }
  await page.screenshot({ path: `${OUT}/10-gantt.png` });
  return `${bars} barres, ${ms} jalons, glisser-déposer enregistré`;
});

await step('11–12. Terminer une tâche et vérifier l’avancement', async () => {
  await page.getByRole('tab', { name: 'Vue d’ensemble' }).click();
  const before = await page.locator('.stat-value').innerText();
  await page.getByRole('tab', { name: /Tâches/ }).click();
  await page.getByRole('button', { name: 'Terminer Réserver les stands' }).click();
  await toast(/Tâche terminée/);
  await page.getByRole('tab', { name: 'Vue d’ensemble' }).click();
  const after = await page.locator('.stat-value').innerText();
  expect(parseInt(after) > parseInt(before), `${before} → ${after}`);
  return `${before} → ${after}`;
});

await step('13–14. Événement annuel récurrent et prochaine occurrence', async () => {
  await page.keyboard.press('n');
  await page.getByLabel('Titre', { exact: true }).fill(RECUR);
  await page.getByLabel('Début').fill(plus(-30));
  await page.getByLabel('Répétition').selectOption({ label: 'Chaque année' });
  await page.getByRole('button', { name: 'Créer l’événement' }).click();
  await toast(/Événement créé/);
  await page.locator('.panel').getByRole('button', { name: 'Ouvrir la fiche' }).click();
  const fact = page.locator('.facts div', { hasText: 'Prochaine occurrence' });
  await fact.waitFor();
  const txt = await fact.innerText();
  const nextYear = String(Number(plus(-30).slice(0, 4)) + 1);
  expect(txt.includes(nextYear), txt);
  await page.screenshot({ path: `${OUT}/14-recurrence.png` });
  return txt.replace(/\n/g, ' ');
});

await step('15–16. Rappel en retard et filtres', async () => {
  await page.locator('.nav a', { hasText: 'Tâches' }).click();
  const qa = page.locator('.quickadd');
  await qa.getByLabel('Titre de la nouvelle tâche').fill('Relancer le traiteur (test retard)');
  await qa.getByLabel('Échéance').fill(plus(-2));
  await qa.getByLabel('Titre de la nouvelle tâche').press('Enter');
  await toast(/Tâche ajoutée/);
  await page.locator('.nav a', { hasText: 'Rappels' }).click();
  await page.locator('.rem-title', { hasText: 'Relancer le traiteur' }).first().waitFor();
  const total = await page.locator('.rem').count();
  await page.locator('.type-chip', { hasText: 'En retard' }).click();
  const types = await page.locator('.rem-type').allInnerTexts();
  expect(types.length && types.every((t) => t === 'En retard'), types.join());
  await page.screenshot({ path: `${OUT}/16-rappels.png` });
  return `${total} rappels, ${types.length} en retard après filtre`;
});

async function download(trigger, name) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), trigger()]);
  const path = `${OUT}/${name}`;
  await dl.saveAs(path);
  return path;
}

await step('17. Imprimer une checklist de projet (A4)', async () => {
  await page.locator('.nav a', { hasText: 'Projets' }).click();
  const row = page.locator('.erow', { hasText: EVENT });
  await row.getByRole('button', { name: /Actions pour/ }).click();
  const p = await download(() => page.getByRole('menuitem', { name: 'Checklist PDF (A4)' }).click(), 'checklist.pdf');
  const info = pdfInfo(p);
  expect(/A4/.test(info), info);
  return info.match(/Page size:.*$/m)[0];
});

await step('18. Générer un PDF annuel A0 valide', async () => {
  await page.locator('.nav a', { hasText: 'Impression' }).click();
  await page.locator('.pp-sheet svg').waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}/18-impression.png` });
  const p = await download(() => page.getByRole('button', { name: /Télécharger le PDF A0/ }).click(), 'planning-annuel-A0.pdf');
  const info = pdfInfo(p);
  expect(/Page size:\s+3370\.\d+ x 2383\.\d+ pts \(A0\)/.test(info), info);
  const images = execFileSync('pdfimages', ['-list', p]).toString().trim().split('\n').length - 2;
  expect(images === 0, `${images} images raster`);
  execFileSync('pdftoppm', ['-r', '18', '-png', '-singlefile', p, `${OUT}/18-a0-rendu`]);
  return `${info.match(/Page size:.*$/m)[0]}, 0 image raster`;
});

await step('19–20. Recharger et retrouver les données', async () => {
  await page.reload();
  await page.locator('.sidebar').waitFor({ timeout: 15000 });
  await page.locator('.nav a', { hasText: 'Projets' }).click();
  await page.locator('.erow', { hasText: EVENT }).waitFor();
  await page.locator('.erow', { hasText: RECUR }).waitFor();
  await page.locator('.nav a', { hasText: 'Tâches' }).click();
  await page.locator('.trow', { hasText: 'Relancer le traiteur' }).waitFor();
  return 'événements, tâches et assignations conservés';
});

await step('22. États vides et échec de chargement JSON', async () => {
  await page.locator('.search-input input').fill('zzz introuvable');
  await page.locator('.empty-title', { hasText: 'Aucune tâche ne correspond' }).waitFor();
  await page.locator('.search-input input').fill('');
  await page.locator('.nav a', { hasText: 'Formations' }).click();
  await page.getByRole('button', { name: 'Actualiser' }).click();
  await page.locator('.sb-warning').waitFor({ timeout: 25000 });
  const w = await page.locator('.sb-warning').innerText();
  expect(/démonstration|inaccessible|échou/i.test(w), w);
  await page.screenshot({ path: `${OUT}/22-formations-echec.png` });
  return w.slice(0, 90);
});

await step('23. Export puis restauration de sauvegarde', async () => {
  await page.locator('.nav a', { hasText: 'Paramètres' }).click();
  const p = await download(() => page.getByRole('button', { name: 'Exporter une sauvegarde JSON' }).click(), 'sauvegarde.json');
  const json = JSON.parse(readFileSync(p, 'utf8'));
  expect(json.format === 'unipop-command-backup' && json.data.events.length > 5, 'format');
  json.data.tasks.push({ ...json.data.tasks[0], id: 'tsk_import_test', title: 'Tâche importée (test)', status: 'a_faire', progress: 0, completedAt: null });
  writeFileSync(`${OUT}/sauvegarde-modifiee.json`, JSON.stringify(json));
  await page.locator('input[type="file"]').last().setInputFiles(`${OUT}/sauvegarde-modifiee.json`);
  await page.locator('.dlg-title', { hasText: 'Restaurer cette sauvegarde' }).waitFor();
  const sum = await page.locator('.restore-sum').innerText();
  await page.getByRole('button', { name: 'Fusionner' }).click();
  await toast(/Fusion terminée/);
  await page.locator('.nav a', { hasText: 'Tâches' }).click();
  await page.locator('.trow', { hasText: 'Tâche importée (test)' }).waitFor();
  return sum.split('\n')[1];
});

await step('21. Mises en page bureau, tablette et mobile', async () => {
  const notes = [];
  for (const [w, h, label] of [[1440, 900, 'bureau'], [1024, 768, 'tablette-paysage'], [820, 1180, 'tablette-portrait'], [390, 844, 'mobile']]) {
    await page.setViewportSize({ width: w, height: h });
    await page.locator('.topbar').waitFor();
    await page.evaluate(() => { location.hash = 'annee'; });
    await page.waitForTimeout(300);
    for (const r of ['annee', 'taches', 'projets', 'impression']) {
      await page.evaluate((x) => { location.hash = x; }, r);
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) notes.push(`${label}/${r}: +${overflow}px`);
      if (r === 'annee' || (label === 'mobile' && r === 'taches')) await page.screenshot({ path: `${OUT}/21-${label}-${r}.png` });
    }
  }
  expect(!notes.length, notes.join(', '));
  return 'aucun débordement horizontal de page';
});

await step('Aucune erreur JavaScript', async () => { expect(!errors.length, errors.slice(0, 3).join(' | ')); return 'console propre'; });

writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, errors }, null, 2));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} étapes réussies`);
await browser.close();
server.close();
