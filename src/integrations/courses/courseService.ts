import type { CourseSnapshot } from '../../domain/types';
import { mapUniPopCourses } from './unipopAdapter';

/**
 * Course data is read-only. This service fetches it, maps it, and decides
 * what to show when the source is unreachable. The fetch target is a plain
 * URL so a Cloudflare Worker proxy can replace the origin without code changes
 * (see workers/course-sync and docs/CLOUDFLARE.md).
 */
export const DEFAULT_COURSE_SOURCE = 'https://raw.githubusercontent.com/letzbug/franks_magic/e82ac606f325b5c7bc2bf5e68eb95aa538ac4403/data/trainings.json';

export class CourseSyncError extends Error {
  constructor(message: string, readonly reason: 'network' | 'http' | 'auth' | 'format') {
    super(message);
  }
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function fetchCourseFeed(url: string, fetchImpl: FetchLike = fetch, timeoutMs = 20000): Promise<unknown> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: ctrl?.signal });
  } catch {
    throw new CourseSyncError(
      'Source inaccessible depuis ce navigateur (blocage CORS, politique de sécurité de la page ou réseau). Un proxy Cloudflare Worker est prévu pour ce cas.',
      'network',
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) throw new CourseSyncError(`Accès refusé par la source (HTTP ${res.status}) : authentification requise.`, 'auth');
  if (!res.ok) throw new CourseSyncError(`La source a répondu par une erreur HTTP ${res.status}.`, 'http');
  try {
    return await res.json();
  } catch {
    throw new CourseSyncError('La réponse de la source n’est pas un JSON valide.', 'format');
  }
}

export function snapshotFromRaw(raw: unknown, source: CourseSnapshot['source'], meta: { url?: string; fileName?: string }): CourseSnapshot {
  const { courses, skipped, warnings } = mapUniPopCourses(raw);
  if (!courses.length) throw new CourseSyncError(warnings[0] ?? 'Aucune formation exploitable dans la source.', 'format');
  const stamp = new Date().toISOString();
  return {
    source,
    sourceUrl: meta.url ?? null,
    fileName: meta.fileName ?? null,
    fetchedAt: stamp,
    lastSuccessAt: stamp,
    warning: warnings.length ? warnings.join(' ') : null,
    skipped,
    courses,
  };
}

export function demoSnapshot(reason: string | null, previousSuccess: string | null = null): CourseSnapshot {
  return { source: 'live', sourceUrl: DEFAULT_COURSE_SOURCE, fileName: null,
    fetchedAt: new Date().toISOString(), lastSuccessAt: previousSuccess,
    warning: reason || 'Aucune formation réelle synchronisée.', skipped: 0, courses: [] };
}

/**
 * Sync policy: on failure keep the last good live/file snapshot (with a
 * warning) rather than replacing real data by demo data.
 */
export async function syncCourses(url: string, previous: CourseSnapshot | null, fetchImpl?: FetchLike): Promise<CourseSnapshot> {
  try {
    const raw = await fetchCourseFeed(url, fetchImpl);
    return snapshotFromRaw(raw, 'live', { url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (previous && previous.source !== 'demo') {
      return { ...previous, warning: `Dernière tentative échouée — ${msg} Les données affichées datent de la dernière synchronisation réussie.` };
    }
    return { ...demoSnapshot(msg, previous?.lastSuccessAt ?? null), sourceUrl: url };
  }
}

export function needsAutoSync(snapshot: CourseSnapshot | null, hours: number, now = Date.now()): boolean {
  if (hours <= 0) return false;
  if (!snapshot) return true;
  if (snapshot.warning && !snapshot.lastSuccessAt) return true;
  const last = Date.parse(snapshot.fetchedAt);
  return !Number.isFinite(last) || now - last > hours * 3_600_000;
}
