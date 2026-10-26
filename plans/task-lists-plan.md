# MindMapper – Plan: Aufgabenlisten statt Übertrag

Stand: 26.10.2026, mit dem Nutzer abgestimmt, **noch nicht umgesetzt**. Grundregeln des Projekts gelten weiter: Modell in `MM.state.doc` ändern → `MM.commit()`, keine Build-Tools, keine ES-Module, alles über `window.MM`, UI-Texte englisch mit deutscher Übersetzung in `js/i18n-de2.js`, Handbuch mitpflegen.

## Ziel

Unerledigte Aufgaben werden nicht mehr als Kopie in den nächsten Plan **übertragen**. Jeder Tages-, Wochen- und Monatsplan bekommt stattdessen zwei **Listen mit Verweisen**:

- **Overdue** – alle offenen Haupttasks mit überschrittener Deadline, projektweit, die älteste oben.
- **Open** – alle offenen Haupttasks mit Deadline ab heute bis **4 Wochen** voraus, projektweit, die knappste oben; danach **ohne Deadline**. Was später fällig ist, steht in der Overview (Hinweis am Listenende: „N more in the Overview“).

Die Note bleibt, wo sie entstanden ist (Zusammenhang, Pfeile, Gruppe, Untertasks bleiben beisammen). Die Pläne enthalten nur, was in ihrem Zeitraum entsteht, plus die zwei Listen. Gleiches Prinzip wie 🔁 Routinen und 📌 Termine: Eintrag im Plan, **↗** zur Note, Abhaken wirkt in beide Richtungen.

Tages-, Wochen- und Monatspläne bekommen **denselben Aufbau** – vertraut, und jede der drei Ebenen bleibt optional.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Welche Aufgaben? | nur **Haupttasks** (Tasks ohne Haupttask über sich; eine Task ohne Untertasks ist ihre eigene Haupttask). Untertasks erreicht man über ↗. |
| Welche Notes zählen als „Aufgabe“? | wie in der Overview (`overview.js collect`): Tasks und Notes mit Status / Priorität / Deadline / Schätzung; Status nicht *done*. **Keine Termine** (*Scheduled*), keine Routinen, keine Tagebucheinträge. |
| Eintragstext | Infos zum Entscheiden: `Budget Plan · due Fri 30 Oct · 2/4 sub-tasks · 45 %` (ohne Untertasks: ohne den Teil; ohne Deadline: ohne „due“). |
| Abhaken in der Liste | hakt die Haupttask ab (Status *done*). Hat sie offene Untertasks: Rückfrage „All n open sub-tasks are checked off as well – continue?“ → alle mit abhaken, auch in anderen Maps (abgeleitete Maps). |
| Abhaken an der Note | Eintrag im laufenden Plan wird beim nächsten Öffnen / Nachführen abgehakt. |
| Lose Einträge in Plan-Spalten (Text ohne eigene Note) | werden **weiter übertragen** wie bisher (Liste *Carried over*) – sonst gingen sie verloren. |
| Notes übertragen (Kopie + „→“) | **entfällt**. Die Frage „Carry over n entries?“ gibt es nur noch für lose Einträge. |
| Termine | **nichts davon** – sie stehen als 📌 in der Tagesliste ihres Tages und in der Overview (Ansicht *Appointments*). |
| Vergangene Pläne | werden **nicht** mehr nachgeführt – ihre Listen bleiben als Verlauf, wie sie zuletzt waren. |

## Datenmodell

- Die zwei Listen sind To-do-Notes mit einer Markierung: `n.taskList = 'overdue' | 'open'` (in `state.js normalizeDoc` säubern). Text „Overdue“ / „Open tasks“.
- Ein Eintrag: `item.ref = { id, path }` (Note-ID und Map der Haupttask) – analog zu `item.routine`. Der Text wird beim Nachführen neu geschrieben, abgehakte Einträge behalten ihren Text.
- Die Listen haben **keine** Deadline / Schätzung / Priorität → sie zählen nicht als Aufgabe (`META.isTaskTodo` false) und nicht in Auslastung / Overview. Zusätzlich überspringen `workload.js`, `overview.js collect`, `templates.collectUnfinished`, `routines.addToPlan` Notes mit `taskList`, damit nichts doppelt zählt, auch wenn jemand der Liste eine Deadline gibt.

