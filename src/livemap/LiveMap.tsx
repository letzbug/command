import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatDate } from '../domain/dates';
import { GEOMETRY, hasGeometry } from './geometry';
import { BOUNDS, KM_PER_UNIT, LaidOutBubble, layoutBubbles, project, VIEW_H, VIEW_W } from './layout';
import type { PlaceGroup, StatusedActivity, ViewMode } from './model';
import { PLACES } from './places';
import './livemap.css';

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

export function bubbleCaption(g: PlaceGroup, mode: ViewMode): string {
  const c = g.courses, e = g.events;
  if (c.total + e.total === 0) return c.annule + e.annule > 0 ? 'n’a pas lieu' : '';
  if (mode === 'semaine') return 'cette semaine';
  if (mode === 'jour') {
    const running = c.enCours + e.enCours;
    if (running) return `${running} en cours`;
    if (c.aVenir + e.aVenir === c.total + e.total) return g.nextStart ? `dès ${g.nextStart}` : 'à venir';
    if (c.termine + e.termine === c.total + e.total) return 'journée terminée';
    return `${c.termine + e.termine} ${plural(c.termine + e.termine, 'terminé', 'terminés')}`;
  }
  const running = c.enCours + e.enCours;
  if (running) return `${running} en cours`;
  if (e.journee) return 'toute la journée';
  if (g.nextStart) return `dès ${g.nextStart}`;
  if (c.aConfirmer + e.aConfirmer) return 'horaire à confirmer';
  return '';
}

const STATUS_TEXT: Record<StatusedActivity['status'], string> = {
  en_cours: 'En cours', a_venir: 'À venir', termine: 'Terminé', journee: 'Toute la journée', indetermine: 'Horaire à confirmer', annule: 'Annulé',
};

function timeText(a: StatusedActivity): string {
  if (a.startDate !== a.endDate) {
    const span = `${formatDate(a.startDate, 'dayMonth')} – ${formatDate(a.endDate, 'dayMonth')}`;
    return a.start ? `${span}, ${a.start}${a.end ? `–${a.end}` : ''}` : span;
  }
  if (!a.start) return a.kind === 'evenement' ? 'Journée' : 'Horaire non communiqué';
  return `${a.start}${a.end ? `–${a.end}` : ''}`;
}

/** Public-safe detail list: title, time, theme/type, room. Never notes, trainers or contacts. */
export function ActivityList({ items, max = 4, showDate }: { items: StatusedActivity[]; max?: number; showDate?: boolean }) {
  const order: StatusedActivity['status'][] = ['en_cours', 'journee', 'a_venir', 'indetermine', 'termine', 'annule'];
  const sections = order.map((s) => ({ s, list: items.filter((a) => a.status === s) })).filter((x) => x.list.length);
  return (
    <div className="lm-acts">
      {sections.map(({ s, list }) => (
        <div key={s} className={`lm-acts-sec st-${s}`}>
          <p className="lm-acts-head">{STATUS_TEXT[s]}<span>{list.length}</span></p>
          <ul>
            {list.slice(0, max).map((a) => (
              <li key={a.id} className={`k-${a.kind}`}>
                <span className="lm-act-time">{showDate ? `${formatDate(a.date, 'weekdayDayMonth')} ` : ''}{timeText(a)}</span>
                <span className="lm-act-title">{a.title}</span>
                <span className="lm-act-meta">{a.label}{a.room ? `, salle ${a.room}` : ''}{a.estimated ? ' (date estimée)' : ''}</span>
              </li>
            ))}
          </ul>
          {list.length > max ? <p className="lm-acts-more">et {list.length - max} {plural(list.length - max, 'autre', 'autres')}</p> : null}
        </div>
      ))}
    </div>
  );
}

