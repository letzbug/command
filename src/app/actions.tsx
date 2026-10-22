import { useState } from 'react';
import { formatDate } from '../domain/dates';
import { isDone } from '../domain/planning';
import type { ISODate, PlanningEvent, Task } from '../domain/types';
import { buildChecklistInput, PrintData } from '../print/builders';
import { layoutChecklist } from '../print/layouts';
import type { Measure } from '../print/model';
import { saveFile, saveMessage } from '../services/fileSaver';
import { MenuItem, ui } from '../ui/uiStore';
import type { AppStore } from './store';

let store: AppStore;
export function registerStore(s: AppStore) { store = s; }
export const getStore = () => store;

/** Runs a store operation and reports failures (permissions, validation, storage) as toasts. */
export async function run<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (success) ui.toast(success, 'success');
    return r;
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : 'L’opération a échoué.', 'error');
    return undefined;
  }
}

/** For void operations: true when the operation succeeded. */
export async function attempt(fn: () => Promise<unknown>, success?: string): Promise<boolean> {
  try { await fn(); if (success) ui.toast(success, 'success'); return true; }
  catch (e) { ui.toast(e instanceof Error ? e.message : 'L’opération a échoué.', 'error'); return false; }
}

export const can = (p: Parameters<AppStore['can']>[0]) => store.can(p);

export function newEvent(defaults: Partial<PlanningEvent> = {}) {
  if (!store.can('event.write')) return ui.toast('Votre rôle ne permet pas de créer des événements (mode démo).', 'warning');
  void ui.openPanel({ kind: 'eventForm', defaults });
}

export function newTask(defaults: Partial<Task> = {}) {
  if (!store.can('task.write')) return ui.toast('Votre rôle ne permet pas de créer des tâches (mode démo).', 'warning');
  void ui.openPanel({ kind: 'task', defaults });
}

export function openEvent(id: string, occurrenceKey?: ISODate | null, push = false) {
  const p = { kind: 'event' as const, id, occurrenceKey: occurrenceKey ?? null };
  void (push ? ui.pushPanel(p) : ui.openPanel(p));
}
export function openTask(id: string, push = false) {
  void (push ? ui.pushPanel({ kind: 'task', id }) : ui.openPanel({ kind: 'task', id }));
}

export async function setDone(ids: string[], done: boolean) {
  const undo = await run(() => store.setTaskStatus(ids, done ? 'termine' : 'a_faire'));
  if (!undo) return;
  const n = ids.length;
  ui.toast(done ? (n > 1 ? `${n} tâches terminées` : 'Tâche terminée') : 'Tâche rouverte', 'success', { label: 'Annuler', run: () => void run(undo) });
}

export async function deleteTasks(ids: string[]) {
  const ok = await ui.confirm({
    title: ids.length > 1 ? `Supprimer ${ids.length} tâches ?` : 'Supprimer cette tâche ?',
    body: 'Les dépendances qui pointent vers ces tâches seront retirées.',
    confirmLabel: 'Supprimer', danger: true,
  });
  if (!ok) return false;
  const undo = await run(() => store.deleteTasks(ids));
  if (undo) ui.toast(ids.length > 1 ? `${ids.length} tâches supprimées` : 'Tâche supprimée', 'success', { label: 'Annuler', run: () => void run(undo) });
  return !!undo;
}

function DeleteEventBody({ event, count, close }: { event: PlanningEvent; count: number; close: (v?: unknown) => void }) {
  const [mode, setMode] = useState<'delete_tasks' | 'keep_tasks'>('keep_tasks');
  return (
    <div className="dlg-body">
      <h2 className="dlg-title">Supprimer « {event.title} » ?</h2>
      <div className="dlg-text">
        {event.recurrence ? <p>Toutes les occurrences de cette série seront supprimées, y compris l’historique.</p> : null}
        {count > 0 ? (
          <fieldset className="radio-list">
            <legend>{count} tâche{count > 1 ? 's sont liées' : ' est liée'} à cet événement.</legend>
            <label><input type="radio" checked={mode === 'keep_tasks'} onChange={() => setMode('keep_tasks')} /> Conserver les tâches, sans événement</label>
            <label><input type="radio" checked={mode === 'delete_tasks'} onChange={() => setMode('delete_tasks')} /> Supprimer aussi les tâches</label>
          </fieldset>
        ) : <p>Aucune tâche n’est liée à cet événement.</p>}
      </div>
      <div className="dlg-actions">
        <button type="button" className="btn btn-ghost" onClick={() => close(null)}>Annuler</button>
        <button type="button" className="btn btn-danger" onClick={() => close(mode)}>Supprimer</button>
      </div>
    </div>
  );
}

