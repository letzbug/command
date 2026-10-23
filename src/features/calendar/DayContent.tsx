import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { newEvent, newTask, openEvent, openTask, setDone } from '../../app/actions';
import { CalendarData, useCalendarData, useCourseIndex, useLookups } from '../../app/derived';
import { useAppState } from '../../app/store';
import { capitalize, formatDate } from '../../domain/dates';
import { isOverdue } from '../../domain/planning';
import type { ISODate } from '../../domain/types';
import { groupByTheme, SessionRef } from '../../integrations/courses/unipopAdapter';
import { Icon } from '../../ui/icons';
import { Button, MemberTag, Progress } from '../../ui/kit';
import { ui, useUI } from '../../ui/uiStore';

export function CourseLine({ r, onOpen }: { r: SessionRef; onOpen?: () => void }) {
  const { course, session } = r;
  const full = course.capacity && course.enrolled !== null && course.enrolled !== undefined ? course.enrolled >= course.capacity : false;
  return (
    <button type="button" className="course-line" onClick={onOpen ?? (() => void ui.pushPanel({ kind: 'course', id: course.id }))}>
      <span className="cl-time">{session.start ?? '—'}{session.end ? `–${session.end}` : ''}</span>
      <span className="cl-main">
        <span className="cl-title">{course.title}</span>
        <span className="cl-meta">
          <span><Icon name="pin" size={13} />{course.location}{course.room ? `, salle ${course.room}` : ''}</span>
          {course.locality && course.locality !== course.location ? <span>{course.locality}</span> : null}
        </span>
      </span>
      {course.capacity ? (
        <span className={`cl-seats ${full ? 'is-full' : ''}`} title="Inscrits / places">
          <b>{course.enrolled ?? '?'}</b>/{course.capacity}
          <Progress value={((course.enrolled ?? 0) / course.capacity) * 100} tone={full ? 'bad' : undefined} label="Taux de remplissage" />
        </span>
      ) : null}
    </button>
  );
}

