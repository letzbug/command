# UniPop Live Map – Le Luxembourg en mouvement

Neues Modul mit einer gemeinsamen Kartenengine und zwei Modi:

- **Planning:** eigener Menüpunkt **UniPop Live Map** direkt unter **Équipe** (Route `#carte`).
- **Live Display:** die eigenständige Seite `carte.html` für öffentliche Bildschirme.

Die Oberfläche ist vollständig französisch.

## Was geändert wurde, und warum

| Datei | Änderung |
|---|---|
| `src/ui/uiStore.ts`, `src/app/App.tsx`, `src/features/search/CommandPalette.tsx`, `src/ui/icons.tsx` | Neue Route `carte`, Menüpunkt „UniPop Live Map“ unter Équipe, Kartensymbol. |
| `index.html` (Projektstamm) | Durch den neuen Build ersetzt (enthält die Karte). |
| `carte.html` (Projektstamm, neu) | Display-Seite neben `index.html`, für GitHub Pages. |
| `scripts/build-single.mjs` | Baut zusätzlich `dist-single/carte.html`. `index.html` wird wie bisher gebaut. |
| `package.json` | Neue Skripte `map:geodata` und `e2e:carte`. |
| `tsconfig.core.json` | Die neuen reinen Logikdateien werden im strikten Type-Check mitgeprüft. |

Nicht angefasst wurden:
- Datenmodell, Repositories, Backups und Login/Profile
- Supabase-Dateien und Policies
- Kalender, Impression & exports
- die Seite Équipe (Datei wieder identisch mit eurer ZIP)
- UniPop Local Display

## Neue Dateien

```
src/livemap/places.ts        Ortsverzeichnis (WGS84) und konservative Ortszuordnung
src/livemap/model.ts         Zeitlogik (Europe/Luxembourg), Live/Jour/Semaine, Gruppierung, Kennzahlen, Zeitband
src/livemap/layout.ts        Projektion, überlappungsfreie Bubble-Anordnung (deterministisch)
src/livemap/feed.ts          öffentlicher, datensparsamer Veranstaltungs-Feed (Export und strikter Parser)
src/livemap/config.ts        Karten-Einstellungen (separat in localStorage, nicht im Planungsdatenmodell)
src/livemap/geometry.ts      Grundkarten-Slot; lux-geometry.json wird von map:geodata erzeugt
src/livemap/LiveMap.tsx      gemeinsame Kartenkomponente (SVG-Grundkarte, HTML-Bubbles)
src/livemap/livemap.css      Karte, Display, helles und Nacht-Thema, reduced motion
src/features/team/LiveMapSection.tsx   Planning-Modus (Seite UniPop Live Map)
src/display/carte.tsx        eigenständige Display-Seite
scripts/build-map-geometry.ts Pipeline für GeoJSON-Gemeindegrenzen (data.public.lu)
scripts/vectorize-act-map.py  Vektorisierung der ACT-Gemeindekarte (TIFF) → lux-geometry.json
tests/livemap.test.ts        15 automatisierte Tests (Szenarien A–L)
e2e/livemap.mjs              Browser-Abnahme (12 Schritte)
```

## Zeitfilter

Alle Uhrzeiten sind Wanduhrzeiten in **Europe/Luxembourg**. Sommer- und Winterzeit werden über `Intl` berechnet, unabhängig von der Zeitzone des Geräts.

| Situation | Status |
|---|---|
| Beginn in der Zukunft | à venir |
| Beginn erreicht, Ende noch nicht | en cours |
| Ende erreicht | terminé (verschwindet im Live-Modus) |
| Beginn bekannt, Ende fehlt | ab Beginn „horaire à confirmer“: weder als laufend noch als beendet behauptet, keine erfundene Dauer |
| Kurs ganz ohne Uhrzeit | „horaire à confirmer“, den ganzen Tag sichtbar |
| Veranstaltung ohne Uhrzeit | „toute la journée“, den ganzen Tag sichtbar |
| Mehrtägige Veranstaltung | an jedem Tag der Laufzeit sichtbar |
| Abgesagt | „annulé“, nie als stattfindend gezählt, verschwindet nach seinem Zeitfenster |

- **Live-Modus:** Die Bubble zählt laufende, kommende und noch nicht bestimmbare Aktivitäten. Beendete fallen heraus. Wenn das Letzte endet, blendet die Bubble weich aus.
- **Datum im Planungstool:** Es gilt das Datum, das der Kalender auch verwendet (`focusDate`). Vergangene Tage erscheinen als Tagesbilanz, zukünftige mit allen geplanten Aktivitäten. Über „En direct“ wechselt man für heute zwischen Live und ganzem Tag.
- **Wochenansicht:** Sie fasst nur nach Ort zusammen und ist vom Live-Modus getrennt.
- **Projekte:** Langlaufende Planungsobjekte (Typ *Projet*) sind keine Veranstaltungen an einem Ort und erscheinen nicht auf der Karte.

