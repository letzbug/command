import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { isValidISODate } from '../domain/dates';
import '../styles/date-fr.css';

const toFr = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
const toIso = (text: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isValidISODate(iso) ? iso : null;
};

/** Day/month/year date entry independent of browser locale. API keeps ISO YYYY-MM-DD. */
export function DateFR({ value, onChange, min, required, ariaLabel }: {
  value: string; onChange: (iso: string) => void; min?: string; required?: boolean; ariaLabel?: string;
}) {
  const [text, setText] = useState(toFr(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setText(toFr(value)); setInvalid(false); }, [value]);
  const commit = () => {
    if (!text.trim() && !required) { onChange(''); setInvalid(false); return; }
    const next = toIso(text);
    if (!next || (min && next < min)) { setInvalid(true); setText(toFr(value)); return; }
    setInvalid(false);
    setText(toFr(next));
    if (next !== value) onChange(next);
  };
  const onPickerChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInvalid(false);
    onChange(e.target.value);
    setText(toFr(e.target.value));
  };
  return <span className="date-fr-wrap">
    <input type="text" inputMode="numeric" className="date-fr-text" aria-label={ariaLabel} aria-invalid={invalid}
      placeholder="JJ/MM/AAAA" value={text} required={required} title="Format JJ/MM/AAAA"
      onChange={(e) => { setText(e.target.value); setInvalid(false); }}
      onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    <span className="date-fr-picker">
      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>
      <input type="date" aria-label={`${ariaLabel ?? 'Date'} — calendrier`} value={value || ''} min={min} onChange={onPickerChange} tabIndex={0}/>
    </span>
  </span>;
}
