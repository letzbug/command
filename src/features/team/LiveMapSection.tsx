import { useEffect, useMemo, useState } from 'react';
import { useAppState, useStore } from '../../app/store';
import { addDays, capitalize, formatDate, formatRange, startOfWeek } from '../../domain/dates';
import { CATEGORY_LABEL } from '../../domain/reference';
import { buildPublicFeed } from '../../livemap/feed';
import { loadConfig, LiveMapConfig, saveConfig } from '../../livemap/config';
import { hasGeometry } from '../../livemap/geometry';
import { LiveMap } from '../../livemap/LiveMap';
import {
  courseActivities, eventActivities, groupByPlace, luxNow, LuxNow, planningEventsToEventLike, summarize, unresolvedLocations, ViewMode, visibleActivities,
} from '../../livemap/model';
import { locationKey, matchPlace, PLACES } from '../../livemap/places';
import { isFramedHost, saveFile, saveMessage } from '../../services/fileSaver';
import { Icon } from '../../ui/icons';
import { Button, IconButton, Segmented, Select, Toggle } from '../../ui/kit';
import { ui, useUI } from '../../ui/uiStore';

const placeOptions = [
  { value: '', label: 'Choisir un lieu…' },
  { value: 'ignore', label: 'Ne pas afficher sur la carte' },
  ...[...PLACES].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map((p) => ({ value: p.id, label: p.kind === 'quartier' ? `${p.name} (Luxembourg)` : p.name })),
];

