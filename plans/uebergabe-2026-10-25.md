# Übergabe an den nächsten Chat – Stand 25.10.2026

Dieses Protokoll fasst einen langen Arbeits-Chat zusammen, damit ein neuer Chat nahtlos weitermachen kann. Zuerst lesen: dieses Protokoll, dann `plans/cloud-touch-plan.md` und `plans/routine-categories-plan.md`.

## Arbeitsweise (mit dem Nutzer abgestimmt)

- Der Nutzer testet jede Änderung im Browser (PC: lokale `index.html` = aktueller Arbeitsstand, Strg+F5; Handy: über die Cloudflare-Adresse). **Commit + Push auf `main` erst nach seinem OK.** Für Handy-Tests darf vorher gepusht werden, wenn er zustimmt (rückgängig per `git revert`).
- Sprache mit dem Nutzer: Deutsch. UI-Texte englisch, deutsche Übersetzung in `js/i18n-de2.js` (neue Texte) bzw. `js/i18n.js` (Schlüssel-Texte wie Toolbar). Handbuch `HANDBUCH.md` (deutsch) bei jeder Funktion mitpflegen.
- **Erzeugte Dateien vor jedem Commit neu bauen** (mit dem Miniconda-Python des Nutzers, `python.exe -I`; Pfad steht in Claudes Notizen):
  - nach Änderung an `HANDBUCH.md`: `tools/make_handbook_html.py .` → `HANDBUCH.html` (der Hilfe-Knopf öffnet die HTML-Seite)
  - nach Änderung an `index.html`: `tools/make_cloud_html.py .` → `cloud.html`
- Logik-Tests ohne Browser: `tools/tests/` (siehe README dort), laufen mit VS Codes Electron (`ELECTRON_RUN_AS_NODE=1 …/Code.exe`). Node ist nicht installiert.
- Lange Ersetzungen am besten als Python-Skript-Datei im Scratchpad (Heredocs mit vielen Anführungszeichen scheitern in der Bash-Shell).
- Der Datenordner des Nutzers am PC darf zur Fehlersuche **nur gelesen** werden (Pfad in Claudes Notizen; das Repo ist öffentlich – keine persönlichen Pfade hineinschreiben).

## Varianten und Adressen

| Variante | Adresse | Inhalt |
|---|---|---|
| lokal | `index.html` (Repo-Ordner) bzw. `https://tizian91.github.io/MindMapper/` | rein lokal, Content-Security-Policy blockiert jede Verbindung nach außen. Der Nutzer arbeitet damit (auch Arbeitsordner). |
| Cloud | `https://mindmapper.tizian-arold.workers.dev/` → `cloud.html` (Cloudflare Workers, `_redirects`) | lokaler Ordner **oder** pCloud; pCloud-Teil nur unter dieser Adresse aktiv |

Cloudflare: `wrangler.jsonc`, `.assetsignore` (veröffentlicht nur die App). Jeder Push auf `main` geht automatisch auf GitHub Pages und Cloudflare.

## Was in diesem Chat fertig wurde (alles auf `main`)