## Orte

Zugeordnet wird in dieser Reihenfolge:
1. manuelle Zuordnung
2. markante Standorte im Standortnamen (z. B. Belval)
3. Quartiere nur dann, wenn die Ortschaft Luxemburg-Stadt ist („Rue de la Gare, Esch“ bleibt Esch)
4. Ortschaft

Unbekannte Orte werden **nie** auf der Karte platziert. Sie erscheinen im Planning unter „Lieux non localisés“ und lassen sich dort einem Ort zuordnen oder ausblenden. Kurse „DISTANCE“ werden separat gezählt.

**Neuen Ort ergänzen:** einen Eintrag in `src/livemap/places.ts` hinzufügen, mit Name, WGS84-Koordinaten, Typ, Rang und Aliasen (klein, ohne Akzente). Danach `npm test`.

Die Koordinaten sind Ortszentren mit etwa ±1 km Genauigkeit. Mit installierten Gemeindegrenzen prüft `npm run map:geodata -- --check-places`, in welcher Gemeinde jeder Ort liegt.

## Grundkarte und Geodaten

Die Grundkarte (Landesgrenze und 100 Gemeinden) stammt aus der offiziellen ACT-Karte *Carte des communes et sections cadastrales, état du 01.01.2018* (1:100 000, TIFF). `scripts/vectorize-act-map.py` macht daraus `src/livemap/lux-geometry.json` (146 KB):

1. **Georeferenzierung über das aufgedruckte LUREF-Gitter.** E 50 000 liegt bei x = 484 px, N 140 000 bei y = 455 px, 1181 px entsprechen 10 km (8,467 m/px, also 1:100 000 bei 300 dpi). Die Karte ist nordorientiert.
2. **Umrechnung LUREF (EPSG:2169) → WGS84:** inverse Transversal-Mercator-Projektion (Hayford 1924) plus 7-Parameter-Helmert (PROJ-Parameter).
3. **Flächen:** Die Landesfläche entsteht durch Flutfüllung außerhalb der Landesgrenze, die Gemeinden als Flächen zwischen den blauen Gemeindegrenzen. Die Analyse läuft bei 17 m Rasterauflösung, die Vereinfachung der Konturen mit etwa 25 m Toleranz.
4. **Ergebnis:**
   - 102 Gemeinden erkannt (Stand 2018).
   - Die Fusionen von 2023 (Bous-Waldbredimus, Groussbus-Wal) sind angewendet, also **100 Gemeinden**.
   - Fläche 2629 km² (offiziell 2586 km²; die Differenz ist die Linienbreite).
   - Die Extrempunkte liegen auf etwa 100 m genau.
5. **Gegenprüfung:** Alle 80 Orte des Ortsverzeichnisses liegen innerhalb der Landesfläche. Auf einem Kontrollbild fallen sie auf die gedruckten Ortsnamen der ACT-Karte.

**Lizenz:** Auf der Karte steht *« Origine Cadastre : droits réservés à l’État du Grand-Duché de Luxembourg (2018) »*. Dieselben Grenzen veröffentlicht die ACT auch als Open Data auf data.public.lu. Vor einer öffentlichen Nutzung bitte die Freigabe mit der ACT bzw. den Lizenzhinweis auf data.public.lu bestätigen. Für eine spätere Aktualisierung mit den aktuellen Open-Data-Grenzen: `npm run map:geodata -- --file communes4326.geojson`.

## Datenschutz und öffentliche Datenfreigabe

Die öffentliche Seite kann auf GitHub Pages für alle erreichbar sein. Darum gilt:

- **Kurse:** Sie kommen aus der bereits öffentlichen `trainings.json`, mit dem bestehenden UNIPOP-Filter. Angezeigt und gecacht werden nur Titel, Thema, Zeiten, Ort und Saal. Formateurs, Beschreibungen, Kontakte und Anmeldedaten werden direkt nach dem Laden verworfen.
- **Veranstaltungen:** Sie liegen intern nur im Browser des Planungstools. Das Display liest ausschließlich `carte-evenements.json`, und diese Datei entsteht nur durch einen bewussten Export:
  - Équipe → Carte UniPop → *Publication sur l’écran public* → Veranstaltungen anhaken → *Exporter le flux public*.
  - Exportiert werden nur Titel, Typ, Daten und Uhrzeiten, Ort und Absage, mit nicht-internen IDs.
  - Notizen, Beschreibungen, Verantwortliche, Team-Kürzel, Aufgaben und Einstellungen gehen nie in die Datei.
  - Der Parser des Displays verwirft zusätzlich alle unbekannten Felder.
