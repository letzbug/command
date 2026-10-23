import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { activeFilterCount, CalendarData, useCalendarData, useCourseIndex, useKnownLocations, useLookups } from '../../app/derived';
import { newEvent, newTask, openEvent } from '../../app/actions';
import { useAppState } from '../../app/store';
import {
  addDays, addMonths, capitalize, daysInMonth, diffDays, eachDay, endOfMonth, formatDate, isoWeek, MONTHS_FR, parts,
  quarterOfMonth, startOfMonth, startOfWeek, weekdayMon0, WEEKDAY_LETTERS_FR, WEEKDAYS_SHORT_FR, ymd,
} from '../../domain/dates';
import { isOverdue } from '../../domain/planning';
import type { Occurrence } from '../../domain/recurrence';
import type { ISODate } from '../../domain/types';
import { groupByTheme, shortLabel } from '../../integrations/courses/unipopAdapter';
import { Icon } from '../../ui/icons';
import { Button, IconButton, Segmented, Select, useIsMobile, useMediaQuery } from '../../ui/kit';
import { menuAt } from '../../ui/overlays';
import { ALL_LAYERS, CalFilters, CalMode, DEFAULT_FILTERS, LayerKey, Route, ui, useUI } from '../../ui/uiStore';
import { Brief } from './Brief';
import { DayContent } from './DayContent';

const MODE_OPTIONS: { value: CalMode; label: string }[] = [
  { value: 'annee', label: 'Année' }, { value: 'trimestre', label: 'Trimestre' }, { value: 'mois', label: 'Mois' },
  { value: 'semaine', label: 'Semaine' }, { value: 'jour', label: 'Jour' },
];

export const LAYER_LABEL: Record<LayerKey, string> = {
  evenement: 'Événements', projet: 'Projets', formation: 'Formations', echeance: 'Échéances', jalon: 'Jalons', ferie: 'Jours fériés',
};

function rangeFor(mode: CalMode, focus: ISODate): { from: ISODate; to: ISODate } {
  const [y, m] = parts(focus);
  switch (mode) {
    case 'annee': return { from: ymd(y, 1, 1), to: ymd(y, 12, 31) };
    case 'trimestre': {
      const qm = (quarterOfMonth(m) - 1) * 3 + 1;
      return { from: startOfWeek(ymd(y, qm, 1)), to: addDays(startOfWeek(endOfMonth(ymd(y, qm + 2, 1))), 6) };
    }
    case 'mois': return { from: startOfWeek(startOfMonth(focus)), to: addDays(startOfWeek(endOfMonth(focus)), 6) };
    case 'semaine': return { from: startOfWeek(focus), to: addDays(startOfWeek(focus), 6) };
    case 'jour': return { from: focus, to: focus };
  }
}

function shift(mode: CalMode, focus: ISODate, dir: 1 | -1): ISODate {
  switch (mode) {
    case 'annee': return addMonths(focus, 12 * dir);
    case 'trimestre': return addMonths(focus, 3 * dir);
    case 'mois': return addMonths(focus, dir);
    case 'semaine': return addDays(focus, 7 * dir);
    case 'jour': return addDays(focus, dir);
  }
}

function periodLabel(mode: CalMode, focus: ISODate): string {
  const [y, m] = parts(focus);
  switch (mode) {
    case 'annee': return String(y);
    case 'trimestre': { const q = quarterOfMonth(m); return `T${q} ${y}, ${MONTHS_FR[(q - 1) * 3]} – ${MONTHS_FR[(q - 1) * 3 + 2]}`; }
    case 'mois': return `${capitalize(MONTHS_FR[m - 1])} ${y}`;
    case 'semaine': { const s = startOfWeek(focus); return `Semaine ${isoWeek(focus)}, ${formatDate(s, 'dayMonth')} – ${formatDate(addDays(s, 6), 'medium')}`; }
    case 'jour': return capitalize(formatDate(focus, 'long'));
  }
}

export function setFocus(d: ISODate) { ui.set({ focusDate: d }); }

