import { DateFR } from '../../ui/DateFR';
import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteTasks, newTask, openEvent, run, setDone, taskMenu } from '../../app/actions';
import { useLookups } from '../../app/derived';
import { useAppState, useStore } from '../../app/store';
import { addDays, formatDate, formatTimestamp, isValidISODate, startOfWeek } from '../../domain/dates';
import { dependencyConflicts, isDone, isOverdue, validateDependencies } from '../../domain/planning';
import { nowStamp, PRIORITIES, PRIORITY_LABEL, PRIORITY_RANK, TASK_STATUSES, TASK_STATUS_LABEL, uid } from '../../domain/reference';
import { matchScore } from '../../domain/search';
import type { ISODate, Priority, Task, TaskStatus } from '../../domain/types';
import { Icon } from '../../ui/icons';
import { Badge, Button, Empty, Field, IconButton, MemberTag, Progress, Segmented, Select, Toggle, memberDisplayName } from '../../ui/kit';
import { menuAt } from '../../ui/overlays';
import { ui, useUI } from '../../ui/uiStore';

const STATUS_TONE: Record<TaskStatus, 'neutral' | 'blue' | 'amber' | 'green'> = { a_faire: 'neutral', en_cours: 'blue', en_attente: 'amber', termine: 'green' };
type SortKey = 'echeance' | 'priorite' | 'titre' | 'statut';

function sortTasks(list: Task[], key: SortKey) {
  const s = [...list];
  if (key === 'echeance') s.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  if (key === 'priorite') s.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  if (key === 'titre') s.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  if (key === 'statut') s.sort((a, b) => TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status));
  return s;
}

export function TasksPage() {
  const tasks = useAppState((s) => s.tasks);
  const today = useAppState((s) => s.today);
  const me = useAppState((s) => s.settings.currentUserId);
  const view = useUI((s) => s.taskView);
  const { eventById } = useLookups();
  const wk = startOfWeek(today);
  const views: { value: string; label: string; filter: (t: Task) => boolean }[] = [
    { value: 'toutes', label: 'Toutes', filter: (t) => !isDone(t) },
    { value: 'miennes', label: 'Mes tâches', filter: (t) => !isDone(t) && t.assigneeId === me },
    { value: 'evenement', label: 'Par événement', filter: (t) => !isDone(t) },
    { value: 'retard', label: 'En retard', filter: (t) => isOverdue(t, today) },
    { value: 'semaine', label: 'Cette semaine', filter: (t) => !isDone(t) && !!t.dueDate && t.dueDate >= wk && t.dueDate <= addDays(wk, 6) },
    { value: 'terminees', label: 'Terminées', filter: (t) => isDone(t) },
  ];
  const current = views.find((v) => v.value === view) ?? views[0];
  const list = tasks.filter(current.filter);
  return (
    <div className="page">
      <div className="tabs" role="tablist" aria-label="Vues des tâches">
        {views.map((v) => (
          <button key={v.value} type="button" role="tab" aria-selected={current.value === v.value} className={current.value === v.value ? 'is-on' : ''} onClick={() => ui.set({ taskView: v.value })}>
            {v.label}<span className="tab-count">{tasks.filter(v.filter).length}</span>
          </button>
        ))}
      </div>
      <TaskList tasks={list} showQuickAdd={current.value !== 'terminees'} groupByEvent={current.value === 'evenement'} doneView={current.value === 'terminees'} eventById={eventById}
        emptyTitle={current.value === 'retard' ? 'Aucune tâche en retard' : current.value === 'miennes' && !me ? 'Aucun profil sélectionné' : 'Aucune tâche dans cette vue'} />
    </div>
  );
}

