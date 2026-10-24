import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { addDays, capitalize, formatDate, isValidISODate, isValidTime, startOfWeek, eachDay } from '../domain/dates';
import type { Course } from '../domain/types';
import { DEFAULT_COURSE_SOURCE, fetchCourseFeed } from '../integrations/courses/courseService';
import { mapUniPopCourses } from '../integrations/courses/unipopAdapter';
import { feedToEventLike, parsePublicFeed, PublicFeed } from '../livemap/feed';
import { ActivityList, LiveMap } from '../livemap/LiveMap';
import { courseActivities, dayRibbon, eventActivities, groupByPlace, luxNow, LuxNow, summarize, visibleActivities } from '../livemap/model';
import '../livemap/livemap.css';

/**
 * UniPop Live Map — public display (read-only, no login, no editing).
 * URL parameters: cours=<url trainings.json>, evenements=<url carte-evenements.json>,
 * theme=nuit, eco=1, rotation=<seconds|0>, date=YYYY-MM-DD&heure=HH:MM (simulation for tests).
 */
const params = new URLSearchParams(location.search);
const COURSE_URL = params.get('cours') || DEFAULT_COURSE_SOURCE;
const EVENTS_URL = params.get('evenements') || 'carte-evenements.json';
const THEME = params.get('theme') === 'nuit' ? 'nuit' : 'clair';
const ECO = params.get('eco') === '1';
const ROTATION_S = Math.max(0, Number(params.get('rotation') ?? 12) || 0);
const SIM: LuxNow | null = isValidISODate(params.get('date')) && isValidTime(params.get('heure')) ? { date: params.get('date')!, time: params.get('heure')! } : null;
const REFRESH_MS = 5 * 60_000;
const CACHE_KEY = 'unipop-livemap-display-v1';

/** Only what the display needs: no trainer, description, contacts or registration data is kept. */
function slim(courses: Course[], today: string): Course[] {
  const from = startOfWeek(today), to = addDays(from, 6);
  return courses.filter((c) => c.endDate >= from && c.startDate <= to).map((c) => ({
    id: c.id, code: c.code, title: c.title, theme: c.theme, themeCode: c.themeCode, category: c.category, categoryCode: c.categoryCode,
    description: '', location: c.location, locality: c.locality, room: c.room ?? null, format: c.format, trainer: null, enrolled: null, capacity: null,
    startDate: c.startDate, endDate: c.endDate, sessions: c.sessions.filter((s) => s.date >= from && s.date <= to),
  }));
}

