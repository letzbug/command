import { DateFR } from '../../ui/DateFR';
import { useEffect, useMemo, useState } from 'react';
import { attempt, run } from '../../app/actions';
import { useKnownLocations, useLookups } from '../../app/derived';
import { useAppState, useStore } from '../../app/store';
import { addDays, diffDays, formatDate, isValidISODate } from '../../domain/dates';
import { applyReschedule, EVENT_TEMPLATES, isDone, proposeReschedule, RescheduleLine, templateById } from '../../domain/planning';
import { describeRecurrence, findOccurrence, nextOccurrence } from '../../domain/recurrence';
import { CATEGORIES, CATEGORY_LABEL, EVENT_STATUSES, EVENT_STATUS_LABEL, PRIORITIES, PRIORITY_LABEL } from '../../domain/reference';
import type { EventCategory, EventKind, EventStatus, ISODate, PlanningEvent, Priority, Recurrence, RecurrenceFreq, Task } from '../../domain/types';
import { Button, Field, Segmented, Select, Toggle } from '../../ui/kit';
import { ui } from '../../ui/uiStore';

type RepeatMode = 'none' | 'yearly' | 'monthly' | 'weekly' | 'custom';
interface Draft {
  kind: EventKind; title: string; category: EventCategory; location: string; startDate: ISODate; endDate: ISODate;
  allDay: boolean; startTime: string; endTime: string; organizer: string; ownerId: string; priority: Priority; status: EventStatus;
  description: string; notes: string; repeat: RepeatMode; customFreq: RecurrenceFreq; interval: number;
  endMode: 'never' | 'until' | 'count'; until: string; count: number; templateId: string;
}

function toRecurrence(d: Draft): Recurrence | null {
  if (d.repeat === 'none') return null;
  const freq: RecurrenceFreq = d.repeat === 'custom' ? d.customFreq : d.repeat;
  return {
    freq, interval: d.repeat === 'custom' ? Math.max(1, Math.floor(d.interval || 1)) : 1,
    until: d.endMode === 'until' && d.until ? d.until : null,
    count: d.endMode === 'count' ? Math.max(1, Math.floor(d.count || 1)) : null,
  };
}

function fromEvent(e: PlanningEvent, occ?: { startDate: ISODate; endDate: ISODate; startTime?: string | null; endTime?: string | null; title: string; location: string; notes: string } | null): Draft {
  const r = e.recurrence;
  const repeat: RepeatMode = !r ? 'none' : r.interval > 1 || r.freq === 'daily' ? 'custom' : r.freq;
  return {
    kind: e.kind, title: occ?.title ?? e.title, category: e.category, location: occ?.location ?? e.location,
    startDate: occ?.startDate ?? e.startDate, endDate: occ?.endDate ?? e.endDate,
    allDay: !(occ ? occ.startTime : e.startTime), startTime: (occ ? occ.startTime : e.startTime) ?? '09:00', endTime: (occ ? occ.endTime : e.endTime) ?? '10:00',
    organizer: e.organizer, ownerId: e.ownerId ?? '', priority: e.priority, status: e.status, description: e.description, notes: occ?.notes ?? e.notes,
    repeat, customFreq: r?.freq ?? 'weekly', interval: r?.interval ?? 1,
    endMode: r?.until ? 'until' : r?.count ? 'count' : 'never', until: r?.until ?? '', count: r?.count ?? 10, templateId: e.templateId ?? '',
  };
}

function validate(d: Draft): Record<string, string> {
  const err: Record<string, string> = {};
  if (!d.title.trim()) err.title = 'Le titre est obligatoire.';
  if (!isValidISODate(d.startDate)) err.startDate = 'Date de début invalide.';
  if (!isValidISODate(d.endDate)) err.endDate = 'Date de fin invalide.';
  else if (d.endDate < d.startDate) err.endDate = 'La fin doit être postérieure ou égale au début.';
  if (!d.allDay && d.startDate === d.endDate && d.endTime <= d.startTime) err.endTime = 'L’heure de fin doit suivre l’heure de début.';
  if (d.repeat !== 'none' && d.endMode === 'until' && (!isValidISODate(d.until) || d.until < d.startDate)) err.until = 'La date de fin de répétition doit suivre le début.';
  if (d.repeat === 'custom' && (!d.interval || d.interval < 1)) err.interval = 'Intervalle minimal : 1.';
  return err;
}

