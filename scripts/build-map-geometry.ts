// Builds src/livemap/lux-geometry.json from the official administrative limits
// (Administration du cadastre et de la topographie, data.public.lu, WGS84 file
// "communes4326.geojson"). No dependencies; run on a machine with network access:
//   npm run map:geodata -- --url <URL of communes4326.geojson>
//   npm run map:geodata -- --file ./communes4326.geojson [--tolerance 35] [--name-field COMMUNE]
//   npm run map:geodata -- --check-places        (verifies every place lies inside Luxembourg)
import { readFileSync, writeFileSync } from 'node:fs';
import { PLACES } from '../src/livemap/places';

type Ring = [number, number][];
const args = process.argv.slice(2);
const arg = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const OUT = 'src/livemap/lux-geometry.json';
const tol = Number(arg('tolerance') ?? 35);

function simplify(ring: Ring, tolM: number): Ring {
  if (ring.length < 5) return ring;
  // Closed ring: first == last, so split at the vertex farthest from the start and simplify both halves.
  const [x0, y0] = ring[0];
  const closed = x0 === ring[ring.length - 1][0] && y0 === ring[ring.length - 1][1];
  if (closed) {
    let k = 1, best = -1;
    ring.forEach(([x, y], i) => { const d = (x - x0) ** 2 + (y - y0) ** 2; if (d > best) { best = d; k = i; } });
    const a = simplifyOpen(ring.slice(0, k + 1), tolM), b = simplifyOpen(ring.slice(k), tolM);
    const out = [...a, ...b.slice(1)];
    return out.length >= 4 ? out : ring;
  }
  return simplifyOpen(ring, tolM);
}

function simplifyOpen(ring: Ring, tolM: number): Ring {
  if (ring.length < 3) return ring;
  const lat0 = ring[0][1] * Math.PI / 180;
  const m = ring.map(([lon, lat]) => [lon * 111320 * Math.cos(lat0), lat * 110540]);
  const keep = new Uint8Array(ring.length); keep[0] = keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1, dmax = 0;
    const [ax, ay] = m[a], [bx, by] = m[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - m[i][1]) - (ax - m[i][0]) * (by - ay)) / len;
      if (d > dmax) { dmax = d; best = i; }
    }
    if (best > 0 && dmax > tolM) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  const out = ring.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5] as [number, number]);
  return out;
}

function inside([x, y]: [number, number], ring: Ring): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

async function main() {
  if (args.includes('--check-places')) {
    const geo = JSON.parse(readFileSync(OUT, 'utf8'));
    if (!geo.communes.length) { console.error('Aucune géométrie : lancez d’abord la génération.'); process.exit(1); }
    let bad = 0;
    for (const p of PLACES) {
      const hit = geo.communes.find((c: { rings: Ring[] }) => c.rings.some((r) => inside([p.lon, p.lat], r)));
      if (!hit) { bad++; console.log(`HORS LUXEMBOURG ? ${p.id} (${p.lat}, ${p.lon})`); } else console.log(`${p.name.padEnd(22)} → commune ${hit.name}`);
    }
    process.exit(bad ? 2 : 0);
  }
  const file = arg('file'), url = arg('url');
  if (!file && !url) {
    console.error('Indiquez --file <communes4326.geojson> ou --url <adresse>. Source : https://data.public.lu/fr/datasets/limites-administratives-du-grand-duche-de-luxembourg/');
    process.exit(1);
  }
  const raw = file ? JSON.parse(readFileSync(file, 'utf8')) : await (await fetch(url!)).json();
  const feats = raw.features ?? [];
  const first = JSON.stringify(feats[0]?.geometry?.coordinates ?? []).match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (first.some((v: number) => Math.abs(v) > 180)) {
    console.error('Coordonnées projetées (LUREF, EPSG:2169) détectées : utilisez le fichier WGS84 « communes4326.geojson ».');
    process.exit(1);
  }
  const nameField = arg('name-field');
  const communes = feats.map((f: { properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }) => {
    const props = f.properties ?? {};
    const name = String(nameField ? props[nameField] : ['COMMUNE', 'commune', 'NOM', 'nom', 'NAME', 'name', 'LAU2_NAME'].map((k) => props[k]).find((v) => typeof v === 'string') ?? '?');
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates as Ring[]] : (f.geometry.coordinates as Ring[][]);
    return { name, rings: polys.flat().map((r) => simplify(r, tol)) };
  });
  const points = communes.reduce((a: number, c: { rings: Ring[] }) => a + c.rings.reduce((b, r) => b + r.length, 0), 0);
  writeFileSync(OUT, JSON.stringify({
    source: 'Limites administratives du Grand-Duché de Luxembourg, Administration du cadastre et de la topographie (data.public.lu)',
    license: 'Voir la licence indiquée sur data.public.lu (CC0 au moment de l’intégration).',
    generatedAt: new Date().toISOString(), communes,
  }));
  console.log(`${communes.length} communes, ${points} points (tolérance ${tol} m) → ${OUT}`);
}
void main();
