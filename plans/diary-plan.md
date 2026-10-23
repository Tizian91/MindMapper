# MindMapper – Plan Tagebuch / Laborbuch

Stand: 23.10.2026, mit dem Nutzer abgestimmt. Grundregeln des Projekts gelten weiter: Modell in `MM.state.doc` ändern → `MM.commit()`, keine Build-Tools, keine ES-Module, alles über `window.MM`, UI-Texte englisch mit deutscher Übersetzung (`i18n-de2.js`). Keine externen Bibliotheken (offline, Sicherheit).

## Ziel

Neben Tages-, Wochen- und Monatsplänen gibt es **Tagebücher**. Einträge schreibt man als eigene Note (Typ `diary`) irgendwo in den Maps. Das Tagebuch sammelt sie und zeigt sie ansprechend als Buch: **eine Seite pro Tag**, mehrere Einträge pro Seite. Jeder Eintrag hat eine Kopfzeile mit der Note, an der er hängt. Seiten können Sticker, Bilder und Zeichnungen als Overlay bekommen. Auch als Laborbuch nutzbar (Seite abschließen = einfrieren).

## Entscheidungen

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Live oder Archiv | **Live** aus den Maps; Knopf **„Seite abschließen“** friert den Tag ein (Laborbuch). |
| 2 | Datum eines Eintrags | Eigenes Metafeld **Tagebuch-Datum** (Standard: heute, änderbar) plus **Uhrzeit** des Anlegens; Einträge eines Tages nach Uhrzeit sortiert, Uhrzeit wird angezeigt. |
| 3 | Mutternote(n) | Nur Notes, deren **Pfeil auf die Tagebuch-Note zeigt**. Mehrere Mütter **nebeneinander**. Zusätzlich die **Master-Task**: von der Mutter aus Pfeile beliebig weit nach oben verfolgen (auch über normale Notes und Bilder), die **oberste Task** nennen – keine Zwischenstufen. Beispiel Subtask → Bild → Note → Tagebuch: Mutter „Note“, Master-Task der Subtask. Beim Abschließen eingefroren. |
| 4 | Inhalt | **Markdown**: Überschriften, Absätze, Listen, fett/kursiv, Links, **Tabellen**, **Bilder im Text** (einfügen per `Ctrl+V` / Drag & Drop, gespeichert in `doc.assets`). Eigener kleiner Markdown-Renderer, alles escaped. |
| 5 | Kopfzeile | Titel, Map, Status, Fortschritt, Deadline, Tags der Mutter(n) + Master-Task. |
| 6 | Overlays | **Pro Seite** (gehören zu Tagebuch + Datum). |
| 7 | Seitenlänge | Seite **wächst mit**, kein Umbruch. **Leere Tage überspringen.** |
| 8 | Gestaltung | **Frei einstellbar pro Tagebuch**: Schrift (Arial, Times New Roman, Georgia, Comic Sans MS, Segoe Print, …), Schriftgröße, Text- und Akzentfarbe, Papierfarbe, Linierung (keine / Linien / Karos / Punkte). Gilt **nur im Tagebuch**, nicht in den Maps. |
| 9 | Ablage | Ordner `Diaries/` im Projektordner, **eine Datei pro Tagebuch** `Diaries/<Name>.diary.json` (Einstellungen, Overlays, eingefrorene Seiten). Einträge bleiben in den Maps. Sidebar: eigener Bereich mit „+ New diary“. |
| 10 | Navigation | Öffnen aus der **Sidebar** und per **↗ an der Tagebuch-Note** (springt direkt zu deren Seite). **←/→** blättert, **Mausrad** scrollt, **Kalender** zum Springen (Tage mit Einträgen markiert). |
| 11 | Export | **Drucken / PDF** über den Druckdialog des Browsers mit eigenem Druck-Layout (Seite, Zeitraum, ganzes Tagebuch). |
| 12 | Laborbuch | **„Seite abschließen“ reicht** (privater Gebrauch). Wieder öffnen nur mit Rückfrage. |
| 13 | Abgrenzung | Tagebuch-Notes **nicht** in Overview / Auslastung, **kein** Carry-over. „Move to map“ geht. |
| 14 | Aussehen auf der Map | Kopf wie bei To-do-Listen (Balken mit Datum, Uhrzeit, Tagebuchname), **warme Papierfarbe** ähnlich To-do, darunter **kompakte Vorschau** des gerenderten Markdowns (gekürzt). Doppelklick bearbeitet den Markdown-Text. |