export async function deleteEvent(id: string) {
  const ev = store.state.events.find((e) => e.id === id);
  if (!ev) return false;
  if (!store.can('event.delete')) { ui.toast('Votre rôle ne permet pas de supprimer des événements (mode démo).', 'warning'); return false; }
  const count = store.state.tasks.filter((t) => t.eventId === id).length;
  const mode = await ui.openDialog<'delete_tasks' | 'keep_tasks' | null>((close) => <DeleteEventBody event={ev} count={count} close={close} />, 'md');
  if (!mode) return false;
  const undo = await run(() => store.deleteEvent(id, mode));
  if (!undo) return false;
  await ui.closeAllPanels();
  if (ui.state.eventId === id) ui.go('projets');
  ui.toast('Événement supprimé', 'success', { label: 'Annuler', run: () => void run(undo) });
  return true;
}

export async function duplicateEvent(id: string) {
  const copy = await run(() => store.duplicateEvent(id));
  if (copy) {
    ui.toast('Événement dupliqué avec ses tâches', 'success');
    ui.go('projets', { eventId: copy.id });
  }
}

let measurePromise: Promise<Measure> | null = null;
export function getMeasure(): Promise<Measure> {
  if (!measurePromise) measurePromise = import('../print/pdf').then((m) => m.createMeasure()).then((r) => r.measure);
  return measurePromise;
}

export function printData(): PrintData {
  const s = store.state;
  return { events: s.events, tasks: s.tasks, team: s.team, courses: s.courseSnapshot?.courses ?? [], today: s.today, publicAppUrl: s.settings.publicAppUrl };
}

export const fileSlug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60);

export async function downloadChecklist(eventId: string, occurrenceKey?: ISODate | null) {
  try {
    const [{ renderPdf }, measure] = await Promise.all([import('../print/pdf'), getMeasure()]);
    const ev = store.state.events.find((e) => e.id === eventId);
    const doc = layoutChecklist(buildChecklistInput(printData(), eventId, occurrenceKey), measure);
    const bytes = await renderPdf(doc);
    const outcome = await saveFile(`checklist-${fileSlug(ev?.title ?? 'evenement')}.pdf`, bytes, 'application/pdf');
    const m = saveMessage(outcome, 'Checklist PDF');
    ui.toast(m.text, m.tone);
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : 'Génération du PDF impossible.', 'error');
  }
}

export function taskMenu(t: Task): MenuItem[] {
  return [
    { label: 'Ouvrir', icon: 'edit', run: () => openTask(t.id) },
    { label: isDone(t) ? 'Rouvrir' : 'Marquer terminée', icon: 'checkCircle', disabled: !store.can('task.write'), run: () => void setDone([t.id], !isDone(t)) },
    ...(t.eventId ? [{ label: 'Voir l’événement', icon: 'layers' as const, run: () => openEvent(t.eventId!) }] : []),
    { label: 'Supprimer', icon: 'trash', danger: true, disabled: !store.can('task.delete'), run: () => void deleteTasks([t.id]) },
  ];
}

export function eventMenu(e: PlanningEvent, occurrenceKey?: ISODate | null): MenuItem[] {
  return [
    { label: 'Ouvrir la fiche', icon: 'layers', run: () => ui.go('projets', { eventId: e.id }) },
    { label: occurrenceKey && e.recurrence ? `Modifier l’occurrence du ${formatDate(occurrenceKey, 'dayMonth')}` : 'Modifier', icon: 'edit', disabled: !store.can('event.write'), run: () => void ui.openPanel({ kind: 'eventForm', id: e.id, occurrenceKey: occurrenceKey ?? null }) },
    { label: 'Ajouter une tâche', icon: 'plus', disabled: !store.can('task.write'), run: () => newTask({ eventId: e.id, occurrenceKey: e.recurrence ? occurrenceKey ?? null : null }) },
    { label: 'Checklist PDF (A4)', icon: 'printer', run: () => void downloadChecklist(e.id, occurrenceKey) },
    { label: 'Dupliquer', icon: 'copy', disabled: !store.can('event.write'), run: () => void duplicateEvent(e.id) },
    { label: e.archived ? 'Désarchiver' : 'Archiver', icon: 'archive', disabled: !store.can('event.write'), run: () => void run(() => store.archiveEvent(e.id, !e.archived), e.archived ? 'Événement désarchivé' : 'Événement archivé') },
    { label: 'Supprimer', icon: 'trash', danger: true, disabled: !store.can('event.delete'), run: () => void deleteEvent(e.id) },
  ];
}
