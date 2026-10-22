import type { ISODate, TimeHM } from './types';

/**
 * Calendar arithmetic on day numbers (days since 1970-01-01, UTC based).
 * Dates are never converted through the local timezone, so DST changes
 * and the viewer's machine timezone cannot shift a planned day.
 */
const MS_PER_DAY = 86_400_000;
export const APP_TIMEZONE = 'Europe/Luxembourg';

const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(y: number, m: number, d: number): ISODate {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parts(iso: ISODate): [number, number, number] {
  return [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))];
}

export function toDayNum(iso: ISODate): number {
  const [y, m, d] = parts(iso);
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDayNum(n: number): ISODate {
  const dt = new Date(n * MS_PER_DAY);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function isValidISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = parts(s);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function isValidTime(s: unknown): s is TimeHM {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export const addDays = (iso: ISODate, n: number): ISODate => fromDayNum(toDayNum(iso) + n);
/** a - b in days */
export const diffDays = (a: ISODate, b: ISODate): number => toDayNum(a) - toDayNum(b);
export const minDate = (a: ISODate, b: ISODate) => (a < b ? a : b);
export const maxDate = (a: ISODate, b: ISODate) => (a > b ? a : b);

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 0 = Monday … 6 = Sunday (European convention). */
export function weekdayMon0(iso: ISODate): number {
  return (((toDayNum(iso) + 3) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

export const isWeekend = (iso: ISODate) => weekdayMon0(iso) >= 5;
export const startOfWeek = (iso: ISODate) => addDays(iso, -weekdayMon0(iso));
export const startOfMonth = (iso: ISODate) => iso.slice(0, 8) + '01';
export function endOfMonth(iso: ISODate): ISODate {
  const [y, m] = parts(iso);
  return ymd(y, m, daysInMonth(y, m));
}
export function addMonths(iso: ISODate, n: number): ISODate {
  const [y, m, d] = parts(iso);
  const total = m - 1 + n;
  const yy = y + Math.floor(total / 12);
  const mm = (((total % 12) + 12) % 12) + 1;
  return ymd(yy, mm, Math.min(d, daysInMonth(yy, mm)));
}
export const quarterOfMonth = (m: number) => Math.ceil(m / 3);

export function isoWeek(iso: ISODate): number {
  const thursday = addDays(iso, 3 - weekdayMon0(iso));
  const jan1 = thursday.slice(0, 4) + '-01-01';
  return 1 + Math.floor(diffDays(thursday, jan1) / 7);
}

export function* eachDay(start: ISODate, end: ISODate): Generator<ISODate> {
  for (let n = toDayNum(start), e = toDayNum(end); n <= e; n++) yield fromDayNum(n);
}

export const rangesOverlap = (aS: ISODate, aE: ISODate, bS: ISODate, bE: ISODate) => aS <= bE && bS <= aE;

/** Today's date in Europe/Luxembourg, independent of the device timezone. */
export function todayISO(now: Date = new Date(), tz = APP_TIMEZONE): ISODate {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function nowTimeHM(now: Date = new Date(), tz = APP_TIMEZONE): TimeHM {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

/** "23/10/2026" → "2026-10-23" (source format of trainings.json). */
export function parseFrDate(s: unknown): ISODate | null {
  if (typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const iso = ymd(Number(m[3]), Number(m[2]), Number(m[1]));
  return isValidISODate(iso) ? iso : null;
}

/** "1h40" | "3h" | "2h30" | "90min" → minutes */
export function parseDurationFr(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const t = s.trim().toLowerCase();
  let m = t.match(/^(\d{1,2})\s*h\s*(\d{1,2})?$/);
  if (m) return Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
  m = t.match(/^(\d{1,3})\s*min$/);
  return m ? Number(m[1]) : null;
}

export function addMinutes(time: TimeHM, minutes: number): TimeHM {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MONTHS_SHORT_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const WEEKDAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const WEEKDAYS_SHORT_FR = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
export const WEEKDAY_LETTERS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export type DateStyle = 'long' | 'medium' | 'short' | 'dayMonth' | 'weekdayDayMonth' | 'numeric';

export function formatDate(iso: ISODate | null | undefined, style: DateStyle = 'medium'): string {
  if (!iso || !isValidISODate(iso)) return '—';
  const [y, m, d] = parts(iso);
  const wd = WEEKDAYS_FR[weekdayMon0(iso)];
  switch (style) {
    case 'long': return `${wd} ${d} ${MONTHS_FR[m - 1]} ${y}`;
    case 'medium': return `${d} ${MONTHS_SHORT_FR[m - 1]} ${y}`;
    case 'dayMonth': return `${d} ${MONTHS_SHORT_FR[m - 1]}`;
    case 'weekdayDayMonth': return `${WEEKDAYS_SHORT_FR[weekdayMon0(iso)]} ${d} ${MONTHS_SHORT_FR[m - 1]}`;
    case 'numeric':
    case 'short': return `${pad(d)}/${pad(m)}/${y}`;
  }
}

export function formatRange(start: ISODate, end: ISODate): string {
  if (!end || start === end) return formatDate(start, 'medium');
  const [ys, ms] = parts(start);
  const [ye, me] = parts(end);
  if (ys === ye && ms === me) return `${parts(start)[2]}–${parts(end)[2]} ${MONTHS_SHORT_FR[me - 1]} ${ye}`;
  if (ys === ye) return `${formatDate(start, 'dayMonth')} – ${formatDate(end, 'medium')}`;
  return `${formatDate(start, 'medium')} – ${formatDate(end, 'medium')}`;
}

export function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return `${formatDate(todayISO(d), 'numeric')} à ${nowTimeHM(d)}`;
}

export function relativeDays(days: number): string {
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  if (days === -1) return 'hier';
  return days > 0 ? `dans ${days} j` : `il y a ${-days} j`;
}
