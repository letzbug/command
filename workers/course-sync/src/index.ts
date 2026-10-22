/**
 * Cloudflare Worker: read-only proxy and cache for the UniPop course feed.
 * - Cron (wrangler.toml) refreshes the copy in KV; visitors never hit the source directly.
 * - GET /trainings.json returns the cached JSON with CORS for the app origin only.
 * Free plan friendly: one upstream request per cron run, KV reads per visit.
 */
export interface Env {
  COURSES: KVNamespace;
  SOURCE_URL: string; // https://www.unipop.lu/private/trainings.json
  ALLOWED_ORIGIN: string; // https://<project>.pages.dev
}

async function refresh(env: Env): Promise<{ ok: boolean; count?: number; error?: string }> {
  const res = await fetch(env.SOURCE_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'JSON invalide' }; }
  if (!Array.isArray(data) || data.length === 0) return { ok: false, error: 'Liste vide ou format inattendu' };
  await env.COURSES.put('trainings.json', text, { metadata: { fetchedAt: new Date().toISOString(), count: data.length } });
  return { ok: true, count: data.length };
}

function cors(env: Env, origin: string | null): Record<string, string> {
  return origin === env.ALLOWED_ORIGIN ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors(env, origin), 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
    if (req.method !== 'GET' || url.pathname !== '/trainings.json') return new Response('Not found', { status: 404 });
    const { value, metadata } = await env.COURSES.getWithMetadata<{ fetchedAt: string }>('trainings.json');
    if (!value) return new Response(JSON.stringify({ error: 'Aucune copie en cache : la première synchronisation n’a pas encore eu lieu.' }), { status: 503, headers: { 'Content-Type': 'application/json', ...cors(env, origin) } });
    return new Response(value, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=900', 'X-Fetched-At': metadata?.fetchedAt ?? '', ...cors(env, origin) },
    });
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(refresh(env).then((r) => { if (!r.ok) console.error('course-sync', r.error); }));
  },
};