export function CalendarWorkspace({ route, defaultMode, showBrief }: { route: Route; defaultMode: CalMode; showBrief?: boolean }) {
  const today = useAppState((s) => s.today);
  const focus = useUI((s) => s.focusDate) ?? today;
  const mode = useUI((s) => s.modes[route]) ?? defaultMode;
  const filters = useUI((s) => s.filters);
  const panels = useUI((s) => s.panels);
  const isMobile = useIsMobile();
  const agenda = isMobile && (mode === 'annee' || mode === 'trimestre');
  const [agendaDays, setAgendaDays] = useState(45);
  const range = agenda ? { from: focus, to: addDays(focus, agendaDays) } : rangeFor(mode, focus);
  const data = useCalendarData(range.from, range.to, filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const selectedDay = panels.length && panels[panels.length - 1].kind === 'day' ? (panels[panels.length - 1] as { date: ISODate }).date : null;

  const setMode = (m: CalMode) => ui.set({ modes: { ...ui.state.modes, [route]: m } });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, [contenteditable="true"]') || ui.state.dialog || ui.state.palette) return;
      if (e.key === '.') setFocus(todayRef.current);
      else if (e.key === 'ArrowLeft' && !ui.state.panels.length) setFocus(shift(modeRef.current, focusRef.current, -1));
      else if (e.key === 'ArrowRight' && !ui.state.panels.length) setFocus(shift(modeRef.current, focusRef.current, 1));
      else if (/^[1-5]$/.test(e.key)) setMode(MODE_OPTIONS[Number(e.key) - 1].value);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const todayRef = useRef(today); todayRef.current = today;
  const modeRef = useRef(mode); modeRef.current = mode;
  const focusRef = useRef(focus); focusRef.current = focus;

  const openDay = (date: ISODate, theme?: string | null) => void ui.openPanel({ kind: 'day', date, theme: theme ?? null });
  const onTheme = (el: HTMLElement, date: ISODate, theme: string) => {
    const r = el.getBoundingClientRect();
    ui.openPopover({ x: r.left, y: r.bottom + 6, date, theme });
  };
  const nFilters = activeFilterCount(filters);

  return (
    <div className="cal">
      {showBrief ? <Brief /> : null}
      <div className="cal-toolbar">
        <div className="cal-nav">
          <IconButton icon="left" label="Période précédente" onClick={() => setFocus(shift(mode, focus, -1))} />
          <IconButton icon="right" label="Période suivante" onClick={() => setFocus(shift(mode, focus, 1))} />
          <h2 className="cal-period" aria-live="polite">{agenda ? `À partir du ${formatDate(focus, 'medium')}` : periodLabel(mode, focus)}</h2>
          <Button variant="ghost" size="sm" icon="today" onClick={() => setFocus(today)}>Aujourd’hui</Button>
        </div>
        <div className="cal-tools">
          <Segmented ariaLabel="Vue du calendrier" value={mode} onChange={setMode} options={isMobile ? MODE_OPTIONS.filter((o) => o.value !== 'trimestre').map((o) => (o.value === 'annee' ? { ...o, label: 'Agenda' } : o)) : MODE_OPTIONS} size="sm" />
          <div className="filter-anchor">
            <Button variant={nFilters ? 'primary' : 'secondary'} size="sm" icon="filter" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
              {nFilters ? `Filtres (${nFilters})` : 'Filtres'}
            </Button>
            {filtersOpen ? <FilterSheet onClose={() => setFiltersOpen(false)} /> : null}
          </div>
          <Button variant="secondary" size="sm" icon="plus" onClick={(e) => menuAt(e, [
            { label: 'Nouvel événement', icon: 'layers', run: () => newEvent({ startDate: focus, endDate: focus }) },
            { label: 'Nouvelle tâche', icon: 'tasks', run: () => newTask({ dueDate: focus, startDate: focus }) },
          ])}>Nouveau</Button>
        </div>
      </div>
      <FilterChips />
      {agenda ? <AgendaView data={data} from={range.from} to={range.to} today={today} onMore={() => setAgendaDays((d) => d + 45)} />
        : mode === 'annee' ? <YearPlanner year={parts(focus)[0]} data={data} today={today} selected={selectedDay} onDay={openDay}
            onQuarter={(q) => { setFocus(ymd(parts(focus)[0], (q - 1) * 3 + 1, 1)); setMode('trimestre'); }} />
        : mode === 'trimestre' ? <QuarterView focus={focus} data={data} today={today} selected={selectedDay} onDay={openDay} onTheme={onTheme}
            onMonth={(d) => { setFocus(d); setMode('mois'); }} />
        : mode === 'mois' ? <div className="mgrid-wrap"><MonthGrid year={parts(focus)[0]} month={parts(focus)[1]} data={data} today={today} selected={selectedDay} onDay={openDay} onTheme={onTheme} density="full" /></div>
        : mode === 'semaine' ? <WeekView focus={focus} data={data} today={today} onDay={openDay} onTheme={onTheme} />
        : <div className="dayview"><DayContent date={focus} data={data} expanded /></div>}
      <Legend />
    </div>
  );
}

/* ---------------- Filters ---------------- */

function FilterSheet({ onClose }: { onClose: () => void }) {
  const f = useUI((s) => s.filters);
  const idx = useCourseIndex();
  const { team, eventById } = useLookups();
  const locations = useKnownLocations();
  const events = useAppState((s) => s.events);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.parentElement!.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const set = (p: Partial<CalFilters>) => ui.set({ filters: { ...ui.state.filters, ...p } });
  const toggle = (k: LayerKey) => set({ layers: f.layers.includes(k) ? f.layers.filter((x) => x !== k) : [...f.layers, k] });
  void eventById;
  return (
    <div ref={ref} className="filter-sheet" role="dialog" aria-label="Filtres du calendrier">
      <div className="fs-group">
        <span className="fs-label">Afficher</span>
        <div className="layer-chips">
          {ALL_LAYERS.map((k) => (
            <button key={k} type="button" className={`layer-chip lc-${k} ${f.layers.includes(k) ? 'is-on' : ''}`} aria-pressed={f.layers.includes(k)} onClick={() => toggle(k)}>
              <span className="lc-swatch" />{LAYER_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <div className="fs-grid">
        <label><span className="fs-label">Lieu</span>
          <Select value={f.location} onChange={(v) => set({ location: v })} ariaLabel="Lieu" options={[{ value: '', label: 'Tous les lieux' }, ...locations.map((l) => ({ value: l, label: l }))]} /></label>
        <label><span className="fs-label">Thème de formation</span>
          <Select value={f.theme} onChange={(v) => set({ theme: v })} ariaLabel="Thème" options={[{ value: '', label: 'Tous les thèmes' }, ...idx.themes.map((t) => ({ value: t, label: t }))]} /></label>
        <label><span className="fs-label">Projet ou événement</span>
          <Select value={f.eventId} onChange={(v) => set({ eventId: v })} ariaLabel="Projet" options={[{ value: '', label: 'Tous' }, ...events.filter((e) => !e.archived).sort((a, b) => a.title.localeCompare(b.title, 'fr')).map((e) => ({ value: e.id, label: e.title }))]} /></label>
        <label><span className="fs-label">Responsable</span>
          <Select value={f.ownerId} onChange={(v) => set({ ownerId: v })} ariaLabel="Responsable" options={[{ value: '', label: 'Toute l’équipe' }, ...team.map((m) => ({ value: m.id, label: `${m.code} — ${m.label}` }))]} /></label>
        <label><span className="fs-label">Statut</span>
          <Select value={f.status} onChange={(v) => set({ status: v })} ariaLabel="Statut" options={[{ value: '', label: 'Tous les statuts' }, { value: 'ouvert', label: 'Ouverts' }, { value: 'en_retard', label: 'En retard' }, { value: 'termine', label: 'Terminés' }]} /></label>
      </div>
      <div className="fs-actions">
        <Button variant="ghost" size="sm" onClick={() => ui.set({ filters: DEFAULT_FILTERS })}>Réinitialiser</Button>
        <Button variant="primary" size="sm" onClick={onClose}>Fermer</Button>
      </div>
    </div>
  );
}

function FilterChips() {
  const f = useUI((s) => s.filters);
  const { memberById, eventById } = useLookups();
  const chips: { label: string; clear: Partial<CalFilters> }[] = [];
  if (f.layers.length < ALL_LAYERS.length) chips.push({ label: `Masqués : ${ALL_LAYERS.filter((k) => !f.layers.includes(k)).map((k) => LAYER_LABEL[k].toLowerCase()).join(', ')}`, clear: { layers: [...ALL_LAYERS] } });
  if (f.location) chips.push({ label: `Lieu : ${f.location}`, clear: { location: '' } });
  if (f.theme) chips.push({ label: `Thème : ${f.theme}`, clear: { theme: '' } });
  if (f.eventId) chips.push({ label: `Projet : ${eventById.get(f.eventId)?.title ?? '?'}`, clear: { eventId: '' } });
  if (f.ownerId) chips.push({ label: `Responsable : ${memberById.get(f.ownerId)?.code ?? '?'}`, clear: { ownerId: '' } });
  if (f.status) chips.push({ label: `Statut : ${{ ouvert: 'ouverts', en_retard: 'en retard', termine: 'terminés' }[f.status]}`, clear: { status: '' } });
  if (!chips.length) return null;
  return (
    <div className="fchips">
      {chips.map((c) => (
        <button key={c.label} type="button" className="fchip" onClick={() => ui.set({ filters: { ...ui.state.filters, ...c.clear } })} aria-label={`Retirer le filtre ${c.label}`}>
          {c.label}<Icon name="x" size={13} />
        </button>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div className="legend" aria-label="Légende">
      <span><i className="lg lg-event" />Événement</span>
      <span><i className="lg lg-project" />Projet</span>
      <span><i className="lg lg-milestone" />Jalon</span>
      <span><i className="lg lg-deadline" />Échéance</span>
      <span><i className="lg lg-overdue" />En retard</span>
      <span><i className="lg lg-course" />Densité des formations</span>
      <span><i className="lg lg-holiday" />Jour férié</span>
      <span><i className="lg lg-school" />Vacances scolaires</span>
    </div>
  );
}

/* ---------------- Year planner (signature view) ---------------- */

interface Bar { occ: Occurrence; ds: number; de: number; lane: number }

function packMonth(occurrences: Occurrence[], y: number, m: number, lanes: number) {
  const mStart = ymd(y, m, 1), mEnd = ymd(y, m, daysInMonth(y, m));
  const items = occurrences
    .filter((o) => o.startDate <= mEnd && o.endDate >= mStart)
    .map((o) => ({ occ: o, s: o.startDate < mStart ? mStart : o.startDate, e: o.endDate > mEnd ? mEnd : o.endDate }))
    .sort((a, b) => a.s.localeCompare(b.s) || b.e.localeCompare(a.e));
  const ends: string[] = [];
  const bars: Bar[] = [];
  const overflow = new Map<number, number>();
  for (const it of items) {
    let lane = ends.findIndex((e) => e < it.s);
    if (lane === -1) lane = ends.length;
    const ds = parts(it.s)[2], de = parts(it.e)[2];
    if (lane >= lanes) { for (let d = ds; d <= de; d++) overflow.set(d, (overflow.get(d) ?? 0) + 1); continue; }
    ends[lane] = it.e;
    bars.push({ occ: it.occ, ds, de, lane });
  }
  return { bars, overflow, count: items.length };
}

function YearPlanner({ year, data, today, selected, onDay, onQuarter }: {
  year: number; data: CalendarData; today: ISODate; selected: ISODate | null; onDay: (d: ISODate) => void; onQuarter: (q: number) => void;
}) {
  const wide = useMediaQuery('(min-width: 1500px)');
  const lanes = wide ? 3 : 2;
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const [hover, setHover] = useState<{ date: ISODate; x: number; y: number } | null>(null);
  const onOver = (e: React.MouseEvent) => {
    if (!canHover) return;
    const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-date]');
    if (!cell) { setHover(null); return; }
    const r = cell.getBoundingClientRect();
    const d = cell.dataset.date!;
    if (hover?.date !== d) setHover({ date: d, x: r.left + r.width / 2, y: r.bottom + 6 });
  };
  return (
    <div className="planner" onMouseMove={onOver} onMouseLeave={() => setHover(null)} style={{ ['--lanes' as string]: lanes }}>
      {[1, 2, 3, 4].map((q) => (
        <section key={q} className="pq" aria-label={`Trimestre ${q}`}>
          <button type="button" className="pq-label" onClick={() => onQuarter(q)} title={`Afficher le trimestre ${q}`}>
            <span className="pq-num">T{q}</span>
          </button>
          <div className="pq-rows">
            {[0, 1, 2].map((i) => (
              <MonthRow key={i} year={year} month={(q - 1) * 3 + i + 1} data={data} today={today} selected={selected} onDay={onDay} lanes={lanes} />
            ))}
          </div>
        </section>
      ))}
      {hover ? <HoverPreview date={hover.date} x={hover.x} y={hover.y} data={data} /> : null}
    </div>
  );
}

function MonthRow({ year, month, data, today, selected, onDay, lanes }: {
  year: number; month: number; data: CalendarData; today: ISODate; selected: ISODate | null; onDay: (d: ISODate) => void; lanes: number;
}) {
  const dim = daysInMonth(year, month);
  const packed = useMemo(() => packMonth(data.occurrences, year, month, lanes), [data.occurrences, year, month, lanes]);
  const { bars, count } = packed;
  const overflowOf = (d: number) => packed.overflow.get(d) ?? 0;
  const { eventCount, dueCount } = useMemo(() => {
    let due = 0;
    for (let d = 1; d <= dim; d++) due += (data.dueByDate.get(ymd(year, month, d)) ?? []).filter((t) => t.status !== 'termine').length;
    return { eventCount: count, dueCount: due };
  }, [count, data.dueByDate, dim, year, month]);
  return (
    <div className="prow">
      <div className="prow-label">
        <span className="prow-name">{capitalize(MONTHS_FR[month - 1])}</span>
        <span className="prow-meta">{eventCount ? `${eventCount} év.` : ''}{eventCount && dueCount ? ' ' : ''}{dueCount ? `${dueCount} éch.` : ''}</span>
      </div>
      <div className="prow-grid">
        {Array.from({ length: 31 }, (_, i) => {
          const d = i + 1;
          if (d > dim) return <div key={d} className="pcell is-void" style={{ gridColumn: d }} aria-hidden="true" />;
          const iso = ymd(year, month, d);
          const wd = weekdayMon0(iso);
          const occ = data.occByDate.get(iso) ?? [];
          const due = data.dueByDate.get(iso) ?? [];
          const ms = due.filter((t) => t.milestone);
          const dl = due.filter((t) => !t.milestone && t.status !== 'termine');
          const late = dl.some((t) => isOverdue(t, today));
          const courses = data.coursesByDate.get(iso)?.length ?? 0;
          const hol = data.holidays.get(iso);
          const school = data.schoolBreaks.get(iso);
          const label = [
            formatDate(iso, 'long'), hol ? `jour férié : ${hol}` : '', school ? `vacances scolaires : ${school}` : '', occ.length ? `${occ.length} événement(s)` : '',
            dl.length ? `${dl.length} échéance(s)` : '', ms.length ? `${ms.length} jalon(s)` : '', courses ? `${courses} séance(s) de formation` : '',
          ].filter(Boolean).join(', ');
          return (
            <button key={d} type="button" data-date={iso} style={{ gridColumn: d }} aria-label={label} onClick={() => onDay(iso)}
              className={`pcell ${wd >= 5 ? 'is-weekend' : ''} ${school ? 'is-school-break' : ''} ${hol ? 'is-holiday' : ''} ${iso === today ? 'is-today' : ''} ${iso === selected ? 'is-selected' : ''}`}>
              <span className="pcell-top"><span className="pcell-num">{d}</span><span className="pcell-wd">{WEEKDAY_LETTERS_FR[wd]}</span></span>
              <span className="pcell-mk">
                {ms.length ? <i className="mk mk-ms" /> : null}
                {dl.length ? <i className={`mk ${late ? 'mk-late' : 'mk-dl'}`} /> : null}
                {overflowOf(d) ? <b className="mk-more">+{overflowOf(d)}</b> : null}
              </span>
              <span className="pcell-heat" style={{ opacity: courses ? 0.18 + 0.82 * Math.min(1, courses / data.courseMax) : 0 }} />
            </button>
          );
        })}
        {bars.map((b) => {
          const span = b.de - b.ds + 1;
          const cont = b.occ.startDate < ymd(year, month, 1);
          return (
            <button key={`${b.occ.event.id}-${b.occ.key}`} type="button"
              className={`pbar pbar-${b.occ.event.kind} ${b.occ.event.status === 'annule' ? 'is-cancelled' : ''} ${cont ? 'is-cont' : ''}`}
              style={{ gridColumn: `${b.ds} / span ${span}`, gridRow: b.lane + 2 }}
              title={`${b.occ.title} (${formatDate(b.occ.startDate, 'dayMonth')}${b.occ.endDate !== b.occ.startDate ? ` – ${formatDate(b.occ.endDate, 'dayMonth')}` : ''})`}
              onClick={(e) => { e.stopPropagation(); openEvent(b.occ.event.id, b.occ.key); }}
              onContextMenu={(e) => menuAt(e, [{ label: 'Ouvrir', icon: 'layers', run: () => openEvent(b.occ.event.id, b.occ.key) }])}>
              {span >= 3 ? <span>{b.occ.title}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HoverPreview({ date, x, y, data }: { date: ISODate; x: number; y: number; data: CalendarData }) {
  const occ = data.occByDate.get(date) ?? [];
  const due = data.dueByDate.get(date) ?? [];
  const courses = data.coursesByDate.get(date) ?? [];
  const themes = groupByTheme(courses);
  const hol = data.holidays.get(date);
  const school = data.schoolBreaks.get(date);
  const left = Math.min(Math.max(8, x - 140), (typeof window !== 'undefined' ? window.innerWidth : 1200) - 300);
  const flip = typeof window !== 'undefined' && y > window.innerHeight - 180;
  return (
    <div className="hover-card" style={{ left, top: flip ? undefined : y, bottom: flip ? window.innerHeight - y + 60 : undefined }} role="tooltip">
      <strong>{capitalize(formatDate(date, 'long'))}</strong>
      {hol ? <span className="hc-hol">{hol}</span> : null}
      {school ? <span className="hc-school">{school}</span> : null}
      {occ.slice(0, 3).map((o) => <span key={o.event.id + o.key} className="hc-row"><i className={`dot dot-${o.event.kind}`} />{o.title}</span>)}
      {occ.length > 3 ? <span className="hc-muted">+{occ.length - 3} autres événements</span> : null}
      {due.slice(0, 3).map((t) => <span key={t.id} className="hc-row"><i className={`dot ${t.milestone ? 'dot-ms' : 'dot-dl'}`} />{t.title}</span>)}
      {courses.length ? <span className="hc-muted">{courses.length} séance{courses.length > 1 ? 's' : ''} de formation, {themes.length} thème{themes.length > 1 ? 's' : ''}</span> : null}
      {!occ.length && !due.length && !courses.length && !hol ? <span className="hc-muted">Aucune activité</span> : null}
    </div>
  );
}

/* ---------------- Quarter & month grids ---------------- */

function QuarterView({ focus, data, today, selected, onDay, onTheme, onMonth }: {
  focus: ISODate; data: CalendarData; today: ISODate; selected: ISODate | null; onDay: (d: ISODate) => void;
  onTheme: (el: HTMLElement, d: ISODate, t: string) => void; onMonth: (d: ISODate) => void;
}) {
  const [y, m] = parts(focus);
  const q0 = (quarterOfMonth(m) - 1) * 3 + 1;
  return (
    <div className="quarter">
      {[0, 1, 2].map((i) => (
        <div key={i} className="quarter-month">
          <button type="button" className="qm-title" onClick={() => onMonth(ymd(y, q0 + i, 1))}>{capitalize(MONTHS_FR[q0 + i - 1])}</button>
          <MonthGrid year={y} month={q0 + i} data={data} today={today} selected={selected} onDay={onDay} onTheme={onTheme} density="compact" />
        </div>
      ))}
    </div>
  );
}

export function MonthGrid({ year, month, data, today, selected, onDay, onTheme, density }: {
  year: number; month: number; data: CalendarData; today: ISODate; selected: ISODate | null; onDay: (d: ISODate) => void;
  onTheme: (el: HTMLElement, d: ISODate, t: string) => void; density: 'compact' | 'full';
}) {
  const first = ymd(year, month, 1);
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(endOfMonth(first)), 6);
  const days = [...eachDay(start, end)];
  const maxEv = density === 'full' ? 4 : 2;
  const maxTh = density === 'full' ? 3 : 2;
  return (
    <div className={`mgrid mgrid-${density}`} role="grid" aria-label={`${capitalize(MONTHS_FR[month - 1])} ${year}`}>
      {WEEKDAYS_SHORT_FR.map((w) => <div key={w} className="mgrid-wd" role="columnheader">{density === 'full' ? w : w.slice(0, 1).toUpperCase()}</div>)}
      {days.map((d) => {
        const inMonth = parts(d)[1] === month;
        if (!inMonth) return <div key={d} className="mcell is-out" aria-hidden="true"><span className="mcell-num">{parts(d)[2]}</span></div>;
        // Long-running items appear at their start, on Mondays and on the 1st only, to keep cells readable.
        const occ = (data.occByDate.get(d) ?? []).filter((o) => diffDays(o.endDate, o.startDate) < 7 || d === o.startDate || weekdayMon0(d) === 0 || parts(d)[2] === 1);
        const due = data.dueByDate.get(d) ?? [];
        const themes = groupByTheme(data.coursesByDate.get(d) ?? []);
        const hol = data.holidays.get(d);
        const school = data.schoolBreaks.get(d);
        const hidden = Math.max(0, occ.length - maxEv) + Math.max(0, due.length - (density === 'full' ? 3 : 1)) + Math.max(0, themes.length - maxTh);
        return (
          <div key={d} role="gridcell" className={`mcell ${weekdayMon0(d) >= 5 ? 'is-weekend' : ''} ${school ? 'is-school-break' : ''} ${hol ? 'is-holiday' : ''} ${d === today ? 'is-today' : ''} ${d === selected ? 'is-selected' : ''}`}>
            <button type="button" className="mcell-head" onClick={() => onDay(d)} aria-label={`Ouvrir le ${formatDate(d, 'long')}`}>
              <span className="mcell-num">{parts(d)[2]}</span>{hol && density === 'full' ? <span className="mcell-hol">{hol}</span> : school && density === 'full' ? <span className="mcell-school" title={school}>Vacances</span> : null}
            </button>
            <div className="mcell-items">
              {occ.slice(0, maxEv).map((o) => (
                <button key={o.event.id + o.key} type="button" className={`pill pill-${o.event.kind}`} onClick={() => openEvent(o.event.id, o.key)} title={o.title}>
                  {o.startTime && o.startDate === d && density === 'full' ? <b>{o.startTime}</b> : null}{o.title}
                </button>
              ))}
              {due.slice(0, density === 'full' ? 3 : 1).map((t) => (
                <button key={t.id} type="button" className={`due ${t.milestone ? 'due-ms' : ''} ${isOverdue(t, today) ? 'is-late' : ''} ${t.status === 'termine' ? 'is-done' : ''}`}
                  onClick={() => void ui.openPanel({ kind: 'task', id: t.id })} title={t.title}>
                  <i />{t.title}
                </button>
              ))}
              {themes.slice(0, maxTh).map((g) => (
                <button key={g.theme} type="button" className="theme-chip" onClick={(e) => onTheme(e.currentTarget, d, g.theme)} title={`${g.theme} : ${g.items.length} séance(s)`}>
                  <span>{shortLabel(g.theme, density === 'full' ? 24 : 14)}</span><b>{g.items.length}</b>
                </button>
              ))}
              {hidden ? <button type="button" className="mcell-more" onClick={() => onDay(d)}>+{hidden} autre{hidden > 1 ? 's' : ''}</button> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekView({ focus, data, today, onDay, onTheme }: {
  focus: ISODate; data: CalendarData; today: ISODate; onDay: (d: ISODate) => void; onTheme: (el: HTMLElement, d: ISODate, t: string) => void;
}) {
  const start = startOfWeek(focus);
  return (
    <div className="week">
      {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => {
        const occ = data.occByDate.get(d) ?? [];
        const due = data.dueByDate.get(d) ?? [];
        const themes = groupByTheme(data.coursesByDate.get(d) ?? []);
        const hol = data.holidays.get(d);
        const school = data.schoolBreaks.get(d);
        return (
          <div key={d} className={`wcol ${d === today ? 'is-today' : ''} ${weekdayMon0(d) >= 5 ? 'is-weekend' : ''} ${school ? 'is-school-break' : ''}`}>
            <button type="button" className="wcol-head" onClick={() => onDay(d)}>
              <span>{WEEKDAYS_SHORT_FR[weekdayMon0(d)]}</span><b>{parts(d)[2]}</b>
            </button>
            {hol ? <div className="wcol-hol">{hol}</div> : null}
            {school ? <div className="wcol-school">{school}</div> : null}
            {occ.map((o) => (
              <button key={o.event.id + o.key} type="button" className={`wcard wcard-${o.event.kind}`} onClick={() => openEvent(o.event.id, o.key)}>
                <span className="wcard-time">{o.startTime && o.startDate === d ? `${o.startTime}${o.endTime ? `–${o.endTime}` : ''}` : o.startDate !== o.endDate ? 'Plusieurs jours' : 'Journée'}</span>
                <span className="wcard-title">{o.title}</span>
              </button>
            ))}
            {due.map((t) => (
              <button key={t.id} type="button" className={`due ${t.milestone ? 'due-ms' : ''} ${isOverdue(t, today) ? 'is-late' : ''} ${t.status === 'termine' ? 'is-done' : ''}`} onClick={() => void ui.openPanel({ kind: 'task', id: t.id })}>
                <i />{t.title}
              </button>
            ))}
            {themes.map((g) => (
              <button key={g.theme} type="button" className="theme-chip" onClick={(e) => onTheme(e.currentTarget, d, g.theme)}>
                <span>{shortLabel(g.theme, 22)}</span><b>{g.items.length}</b>
              </button>
            ))}
            {!occ.length && !due.length && !themes.length ? <span className="wcol-empty">Libre</span> : null}
          </div>
        );
      })}
    </div>
  );
}

function AgendaView({ data, from, to, today, onMore }: { data: CalendarData; from: ISODate; to: ISODate; today: ISODate; onMore: () => void }) {
  const days = [...eachDay(from, to)].filter((d) => data.occByDate.has(d) || data.dueByDate.has(d) || data.coursesByDate.has(d) || data.holidays.has(d) || data.schoolBreaks.has(d));
  return (
    <div className="agenda">
      {days.length ? days.map((d) => (
        <Fragment key={d}>
          <h3 className={`agenda-day ${d === today ? 'is-today' : ''}`}>
            <span>{capitalize(formatDate(d, 'long'))}</span>{d === today ? <span className="badge badge-blue">Aujourd’hui</span> : null}
          </h3>
          <div className="agenda-body"><DayContent date={d} data={data} compact /></div>
        </Fragment>
      )) : <p className="muted pad">Aucune activité sur cette période.</p>}
      <Button variant="secondary" onClick={onMore} className="agenda-more">Afficher les 45 jours suivants</Button>
    </div>
  );
}

