/**
 * Ortsverzeichnis der Live-Karte (WGS84, Ortsmitte bzw. Standort).
 * Koordinaten: Ortszentren, Genauigkeit etwa ±1 km. Prüfbar mit
 * `npm run map:geodata -- --check-places` gegen die offiziellen Gemeindegrenzen.
 * Neue Orte: Eintrag ergänzen (id eindeutig, aliases in Kleinbuchstaben ohne Akzente).
 */
export type PlaceKind = 'ville' | 'quartier' | 'site';

export interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: PlaceKind;
  /** Für Quartiere/Standorte: die übergeordnete Stadt (Gruppierung bei Überlappung). */
  parent?: string;
  aliases: string[];
  /** 1 = immer beschriftet, 2 = bei Platz beschriftet, 3 = nur wenn aktiv. */
  rank: 1 | 2 | 3;
}

const P = (id: string, name: string, lat: number, lon: number, kind: PlaceKind, rank: Place['rank'], aliases: string[] = [], parent?: string): Place =>
  ({ id, name, lat, lon, kind, rank, aliases: [id.replace(/-/g, ' '), ...aliases], parent });

export const PLACES: Place[] = [
  // Luxembourg-Ville et quartiers
  P('luxembourg', 'Luxembourg', 49.6116, 6.1300, 'ville', 1, ['luxembourg ville', 'ville de luxembourg', 'letzebuerg', 'luxemburg', 'luxembourg centre', 'ville haute', 'centre ville']),
  P('kirchberg', 'Kirchberg', 49.6290, 6.1650, 'quartier', 3, [], 'luxembourg'),
  P('clausen', 'Clausen', 49.6109, 6.1412, 'quartier', 3, [], 'luxembourg'),
  P('limpertsberg', 'Limpertsberg', 49.6230, 6.1200, 'quartier', 3, [], 'luxembourg'),
  P('bonnevoie', 'Bonnevoie', 49.5975, 6.1390, 'quartier', 3, ['bouneweg'], 'luxembourg'),
  P('gare', 'Gare', 49.6025, 6.1300, 'quartier', 3, ['quartier gare', 'luxembourg gare'], 'luxembourg'),
  P('belair', 'Belair', 49.6110, 6.1110, 'quartier', 3, [], 'luxembourg'),
  P('merl', 'Merl', 49.6050, 6.1050, 'quartier', 3, [], 'luxembourg'),
  P('hollerich', 'Hollerich', 49.5990, 6.1150, 'quartier', 3, [], 'luxembourg'),
  P('gasperich', 'Gasperich', 49.5800, 6.1250, 'quartier', 3, ['cloche d or', 'cloche dor'], 'luxembourg'),
  P('cessange', 'Cessange', 49.5870, 6.1030, 'quartier', 3, [], 'luxembourg'),
  P('hamm', 'Hamm', 49.6100, 6.1750, 'quartier', 3, [], 'luxembourg'),
  P('cents', 'Cents', 49.6180, 6.1640, 'quartier', 3, [], 'luxembourg'),
  P('weimerskirch', 'Weimerskirch', 49.6290, 6.1430, 'quartier', 3, [], 'luxembourg'),
  P('neudorf', 'Neudorf', 49.6150, 6.1550, 'quartier', 3, [], 'luxembourg'),
  P('grund', 'Grund', 49.6085, 6.1340, 'quartier', 3, [], 'luxembourg'),
  P('pfaffenthal', 'Pfaffenthal', 49.6160, 6.1330, 'quartier', 3, [], 'luxembourg'),
  P('eich', 'Eich', 49.6340, 6.1310, 'quartier', 3, [], 'luxembourg'),
  P('dommeldange', 'Dommeldange', 49.6400, 6.1380, 'quartier', 3, [], 'luxembourg'),
  P('beggen', 'Beggen', 49.6430, 6.1270, 'quartier', 3, [], 'luxembourg'),
  // Sud
  P('esch-sur-alzette', 'Esch-sur-Alzette', 49.4958, 5.9806, 'ville', 1, ['esch alzette', 'esch s alzette', 'esch', 'esch sur alzette']),
  P('belval', 'Belval', 49.5040, 5.9480, 'site', 2, ['esch belval', 'cite des sciences'], 'esch-sur-alzette'),
  P('differdange', 'Differdange', 49.5242, 5.8914, 'ville', 1, ['differdingen']),
  P('dudelange', 'Dudelange', 49.4806, 6.0875, 'ville', 1, ['dudelingen']),
  P('sanem', 'Sanem', 49.5481, 5.9289, 'ville', 3, ['suessem']),
  P('belvaux', 'Belvaux', 49.5130, 5.9310, 'ville', 3, ['beles']),
  P('soleuvre', 'Soleuvre', 49.5208, 5.9375, 'ville', 3, ['zolwer']),
  P('schifflange', 'Schifflange', 49.5064, 6.0119, 'ville', 2, ['schifflingen']),
  P('kayl', 'Kayl', 49.4889, 6.0397, 'ville', 3, ['keel']),
  P('tetange', 'Tétange', 49.4720, 6.0400, 'ville', 3, ['teiteng']),
  P('rumelange', 'Rumelange', 49.4597, 6.0306, 'ville', 3, ['rumelingen']),
  P('bettembourg', 'Bettembourg', 49.5167, 6.1028, 'ville', 2, ['beetebuerg']),
  P('mondercange', 'Mondercange', 49.5328, 5.9881, 'ville', 3, ['monnerech']),
  P('petange', 'Pétange', 49.5583, 5.8806, 'ville', 2, ['petingen']),
  P('rodange', 'Rodange', 49.5450, 5.8400, 'ville', 3, ['rodingen']),
  P('bascharage', 'Bascharage', 49.5672, 5.9100, 'ville', 3, ['kaerjeng', 'niederkerschen']),
  P('leudelange', 'Leudelange', 49.5906, 6.0742, 'ville', 3, []),
  P('reckange-sur-mess', 'Reckange-sur-Mess', 49.5625, 6.0833, 'ville', 3, []),
  P('roeser', 'Roeser', 49.5375, 6.1453, 'ville', 3, []),
  P('hesperange', 'Hesperange', 49.5728, 6.1606, 'ville', 3, ['hesper']),
  P('howald', 'Howald', 49.5830, 6.1430, 'ville', 3, [], 'hesperange'),
  P('frisange', 'Frisange', 49.5161, 6.1889, 'ville', 3, []),
  P('mondorf-les-bains', 'Mondorf-les-Bains', 49.5050, 6.2811, 'ville', 2, ['mondorf']),
  P('remich', 'Remich', 49.5450, 6.3672, 'ville', 1, ['reimech']),
  P('schengen', 'Schengen', 49.4708, 6.3667, 'ville', 3, []),
  P('contern', 'Contern', 49.5853, 6.2267, 'ville', 3, []),
  // Centre et ouest
  P('strassen', 'Strassen', 49.6206, 6.0733, 'ville', 3, ['strossen']),
  P('bertrange', 'Bertrange', 49.6111, 6.0500, 'ville', 3, ['bartreng']),
  P('mamer', 'Mamer', 49.6275, 6.0233, 'ville', 3, []),
  P('capellen', 'Capellen', 49.6450, 5.9900, 'ville', 3, []),
  P('steinfort', 'Steinfort', 49.6608, 5.9183, 'ville', 2, []),
  P('kehlen', 'Kehlen', 49.6683, 6.0358, 'ville', 3, []),
  P('walferdange', 'Walferdange', 49.6583, 6.1317, 'ville', 3, ['walfer']),
  P('steinsel', 'Steinsel', 49.6769, 6.1239, 'ville', 3, []),
  P('sandweiler', 'Sandweiler', 49.6164, 6.2214, 'ville', 3, []),
  P('niederanven', 'Niederanven', 49.6522, 6.2533, 'ville', 3, ['senningerberg']),
  P('junglinster', 'Junglinster', 49.7208, 6.2508, 'ville', 2, ['jonglenster']),
  P('mersch', 'Mersch', 49.7489, 6.1061, 'ville', 1, []),
  P('lintgen', 'Lintgen', 49.7225, 6.1281, 'ville', 3, []),
  P('larochette', 'Larochette', 49.7853, 6.2189, 'ville', 3, ['fiels']),
  P('redange', 'Redange', 49.7642, 5.8892, 'ville', 1, ['redange sur attert', 'reiden']),
  P('beckerich', 'Beckerich', 49.7306, 5.8875, 'ville', 3, []),
  P('useldange', 'Useldange', 49.7697, 5.9822, 'ville', 3, []),
  P('bissen', 'Bissen', 49.7869, 6.0661, 'ville', 3, []),
  // Nord
  P('ettelbruck', 'Ettelbruck', 49.8475, 6.1042, 'ville', 1, ['ettelbreck', 'ettelbrueck']),
  P('diekirch', 'Diekirch', 49.8678, 6.1597, 'ville', 1, ['dikrech']),
  P('colmar-berg', 'Colmar-Berg', 49.8111, 6.0911, 'ville', 3, []),
  P('mertzig', 'Mertzig', 49.8336, 6.0050, 'ville', 3, []),
  P('vianden', 'Vianden', 49.9350, 6.2083, 'ville', 2, ['veianen']),
  P('wiltz', 'Wiltz', 49.9661, 5.9325, 'ville', 1, ['wolz']),
  P('esch-sur-sure', 'Esch-sur-Sûre', 49.9111, 5.9353, 'ville', 3, ['esch sur sure', 'esch sauer']),
  P('clervaux', 'Clervaux', 50.0547, 6.0314, 'ville', 1, ['klierf']),
  P('troisvierges', 'Troisvierges', 50.1211, 6.0000, 'ville', 2, ['ulflingen']),
  P('hosingen', 'Hosingen', 50.0122, 6.0897, 'ville', 3, ['parc hosingen']),
  P('weiswampach', 'Weiswampach', 50.1394, 6.0750, 'ville', 3, []),
  // Est
  P('echternach', 'Echternach', 49.8117, 6.4214, 'ville', 1, ['iechternach']),
  P('beaufort', 'Beaufort', 49.8358, 6.2911, 'ville', 3, []),
  P('grevenmacher', 'Grevenmacher', 49.6800, 6.4417, 'ville', 1, ['gr macher', 'maacher']),
  P('wasserbillig', 'Wasserbillig', 49.7144, 6.4994, 'ville', 3, []),
  P('rosport', 'Rosport', 49.8050, 6.5033, 'ville', 3, []),
];

