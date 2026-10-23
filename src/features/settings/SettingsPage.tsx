import { useRef, useState } from 'react';
import { run } from '../../app/actions';
import { useAppState, useStore } from '../../app/store';
import { formatTimestamp, todayISO } from '../../domain/dates';
import { normalizeThresholds } from '../../domain/reminders';
import type { PlanningData } from '../../data/contracts';
import { buildBackup, CURRENT_SCHEMA_VERSION, mergeData, summarizeMerge, validateBackup } from '../../data/schema';
import { APP_VERSION } from '../../config';
import { readFileAsText, saveFile, saveMessage } from '../../services/fileSaver';
import { Icon } from '../../ui/icons';
import { Button, Field, Segmented, Select, Toggle } from '../../ui/kit';
import { ui } from '../../ui/uiStore';
import { CourseSourceBar } from '../courses/CoursesPage';
import { DemoUserSwitch } from '../team/TeamPage';

function RestoreBody({ v, summary, close }: { v: ReturnType<typeof validateBackup>; summary: ReturnType<typeof summarizeMerge> | null; close: (x?: unknown) => void }) {
  return (
    <div className="dlg-body">
      <h2 className="dlg-title">{v.ok ? 'Restaurer cette sauvegarde ?' : 'Sauvegarde refusée'}</h2>
      {v.ok && v.data && summary ? <>
        <p className="dlg-text">Sauvegarde du {formatTimestamp(v.exportedAt)} : {v.data.events.length} événements, {v.data.tasks.length} tâches, {v.data.team.length} membres.</p>
        <ul className="restore-sum">
          <li>Événements : {summary.events.added} nouveaux, {summary.events.existing} déjà présents</li>
          <li>Tâches : {summary.tasks.added} nouvelles, {summary.tasks.existing} déjà présentes</li>
          <li>Équipe : {summary.team.added} nouveaux, {summary.team.existing} déjà présents</li>
        </ul>
        {v.warnings.length ? <ul className="warn-list">{v.warnings.map((w) => <li key={w}><Icon name="alert" size={14} />{w}</li>)}</ul> : null}
        <p className="form-note">« Fusionner » ajoute uniquement les éléments nouveaux et ne modifie aucun élément existant. « Remplacer » efface les données locales actuelles.</p>
      </> : <ul className="warn-list">{v.errors.map((e) => <li key={e}><Icon name="alert" size={14} />{e}</li>)}</ul>}
      <div className="dlg-actions">
        <button type="button" className="btn btn-ghost" onClick={() => close(null)}>{v.ok ? 'Annuler' : 'Fermer'}</button>
        {v.ok ? <>
          <button type="button" className="btn btn-danger" onClick={() => close('replace')}>Remplacer tout</button>
          <button type="button" className="btn btn-primary" onClick={() => close('merge')}>Fusionner</button>
        </> : null}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const store = useStore();
  const s = useAppState((x) => x.settings);
  const events = useAppState((x) => x.events);
  const tasks = useAppState((x) => x.tasks);
  const team = useAppState((x) => x.team);
  const kind = useAppState((x) => x.storageKind);
  const canSettings = store.can('settings.manage');
  const canData = store.can('data.manage');
  const [url, setUrl] = useState(s.courseSourceUrl);
  const [pub, setPub] = useState(s.publicAppUrl);
  const [th, setTh] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const exportBackup = async () => {
    const json = JSON.stringify(buildBackup(store.exportData()), null, 2);
    const m = saveMessage(await saveFile(`unipop-command-sauvegarde-${todayISO()}.json`, json, 'application/json'), 'Sauvegarde JSON');
    ui.toast(m.text, m.tone);
  };
  const restore = async (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    let raw: unknown;
    try { raw = JSON.parse(await readFileAsText(f)); } catch { return ui.toast('Ce fichier n’est pas un JSON valide.', 'error'); }
    const v = validateBackup(raw);
    const summary = v.ok && v.data ? summarizeMerge(store.exportData(), v.data) : null;
    const choice = await ui.openDialog<'merge' | 'replace' | null>((close) => <RestoreBody v={v} summary={summary} close={close} />, 'md');
    if (!choice || !v.data) return;
    if (choice === 'replace') {
      const ok = await ui.confirm({ title: 'Remplacer toutes les données locales ?', body: 'Les événements, tâches et membres actuels seront effacés. Exportez d’abord une sauvegarde si nécessaire.', confirmLabel: 'Remplacer', danger: true });
      if (!ok) return;
      await run(() => store.replaceData(v.data as PlanningData), 'Données restaurées (remplacement)');
    } else {
      await run(() => store.replaceData(mergeData(store.exportData(), v.data as PlanningData)), `Fusion terminée : ${summary!.events.added} événements et ${summary!.tasks.added} tâches ajoutés`);
    }
  };
  const addThreshold = () => {
    const n = Number(th);
    if (!Number.isFinite(n) || n < 0 || n > 365) return ui.toast('Seuil attendu entre 0 et 365 jours.', 'error');
    void run(() => store.updateSettings({ reminderThresholds: normalizeThresholds([...s.reminderThresholds, n]) }), 'Seuil ajouté');
    setTh('');
  };

  return (
    <div className="page settings">
      <section className="set-sec">
        <h3>Source des formations</h3>
        <CourseSourceBar />
        <div className="form-grid">
          <Field label="Adresse du fichier JSON" wide hint="Par défaut, la source UniPop. Peut pointer vers un proxy Cloudflare Worker.">
            <span className="inline-pair"><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} disabled={!canSettings} />
              <Button disabled={!canSettings || url === s.courseSourceUrl} onClick={() => void run(() => store.updateSettings({ courseSourceUrl: url.trim() }), 'Source enregistrée')}>Enregistrer</Button></span>
          </Field>
          <Field label="Synchronisation automatique">
            <Select value={String(s.courseAutoSyncHours)} disabled={!canSettings} onChange={(v) => void run(() => store.updateSettings({ courseAutoSyncHours: Number(v) }), 'Préférence enregistrée')} ariaLabel="Synchronisation"
              options={[{ value: '0', label: 'Manuelle uniquement' }, { value: '6', label: 'Toutes les 6 heures' }, { value: '12', label: 'Toutes les 12 heures' }, { value: '24', label: 'Une fois par jour' }]} />
          </Field>
        </div>
      </section>

      <section className="set-sec">
        <h3>Application publique</h3>
        <Field label="URL publique du calendrier" wide hint="Utilisée pour le QR code des impressions. Sans URL, aucun QR code n’est imprimé.">
          <span className="inline-pair"><input type="url" value={pub} placeholder="https://planning.exemple.lu" onChange={(e) => setPub(e.target.value)} disabled={!canSettings} />
            <Button disabled={!canSettings || pub === s.publicAppUrl} onClick={() => void run(() => store.updateSettings({ publicAppUrl: pub.trim() }), 'URL enregistrée')}>Enregistrer</Button></span>
        </Field>
      </section>

      <section className="set-sec">
        <h3>Rappels</h3>
        <div className="thresholds">
          {s.reminderThresholds.map((t) => (
            <span key={t} className="th-chip">{t === 0 ? 'Jour J' : `J-${t}`}
              <button type="button" aria-label={`Retirer le seuil ${t}`} disabled={!canSettings || s.reminderThresholds.length <= 1} onClick={() => void run(() => store.updateSettings({ reminderThresholds: s.reminderThresholds.filter((x) => x !== t) }))}><Icon name="x" size={12} /></button>
            </span>
          ))}
          <span className="inline-pair th-add"><input type="number" min={0} max={365} value={th} onChange={(e) => setTh(e.target.value)} placeholder="Jours" aria-label="Nouveau seuil en jours" disabled={!canSettings} />
            <Button size="sm" disabled={!canSettings || th === ''} onClick={addThreshold}>Ajouter</Button></span>
        </div>
      </section>

      <section className="set-sec">
        <h3>Affichage et utilisateur</h3>
        <div className="form-grid">
          <Field label="Thème"><Segmented ariaLabel="Thème" size="sm" value={s.theme} onChange={(v) => void run(() => store.updateSettings({ theme: v }, { asUserSwitch: true }))} options={[{ value: 'system', label: 'Système' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }]} /></Field>
          <div className="field"><Toggle checked={s.showHolidays} disabled={!canSettings} onChange={(v) => void run(() => store.updateSettings({ showHolidays: v }))} label="Afficher les jours fériés luxembourgeois" /></div>
        </div>
        <DemoUserSwitch />
      </section>

      <section className="set-sec">
        <h3>Données</h3>
        <dl className="facts">
          <div><dt>Stockage</dt><dd>{kind === 'local-indexeddb' ? 'Local au navigateur (IndexedDB), cet appareil uniquement' : kind}</dd></div>
          <div><dt>Contenu</dt><dd>{events.length} événements, {tasks.length} tâches, {team.length} membres</dd></div>
          <div><dt>Schéma de données</dt><dd>Version {CURRENT_SCHEMA_VERSION}</dd></div>
          <div><dt>Synchronisation multi-utilisateurs</dt><dd>Non configurée : prévue avec Supabase (voir docs/SUPABASE.md)</dd></div>
        </dl>
        <div className="btn-row">
          <Button icon="download" onClick={() => void exportBackup()}>Exporter une sauvegarde JSON</Button>
          <Button icon="upload" disabled={!canData} onClick={() => fileRef.current?.click()}>Restaurer une sauvegarde</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void restore(e.target.files?.[0])} />
        </div>
        <div className="btn-row">
          <Button variant="danger" icon="trash" disabled={!canData} onClick={async () => {
            if (await ui.confirm({ title: 'Repartir de zéro ?', body: 'Les événements, tâches et membres sont effacés. Un membre ADMIN-01 est créé pour continuer.', confirmLabel: 'Tout effacer', danger: true })) {
              await run(() => store.startEmpty(), 'Données effacées');
            }
          }}>Repartir de zéro</Button>
        </div>
      </section>

      <section className="set-sec about">
        <h3>À propos</h3>
        <p><b>UniPop COMMAND</b>, planification et coordination, version {APP_VERSION}. Mode local, sans authentification ni synchronisation entre appareils.</p>
        <p className="credit">Built by Frank G — IBM Certified AI Developer</p>
      </section>
    </div>
  );
}