export function TaskList({ tasks, eventId, defaultOccurrence, showQuickAdd, groupByEvent, doneView, compact, emptyTitle }: {
  tasks: Task[]; eventId?: string; defaultOccurrence?: ISODate | null; showQuickAdd?: boolean; groupByEvent?: boolean; doneView?: boolean;
  compact?: boolean; emptyTitle?: string; eventById?: Map<string, unknown>;
}) {
  const store = useStore();
  const today = useAppState((s) => s.today);
  const { memberById, eventById, activeTeam, team } = useLookups();
  const events = useAppState((s) => s.events);
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [status, setStatus] = useState('');
  const [prio, setPrio] = useState('');
  const [sort, setSort] = useState<SortKey>(doneView ? 'titre' : 'echeance');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [qa, setQa] = useState({ title: '', due: '', who: '', ev: eventId ?? '' });
  const qaRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    let l = tasks.filter((t) => (!who || (who === '__none' ? !t.assigneeId : t.assigneeId === who)) && (!status || t.status === status) && (!prio || t.priority === prio)
      && (!q.trim() || matchScore(q, [t.title, t.description, eventById.get(t.eventId ?? '')?.title]) > 0));
    l = doneView ? [...l].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')) : sortTasks(l, sort);
    return l;
  }, [tasks, who, status, prio, q, sort, doneView, eventById]);
  useEffect(() => { setSel((s) => new Set([...s].filter((id) => visible.some((t) => t.id === id)))); }, [visible]);

  const addQuick = async () => {
    const title = qa.title.trim();
    if (!title) return;
    if (qa.due && !isValidISODate(qa.due)) return ui.toast('Date d’échéance invalide.', 'error');
    const t = store.newTaskDraft({
      title, eventId: qa.ev || null, occurrenceKey: qa.ev && qa.ev === eventId ? defaultOccurrence ?? null : null,
      assigneeId: qa.who || null, dueDate: qa.due || null, startDate: qa.due || null,
    });
    const saved = await run(() => store.saveTask(t));
    if (saved) {
      ui.toast(`Tâche ajoutée${saved.assigneeId ? ` et assignée à ${memberDisplayName(memberById.get(saved.assigneeId))}` : ''}`, 'success');
      setQa({ ...qa, title: '' });
      qaRef.current?.focus();
    }
  };

  const ids = [...sel];
  const groups = groupByEvent
    ? [...new Set(visible.map((t) => t.eventId ?? ''))].map((k) => ({ key: k, title: k ? eventById.get(k)?.title ?? 'Événement supprimé' : 'Hors projet', items: visible.filter((t) => (t.eventId ?? '') === k) }))
    : [{ key: 'all', title: '', items: visible }];

  return (
    <div className={`tlist ${compact ? 'is-compact' : ''}`}>
      {!compact ? (
        <div className="page-tools">
          <div className="search-input"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une tâche…" aria-label="Rechercher une tâche" /></div>
          <Select value={who} onChange={setWho} ariaLabel="Responsable" options={[{ value: '', label: 'Tous les responsables' }, { value: '__none', label: 'Non assignées' }, ...team.map((m) => ({ value: m.id, label: m.code }))]} />
          {!doneView ? <Select value={status} onChange={setStatus} ariaLabel="Statut" options={[{ value: '', label: 'Tous les statuts' }, ...TASK_STATUSES.filter((s) => s !== 'termine').map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))]} /> : null}
          <Select value={prio} onChange={setPrio} ariaLabel="Priorité" options={[{ value: '', label: 'Toutes priorités' }, ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))]} />
          {!doneView ? <Select value={sort} onChange={setSort} ariaLabel="Trier" options={[{ value: 'echeance', label: 'Tri : échéance' }, { value: 'priorite', label: 'Tri : priorité' }, { value: 'titre', label: 'Tri : titre' }, { value: 'statut', label: 'Tri : statut' }]} /> : null}
        </div>
      ) : null}

      {showQuickAdd && store.can('task.write') ? (
        <form className="quickadd" onSubmit={(e) => { e.preventDefault(); void addQuick(); }}>
          <Icon name="plus" size={17} />
          <input ref={qaRef} value={qa.title} onChange={(e) => setQa({ ...qa, title: e.target.value })} placeholder="Ajouter une tâche puis Entrée" aria-label="Titre de la nouvelle tâche" />
          <DateFR value={qa.due} onChange={(v) => setQa({ ...qa, due: v })} ariaLabel="Échéance" />
          <Select value={qa.who} onChange={(v) => setQa({ ...qa, who: v })} ariaLabel="Responsable de la nouvelle tâche" options={[{ value: '', label: 'Responsable' }, ...activeTeam.map((m) => ({ value: m.id, label: m.code }))]} />
          {!eventId ? <Select value={qa.ev} onChange={(v) => setQa({ ...qa, ev: v })} ariaLabel="Événement de la nouvelle tâche" options={[{ value: '', label: 'Sans événement' }, ...events.filter((e) => !e.archived).map((e) => ({ value: e.id, label: e.title }))]} /> : null}
          <Button type="submit" variant="primary" size="sm" disabled={!qa.title.trim()}>Ajouter</Button>
        </form>
      ) : null}

      {ids.length ? (
        <div className="bulkbar" role="region" aria-label="Actions groupées">
          <b>{ids.length} sélectionnée{ids.length > 1 ? 's' : ''}</b>
          <Button size="sm" icon="checkCircle" onClick={() => void setDone(ids, true).then(() => setSel(new Set()))}>Terminer</Button>
          <Select value="" onChange={(v) => v && void run(() => store.setTaskStatus(ids, v as TaskStatus), 'Statut mis à jour')} ariaLabel="Changer le statut" options={[{ value: '', label: 'Statut…' }, ...TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))]} />
          <Select value="" onChange={(v) => v && void run(() => store.assignTasks(ids, v === '__none' ? null : v), 'Responsable mis à jour')} ariaLabel="Assigner" options={[{ value: '', label: 'Assigner à…' }, { value: '__none', label: 'Personne' }, ...activeTeam.map((m) => ({ value: m.id, label: m.code }))]} />
          <Button size="sm" variant="danger" icon="trash" onClick={() => void deleteTasks(ids).then((ok) => ok && setSel(new Set()))}>Supprimer</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Désélectionner</Button>
        </div>
      ) : null}

      {visible.length ? groups.map((g) => (
        <div key={g.key} className="tgroup-block">
          {groupByEvent ? (
            <h3 className="list-head">{g.key ? <button type="button" onClick={() => openEvent(g.key)}>{g.title}</button> : g.title}<span>{g.items.length}</span></h3>
          ) : null}
          <div className="trows" role="list">
            {g.items.map((t) => {
              const late = isOverdue(t, today);
              const ev = t.eventId ? eventById.get(t.eventId) : null;
              return (
                <div key={t.id} role="listitem" className={`trow ${late ? 'is-late' : ''} ${isDone(t) ? 'is-done' : ''} ${sel.has(t.id) ? 'is-selected' : ''}`} onContextMenu={(e) => menuAt(e, taskMenu(t))}>
                  {!compact ? <input type="checkbox" className="trow-select" checked={sel.has(t.id)} aria-label={`Sélectionner ${t.title}`}
                    onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(t.id); else n.delete(t.id); setSel(n); }} /> : null}
                  <button type="button" className="check" aria-label={isDone(t) ? `Rouvrir ${t.title}` : `Terminer ${t.title}`} aria-pressed={isDone(t)} disabled={!store.can('task.write')} onClick={() => void setDone([t.id], !isDone(t))}>
                    <Icon name={isDone(t) ? 'checkCircle' : 'circle'} size={19} />
                  </button>
                  <button type="button" className="trow-main" onClick={() => void (compact ? ui.pushPanel({ kind: 'task', id: t.id }) : ui.openPanel({ kind: 'task', id: t.id }))}>
                    <span className="trow-title">{t.milestone ? <Icon name="diamond" size={13} className="ms-icon" /> : null}{t.title}</span>
                    {ev && !eventId && !groupByEvent ? <span className="trow-ev">{ev.title}</span> : null}
                  </button>
                  {t.checklist.length ? <span className="trow-chk" title="Liste de contrôle">{t.checklist.filter((c) => c.done).length}/{t.checklist.length}</span> : null}
                  <MemberTag member={memberById.get(t.assigneeId ?? '')} />
                  <span className={`trow-due ${late ? 'late' : ''}`}>{t.dueDate ? formatDate(t.dueDate, 'dayMonth') : '—'}</span>
                  {!compact ? <span className={`prio prio-${t.priority}`} title={`Priorité ${PRIORITY_LABEL[t.priority].toLowerCase()}`}>{PRIORITY_LABEL[t.priority]}</span> : null}
                  <Badge tone={STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
                  <IconButton icon="more" label={`Actions pour ${t.title}`} onClick={(e) => menuAt(e, taskMenu(t))} />
                </div>
              );
            })}
          </div>
        </div>
      )) : (
        <Empty icon="tasks" title={tasks.length ? 'Aucune tâche ne correspond à ces filtres' : emptyTitle ?? 'Aucune tâche'}
          action={!tasks.length && store.can('task.write') && !showQuickAdd ? <Button icon="plus" onClick={() => newTask({ eventId: eventId ?? null })}>Nouvelle tâche</Button> : undefined}>
          {tasks.length ? 'Modifiez la recherche ou les filtres.' : showQuickAdd ? 'Utilisez le champ ci-dessus pour ajouter la première tâche.' : null}
        </Empty>
      )}
    </div>
  );
}