- **Cloud-Plan Etappe 1** Speicher-Schnittstelle `js/fsys.js` (`P.backend`, `S.file.backend/path`), **Etappe 2** Konfliktschutz (Version + seit heute Inhalts-Hash; Dialog „Andere Version / Beide / Meine Version behalten“), **Etappe 3 vorbereitet** pCloud-Anbieter `js/cloud-pcloud.js` (fehlt nur `PC.CLIENT_ID`; Antrag bei pCloud läuft, Konto des Nutzers liegt auf US-Servern – Code kann beide Hosts), **Etappe 4** Touch (`js/touch.js`, Handy-Layout, Menüs ohne Seiten-Untermenüs, Tagebuch als skalierte A4-Seite mit Zwei-Finger-Zoom).
- Pläne: Routinen/Termine werden beim Öffnen eines Plans nachgetragen, veraltete offene Einträge entfernt, Namensänderungen übernommen; ↗ an Einträgen springt zur Note.
- Routine-Kategorien mit Freizeit-Häkchen, „x-mal pro Woche“, Zettel je Kategorie im Wochenplan, Verlauf + Serie (`plans/routine-categories-plan.md`, beide Etappen fertig – Nutzen nach ein paar Wochen bewerten).
- PDF-Export der Map (Datei ▾ / Strg+P, `js/export.js`), Handbuch als HTML, neues Handbuch-Kapitel 5 „Die Task“.
- Zu Tasks machen samt Notes darunter (Frage beim Typwechsel, Rechtsklick-Eintrag).
- Drehen von Bildern, Emoji-Notes (skalieren mit dem Rahmen) und Tagebuch-Stickern (Griff, Menü, zwei Finger).
- Schlanke Kopfzeile: Datei ▾, Zoom ▾ (+ Fit), Gruppen mit Trennstrichen, immer einzeilig (wischbar / Mausrad).
- Speichern robuster: eine Schreibaktion pro Datei zur Zeit; Ordnerwechsel löst die Map nicht still; Nachfrage, wenn Änderungen nicht gespeichert werden konnten.
- **Erkenntnis:** Chrome auf **Android kann lokale Projektordner** öffnen (Ordnerauswahl in der Android-Dateiansicht).

## Testergebnis vom 25.10.2026 (letzter Push `809e13e`)

- **Laptop:** alles läuft hervorragend.
- **Handy (Pixel 9a):** Gesten, Tagebuch, Drehen, Speichern stabil. Offene Punkte unten.

## Offene Punkte – Priorität für den nächsten Chat

### 1. Sync-Konflikte mit einem pCloud-synchronisierten Ordner (wichtigstes Thema)

Der Nutzer hat seinen privaten Maps-Ordner am PC per pCloud synchronisiert und denselben Ordner am Handy offline verfügbar gemacht; beide Geräte öffnen ihn als **lokalen** Ordner. Ergebnis (Screenshot): sehr viele Kopien in `Weeks/`:
- `2026-W43.mindmap [conflicted]`, `[conflicted 2]` … `[conflicted 4]`, `Üben U16.mindmap [conflicted]` … `[conflicted 8]` – das sind **Konfliktkopien des pCloud-Sync-Programms** (Namensschema `… [conflicted N]`, hängt vor `.json` → MindMapper listet sie als Maps).
- `Üben U16 (Konflikt 2026-10-25 1228)` – Kopie aus MindMappers eigenem Dialog („Beide behalten“), der beim Bearbeiten am Handy kam (zweiter Screenshot: „Üben U16 wurde woanders geändert“).

Vermutete Ursachen (prüfen):
- MindMapper speichert eine offene Map **etwa 1,2 s nach jeder Änderung** (`storage.js scheduleAutosave` → `writeFile`). Zwei Sync-Programme (PC-Laufwerk, Handy-App) sehen dadurch sehr viele kleine Änderungen; ist die Map auf beiden Geräten offen oder wird gleichzeitig synchronisiert, legt pCloud Konfliktkopien an.
- Nach dem Hochladen schreibt das Sync-Programm die Datei auf dem anderen Gerät neu → MindMapper sieht eine „Änderung von außen“ (berechtigt) → Dialog.
- Unklar: ob das Handy-Offline-Verzeichnis der pCloud-App echte Dateien sind, in die Chrome über den Android-Dateizugriff schreibt, und wie die App dann hochlädt.

