import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { IconButton } from './kit';
import { Panel, ui, useUI } from './uiStore';

/** Right-hand contextual panel (bottom sheet on phones). Content is rendered by the app. */
export function PanelHost({ render }: { render: (p: Panel) => ReactNode }) {
  const panels = useUI((s) => s.panels);
  const ref = useRef<HTMLDivElement>(null);
  const top = panels[panels.length - 1];
  useEffect(() => {
    if (top) ref.current?.focus({ preventScroll: true });
  }, [top]);
  if (!top) return null;
  return (
    <div className="panel-layer">
      <div className="panel-scrim" onClick={() => void ui.closeAllPanels()} />
      <aside ref={ref} tabIndex={-1} className="panel" role="dialog" aria-modal="false" aria-label="Détails">
        <div className="panel-nav">
          {panels.length > 1 ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => void ui.closePanel()}>
              <Icon name="back" size={15} /><span>Retour</span>
            </button>
          ) : <span />}
          <IconButton icon="x" label="Fermer le panneau" onClick={() => void ui.closeAllPanels()} />
        </div>
        <div className="panel-body" key={`${panels.length}-${JSON.stringify(top)}`}>{render(top)}</div>
      </aside>
    </div>
  );
}

export function DialogHost() {
  const dialog = useUI((s) => s.dialog);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!dialog) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[autofocus], input, select, textarea, button');
    first?.focus();
    return () => prev?.focus?.();
  }, [dialog]);
  if (!dialog) return null;
  return (
    <div className="dlg-layer" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); ui.closeDialog(undefined); } }}>
      <div className="dlg-scrim" onClick={() => ui.closeDialog(undefined)} />
      <div ref={ref} className={`dlg dlg-${dialog.size ?? 'sm'}`} role="alertdialog" aria-modal="true">
        {dialog.render((v) => ui.closeDialog(v))}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <span className="toast-text">{t.text}</span>
          {t.action ? (
            <button type="button" className="toast-action" onClick={() => { t.action!.run(); ui.dismissToast(t.id); }}>{t.action.label}</button>
          ) : null}
          <button type="button" className="toast-close" aria-label="Fermer la notification" onClick={() => ui.dismissToast(t.id)}><Icon name="x" size={14} /></button>
        </div>
      ))}
    </div>
  );
}

export function ContextMenu() {
  const menu = useUI((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(menu.x, window.innerWidth - r.width - 8), y: Math.min(menu.y, window.innerHeight - r.height - 8) });
    ref.current.querySelector<HTMLElement>('button:not([disabled])')?.focus();
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const close = () => ui.closeMenu();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [menu]);
  if (!menu) return null;
  const move = (e: React.KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    if (e.key === 'Escape') ui.closeMenu();
  };
  return (
    <div className="menu-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) ui.closeMenu(); }} onContextMenu={(e) => { e.preventDefault(); ui.closeMenu(); }}>
      <div ref={ref} role="menu" className="menu" style={{ left: pos?.x ?? menu.x, top: pos?.y ?? menu.y }} onKeyDown={move}>
        {menu.items.map((it, i) => (
          <button key={i} type="button" role="menuitem" disabled={it.disabled} className={it.danger ? 'is-danger' : ''} onClick={() => { ui.closeMenu(); it.run(); }}>
            {it.icon ? <Icon name={it.icon} size={16} /> : <span className="menu-gap" />}
            <span>{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Opens a context menu from a right-click or from a "…" button. */
export function menuAt(e: React.MouseEvent, items: Parameters<typeof ui.openMenu>[2]) {
  e.preventDefault();
  e.stopPropagation();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const fromButton = e.type === 'click';
  ui.openMenu(fromButton ? r.left : e.clientX, fromButton ? r.bottom + 4 : e.clientY, items);
}
