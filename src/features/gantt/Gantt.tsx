import { useMemo, useRef, useState } from 'react';
import { openEvent, openTask, run, setDone } from '../../app/actions';
import { useLookups } from '../../app/derived';
import { useAppState, useStore } from '../../app/store';
import { addDays, addMonths, capitalize, daysInMonth, diffDays, formatDate, MONTHS_FR, parts, startOfMonth, weekdayMon0 } from '../../domain/dates';
import { computeProgress, dependencyConflicts, isDone, isOverdue, taskEnd, taskStart } from '../../domain/planning';
import { TASK_STATUSES, TASK_STATUS_LABEL } from '../../domain/reference';
import type { EventKind, ISODate, Task } from '../../domain/types';
import { Icon } from '../../ui/icons';
import { Button, IconButton, MemberTag, Segmented, Select } from '../../ui/kit';
import { ui } from '../../ui/uiStore';

export interface GanttGroup { id: string; title: string; start: ISODate; end: ISODate; kind: EventKind; tasks: Task[] }

type Zoom = 'jour' | 'semaine' | 'mois';
const DAY_W: Record<Zoom, number> = { jour: 30, semaine: 12, mois: 4 };
const MONTHS: Record<Zoom, number> = { jour: 2, semaine: 5, mois: 12 };
const ROW_H = 34;
const HEAD_H = 48;

type Row = { type: 'group'; g: GanttGroup } | { type: 'task'; t: Task; g?: GanttGroup };
interface Drag { id: string; mode: 'move' | 'start' | 'end'; x0: number; delta: number; moved: boolean }

