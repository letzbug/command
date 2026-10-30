import { ButtonHTMLAttributes, ReactNode, useEffect, useState } from 'react';
import type { TeamMember } from '../domain/types';
import { Icon, IconName } from './icons';

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';

export function Button({ variant = 'secondary', icon, size, children, className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; icon?: IconName; size?: 'sm' | 'md' }) {
  return (
    <button type="button" {...rest} className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${className}`}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function IconButton({ icon, label, className = '', active, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; active?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={`icon-btn ${active ? 'is-active' : ''} ${className}`}>
      <Icon name={icon} size={18} />
    </button>
  );
}

export function Field({ label, hint, error, children, wide }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${wide ? 'field-wide' : ''} ${error ? 'has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Select<T extends string>({ value, onChange, options, ariaLabel, className = '', disabled }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; ariaLabel?: string; className?: string; disabled?: boolean;
}) {
  return (
    <span className={`select ${className}`}>
      <select value={value} aria-label={ariaLabel} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Icon name="down" size={14} />
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options, ariaLabel, size }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: IconName }[]; ariaLabel: string; size?: 'sm';
}) {
  return (
    <div className={`seg ${size === 'sm' ? 'seg-sm' : ''}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.icon ? <Icon name={o.icon} size={15} /> : null}<span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className={`toggle ${disabled ? 'is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true"><span className="toggle-thumb" /></span>
      <span className="toggle-label">{label}</span>
    </label>
  );
}

export function Progress({ value, tone, label }: { value: number; tone?: 'ok' | 'warn' | 'bad'; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className={`progress ${tone ? `progress-${tone}` : ''}`} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Avancement'}>
      <span style={{ width: `${v}%` }} />
    </span>
  );
}

export function memberDisplayName(member?: TeamMember | null): string {
  if (!member) return '—';
  if (member.code === 'ADMIN-01') return 'Frank_A';
  return member.label?.trim() || 'Membre';
}

export function MemberTag({ member, empty = 'Non assigné' }: { member?: TeamMember | null; empty?: string }) {
  if (!member) return <span className="mtag mtag-empty">{empty}</span>;
  return (
    <span className="mtag" title={memberDisplayName(member)}>
      <span className="mtag-dot" style={{ background: member.color }} />
      {memberDisplayName(member)}
    </span>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'teal'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Empty({ icon = 'info', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={26} />
      <p className="empty-title">{title}</p>
      {children ? <p className="empty-text">{children}</p> : null}
      {action}
    </div>
  );
}

export function useMediaQuery(q: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false);
  const [m, setM] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export const useIsMobile = () => useMediaQuery('(max-width: 760px)');
