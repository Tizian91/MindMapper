# MindMapper – Plan Themenblöcke (Notizblock mit A4-Seiten)

Stand: 11.11.2026, mit dem Nutzer abgestimmt. Grundregeln des Projekts gelten weiter: Modell in `MM.state.doc` ändern → `MM.commit()`, keine Build-Tools, keine ES-Module, alles über `window.MM`, UI-Texte englisch mit deutscher Übersetzung (`i18n-de2.js`). Keine externen Bibliotheken.

## Ziel

Schnelles Mitschreiben wie in einem Papierblock (z. B. in einem Training): **pro Thema ein Block** mit festen **A4-Seiten**, auf die man primär mit dem **Stift** schreibt, oder Text tippt, Geometrien zeichnet und **Fotos** einfügt (direkt aus der Kamera, Android-Tablet/-Handy). Alle vorhandenen Zeichenfunktionen werden wiederverwendet.

Abgrenzung zum Tagebuch: Das Tagebuch ist zeitlich (eine Seite pro Tag, Markdown-Einträge aus den Maps, Laborbuch-Abschluss). Der Block ist eine freie Zeichenfläche mit fester Seitengröße. **Keine Vermischung der Datenmodelle**, Verbindung nur über Seitenlinks.

## Entscheidungen

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Was ist ein Block? | **Eine Map** (normales Map-JSON) mit zusätzlichem Feld `page`. Die Seiten sind feste A4-Bereiche *in* dieser Map, keine eigenen Dateien. |
| 2 | Ablage | Ordner `Blocks/` im Projektordner (Sidebar: „Blöcke“), eine Datei pro Block (`<Thema>.mindmap.json`, wie jede Map), Unterordner zum Gruppieren erlaubt. Eigener Sidebar-Bereich mit „+ New block“, Blöcke erscheinen nicht unter den Maps. |
| 3 | Seitenanordnung | Seiten **untereinander** in Weltkoordinaten. Anzeige: Seitenmodus (eine Seite eingepasst, ◀ ▶) – freies Scrollen bleibt möglich, die Seitenanzeige folgt. |
| 4 | Viewer | **Kein separater Viewer** – der Editor im Seitenmodus *ist* der Viewer (Leiste wie im Tagebuch). Schreiben direkt auf der angezeigten Seite. |
| 5 | Zugehörigkeit zur Seite | Ergibt sich aus der **y-Position**, kein Feld an den Notizen. |
| 6 | Über den Seitenrand | Erlaubt (kein hartes Begrenzen beim Schreiben), außerhalb leicht markiert; der PDF-Export schneidet an der Seite ab. |
| 7 | Notiz-Typen | **Alle verfügbar** (es ist eine Map). Block-Leiste mit Schnellknöpfen ✍ Stift, T Text, 📷 Kamera, 🖼 Galerie, ☐ To-Do; „+ Insert“ bleibt vollständig. |
| 8 | Aufgaben aus Blöcken | Erscheinen in **Overview / Auslastung** wie aus jeder Map, Herkunft „Block · S. n“. |
| 9 | Performance | Notizen außerhalb **aktuelle Seite ±1** bekommen `display: none` (Klasse `offpage`), DOM-Elemente bleiben erhalten. |
| 10 | Bilder in Maps / Tagebuch | **Unverändert eingebettet** (`doc.assets`). Keine Dateiverweise in normalen Maps. |
| 11 | Bilder im Block | **Als Dateien** in `Blocks/_images/<blockId>/<imgId>.jpg`, verkleinert auf max. 1600 px, JPEG 80 %. Ordner hängt an der **Block-ID**, nicht am Namen (Umbenennen ohne Kopieren der Bilder). |
| 12 | Bild Block → Map/Tagebuch | Beim Kopieren / „Move to map“ **eingebettet** (Datei gelesen → data-URL). |
| 13 | Bild Map → Block | Beim Einfügen als Datei im Blockordner abgelegt. |
| 14 | Bildverwaltung | Pro Block (🖼 Bilder in der Leiste): Vorschau, Größe, Datum, „Seite n“ (Sprung) bzw. „unbenutzt“, ⤓ einzeln / alle, „Unbenutzte löschen“ mit Bestätigung. Dateien werden **nie automatisch** gelöscht. |
| 15 | Original herunterladen | **⤓ Original speichern** an jeder Bildnotiz (Kontextmenü + Panel), auch in normalen Maps. |
| 16 | Export | PDF über den Druckdialog: **eine A4-Seite pro Blatt, Maßstab 1:1**; Auswahl aktuelle Seite / Bereich / alle. |
| 17 | Verbindung Tagebuch | **Seitenlinks** `Blocks/FIB-Training.mindmap.json#3` öffnen den Block auf Seite 3; „Link auf diese Seite kopieren“ in der Leiste. |

## Datenmodell

