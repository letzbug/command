UniPop COMMAND – Erweiterung vom 23.10.2026

QUELLCODE-UPDATE – NICHT DIREKT DEPLOYEN:
Die Dateien unter src/ enthalten die Ergänzung der luxemburgischen Schulferien 2026–2028. Gesetzliche Feiertage bleiben unverändert aktiv. Die beigefügte dist-single/index.html ist die ALTE BUILD-DATEI und enthält diese Ergänzung NOCH NICHT.

Für ein neues Deployment auf einem Entwicklungsrechner mit npm-Zugang:
1. npm install
2. npm run typecheck
3. npm run build:single
4. Erst danach dist-single/index.html isoliert testen und veröffentlichen.

Quellen:
- https://men.public.lu/de/vacances-scolaires.html
- https://men.public.lu/dam-assets/catalogue-publications/enseignement-fondamental/informations-generales/circulaire-printemps-2025.pdf
- https://itm.public.lu/fr/conditions-travail/conges/jours-feries.html

E-MAIL-VERSAND:
Noch nicht implementiert. Empfehlenswert zunächst eine manuelle Bestätigung und Mailto-Entwurf, später ggf. Versand über genehmigten staatlichen SMTP/Microsoft-365-Dienst mit serverseitiger Rechteprüfung, protokolliertem Opt-in/Benachrichtigung und Datenminimierung. Keine SMTP-Zugangsdaten im Browser speichern.