export function Gantt({ groups, loose = [], initialStart, compact }: { groups: GanttGroup[]; loose?: Task[]; initialStart?: ISODate; compact?: boolean }) {
  const store = useStore();
  const today = useAppState((s) => s.today);
  const { memberById, team, taskById } = useLookups();
  const [zoom, setZoom] = useState<Zoom>('semaine');
  const [viewStart, setViewStart] = useState<ISODate>(startOfMonth(initialStart ?? addMonths(today, -1)));
  const [person, setPerson] = useState('');
  const [status, setStatus] = useState('');
  const [drag, setDrag] = useState<Drag | null>(null);
  const suppress = useRef(false);
  const canWrite = store.can('task.write');

  const dayW = DAY_W[zoom];
  const viewEnd = addDays(addMonths(viewStart, MONTHS[zoom]), -1);
  const nDays = diffDays(viewEnd, viewStart) + 1;
  const width = nDays * dayW;
  const x = (d: ISODate) => diffDays(d, viewStart) * dayW;

  const keep = (t: Task) => (!person || t.assigneeId === person) && (!status || (status === 'en_retard' ? isOverdue(t, today) : t.status === status));
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const g of groups) {
      const ts = g.tasks.filter(keep).sort((a, b) => (taskStart(a) ?? '9').localeCompare(taskStart(b) ?? '9'));
      if (!ts.length && (person || status)) continue;
      out.push({ type: 'group', g });
      for (const t of ts) out.push({ type: 'task', t, g });
    }
    const ls = loose.filter(keep);
    if (ls.length) {
      out.push({ type: 'group', g: { id: '__loose', title: 'Tâches hors projet', start: viewStart, end: viewStart, kind: 'evenement', tasks: ls } });
      for (const t of ls) out.push({ type: 'task', t });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, loose, person, status, today, viewStart]);

  const rowIndex = new Map<string, number>();
  rows.forEach((r, i) => { if (r.type === 'task') rowIndex.set(r.t.id, i); });

  const datesFor = (t: Task, mode: Drag['mode'], delta: number) => {
    const s = taskStart(t)!, e = taskEnd(t)!;
    if (t.milestone || mode === 'move') return { start: addDays(s, delta), due: addDays(e, delta) };
    if (mode === 'start') { const ns = addDays(s, delta); return { start: ns > e ? e : ns, due: e }; }
    const ne = addDays(e, delta);
    return { start: s, due: ne < s ? s : ne };
  };

  async function commit(t: Task, start: ISODate, due: ISODate) {
    if (start === t.startDate && due === t.dueDate) return;
    const saved = await run(() => store.saveTask({ ...t, startDate: start, dueDate: due }, { datesEditedByHand: true }));
    if (!saved) return;
    const conflicts = dependencyConflicts(saved, new Map([...taskById, [saved.id, saved]]));
    if (conflicts.length) ui.toast(`Attention : « ${saved.title} » commence avant la fin de « ${conflicts[0].title} ».`, 'warning');
    else ui.toast(`${saved.title} : ${formatDate(start, 'dayMonth')} – ${formatDate(due, 'dayMonth')}`, 'success');
  }

  const onDown = (e: React.PointerEvent, t: Task, mode: Drag['mode']) => {
    if (!canWrite || e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: t.id, mode, x0: e.clientX, delta: 0, moved: false });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    const delta = Math.round(dx / dayW);
    if (delta !== drag.delta || (!drag.moved && Math.abs(dx) > 3)) setDrag({ ...drag, delta, moved: drag.moved || Math.abs(dx) > 3 });
  };
  const onUp = (t: Task) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    suppress.current = d.moved;
    if (d.moved && d.delta) { const nd = datesFor(t, d.mode, d.delta); void commit(t, nd.start, nd.due); }
  };
  const onKey = (e: React.KeyboardEvent, t: Task) => {
    if (!canWrite || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const step = e.key === 'ArrowLeft' ? -1 : 1;
    const nd = datesFor(t, e.shiftKey ? 'end' : 'move', step);
    void commit(t, nd.start, nd.due);
  };

  const months: { label: string; left: number; w: number }[] = [];
  for (let m = viewStart; m <= viewEnd; m = addMonths(m, 1)) {
    const [y, mo] = parts(m);
    months.push({ label: `${capitalize(MONTHS_FR[mo - 1])} ${y}`, left: x(m), w: daysInMonth(y, mo) * dayW });
  }
  const weekends: number[] = [];
  const ticks: { left: number; label: string }[] = [];
  for (let i = 0; i < nDays; i++) {
    const d = addDays(viewStart, i);
    const wd = weekdayMon0(d);
    if (wd === 5 && dayW >= 8) weekends.push(i * dayW);
    if (zoom === 'jour' || (zoom === 'semaine' && wd === 0)) ticks.push({ left: i * dayW, label: String(parts(d)[2]) });
  }
  const height = HEAD_H + rows.length * ROW_H;
  const deps: string[] = [];
  rows.forEach((r, i) => {
    if (r.type !== 'task') return;
    const s = taskStart(r.t);
    if (!s) return;
    for (const depId of r.t.dependsOn) {
      const j = rowIndex.get(depId);
      const dep = taskById.get(depId);
      const de = dep ? taskEnd(dep) : null;
      if (j === undefined || !de) continue;
      const x1 = x(de) + dayW, y1 = HEAD_H + j * ROW_H + ROW_H / 2;
      const x2 = x(s), y2 = HEAD_H + i * ROW_H + ROW_H / 2;
      deps.push(`M${x1} ${y1} h6 V${y2} H${Math.max(x1 + 6, x2 - 2)}`);
    }
  });
  const todayX = today >= viewStart && today <= viewEnd ? x(today) + dayW / 2 : null;

  return (
    <div className={`gantt ${compact ? 'is-compact' : ''}`}>
      <div className="gantt-toolbar">
        <div className="cal-nav">
          <IconButton icon="left" label="Mois précédent" onClick={() => setViewStart(addMonths(viewStart, -1))} />
          <IconButton icon="right" label="Mois suivant" onClick={() => setViewStart(addMonths(viewStart, 1))} />
          <span className="gantt-range">{formatDate(viewStart, 'medium')} – {formatDate(viewEnd, 'medium')}</span>
          <Button size="sm" variant="ghost" onClick={() => setViewStart(startOfMonth(addMonths(today, zoom === 'mois' ? -2 : -1)))}>Aujourd’hui</Button>
        </div>
        <div className="cal-tools">
          <Select value={person} onChange={setPerson} ariaLabel="Filtrer par responsable" options={[{ value: '', label: 'Toute l’équipe' }, ...team.map((m) => ({ value: m.id, label: m.code }))]} />
          <Select value={status} onChange={setStatus} ariaLabel="Filtrer par statut" options={[{ value: '', label: 'Tous les statuts' }, { value: 'en_retard', label: 'En retard' }, ...TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))]} />
          <Segmented size="sm" ariaLabel="Échelle" value={zoom} onChange={setZoom} options={[{ value: 'jour', label: 'Jours' }, { value: 'semaine', label: 'Semaines' }, { value: 'mois', label: 'Année' }]} />
        </div>
      </div>
      {rows.length ? (
        <div className="gantt-scroll">
          <div className="gantt-inner" style={{ gridTemplateColumns: `var(--gl) ${width}px`, height }}>
            <div className="g-corner">Tâche</div>
            <div className="g-head" style={{ width }}>
              {months.map((m) => <span key={m.label} className="g-month" style={{ left: m.left, width: m.w }}>{m.w > 70 ? m.label : m.label.slice(0, 3)}</span>)}
              {ticks.map((t) => <span key={t.left} className="g-tick" style={{ left: t.left, width: dayW }}>{t.label}</span>)}
            </div>
            <div className="g-bg" style={{ width, top: HEAD_H, height: rows.length * ROW_H }} aria-hidden="true">
              {weekends.map((l) => <span key={l} style={{ left: l, width: dayW * 2 }} />)}
              {months.map((m) => <i key={m.left} style={{ left: m.left }} />)}
            </div>
            {rows.map((r, i) => r.type === 'group' ? (
              <GroupRow key={`g-${r.g.id}-${i}`} g={r.g} x={x} dayW={dayW} today={today} />
            ) : (
              <div key={r.t.id} className="g-row" style={{ display: 'contents' }}>
                <div className={`gl ${isOverdue(r.t, today) ? 'is-late' : ''} ${isDone(r.t) ? 'is-done' : ''}`}>
                  <button type="button" className="check" disabled={!canWrite} aria-label={isDone(r.t) ? `Rouvrir ${r.t.title}` : `Terminer ${r.t.title}`} onClick={() => void setDone([r.t.id], !isDone(r.t))}>
                    <Icon name={isDone(r.t) ? 'checkCircle' : 'circle'} size={17} />
                  </button>
                  <button type="button" className="gl-title" onClick={() => openTask(r.t.id)} title={r.t.title}>{r.t.milestone ? <Icon name="diamond" size={12} className="ms-icon" /> : null}{r.t.title}</button>
                  <MemberTag member={memberById.get(r.t.assigneeId ?? '')} empty="—" />
                </div>
                <div className="gt">
                  <TaskBar t={r.t} drag={drag?.id === r.t.id ? drag : null} x={x} dayW={dayW} today={today} viewStart={viewStart} viewEnd={viewEnd}
                    datesFor={datesFor} onDown={onDown} onMove={onMove} onUp={onUp} onKey={onKey}
                    onClick={() => { if (suppress.current) { suppress.current = false; return; } openTask(r.t.id); }} canWrite={canWrite} />
                </div>
              </div>
            ))}
            <svg className="g-deps" width={width} height={height} aria-hidden="true">
              <defs><marker id="g-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" /></marker></defs>
              {deps.map((p, i) => <path key={i} d={p} markerEnd="url(#g-arrow)" />)}
              {todayX !== null ? <line x1={todayX} x2={todayX} y1={HEAD_H - 6} y2={height} className="g-today" /> : null}
            </svg>
          </div>
        </div>
      ) : <p className="muted pad">Aucune tâche datée ne correspond à ces filtres.</p>}
      <p className="gantt-help">Glissez une barre pour la déplacer, tirez ses bords pour changer les dates. Au clavier : flèches gauche/droite pour déplacer d’un jour, Maj + flèche pour allonger ou raccourcir.</p>
    </div>
  );
}