**Block-Datei** `Blocks/<Name>.mindmap.json` – normales Map-JSON plus:
```
"page": {
  "id":      "b7x3k",               // Block-ID, fest ab Anlegen; Bildordner Blocks/_images/<id>/
  "size":    "A4",                  // vorbereitet für A5 / A3
  "orient":  "portrait",            // portrait | landscape
  "count":   4,                     // Anzahl Seiten (>= 1)
  "ruling":  "grid",                // none | lines | grid | dots (wie DY.RULINGS)
  "paper":   "#fdfdf8",
  "created": ["2026-11-11", ...]    // Datum je Seite (Kopfzeile); Länge = count
}
```
`normalizeDoc`: `page` nur übernehmen, wenn gültig; `id` gegen `/^[a-z0-9]{4,16}$/`, `count` 1…999, `created` auf `count` auffüllen/kürzen, Farbe/Regex wie `cleanStyle` im Tagebuch.

**Seitengeometrie** (CSS-px, 96 dpi → Druck 1:1):
- A4 hoch 794 × 1123, quer 1123 × 794; Abstand `GAP = 40`.
- Seite *k* (ab 0): `x = 0`, `y = k · (H + GAP)`. `pageOf(y)`, `pageBox(k)` in `notebook.js`.
- Kopfzeile innerhalb der Seite oben (ca. 28 px, dezent): *Thema · Seite n · Datum*.

**Bildnotiz im Block:**
```
{ "type": "image", "imageFile": "b7x3k/i4h2a.jpg", "imageId": null, ... }
```
- `imageFile` relativ zu `Blocks/_images/`, gegen `/^[a-z0-9]+\/[a-z0-9]+\.(jpg|png|webp|gif)$/` geprüft (kein `..`, keine fremden Pfade).
- Anzeige über Blob-URL-Cache (`readBlob` → `URL.createObjectURL`), in Dropbox zusätzlich IndexedDB-Cache (offline). Fehlt die Datei: Platzhalter „Bild fehlt“.
- Dateien werden nie überschrieben (neue ID pro Bild) → keine Sync-Konflikte bei Bildern.

## Ausführungsreihenfolge

Reihenfolge so gewählt, dass der Block **nach Schritt 2 schon auf dem Tablet nutzbar** ist (Stift, Text, Geometrien), und jeder Schritt einzeln testbar und committbar bleibt. Bilder kommen vor dem Export, weil der Export Datei-Bilder einbetten muss.

### Schritt 1 – Grundgerüst: Block anlegen und Seiten sehen
- `state.js`: `doc.page` in `normalizeDoc` (+ beim Speichern erhalten, `project.js` Zeile mit `nodes/edges/assets/view/...`).
- `js/notebook.js` (neu): Konstanten, `isBlock()`, `pageBox(k)`, `pageOf(y)`, `currentPage()`.
- `render.js`: Seitenebene unter `#group-layer` – Blätter mit Schatten, Papierfarbe, Lineatur (CSS-Hintergründe wie Tagebuch), Kopfzeile; graue Fläche drumherum (`#viewport.block-mode`).
- `project.js`: Ordner `Blocks/` aus der Map-Liste ausnehmen, eigener Sidebar-Bereich „Blocks“, Dialog „New block“ (Name, Hoch/Quer, Lineatur, Papierfarbe), `_images/` ausblenden.
- `templates.js`: Vorlage „block“ (leere Map + `page` mit neuer ID, 1 Seite).
- `index.html`, `sw.js` (Dateiliste + `CACHE`-Version), `cloud.html` neu erzeugen (`tools/make_cloud_html.py`).

### Schritt 2 – Seitenmodus und Bedienung
- Block-Leiste: `📓 Name | ◀ Seite n / N ▶ | + Page | ⋯ | ✍ T 📷 🖼 ☐ | 🖼 Images | 🎨 | 🖨`.
- Blättern: ◀ ▶, Pfeiltasten / Bild auf/ab, Wischen; Seite auf Bildschirmbreite bzw. -höhe einpassen (`doc.view`). Doppeltipp auf den grauen Rand passt wieder ein. Beim freien Scrollen folgt die Anzeige.
- Seite anlegen (+ Page, optional automatisch beim Schreiben unten auf der letzten Seite), Seitenmenü ⋯: davor einfügen, löschen (mit Rückfrage, wenn nicht leer), nach oben / unten. Umsetzung = Notizen um Seitenhöhe verschieben, **ein Undo-Schritt**.
- Beim Öffnen: Stift aktiv, letzte Seite bzw. zuletzt angesehene Seite.
- 🎨: Papier, Lineatur, Ausrichtung für den Block.
- Strg+A im Seitenmodus = aktuelle Seite.
- Performance: Klasse `offpage` (aktuelle Seite ±1 sichtbar), Neuberechnung nur bei Seitenwechsel; Verbindungen mit beiden Enden unsichtbar ebenfalls ausblenden.
- Notizen über den Seitenrand: leichte Markierung.