function ringPath(rings: [number, number][][]): string {
  return rings.map((r) => r.map(([lon, lat], i) => {
    const [x, y] = project(lon, lat);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join('') + 'Z').join('');
}

function Basemap({ bubbles }: { bubbles: LaidOutBubble[] }) {
  const communes = useMemo(() => GEOMETRY.communes.map((c, i) => ({ key: `c${i}`, name: c.name, d: ringPath(c.rings) })), []);
  const grid = useMemo(() => {
    const lines: { d: string; label: string; lx: number; ly: number; vertical: boolean }[] = [];
    for (let lon = 5.8; lon <= 6.5001; lon += 0.1) {
      const [x] = project(lon, BOUNDS.latMax);
      lines.push({ d: `M${x.toFixed(1)} 0V${VIEW_H}`, label: `${lon.toFixed(1)}° E`, lx: x + 4, ly: VIEW_H - 8, vertical: true });
    }
    for (let lat = 49.5; lat <= 50.1501; lat += 0.1) {
      const [, y] = project(BOUNDS.lonMin, lat);
      lines.push({ d: `M0 ${y.toFixed(1)}H${VIEW_W}`, label: `${lat.toFixed(1)}° N`, lx: 6, ly: y - 5, vertical: false });
    }
    return lines;
  }, []);
  const covered = (x: number, y: number) => bubbles.some((b) => Math.hypot(b.x - x, b.y - y) < b.r + 14);
  const scaleKm = 10;
  const scaleLen = scaleKm / KM_PER_UNIT;
  return (
    <svg className="lm-base" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <radialGradient id="lm-halo"><stop offset="0" stopColor="var(--lm-course)" stopOpacity=".28" /><stop offset="1" stopColor="var(--lm-course)" stopOpacity="0" /></radialGradient>
      </defs>
      <g className="lm-grid">
        {grid.map((g, i) => <path key={i} d={g.d} />)}
        {grid.map((g, i) => <text key={`t${i}`} x={g.lx} y={g.ly} className={g.vertical ? 'v' : 'h'}>{g.label}</text>)}
      </g>
      {hasGeometry() ? (
        <g className="lm-land">
          <g className="lm-border">{communes.map((c) => <path key={`b${c.key}`} d={c.d} />)}</g>
          <g className="lm-fill">{communes.map((c) => <path key={`f${c.key}`} d={c.d} />)}</g>
          <g className="lm-communes">{communes.map((c) => <path key={c.key} d={c.d}>{c.name ? <title>{c.name}</title> : null}</path>)}</g>
        </g>
      ) : null}
      <g className="lm-halos">
        {bubbles.filter((b) => b.group.live).map((b) => <circle key={b.group.place.id} cx={b.ax} cy={b.ay} r={b.r * 1.9} fill="url(#lm-halo)" />)}
      </g>
      <g className="lm-places">
        {PLACES.filter((p) => p.kind !== 'quartier').map((p) => {
          const [x, y] = project(p.lon, p.lat);
          const showLabel = (p.rank === 1 || p.rank === 2) && !covered(x, y);
          return (
            <g key={p.id} className={`lm-place rank-${p.rank}`}>
              <circle cx={x} cy={y} r={p.rank === 1 ? 3.2 : 2.2} />
              {showLabel ? <text x={x + 7} y={y + 4}>{p.name}</text> : null}
            </g>
          );
        })}
      </g>
      <g className="lm-leaders">
        {bubbles.filter((b) => b.displaced).map((b) => (
          <g key={b.group.place.id}>
            <line x1={b.ax} y1={b.ay} x2={b.x} y2={b.y} />
            <circle cx={b.ax} cy={b.ay} r={3.6} />
          </g>
        ))}
      </g>
      <g className="lm-compass" transform={`translate(${VIEW_W - 40} 46)`}>
        <path d="M0 -26 L8 4 L0 -2 L-8 4 Z" />
        <text y={24} textAnchor="middle">N</text>
      </g>
      <g className="lm-scale" transform={`translate(28 ${VIEW_H - 40})`}>
        <path d={`M0 0H${scaleLen.toFixed(1)}M0 -5V5M${scaleLen.toFixed(1)} -5V5`} />
        <text x={scaleLen / 2} y={-10} textAnchor="middle">{scaleKm} km</text>
      </g>
    </svg>
  );
}

export interface LiveMapProps {
  groups: PlaceGroup[];
  mode: ViewMode;
  variant: 'planning' | 'display';
  highlightId?: string | null;
  className?: string;
}

/** Shared map engine: true-position anchors, non-overlapping bubbles, gentle state transitions. */
export function LiveMap({ groups, mode, variant, highlightId, className = '' }: LiveMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [unit, setUnit] = useState(1);
  const [hover, setHover] = useState<string | null>(null);
  const bubbles = useMemo(() => layoutBubbles(groups), [groups]);
  const prev = useRef<LaidOutBubble[]>([]);
  const [leaving, setLeaving] = useState<LaidOutBubble[]>([]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setUnit(el.clientWidth / VIEW_W || 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bubbles that disappear fade out instead of vanishing.
  useEffect(() => {
    const ids = new Set(bubbles.map((b) => b.group.place.id));
    const gone = prev.current.filter((b) => !ids.has(b.group.place.id));
    prev.current = bubbles;
    if (!gone.length) return;
    setLeaving((l) => [...l.filter((x) => !ids.has(x.group.place.id)), ...gone]);
    const t = setTimeout(() => setLeaving((l) => l.filter((x) => !gone.includes(x))), 1400);
    return () => clearTimeout(t);
  }, [bubbles]);

  const hovered = bubbles.find((b) => b.group.place.id === hover) ?? null;
  const render = (b: LaidOutBubble, isLeaving: boolean, i: number) => {
    const g = b.group;
    const courses = g.courses.total, events = g.events.total;
    const onlyEvents = courses === 0 && events > 0;
    const cancelledOnly = courses + events === 0;
    const main = onlyEvents ? events : courses;
    const d = 2 * b.r * unit;
    const cls = ['lmb', onlyEvents ? 'is-event' : 'is-course', g.live && !isLeaving ? 'is-live' : '', cancelledOnly ? 'is-cancelled' : '',
      highlightId === g.place.id ? 'is-hl' : '', isLeaving ? 'is-leaving' : '', variant === 'planning' && hover === g.place.id ? 'is-hover' : ''].join(' ');
    const style = { left: `${(b.x / VIEW_W) * 100}%`, top: `${(b.y / VIEW_H) * 100}%`, ['--d' as string]: `${d}px`, ['--delay' as string]: `${(i % 7) * -0.9}s` };
    const inner = (
      <>
        {g.live && !isLeaving ? <span className="lmb-ring" aria-hidden="true" /> : null}
        <span className="lmb-core">
          <span className="lmb-num">{cancelledOnly ? g.courses.annule + g.events.annule : main}</span>
          <span className="lmb-unit">{cancelledOnly ? plural(g.courses.annule + g.events.annule, 'annulé', 'annulés') : onlyEvents ? plural(main, 'événement', 'événements') : 'cours'}</span>
        </span>
        {!onlyEvents && events > 0 ? (
          <span className="lmb-sat" title={`${events} ${plural(events, 'événement', 'événements')}`}>
            <span className="lmb-sat-num">{events}</span><span className="lmb-sat-unit">{plural(events, 'événement', 'événements')}</span>
          </span>
        ) : null}
        <span className="lmb-label"><b>{g.place.name}</b><span>{bubbleCaption(g, mode)}</span></span>
      </>
    );
    const label = `${g.place.name} : ${courses} cours, ${events} ${plural(events, 'événement', 'événements')}. ${bubbleCaption(g, mode)}`;
    return variant === 'planning' && !isLeaving ? (
      <button key={g.place.id} type="button" className={cls} style={style} aria-label={label}
        onMouseEnter={() => setHover(g.place.id)} onMouseLeave={() => setHover((h) => (h === g.place.id ? null : h))}
        onFocus={() => setHover(g.place.id)} onBlur={() => setHover(null)}>
        {inner}
      </button>
    ) : (
      <div key={`${g.place.id}${isLeaving ? '-out' : ''}`} className={cls} style={style} aria-label={isLeaving ? undefined : label} aria-hidden={isLeaving}>{inner}</div>
    );
  };

  return (
    <div ref={ref} className={`lm lm--${variant} ${className}`} style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, ['--u' as string]: `${unit}px` }}>
      <Basemap bubbles={bubbles} />
      <div className="lm-bubbles">
        {leaving.map((b, i) => render(b, true, i))}
        {bubbles.map((b, i) => render(b, false, i))}
      </div>
      {variant === 'planning' && hovered ? (
        <div className={`lm-tip ${hovered.x > VIEW_W * 0.55 ? 'to-left' : ''}`} role="tooltip"
          style={{ left: `${(hovered.x / VIEW_W) * 100}%`, top: `${(hovered.y / VIEW_H) * 100}%`, ['--off' as string]: `${hovered.r * unit + 12}px` }}>
          <p className="lm-tip-place">{hovered.group.place.name}</p>
          <p className="lm-tip-counts">
            <span>{hovered.group.courses.total} cours</span>
            {hovered.group.events.total ? <span>{hovered.group.events.total} {plural(hovered.group.events.total, 'événement', 'événements')}</span> : null}
          </p>
          <ActivityList items={hovered.group.items} max={mode === 'semaine' ? 6 : 4} showDate={mode === 'semaine'} />
        </div>
      ) : null}
    </div>
  );
}
