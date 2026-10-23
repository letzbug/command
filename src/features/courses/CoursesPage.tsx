import { useMemo, useRef, useState } from 'react';
import { useCourseIndex } from '../../app/derived';
import { useAppState, useStore } from '../../app/store';
import { capitalize, formatDate, formatRange, formatTimestamp, MONTHS_FR } from '../../domain/dates';
import { matchScore } from '../../domain/search';
import type { Course } from '../../domain/types';
import { readFileAsText } from '../../services/fileSaver';
import { Icon } from '../../ui/icons';
import { Badge, Button, Empty, Progress, Select } from '../../ui/kit';
import { ui } from '../../ui/uiStore';

export function CourseSourceBar() {
  const store = useStore();
  const snap = useAppState((s) => s.courseSnapshot);
  const syncing = useAppState((s) => s.courseSyncing);
  const url = useAppState((s) => s.settings.courseSourceUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const label = snap?.source === 'live' ? 'Synchronisé avec la source UniPop' : snap?.source === 'file' ? `Fichier importé : ${snap.fileName ?? 'trainings.json'}` : 'Source UniPop non synchronisée';
  const refresh = async () => {
    const s = await store.refreshCourses();
    if (s.source === 'live' && !s.warning) ui.toast(`${s.courses.length} formations synchronisées`, 'success');
    else ui.toast(s.warning ?? 'Synchronisation terminée avec un avertissement.', 'warning');
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const s = await store.importCourseFile(f.name, await readFileAsText(f));
      ui.toast(`${s.courses.length} formations importées depuis ${f.name}`, 'success');
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : 'Import impossible.', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  return (
    <div className={`source-bar ${snap?.source === 'demo' ? 'is-demo' : ''} ${snap?.warning ? 'has-warning' : ''}`}>
      <div className="sb-main">
        <span className="sb-state"><i />{label}</span>
        <span className="sb-meta">
          {snap?.courses.length ?? 0} formations, lecture seule.
          {' '}Dernière synchronisation réussie : {snap?.lastSuccessAt ? formatTimestamp(snap.lastSuccessAt) : 'aucune'}.
        </span>
        {snap?.warning ? <span className="sb-warning"><Icon name="alert" size={15} />{snap.warning}</span> : null}
        <span className="sb-url" title={url}>Source : {url}</span>
      </div>
      <div className="sb-actions">
        <Button size="sm" icon="refresh" onClick={() => void refresh()} disabled={syncing}>{syncing ? 'Synchronisation…' : 'Actualiser'}</Button>
        <Button size="sm" icon="upload" onClick={() => fileRef.current?.click()}>Importer un fichier JSON</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
    </div>
  );
}

export function CoursesPage() {
  const snap = useAppState((s) => s.courseSnapshot);
  const idx = useCourseIndex();
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState('');
  const [cat, setCat] = useState('');
  const [loc, setLoc] = useState('');
  const [month, setMonth] = useState('');
  const [limit, setLimit] = useState(60);
  const courses = snap?.courses ?? [];

  const months = useMemo(() => [...new Set(courses.flatMap((c) => c.sessions.map((s) => s.date.slice(0, 7))))].sort(), [courses]);
  const filtered = useMemo(() => courses
    .filter((c) => (!theme || c.theme === theme) && (!cat || c.category === cat) && (!loc || (c.locality || c.location) === loc)
      && (!month || c.sessions.some((s) => s.date.startsWith(month)))
      && (!q.trim() || matchScore(q, [c.title, c.theme, c.code, c.location, c.locality, c.category]) > 0))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title, 'fr')), [courses, theme, cat, loc, month, q]);
  const themeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of filtered) m.set(c.theme, (m.get(c.theme) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 14);
  }, [filtered]);

  return (
    <div className="page">
      <CourseSourceBar />
      <div className="page-tools">
        <div className="search-input"><Icon name="search" size={16} /><input value={q} onChange={(e) => { setQ(e.target.value); setLimit(60); }} placeholder="Titre, thème, code, lieu…" aria-label="Rechercher une formation" /></div>
        <Select value={theme} onChange={setTheme} ariaLabel="Thème" options={[{ value: '', label: 'Tous les thèmes' }, ...idx.themes.map((t) => ({ value: t, label: t }))]} />
        <Select value={cat} onChange={setCat} ariaLabel="Catégorie" options={[{ value: '', label: 'Toutes catégories' }, ...idx.categories.map((t) => ({ value: t, label: t }))]} />
        <Select value={loc} onChange={setLoc} ariaLabel="Lieu" options={[{ value: '', label: 'Tous les lieux' }, ...idx.locations.map((t) => ({ value: t, label: t }))]} />
        <Select value={month} onChange={setMonth} ariaLabel="Mois" options={[{ value: '', label: 'Tous les mois' }, ...months.map((m) => ({ value: m, label: `${capitalize(MONTHS_FR[Number(m.slice(5, 7)) - 1])} ${m.slice(0, 4)}` }))]} />
      </div>
      {themeCounts.length ? (
        <div className="theme-cloud" aria-label="Thèmes">
          {themeCounts.map(([t, n]) => (
            <button key={t} type="button" className={`theme-chip ${theme === t ? 'is-on' : ''}`} aria-pressed={theme === t} onClick={() => setTheme(theme === t ? '' : t)}><span>{t}</span><b>{n}</b></button>
          ))}
        </div>
      ) : null}
      {filtered.length ? (
        <div className="ctable" role="table" aria-label="Formations">
          <div className="crow chead" role="row">
            <span role="columnheader">Formation</span><span role="columnheader">Dates et horaire</span><span role="columnheader">Lieu</span><span role="columnheader">Inscriptions</span>
          </div>
          {filtered.slice(0, limit).map((c) => <CourseRow key={c.id} c={c} />)}
          {filtered.length > limit ? <Button className="more-btn" onClick={() => setLimit(limit + 60)}>Afficher plus ({filtered.length - limit} restantes)</Button> : null}
        </div>
      ) : <Empty icon="course" title={courses.length ? 'Aucune formation ne correspond' : 'Aucune formation chargée'}>{courses.length ? 'Modifiez la recherche ou les filtres.' : 'Actualisez la source ou importez un fichier trainings.json.'}</Empty>}
    </div>
  );
}