Ideen für Lösungen (mit dem Nutzer abwägen):
- Konfliktkopien erkennen (`[conflicted]`, `(Konflikt …)`, `(1)`), **nicht als normale Maps** listen, sondern mit Hinweis („3 Konfliktkopien – vergleichen / aufräumen“) und einer Hilfe zum Zusammenführen/Löschen.
- Seltener auf die Datei schreiben, wenn der Ordner synchronisiert wird (z. B. 10–30 s Ruhe, beim Wechsel der Map / Verlassen sofort) – Einstellung pro Ordner.
- Beim Öffnen / Zurückkehren zur App (Sichtbarkeit `visibilitychange`) prüfen, ob sich die Datei geändert hat, und **vor** dem Bearbeiten neu laden statt erst beim Speichern zu warnen.
- Grundsätzlich: Für PC + Handy ist die eingebaute **pCloud-Anbindung** (ein Weg zur Datei, Konfliktschutz über die API) robuster als zwei Sync-Programme – sobald die Client-ID da ist.

### 2. Übersicht (Overview) am Handy passt nicht

Im Hochformat passt das Fenster nicht, nicht alle Knöpfe erreichbar; erst im Querformat nutzbar. Vermutung: `overview.js applyRect()` setzt eine gespeicherte Position/Größe (`S.settings.overviewRect`) als Inline-Style – die schlägt die Handy-CSS (`@media (max-width: 600px)` → Vollbild); außerdem feste Spaltenbreiten in `.ov-row` (`css/app.css`, `grid-template-columns: 20px minmax(0,1fr) 92px auto 68px 92px`) und eine breite Kopfzeile. Lösung: auf schmalen Bildschirmen kein gespeichertes Rechteck, Kopf/Filter wischbar oder umbrechend, Zeilen zweizeilig.

### 3. Freund sieht in der Cloud-Version nur „Mit pCloud verbinden“

Die Option „Ordner öffnen“ erscheint nur, wenn der Browser `window.showDirectoryPicker` hat (`fsys.js local.supported`). Beim Freund fehlt sie also im Browser – **nicht** weil die Seite erst als App installiert werden muss. Wahrscheinlich: anderer Browser (Samsung Internet, Firefox), älteres Chrome, oder ein iPhone (dort ist jeder Browser technisch Safari/WebKit, ohne Ordnerzugriff). Beim Freund nachfragen: Gerät, Browser, Version. Ggf. Hinweistext in der Seitenleiste ergänzen („Lokale Ordner gehen nur in Chrome/Edge (PC, Android)“).

### 4. Weitere offene Punkte

- pCloud-Client-ID einsetzen (`PC.CLIENT_ID` in `js/cloud-pcloud.js`), Anmeldung + Ordnerwahl testen, Handbuch-Kapitel zur Cloud-Version. Falls pCloud nicht antwortet: OneDrive als Plan B (Etappe 6).
- Optional: Offline am Handy (Etappe 5); leere Tagebuchseite für heute (Sticker ohne Eintrag); PDF über mehrere Seiten; Verlauf/Serie der Routinen nach einigen Wochen bewerten.

## Wichtige Code-Stellen

| Thema | Datei / Funktion |
|---|---|
| Speicher-Anbieter, Konflikt, Hash | `js/fsys.js` (`local.from`, `FS.hash`, `FS.conflict`), `js/cloud-pcloud.js` |
| Projektordner, Schreib-Warteschlange, Versionen | `js/project.js` (`P.writeText`, `versions`, `leaveFolder`, `connected`, `initCloud`) |
| offene Map speichern, Konfliktdialog | `js/storage.js` (`writeFile`, `resolveConflict`, `confirmLeave`, `openPath`) |
| Touch | `js/touch.js`; Griffe/Anker in `js/render.js` (`R.coarse`) |
| Pläne, Routinen, Kategorien, Verlauf | `js/routines.js` (`addToPlan`, `historyIndex`, `history`) |
| Tagebuch-Skalierung | `js/diary.js` (`applyScale`, `scaleOf`, `initPinch`) |
| Kopfzeile | `index.html`, `js/actions.js` (`fileMenu`, `zoomMenu`), `js/i18n.js updateUIStrings` |
