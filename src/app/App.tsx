import { Component, ReactNode, useEffect } from 'react';
import { todayISO } from '../domain/dates';
import { isOverdue } from '../domain/planning';
import { activeReminders } from '../domain/reminders';
import { ROLE_LABEL } from '../domain/reference';
import { CalendarWorkspace } from '../features/calendar/Calendar';
import { DayPanel, ThemePopover } from '../features/calendar/DayContent';
import { CoursePanel, CoursesPage } from '../features/courses/CoursesPage';
import { EventForm } from '../features/events/EventForm';
import { EventPanel, EventsPage } from '../features/events/EventsPage';
import { PrintPage } from '../features/print/PrintPage';
import { RemindersPage } from '../features/reminders/RemindersPage';
import { CommandPalette, NAV } from '../features/search/CommandPalette';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TaskPanel, TasksPage } from '../features/tasks/TasksPage';
import { TeamPage } from '../features/team/TeamPage';
import { LiveMapSection } from '../features/team/LiveMapSection';
import { Icon } from '../ui/icons';
import { Button, memberDisplayName } from '../ui/kit';
import { ContextMenu, DialogHost, menuAt, PanelHost, Toasts } from '../ui/overlays';
import { Panel, Route, ui, useUI } from '../ui/uiStore';
import { newEvent, newTask } from './actions';
import { useReminders } from './derived';
import { useAppState, useStore } from './store';

const TITLES: Record<Route, { title: string; sub?: string }> = {
  annee: { title: 'Vue annuelle', sub: 'L’année en quatre trimestres' },
  calendrier: { title: 'Calendrier' },
  projets: { title: 'Projets & événements' },
  taches: { title: 'Tâches' },
  rappels: { title: 'Rappels' },
  formations: { title: 'Formations', sub: 'Offre de cours UniPop, en lecture seule' },
  equipe: { title: 'Équipe' },
  carte: { title: 'UniPop Live Map', sub: 'Le Luxembourg en mouvement' },
  impression: { title: 'Impression & exports', sub: 'Affiches A0 à A4 et checklists, en PDF vectoriel' },
  parametres: { title: 'Paramètres' },
};

function renderPanel(p: Panel) {
  switch (p.kind) {
    case 'day': return <DayPanel date={p.date} theme={p.theme} />;
    case 'event': return <EventPanel id={p.id} occurrenceKey={p.occurrenceKey} />;
    case 'eventForm': return <EventForm id={p.id} occurrenceKey={p.occurrenceKey} defaults={p.defaults} />;
    case 'task': return <TaskPanel id={p.id} defaults={p.defaults} />;
    case 'course': return <CoursePanel id={p.id} />;
  }
}

function Brand() {
  return (
    <div className="brand" aria-label="UniPop COMMAND, planification et coordination">
      <span className="brand-mark" aria-hidden="true">U</span>
      <span className="brand-text"><span className="brand-name">UniPop <b>COMMAND</b></span><span className="brand-sub">Planification &amp; coordination</span></span>
    </div>
  );
}

function useBadges() {
  const reminders = activeReminders(useReminders());
  const tasks = useAppState((s) => s.tasks);
  const today = useAppState((s) => s.today);
  return {
    rappels: reminders.filter((r) => r.severity === 'critique' || r.severity === 'haute').length,
    taches: tasks.filter((t) => isOverdue(t, today)).length,
  } as Partial<Record<Route, number>>;
}

function Sidebar() {
  const route = useUI((s) => s.route);
  const store = useStore();
  const me = useAppState((s) => s.team.find((m) => m.id === s.settings.currentUserId));
  const badges = useBadges();
  void store;
  return (
    <nav className="sidebar" aria-label="Navigation principale">
      <Brand />
      <ul className="nav">
        {NAV.map((n) => (
          <li key={n.route}>
            <a href={`#${n.route}`} className={route === n.route ? 'is-active' : ''} aria-current={route === n.route ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); ui.go(n.route); }} title={n.label}>
              <Icon name={n.icon} size={19} /><span className="nav-label">{n.label}</span>
              {badges[n.route] ? <span className={`nav-badge ${n.route === 'rappels' ? 'is-alert' : ''}`}>{badges[n.route]}</span> : null}
            </a>
          </li>
        ))}
      </ul>
      <div className="sidebar-foot">
        <button type="button" className="demo-chip" onClick={() => ui.go('equipe')} title="Sélection de profil local : sans authentification">
          <span className="demo-dot" />
          <span><b>Profil sélectionné</b><small>{me ? `${memberDisplayName(me)}, ${ROLE_LABEL[me.role].toLowerCase()}` : 'Aucun utilisateur'}</small></span>
        </button>
        <p className="credit">Built by Frank G<br /><strong>IBM Certified AI Developer</strong></p>
      </div>
    </nav>
  );
}

function MobileNav() {
  const route = useUI((s) => s.route);
  const badges = useBadges();
  const main: { route: Route; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
    { route: 'annee', label: 'Agenda', icon: 'year' }, { route: 'taches', label: 'Tâches', icon: 'tasks' },
    { route: 'rappels', label: 'Rappels', icon: 'bell' }, { route: 'projets', label: 'Projets', icon: 'layers' },
  ];
  const rest = NAV.filter((n) => !main.some((m) => m.route === n.route));
  return (
    <nav className="mobilenav" aria-label="Navigation">
      {main.map((n) => (
        <button key={n.route} type="button" className={route === n.route ? 'is-active' : ''} aria-current={route === n.route ? 'page' : undefined} onClick={() => ui.go(n.route)}>
          <Icon name={n.icon} size={21} /><span>{n.label}</span>{badges[n.route] ? <i className="mn-badge">{badges[n.route]}</i> : null}
        </button>
      ))}
      <button type="button" className={rest.some((r) => r.route === route) ? 'is-active' : ''} onClick={(e) => menuAt(e, rest.map((r) => ({ label: r.label, icon: r.icon, run: () => ui.go(r.route) })))}>
        <Icon name="menu" size={21} /><span>Plus</span>
      </button>
    </nav>
  );
}