- Keine Schlüssel, keine Schreib-Endpunkte, keine Supabase-Zugriffe vom Display.

**Später mit Supabase (vorbereitet, nicht umgesetzt):** eine eigene Tabelle oder View nur für veröffentlichte Veranstaltungen, mit genau diesen Feldern. Ein Cloudflare Worker würde sie serverseitig lesen und als `carte-evenements.json` ausliefern. Eure bestehenden Tabellen und Policies bleiben dabei unberührt.

## GitHub Pages und UniPop Local Display

1. `npm run build:single` erzeugt `dist-single/index.html` (Planungstool) und `dist-single/carte.html` (Display).
2. `carte.html` neben eure `index.html` ins Pages-Repo legen, dazu bei Bedarf `carte-evenements.json`.
3. Display-URL: `https://<konto>.github.io/<repo>/carte.html`

URL-Parameter:

| Parameter | Bedeutung |
|---|---|
| `cours=<url>` | andere Kursquelle |
| `evenements=<url>` | anderer Feed |
| `theme=nuit` | dunkles Thema |
| `eco=1` | sparsamste Animationen für schwache Geräte |
| `rotation=<s>` | Wechselintervall des Standort-Spotlights, `0` = aus |
| `date=YYYY-MM-DD&heure=HH:MM` | Zeitsimulation für Tests |

Für den Raspberry Pi die Display-URL im Kiosk-Modus öffnen, z. B. `chromium-browser --kiosk --noerrdialogs --disable-session-crashed-bubble <URL>`. Die Seite braucht keine Bedienung.

Aktualisierung und Ausfallverhalten:
- Die Uhr prüft alle 10 Sekunden und aktualisiert bei Minutenwechsel.
- Die Daten werden alle 5 Minuten geladen, bei Fehlern mit Backoff bis 20 Minuten und sofort, wenn die Verbindung zurückkommt.
- Bei einem Ausfall bleibt die letzte gültige Ansicht aus dem lokalen Cache stehen, mit dezentem Hinweis in der Fußzeile.

**Hinweis zur Kursquelle:** Die Standard-URL zeigt auf einen festen Commit von `franks_magic` und ändert sich deshalb nie. Für ein lebendes Display `cours=` auf den Branch-Pfad setzen (`…/main/data/trainings.json`) oder den Commit regelmäßig aktualisieren.

## Tests

- `npm test` → `tests/livemap.test.ts`: 15/15 bestanden (Szenarien A, B, C, D, E, F, G, H, K, L, Gruppierung, Zeitband).
- `npm run e2e:carte` → alle Schritte bestanden. Geprüft wurden:
  - Menüpunkt „UniPop Live Map“ direkt unter Équipe, Seite Équipe unverändert
  - Display bei 1920×1080, 3840×2160, im Nachtmodus und auf 390×844
  - Live-Zählung um 14:30, 18:40 und 21:00
  - Netzausfall
  - keine internen Daten auf dem Schirm und im Cache
  - Planning: Datumswechsel, Zuordnung unbekannter Orte, Export des öffentlichen Feeds
  - Regression aller Seiten inklusive A0-PDF
- **Vorbestehend:** 4 Tests in `tests/core.test.ts` schlagen fehl. Die Datei ist unverändert gegenüber eurer ZIP; die Tests prüfen noch das alte Demo-Verhalten, das ihr bewusst entfernt habt (UNIPOP-Filter, kein Demo-Fallback).

**Nicht getestet:**
- echte `trainings.json` über das Netz
- echte Gemeindegrenzen (Pipeline nur mit synthetischen Daten geprüft)
- Raspberry Pi und echte 48-Zoll-Displays
- Firefox und Safari (nur Chromium)
- Dauerbetrieb über mehrere Tage
- Einbindung ins UniPop Local Display
- Type-Check der React-Komponenten (`@types/react` war nicht verfügbar)

## Achtung beim Deployment

Die `index.html` im Projektstamm ist jetzt der neue Build. Sie enthält die Karte und damit auch eure **Schulferien-Ergänzung** aus `src/`, die laut `README_KALENDER_EMAIL.txt` noch isoliert getestet werden sollte. Der vorherige Stand liegt in eurer ursprünglichen ZIP.

Für GitHub Pages `index.html` und `carte.html` aus dem Projektstamm hochladen, danach mit Strg + Umschalt + R neu laden. Die im Browser gespeicherten Planungsdaten bleiben erhalten.
