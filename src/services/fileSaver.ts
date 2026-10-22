/**
 * Saves a generated file. Inside the claude.ai artifact viewer, plain
 * download links are inert, so the platform "downloads" capability is used;
 * in a normal browser (local dev, Cloudflare Pages) a Blob link is used.
 * Results are reported honestly: no "saved" toast unless the save happened.
 */
export type SaveOutcome = 'saved' | 'declined' | 'unavailable';

interface DownloadsApi { save(req: { filename: string; data: string | Blob | ArrayBuffer | ArrayBufferView }): Promise<unknown> }
interface ClaudeHost { use(name: string): Promise<unknown> }

let downloadsPromise: Promise<DownloadsApi | null> | null = null;

function host(): ClaudeHost | null {
  const c = (globalThis as { claude?: ClaudeHost }).claude;
  return c && typeof c.use === 'function' ? c : null;
}

export function isFramedHost(): boolean {
  return !!host();
}

function downloads(): Promise<DownloadsApi | null> {
  const h = host();
  if (!h) return Promise.resolve(null);
  if (!downloadsPromise) downloadsPromise = h.use('downloads').then((x) => (x as DownloadsApi) ?? null).catch(() => null);
  return downloadsPromise;
}

export async function saveFile(filename: string, data: Uint8Array | string, mime: string): Promise<SaveOutcome> {
  if (host()) {
    const api = await downloads();
    if (!api) return 'unavailable';
    try {
      await api.save({ filename, data: typeof data === 'string' ? data : new Blob([data as BlobPart], { type: mime }) });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string })?.code;
      return code === 'declined' ? 'declined' : 'unavailable';
    }
  }
  try {
    const blob = new Blob([data as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

export function saveMessage(outcome: SaveOutcome, what: string): { text: string; tone: 'success' | 'warning' | 'error' } {
  if (outcome === 'saved') return { text: `${what} : enregistrement lancé.`, tone: 'success' };
  if (outcome === 'declined') return { text: `${what} : enregistrement annulé.`, tone: 'warning' };
  return { text: `${what} : le téléchargement n’est pas disponible dans cet affichage.`, tone: 'error' };
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('Lecture du fichier impossible.'));
    r.readAsText(file);
  });
}
