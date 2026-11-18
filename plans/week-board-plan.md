# MindMapper – Plan: Wochen-Board (Scrumban)

Stand: 18.11.2026, mit dem Nutzer besprochen. **Etappe A umgesetzt** (Commit 2651733, getestet PC + Handy). **Etappe B, Teil 1 umgesetzt** (Commit 25ad773, am PC getestet): Karten verschieben (Ziehen + Menü), Projekt-Menü mit Untertasks, Abhaken in *Fest diese Woche* (`routines.setDone`, Wochenbudgets über ihre Kästchen), Board-Strg+Z, Chip `▦ KW 47` in der Map, Hinweis „✂ nicht zerlegt“ beim Vormerken (aus Etappe C vorgezogen). **Etappe B, Teil 2 umgesetzt, noch nicht getestet / nicht committet:** Karten als Task-Notes (Chips mit Menü, Stoppuhr, Kästchen, Zeilen), Panel für die gewählte Karte (nur Details), Speichern über `board.afterCommit` (Vergleich mit der Kopie beim Zeichnen, Regeln von `MM.commit` für fremde Maps, `P.later`), `MM.selectedNodes` = gewählte Karte im Board-Modus, `tasks.info` für fremde Maps über `board.infoOf`. Offen: Etappe D (Tages-/Monatspläne hinter Einstellung).

## Ziel

MindMapper bekommt zwei gleichwertige **Modi**:

- **Maps** – der Ort zum Denken: strukturieren, Tasks ableiten und zerlegen. Wie heute.
- **Board** – der Ort zum Planen: Welche Aufgaben mache ich **diese Woche**, wie läuft die Woche? Ein Scrumban-Board mit den Spalten **Backlog | To-Do | Doing | Done** und einer Zeile (Swimlane) je Projekt-Tag.

Planungsfragen sollen nicht mehr in den Maps beantwortet werden müssen. Die **Overview** bleibt, wie sie ist (in beiden Modi erreichbar).