### Schritt 3 – Bilder als Dateien im Block
- `images.js`: `prepareBlock(file)` (1600 px, JPEG 0.8; PNG mit Transparenz bleibt PNG), `writeBlob` nach `Blocks/_images/<id>/<imgId>.<ext>`, Notiz mit `imageFile`. Ohne Projektordner (Block als Einzeldatei geöffnet): eingebettet wie bisher.
- 📷 Kamera: `<input type="file" accept="image/*" capture="environment">`; 🖼 Galerie: ohne `capture`, mehrfach. Einfügen auf der sichtbaren Seite oben an freier Stelle, ~Seitenbreite minus Rand; danach Stift aktiv lassen (Zeichnungen verankern sich wie bisher am Bild).
- Einfügen per Zwischenablage / Drag & Drop im Block → ebenfalls Datei.
- `render.js`: `imageFile` über Blob-URL-Cache anzeigen, Platzhalter bei fehlender Datei; `cloud-dropbox.js`: IndexedDB-Cache für Bilder.
- Kopieren / „Move to map“ (`actions.js` Copy/Paste, `transfer.js`): Block → Map bettet ein, Map → Block legt Datei an.
- Block löschen (Rückfrage „auch N Bilder löschen?“ → `removeDir`), Block duplizieren (neue ID, Bilder kopieren), Umbenennen/Verschieben ohne Bildaktion.
- Bildverwaltung pro Block (Dialog): Liste aus `backend.list(Blocks/_images/<id>)`, abgeglichen mit den Bildnotizen des Blocks.
- ⤓ Original speichern an Bildnotizen (Datei bzw. data-URL), auch in normalen Maps.

### Schritt 4 – PDF-Export seitenweise
- `export.js`: im Block eigener Modus – je Seite ein Druckblatt, `@page { size: A4 portrait|landscape; margin: 0 }`, Ausschnitt = `pageBox(k)`, kein Skalieren. Vor dem Kopieren `offpage` aufheben, Datei-Bilder als data-URL einbetten (`embedImages`).
- Auswahl: aktuelle Seite / Seiten von–bis / alle.

### Schritt 5 – Seitenlinks und Übersicht
- `links.js`: Map-Link mit `#n` → Block öffnen, Seite n anzeigen; Label „📓 Name · S. n“.
- „Link auf diese Seite kopieren“ in der Block-Leiste (für Tagebuch-Einträge / Maps).
- `overview.js`: Herkunft von Aufgaben aus Blöcken als „Block · S. n“, Sprung auf die Seite.

### Schritt 6 – Texte, Handbuch, Abschluss
- Übersetzungen (`i18n-de2.js`), `HANDBUCH.md` + `HANDBUCH.html` (Kapitel „Blöcke“), README-Code-Tabelle (`notebook.js`), Tastenkürzel-Liste.
- Test auf Android-Tablet (Stift, Kamera, Dropbox) und am PC (lokaler Ordner, Druck).

## Offene Punkte / später
- Weitere Formate (A5, A3, Endlos-Seite).
- Automatische neue Seite: Schwelle im Test festlegen, ggf. abschaltbar.
- Seitenvorschau-Leiste (Miniaturen) zum schnellen Springen.
- Seite eines Blocks „abschließen“ (wie Laborbuch), falls als Nachweis gewünscht.
- Nur sichtbare Seiten überhaupt ins DOM legen (erst bei sehr großen Blöcken nötig).

## Fortschritt

**11.11.2026 – Schritt 1 und 2 umgesetzt** (im Headless-Chrome getestet: Seiten, Sidebar, Dialog, Blättern, Seiten einfügen / verschieben / löschen, Hoch/Quer, Undo, nur nahe Seiten gezeichnet).
- Blöcke liegen als `Blocks/<Thema>.mindmap.json`; ob eine Map ein Block ist, entscheidet `doc.page`, nicht der Ordner.
- `doc.page` ist Teil des Undo-Snapshots (Seiten einfügen / löschen / verschieben ist ein Undo-Schritt).
- Mausrad scrollt im Block durch die Seiten, Strg + Mausrad zoomt. Bild ↑/↓, ←/→ (ohne Auswahl), Pos1/Ende blättern. Strg+A wählt die aktuelle Seite, „Einpassen“ passt die aktuelle Seite ein.
- Stift wird beim Öffnen eines Blocks nur auf Touch-Geräten automatisch eingeschaltet (am PC würde sonst die Maus zeichnen).
- Noch offen aus Schritt 2: automatische neue Seite beim Schreiben unten, Doppeltipp auf den Rand, Verbindungspfeile außerhalb ausblenden (nur Notizen werden ausgeblendet).
- `cloud.html` von Hand ergänzt (Python fehlte); beim nächsten Lauf von `tools/make_cloud_html.py` entsteht dasselbe.
