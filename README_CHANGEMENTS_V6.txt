UNIPOP LIVE MAP V6 – WOCHE (QUELLCODE)

• carte.html: dezenter Umschalter Aujourd’hui / Semaine.
• Wochenansicht Montag–Sonntag mit Kursen/Events je Standort.
• Wochenzahlen und Wochendiagramm; Tagesansicht bleibt Standard.
• Bereits vorhandene V5-Demo-Filter bleiben unverändert.

WICHTIG ZUM DEPLOYMENT:
Die Dateien src/display/carte.tsx und src/livemap/livemap.css sind angepasst.
Die fertig gebauten HTML-Dateien in dist-single sind NOCH der V5-Stand.
In dieser Umgebung standen die benötigten npm-Abhängigkeiten für einen
verifizierten Neu-Build nicht zur Verfügung. NICHT unverändert live hochladen.
Bitte in einer Node-Umgebung im Projektordner npm ci (bzw. npm install),
danach npm run build:single ausführen und die generierten HTML-Dateien verwenden.