**Grundsatz:** Das Board speichert nichts Eigenes. Es ist eine Ansicht auf Daten, die schon an ihrem Platz liegen – Woche, Status und Erledigt-Datum an der Task in ihrer Map, Abhaken von Routinen im Wochenplan. Keine doppelten Daten, keine neuen Sync-Konflikte.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Wo? | eigener **Modus**, kein Reiter in der Overview. Umschalter **Board \| Maps** oben links, zwei große Buttons, auch auf dem Handy. Letzter Modus wird pro Gerät gemerkt (`localStorage`, mit try/catch). |
| Was sieht man im Board-Modus? | das Board. **Keine** Seitenleiste mit Maps, **keine** Map-Werkzeuge (Insert, Pen, Zoom, Views …). Das **Panel** erscheint für die gewählte Karte (wie in der Map). Bleiben: Umschalter, Overview-Button, Theme, Sprache, Statusleiste. |
| Karten | sind die **Task-Notes selbst**, gezeichnet wie in der Map: Titel, Zeilen (lange Texte eingeklappt), Chips mit Klickmenü, ▶/■ Stoppuhr, Kästchen in Zeilen, Fortschritt. Klick auf die Karte → normales Panel (Details, Workload, Zeitliste). Kein eigenes Detailfenster. |
| Text bearbeiten auf dem Board | **nein** – Text ist Denkarbeit (→ ↗ in die Map). Grundsatz des Nutzers: Planung und Ausführung bzw. Denken nicht vermischen. |
| Tasks anlegen auf dem Board | **nein** – eine Task braucht ihren Ort (Haupttask, Pfeile, Gruppe) in einer Map. Auch Zerlegen nur in der Map – große, nicht zerlegte Aufgaben bekommen einen Hinweis (siehe *Große Aufgaben*). |
| Warnung To-Do | nach **Stunden**, Farben wie Workload: grün = passt, gelb > 85 % der verfügbaren Zeit, rot > 100 %. Hinweis „n without estimate“, weil Karten ohne Schätzung nicht mitzählen. |
| Warnung Doing | nach **Kartenzahl**: 1 grün (okay), 2 gelb (grenzwertig), ab 3 rot (Achtung). |
| Was sieht man im Maps-Modus? | wie heute, **kein** Board. |
| Voraussetzung | geöffneter Projektordner (wie Overview). Ohne Ordner: Board-Button ausgegraut mit Hinweis. |
| Swimlanes | **Tags**. In den Einstellungen des Projektordners wird festgelegt, welche Tags Projekte sind (Liste, Reihenfolge = Reihenfolge der Zeilen). Eine Karte kommt in die Zeile ihres **ersten passenden** Tags; alles andere in die Zeile **Other**. |
| Backlog | offene **Haupttasks** aller Maps (wie die Listen *Open tasks* / *Overdue*), nach Deadline sortiert, überfällige rot markiert. Haupttasks **ohne Deadline** unten in ihrer Zeile, **eingeklappt** („n without deadline ▸“). Keine Termine, keine Routinen. |
| To-Do | Karten, die für die angezeigte Woche vorgemerkt sind (`meta.week`), noch nicht in Arbeit. |
| Doing | Status `progress` (*In progress*). |
| Done | Status `done` mit `doneAt` in der angezeigten Woche. Auch Erledigtes, das nicht vorgemerkt war (Markierung „unplanned“). |
| Stunden | **Soll und Plan getrennt.** Soll = was die bestehende Verteilung (Restaufwand bis zur Deadline) dieser Woche je Projekt zuteilt. Plan = Summe der Restaufwände der vorgemerkten Karten. Kopf der To-Do-Spalte: `planned 34 h / 40 h available`. Zeilenkopf: `Soll 20 h · planned 12 h`. |
| Ändert das Vormerken die Rechnung? | **Nein.** Die Verteilung bleibt der neutrale Maßstab (was die Deadlines verlangen), das Vormerken ist die eigene Entscheidung. Würde das Vormerken die Rechnung ändern, wäre der Soll/Plan-Vergleich wertlos. |
| Feste Zeit | Zeile **„Fixed this week“** oben über allen Spalten: 🔁 Routinen mit festem Tag (nach Wochentag), 🔁 Wochenbudgets / „x-mal pro Woche“ mit Kästchen, 📌 Termine mit Tag und Uhrzeit, 🏖 freie Tage – zum **Abhaken**. Ihre Summe erklärt, warum die To-Do-Kapazität kleiner als die Wochenstunden ist. |
| Goals / Notes der Woche | **nicht** auf dem Board. |
| Wochenwechsel | Nicht Erledigtes bleibt in To-Do / Doing stehen und bekommt die Markierung **„from W46“** (Woche bleibt `meta.week`). |
| Blättern | **‹ ›** zwischen Wochen. Kommende Wochen: Karten vormerken, Termine/Routinen werden aus den Notes berechnet (kein Wochenplan nötig). Vergangene Wochen: nur ansehen (was war vorgemerkt, was ist fertig geworden, was ist liegen geblieben). |
| Wochenplan | bleibt als **Speicher im Hintergrund** (Abhaken von Routinen, Verlauf ▣□, Serie, Abgleich mit dem Handy). Wird nicht mehr von Hand angelegt: Das Board legt den Plan der **laufenden** Woche an, wenn er fehlt (damit der Verlauf keine Lücken bekommt). Öffnen zum Vertiefen weiter möglich: **Wochenplan ↗** im Board-Kopf → Maps-Modus. |
| Tages- und Monatspläne | hinter eine Einstellung **„Use day and month plans“**, Standard **aus**. Aus = keine Vorlagen *Day plan* / *Month plan*, kein *Move to map → Today / Next day / Next month*, keine Verknüpfung Monat → Wochen → Tage, kein Füllen / Nachführen dieser Pläne. Vorhandene Pläne bleiben im Ordner und lassen sich öffnen. |
| Termine eintragen | wie heute als Note mit *Scheduled*, in einer beliebigen Map, sobald man davon erfährt. Das Board zeigt sie in ihrer Woche. |

## Datenmodell

- **Neu:** `meta.week = 'YYYY-Www'` (ISO-Woche) an Tasks – „für diese Woche vorgemerkt“. In `state.js normalizeDoc` säubern (Format prüfen, sonst löschen). Löschen = zurück ins Backlog.
- Bestehend, unverändert genutzt: `meta.status` (`progress` → Doing, `done` → Done), `meta.doneAt`, `meta.estimate`, `meta.progress`, `meta.deadline`, `meta.tags`, Untertask-Pfeile, Routinen-Einträge im Wochenplan.
- **Einstellungen des Projektordners** (`mindmapper.settings.json`, wie die Kapazität): `boardLanes: ['Paper', 'Teaching', …]`, `dayMonthPlans: false`.
- `meta.week` an einer Task ändert nichts an Workload, Puffer, Overview, Listen *Open tasks* / *Overdue*.

