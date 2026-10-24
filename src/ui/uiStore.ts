import { createElement, ReactNode, useSyncExternalStore } from 'react';
import { ConfirmBody } from './ConfirmBody';
import type { ISODate, PlanningEvent, Task } from '../domain/types';
import type { IconName } from './icons';

export type Route = 'annee' | 'calendrier' | 'projets' | 'taches' | 'rappels' | 'formations' | 'equipe' | 'carte' | 'impression' | 'parametres';
export const ROUTES: Route[] = ['annee', 'calendrier', 'projets', 'taches', 'rappels', 'formations', 'equipe', 'carte', 'impression', 'parametres'];

export type CalMode = 'annee' | 'trimestre' | 'mois' | 'semaine' | 'jour';
export type LayerKey = 'evenement' | 'projet' | 'formation' | 'echeance' | 'jalon' | 'ferie';
export interface CalFilters {
  layers: LayerKey[];
  location: string;
  theme: string;
  eventId: string;
  ownerId: string;
  status: '' | 'ouvert' | 'en_retard' | 'termine';
}
export const ALL_LAYERS: LayerKey[] = ['evenement', 'projet', 'formation', 'echeance', 'jalon', 'ferie'];
export const DEFAULT_FILTERS: CalFilters = { layers: [...ALL_LAYERS], location: '', theme: '', eventId: '', ownerId: '', status: '' };

export type Panel =
  | { kind: 'day'; date: ISODate; theme?: string | null }
  | { kind: 'event'; id: string; occurrenceKey?: ISODate | null }
  | { kind: 'eventForm'; id?: string | null; occurrenceKey?: ISODate | null; defaults?: Partial<PlanningEvent> }
  | { kind: 'task'; id?: string | null; defaults?: Partial<Task> }
  | { kind: 'course'; id: string };

export interface Toast { id: number; text: string; tone: 'info' | 'success' | 'warning' | 'error'; action?: { label: string; run: () => void } }
export interface DialogState { id: number; render: (close: (v?: unknown) => void) => ReactNode; resolve: (v: unknown) => void; size?: 'sm' | 'md' | 'lg' }
export interface MenuItem { label: string; icon?: IconName; danger?: boolean; disabled?: boolean; run: () => void }
export interface ThemePopoverState { x: number; y: number; date: ISODate; theme: string }

export interface UIState {
  route: Route;
  eventId: string | null;
  panels: Panel[];
  toasts: Toast[];
  dialog: DialogState | null;
  palette: boolean;
  menu: { x: number; y: number; items: MenuItem[] } | null;
  popover: ThemePopoverState | null;
  focusDate: ISODate | null;
  modes: Partial<Record<Route, CalMode>>;
  filters: CalFilters;
  taskView: string;
}

let seq = 1;

class UIStore {
  private listeners = new Set<() => void>();
  private closeGuard: (() => boolean) | null = null;
  state: UIState = {
    route: 'annee', eventId: null, panels: [], toasts: [], dialog: null, palette: false, menu: null, popover: null,
    focusDate: null, modes: {}, filters: DEFAULT_FILTERS, taskView: 'toutes',
  };

  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  get = () => this.state;
  set(patch: Partial<UIState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /* Routing: bare hash tokens (#annee, #taches …) so links survive the artifact viewer. */
  go(route: Route, opts: { eventId?: string | null } = {}) {
    this.set({ route, eventId: opts.eventId ?? null, menu: null, popover: null, palette: false });
    if (typeof location !== 'undefined' && location.hash.slice(1) !== route) {
      try { history.pushState(null, '', `#${route}`); } catch { /* sandboxed viewer */ }
    }
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }
  syncFromHash() {
    const h = typeof location !== 'undefined' ? location.hash.slice(1) : '';
    if ((ROUTES as string[]).includes(h) && h !== this.state.route) this.set({ route: h as Route, eventId: null });
  }

  /* Side panel stack */
  setCloseGuard(fn: (() => boolean) | null) { this.closeGuard = fn; }
  private async guardOk(): Promise<boolean> {
    if (this.closeGuard && this.closeGuard()) {
      const ok = await this.confirm({ title: 'Abandonner les modifications ?', body: 'Les changements non enregistrés seront perdus.', confirmLabel: 'Abandonner', danger: true });
      if (ok) this.closeGuard = null;
      return ok;
    }
    return true;
  }
  async openPanel(p: Panel) {
    if (!(await this.guardOk())) return;
    this.set({ panels: [p], popover: null, menu: null });
  }
  async pushPanel(p: Panel) {
    if (!(await this.guardOk())) return;
    this.set({ panels: [...this.state.panels, p], popover: null, menu: null });
  }
  async replaceTop(p: Panel) {
    this.closeGuard = null;
    this.set({ panels: [...this.state.panels.slice(0, -1), p] });
  }
  async closePanel() {
    if (!(await this.guardOk())) return;
    this.set({ panels: this.state.panels.slice(0, -1) });
  }
  async closeAllPanels() {
    if (!(await this.guardOk())) return;
    this.set({ panels: [] });
  }

  /* Toasts */
  toast(text: string, tone: Toast['tone'] = 'info', action?: Toast['action']) {
    const id = seq++;
    this.set({ toasts: [...this.state.toasts.slice(-1), { id, text, tone, action }] });
    setTimeout(() => this.dismissToast(id), action ? 7000 : 4500);
  }
  dismissToast(id: number) { this.set({ toasts: this.state.toasts.filter((t) => t.id !== id) }); }

  /* Dialogs */
  openDialog<T>(render: DialogState['render'], size: DialogState['size'] = 'sm'): Promise<T | undefined> {
    return new Promise((resolve) => {
      const id = seq++;
      this.set({ dialog: { id, render, size, resolve: resolve as (v: unknown) => void } });
    });
  }
  closeDialog(v?: unknown) {
    const d = this.state.dialog;
    this.set({ dialog: null });
    d?.resolve(v);
  }
  confirm(o: { title: string; body?: ReactNode; confirmLabel: string; cancelLabel?: string; danger?: boolean }): Promise<boolean> {
    return this.openDialog<boolean>((close) => createElement(ConfirmBody, { ...o, close })).then((v) => v === true);
  }

  openMenu(x: number, y: number, items: MenuItem[]) { this.set({ menu: { x, y, items }, popover: null }); }
  closeMenu() { if (this.state.menu) this.set({ menu: null }); }
  openPopover(p: ThemePopoverState) { this.set({ popover: p, menu: null }); }
  closePopover() { if (this.state.popover) this.set({ popover: null }); }
}

export const ui = new UIStore();

export function useUI<T>(selector: (s: UIState) => T): T {
  return useSyncExternalStore(ui.subscribe, () => selector(ui.get()));
}
