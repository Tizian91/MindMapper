# Logik-Tests (ohne Browser)

Kleine Testskripte für die Logik, die sich ohne echten Browser prüfen lässt. Sie laden die
Dateien aus `js/` in eine nachgebaute Umgebung (`vm`) und schreiben ihr Ergebnis in eine
Textdatei – erwartete Werte stehen jeweils in Klammern daneben.

Node ist nicht installiert; die Skripte laufen mit dem Electron von VS Code:

```bash
ELECTRON_RUN_AS_NODE=1 "/c/Users/<Name>/AppData/Local/Programs/Microsoft VS Code/Code.exe" \
  tools/tests/test_fill.js "<Pfad zum Repo>" "<Ausgabe>.txt"
```

| Skript | prüft |
|---|---|
| `test_syntax.js` | dass die wichtigsten `js/`-Dateien sich übersetzen lassen |
| `test_fill.js` | Nachtragen / Aufräumen von Routinen und Terminen in Plänen (`routines.js addToPlan`) |
| `test_cat.js` | Routine-Kategorien, Freizeit, „x-mal pro Woche“, Zettel im Wochenplan |
| `test_hist.js` | Verlauf und Serie der Routinen |
| `test_fsys.js` | lokaler Speicher-Anbieter inkl. Konfliktschutz (Version + Inhalts-Hash) |
| `test_queue.js` | eine Schreibaktion pro Datei zur Zeit (`project.js writeText`) |
| `test_touch.js` | Finger-Gesten (`touch.js`) |
| `test_rotate.js` | Drehen: Einrasten, Speichern, zwei Finger auf dem Bild |
| `test_symbol.js` | Emoji-Notes (Erkennung, Drehen) |
| `test_totask.js` | „Zu Tasks machen (mit Notes darunter)“ |
| `test_read.js` | leere / unvollständige Map-Dateien werden neu gelesen, nie als leere Map geöffnet (`project.js readDoc`) |
| `test_carry.js` | Übertrag: nur lose Einträge von Aufgabenlisten, keine Notes, keine Termine (`templates.js collectUnfinished`) |
| `test_lists.js` | Listen *Overdue* / *Open tasks*: nur Haupttasks, Horizont, Sortierung, Nachführen, vergangene Pläne bleiben (`tasklists.js`) |
| `test_assets.js` | Datei in `Assets/` ablegen: dieselbe Datei wird wiederverwendet, keine Kopie „(2)“ (`files.js store`) |
| `test_copies.js` | Konfliktkopien erkennen (pCloud, Dropbox, MindMapper) und an die Map hängen (`project.js copyOf`) |

Einige Skripte rechnen mit dem heutigen Datum (Wochenpläne im Oktober/November 2026);
liegen die Testdaten in der Vergangenheit, Daten im Skript anpassen.