## Das Board

```
[ Board | Maps ]   ‹  KW 47 · 16.–22. Nov.  ›        Wochenplan ↗   Overview
┌──────────────────────────────────────────────────────────────────────────┐
│ Fixed this week: 🔁 Mo Jour fixe 1h ☐ · 🔁 Mi Group meeting 2h ☐ · 📌 Do Workshop 3h ☐ · 🔁 Betreuung 5h ☐☐☐ │
├──────────┬──────────────┬──────────────────────┬──────────┬──────────────┤
│          │ Backlog      │ To-Do                │ Doing    │ Done         │
│          │              │ planned 34h / 40h    │          │              │
├──────────┼──────────────┼──────────────────────┼──────────┼──────────────┤
│ Paper    │ [card][card] │ [card]               │ [card]   │ [card]       │
│ Soll 10h │              │                      │          │              │
│ plan 8h  │              │                      │          │              │
├──────────┼──────────────┼──────────────────────┼──────────┼──────────────┤
│ Teaching │ …            │ …                    │          │              │
├──────────┼──────────────┼──────────────────────┼──────────┼──────────────┤
│ Other    │ …            │ …                    │          │              │
└──────────┴──────────────┴──────────────────────┴──────────┴──────────────┘
```

- **Karte:** die Task-Note wie in der Map (siehe Entscheidungen), dazu Map-Name und Marker „from W46“, „unplanned“, „1 part this week“ (Haupttask im Backlog, von der ein Teil in To-Do liegt).
- **Verschieben:** Ziehen mit der Maus (Backlog → To-Do setzt `week`, → Doing setzt `progress`, → Done setzt `done`, → Backlog löscht `week`). Auf Touch: Antippen → Menü *To-Do / Doing / Done / Backlog*.
- **Panel** der gewählten Karte: wie in der Map, zusätzlich **Woche**, bei Haupttasks die offenen Untertasks zum einzelnen Vormerken, und **↗ In Map öffnen** (wechselt in den Maps-Modus, öffnet die Map, markiert die Note).
- **Schreiben in andere Maps:** Chips, Stoppuhr (`actual.js AT.toggle` …), Panel und Status ändern heute die Note und rufen `MM.commit()` – das speichert die **offene** Map. Auf dem Board braucht es einen Bearbeitungs-Kontext „Note n in Map p“: dieselben Funktionen ändern die Note im geladenen Dokument der Karte, gespeichert wird über `P.later` / `P.writeMap` (Konfliktschutz wie beim Abhaken aus der Overview). Liegt die Task in der offenen Map: direkt in `S.doc` → `MM.commit()`. Folgeregeln (Untertasks, Deadline-Weitergabe, `doneAt`, Ist-Zeit-Dialog) müssen auch dort laufen.
- **Strg+Z auf dem Board:** eigener Verlauf für die Änderungen auf dem Board (Map + Note + Zustand vorher).

## Große Aufgaben: zerlegt wird in der Map

Entscheidung des Nutzers (Variante A): Auf dem Board wird **nichts zerlegt und nichts angelegt**. Eine große Aufgabe ohne Untertasks ist ein starker Hinweis, dass sie noch nicht durchdacht ist – das Board fordert dazu auf, erst Untertasks zu planen.

- **Haupttask mit Untertasks:** Untertasks einzeln vormerken (Board: die Untertask-Karten; Panel der Haupttask: Liste der offenen Untertasks mit „This week“). Die Haupttask bleibt im Backlog mit „n parts this week“. Wird die Haupttask selbst nach To-Do gezogen: Hinweis „Paper has 4 open sub-tasks – pick the ones for this week“ mit der Liste.
- **Nicht durchdacht** = offener, **nicht aufgeteilter** Restaufwand (Task ohne Untertasks: ihr Rest; Haupttask: `info.rest`) **größer als ein Arbeitstag** (*Hours / work day*).
  - Die Karte trägt dauerhaft den Marker **„✂ not split up“** – im Backlog und auch nach „Plan it anyway“ in To-Do / Doing (nicht wegklickbar; laut Nutzer seltene Einzelfälle, mit der Warnung kann er leben).
  - Beim Vormerken (Ziehen nach To-Do, Menü, Map-Kontextmenü „This week“) erscheint der Hinweis: *„Paper schreiben“ has 30 h that are not split up into sub-tasks. Plan the steps first.* – Buttons **Split up in the map ↗** (Maps-Modus, Note markiert) · **Plan it anyway** · **Cancel**.
