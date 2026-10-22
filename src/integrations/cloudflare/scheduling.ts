import type { Reminder } from '../../domain/reminders';
import type { TeamMember } from '../../domain/types';

/**
 * Contract for server-side reminder delivery (Cloudflare Cron Trigger).
 * Today the browser computes reminders while the app is open and nothing is
 * sent when it is closed. A Worker will run the same `computeReminders`
 * on Supabase data and call `planDispatches` to decide what to send.
 */
export type Channel = 'email' | 'push';

export interface ReminderDispatch {
  reminderId: string;
  memberId: string;
  channel: Channel;
  subject: string;
  body: string;
}

export interface ReminderScheduler {
  /** Returns dispatches not yet sent (idempotent on reminderId + memberId). */
  plan(reminders: Reminder[], team: TeamMember[]): ReminderDispatch[];
}

/** Pure planning step shared by a future Worker; unassigned items go to administrators. */
export function planDispatches(reminders: Reminder[], team: TeamMember[], alreadySent: Set<string>, channel: Channel = 'email'): ReminderDispatch[] {
  const admins = team.filter((m) => m.active && m.role === 'administrateur');
  const out: ReminderDispatch[] = [];
  for (const r of reminders) {
    if (r.acknowledged || r.snoozed || r.severity === 'info') continue;
    const targets = r.assigneeId ? team.filter((m) => m.id === r.assigneeId && m.active) : admins;
    for (const m of targets) {
      const key = `${r.id}|${m.id}`;
      if (alreadySent.has(key)) continue;
      out.push({ reminderId: r.id, memberId: m.id, channel, subject: `[UniPop COMMAND] ${r.level} : ${r.title}`, body: r.detail });
    }
  }
  return out;
}