/** Everything happening on one day: events, deadlines, courses grouped by theme. */
export function DayContent({ date, data, expanded, compact, initialTheme }: { date: ISODate; data: CalendarData; expanded?: boolean; compact?: boolean; initialTheme?: string | null }) {
  const today = useAppState((s) => s.today);
  const { memberById } = useLookups();
  const occ = data.occByDate.get(date) ?? [];
  const due = data.dueByDate.get(date) ?? [];
  const themes = useMemo(() => groupByTheme(data.coursesByDate.get(date) ?? []), [data, date]);
  const [open, setOpen] = useState<string | null>(initialTheme ?? null);
  const themeRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (initialTheme) themeRef.current?.scrollIntoView({ block: 'nearest' }); }, [initialTheme]);
  const hol = data.holidays.get(date);
  const school = data.schoolBreaks.get(date);
  const nothing = !occ.length && !due.length && !themes.length;
  return (
    <div className={`daycontent ${compact ? 'is-compact' : ''}`}>
      {hol ? <p className="day-hol"><Icon name="info" size={15} />Jour férié : {hol}</p> : null}
      {school ? <p className="day-school"><Icon name="info" size={15} />Vacances scolaires : {school}</p> : null}
      {occ.length ? (
        <section className="dsec">
          {!compact ? <h4>Événements et projets</h4> : null}
          {occ.map((o) => (
            <button key={o.event.id + o.key} type="button" className={`dev dev-${o.event.kind}`} onClick={() => openEvent(o.event.id, o.key, !compact && !expanded)}>
              <span className="dev-bar" />
              <span className="dev-main">
                <span className="dev-title">{o.title}{o.recurring ? <Icon name="repeat" size={13} className="dev-rec" /> : null}</span>
                <span className="dev-meta">
                  {o.startTime ? `${o.startTime}${o.endTime ? `–${o.endTime}` : ''}` : o.startDate !== o.endDate ? `${formatDate(o.startDate, 'dayMonth')} – ${formatDate(o.endDate, 'dayMonth')}` : 'Toute la journée'}
                  {o.location ? `, ${o.location}` : ''}
                </span>
              </span>
              <MemberTag member={memberById.get(o.event.ownerId ?? '')} empty="—" />
            </button>
          ))}
        </section>
      ) : null}
      {due.length ? (
        <section className="dsec">
          {!compact ? <h4>Échéances et jalons</h4> : null}
          {due.map((t) => (
            <div key={t.id} className={`dtask ${t.status === 'termine' ? 'is-done' : ''} ${isOverdue(t, today) ? 'is-late' : ''}`}>
              <button type="button" className="check" aria-label={t.status === 'termine' ? `Rouvrir ${t.title}` : `Terminer ${t.title}`} aria-pressed={t.status === 'termine'} onClick={() => void setDone([t.id], t.status !== 'termine')}>
                <Icon name={t.status === 'termine' ? 'checkCircle' : 'circle'} size={19} />
              </button>
              <button type="button" className="dtask-title" onClick={() => openTask(t.id, !compact && !expanded)}>
                {t.milestone ? <Icon name="diamond" size={13} className="ms-icon" /> : null}{t.title}
              </button>
              <MemberTag member={memberById.get(t.assigneeId ?? '')} />
            </div>
          ))}
        </section>
      ) : null}
      {themes.length ? (
        <section className="dsec" ref={themeRef}>
          {!compact ? <h4>Formations <span className="muted">({themes.reduce((a, g) => a + g.items.length, 0)} séances)</span></h4> : null}
          <div className="theme-groups">
            {themes.map((g) => {
              const isOpen = expanded || open === g.theme;
              return (
                <div key={g.theme} className={`tgroup ${isOpen ? 'is-open' : ''}`}>
                  <button type="button" className="tgroup-head" aria-expanded={isOpen} onClick={() => setOpen(open === g.theme ? null : g.theme)}>
                    <span className="tg-name">{g.theme}</span><span className="tg-cat">{g.category}</span><b>{g.items.length}</b>
                    {!expanded ? <Icon name="down" size={15} /> : null}
                  </button>
                  {isOpen ? <div className="tgroup-list">{g.items.map((r, i) => <CourseLine key={r.course.id + i} r={r} />)}</div> : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
      {nothing && !hol && !compact ? <p className="muted">Aucune activité ce jour-là avec les filtres actuels.</p> : null}
    </div>
  );
}

export function DayPanel({ date, theme }: { date: ISODate; theme?: string | null }) {
  const filters = useUI((s) => s.filters);
  const today = useAppState((s) => s.today);
  const data = useCalendarData(date, date, filters);
  return (
    <div className="pv">
      <header className="pv-head">
        <p className="pv-kicker">{date === today ? 'Aujourd’hui' : date < today ? 'Jour passé' : 'Jour à venir'}</p>
        <h2 className="pv-title">{capitalize(formatDate(date, 'long'))}</h2>
        <div className="pv-actions">
          <Button size="sm" icon="plus" onClick={() => newEvent({ startDate: date, endDate: date })}>Événement</Button>
          <Button size="sm" icon="plus" onClick={() => newTask({ dueDate: date, startDate: date })}>Tâche</Button>
        </div>
      </header>
      <DayContent date={date} data={data} initialTheme={theme} />
    </div>
  );
}

/** Contextual list of the courses of one theme on one day. */
export function ThemePopover() {
  const p = useUI((s) => s.popover);
  const idx = useCourseIndex();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!p || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(p.x, window.innerWidth - r.width - 8));
    const top = p.y + r.height > window.innerHeight - 8 ? Math.max(8, p.y - r.height - 40) : p.y;
    setPos({ left, top });
  }, [p]);
  useEffect(() => {
    if (!p) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) ui.closePopover(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') ui.closePopover(); };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [p]);
  if (!p) return null;
  const items = (idx.byDate.get(p.date) ?? []).filter((r) => r.course.theme === p.theme);
  return (
    <div ref={ref} className="popover" role="dialog" aria-label={`${p.theme}, ${formatDate(p.date, 'long')}`} style={{ left: pos?.left ?? p.x, top: pos?.top ?? p.y, visibility: pos ? 'visible' : 'hidden' }}>
      <div className="popover-head">
        <div>
          <strong>{p.theme}</strong>
          <span>{capitalize(formatDate(p.date, 'long'))}, {items.length} séance{items.length > 1 ? 's' : ''}</span>
        </div>
        <button type="button" className="icon-btn" aria-label="Fermer" onClick={() => ui.closePopover()}><Icon name="x" size={16} /></button>
      </div>
      <div className="popover-list">
        {items.map((r, i) => <CourseLine key={r.course.id + i} r={r} onOpen={() => { ui.closePopover(); void ui.openPanel({ kind: 'course', id: r.course.id }); }} />)}
      </div>
      {items.some((r) => r.session.estimated) ? <p className="popover-note">Dates de séances estimées à partir de l’horaire hebdomadaire de la source.</p> : null}
    </div>
  );
}

