# MindMapper – Plan Routine-Kategorien, Freizeit-Routinen, Serie

Stand: 24.10.2026, mit dem Nutzer abgestimmt, **noch nicht umgesetzt**. Grundregeln des Projekts gelten weiter (Modell in `MM.state.doc` → `MM.commit()`, keine Build-Tools, alles über `window.MM`, UI-Texte englisch mit deutscher Übersetzung, Handbuch mitpflegen).

## Ziel

Routinen sollen auch **motivieren**, nicht nur Zeit von der Kapazität abziehen. Beispiel: „Schlagzeug: Rhythmus-Übungen, 30 min pro Woche“ soll im Wochenplan abhakbar erscheinen, aber **nicht** von der Arbeitszeit abgehen (Freizeit).

## Heute (zum Vergleich)

- Routine = Note mit `node.repeat` (wöchentlich an Tagen, monatlich, Zeitbudget pro Woche, Urlaub). Dauer = *Estimate*.
- Mit Schätzung zieht jede Routine Zeit von der Kapazität ab (`routines.js` `minutesOn`, `workload.js`).
- Pläne: Routinen mit festem Tag → Tagesspalte; Wochenbudgets → Liste „Routines this week“.

## Etappe A – Kategorien, Freizeit, Zettel, „x-mal pro Woche“ (umgesetzt und getestet 24.10.2026)

### Kategorien
- **Zuweisen:** Panel → Details, unter *Repeat* eine Zeile **Category** (Auswahl: *(none)*, vorhandene Kategorien, *New category…* → Name eintippen, sofort angelegt und gewählt). Gespeichert als `repeat.category` = ID der Kategorie (Umbenennen ändert nichts an den Routinen).
- **Verwalten:** Panel ohne Auswahl (Einstellungen), Abschnitt **Routine categories**: Name, Emoji, Häkchen **Leisure** (Freizeit), umbenennen, löschen (Routinen → *(none)*).
- **Speicherort:** pro Projektordner in `mindmapper.settings.json` (`routineCategories: [{ id, name, emoji, leisure }]`), wie die Kapazität – Arbeits- und Privatordner haben eigene Kategorien. Ohne Projektordner: im Browser.
- Routinen **ohne Kategorie** verhalten sich wie heute.

### Freizeit
- Routinen einer Freizeit-Kategorie ziehen **nichts** von der Kapazität ab (auch keine Konflikte), ihre Dauer bleibt als Info sichtbar.
- Workload-Seite: in der Liste *Routines* weiter sichtbar, aber ausgegraut mit „leisure – not counted“.

### Kategorie-Zettel im Wochenplan
- Jede Kategorie mit Routinen in dieser Woche bekommt eine eigene Liste „<Emoji> <Name>“ (statt der einen Liste „Routines this week“); Routinen ohne Kategorie bleiben in „Routines this week“.
- Auf den Zettel kommen: Wochenbudgets und „x-mal pro Woche“. Routinen mit **festem Tag** bleiben in der Tagesspalte (Eintrag wie heute).
- **Nur im Wochenplan**, nicht im Tagesplan.
- Nachtragen / Aufräumen beim Öffnen (siehe `addToPlan` mit `fill`) und ↗ gelten auch für die Zettel. Zettel-Listen erkennen: Tag `routines` + `routineCategory` an der Liste (statt Suche nach dem Titel).

### Neue Wiederholungsart „x-mal pro Woche“
- Felder: Anzahl (1–7) und *Estimate* je Mal. Zettel: so viele Kästchen wie Male („Rhythmus (30m)“ ×3).
- Kapazität (nur ohne Freizeit): Anzahl × Dauer pro Woche, verteilt wie ein Wochenbudget.
- Merkliste `doc.planned`: ein Schlüssel je Kästchen (`<id>@<sonntag>#<n>`), damit beim Nachtragen genau die fehlenden ergänzt werden und gelöschte nicht wiederkommen.

### Zu prüfen beim Umsetzen
- `MM.normalizeRepeat` (state.js): `category`, neue Art `times` mit `times`.
- `R.minutesOn`, `workload.js` (Kapazität, Konflikte, Liste), `R.addToPlan` (Zettel), Aufräumen (Zettel haben keine Deadline → Datum = Sonntag der Woche wie heute bei „Routines this week“), `doneState` / Mit-Abhaken (Zettel ohne Deadline → kein Abgleich mit Tagesplänen, wie heute).
- Bestehende Liste „Routines this week“ in alten Wochenplänen weiter erkennen.

## Etappe B – Serie und Verlauf (klein, danach bewerten)

- Daten gibt es schon: abgehakte / offene 🔁-Einträge mit Datum in den Plänen. Gezählt wird pro Routine und Woche (Einträge aus Tages- und Wochenplan desselben Datums nur einmal).
- Woche **erfüllt**: alle Termine dieser Woche abgehakt (fester Tag) bzw. mindestens x Kästchen (x-mal pro Woche) bzw. das Budget-Kästchen.
- Anzeige knapp: im Panel der Routine-Note und auf der Workload-Seite: **Verlauf** der letzten 8 Wochen (▣ erfüllt, □ nicht, · kein Plan) und **Serie** („4 weeks in a row“).
- Grenzen (ins Handbuch): Wochen ohne Wochenplan zählen nicht; gelöschte Einträge („fällt aus“) zählen nicht als verpasst; gezählt wird das Abhaken.
- Nach ein paar Wochen Nutzung bewerten – bringt es nichts, fliegt es wieder raus.

## Reihenfolge

1. Etappe A (testen, committen) 2. Etappe B. Die Cloud-Etappe 3 (pCloud) läuft parallel weiter, sobald die Client-ID da ist.
