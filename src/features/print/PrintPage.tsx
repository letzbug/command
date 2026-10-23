import { useEffect, useMemo, useState } from 'react';
import { fileSlug, getMeasure } from '../../app/actions';
import { useLookups } from '../../app/derived';
import { useAppState } from '../../app/store';
import { capitalize, daysInMonth, MONTHS_FR, ymd } from '../../domain/dates';
import { buildAnnualInput, buildChecklistInput, buildOpsInput, PrintData, validPublicUrl } from '../../print/builders';
import { AnnualOptions, layoutAnnual, layoutChecklist, layoutOperational } from '../../print/layouts';
import { Measure, Orientation, PaperFormat, PrintDoc, PrintPage as Page, PT_TO_MM } from '../../print/model';
import { isFramedHost, saveFile, saveMessage } from '../../services/fileSaver';
import { Icon } from '../../ui/icons';
import { Button, Field, Segmented, Select, Toggle } from '../../ui/kit';
import { ui } from '../../ui/uiStore';

type Template = 'annuel' | 'operationnel' | 'checklist';

export function SvgPage({ page, className }: { page: Page; className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${page.w} ${page.h}`} width="100%" role="img" aria-label="Aperçu de la page" preserveAspectRatio="xMidYMid meet">
      <rect x={0} y={0} width={page.w} height={page.h} fill="#fff" />
      {page.prims.map((p, i) => {
        switch (p.t) {
          case 'rect': return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.r ?? 0} fill={p.fill ?? 'none'} stroke={p.stroke} strokeWidth={p.stroke ? p.sw : undefined} opacity={p.opacity} />;
          case 'line': return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.stroke} strokeWidth={p.sw} strokeDasharray={p.dash?.join(' ')} />;
          case 'text': return <text key={i} x={p.x} y={p.y} fontSize={p.size * PT_TO_MM} fontWeight={p.bold ? 700 : 400} fill={p.color} textAnchor={p.align === 'center' ? 'middle' : p.align === 'right' ? 'end' : 'start'} fontFamily="Helvetica, Arial, sans-serif">{p.s}</text>;
          case 'circle': return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.fill} />;
          case 'poly': return <polygon key={i} points={p.points.map((q) => q.join(',')).join(' ')} fill={p.fill} />;
          case 'qr': {
            const n = p.modules.length, cell = p.size / (n + 4);
            return (
              <g key={i}>
                <rect x={p.x} y={p.y} width={p.size} height={p.size} fill="#fff" />
                {p.modules.flatMap((row, r) => row.map((on, c) => (on ? <rect key={`${r}-${c}`} x={p.x + (c + 2) * cell} y={p.y + (r + 2) * cell} width={cell + 0.02} height={cell + 0.02} fill={p.color} /> : null)))}
              </g>
            );
          }
        }
      })}
    </svg>
  );
}

export function PrintPage() {
  const events = useAppState((s) => s.events);
  const tasks = useAppState((s) => s.tasks);
  const team = useAppState((s) => s.team);
  const snap = useAppState((s) => s.courseSnapshot);
  const today = useAppState((s) => s.today);
  const publicUrl = useAppState((s) => s.settings.publicAppUrl);
  const { team: sortedTeam } = useLookups();
  const year0 = Number(today.slice(0, 4));
  const [tpl, setTpl] = useState<Template>('annuel');
  const [format, setFormat] = useState<PaperFormat>('A0');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [year, setYear] = useState(year0);
  const [include, setInclude] = useState<AnnualOptions>({ events: true, projects: true, courses: true, deadlines: true, milestones: true, holidays: true, legend: true });
  const [ownerId, setOwnerId] = useState('');
  const [scopeEvent, setScopeEvent] = useState('');
  const [fromM, setFromM] = useState(1);
  const [toM, setToM] = useState(12);
  const [includeDone, setIncludeDone] = useState(true);
  const [checkEvent, setCheckEvent] = useState(() => events.find((e) => !e.archived && e.endDate >= today)?.id ?? events[0]?.id ?? '');
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  useEffect(() => { void getMeasure().then(setMeasure); }, []);

  const data: PrintData = useMemo(() => ({ events, tasks, team, courses: snap?.courses ?? [], today, publicAppUrl: publicUrl }), [events, tasks, team, snap, today, publicUrl]);
  const scope = { ownerId: ownerId || null, eventId: scopeEvent || null };
  const fmt = tpl === 'checklist' ? 'A4' : format;
  const ori = tpl === 'checklist' ? 'portrait' : orientation;
  const { doc, error } = useMemo((): { doc: PrintDoc | null; error: string | null } => {
    if (!measure) return { doc: null, error: null };
    try {
      if (tpl === 'annuel') return { doc: layoutAnnual(buildAnnualInput(data, { year, format, orientation, include, scope, demoCourses: snap?.source === 'demo' }), measure), error: null };
      if (tpl === 'operationnel') {
        const from = ymd(year, Math.min(fromM, toM), 1), to = ymd(year, Math.max(fromM, toM), daysInMonth(year, Math.max(fromM, toM)));
        return { doc: layoutOperational(buildOpsInput(data, { format, orientation, rangeStart: from, rangeEnd: to, includeDone, scope }), measure), error: null };
      }
      if (!checkEvent) return { doc: null, error: 'Choisissez un événement.' };
      return { doc: layoutChecklist(buildChecklistInput(data, checkEvent), measure), error: null };
    } catch (e) {
      return { doc: null, error: e instanceof Error ? e.message : 'Mise en page impossible.' };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, tpl, data, year, format, orientation, include, ownerId, scopeEvent, fromM, toM, includeDone, checkEvent, snap]);
  const page = doc?.pages[Math.min(pageIdx, (doc?.pages.length ?? 1) - 1)];
  useEffect(() => setPageIdx(0), [tpl, format, orientation]);

  const download = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const { renderPdf } = await import('../../print/pdf');
      const bytes = await renderPdf(doc);
      const name = tpl === 'checklist' ? `checklist-${fileSlug(events.find((e) => e.id === checkEvent)?.title ?? '')}.pdf` : `${tpl === 'annuel' ? 'planning-annuel' : 'planning-operationnel'}-${year}-${fmt}-${ori === 'landscape' ? 'paysage' : 'portrait'}.pdf`;
      const m = saveMessage(await saveFile(name, bytes, 'application/pdf'), `PDF ${fmt}`);
      ui.toast(m.text, m.tone);
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : 'Génération du PDF impossible.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const printNow = () => {
    if (!doc) return;
    const style = document.createElement('style');
    style.id = 'print-page-size';
    style.textContent = `@page { size: ${doc.pages[0].w}mm ${doc.pages[0].h}mm; margin: 0; }`;
    document.head.appendChild(style);
    setPrinting(true);
    const done = () => { setPrinting(false); style.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  };

  const qrUrl = validPublicUrl(publicUrl);
  const toggle = (k: keyof AnnualOptions) => setInclude({ ...include, [k]: !include[k] });
  const monthOpts = MONTHS_FR.map((m, i) => ({ value: String(i + 1), label: capitalize(m) }));
  return (
    <div className="page print-page">
      <div className="print-config">
        <Field label="Modèle">
          <div className="tpl-cards" role="radiogroup" aria-label="Modèle">
            {([['annuel', 'Vue annuelle', 'Les douze mois en quatre trimestres, format affiche.'], ['operationnel', 'Planning opérationnel', 'Projets, phases, jalons et responsables en Gantt.'], ['checklist', 'Checklist A4', 'Liste à cocher pour l’équipe sur place.']] as const).map(([v, l, h]) => (
              <button key={v} type="button" role="radio" aria-checked={tpl === v} className={`tpl-card ${tpl === v ? 'is-on' : ''}`} onClick={() => setTpl(v)}><b>{l}</b><span>{h}</span></button>
            ))}
          </div>
        </Field>
        {tpl !== 'checklist' ? <>
          <div className="form-grid">
            <Field label="Format"><Segmented ariaLabel="Format" size="sm" value={format} onChange={setFormat} options={(['A0', 'A1', 'A3', 'A4'] as PaperFormat[]).map((f) => ({ value: f, label: f }))} /></Field>
            <Field label="Orientation"><Segmented ariaLabel="Orientation" size="sm" value={orientation} onChange={setOrientation} options={[{ value: 'landscape', label: 'Paysage' }, { value: 'portrait', label: 'Portrait' }]} /></Field>
            <Field label="Année"><Select value={String(year)} onChange={(v) => setYear(Number(v))} ariaLabel="Année" options={[year0 - 1, year0, year0 + 1, year0 + 2].map((y) => ({ value: String(y), label: String(y) }))} /></Field>
            <Field label="Responsable"><Select value={ownerId} onChange={setOwnerId} ariaLabel="Responsable" options={[{ value: '', label: 'Toute l’équipe' }, ...sortedTeam.map((m) => ({ value: m.id, label: m.code }))]} /></Field>
            <Field label="Projet" wide><Select value={scopeEvent} onChange={setScopeEvent} ariaLabel="Projet" options={[{ value: '', label: 'Tous les projets et événements' }, ...events.filter((e) => !e.archived).map((e) => ({ value: e.id, label: e.title }))]} /></Field>
          </div>
          {format !== 'A0' && format !== 'A1' && tpl === 'annuel' ? <p className="form-note">En {format}, le détail est réduit (titres courts, formations en nombre). Pour l’affichage mural, préférez A0 ou A1.</p> : null}
          {tpl === 'annuel' ? (
            <fieldset className="form-section"><legend>Contenu</legend>
              <div className="toggle-grid">
                <Toggle checked={include.events} onChange={() => toggle('events')} label="Événements" />
                <Toggle checked={include.projects} onChange={() => toggle('projects')} label="Projets" />
                <Toggle checked={include.courses} onChange={() => toggle('courses')} label="Formations" />
                <Toggle checked={include.deadlines} onChange={() => toggle('deadlines')} label="Échéances" />
                <Toggle checked={include.milestones} onChange={() => toggle('milestones')} label="Jalons" />
                <Toggle checked={include.holidays} onChange={() => toggle('holidays')} label="Jours fériés" />
                <Toggle checked={include.legend} onChange={() => toggle('legend')} label="Légende" />
              </div>
            </fieldset>
          ) : (
            <fieldset className="form-section"><legend>Période et contenu</legend>
              <div className="form-grid">
                <Field label="Du mois"><Select value={String(fromM)} onChange={(v) => setFromM(Number(v))} ariaLabel="Mois de début" options={monthOpts} /></Field>
                <Field label="Au mois"><Select value={String(toM)} onChange={(v) => setToM(Number(v))} ariaLabel="Mois de fin" options={monthOpts} /></Field>
              </div>
              <Toggle checked={includeDone} onChange={setIncludeDone} label="Inclure les tâches terminées" />
            </fieldset>
          )}
          <p className={`qr-status ${qrUrl ? '' : 'is-off'}`}><Icon name={qrUrl ? 'link' : 'info'} size={15} />
            {qrUrl ? <>QR code vers <b>{qrUrl}</b></> : <>Aucune URL publique configurée : le QR code est omis. <button type="button" className="link-btn" onClick={() => ui.go('parametres')}>Configurer</button></>}
          </p>
        </> : (
          <Field label="Événement">
            <Select value={checkEvent} onChange={setCheckEvent} ariaLabel="Événement" options={events.filter((e) => !e.archived).sort((a, b) => b.startDate.localeCompare(a.startDate)).map((e) => ({ value: e.id, label: `${e.title} (${e.startDate.slice(0, 4)})` }))} />
          </Field>
        )}
        <div className="print-actions">
          <Button variant="primary" icon="download" disabled={!doc || busy} onClick={() => void download()}>{busy ? 'Génération…' : `Télécharger le PDF ${fmt}`}</Button>
          {!isFramedHost() ? <Button icon="printer" disabled={!doc} onClick={printNow}>Imprimer</Button> : null}
        </div>
        <p className="form-note">PDF vectoriel ({fmt} {ori === 'landscape' ? 'paysage' : 'portrait'}) : textes et formes restent nets à toutes les tailles, sans capture d’écran agrandie.</p>
      </div>
      <div className="print-preview">
        <div className="pp-bar">
          <span>Aperçu {fmt} {ori === 'landscape' ? 'paysage' : 'portrait'}{doc && doc.pages.length > 1 ? `, page ${pageIdx + 1} / ${doc.pages.length}` : ''}</span>
          {doc && doc.pages.length > 1 ? <span className="pp-pages">
            <Button size="sm" variant="ghost" icon="left" disabled={pageIdx === 0} onClick={() => setPageIdx(pageIdx - 1)} aria-label="Page précédente" />
            <Button size="sm" variant="ghost" icon="right" disabled={pageIdx >= doc.pages.length - 1} onClick={() => setPageIdx(pageIdx + 1)} aria-label="Page suivante" />
          </span> : null}
        </div>
        <div className="pp-sheet">
          {error ? <p className="field-error">{error}</p> : page ? <SvgPage page={page} /> : <p className="muted pad">Préparation de l’aperçu…</p>}
        </div>
      </div>
      {printing && doc ? <div className="print-root">{doc.pages.map((p, i) => <SvgPage key={i} page={p} className="print-sheet" />)}</div> : null}
    </div>
  );
}