function useLuxClock(): LuxNow {
  const [now, setNow] = useState(luxNow());
  useEffect(() => {
    const id = setInterval(() => setNow((n) => { const x = luxNow(); return x.time === n.time && x.date === n.date ? n : x; }), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function LiveMapSection() {
  const store = useStore();
  const events = useAppState((s) => s.events);
  const snap = useAppState((s) => s.courseSnapshot);
  const focus = useUI((s) => s.focusDate);
  const now = useLuxClock();
  const day = focus ?? now.date;
  const [period, setPeriod] = useState<'jour' | 'semaine'>('jour');
  const [cfg, setCfg] = useState<LiveMapConfig>(loadConfig);
  const update = (c: LiveMapConfig) => { setCfg(c); if (!saveConfig(c)) ui.toast('Préférences de la carte non enregistrées (stockage local indisponible).', 'warning'); };
  const canPublish = store.can('event.write');

  const mode: ViewMode = period === 'semaine' ? 'semaine' : day === now.date && cfg.preferLive ? 'live' : 'jour';
  const from = period === 'semaine' ? startOfWeek(day) : day;
  const to = period === 'semaine' ? addDays(startOfWeek(day), 6) : day;

  const all = useMemo(() => [
    ...courseActivities(snap?.courses ?? [], from, to, cfg.placeOverrides),
    ...eventActivities(planningEventsToEventLike(events.filter((e) => !e.archived), from, to), from, to, cfg.placeOverrides),
  ], [snap, events, from, to, cfg.placeOverrides]);
  const visible = useMemo(() => visibleActivities(all, mode, day, now), [all, mode, day, now]);
  const groups = useMemo(() => groupByPlace(visible, mode), [visible, mode]);
  const summary = useMemo(() => summarize(visible, groups), [visible, groups]);
  const unresolved = useMemo(() => unresolvedLocations(visible), [visible]);

  const upcoming = useMemo(() => events
    .filter((e) => e.kind === 'evenement' && !e.archived && (e.endDate >= now.date || !!e.recurrence))
    .sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 40), [events, now.date]);

  const togglePublic = (id: string, on: boolean) => update({ ...cfg, publicEventIds: on ? [...new Set([...cfg.publicEventIds, id])] : cfg.publicEventIds.filter((x) => x !== id) });
  const assign = (locality: string, location: string, value: string) => {
    if (!value) return;
    update({ ...cfg, placeOverrides: { ...cfg.placeOverrides, [locationKey(locality, location)]: value } });
    ui.toast(value === 'ignore' ? 'Lieu masqué sur la carte' : `Lieu associé à ${PLACES.find((p) => p.id === value)?.name}`, 'success');
  };
  const exportFeed = async () => {
    const feed = buildPublicFeed(events, cfg.publicEventIds, cfg.placeOverrides, now.date);
    const m = saveMessage(await saveFile('carte-evenements.json', JSON.stringify(feed, null, 2), 'application/json'), `Flux public (${feed.events.length} occurrence${feed.events.length > 1 ? 's' : ''})`);
    ui.toast(m.text, m.tone);
  };
  const setDay = (d: string) => ui.set({ focusDate: d });
  const label = period === 'semaine' ? `Semaine du ${formatRange(from, to)}` : capitalize(formatDate(day, 'long'));

  return (
    <section className="lms" aria-label="UniPop Live Map">
      <div className="lms-head">
        <p className="lms-sub">Cours et événements par lieu, à la date sélectionnée dans le planning.</p>
        <div className="lms-tools">
          <a className="btn btn-secondary" href="carte.html" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir la carte en plein écran dans un nouvel onglet">Ouvrir la carte ↗</a>
          <IconButton icon="left" label={period === 'semaine' ? 'Semaine précédente' : 'Jour précédent'} onClick={() => setDay(addDays(day, period === 'semaine' ? -7 : -1))} />
          <span className="lms-date">{label}</span>
          <IconButton icon="right" label={period === 'semaine' ? 'Semaine suivante' : 'Jour suivant'} onClick={() => setDay(addDays(day, period === 'semaine' ? 7 : 1))} />
          <Button size="sm" variant="ghost" icon="today" onClick={() => setDay(now.date)}>Aujourd’hui</Button>
          <Segmented size="sm" ariaLabel="Période de la carte" value={period} onChange={setPeriod} options={[{ value: 'jour', label: 'Jour' }, { value: 'semaine', label: 'Semaine' }]} />
          {period === 'jour' && day === now.date ? <Toggle checked={cfg.preferLive} onChange={(v) => update({ ...cfg, preferLive: v })} label="En direct" /> : null}
        </div>
      </div>
      <p className="lms-mode">
        {mode === 'live' ? `En direct à ${now.time} : les activités terminées disparaissent automatiquement.`
          : mode === 'semaine' ? 'Synthèse de la semaine par lieu.'
          : day < now.date ? 'Bilan de la journée : toutes les activités de ce jour.' : 'Toutes les activités prévues ce jour.'}
      </p>
      <div className="lms-body">
        <a className="lms-map-link" href="carte.html" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir la carte en plein écran" title="Ouvrir la carte en plein écran">
          <LiveMap groups={groups} mode={mode} variant="planning" className="lms-map" />
        </a>
        <aside className="lms-side">
          <dl className="lms-stats">
            <div><dt>Cours en cours</dt><dd>{summary.coursEnCours}</dd></div>
            <div><dt>Cours à venir</dt><dd>{summary.coursAVenir}</dd></div>
            <div><dt>Événements actifs</dt><dd>{summary.evenementsActifs}</dd></div>
            <div><dt>Lieux actifs</dt><dd>{summary.lieuxActifs}</dd></div>
            <div><dt>À distance</dt><dd>{summary.aDistance}</dd></div>
            <div><dt>Non localisés</dt><dd className={summary.nonLocalises ? 'warn' : ''}>{summary.nonLocalises}</dd></div>
          </dl>
          {summary.prochain ? <p className="lms-next">Prochain début : <b>{summary.prochain.time}</b> {summary.prochain.title}, {summary.prochain.place}</p> : null}
          {!snap?.courses.length ? <p className="lms-note"><Icon name="info" size={15} />Aucune formation chargée : actualisez la source dans Formations.</p> : null}
          {!hasGeometry() ? <p className="lms-note"><Icon name="info" size={15} />Fond de carte officiel non installé : les lieux sont placés à leurs coordonnées réelles, sans limites communales. Voir docs/LIVE_MAP.md (npm run map:geodata).</p> : null}
          {unresolved.length ? (
            <div className="lms-unresolved">
              <h4>Lieux non localisés</h4>
              <p className="lms-note">Ces lieux ne sont pas affichés pour éviter une position fausse. Associez-les à un lieu connu.</p>
              {unresolved.slice(0, 8).map((u) => (
                <div key={`${u.locality}|${u.location}`} className="lms-unres-row">
                  <span><b>{u.location || '(sans nom)'}</b>{u.locality ? `, ${u.locality}` : ''} <small>{u.count} activité{u.count > 1 ? 's' : ''}</small></span>
                  <Select value="" onChange={(v) => assign(u.locality, u.location, v)} ariaLabel={`Associer ${u.location}`} options={placeOptions} />
                </div>
              ))}
            </div>
          ) : null}
        </aside>
      </div>

    </section>
  );
}