/* ---------- Dialog bodies ---------- */

function ScopeBody({ options, close }: { options: { value: string; label: string; hint: string }[]; close: (v?: unknown) => void }) {
  const [v, setV] = useState(options[0].value);
  return (
    <div className="dlg-body">
      <h2 className="dlg-title">Appliquer les modifications à…</h2>
      <fieldset className="radio-list">
        <legend className="sr-only">Portée</legend>
        {options.map((o) => (
          <label key={o.value}><input type="radio" checked={v === o.value} onChange={() => setV(o.value)} /><span><b>{o.label}</b><small>{o.hint}</small></span></label>
        ))}
      </fieldset>
      <div className="dlg-actions">
        <button type="button" className="btn btn-ghost" onClick={() => close(null)}>Annuler</button>
        <button type="button" className="btn btn-primary" onClick={() => close(v)}>Enregistrer</button>
      </div>
    </div>
  );
}

export function RescheduleBody({ lines: initial, delta, close }: { lines: RescheduleLine[]; delta: number; close: (v?: unknown) => void }) {
  const [lines, setLines] = useState(initial);
  const n = lines.filter((l) => l.include).length;
  return (
    <div className="dlg-body">
      <h2 className="dlg-title">Recalculer les échéances de préparation ?</h2>
      <p className="dlg-text">L’événement est déplacé de {Math.abs(delta)} jour{Math.abs(delta) > 1 ? 's' : ''} {delta > 0 ? 'plus tard' : 'plus tôt'}. Vérifiez l’impact avant de confirmer. Les tâches modifiées à la main ne sont pas cochées.</p>
      <div className="resched">
        {lines.map((l, i) => (
          <label key={l.taskId} className={`resched-row ${l.include ? '' : 'is-off'}`}>
            <input type="checkbox" checked={l.include} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} />
            <span className="rs-title">{l.title}{l.manual ? <span className="badge badge-amber">modifiée à la main</span> : null}</span>
            <span className="rs-dates"><s>{formatDate(l.oldDue, 'dayMonth')}</s> <b>{formatDate(l.newDue, 'dayMonth')}</b></span>
          </label>
        ))}
      </div>
      <div className="dlg-actions">
        <button type="button" className="btn btn-ghost" onClick={() => close(null)}>Annuler</button>
        <button type="button" className="btn btn-secondary" onClick={() => close([])}>Ne pas recalculer</button>
        <button type="button" className="btn btn-primary" onClick={() => close(lines)} disabled={!n}>Appliquer ({n})</button>
      </div>
    </div>
  );
}

/** Returns tasks to save (possibly empty), or null if the user cancelled. */
async function askReschedule(oldStart: ISODate, newStart: ISODate, tasks: Task[]): Promise<Task[] | null> {
  const lines = proposeReschedule(oldStart, newStart, tasks.filter((t) => !isDone(t)));
  if (!lines.length) return [];
  const chosen = await ui.openDialog<RescheduleLine[] | null>((close) => <RescheduleBody lines={lines} delta={diffDays(newStart, oldStart)} close={close} />, 'md');
  if (chosen === null || chosen === undefined) return null;
  return applyReschedule(tasks, chosen);
}

/* ---------- Form ---------- */

