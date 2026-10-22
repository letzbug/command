import { useEffect, useMemo, useRef, useState } from 'react';
import { newEvent, newTask, openEvent, openTask } from '../../app/actions';
import { useAppState } from '../../app/store';
import { formatDate, formatRange } from '../../domain/dates';
import { matchScore, searchAll } from '../../domain/search';
import { Icon, IconName } from '../../ui/icons';
import { CalFilters, DEFAULT_FILTERS, Route, ui, useUI } from '../../ui/uiStore';

interface Item { group: string; label: string; sub?: string; icon: IconName; run: () => void }

export const NAV: { route: Route; label: string; icon: IconName }[] = [
  { route: 'annee', label: 'Vue annuelle', icon: 'year' },
  { route: 'calendrier', label: 'Calendrier', icon: 'calendar' },
  { route: 'projets', label: 'Projets & événements', icon: 'layers' },
  { route: 'taches', label: 'Tâches', icon: 'tasks' },
  { route: 'rappels', label: 'Rappels', icon: 'bell' },
  { route: 'formations', label: 'Formations', icon: 'course' },
  { route: 'equipe', label: 'Équipe', icon: 'users' },
  { route: 'impression', label: 'Impression & exports', icon: 'printer' },
  { route: 'parametres', label: 'Paramètres', icon: 'settings' },
];

export function CommandPalette() {
  const open = useUI((s) => s.palette);
  const events = useAppState((s) => s.events);
  const tasks = useAppState((s) => s.tasks);
  const snap = useAppState((s) => s.courseSnapshot);
  const today = useAppState((s) => s.today);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);

  const items = useMemo<Item[]>(() => {
    const close = () => ui.set({ palette: false });
    const out: Item[] = [];
    const actions: Item[] = [
      { group: 'Actions', label: 'Nouvel événement', icon: 'plus', run: () => { close(); newEvent(); } },
      { group: 'Actions', label: 'Nouvelle tâche', icon: 'plus', run: () => { close(); newTask(); } },
      { group: 'Actions', label: 'Aller à aujourd’hui', sub: formatDate(today, 'long'), icon: 'today', run: () => { close(); ui.set({ focusDate: today }); ui.go('annee'); } },
      { group: 'Actions', label: 'Imprimer le planning annuel A0', icon: 'printer', run: () => { close(); ui.go('impression'); } },
    ];
    const nav: Item[] = NAV.map((n) => ({ group: 'Navigation', label: n.label, icon: n.icon, run: () => { close(); ui.go(n.route); } }));
    if (!q.trim()) return [...actions, ...nav];
    out.push(...[...actions, ...nav].filter((i) => matchScore(q, [i.label]) > 0));
    const r = searchAll(q, { events, tasks, courses: snap?.courses ?? [] });
    for (const e of r.events) out.push({ group: 'Événements', label: e.title, sub: formatRange(e.startDate, e.endDate), icon: 'layers', run: () => { close(); ui.go('projets', { eventId: e.id }); } });
    for (const t of r.tasks) out.push({ group: 'Tâches', label: t.title, sub: t.dueDate ? `Échéance ${formatDate(t.dueDate, 'medium')}` : undefined, icon: 'tasks', run: () => { close(); openTask(t.id); } });
    for (const th of r.themes) out.push({ group: 'Thèmes de formation', label: th.theme, sub: `${th.count} formation(s), filtrer le calendrier`, icon: 'course', run: () => { close(); ui.set({ filters: { ...DEFAULT_FILTERS, theme: th.theme } as CalFilters }); ui.go('calendrier'); } });
    for (const c of r.courses) out.push({ group: 'Formations', label: c.title, sub: `${c.theme}, ${formatRange(c.startDate, c.endDate)}`, icon: 'course', run: () => { close(); void ui.openPanel({ kind: 'course', id: c.id }); } });
    for (const l of r.locations) out.push({ group: 'Lieux', label: l.location, sub: 'Filtrer le calendrier sur ce lieu', icon: 'pin', run: () => { close(); ui.set({ filters: { ...DEFAULT_FILTERS, location: l.location.split(',')[0] } }); ui.go('calendrier'); } });
    void openEvent;
    return out;
  }, [q, events, tasks, snap, today]);

  if (!open) return null;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); ui.set({ palette: false }); }
  };
  let lastGroup = '';
  return (
    <div className="palette-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) ui.set({ palette: false }); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Recherche globale">
        <div className="palette-input"><Icon name="search" size={18} />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} placeholder="Rechercher événements, tâches, formations, thèmes, lieux…" aria-label="Recherche" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={`pi-${active}`} />
          <kbd>Échap</kbd>
        </div>
        <div className="palette-list" id="palette-list" role="listbox">
          {items.length ? items.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={`${it.group}-${i}`}>
                {head ? <div className="palette-group">{head}</div> : null}
                <button type="button" id={`pi-${i}`} role="option" aria-selected={i === active} className={i === active ? 'is-active' : ''} onMouseEnter={() => setActive(i)} onClick={it.run}>
                  <Icon name={it.icon} size={16} /><span className="pl-label">{it.label}</span>{it.sub ? <span className="pl-sub">{it.sub}</span> : null}
                </button>
              </div>
            );
          }) : <p className="muted pad">Aucun résultat pour « {q} ».</p>}
        </div>
        <div className="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span><span><kbd>Entrée</kbd> ouvrir</span><span><kbd>N</kbd> événement, <kbd>A</kbd> tâche, <kbd>.</kbd> aujourd’hui</span></div>
      </div>
    </div>
  );
}