function CourseRow({ c }: { c: Course }) {
  const full = !!c.capacity && (c.enrolled ?? 0) >= c.capacity;
  return (
    <button type="button" role="row" className="crow" onClick={() => void ui.openPanel({ kind: 'course', id: c.id })}>
      <span role="cell" className="c-title"><b>{c.title}</b>{c.trainer ? <small>Formateur : {c.trainer}</small> : null}<small><span className="tchip">{c.theme}</span>{c.code}</small></span>
      <span role="cell" className="c-dates">{formatRange(c.startDate, c.endDate)}<small>{c.sessions.length} séance{c.sessions.length > 1 ? 's' : ''}{c.sessions.some((s) => s.estimated) ? ' (estimées)' : ''}</small></span>
      <span role="cell" className="c-loc">{c.location}{c.room ? <small>Salle {c.room}</small> : c.locality && c.locality !== c.location ? <small>{c.locality}</small> : null}</span>
      <span role="cell" className={`c-seats ${full ? 'is-full' : ''}`}>{c.capacity ? <><b>{c.enrolled ?? '?'}/{c.capacity}</b><Progress value={((c.enrolled ?? 0) / c.capacity) * 100} tone={full ? 'bad' : undefined} /></> : '—'}</span>
    </button>
  );
}

export function CoursePanel({ id }: { id: string }) {
  const c = useAppState((s) => s.courseSnapshot?.courses.find((x) => x.id === id));
  const today = useAppState((s) => s.today);
  if (!c) return <Empty title="Formation introuvable">La source a peut-être été actualisée.</Empty>;
  const upcoming = c.sessions.filter((s) => s.date >= today);
  return (
    <div className="pv">
      <header className="pv-head">
        <p className="pv-kicker">{c.theme}, {c.category}</p>
        <h2 className="pv-title">{c.title}</h2>
        <p className="detail-meta">
          <span><Icon name="calendar" size={15} />{formatRange(c.startDate, c.endDate)}</span>
          <span><Icon name="pin" size={15} />{c.location}{c.room ? `, salle ${c.room}` : ''}{c.locality && c.locality !== c.location ? `, ${c.locality}` : ''}</span>
        </p>
        <Badge tone="teal">Lecture seule</Badge>
      </header>
      <dl className="facts facts-tight">
        <div><dt>Code</dt><dd>{c.code}</dd></div>
        <div><dt>Format</dt><dd>{c.format}</dd></div>
        {c.trainer ? <div><dt>Formateur·rice</dt><dd>{c.trainer}</dd></div> : null}
        {c.language ? <div><dt>Langue</dt><dd>{c.language}</dd></div> : null}
        {c.level ? <div><dt>Niveau</dt><dd>{c.level}</dd></div> : null}
        <div><dt>Inscriptions</dt><dd>{c.capacity ? `${c.enrolled ?? '?'} / ${c.capacity}` : 'Non communiqué'}</dd></div>
        {c.organizer ? <div><dt>Organisateur</dt><dd>{c.organizer}</dd></div> : null}
        {c.scheduleText ? <div><dt>Horaire prévu</dt><dd>{c.scheduleText}</dd></div> : null}
      </dl>
      {c.description ? <p className="prose prose-clamp">{c.description}</p> : null}
      {c.registrationUrl ? <a className="btn btn-secondary btn-sm" href={c.registrationUrl} target="_blank" rel="noreferrer noopener"><Icon name="external" size={15} /><span>Page d’inscription</span></a> : null}
      <h4 className="side-head">Séances {upcoming.length ? `à venir (${upcoming.length})` : ''}</h4>
      <ul className="sessions">
        {(upcoming.length ? upcoming : c.sessions).slice(0, 40).map((s, i) => (
          <li key={i}><span>{capitalize(formatDate(s.date, 'weekdayDayMonth'))} {s.date.slice(0, 4)}</span><span>{s.start ?? '—'}{s.end ? `–${s.end}` : ''}</span>{s.estimated ? <small>estimée</small> : null}</li>
        ))}
      </ul>
      {c.sessions.some((s) => s.estimated) ? <p className="form-note">La source fournit une période et un horaire hebdomadaire, pas la liste des séances : ces dates sont calculées et n’excluent pas les vacances scolaires.</p> : null}
    </div>
  );
}