interface Cache { savedAt: string; courses: Course[]; feed: PublicFeed | null }
const readCache = (): Cache | null => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null'); } catch { return null; } };
const writeCache = (c: Cache) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* quota: keep running from memory */ } };
const hhmm = (iso: string | null) => (iso ? new Intl.DateTimeFormat('fr-LU', { timeZone: 'Europe/Luxembourg', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—');

function useNow(): LuxNow {
  const [now, setNow] = useState<LuxNow>(SIM ?? luxNow());
  useEffect(() => {
    if (SIM) return;
    const id = setInterval(() => setNow((n) => { const x = luxNow(); return x.time === n.time && x.date === n.date ? n : x; }), 10_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Carte() {
  const now = useNow();
  const cached = useMemo(readCache, []);
  const [courses, setCourses] = useState<Course[] | null>(cached?.courses ?? null);
  const [feed, setFeed] = useState<PublicFeed | null>(cached?.feed ?? null);
  const [savedAt, setSavedAt] = useState<string | null>(cached?.savedAt ?? null);
  const [problem, setProblem] = useState<string | null>(null);
  const [period, setPeriod] = useState<'live' | 'semaine'>('live');
  const [spot, setSpot] = useState(0);
  const [swapping, setSwapping] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let alive = true;
    const run = async () => {
      const today = (SIM ?? luxNow()).date;
      let nextCourses: Course[] | null = null, nextFeed: PublicFeed | null | undefined, err: string | null = null;
      try { nextCourses = slim(mapUniPopCourses(await fetchCourseFeed(COURSE_URL)).courses, today); }
      catch (e) { err = e instanceof Error ? e.message : 'Source des cours inaccessible.'; }
      try {
        const r = await fetch(EVENTS_URL, { cache: 'no-cache' });
        if (r.status === 404) nextFeed = null; else if (r.ok) nextFeed = parsePublicFeed(await r.json()); else err = err ?? `Flux des événements : HTTP ${r.status}.`;
      } catch { err = err ?? 'Flux des événements inaccessible.'; }
      if (!alive) return;
      if (nextCourses) setCourses(nextCourses);
      if (nextFeed !== undefined) setFeed(nextFeed);
      if (nextCourses || nextFeed !== undefined) {
        const stamp = new Date().toISOString();
        setSavedAt(stamp);
        writeCache({ savedAt: stamp, courses: nextCourses ?? readCache()?.courses ?? [], feed: nextFeed !== undefined ? nextFeed : readCache()?.feed ?? null });
      }
      setProblem(err);
      failures = err ? failures + 1 : 0;
      timer = setTimeout(run, err ? Math.min(REFRESH_MS * (1 + failures), 20 * 60_000) : REFRESH_MS);
    };
    void run();
    const online = () => { if (timer) clearTimeout(timer); void run(); };
    window.addEventListener('online', online);
    return () => { alive = false; if (timer) clearTimeout(timer); window.removeEventListener('online', online); };
  }, []);

  const overrides = feed?.placeOverrides ?? {};
  const monday = startOfWeek(now.date);
  const sunday = addDays(monday, 6);
  const from = period === 'semaine' ? monday : now.date;
  const to = period === 'semaine' ? sunday : now.date;
  const all = useMemo(() => [
    ...courseActivities(courses ?? [], from, to, overrides),
    ...eventActivities(feed ? feedToEventLike(feed) : [], from, to, overrides),
  ], [courses, feed, from, to, overrides]);
  const visible = useMemo(() => visibleActivities(all, period, now.date, now), [all, period, now]);
  const groups = useMemo(() => groupByPlace(visible, period), [visible, period]);
  const summary = useMemo(() => summarize(visible, groups), [visible, groups]);
  const ribbon = useMemo(() => dayRibbon(all, now.date, now), [all, now]);
  const weekDays = useMemo(() => [...eachDay(monday, sunday)].map((date) => ({
    date, count: all.filter((a) => a.kind === 'cours' && a.date === date && !a.cancelled).length,
  })), [all, monday, sunday]);
  const weeklyCourses = visible.filter((a) => a.kind === 'cours' && !a.cancelled).length;
  const weeklyEvents = visible.filter((a) => a.kind === 'evenement' && !a.cancelled).length;
  const weeklyRemote = visible.filter((a) => a.kind === 'cours' && a.remote && !a.cancelled).length;
  const active = groups.filter((g) => g.courses.total + g.events.total > 0);
  const current = active.length ? active[spot % active.length] : null;

  useEffect(() => {
    if (!ROTATION_S || active.length < 2) return;
    const id = setInterval(() => { setSwapping(true); setTimeout(() => { setSpot((s) => s + 1); setSwapping(false); }, 600); }, ROTATION_S * 1000);
    return () => clearInterval(id);
  }, [active.length]);

  const maxSlot = Math.max(1, ...ribbon.map((s) => s.count));
  const maxWeek = Math.max(1, ...weekDays.map((d) => d.count));
  const [h, m] = now.time.split(':').map(Number);
  const nowPos = Math.min(100, Math.max(0, ((h * 60 + m - 360) / (17 * 60)) * 100));
  const loading = courses === null && !problem;

  return (
    <div className={`carte theme-${THEME}`}>
      <header className="carte-head">
        <h1 className="carte-brand"><b>UNIPOP LIVE MAP</b><span>Le Luxembourg en mouvement</span></h1>
        <div className="carte-clock" aria-live="off">
          <div className="carte-period" role="group" aria-label="Période affichée">
            <button type="button" className={period === 'live' ? 'is-active' : ''} aria-pressed={period === 'live'} onClick={() => { setPeriod('live'); setSpot(0); }}>Aujourd’hui</button>
            <button type="button" className={period === 'semaine' ? 'is-active' : ''} aria-pressed={period === 'semaine'} onClick={() => { setPeriod('semaine'); setSpot(0); }}>Semaine</button>
          </div>
          <span className="date">{capitalize(formatDate(now.date, 'long'))}</span>
          <span className="time">{now.time}</span>
        </div>
      </header>
      {loading ? <p className="carte-loading">Chargement des activités…</p> : <>
        <main className="carte-map">
          <LiveMap groups={groups} mode={period} variant="display" highlightId={ROTATION_S ? current?.place.id ?? null : null} className={ECO ? 'eco' : ''} />
        </main>
        <aside className="carte-side">
          {period === 'live' ? <dl className="carte-stats">
            <div className="carte-stat is-course"><dt>Cours en cours</dt><dd>{summary.coursEnCours}</dd></div>
            <div className="carte-stat is-course"><dt>Cours à venir aujourd’hui</dt><dd>{summary.coursAVenir}</dd></div>
            <div className="carte-stat is-event"><dt>Événements actifs</dt><dd>{summary.evenementsActifs}</dd></div>
            <div className="carte-stat"><dt>Lieux actifs</dt><dd>{summary.lieuxActifs}</dd></div>
            <div className="carte-stat wide"><dt>Prochain début</dt><dd className="next">{summary.prochain ? <><b>{summary.prochain.time}</b>{summary.prochain.title}, {summary.prochain.place}</> : 'Plus de début prévu aujourd’hui'}</dd></div>
          </dl> : <dl className="carte-stats">
            <div className="carte-stat is-course"><dt>Cours cette semaine</dt><dd>{weeklyCourses}</dd></div>
            <div className="carte-stat is-event"><dt>Événements cette semaine</dt><dd>{weeklyEvents}</dd></div>
            <div className="carte-stat"><dt>Lieux concernés</dt><dd>{summary.lieuxActifs}</dd></div>
            <div className="carte-stat"><dt>Cours à distance</dt><dd>{weeklyRemote}</dd></div>
            <div className="carte-stat wide"><dt>Période</dt><dd className="next">{formatDate(monday, 'dayMonth')} – {formatDate(sunday, 'medium')}</dd></div>
          </dl>}
          {current ? (
            <section className={`carte-spot ${swapping ? 'is-swapping' : ''}`} aria-live="polite">
              <h2>{current.place.name}</h2>
              <p className="counts">
                {current.courses.total ? <span className="c">{current.courses.total} cours</span> : null}
                {current.events.total ? <span className="e">{current.events.total} événement{current.events.total > 1 ? 's' : ''}</span> : null}
              </p>
              <ActivityList items={current.items.filter((a) => a.status !== 'termine')} max={3} showDate={period === 'semaine'} />
            </section>
          ) : <p className="carte-empty">{period === 'semaine' ? 'Aucune activité prévue cette semaine sur la carte.' : 'Aucune activité en cours ou à venir aujourd’hui sur la carte.'}</p>}
          {period === 'live' && summary.aDistance ? <p className="carte-remote">Et {summary.aDistance} cours à distance aujourd’hui.</p> : null}
          <p className="carte-legend"><span><i className="lc" />Cours</span><span><i className="le" />Événements</span><span><i className="ll" />En cours</span></p>
        </aside>
        {period === 'live' ? <section className="carte-ribbon" aria-label="Le fil de la journée">
          <span className="carte-ribbon-title">Le fil de la journée<br />cours simultanés</span>
          <div className="carte-ribbon-bars">
            {ribbon.map((s) => <span key={s.from} className={s.past ? 'past' : ''} style={{ height: `${(s.count / maxSlot) * 100}%` }} title={`${s.from} : ${s.count} cours`} />)}
            <i className="now" style={{ left: `${nowPos}%` }} />
          </div>
          <div className="carte-ribbon-hours">{[6, 9, 12, 15, 18, 21, 23].map((hh) => <span key={hh} style={{ left: `${((hh - 6) / 17) * 100}%` }}>{String(hh).padStart(2, '0')}:00</span>)}</div>
        </section> : <section className="carte-ribbon" aria-label="Répartition des cours cette semaine">
          <span className="carte-ribbon-title">Le fil de la semaine<br />cours par jour</span>
          <div className="carte-ribbon-bars carte-week-bars">
            {weekDays.map((d) => <span key={d.date} className={d.date < now.date ? 'past' : ''} style={{ height: `${(d.count / maxWeek) * 100}%` }} title={`${formatDate(d.date, 'long')} : ${d.count} cours`} />)}
          </div>
          <div className="carte-ribbon-hours carte-week-hours">{weekDays.map((d, i) => <span key={d.date} style={{ left: `${(i + .5) / 7 * 100}%` }}>{['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'][i]}</span>)}</div>
        </section>}
      </>}
      <footer className="carte-foot">
        <span className="carte-foot-update">Cours UniPop, mise à jour : {hhmm(savedAt)}</span>
      </footer>
    </div>
  );
}

document.documentElement.classList.add('carte-root');
createRoot(document.getElementById('root')!).render(<StrictMode><Carte /></StrictMode>);