function TopBar() {
  const route = useUI((s) => s.route);
  const eventId = useUI((s) => s.eventId);
  const t = TITLES[route];
  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="topbar-brand"><Brand /></span>
        {!(route === 'projets' && eventId) ? <><h1>{t.title}</h1>{t.sub ? <p>{t.sub}</p> : null}</> : null}
      </div>
      <div className="topbar-actions">
        <button type="button" className="search-trigger" onClick={() => ui.set({ palette: true })} aria-label="Recherche globale (Ctrl K)">
          <Icon name="search" size={17} /><span>Rechercher…</span><kbd>Ctrl K</kbd>
        </button>
        <Button variant="primary" icon="plus" onClick={(e) => menuAt(e, [
          { label: 'Nouvel événement', icon: 'layers', run: () => newEvent() },
          { label: 'Nouvelle tâche', icon: 'tasks', run: () => newTask() },
        ])}>Nouveau</Button>
      </div>
    </header>
  );
}

function Pages() {
  const route = useUI((s) => s.route);
  switch (route) {
    case 'annee': return <CalendarWorkspace route="annee" defaultMode="annee" showBrief />;
    case 'calendrier': return <CalendarWorkspace route="calendrier" defaultMode="mois" />;
    case 'projets': return <EventsPage />;
    case 'taches': return <TasksPage />;
    case 'rappels': return <RemindersPage />;
    case 'formations': return <CoursesPage />;
    case 'equipe': return <TeamPage />;
    case 'carte': return <div className="page"><LiveMapSection /></div>;
    case 'impression': return <PrintPage />;
    case 'parametres': return <SettingsPage />;
  }
}

function ShortcutsBody({ close }: { close: (v?: unknown) => void }) {
  const rows: [string, string][] = [
    ['Ctrl K ou /', 'Recherche globale'], ['N', 'Nouvel événement'], ['A', 'Nouvelle tâche'], ['.', 'Revenir à aujourd’hui (calendrier)'],
    ['← →', 'Période précédente ou suivante'], ['1 à 5', 'Année, trimestre, mois, semaine, jour'], ['Échap', 'Fermer le panneau ou la fenêtre'],
    ['Ctrl Entrée', 'Enregistrer le formulaire'], ['?', 'Afficher cette aide'],
  ];
  return (
    <div className="dlg-body">
      <h2 className="dlg-title">Raccourcis clavier</h2>
      <dl className="shortcuts">{rows.map(([k, v]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>)}</dl>
      <div className="dlg-actions"><button type="button" className="btn btn-primary" onClick={() => close()}>Fermer</button></div>
    </div>
  );
}

function useGlobalEffects() {
  const store = useStore();
  const theme = useAppState((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => {
    const tick = () => store.setToday(todayISO());
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    const onHash = () => ui.syncFromHash();
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); window.removeEventListener('hashchange', onHash); window.removeEventListener('popstate', onHash); };
  }, [store]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ui.set({ palette: !ui.state.palette }); return; }
      if (e.key === 'Escape') {
        if (ui.state.palette) return ui.set({ palette: false });
        if (ui.state.dialog || ui.state.menu) return;
        if (ui.state.popover) return ui.closePopover();
        if (ui.state.panels.length) { e.preventDefault(); void ui.closePanel(); }
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || ui.state.dialog || ui.state.palette) return;
      if (e.key === '/') { e.preventDefault(); ui.set({ palette: true }); }
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); newEvent(); }
      else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); newTask(); }
      else if (e.key === '?') { e.preventDefault(); void ui.openDialog((close) => <ShortcutsBody close={close} />, 'md'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const ready = useAppState((s) => s.ready);
  const fatal = useAppState((s) => s.fatal);
  useGlobalEffects();
  if (!ready) return <div className="boot"><Brand /><p>Chargement des données locales…</p></div>;
  if (fatal) return (
    <div className="boot"><Brand /><h1>L’application n’a pas pu démarrer</h1><p className="field-error">{fatal}</p>
      <p>Vérifiez que le navigateur autorise le stockage local (IndexedDB), puis rechargez la page.</p>
      <Button variant="primary" onClick={() => location.reload()}>Recharger</Button></div>
  );
  return (
    <div className="shell">
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Aller au contenu</a>
      <Sidebar />
      <div className="main-col">
        <TopBar />
        <main id="main" tabIndex={-1} className="main"><Pages /></main>
      </div>
      <MobileNav />
      <PanelHost render={renderPanel} />
      <ThemePopover />
      <CommandPalette />
      <ContextMenu />
      <DialogHost />
      <Toasts />
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boot"><h1>Une erreur inattendue est survenue</h1><p className="field-error">{this.state.error.message}</p>
        <p>Vos données locales ne sont pas perdues. Rechargez l’application.</p>
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>Recharger</button></div>
    );
  }
}
