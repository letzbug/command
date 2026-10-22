import { useState } from 'react';
import { openEvent, openTask, run, setDone } from '../../app/actions';
import { useLookups, useReminders } from '../../app/derived';
import { useAppState, useStore } from '../../app/store';
import { addDays, formatDate } from '../../domain/dates';
import { Reminder, REMINDER_TYPE_LABEL, ReminderType, Severity } from '../../domain/reminders';
import { nowStamp } from '../../domain/reference';
import { Icon } from '../../ui/icons';
import { Button, Empty, MemberTag, Select, Toggle } from '../../ui/kit';
import { menuAt } from '../../ui/overlays';
import { ui } from '../../ui/uiStore';

const SEV_LABEL: Record<Severity, string> = { critique: 'Critique', haute: 'Haute', moyenne: 'Moyenne', info: 'Information' };
const TYPES = Object.keys(REMINDER_TYPE_LABEL) as ReminderType[];

export function RemindersPage() {
  const store = useStore();
  const all = useReminders();
  const thresholds = useAppState((s) => s.settings.reminderThresholds);
  const today = useAppState((s) => s.today);
  const { memberById, team } = useLookups();
  const [types, setTypes] = useState<ReminderType[]>([]);
  const [who, setWho] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  const base = all.filter((r) => showHidden || (!r.acknowledged && !r.snoozed));
  const list = base.filter((r) => (!types.length || types.includes(r.type)) && (!who || r.assigneeId === who));
  const bySev = (['critique', 'haute', 'moyenne', 'info'] as Severity[]).map((s) => ({ s, items: list.filter((r) => r.severity === s) })).filter((g) => g.items.length);

  const ack = (r: Reminder) => run(() => store.setReminderState(r.id, { acknowledgedAt: nowStamp() })).then(() => ui.toast('Rappel acquitté', 'success', { label: 'Annuler', run: () => void store.setReminderState(r.id, { acknowledgedAt: null }) }));
  const snooze = (r: Reminder, days: number) => run(() => store.setReminderState(r.id, { snoozedUntil: addDays(today, days) })).then(() => ui.toast(`Rappel reporté au ${formatDate(addDays(today, days), 'medium')}`, 'success', { label: 'Annuler', run: () => void store.setReminderState(r.id, { snoozedUntil: null }) }));
  const restore = (r: Reminder) => run(() => store.setReminderState(r.id, { acknowledgedAt: null, snoozedUntil: null }), 'Rappel rétabli');
  const open = (r: Reminder) => (r.taskId ? openTask(r.taskId) : r.eventId ? openEvent(r.eventId, r.occurrenceKey) : undefined);

  return (
    <div className="page">
      <p className="info-note"><Icon name="info" size={16} />
        Les rappels sont calculés à partir des données enregistrées, à l’ouverture de l’application et pendant son utilisation (seuils : {thresholds.map((t) => (t === 0 ? 'jour J' : `J-${t}`)).join(', ')}).
        Aucune notification n’est envoyée lorsque l’application est fermée ; l’envoi planifié est prévu via Cloudflare Cron.
        <button type="button" className="link-btn" onClick={() => ui.go('parametres')}>Modifier les seuils</button>
      </p>
      <div className="page-tools">
        <div className="type-chips" role="group" aria-label="Types de rappels">
          {TYPES.map((t) => {
            const n = base.filter((r) => r.type === t).length;
            const on = types.includes(t);
            return (
              <button key={t} type="button" aria-pressed={on} className={`type-chip tc-${t} ${on ? 'is-on' : ''}`} onClick={() => setTypes(on ? types.filter((x) => x !== t) : [...types, t])}>
                {REMINDER_TYPE_LABEL[t]}<b>{n}</b>
              </button>
            );
          })}
        </div>
        <Select value={who} onChange={setWho} ariaLabel="Responsable" options={[{ value: '', label: 'Toute l’équipe' }, ...team.map((m) => ({ value: m.id, label: m.code }))]} />
        <Toggle checked={showHidden} onChange={setShowHidden} label="Afficher acquittés et reportés" />
      </div>
      {bySev.length ? bySev.map((g) => (
        <section key={g.s} className="rem-group">
          <h3 className="list-head">{SEV_LABEL[g.s]}<span>{g.items.length}</span></h3>
          {g.items.map((r) => (
            <div key={r.id} className={`rem rem-${r.severity} ${r.acknowledged || r.snoozed ? 'is-muted' : ''}`}>
              <span className="rem-pulse" aria-hidden="true" />
              <button type="button" className="rem-main" onClick={() => open(r)}>
                <span className="rem-title">{r.title}</span>
                <span className="rem-detail">{r.detail}</span>
              </button>
              <span className="rem-type">{REMINDER_TYPE_LABEL[r.type]}</span>
              <span className="rem-level">{r.level}</span>
              <MemberTag member={memberById.get(r.assigneeId ?? '')} empty="À assigner" />
              <div className="rem-actions">
                {r.taskId ? <Button size="sm" icon="checkCircle" disabled={!store.can('task.write')} onClick={() => void setDone([r.taskId!], true)}>Terminer</Button> : null}
                {r.acknowledged || r.snoozed ? (
                  <Button size="sm" variant="ghost" onClick={() => void restore(r)}>Rétablir</Button>
                ) : <>
                  <Button size="sm" variant="ghost" icon="clock" onClick={(e) => menuAt(e, [
                    { label: 'Reporter à demain', run: () => void snooze(r, 1) },
                    { label: 'Reporter de 3 jours', run: () => void snooze(r, 3) },
                    { label: 'Reporter d’une semaine', run: () => void snooze(r, 7) },
                  ])}>Reporter</Button>
                  <Button size="sm" variant="ghost" icon="check" onClick={() => void ack(r)}>Acquitter</Button>
                </>}
              </div>
            </div>
          ))}
        </section>
      )) : (
        <Empty icon="bell" title={all.length ? 'Aucun rappel avec ces filtres' : 'Aucun rappel'}>
          {all.length ? 'Modifiez les filtres ou affichez les rappels acquittés.' : 'Les échéances à venir apparaîtront ici selon les seuils configurés.'}
        </Empty>
      )}
    </div>
  );
}
