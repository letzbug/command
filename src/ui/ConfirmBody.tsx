import type { ReactNode } from 'react';

export function ConfirmBody(p: { title: string; body?: ReactNode; confirmLabel: string; cancelLabel?: string; danger?: boolean; close: (v?: unknown) => void }) {
  return (
    <div className="dlg-body">
      <h2 className="dlg-title">{p.title}</h2>
      {p.body ? <div className="dlg-text">{p.body}</div> : null}
      <div className="dlg-actions">
        <button type="button" className="btn btn-ghost" onClick={() => p.close(false)}>{p.cancelLabel ?? 'Annuler'}</button>
        <button type="button" autoFocus className={`btn ${p.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => p.close(true)}>{p.confirmLabel}</button>
      </div>
    </div>
  );
}
