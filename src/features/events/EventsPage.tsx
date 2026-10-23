import { useMemo, useState } from 'react';
import { downloadChecklist, eventMenu, newEvent, newTask, run } from '../../app/actions';
import { useLookups } from '../../app/derived';
import { useAppState, useStore } from '../../app/store';
import { addMonths, capitalize, formatDate, formatRange, formatTimestamp, startOfMonth } from '../../domain/dates';
import { computeProgress, isDone, isOverdue, templateById } from '../../domain/planning';
import { describeRecurrence, expandEvent, findOccurrence, nextOccurrence } from '../../domain/recurrence';
import { CATEGORY_LABEL, EVENT_STATUSES, EVENT_STATUS_LABEL, PRIORITY_LABEL, uid } from '../../domain/reference';
import { matchScore } from '../../domain/search';
import type { EventStatus, ISODate, PlanningEvent, Task } from '../../domain/types';
import { Icon } from '../../ui/icons';
import { Badge, Button, Empty, IconButton, MemberTag, Progress, Segmented, Select, Toggle } from '../../ui/kit';
import { menuAt } from '../../ui/overlays';
import { ui, useUI } from '../../ui/uiStore';
import { Gantt, GanttGroup } from '../gantt/Gantt';
import { TaskList } from '../tasks/TasksPage';

const STATUS_TONE: Record<EventStatus, 'neutral' | 'blue' | 'green' | 'amber' | 'red'> = {
  planifie: 'neutral', en_preparation: 'amber', confirme: 'blue', termine: 'green', annule: 'red',
};

export function EventsPage() {
  const eventId = useUI((s) => s.eventId);
  if (eventId) return <EventDetail id={eventId} />;
  return <EventsList />;
}