export function EventForm({ id, occurrenceKey, defaults }: { id?: string | null; occurrenceKey?: ISODate | null; defaults?: Partial<PlanningEvent> }) {
  const store = useStore();
  const today = useAppState((s) => s.today);
  const events = useAppState((s) => s.events);
  const tasks = useAppState((s) => s.tasks);
  const { activeTeam } = useLookups();
  const locations = useKnownLocations();
  const existing = id ? events.find((e) => e.id === id) ?? null : null;
  const occ = existing && occurrenceKey && existing.recurrence ? findOccurrence(existing, occurrenceKey) : null;
  const initial = useMemo<Draft>(() => {
    if (existing) return fromEvent(existing, occ);
    const base = store.newEventDraft(defaults ?? {});
    return { ...fromEvent(base), title: defaults?.title ?? '', allDay: !defaults?.startTime };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [d, setD] = useState<Draft>(initial);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  useEffect(() => { ui.setCloseGuard(() => dirty && !saving); return () => ui.setCloseGuard(null); }, [dirty, saving]);
  const errors = validate(d);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const occMode = !!occ;
  const tpl = templateById(d.templateId);

  const pickTemplate = (tid: string) => {
    const t = templateById(tid);
    if (!t) return set({ templateId: '' });
    set({ templateId: tid, category: t.category, kind: t.kind, endDate: addDays(d.startDate, t.defaultDurationDays - 1), title: d.title || t.name });
  };
  const setStart = (v: string) => {
    if (!isValidISODate(v)) return set({ startDate: v });
    const span = isValidISODate(d.endDate) ? Math.max(0, diffDays(d.endDate, d.startDate)) : 0;
    set({ startDate: v, endDate: addDays(v, span) });
  };

  const fields = (): Partial<PlanningEvent> => ({
    kind: d.kind, title: d.title.trim(), category: d.category, location: d.location.trim(), startDate: d.startDate, endDate: d.endDate,
    startTime: d.allDay ? null : d.startTime, endTime: d.allDay ? null : d.endTime, organizer: d.organizer.trim(),
    ownerId: d.ownerId || null, priority: d.priority, status: d.status, description: d.description, notes: d.notes, recurrence: toRecurrence(d),
  });

  async function save() {
    setTouched(true);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      if (!existing) {
        const ev = { ...store.newEventDraft(), ...fields() } as PlanningEvent;
        const r = await run(() => store.createEvent(ev, d.templateId || null));
        if (!r) return;
        ui.toast(r.created ? `Événement créé avec ${r.created} tâches de préparation` : 'Événement créé', 'success');
        ui.setCloseGuard(null);
        await ui.replaceTop({ kind: 'event', id: r.event.id });
        return;
      }
      const linked = tasks.filter((t) => t.eventId === existing.id);
      if (occMode && occ && occurrenceKey) {
        const scope = await ui.openDialog<string | null>((close) => (
          <ScopeBody close={close} options={[
            { value: 'one', label: 'Cette occurrence uniquement', hint: `Le ${formatDate(occurrenceKey, 'long')}. Les autres occurrences ne changent pas.` },
            { value: 'following', label: occurrenceKey === existing.startDate ? 'Toute la série' : 'Cette occurrence et les suivantes', hint: occurrenceKey === existing.startDate ? 'Toutes les occurrences sont mises à jour.' : 'Les occurrences passées restent inchangées (la série est scindée).' },
          ]} />
        ), 'md');
        if (!scope) return;
        if (scope === 'one') {
          const patch = { startDate: d.startDate, endDate: d.endDate, startTime: d.allDay ? null : d.startTime, endTime: d.allDay ? null : d.endTime, title: d.title.trim(), location: d.location.trim(), notes: d.notes };
          let resched: Task[] = [];
          if (d.startDate !== occ.startDate) {
            const r = await askReschedule(occ.startDate, d.startDate, linked.filter((t) => t.occurrenceKey === occurrenceKey));
            if (r === null) return;
            resched = r;
          }
          if (!(await attempt(() => store.saveOccurrence(existing.id, occurrenceKey, patch, resched)))) return;
        } else {
          const delta = diffDays(d.startDate, occ.startDate);
          const f = fields();
          const res = await run(() => store.saveFollowing(existing.id, occurrenceKey, { ...f, startDate: addDays(occurrenceKey, delta), endDate: addDays(occurrenceKey, delta + diffDays(d.endDate, d.startDate)) }));
          if (!res) return;
        }
      } else if (existing.recurrence && existing.startDate < today && nextOccurrence(existing, today)) {
        const next = nextOccurrence(existing, today)!;
        const scope = await ui.openDialog<string | null>((close) => (
          <ScopeBody close={close} options={[
            { value: 'from_next', label: `À partir de la prochaine occurrence (${formatDate(next.key, 'medium')})`, hint: 'Recommandé : l’historique des occurrences passées est conservé.' },
            { value: 'all', label: 'Toute la série, y compris les occurrences passées', hint: 'Réécrit l’historique de la série.' },
          ]} />
        ), 'md');
        if (!scope) return;
        if (scope === 'from_next') {
          const delta = diffDays(d.startDate, existing.startDate);
          const f = fields();
          if (!(await run(() => store.saveFollowing(existing.id, next.key, { ...f, startDate: addDays(next.key, delta), endDate: addDays(next.key, delta + diffDays(d.endDate, d.startDate)) })))) return;
        } else {
          let resched: Task[] = [];
          if (d.startDate !== existing.startDate) {
            const r = await askReschedule(existing.startDate, d.startDate, linked.filter((t) => !t.occurrenceKey || t.occurrenceKey === existing.startDate));
            if (r === null) return;
            resched = r;
          }
          if (!(await run(() => store.updateEvent({ ...existing, ...fields() } as PlanningEvent, resched)))) return;
        }
      } else {
        let resched: Task[] = [];
        if (d.startDate !== existing.startDate) {
          const r = await askReschedule(existing.startDate, d.startDate, linked.filter((t) => !t.occurrenceKey || t.occurrenceKey === existing.startDate));
          if (r === null) return;
          resched = r;
        }
        if (!(await run(() => store.updateEvent({ ...existing, ...fields() } as PlanningEvent, resched)))) return;
        if (resched.length) ui.toast(`${resched.length} échéance${resched.length > 1 ? 's' : ''} recalculée${resched.length > 1 ? 's' : ''}`, 'info');
      }
      ui.toast('Modifications enregistrées', 'success');
      ui.setCloseGuard(null);
      await ui.closePanel();
    } finally {
      setSaving(false);
    }
  }

  const err = (k: string) => (touched ? errors[k] : null);
  const rec = toRecurrence(d);
  return (
    <form className="pv form" onSubmit={(e) => { e.preventDefault(); void save(); }} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); } }}>
      <header className="pv-head">
        <p className="pv-kicker">{!existing ? 'Nouvel événement' : occMode ? `Occurrence du ${formatDate(occurrenceKey, 'long')}` : 'Modifier'}</p>
        <input className="title-input" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Titre de l’événement" aria-label="Titre" autoFocus={!existing} aria-invalid={!!err('title')} />
        {err('title') ? <span className="field-error">{err('title')}</span> : null}
      </header>

      {!existing ? (
        <Field label="Partir d’un modèle" hint={tpl ? `${tpl.tasks.length} tâches de préparation générées, de J${Math.min(...tpl.tasks.map((t) => t.offset))} à J+${Math.max(...tpl.tasks.map((t) => t.offset))}.` : 'Un modèle crée automatiquement les tâches et jalons de préparation.'}>
          <Select value={d.templateId} onChange={pickTemplate} ariaLabel="Modèle" options={[{ value: '', label: 'Aucun modèle' }, ...EVENT_TEMPLATES.map((t) => ({ value: t.id, label: t.name }))]} />
        </Field>
      ) : null}

      <div className="form-grid">
        {!occMode ? (
          <Field label="Type">
            <Segmented ariaLabel="Type" size="sm" value={d.kind} onChange={(v) => set({ kind: v })} options={[{ value: 'evenement', label: 'Événement' }, { value: 'projet', label: 'Projet' }]} />
          </Field>
        ) : null}
        {!occMode ? (
          <Field label="Catégorie">
            <Select value={d.category} onChange={(v) => set({ category: v })} ariaLabel="Catégorie" options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
          </Field>
        ) : null}
        <Field label="Début" error={err('startDate')}><DateFR value={d.startDate} onChange={(v) => setStart(v)} required /></Field>
        <Field label="Fin" error={err('endDate')}><DateFR value={d.endDate} min={d.startDate} onChange={(v) => set({ endDate: v })} required /></Field>
        <div className="field field-wide"><Toggle checked={d.allDay} onChange={(v) => set({ allDay: v })} label="Toute la journée" /></div>
        {!d.allDay ? <>
          <Field label="Heure de début"><input type="time" step={300} value={d.startTime} onChange={(e) => set({ startTime: e.target.value })} /></Field>
          <Field label="Heure de fin" error={err('endTime')}><input type="time" step={300} value={d.endTime} onChange={(e) => set({ endTime: e.target.value })} /></Field>
        </> : null}
        <Field label="Lieu" wide>
          <input list="known-locations" value={d.location} onChange={(e) => set({ location: e.target.value })} placeholder="Salle, bâtiment, ville" />
          <datalist id="known-locations">{locations.map((l) => <option key={l} value={l} />)}</datalist>
        </Field>
        {!occMode ? <>
          <Field label="Responsable">
            <Select value={d.ownerId} onChange={(v) => set({ ownerId: v })} ariaLabel="Responsable" options={[{ value: '', label: 'Non assigné' }, ...activeTeam.map((m) => ({ value: m.id, label: `${m.code} — ${m.label}` }))]} />
          </Field>
          <Field label="Organisateur"><input value={d.organizer} onChange={(e) => set({ organizer: e.target.value })} /></Field>
          <Field label="Priorité">
            <Select value={d.priority} onChange={(v) => set({ priority: v })} ariaLabel="Priorité" options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
          </Field>
          <Field label="Statut">
            <Select value={d.status} onChange={(v) => set({ status: v })} ariaLabel="Statut" options={EVENT_STATUSES.map((s) => ({ value: s, label: EVENT_STATUS_LABEL[s] }))} />
          </Field>
        </> : null}
      </div>

      {!occMode ? (
        <fieldset className="form-section">
          <legend>Répétition</legend>
          <div className="form-grid">
            <Field label="Se répète">
              <Select value={d.repeat} onChange={(v) => set({ repeat: v })} ariaLabel="Répétition" options={[
                { value: 'none', label: 'Ne se répète pas' }, { value: 'yearly', label: 'Chaque année' }, { value: 'monthly', label: 'Chaque mois' },
                { value: 'weekly', label: 'Chaque semaine' }, { value: 'custom', label: 'Intervalle personnalisé' },
              ]} />
            </Field>
            {d.repeat === 'custom' ? (
              <Field label="Tous les" error={err('interval')}>
                <span className="inline-pair">
                  <input type="number" min={1} max={365} value={d.interval} onChange={(e) => set({ interval: Number(e.target.value) })} aria-label="Intervalle" />
                  <Select value={d.customFreq} onChange={(v) => set({ customFreq: v })} ariaLabel="Unité" options={[{ value: 'daily', label: 'jours' }, { value: 'weekly', label: 'semaines' }, { value: 'monthly', label: 'mois' }, { value: 'yearly', label: 'ans' }]} />
                </span>
              </Field>
            ) : null}
            {d.repeat !== 'none' ? <>
              <Field label="Fin de la répétition">
                <Select value={d.endMode} onChange={(v) => set({ endMode: v })} ariaLabel="Fin" options={[{ value: 'never', label: 'Jamais' }, { value: 'until', label: 'À une date' }, { value: 'count', label: 'Après un nombre d’occurrences' }]} />
              </Field>
              {d.endMode === 'until' ? <Field label="Jusqu’au" error={err('until')}><DateFR value={d.until} min={d.startDate} onChange={(v) => set({ until: v })} /></Field> : null}
              {d.endMode === 'count' ? <Field label="Nombre d’occurrences"><input type="number" min={1} max={500} value={d.count} onChange={(e) => set({ count: Number(e.target.value) })} /></Field> : null}
            </> : null}
          </div>
          {rec ? <p className="form-note">{describeRecurrence(rec, d.startDate)}. Chaque occurrence peut ensuite être modifiée individuellement.</p> : null}
        </fieldset>
      ) : null}

      {!occMode ? <Field label="Description" wide><textarea rows={3} value={d.description} onChange={(e) => set({ description: e.target.value })} /></Field> : null}
      <Field label="Notes" wide><textarea rows={3} value={d.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>

      <div className="form-actions">
        <Button variant="ghost" onClick={() => void ui.closePanel()}>Annuler</Button>
        <Button variant="primary" type="submit" disabled={saving}>{existing ? 'Enregistrer' : 'Créer l’événement'}</Button>
      </div>
    </form>
  );
}
