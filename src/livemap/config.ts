/**
 * Map settings kept apart from the planning data (no change to the existing
 * schema, repositories or backups): which events are published on the public
 * display, manual venue → place assignments, and the preferred live mode.
 */
export interface LiveMapConfig {
  publicEventIds: string[];
  placeOverrides: Record<string, string>;
  preferLive: boolean;
}

const KEY = 'unipop-livemap-v1';
export const DEFAULT_CONFIG: LiveMapConfig = { publicEventIds: [], placeOverrides: {}, preferLive: true };

export function loadConfig(): LiveMapConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG };
    return {
      publicEventIds: Array.isArray(raw.publicEventIds) ? raw.publicEventIds.filter((x: unknown) => typeof x === 'string') : [],
      placeOverrides: raw.placeOverrides && typeof raw.placeOverrides === 'object' ? raw.placeOverrides : {},
      preferLive: raw.preferLive !== false,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(c: LiveMapConfig): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(c)); return true; } catch { return false; }
}