- Ohne Schätzung: kein Hinweis zum Zerlegen, aber der bestehende Hinweis „without estimate“.

## In den Maps

- Rechtsklick / Chip-Menü einer Task: **„This week“** / **„Remove from this week“**.
- Kleiner Chip **`W47`** an vorgemerkten Tasks (ein-/ausblendbar mit *Details*).

## Rechnung

- **Soll je Zeile:** pro Item den Wochenanteil aus derselben Verteilung, die `workload.js compute` nutzt (Restaufwand auf die Planungstage bis zur Deadline, gewichtet nach Tagesstunden). Hilfsfunktion in `workload.js`; Test sichert: Summe der Item-Anteile = Wochenwert der Workload-Seite.
- **Verfügbar (To-Do-Kopf):** Wochenkapazität für Projektarbeit wie auf der Workload-Seite (nach Routinen, Terminen, freien Tagen).
- **Plan:** Summe der Restaufwände der Karten in To-Do + Doing der Woche (Haupttask mit Untertasks: nur der noch nicht aufgeteilte Rest, wie in `L.items`).
- Kommende Wochen: dieselbe Rechnung für die angezeigte Woche (heute deckt `compute` diese + 3 Wochen ab – bei Bedarf erweitern).

## Etappen

**Etappe A – Modus und Board zum Ansehen**
- Umschalter Board | Maps, Ein-/Ausblenden der Bereiche, Modus merken; Board-Button ohne Ordner ausgegraut.
- Neues Modul `js/board.js`: Daten sammeln (alle Maps, wie Overview), Spalten, Zeilen, Soll / Plan / verfügbar, Zeile *Fixed this week* (nur Anzeige), Blättern.
- Einstellung `boardLanes` (Eingabe im Panel bei leerer Auswahl, neben *Planning capacity*, mit Tag-Vorschlägen).
- Test `tools/tests/test_board.js`: Zuordnung zu Spalten und Zeilen, erster passender Tag, Soll-Summe = Workload-Wochenwert, Done nur mit `doneAt` in der Woche.

**Etappe B – Planen auf dem Board**
- Bearbeitungs-Kontext für Notes anderer Maps (siehe *Schreiben in andere Maps*), Board-Undo.
- Karten als Task-Notes mit Chips, Stoppuhr, Kästchen; Panel für die gewählte Karte.
- `meta.week`, Verschieben (Ziehen + Touch-Menü), ↗ In Map öffnen.
- Warnungen To-Do (Stunden) und Doing (1 / 2 / 3+).
- Markierungen „from W46“ / „unplanned“.
- Chip `W47` und Menüeintrag in den Maps.
- Abhaken in *Fixed this week* → Einträge im Wochenplan (Plan der laufenden Woche anlegen, wenn er fehlt); 📌 abhaken → Termin-Note *done* (bestehender Abgleich).

**Etappe C – Große Aufgaben**
- Untertasks im Panel der Haupttask vormerken; Hinweis beim Ziehen einer Haupttask mit Untertasks.
- Marker „✂ not split up“ und Hinweis beim Vormerken (Board und Map-Kontextmenü), Sprung „Split up in the map ↗“.

**Etappe D – Tages- und Monatspläne hinter Einstellung, Handbuch**
- Einstellung `dayMonthPlans` (Standard aus) und ihre Wirkung (siehe Entscheidungen).
- Handbuch: neues Kapitel *Board*, Kapitel 8 (Pläne) umschreiben – Wochenplan im Hintergrund, Tages-/Monatspläne optional; Kapitel 5 (Der Weg einer Task) um das Vormerken ergänzen; Screenshots.

## Noch offen (beim Umsetzen klären)

- Schwelle „nicht durchdacht“: vorerst ein Arbeitstag (*Hours / work day*); vom Nutzer nicht ausdrücklich bestätigt – nach den ersten Wochen nachfragen.
- Später möglich: Statistik „vorgemerkt vs. geschafft“ pro Woche (passend zu *Estimates*). Dafür bräuchte es eine Historie (`meta.weeks`), weil `meta.week` beim Zurücklegen ins Backlog gelöscht wird.
