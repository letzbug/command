import { useMemo } from 'react';
import { openEvent, openTask } from '../../app/actions';
import { useCalendarData, useLookups, useReminders } from '../../app/derived';
import { useAppState } from '../../app/store';
import { addDays, capitalize, diffDays, formatDate } from '../../domain/dates';
import { computeProgress, isDone, isOverdue } from '../../domain/planning';
import { activeReminders } from '../../domain/reminders';
import { groupByTheme } from '../../integrations/courses/unipopAdapter';
import { Icon } from '../../ui/icons';
import { MemberTag, Progress } from '../../ui/kit';
import { DEFAULT_FILTERS, ui } from '../../ui/uiStore';

export function Brief() {
  const today = useAppState((s) => s.today);
  const tasks = useAppState((s) => s.tasks);
  const events = useAppState((s) => s.events);
  const { memberById, tasksByEvent } = useLookups();
  const week = useCalendarData(today, addDays(today, 7), DEFAULT_FILTERS);
  const reminders = activeReminders(useReminders());

  const todayOcc = week.occByDate.get(today) ?? [];
  const todayDue = tasks.filter((t) => t.dueDate === today && !isDone(t));
  const todayCourses = week.coursesByDate.get(today) ?? [];
  const todayThemes = groupByTheme(todayCourses);

  const upcoming = useMemo(() => {
    const items: { date: string; title: string; kind: string; open: () => void }[] = [];
    for (const o of week.occurrences) if (o.startDate > today) items.push({ date: o.startDate, title: o.title, kind: o.event.kind, open: () => openEvent(o.event.id, o.key) });
    for (const t of tasks) if (t.dueDate && t.dueDate > today && t.dueDate <= addDays(today, 7) && !isDone(t)) items.push({ date: t.dueDate, title: t.title, kind: t.milestone ? 'ms' : 'dl', open: () => openTask(t.id) });
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [week.occurrences, tasks, today]);

  const overdue = useMemo(() => tasks.filter((t) => isOverdue(t, today)).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)), [tasks, today]);
  const active = useMemo(() => events
    .filter((e) => !e.archived && e.status !== 'termine' && e.status !== 'annule' && e.endDate >= today && (tasksByEvent.get(e.id) ?? []).some((t) => !isDone(t)))
    .map((e) => ({ e, p: computeProgress(tasksByEvent.get(e.id) ?? [], today) }))
    .sort((a, b) => b.p.overdue - a.p.overdue || a.e.startDate.localeCompare(b.e.startDate)), [events, tasksByEvent, today]);
  const urgent = reminders.filter((r) => r.severity === 'critique' || r.severity === 'haute').length;

  return (
    <div className="brief">
      <section className="brief-card brief-today">
        <header><h3>{capitalize(formatDate(today, 'long'))}</h3></header>
        <ul className="brief-list">
          {todayOcc.map((o) => (
            <li key={o.event.id + o.key}><button type="button" onClick={() => openEvent(o.event.id, o.key)}><i className={`dot dot-${o.event.kind}`} /><span>{o.startTime ? <b>{o.startTime} </b> : null}{o.title}</span></button></li>
          ))}
          {todayDue.map((t) => (
            <li key={t.id}><button type="button" onClick={() => openTask(t.id)}><i className="dot dot-dl" /><span>Échéance : {t.title}</span></button></li>
          ))}
          {!todayOcc.length && !todayDue.length ? <li className="muted">Aucun événement ni échéance aujourd’hui.</li> : null}
        </ul>
        <button type="button" className="brief-link" onClick={() => void ui.openPanel({ kind: 'day', date: today })}>
          {todayCourses.length ? `${todayCourses.length} séance${todayCourses.length > 1 ? 's' : ''} de formation dans ${todayThemes.length} thème${todayThemes.length > 1 ? 's' : ''}` : 'Ouvrir la journée'}
          <Icon name="right" size={14} />
        </button>
      </section>

      <section className="brief-card">
        <header><h3>7 prochains jours</h3><span className="brief-count">{upcoming.length}</span></header>
        <ul className="brief-list">
          {upcoming.slice(0, 5).map((it, i) => (
            <li key={i}><button type="button" onClick={it.open}><span className="brief-date">{formatDate(it.date, 'weekdayDayMonth')}</span><i className={`dot dot-${it.kind}`} /><span>{it.title}</span></button></li>
          ))}
          {!upcoming.length ? <li className="muted">Rien de planifié cette semaine.</li> : null}
        </ul>
        {upcoming.length > 5 ? <button type="button" className="brief-link" onClick={() => { ui.set({ modes: { ...ui.state.modes, calendrier: 'semaine' }, focusDate: today }); ui.go('calendrier'); }}>Voir la semaine ({upcoming.length - 5} de plus)<Icon name="right" size={14} /></button> : null}
      </section>

      <section className={`brief-card ${overdue.length ? 'is-alert' : ''}`}>
        <header><h3>En retard</h3><span className="brief-count">{overdue.length}</span></header>
        <ul className="brief-list">
          {overdue.slice(0, 3).map((t) => (
            <li key={t.id}><button type="button" onClick={() => openTask(t.id)}><span className="brief-late">{diffDays(today, t.dueDate!)} j</span><span>{t.title}</span><MemberTag member={memberById.get(t.assigneeId ?? '')} /></button></li>
          ))}
          {!overdue.length ? <li className="muted">Aucune tâche en retard.</li> : null}
        </ul>
        <div className="brief-links">
          {overdue.length ? <button type="button" className="brief-link" onClick={() => { ui.set({ taskView: 'retard' }); ui.go('taches'); }}>Toutes les tâches en retard<Icon name="right" size={14} /></button> : null}
          <button type="button" className="brief-link" onClick={() => ui.go('rappels')}>{urgent ? `${urgent} rappel${urgent > 1 ? 's' : ''} prioritaire${urgent > 1 ? 's' : ''}` : 'Centre de rappels'}<Icon name="right" size={14} /></button>
        </div>
      </section>

      <section className="brief-card">
        <header><h3>Projets actifs</h3><span className="brief-count">{active.length}</span></header>
        <ul className="brief-list brief-projects">
          {active.slice(0, 4).map(({ e, p }) => (
            <li key={e.id}>
              <button type="button" onClick={() => ui.go('projets', { eventId: e.id })}>
                <span className="bp-title">{e.title}</span>
                <span className="bp-meta"><Progress value={p.pct} tone={p.overdue ? 'warn' : undefined} /><b>{p.pct} %</b>{p.overdue ? <em>{p.overdue} en retard</em> : null}</span>
              </button>
            </li>
          ))}
          {!active.length ? <li className="muted">Aucun projet avec des tâches ouvertes.</li> : null}
        </ul>
      </section>
    </div>
  );
}