export const PLACE_BY_ID = new Map(PLACES.map((p) => [p.id, p]));

export const normalizeText = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Schlüssel für manuelle Zuordnungen: Ort + Standortname, normalisiert. */
export const locationKey = (locality: string | null | undefined, location: string | null | undefined) =>
  `${normalizeText(locality)}|${normalizeText(location)}`;

export interface PlaceMatch {
  placeId: string | null;
  remote: boolean;
  ignored: boolean;
  via: 'manuel' | 'site' | 'localite' | 'nom' | null;
}

const containsPhrase = (text: string, phrase: string) => !!phrase && (` ${text} `).includes(` ${phrase} `);

function bestAlias(text: string, kinds: PlaceKind[]): Place | null {
  let best: Place | null = null;
  let bestLen = 0;
  for (const p of PLACES) {
    if (!kinds.includes(p.kind)) continue;
    for (const a of p.aliases) {
      if (a.length > bestLen && containsPhrase(text, a)) { best = p; bestLen = a.length; }
    }
  }
  return best;
}

/**
 * Konservative Zuordnung: lieber "nicht lokalisiert" als eine falsche Position.
 * 1. manuelle Zuordnung, 2. Standort/Quartier im Namen oder Ort,
 * 3. Ortschaft (Feld "localité"), 4. Ortsname im Standortnamen nur ohne Ortschaft.
 */