function GroupRow({ g, x, dayW, today }: { g: GanttGroup; x: (d: ISODate) => number; dayW: number; today: ISODate }) {
  const p = computeProgress(g.tasks, today);
  const real = g.id !== '__loose';
  return (
    <div className="g-row g-group" style={{ display: 'contents' }}>
      <div className="gl gl-group">
        {real ? <button type="button" className="gl-title" onClick={() => openEvent(g.id)}>{g.title}</button> : <span className="gl-title">{g.title}</span>}
        {g.tasks.length ? <span className="gl-pct">{p.pct} %</span> : null}
      </div>
      <div className="gt gt-group">
        {real ? <span className={`g-span g-span-${g.kind}`} style={{ left: x(g.start), width: Math.max(dayW, (diffDays(g.end, g.start) + 1) * dayW) }} /> : null}
      </div>
    </div>
  );
}

function TaskBar({ t, drag, x, dayW, today, viewStart, viewEnd, datesFor, onDown, onMove, onUp, onKey, onClick, canWrite }: {
  t: Task; drag: Drag | null; x: (d: ISODate) => number; dayW: number; today: ISODate; viewStart: ISODate; viewEnd: ISODate;
  datesFor: (t: Task, m: Drag['mode'], d: number) => { start: ISODate; due: ISODate };
  onDown: (e: React.PointerEvent, t: Task, m: Drag['mode']) => void; onMove: (e: React.PointerEvent) => void; onUp: (t: Task) => void;
  onKey: (e: React.KeyboardEvent, t: Task) => void; onClick: () => void; canWrite: boolean;
}) {
  if (!taskStart(t)) return <span className="g-nodate">Sans date</span>;
  const { start, due } = drag ? datesFor(t, drag.mode, drag.delta) : { start: taskStart(t)!, due: taskEnd(t)! };
  if (due < viewStart || start > viewEnd) return null;
  const left = x(start);
  const w = (diffDays(due, start) + 1) * dayW;
  const late = isOverdue(t, today);
  const label = `${t.title}, du ${formatDate(start, 'medium')} au ${formatDate(due, 'medium')}`;
  if (t.milestone) {
    return (
      <button type="button" className={`g-ms ${late ? 'is-late' : ''} ${isDone(t) ? 'is-done' : ''} ${drag?.moved ? 'is-dragging' : ''}`} style={{ left: left + dayW / 2 }}
        aria-label={`Jalon : ${label}`} onPointerDown={(e) => onDown(e, t, 'move')} onPointerMove={onMove} onPointerUp={() => onUp(t)} onKeyDown={(e) => onKey(e, t)} onClick={onClick}>
        <Icon name="diamond" size={16} />
      </button>
    );
  }
  return (
    <button type="button" className={`g-bar g-${t.status} ${late ? 'is-late' : ''} ${drag?.moved ? 'is-dragging' : ''} ${canWrite ? '' : 'is-ro'}`}
      style={{ left, width: Math.max(w, 6) }} aria-label={label}
      onPointerDown={(e) => onDown(e, t, 'move')} onPointerMove={onMove} onPointerUp={() => onUp(t)} onKeyDown={(e) => onKey(e, t)} onClick={onClick}>
      {t.status !== 'termine' && t.progress > 0 ? <span className="g-prog" style={{ width: `${t.progress}%` }} /> : null}
      {w > 60 ? <span className="g-label">{t.title}</span> : null}
      {canWrite ? <>
        <span className="g-handle g-handle-l" onPointerDown={(e) => onDown(e, t, 'start')} />
        <span className="g-handle g-handle-r" onPointerDown={(e) => onDown(e, t, 'end')} />
      </> : null}
    </button>
  );
}