/* ---------------- Task panel (create / edit) ---------------- */

export function TaskPanel({ id, defaults }: { id?: string | null; defaults?: Partial<Task> }) {
  const store = useStore();
  const existing = useAppState((s) => (id ? s.tasks.find((t) => t.id === id) : undefined));
  const tasks = useAppState((s) => s.tasks);
  const events = useAppState((s) => s.events);
  const today = useAppState((s) => s.today);
  const { memberById, activeTeam, taskById, eventById } = useLookups();
  const initial = useMemo(() => existing ?? store.newTaskDraft(defaults), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [t, setT] = useState<Task>(initial);
  const [touched, setTouched] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [comment, setComment] = useState('');
  const [showHist, setShowHist] = useState(false);
  const canWrite = store.can('task.write');
  const dirty = JSON.stringify(t) !== JSON.stringify(initial);
  useEffect(() => { ui.setCloseGuard(() => dirty); return () => ui.setCloseGuard(null); }, [dirty]);
  useEffect(() => { if (existing && !dirty) setT(existing); }, [existing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (id && !existing) return <Empty title="Tâche introuvable">Elle a peut-être été supprimée.</Empty>;
  const set = (p: Partial<Task>) => setT((x) => ({ ...x, ...p }));
  const errors: Record<string, string> = {};
  if (!t.title.trim()) errors.title = 'Le titre est obligatoire.';
  if (t.startDate && !isValidISODate(t.startDate)) errors.startDate = 'Date invalide.';
  if (t.dueDate && !isValidISODate(t.dueDate)) errors.dueDate = 'Date invalide.';
  if (t.startDate && t.dueDate && t.dueDate < t.startDate) errors.dueDate = 'L’échéance doit suivre le début.';
  const depErr = validateDependencies(t.id, t.dependsOn, [...tasks.filter((x) => x.id !== t.id), t]);
  if (depErr) errors.deps = depErr;
  const conflicts = dependencyConflicts(t, taskById);
  const candidates = tasks.filter((x) => x.id !== t.id && (t.eventId ? x.eventId === t.eventId : !x.eventId)).sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'));
  const err = (k: string) => (touched ? errors[k] : null);

  async function save(close = true) {
    setTouched(true);
    if (Object.keys(errors).length) return false;
    const datesChanged = !!existing && (existing.startDate !== t.startDate || existing.dueDate !== t.dueDate);
    const saved = await run(() => store.saveTask({ ...t, title: t.title.trim() }, { datesEditedByHand: datesChanged }));
    if (!saved) return false;
    ui.toast(existing ? 'Tâche enregistrée' : 'Tâche créée', 'success');
    ui.setCloseGuard(null);
    if (close) await ui.closePanel(); else setT(saved);
    return true;
  }
  async function addComment() {
    if (!comment.trim() || !existing) return;
    const c = { id: uid('cmt'), authorId: store.state.settings.currentUserId, text: comment.trim(), at: nowStamp() };
    const saved = await run(() => store.saveTask({ ...existing, comments: [...existing.comments, c] }));
    if (saved) { setComment(''); setT((x) => ({ ...x, comments: saved.comments, rev: saved.rev, updatedAt: saved.updatedAt, history: saved.history })); }
  }
  const ev = t.eventId ? eventById.get(t.eventId) : null;

  return (
    <form className="pv form" onSubmit={(e) => { e.preventDefault(); void save(); }} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); } }}>
      <header className="pv-head">
        <p className="pv-kicker">{existing ? (isOverdue(existing, today) ? 'Tâche en retard' : 'Tâche') : 'Nouvelle tâche'}{ev ? ` — ${ev.title}` : ''}</p>
        <input className="title-input" value={t.title} onChange={(e) => set({ title: e.target.value })} placeholder="Titre de la tâche" aria-label="Titre" autoFocus={!existing} readOnly={!canWrite} />
        {err('title') ? <span className="field-error">{err('title')}</span> : null}
        <Segmented ariaLabel="Statut" size="sm" value={t.status} onChange={(v) => set({ status: v, progress: v === 'termine' ? 100 : t.status === 'termine' ? Math.min(t.progress, 90) : t.progress, completedAt: v === 'termine' ? nowStamp() : null })}
          options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))} />
      </header>
      <div className="form-grid">
        <Field label="Événement ou projet">
          <Select value={t.eventId ?? ''} onChange={(v) => set({ eventId: v || null, occurrenceKey: null, dependsOn: [] })} ariaLabel="Événement" options={[{ value: '', label: 'Aucun (hors projet)' }, ...events.filter((e) => !e.archived || e.id === t.eventId).map((e) => ({ value: e.id, label: e.title }))]} />
        </Field>
        <Field label="Responsable">
          <Select value={t.assigneeId ?? ''} onChange={(v) => set({ assigneeId: v || null })} ariaLabel="Responsable" options={[{ value: '', label: 'Non assignée' }, ...activeTeam.map((m) => ({ value: m.id, label: `${memberDisplayName(m)}` }))]} />
        </Field>
        <Field label="Début" error={err('startDate')}><DateFR value={t.startDate ?? ''} onChange={(v) => set({ startDate: v || null })} /></Field>
        <Field label="Échéance" error={err('dueDate')} hint={t.offsetDays != null ? (t.manualDates ? 'Date ajustée à la main : non recalculée automatiquement.' : `Relative à l’événement (J${t.offsetDays >= 0 ? '+' : ''}${t.offsetDays}).`) : undefined}>
          <DateFR value={t.dueDate ?? ''} onChange={(v) => set({ dueDate: v || null })} />
        </Field>
        <Field label="Priorité">
          <Select value={t.priority} onChange={(v) => set({ priority: v as Priority })} ariaLabel="Priorité" options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
        </Field>
        <Field label={`Avancement : ${t.progress} %`}>
          <input type="range" min={0} max={100} step={5} value={t.progress} disabled={t.status === 'termine'} onChange={(e) => set({ progress: Number(e.target.value) })} />
        </Field>
        <div className="field field-wide"><Toggle checked={t.milestone} onChange={(v) => set({ milestone: v, startDate: v ? t.dueDate : t.startDate })} label="Jalon (point de contrôle daté)" /></div>
      </div>

      <fieldset className="form-section">
        <legend>Dépendances</legend>
        {candidates.length ? (
          <div className="dep-list">
            {candidates.slice(0, 40).map((c) => (
              <label key={c.id} className="dep-item">
                <input type="checkbox" checked={t.dependsOn.includes(c.id)} onChange={(e) => set({ dependsOn: e.target.checked ? [...t.dependsOn, c.id] : t.dependsOn.filter((x) => x !== c.id) })} />
                <span>{c.title}</span><span className="muted">{formatDate(c.dueDate, 'dayMonth')}</span>
              </label>
            ))}
          </div>
        ) : <p className="muted">Aucune autre tâche dans {t.eventId ? 'cet événement' : 'les tâches hors projet'}.</p>}
        {errors.deps ? <p className="field-error">{errors.deps}</p> : null}
        {!errors.deps && conflicts.length ? <p className="warn-note"><Icon name="alert" size={15} />Commence avant la fin de : {conflicts.map((c) => c.title).join(', ')}.</p> : null}
      </fieldset>

      <fieldset className="form-section">
        <legend>Liste de contrôle {t.checklist.length ? `(${t.checklist.filter((c) => c.done).length}/${t.checklist.length})` : ''}</legend>
        <ul className="checklist">
          {t.checklist.map((c) => (
            <li key={c.id}>
              <label><input type="checkbox" checked={c.done} onChange={(e) => set({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, done: e.target.checked } : x)) })} /><span className={c.done ? 'is-done' : ''}>{c.text}</span></label>
              <IconButton icon="x" label={`Retirer ${c.text}`} onClick={() => set({ checklist: t.checklist.filter((x) => x.id !== c.id) })} />
            </li>
          ))}
        </ul>
        <div className="inline-add">
          <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Nouvel élément" aria-label="Nouvel élément de la liste de contrôle"
            onKeyDown={(e) => { if (e.key === 'Enter' && newItem.trim()) { e.preventDefault(); set({ checklist: [...t.checklist, { id: uid('chk'), text: newItem.trim(), done: false }] }); setNewItem(''); } }} />
          <Button size="sm" onClick={() => { if (newItem.trim()) { set({ checklist: [...t.checklist, { id: uid('chk'), text: newItem.trim(), done: false }] }); setNewItem(''); } }}>Ajouter</Button>
        </div>
      </fieldset>

      <Field label="Description" wide><textarea rows={3} value={t.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      <Field label="Notes" wide><textarea rows={2} value={t.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>

      {existing ? (
        <fieldset className="form-section">
          <legend>Commentaires</legend>
          <ul className="comments">
            {existing.comments.map((c) => (
              <li key={c.id}><span className="h-who">{memberDisplayName(memberById.get(c.authorId ?? ''))}</span><span className="h-when">{formatTimestamp(c.at)}</span><p>{c.text}</p></li>
            ))}
            {!existing.comments.length ? <li className="muted">Aucun commentaire.</li> : null}
          </ul>
          <div className="inline-add">
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Écrire un commentaire" aria-label="Commentaire" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addComment(); } }} />
            <Button size="sm" disabled={!comment.trim() || !canWrite || dirty} title={dirty ? 'Enregistrez d’abord les modifications' : undefined} onClick={() => void addComment()}>Publier</Button>
          </div>
          <button type="button" className="link-btn" onClick={() => setShowHist((v) => !v)}>{showHist ? 'Masquer l’historique' : `Historique (${existing.history.length})`}</button>
          {showHist ? <ul className="history">{[...existing.history].reverse().map((h, i) => <li key={i}><span className="h-when">{formatTimestamp(h.at)}</span><span className="h-who">{(memberById.get(h.by ?? '') ? memberDisplayName(memberById.get(h.by ?? '')) : 'Système')}</span><span>{h.text}</span></li>)}</ul> : null}
        </fieldset>
      ) : null}

      <div className="form-actions">
        {existing ? <Button variant="ghost" icon="trash" disabled={!store.can('task.delete')} onClick={() => void deleteTasks([existing.id]).then((ok) => { if (ok) { ui.setCloseGuard(null); void ui.closePanel(); } })}>Supprimer</Button> : null}
        <span className="spacer" />
        <Button variant="ghost" onClick={() => void ui.closePanel()}>Annuler</Button>
        <Button variant="primary" type="submit" disabled={!canWrite}>{existing ? 'Enregistrer' : 'Créer la tâche'}</Button>
      </div>
      {existing && ev ? <p className="form-note"><button type="button" className="link-btn" onClick={() => openEvent(ev.id, existing.occurrenceKey ?? null, true)}>Voir l’événement « {ev.title} »</button></p> : null}
    </form>
  );
}