export function matchPlace(locality: string | null | undefined, location: string | null | undefined, overrides: Record<string, string> = {}): PlaceMatch {
  const ov = overrides[locationKey(locality, location)];
  if (ov === 'ignore') return { placeId: null, remote: false, ignored: true, via: 'manuel' };
  if (ov && PLACE_BY_ID.has(ov)) return { placeId: ov, remote: false, ignored: false, via: 'manuel' };
  const loc = normalizeText(locality);
  const name = normalizeText(location);
  if (/\b(distance|en ligne|online|visio)\b/.test(`${loc} ${name}`)) return { placeId: null, remote: true, ignored: false, via: null };
  // Distinctive sites (e.g. Belval) may appear in the venue name whatever the locality.
  const site = bestAlias(`${name} ${loc}`, ['site']);
  if (site) return { placeId: site.id, remote: false, ignored: false, via: 'site' };
  // City quarters only when the locality is that city (or the quarter itself): "Rue de la Gare, Esch" stays in Esch.
  const quarter = bestAlias(loc, ['quartier']);
  if (quarter) {
    const parent = PLACE_BY_ID.get(quarter.parent ?? '');
    const parentInLoc = !!parent && parent.aliases.some((a) => containsPhrase(loc, a));
    const locIsQuarter = quarter.aliases.some((a) => a === loc);
    if (parentInLoc || locIsQuarter) return { placeId: quarter.id, remote: false, ignored: false, via: 'site' };
  }
  if (loc) {
    const city = bestAlias(loc, ['ville']);
    return city ? { placeId: city.id, remote: false, ignored: false, via: 'localite' } : { placeId: null, remote: false, ignored: false, via: null };
  }
  const fromName = bestAlias(name, ['ville']);
  return fromName ? { placeId: fromName.id, remote: false, ignored: false, via: 'nom' } : { placeId: null, remote: false, ignored: false, via: null };
}