function EventsList() {
  const events = useAppState((s) => s.events);
  const today = useAppState((s) => s.today);
  const { tasksByEvent, memberById, team, tasks } = { ...useLookups(), tasks: useAppState((s) => s.tasks) };
  const [view, setView] = useState<'liste' | 'gantt'>('liste');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'' | 'evenement' | 'projet'>('');
  const [status, setStatus] = useState('');
  const [owner, setOwner] = useState('');
  const [archived, setArchived] = useState(false);

  const filtered = useMemo(() => events.filter((e) =>
    (archived || !e.archived) && (!kind || e.kind === kind) && (!status || e.status === status) && (!owner || e.ownerId === owner)
    && (!q.trim() || matchScore(q, [e.title, e.location, e.description, CATEGORY_LABEL[e.category]]) > 0)), [events, archived, kind, status, owner, q]);

  const sortKey = (e: PlanningEvent) => (e.recurrence ? nextOccurrence(e, today)?.startDate ?? e.startDate : e.startDate);
  const current = filtered.filter((e) => !e.archived && (e.endDate >= today || (e.recurrence && nextOccurrence(e, today)))).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const past = filtered.filter((e) => !e.archived && !current.includes(e)).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const arch = filtered.filter((e) => e.archived);

  const groups: GanttGroup[] = filtered.filter((e) => !e.archived).sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((e) => ({ id: e.id, title: e.title, start: e.startDate, end: e.endDate, kind: e.kind, tasks: tasksByEvent.get(e.id) ?? [] }))
    .filter((g) => g.tasks.length);

  const Row = ({ e }: { e: PlanningEvent }) => {
    const ts = tasksByEvent.get(e.id) ?? [];
    const p = computeProgress(ts, today);
    const next = e.recurrence ? nextOccurrence(e, today) : null;
    return (
      <div className={`erow erow-${e.kind}`} onContextMenu={(ev) => menuAt(ev, eventMenu(e))}>
        <button type="button" className="erow-main" onClick={() => ui.go('projets', { eventId: e.id })}>
          <span className="erow-title">{e.title}{e.recurrence ? <Icon name="repeat" size={14} className="dev-rec" /> : null}</span>
          <span className="erow-meta">
            <span>{e.kind === 'projet' ? 'Projet' : CATEGORY_LABEL[e.category]}</span>
            <span>{next && next.startDate !== e.startDate ? `Prochaine : ${formatDate(next.startDate, 'medium')}` : formatRange(e.startDate, e.endDate)}</span>
            {e.location ? <span>{e.location}</span> : null}
          </span>
        </button>
        <MemberTag member={memberById.get(e.ownerId ?? '')} />
        <span className="erow-progress">
          {ts.length ? <><Progress value={p.pct} tone={p.overdue ? 'warn' : p.pct === 100 ? 'ok' : undefined} /><span>{p.done}/{p.total}</span></> : <span className="muted">Aucune tâche</span>}
          {p.overdue ? <Badge tone="red">{p.overdue} en retard</Badge> : null}
        </span>
        <Badge tone={STATUS_TONE[e.status]}>{EVENT_STATUS_LABEL[e.status]}</Badge>
        <IconButton icon="more" label={`Actions pour ${e.title}`} onClick={(ev) => menuAt(ev, eventMenu(e))} />
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-tools">
        <div className="search-input"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un projet, un lieu…" aria-label="Rechercher" /></div>
        <Select value={kind} onChange={setKind} ariaLabel="Type" options={[{ value: '', label: 'Projets et événements' }, { value: 'projet', label: 'Projets' }, { value: 'evenement', label: 'Événements' }]} />
        <Select value={status} onChange={setStatus} ariaLabel="Statut" options={[{ value: '', label: 'Tous les statuts' }, ...EVENT_STATUSES.map((s) => ({ value: s, label: EVENT_STATUS_LABEL[s] }))]} />
        <Select value={owner} onChange={setOwner} ariaLabel="Responsable" options={[{ value: '', label: 'Tous les responsables' }, ...team.map((m) => ({ value: m.id, label: m.code }))]} />
        <Toggle checked={archived} onChange={setArchived} label="Archivés" />
        <span className="spacer" />
        <Segmented ariaLabel="Affichage" size="sm" value={view} onChange={setView} options={[{ value: 'liste', label: 'Liste', icon: 'list' }, { value: 'gantt', label: 'Gantt', icon: 'gantt' }]} />
      </div>
      {view === 'gantt' ? (
        <Gantt groups={groups} loose={tasks.filter((t) => !t.eventId && (t.startDate || t.dueDate))} initialStart={startOfMonth(addMonths(today, -1))} />
      ) : !filtered.length ? (
        <Empty icon="layers" title={q || kind || status || owner ? 'Aucun résultat avec ces filtres' : 'Aucun projet ni événement'} action={<Button variant="primary" icon="plus" onClick={() => newEvent()}>Nouvel événement</Button>}>
          Créez un événement à partir d’un modèle pour générer ses tâches de préparation.
        </Empty>
      ) : (
        <div className="elist">
          {current.length ? <><h3 className="list-head">En cours et à venir <span>{current.length}</span></h3>{current.map((e) => <Row key={e.id} e={e} />)}</> : null}
          {past.length ? <><h3 className="list-head">Passés <span>{past.length}</span></h3>{past.map((e) => <Row key={e.id} e={e} />)}</> : null}
          {arch.length ? <><h3 className="list-head">Archivés <span>{arch.length}</span></h3>{arch.map((e) => <Row key={e.id} e={e} />)}</> : null}
        </div>
      )}
    </div>
  );
}

type Tab = 'apercu' | 'planning' | 'taches' | 'equipe' | 'documents' | 'historique';

function EventDetail({ id }: { id: string }) {
  const store = useStore();
  const ev = useAppState((s) => s.events.find((e) => e.id === id));
  const today = useAppState((s) => s.today);
  const { tasksByEvent, memberById } = useLookups();
  const [tab, setTab] = useState<Tab>('apercu');
  if (!ev) return <div className="page"><Empty title="Événement introuvable" action={<Button onClick={() => ui.go('projets')}>Retour à la liste</Button>}>Il a peut-être été supprimé.</Empty></div>;
  const tasks = tasksByEvent.get(ev.id) ?? [];
  const p = computeProgress(tasks, today);
  const next = ev.recurrence ? nextOccurrence(ev, today) : null;
  const owner = memberById.get(ev.ownerId ?? '');
  const tabs: { value: Tab; label: string }[] = [
    { value: 'apercu', label: 'Vue d’ensemble' }, { value: 'planning', label: 'Planning' }, { value: 'taches', label: `Tâches (${tasks.length})` },
    { value: 'equipe', label: 'Équipe' }, { value: 'documents', label: `Documents (${ev.attachments.length})` }, { value: 'historique', label: 'Historique' },
  ];
  return (
    <div className="page detail">
      <button type="button" className="btn btn-quiet btn-sm back-link" onClick={() => ui.go('projets')}><Icon name="back" size={15} /><span>Projets et événements</span></button>
      <header className="detail-head">
        <div>
          <p className="pv-kicker">{ev.kind === 'projet' ? 'Projet' : CATEGORY_LABEL[ev.category]}{ev.archived ? ', archivé' : ''}</p>
          <h1 className="detail-title">{ev.title}</h1>
          <p className="detail-meta">
            <span><Icon name="calendar" size={15} />{formatRange(ev.startDate, ev.endDate)}{ev.startTime ? `, ${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ''}` : ''}</span>
            {ev.location ? <span><Icon name="pin" size={15} />{ev.location}</span> : null}
            {ev.recurrence ? <span><Icon name="repeat" size={15} />{describeRecurrence(ev.recurrence, ev.startDate)}</span> : null}
          </p>
        </div>
        <div className="detail-actions">
          <Badge tone={STATUS_TONE[ev.status]}>{EVENT_STATUS_LABEL[ev.status]}</Badge>
          <Button icon="edit" disabled={!store.can('event.write')} onClick={() => void ui.openPanel({ kind: 'eventForm', id: ev.id })}>{ev.recurrence ? 'Modifier la série' : 'Modifier'}</Button>
          <Button icon="plus" variant="primary" disabled={!store.can('task.write')} onClick={() => newTask({ eventId: ev.id, occurrenceKey: next?.key ?? null, dueDate: next?.startDate ?? ev.startDate })}>Tâche</Button>
          <IconButton icon="more" label="Plus d’actions" onClick={(e) => menuAt(e, eventMenu(ev, next?.key))} />
        </div>
      </header>
      <div className="tabs" role="tablist" aria-label="Sections de l’événement">
        {tabs.map((t) => <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} className={tab === t.value ? 'is-on' : ''} onClick={() => setTab(t.value)}>{t.label}</button>)}
      </div>
      {tab === 'apercu' ? (
        <div className="overview">
          <section className="ov-main">
            <dl className="facts">
              <div><dt>Responsable</dt><dd><MemberTag member={owner} />{owner ? ` ${owner.label}` : ''}</dd></div>
              <div><dt>Organisateur</dt><dd>{ev.organizer || '—'}</dd></div>
              <div><dt>Priorité</dt><dd>{PRIORITY_LABEL[ev.priority]}</dd></div>
              <div><dt>Modèle</dt><dd>{templateById(ev.templateId)?.name ?? 'Aucun'}</dd></div>
              {next ? <div><dt>Prochaine occurrence</dt><dd>{capitalize(formatDate(next.startDate, 'long'))}</dd></div> : null}
            </dl>
            {ev.description ? <p className="prose">{ev.description}</p> : <p className="muted">Pas de description.</p>}
            {ev.notes ? <div className="notes"><h4>Notes</h4><p className="prose">{ev.notes}</p></div> : null}
            {ev.recurrence ? <Occurrences ev={ev} /> : null}
          </section>
          <aside className="ov-side">
            <div className="stat-block">
              <span className="stat-label">Avancement</span>
              <span className="stat-value">{p.pct} %</span>
              <Progress value={p.pct} tone={p.overdue ? 'warn' : p.pct === 100 ? 'ok' : undefined} />
              <span className="stat-sub">{p.done} terminée{p.done > 1 ? 's' : ''} sur {p.total}{p.overdue ? `, ${p.overdue} en retard` : ''}</span>
            </div>
            <div className="side-actions">
              <Button icon="printer" onClick={() => void downloadChecklist(ev.id, next?.key ?? null)}>Checklist A4 (PDF)</Button>
              <Button icon="gantt" onClick={() => setTab('planning')}>Voir le planning</Button>
            </div>
            <h4 className="side-head">Prochaines échéances</h4>
            <ul className="mini-list">
              {tasks.filter((t) => !isDone(t) && t.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)).slice(0, 5).map((t) => (
                <li key={t.id}><button type="button" onClick={() => void ui.openPanel({ kind: 'task', id: t.id })}>
                  <span className={isOverdue(t, today) ? 'late' : ''}>{formatDate(t.dueDate, 'dayMonth')}</span>{t.title}</button></li>
              ))}
              {!tasks.some((t) => !isDone(t)) ? <li className="muted">Aucune tâche ouverte.</li> : null}
            </ul>
          </aside>
        </div>
      ) : tab === 'planning' ? (
        <Gantt groups={[{ id: ev.id, title: ev.title, start: ev.startDate, end: ev.endDate, kind: ev.kind, tasks }]} initialStart={startOfMonth(addMonths(tasks.map((t) => t.startDate ?? t.dueDate ?? '9999').sort()[0] < today ? today : (tasks.map((t) => t.startDate ?? t.dueDate ?? '9999').sort()[0] ?? today), -1))} />
      ) : tab === 'taches' ? (
        <TaskList tasks={tasks} eventId={ev.id} defaultOccurrence={next?.key ?? null} showQuickAdd />
      ) : tab === 'equipe' ? (
        <TeamTab tasks={tasks} ownerId={ev.ownerId ?? null} />
      ) : tab === 'documents' ? (
        <Documents ev={ev} />
      ) : (
        <ul className="history">
          {[...ev.history].reverse().map((h, i) => (
            <li key={i}><span className="h-when">{formatTimestamp(h.at)}</span><span className="h-who">{memberById.get(h.by ?? '')?.code ?? 'Système'}</span><span>{h.text}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Occurrences({ ev }: { ev: PlanningEvent }) {
  const store = useStore();
  const today = useAppState((s) => s.today);
  const tasks = useAppState((s) => s.tasks);
  const list = expandEvent(ev, `${Number(today.slice(0, 4)) - 1}-01-01`, `${Number(today.slice(0, 4)) + 2}-12-31`).slice(0, 18);
  const tpl = templateById(ev.templateId);
  const allKeys = new Set<ISODate>();
  for (const k of Object.keys(ev.exceptions)) allKeys.add(k);
  return (
    <div className="occ">
      <h4>Occurrences</h4>
      <ul>
        {list.map((o) => {
          const prepared = tasks.filter((t) => t.eventId === ev.id && t.occurrenceKey === o.key).length;
          return (
            <li key={o.key} className={o.endDate < today ? 'is-past' : ''}>
              <span className="occ-date">{formatDate(o.startDate, 'weekdayDayMonth')} {o.startDate.slice(0, 4)}</span>
              {o.modified ? <Badge tone="amber">modifiée</Badge> : null}
              {prepared ? <Badge tone="teal">{prepared} tâches</Badge> : null}
              <span className="spacer" />
              {tpl && !prepared && o.startDate >= today ? (
                <Button size="sm" disabled={!store.can('task.write')} onClick={() => void run(() => store.generateOccurrencePrep(ev.id, { key: o.key, startDate: o.startDate })).then((n) => n && ui.toast(`${n} tâches de préparation créées pour le ${formatDate(o.startDate, 'medium')}`, 'success'))}>Préparer</Button>
              ) : null}
              <IconButton icon="edit" label={`Modifier l’occurrence du ${formatDate(o.startDate, 'long')}`} disabled={!store.can('event.write') || o.endDate < today} onClick={() => void ui.openPanel({ kind: 'eventForm', id: ev.id, occurrenceKey: o.key })} />
              <IconButton icon="x" label={`Annuler l’occurrence du ${formatDate(o.startDate, 'long')}`} disabled={!store.can('event.write') || o.endDate < today} onClick={async () => {
                if (await ui.confirm({ title: `Annuler l’occurrence du ${formatDate(o.startDate, 'long')} ?`, body: 'Les autres occurrences ne sont pas modifiées.', confirmLabel: 'Annuler l’occurrence', cancelLabel: 'Garder', danger: true })) {
                  await run(() => store.saveOccurrence(ev.id, o.key, { cancelled: true }), 'Occurrence annulée');
                }
              }} />
            </li>
          );
        })}
      </ul>
      {[...allKeys].some((k) => ev.exceptions[k]?.cancelled) ? <p className="form-note">{[...allKeys].filter((k) => ev.exceptions[k]?.cancelled).length} occurrence(s) annulée(s) : {[...allKeys].filter((k) => ev.exceptions[k]?.cancelled).map((k) => formatDate(k, 'medium')).join(', ')}.</p> : null}
      {tpl ? <p className="form-note">« Préparer » génère la chronologie du modèle « {tpl.name} » pour l’occurrence choisie.</p> : null}
    </div>
  );
}

function TeamTab({ tasks, ownerId }: { tasks: Task[]; ownerId: string | null }) {
  const { memberById, team } = useLookups();
  const today = useAppState((s) => s.today);
  const ids = new Set<string>([...(ownerId ? [ownerId] : []), ...tasks.map((t) => t.assigneeId).filter((x): x is string => !!x)]);
  const unassigned = tasks.filter((t) => !t.assigneeId && !isDone(t));
  return (
    <div className="team-tab">
      {[...ids].map((id) => {
        const m = memberById.get(id);
        const mine = tasks.filter((t) => t.assigneeId === id);
        const open = mine.filter((t) => !isDone(t));
        return (
          <div key={id} className="tt-row">
            <MemberTag member={m} /><span className="tt-label">{m?.label ?? 'Membre supprimé'}{id === ownerId ? ' (responsable)' : ''}</span>
            <span className="tt-count">{open.length} ouverte{open.length > 1 ? 's' : ''}{open.filter((t) => isOverdue(t, today)).length ? `, ${open.filter((t) => isOverdue(t, today)).length} en retard` : ''}</span>
            <Progress value={mine.length ? ((mine.length - open.length) / mine.length) * 100 : 0} />
          </div>
        );
      })}
      {unassigned.length ? <p className="warn-note"><Icon name="alert" size={15} />{unassigned.length} tâche{unassigned.length > 1 ? 's' : ''} sans responsable.</p> : null}
      {!ids.size ? <p className="muted">Personne n’est encore assigné. {team.length} membres disponibles.</p> : null}
    </div>
  );
}

function Documents({ ev }: { ev: PlanningEvent }) {
  const store = useStore();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const valid = (() => { try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } })();
  const add = async () => {
    if (!name.trim() || !valid) return;
    await run(() => store.updateEvent({ ...ev, attachments: [...ev.attachments, { id: uid('doc'), name: name.trim(), url: url.trim() }] }), 'Document ajouté');
    setName(''); setUrl('');
  };
  return (
    <div className="docs">
      <p className="form-note">Les documents sont référencés par lien (intranet, Drive, SharePoint). Le stockage de fichiers est prévu avec Supabase Storage.</p>
      <ul className="doc-list">
        {ev.attachments.map((a) => (
          <li key={a.id}>
            <Icon name="link" size={16} /><a href={a.url} target="_blank" rel="noreferrer noopener">{a.name}</a>
            <IconButton icon="trash" label={`Retirer ${a.name}`} disabled={!store.can('event.write')} onClick={() => void run(() => store.updateEvent({ ...ev, attachments: ev.attachments.filter((x) => x.id !== a.id) }), 'Document retiré')} />
          </li>
        ))}
        {!ev.attachments.length ? <li className="muted">Aucun document lié.</li> : null}
      </ul>
      <form className="doc-add" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du document" aria-label="Nom du document" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Adresse du document" type="url" />
        <Button type="submit" variant="secondary" disabled={!name.trim() || !valid || !store.can('event.write')}>Ajouter le lien</Button>
      </form>
    </div>
  );
}

/** Compact event view in the side panel (from calendar or search). */
export function EventPanel({ id, occurrenceKey }: { id: string; occurrenceKey?: ISODate | null }) {
  const store = useStore();
  const ev = useAppState((s) => s.events.find((e) => e.id === id));
  const today = useAppState((s) => s.today);
  const { tasksByEvent, memberById } = useLookups();
  if (!ev) return <Empty title="Événement introuvable">Il a peut-être été supprimé.</Empty>;
  const occ = occurrenceKey && ev.recurrence ? findOccurrence(ev, occurrenceKey) : null;
  const all = tasksByEvent.get(ev.id) ?? [];
  const tasks = ev.recurrence && occurrenceKey ? all.filter((t) => !t.occurrenceKey || t.occurrenceKey === occurrenceKey) : all;
  const p = computeProgress(tasks, today);
  const start = occ?.startDate ?? ev.startDate, end = occ?.endDate ?? ev.endDate;
  return (
    <div className="pv">
      <header className="pv-head">
        <p className="pv-kicker">{ev.kind === 'projet' ? 'Projet' : CATEGORY_LABEL[ev.category]}{occ?.modified ? ', occurrence modifiée' : ''}</p>
        <h2 className="pv-title">{occ?.title ?? ev.title}</h2>
        <p className="detail-meta">
          <span><Icon name="calendar" size={15} />{formatRange(start, end)}{(occ?.startTime ?? ev.startTime) ? `, ${occ?.startTime ?? ev.startTime}` : ''}</span>
          {(occ?.location ?? ev.location) ? <span><Icon name="pin" size={15} />{occ?.location ?? ev.location}</span> : null}
          {ev.recurrence ? <span><Icon name="repeat" size={15} />{describeRecurrence(ev.recurrence, ev.startDate)}</span> : null}
        </p>
        <div className="pv-actions">
          <Button variant="primary" size="sm" onClick={() => { void ui.closeAllPanels(); ui.go('projets', { eventId: ev.id }); }}>Ouvrir la fiche</Button>
          <Button size="sm" icon="edit" disabled={!store.can('event.write')} onClick={() => void ui.pushPanel({ kind: 'eventForm', id: ev.id, occurrenceKey: occ ? occ.key : null })}>{occ ? 'Modifier l’occurrence' : 'Modifier'}</Button>
          <IconButton icon="more" label="Plus d’actions" onClick={(e) => menuAt(e, eventMenu(ev, occurrenceKey))} />
        </div>
      </header>
      <dl className="facts facts-tight">
        <div><dt>Statut</dt><dd><Badge tone={STATUS_TONE[ev.status]}>{EVENT_STATUS_LABEL[ev.status]}</Badge></dd></div>
        <div><dt>Responsable</dt><dd><MemberTag member={memberById.get(ev.ownerId ?? '')} /></dd></div>
        <div><dt>Avancement</dt><dd className="inline-prog"><Progress value={p.pct} tone={p.overdue ? 'warn' : undefined} />{p.done}/{p.total}</dd></div>
      </dl>
      {occ?.notes || ev.description ? <p className="prose">{occ?.notes || ev.description}</p> : null}
      <TaskList tasks={tasks} eventId={ev.id} defaultOccurrence={ev.recurrence ? occurrenceKey ?? null : null} showQuickAdd compact />
    </div>
  );
}