## Datenmodell

**Tagebuch-Note** (`node.type = 'diary'`):
```
node.text   = Markdown-Inhalt (Bilder als ![Beschreibung](asset:<imageId>))
node.diary  = { book: '<Name des Tagebuchs>', date: 'YYYY-MM-DD', time: 'HH:MM' }
node.editedAfterClose = true   // gesetzt, wenn die Note nach dem Abschluss ihrer Seite geändert wurde
```
`normalizeDoc`: `book` als String, `date`/`time` gegen Regex prüfen (sonst heute / leer), `asset:`-Verweise nur auf vorhandene `data:image/`-Assets.

**Tagebuchdatei** `Diaries/<Name>.diary.json`:
```
{
  "name": "Laborbuch",
  "style": { "font": "Georgia", "fontSize": 15, "text": "#2d2a26", "accent": "#b7791f",
             "paper": "#fdf8ec", "ruling": "lines" },
  "pages": {
    "2026-10-23": {
      "closed": null | { "at": "2026-10-23T18:04", "entries": [ <eingefrorener Eintrag> ] },
      "overlays": [ { "id", "kind": "sticker|image|draw", "x", "y", "w", "h", ... } ]
    }
  },
  "assets": { "<id>": "data:image/..." }   // Bilder der Overlays und eingefrorener Einträge
}
```
Eingefrorener Eintrag: `{ id, path, time, html? / markdown, header: { mothers: [...], master } }` – Markdown + Bilddaten werden kopiert, damit die Seite unabhängig von den Maps bleibt.

Overlay-Positionen relativ zur Seite (x in Prozent der Seitenbreite, y in px ab Seitenanfang), weil die Seite mitwächst.

## Stufen

### Stufe 1 – benutzbar ✅ (23.10.2026)
- Note-Typ `diary` (`state.js`: Katalog, Preset, normalize; `render.js`: Kopf wie To-do + Markdown-Vorschau; `panel.js`: Tagebuch-Auswahl, Datum, Uhrzeit).
- Markdown-Renderer `js/markdown.js` (Überschriften, Absätze, Listen, fett/kursiv, Links, Tabellen, Bilder `asset:`, Code). Alles escaped, Links nur `http(s):`/`mailto:`.
- Bilder beim Bearbeiten einfügen (`Ctrl+V`, Drag & Drop) → Asset + Markdown-Verweis an der Cursorposition.
- Tagebuchdateien: anlegen, lesen, schreiben (`project.js`). **Scan anpassen:** heute zählt jede `.json`-Datei als Map ([project.js:134](../js/project.js)) – `.diary.json` ausnehmen und separat sammeln.
- Sidebar: Bereich „Diaries“ mit „+ New diary“.
- Leseansicht `js/diary.js`: großes Fenster (wie Overview), Seiten pro Tag aus allen Maps (über `MM.load.docs()`), Kopfzeilen (Mütter + Master-Task), ←/→, Scrollen, Sprung aus der Note (↗).
- Ausnahmen: Overview, Auslastung, Carry-over ignorieren `diary`.

### Stufe 2 – schön und archivfest
- Gestaltung pro Tagebuch (Einstellungsdialog in der Leseansicht).
- Kalender zum Springen.
- „Seite abschließen“ / „Wieder öffnen“ (mit Rückfrage), Hinweis „nach Abschluss geändert“ an der Note.

### Stufe 3 – komplett
- Seiten-Overlays: Sticker (Emoji-Picker), Bilder, Zeichnungen (Wiederverwendung von `draw.js`-Geometrie).
- Druck / PDF: Druck-Stylesheet, Auswahl Seite / Zeitraum / alles.

## Offene Punkte für die Umsetzung
- Wie die Leseansicht Maps liest, die noch nicht im Cache sind (`MM.load.refresh()` abwarten).
- Umbenennen eines Tagebuchs: `node.diary.book` in allen Maps nachziehen (wie Link-Pflege beim Umbenennen von Maps).
- Gleichzeitiges Schreiben (R7) betrifft auch Tagebuchdateien.