## Ablauf

1. **Neuer Plan** (`templates.js` day / week / month): zwei leere Listen „Overdue“ (rot umrandet) und „Open tasks“, z. B. unter *Goals* links.
2. **Füllen / Nachführen** (`project.js fillPlan`, läuft schon beim Öffnen eines Tages- / Wochenplans für Routinen und Termine): für Pläne, deren Zeitraum **läuft oder beginnt** (nicht für vergangene):
   - alle Maps lesen (`MM.load.docs()` frisch, wie heute), Haupttasks sammeln, nach Deadline sortieren, auf die zwei Listen verteilen, 4-Wochen-Horizont anwenden;
   - vorhandene Einträge über `ref` abgleichen: neu → anhängen, erledigt → abhaken, Deadline geändert → Text neu / in die andere Liste, nicht mehr vorhanden (gelöscht, keine Haupttask mehr) → offenen Eintrag entfernen, abgehakten behalten;
   - nur schreiben, wenn sich etwas geändert hat (sonst unnötige Schreibvorgänge im Sync-Ordner).
   - Monatspläne: `fillPlan` kennt bisher nur `day` / `week` → um `month` erweitern.
3. **Abhaken in der Liste** (`routines.js track` / `applyDone` erkennen heute `item.routine`): für `item.ref` die Haupttask (und auf Nachfrage ihre Untertasks) in ihrer Map auf *done* setzen (`P.writeMap`, Konfliktschutz wie bisher). Abhaken rückgängig → Haupttask wieder *open*, Untertasks bleiben, wie sie sind.
4. **↗ am Eintrag**: wie bei 🔁 / 📌 (`render.js` zeigt den Sprung bei `it.routine` → auch bei `it.ref`; `routines.js` „Show the note of this entry“ → Note öffnen, Map wechseln).
5. **Übertrag** (`templates.collectUnfinished`, `project.offerCarry`, `markMoved`, `addCarryOver`): nur noch lose Einträge der Plan-Spalten; Notes (`seeds` / `bundles`) entfallen.

## Etappen

**Etappe A – Listen und Nachführen**
- Datenmodell, Vorlagen (Tag / Woche / Monat), `fillPlan` für alle drei, Übertrag nur noch für lose Einträge.
- Eintragstext mit Deadline, Untertasks (erledigt / gesamt), Fortschritt.
- Auslastung / Overview zählen die Listen nicht.
- Test `tools/tests/test_lists.js`: Sammeln (nur Haupttasks, keine Termine, Horizont, Sortierung, ohne Deadline am Ende), Nachführen (neu / erledigt / Deadline geändert / gelöscht), vergangener Plan bleibt.

**Etappe B – Abhaken in beide Richtungen**
- Abhaken in der Liste → Haupttask *done*; Rückfrage bei offenen Untertasks; Untertasks in anderen Maps.
- ↗ am Eintrag.
- Handbuch: Kapitel 8 (Was passiert automatisch? / Carry-over) neu, Kapitel 5 (Der Weg einer Task), Beispielprojekt prüfen.

## Offene Punkte / Risiken

- **Sync-Ordner:** Nachführen schreibt beim Öffnen in den Plan. Nur bei echter Änderung schreiben, damit zwei Geräte nicht ständig dieselbe Datei ändern.
- **Viele Maps:** Das Sammeln liest alle Maps (wie die Overview). Bei großen Projekten am Handy: den Cache `MM.load` nutzen, nicht jedes Mal neu lesen.
- **Bestehende Pläne:** Sie haben noch keine Listen. Beim ersten Öffnen eines laufenden Plans werden sie angelegt (wie Routinen nachgetragen werden). Alte, schon übertragene Kopien bleiben, wie sie sind.
