# MindMapper – Handbuch

MindMapper ist ein Mindmap- und Planungswerkzeug, das komplett im Browser läuft – ohne Installation, ohne Konto, ohne Internet. Dieses Handbuch erklärt die wichtigsten Funktionen. Die Bezeichnungen der Oberfläche sind englisch und stehen hier **fett**.

> Tipp: Über den Knopf **?** oben rechts in der Toolbar öffnest du dieses Handbuch und die Beispiel-Map jederzeit wieder.

---

## 1. Starten und Speichern

- **Starten:** `index.html` doppelklicken. Empfohlen sind **Edge** oder **Chrome** – nur dort kann MindMapper direkt in Dateien und Ordner schreiben.
- **Einzelne Map:** **Open** / **Save** / **Save as** öffnen und speichern eine Datei `*.mindmap.json`.
- **Als PDF / drucken:** Toolbar **PDF** oder `Ctrl+P`. Im Dialog wählst du **ganze Map**, **sichtbaren Ausschnitt** oder **markierte Notes**, Papier **A4 / A3** und **Quer-, Hochformat oder automatisch**; auf Wunsch stehen Name der Map und Datum oben. Alles wird **auf eine Seite** verkleinert. Für ein PDF im Druckdialog als Drucker „Als PDF speichern“ wählen. Gedruckt wird immer hell (auch im Darkmode); ein aktiver Filter „ausblenden“ gilt auch für den Druck.
- **Projektordner (empfohlen):** In der linken Seitenleiste **Project** → **Open folder…** einen Ordner wählen. Alle Maps darin erscheinen als Liste, Unterordner (z. B. `Weeks/`, `Months/`, `Days/`) werden angezeigt.
  - Maps aus dem Projektordner werden **automatisch gespeichert** (Einstellung „Auto-save project maps into their file“ im Panel rechts, wenn nichts markiert ist).
  - Nach einem Neustart fragt der Browser einmal nach der Erlaubnis: **Reconnect**.
- **Rein lokal:** Diese Version (`index.html`) baut **keine Verbindung nach außen** auf – der Browser blockiert sie (Content-Security-Policy im Kopf von `index.html`). Es gibt keine Cloud-Anbindung, und Bilder aus dem Netz (Markdown `![…](https://…)`) werden nicht geladen; Links öffnest du weiterhin per Klick in einem neuen Tab.
- **Sicherung im Browser:** Zusätzlich wird die offene Map ständig im Browser zwischengespeichert und beim nächsten Start wiederhergestellt.
- **Arbeiten an zwei Rechnern** (z. B. synchronisierter Ordner): Ist die Datei auf der Platte neuer als die Kopie im Browser, lädt MindMapper die Datei. Hattest du lokal ungespeicherte Änderungen, wirst du gefragt.
- **Schutz vor Überschreiben:** MindMapper merkt sich, in welchem Stand eine Map gelesen wurde. Wurde die Datei inzwischen woanders geändert (anderer Rechner, zweiter Tab, Sync-Programm), wird sie **nicht** einfach überschrieben:
  - **Offene Map:** Beim nächsten Speichern fragt MindMapper, welche Version bleiben soll – deine hier oder die andere in der Datei:
    - **Andere Version behalten:** Die Datei wird geladen, deine Änderungen werden verworfen.
    - **Beide behalten:** Deine Version wird als Kopie daneben gespeichert (z. B. `2026-W44 (Konflikt 2026-10-24 1530).mindmap.json`), das Original bleibt unverändert, du arbeitest in der Kopie weiter.
    - **Meine Version behalten:** Die Datei wird überschrieben, die anderen Änderungen gehen verloren.
  - **Andere Maps** (Mit-Abhaken, Move to map, Carry-over, Overview, Umbenennen) und das **Tagebuch:** Statt zu überschreiben, kommt eine Fehlermeldung. Öffne die Map bzw. das Tagebuch neu und wiederhole den Schritt.

## 2. Grundbedienung

| Aktion | So geht's |
|---|---|
| Note einfügen | Rechtsklick auf die leere Fläche → **Insert**, oder **+ Insert** in der Toolbar |
| Text bearbeiten | Doppelklick, oder `Enter` / `F2` |
| Verbundene Note anlegen | `Tab` (rechts neben der markierten Note) |
| Verbinden | Maus über eine Note → blauen Punkt auf eine andere Note ziehen (auf die leere Fläche ziehen = neue Note) |
| Verschieben / Größe | Ziehen; Ecken und Kanten der Markierung ziehen |
| Mehrere markieren | Rahmen aufziehen, oder `Shift` / `Ctrl` + Klick |
| Ansicht verschieben | `Leertaste` + Ziehen oder mittlere Maustaste |
| Zoomen | Mausrad; **Fit** bzw. `Shift+1` zeigt alles |
| Kopieren / Einfügen / Duplizieren | `Ctrl+C` / `Ctrl+V` / `Ctrl+D` |
| Rückgängig / Wiederholen | `Ctrl+Z` / `Ctrl+Y` |
| Löschen | `Entf`; bei Tasks auch der Papierkorb an der Unterkante rechts (beim Überfahren / Markieren) |

- **Rechtsklick** auf eine Note, eine Verbindung oder die Fläche öffnet ein Menü mit allen passenden Befehlen.
- Das **Panel rechts** zeigt die Eigenschaften der Markierung: Typ, Form, Farben, Details. Ist nichts markiert, stehen dort die Einstellungen.
- **Smart guides** und **Grid** helfen beim Ausrichten. `Alt` beim Ziehen schaltet das Einrasten aus.
- **`Ctrl` beim Ziehen** nimmt alles mit, was unter der Note hängt: Notes, auf die ihre Pfeile zeigen (beliebig tief), bei einer Gruppe deren Inhalt, und verankerte Zeichnungen. `Ctrl` darf auch erst während des Ziehens gedrückt oder losgelassen werden – die Unter-Notes kommen dann dazu bzw. springen zurück.
- Verbindungen: Rechtsklick → **Route** (gerade, Winkel, Kurve), **Line**, **Reverse direction**. Doppelklick auf eine Verbindung = Beschriftung.

## 3. Notiztypen

| Typ | Wofür |
|---|---|
| **Note** | Einfacher Text |
| **Heading** | Überschrift, größer und fett |
| **To-Do** | Abhakbare Liste (`Enter` = neuer Eintrag) |
| **Outline** | Gegliederte Stichpunkte (`Tab` / `Shift+Tab` = ein-/ausrücken, Klick auf den Punkt = zuklappen) |
| **Task** | Aufgabe mit Stichpunkten und immer sichtbaren Details (Status, Priorität, Deadline, Schätzung, Fortschritt) |
| **Link** | Verweis auf eine andere Map oder eine Webadresse |
| **Code** | Text in Festbreitenschrift |
| **Group** | Rahmen – Notes darin werden mitbewegt |
| **Image** | Bild (einfügen per Drag & Drop oder `Ctrl+V`); auch als **Overlay** über allem |
| **File** | Datennote: eine beliebige Datei (siehe Kapitel 16) |

Den Typ änderst du per Rechtsklick → **Change type** oder im Panel.

## 4. Details: Status, Priorität, Deadline, Termin, Schätzung, Tags

- Im Panel unter **Details**: **Deadline**, **Scheduled** (Termin), **Estimate** (z. B. `1h 30m`, `90m`, `2h`, `1d` = ein Arbeitstag, also so viele Stunden wie unter *Hours / work day* eingestellt; gespeichert wird beim Eintippen der Stundenwert), **Progress** (nur Tasks), **Status**, **Priority**, **Tags**, **Link**.
- **Deadline oder Termin – nie beides:**
  - **Deadline** = bis wann es fertig sein muss. Die Zeit wird auf die Tage bis dahin verteilt (Projektarbeit).
  - **Scheduled / Termin** = an welchem Tag (optional mit Uhrzeit) es stattfindet, z. B. ein einmaliger Workshop. Die geschätzte Zeit wird wie bei einer Routine von der **Kapazität dieses Tages** abgezogen (📌-Chip).
  - Wer eins setzt, löscht das andere.
- Die Werte erscheinen als kleine **Chips** unter der Note (Toolbar **Details** blendet sie ein/aus).
- **In Tasks** genügt ein Klick auf einen Chip: Es öffnet sich direkt ein Auswahlmenü (z. B. *Tomorrow*, *Next Monday*, *1h 30m*, *50 %*).
- Status und Fortschritt hängen zusammen: 100 % → *Done*; *Done* → 100 %.
- **Prioritätssystem pro Projektordner:** Im Panel ohne Markierung unter *Planungskapazität* → **Prioritäten**: **Stufen** (Niedrig … Dringend) oder **Eisenhower** (*Wichtig + dringend*, *Nur wichtig*, *Nur dringend*, *Weder noch*). Beide Werte werden getrennt gespeichert – beim Wechsel wird nichts umgerechnet und nichts gelöscht; Chips, Panel, Filter und Übersicht zeigen nur das gewählte System. Gespeichert in `mindmapper.settings.json` des Ordners.
- **Link** im Panel: eine Map des Projekts, eine Webadresse oder ein **Ordner / eine Datei auf dem PC** (`C:\Projekte\Abrechnung`, `\\server\share\Team`; „Als Pfad kopieren“ aus dem Explorer funktioniert auch). Der kleine **↗**-Knopf an der Note (oder `Ctrl+Klick`) öffnet ihn.
  - Ein Ordner öffnet sich als Dateiliste in einem neuen Browser-Tab. Den Windows-Explorer selbst darf der Browser nicht starten – dafür kopiert MindMapper den Pfad in die Zwischenablage: `Win+E`, `Ctrl+L`, `Ctrl+V`.

## 5. Die Task: Projektaufgabe, Termin oder Routine

Fast alles in MindMapper dreht sich um Aufgaben: Auslastung, Pläne, Overview, Routinen. **Was** eine Aufgabe ist – Projektaufgabe, Termin oder Routine – entscheidet nicht ihr Typ, sondern welche Felder du im Panel unter **Details** setzt. Der Typ **Task** ist dafür gemacht (Chips immer sichtbar, Klickmenü an jedem Chip, Fortschritt, Untertasks), die Felder wirken aber genauso an einer einfachen Note oder einer To-do-Liste.

**Die Grundfrage – drei Fragen, eine Antwort:**
- Kommt es **regelmäßig** wieder (jeden Dienstag, 5 h pro Woche)? → **Routine** (*Repeat*)
- Findet es an einem **bestimmten Tag** statt (Workshop am 12.11., 9:00)? → **Termin** (*Scheduled*)
- Muss es **bis zu einem Tag fertig** sein (Bericht bis Freitag)? → **Projektaufgabe** (*Deadline*)
- Dazu fast immer: **wie lange** dauert es? → *Estimate*. Ohne Schätzung kann MindMapper keine Zeit einplanen.

### Was wird aus meiner Note?

Es gilt die **erste** Zeile, die passt:

| Gesetzt im Panel | Die Note ist … | Wirkung auf deine Zeit | Wo sie auftaucht |
|---|---|---|---|
| *Repeat* wöchentlich / monatlich | 🔁 **Routine** mit festen Tagen | zieht ihre *Estimate* an jedem ihrer Tage von der Kapazität ab | Tages- und Wochenplan (Spalte des Tages), Workload → *Routines* |
| *Repeat* *Time budget per week* / *Several times per week* | 🔁 **Routine** ohne feste Tage | der Wochenanteil wird auf die Arbeitstage der Woche verteilt | Wochenplan: Liste ihrer Kategorie (bzw. *Routines this week*) |
| *Repeat* in einer **Freizeit-Kategorie** | 🔁 **Freizeit-Routine** | **keine** – nur zum Abhaken und Dranbleiben | wie oben; Workload-Seite ausgegraut |
| *Repeat* *Day(s) off / vacation* | 🏖 **Urlaub / frei** | Tag ohne Kapazität (oder weniger, wenn *Estimate* gesetzt) | 🏖-Eintrag im Plan |
| *Scheduled* (Termin, optional Uhrzeit) | 📌 **Termin** | blockt die *Estimate* an genau diesem Tag – auch abgehakt | Tages- und Wochenplan, Overview, Workload (`−2 h 📌`), Konfliktmeldung |
| *Deadline* + *Estimate* | **Projektaufgabe** | der Restaufwand wird auf die Tage bis zur Deadline verteilt | Overview, Matrix, Workload, Puffer, Statusleiste |
| nur *Estimate* | Aufwand **ohne Frist** | wird nicht verteilt, nur gemeldet („… h ohne Deadline“) | Hinweis auf der Workload-Seite; Overview (bei Tasks) |
| nur *Deadline* | Frist **ohne Aufwand** | zählt nicht – bei Tasks (und Notes mit Status) Hinweis „without estimate“ | Overview |
| nichts davon | einfache Aufgabe / Notiz | keine | Overview, wenn es eine Task ist oder Status / Priorität hat |

**Gut zu wissen:**
- **Repeat schlägt alles.** Eine Note mit Regel ist immer eine Routine; Deadline oder Termin daneben spielen keine Rolle. Routinen stehen nicht in den Aufgabenlisten des Overview, sondern auf der Workload-Seite unter *Routines* (mit Verlauf ▣□).
- **Termin oder Deadline – nie beides.** Wer eins setzt, löscht das andere (Kapitel 4).
- **Erledigt** (*Done*, 100 %) oder **verschoben** (→ andere Map) zählt nicht mehr als Arbeit. Ausnahme **Termin**: Abgehakt bleibt seine Zeit an dem Tag reserviert – er hat ja stattgefunden. Vergangene Tage zählen nie.
- **Fortschritt** verringert den Restaufwand: 10 h geschätzt, 40 % erledigt → 6 h werden noch verteilt.
- **To-do-Listen** zählen nur mit Schätzung, anteilig nach offenen Einträgen (4 von 8 offen → halbe Schätzung).
- **Haupt- und Untertasks** teilen sich eine Schätzung (Kapitel 12); eine große Aufgabe bekommt bei Bedarf ihre eigene Map (Kapitel 10).

### Der Weg einer Task

1. **Festhalten:** Rechtsklick → **Insert → Task**, Stichpunkte notieren. Noch ohne Felder ist sie nur eine offene Aufgabe im Overview.
2. **Planen:** *Estimate* und *Deadline* setzen (Klick auf die Chips). Jetzt rechnet MindMapper: Die Statusleiste zeigt, wie sich die Woche füllt, das Panel unter **Workload**, wie viel Puffer bis zur Deadline bleibt.
3. **Aufteilen:** Große Aufgaben per Pfeil in Untertasks zerlegen – der Fortschritt der Haupttask rechnet sich dann selbst (∑).
4. **Termin daraus machen:** Wird aus „Workshop vorbereiten bis Freitag“ ein fester Block („Workshop, Do 9:00, 3 h“), *Scheduled* setzen: Die Deadline verschwindet, die Zeit ist an dem Tag geblockt, und 📌 steht im Tages- und Wochenplan. Den 📌 im Plan abhaken setzt die Task auf *Done* – und umgekehrt.
5. **Abschließen:** Status *Done* oder 100 %. Unerledigtes eines Tages- / Wochenplans wandert beim nächsten Plan mit (Carry-over, Kapitel 8) oder per **Move to map** (Kapitel 9).
6. **Wiederkehrend?** Wird etwas zur Gewohnheit (jeden Dienstag), *Repeat* setzen – ab jetzt ist es eine Routine.

### Beispiel: Zeitfresser sichtbar machen

Oft bleibt für Projekte weniger Zeit als gedacht – weil viel Zeit in Kleinkram fließt, der nirgends steht. Routinen machen diese Zeit sichtbar:

1. Lege eine Map **Routinen** an und trage ehrlich ein, was regelmäßig Zeit kostet – jede Sache als Note mit *Repeat* und *Estimate*, z. B.:
   - „E-Mails“ – *Weekly*, Mo–Fr, `30m`
   - „Teammeeting“ – *Weekly*, Di 10:00, `1h 30m`
   - „Studentenbetreuung“ – *Time budget per week*, `5h`
   - „Verwaltung / Formulare“ – *Time budget per week*, `2h`
2. **Overview → Workload:** Unter *Routines* steht die Summe, hier `11 h` pro Woche (2,5 + 1,5 + 5 + 2). Bei 40 h Kapazität bleiben für Projekte nur noch 29 h. Die Tageszeilen zeigen rechts die wirklich verfügbare Zeit – am Dienstag ist es am engsten.
3. Im **Panel** jeder Routine steht, was sie pro Woche kostet („Routine: nimmt etwa 2,5 h pro Woche von deiner Kapazität.“) – die großen Brocken fallen sofort auf.
4. **Ausprobieren:** Stell eine Schätzung testweise um (E-Mails `15m` statt `30m`). Eine Routine ändert nicht deine Arbeit, sondern die **verfügbare** Zeit: In der Statusleiste wächst die Wochenzeit hinter dem Schrägstrich um gut 1 h (z. B. `Week 26 h / 29 h` → `/ 30,3 h`), und sie meldet den größeren Puffer bis zur knappsten Deadline (`smallest buffer +2 h → +4 h`). So siehst du, wo sich Einsparen lohnt – und mit `Ctrl+Z` ist alles wieder wie vorher.
5. **Dranbleiben:** Die Routinen stehen in den Tages- und Wochenplänen zum Abhaken. Ihr **Verlauf** (▣ erledigt, □ verpasst) zeigt nach ein paar Wochen, was wirklich passiert und was nur im Plan steht.
6. **Einmalige Zeitfresser** (Klausuraufsicht, Gutachten-Sitzung) als **Termin** mit Schätzung eintragen – dann stimmt die Kapazität auch in Ausnahmewochen, und MindMapper warnt, wenn ein Termin nicht mehr in den Tag passt.

### Beispiel: Freizeit planen, ohne die Arbeitszeit zu belasten

„Schlagzeug: Rhythmus-Übungen“ als *Several times per week*, **3×**, `30m`, Kategorie **Schlagzeug** (*Freizeit*): Der Wochenplan bekommt drei Kästchen auf dem Zettel „🥁 Schlagzeug“, von der Kapazität geht nichts ab, und die Serie („4 Wochen in Folge“) motiviert. Mehr dazu in Kapitel 14.

## 6. Filter

Toolbar **Filter** öffnet die Filterleiste: Suchtext, Tags (*any* / *all*), Status, Priorität, Deadline, Typ.
- **Dim** blendet nicht passende Notes ab, **Hide** versteckt sie.
- **Keep sub-notes** lässt Notes sichtbar, die per Pfeil unter einem Treffer hängen oder in einer passenden Gruppe liegen.

## 7. Projekt: mehrere Maps

- **+ New map** legt eine Map an – leer oder als Vorlage (siehe Kapitel 8), in einem beliebigen (Unter-)Ordner.
- **Rechtsklick auf eine Map** in der Seitenleiste (oder der **⋯**-Knopf, der beim Darüberfahren erscheint): **Open**, **Rename or move…**, **Move to folder**, **Delete map…**. Beim Umbenennen werden Links in allen anderen Maps automatisch angepasst.
- **Links zwischen Maps:** Eine Note mit Link auf eine Map öffnet diese per ↗. Existiert die Map noch nicht, bietet MindMapper an, sie anzulegen.
- **← Back** in der Seitenleiste springt zur vorher geöffneten Map zurück.

## 8. Tages-, Wochen- und Monatspläne

- Vorlagen im Dialog **New map**: **Day plan** (Morning / Afternoon / Evening), **Week plan** (eine Spalte pro Tag), **Month plan** (eine Spalte pro Woche). Jede mit „Goals“ links und „Notes“ rechts.
- Die Pläne sind verknüpft: Monat → Wochen → Tage (↗ an Spalten bzw. Überschrift).
- Namen: `Days/2026-10-21`, `Weeks/2026-W43`, `Months/2026-10`. Wer das Namensschema verlässt, verliert die automatische Verknüpfung.
- **Termine (📌):** Neue Tages- und Wochenpläne bekommen alle offenen Notes mit Termin aus allen Maps als Eintrag – im Wochenplan in der Spalte des Tages, im Tagesplan nach Uhrzeit (ab 12 Uhr *Afternoon*, ab 17 Uhr *Evening*, sonst *Morning*). Wie Routinen werden sie nicht übertragen.
- **Nachtragen:** Kommt ein Termin oder eine Routine erst dazu, wenn der Plan schon existiert, wird der Eintrag beim nächsten **Öffnen** des Plans nachgetragen (Hinweis in der Statusleiste). Das gilt nur für heute und spätere Tage; vergangene Tage bleiben, wie sie sind. Ein Eintrag, den du gelöscht hast, kommt nicht wieder. Hast du eine Routine oder einen Termin umbenannt (oder Uhrzeit / Dauer geändert), bekommen die **offenen** Einträge beim Öffnen den neuen Text; abgehakte behalten ihren alten.
- **Zur Notiz springen:** Hinter jedem 🔁-, 📌- und 🏖-Eintrag erscheint beim Darüberfahren ein kleines **↗**. Ein Klick öffnet die Map mit der Original-Note (Termin, Routine, Urlaub) und zeigt die Note – praktisch, wenn dort weitere Notizen zum Termin stehen.
- **Aufräumen:** Ebenfalls beim Öffnen verschwinden **offene** Einträge (ab heute), deren Termin oder Routine gelöscht wurde, deren Termin jetzt an einem anderen Tag ist oder deren Routine an dem Tag nicht mehr stattfindet. **Abgehakte** Einträge und vergangene Tage bleiben stehen. Kann eine Map nicht gelesen werden, wird zur Sicherheit nicht aufgeräumt.
- **Abhaken im Tages- oder Wochenplan:** Ein 🔁- oder 📌-Eintrag steht im Tagesplan und im Wochenplan. Wird er in einem davon abgehakt (oder wieder geöffnet), passiert das im anderen Plan desselben Datums automatisch mit. Bei einem 📌-Termin gilt das auch für die Original-Note, in beide Richtungen: Wird die Note auf *Done* gesetzt, sind ihre Einträge in Tages- und Wochenplan abgehakt. **Strg+Z** nimmt das Abhaken überall zurück. Die Regel-Note einer Routine bleibt offen, und ein auf einen anderen Tag verschobener Termin wird vom Eintrag des alten Tages nicht berührt. Voraussetzung: Der Projektordner ist verbunden.
- **Carry-over:** Beim Anlegen des nächsten Tages / der nächsten Woche / des nächsten Monats werden **unerledigte Einträge** übernommen und im alten Plan als übertragen markiert (→).
  - Offene Einträge von To-do-Listen landen gesammelt in der Liste **Carried over**; deren Deadline ist der erste Tag des neuen Plans, so bleiben sie in der Overview.
  - Unerledigte **Tasks und Notes mit Status** kommen als Ganzes mit, so wie bei **Move to map** (Kapitel 9): mit allen Untertasks, ihrer Gruppe und der Anordnung.
  - Übertragen werden nur To-do-Listen, die als Aufgabe zählen (siehe Kapitel 11) – die Spalten der Pläne gehören dazu, eine reine Abhakliste (z. B. Einkaufszettel ohne Deadline) bleibt im alten Plan.
  - Legst du einen Plan **im Voraus** an (z. B. nächste Woche), wird noch nichts übertragen. Sobald der Zeitraum begonnen hat, fragt MindMapper beim Öffnen einmal nach.

### Was passiert automatisch?

Alles, was MindMapper in Tages- und Wochenpläne von selbst einträgt oder ändert, auf einen Blick:

| Wann | Was | Wohin |
|---|---|---|
| Plan wird angelegt | 🔁 Routinen, 📌 Termine, 🏖 Urlaub dieses Tages / dieser Woche | Tagesspalten (Woche) bzw. *Morning / Afternoon / Evening* (Tag) |
| Wochenplan wird angelegt | Routinen ohne feste Tage (Wochenbudgets, „x-mal pro Woche“) | eine Liste je Routine-Kategorie (ohne Kategorie: **Routines this week**) links neben *Goals*, siehe Kapitel 14 |
| Plan wird angelegt, sein Zeitraum hat schon begonnen (sonst: beim ersten Öffnen danach, mit Nachfrage) | Unerledigtes aus dem vorigen Tag / der vorigen Woche / dem vorigen Monat | Liste **Carried over** und die übertragenen Notes; im alten Plan als übertragen markiert (→) |
| Plan wird geöffnet | neue 🔁 / 📌 / 🏖 ab heute dazu; offene Einträge gelöschter oder verschobener Termine / Routinen weg | wie beim Anlegen |
| Abhaken (oder wieder öffnen) irgendwo | derselbe 🔁 / 📌-Eintrag im Tages- und Wochenplan und die Termin-Note | überall mit (Strg+Z nimmt es überall zurück) |

**Nie automatisch:** In **Goals** und **Notes** trägt MindMapper nichts ein. Unerledigte Goals werden auch nicht übertragen. Goals ist eine einfache Abhakliste, außer du gibst ihr selbst eine Deadline, Schätzung oder Priorität. Vergangene Tage und abgehakte Einträge werden beim Öffnen nie verändert.

## 9. Notes in eine andere Map verschieben

- Rechtsklick auf eine oder mehrere Notes → **Move to map** → **Next day / Next week / Next month / Today / This week** oder **Other map…**.
- **Other map…** zeigt die Maps als Ordnerbaum (Ordner auf- und zuklappbar, Suchfeld = flache Trefferliste). **New map…** legt eine neue Ziel-Map an: Name und Ordner eingeben. Heißt sie wie ein Tag, eine Woche oder ein Monat (`2026-10-24`, `2026-W44`, `2026-11`), bekommt sie die passende Vorlage.
- **Was mitkommt:**
  - alles, was **unter** der Note hängt, beliebig tief: Notes, auf die ihre Pfeile zeigen (Untertasks, auch erledigte), und bei einer Gruppe deren Inhalt
  - liegt die Note in einer **Gruppe**, die ganze (innerste) Gruppe mit allem darin und allem, was darunter hängt – auch Bilder
  - Pfeile *von außen* auf die Note sind kein Grund zum Mitkommen; diese Notes bleiben, wo sie sind.
  - Die Anordnung bleibt erhalten, Pfeile innerhalb des Pakets werden mitkopiert. Die Statusleiste meldet, wie viele Notes zusätzlich mitgekommen sind.
- Die Kopie landet in der Ziel-Map, das Original bleibt ausgegraut mit dem Hinweis **→ 2026-W44** stehen (Klick öffnet die Ziel-Map). Gezählt wird nur noch die Kopie.
- **Undo move** (Rechtsklick auf ein Original) nimmt den ganzen Umzug zurück, auch die mitgekommenen Notes.

## 10. Map aus einer Note ableiten

- Rechtsklick auf eine Note → **Create map from note…**: Es entsteht eine neue Map mit dem Titel der Note (Stichpunkte / Einträge werden als Startpunkt übernommen). Die Note verweist danach auf die Map (**Open derived map ↗**).
- Typischer Einsatz: Eine große Aufgabe bekommt ihre eigene Map für die Detailplanung.

## 11. Overview: alle Aufgaben aller Maps

Toolbar **Overview** sammelt die Aufgaben **aller Maps** des Projektordners:
- **To-do-Listen** sind normalerweise reine Abhaklisten (wie ein Einkaufszettel) und erscheinen hier nicht. Sie zählen erst als Aufgabe, wenn sie eine **Schätzung**, eine **Deadline**, einen **Termin** oder eine **Priorität / Eisenhower-Einordnung** haben. Die Spalten der Tages-, Wochen- und Monatspläne haben ihre Deadline automatisch.
- **By deadline:** gruppiert nach *Overdue*, *Today*, *Tomorrow*, *Next 7 days*, *Later*, *No deadline* – mit Zeitsummen und dem durchschnittlichen Fortschritt der Gruppe (**Ø**; auch bei *By task*).
- **By task:** Haupttasks mit ihren Untertasks als aufklappbarer Baum.
- **Workload:** Auslastung (siehe Kapitel 13).
- **Matrix** (nur im Eisenhower-Modus): die vier Quadranten mit den Aufgaben als Kreisen.
  - **Kreisfläche** = geschätzter Aufwand (gestrichelt = keine Schätzung), **Innenkreis** = Fortschritt. Große Kreise stehen vorne – aufgeblähte Aufgaben fallen so auf. Die Kopfzeile zeigt Anzahl und Stunden je Quadrant.
  - **Oranger Rand:** Deadline in höchstens 3 Tagen; **roter Rand:** Deadline überschritten; **„!“:** Puffer bis zur Deadline zu knapp (rot = negativ, orange = unter 10 %).
  - **Einordnen per Ziehen:** Kreis in einen Quadranten ziehen; zurück in **Nicht eingeordnet** hebt die Einordnung auf. Klappt auch für Maps, die gerade nicht offen sind. Der farbige Punkt an nicht eingeordneten Aufgaben zeigt ihre alte Stufe – nur als Erinnerung.
  - **Untertasks** werden im Kontext ihrer Haupttask beurteilt: Sie stehen immer im Quadranten der obersten Haupttask, zusammen mit ihr in einem Rahmen (tiefere Ebenen flach darin). Ihre **eigene Einordnung** zeigt die Farbe des Kreises und das kleine **2×2-Symbol**; Klick darauf öffnet die Auswahl. Innerhalb des Rahmens stehen sie nach eigener Einordnung sortiert. Gezogen wird nur die Haupttask – der ganze Rahmen wandert mit, die Untertasks behalten ihre eigene Einordnung.
  - Hinweis: Filter und Chips auf der Map zeigen bei Untertasks diese relative Einordnung.
  - `Ctrl+Z` bzw. **Rückgängig** in der Matrix nimmt die letzte Einordnung zurück. Klick auf einen Kreis öffnet die Note.
- Suche, Typ-, Status- und Prioritätsfilter, **Hide done**. Klick auf eine Zeile öffnet die Map und markiert die Note; **↗ map** öffnet eine abgeleitete Map.
- **Fenster verschieben und skalieren:** an der Kopfzeile ziehen = verschieben; an den Rändern oder der Ecke unten rechts ziehen = Größe ändern. Doppelklick auf die Kopfzeile stellt Standardposition und -größe wieder her. Position und Größe werden im Browser gespeichert.

## 12. Haupt- und Untertasks

- Ein **Pfeil von Task A auf Task B** macht B zur Untertask von A (beliebig tief).
- Die Tasks einer **aus A abgeleiteten Map** sind ebenfalls Untertasks von A.
- **Deadline:** Eine Untertask ist spätestens zur Deadline ihrer Haupttask fällig. Ohne eigene Deadline übernimmt sie die der Haupttask. Eine frühere ist erlaubt, eine spätere wird auf die der Haupttask zurückgesetzt (Hinweis in der Statusleiste). Wird die Haupttask früher fällig, rücken ihre Untertasks mit. Untertasks mit Termin (Scheduled) statt Deadline bleiben unberührt, ebenso Untertasks in abgeleiteten Maps.
- **Zeitaufwand:** Die Schätzung der Haupttask ist der **Gesamtaufwand**, die Untertasks teilen ihn auf. Was noch nicht aufgeteilt ist (z. B. 10 h geschätzt, Untertasks zusammen 6 h → 4 h), wird bei der Haupttask mit ihrer Deadline eingeplant. Ergeben die Untertasks mehr als die Haupttask, zählen die Untertasks (Hinweis „sub-tasks 12h > 10h estimated“). Nichts wird doppelt gezählt.
- Eine Task mit Untertasks zeigt ihren Fortschritt **berechnet**, erkennbar am **∑**: nach Stunden gewichtet (Untertasks ohne Schätzung zählen wie der Durchschnitt der anderen), der noch nicht aufgeteilte Rest zählt als nicht begonnen, *Done* = 100 %. Dieser Wert ist nicht von Hand verstellbar.

## 13. Auslastung und Puffer

MindMapper berechnet aus **Schätzung**, **Fortschritt** und **Deadline**, wie viele Stunden pro Tag und Woche verplant sind:
- Der **Restaufwand** (Schätzung × (1 − Fortschritt)) wird auf die Planungstage (Tage mit Kapazität) von heute bis zur Deadline verteilt, gewichtet nach den Stunden des Tages. Überfälliges zählt auf heute.
- **Verfügbar** ist pro Planungstag: Stunden des Tages (Werktag oder Wochenende) − freie Zeit − Termine an dem Tag − Tagesanteil der Wochenbudgets. Heute zählt als ganzer Tag.
- In der Workload-Seite steht **links die eingeplante, rechts die verfügbare Zeit** – für jeden Tag und jede Woche (ab heute).
- **Puffer:** Für jede Deadline wird geprüft, ob die **gesamte** bis dahin fällige Arbeit in die verfügbare Zeit von heute bis zur Deadline passt („Until Fri 23 Oct: 26 h / 32 h → +6 h“). Ein negativer Puffer heißt: Die Planung geht so nicht auf – auch wenn die einzelnen Tage gleichmäßig verteilt noch passen.
- **Statusleiste** unten: `Today 6 h / 8 h · Week 26 h / 40 h · Buffer +6 h` – rot bei Überlast, Klick öffnet die Workload-Seite.
- Nach jeder Änderung meldet die Statusleiste kurz die Auswirkung, z. B. `Plan: Week 44: 34 h → 38 h of 40 h`.
- Im Panel einer Note zeigt **Workload**, was diese Note zur Woche beiträgt und wie viel Puffer bis zu ihrer Deadline bleibt.
- **Termine** (Scheduled) sind keine Projektarbeit: Wie Routinen ziehen sie ihre Schätzung von der **Kapazität ihres Tages** ab (Workload-Seite: `−2 h 📌`). Damit sinkt auch der Puffer aller späteren Deadlines. Abhaken ändert daran nichts, vergangene Termine zählen nicht mehr.
- **Terminkonflikt:** Passt ein Termin nicht in die freie Zeit seines Tages (Urlaubstag, Tag mit 0 h, Tag schon voll mit Routinen/Terminen), wird das rot gemeldet: in der Statusleiste (`📌 conflict …`), oben auf der Workload-Seite und im Panel der Note.
- Notes mit Deadline oder Termin, aber ohne Schätzung zählen nicht – sie werden als „without estimate“ gemeldet.
- **Kapazität:** Panel bei leerer Auswahl → **Planning capacity**: *Hours / work day*, *Hours / weekend day* und die Arbeitstage (nicht angehakte Tage = Wochenendtage; 0 h = dort wird nichts eingeplant). Standard: 8 h Mo–Fr, 0 h am Wochenende.
- Die Kapazität wird **pro Projektordner** in `mindmapper.settings.json` gespeichert. So kann ein Ordner die Freizeit planen (z. B. 3 h werktags, 8 h am Wochenende) und ein anderer Ordner die Arbeitszeit (8 h werktags, 0 h am Wochenende). Ohne geöffneten Ordner gilt die Einstellung des Browsers.
- Arbeit wird auf alle Tage mit Kapazität bis zur Deadline verteilt, gewichtet nach den Stunden des Tages.

## 14. Routinen und Urlaub

Regelmäßige Aufgaben sind normale Notes mit einer Regel – am besten gesammelt in einer Map „Routines“. Im Panel unter **Repeat**:

| Art | Beispiel |
|---|---|
| **Weekly / every n weeks** | Wochenmeeting jeden Di 10:00; alle 2 Wochen donnerstags |
| **Monthly (day of month)** | am 15. jedes Monats |
| **Monthly (n-th weekday)** | jeden 1. Montag, letzten Freitag |
| **Time budget per week** | Studentenbetreuung 5 h pro Woche |
| **Several times per week** | Rhythmus-Übungen 3× pro Woche je 30 min (ohne feste Tage) |
| **Day(s) off / vacation** | Urlaub vom 23.12. bis 06.01. |

- Die **Dauer** (bzw. Stunden pro Woche, bei *Several times per week* die Dauer **pro Mal**) ist das Feld **Estimate**. Optional **from / until**.
- Routinen ziehen ihre Zeit von der **Kapazität** ab; neue Tages- und Wochenpläne bekommen sie als abhakbaren Eintrag (🔁), bestehende beim nächsten Öffnen (ab heute). Verpasste Termine werden nicht übertragen.
- **Urlaub:** *Estimate* leer = ganzer Tag frei (keine Kapazität, Termine entfallen, 🏖 im Plan); *Estimate* z. B. `4h` = halber Tag frei.
- Übersicht: **Overview → Workload** mit den Listen *Routines* und *Days off*.

### Kategorien und Freizeit-Routinen

- **Kategorie zuweisen:** Unter *Repeat* gibt es die Auswahl **Category** – eine vorhandene Kategorie oder **New category…** (Name eintippen, fertig).
- **Kategorien verwalten:** Panel, wenn nichts markiert ist → Abschnitt **Routine categories**: Name, **Emoji** (Knopf ☺, Rechtsklick entfernt es), Häkchen **leisure** (Freizeit), × löscht (die Routinen bleiben, nur ohne Kategorie). Gespeichert **pro Projektordner** in `mindmapper.settings.json` – Arbeits- und Privatordner haben eigene Kategorien.
- **Freizeit:** Routinen einer Freizeit-Kategorie ziehen **keine** Zeit von der Kapazität ab. Sie stehen trotzdem in den Plänen und werden abgehakt – zur Motivation. Auf der Workload-Seite erscheinen sie ausgegraut („Freizeit, zählt nicht“).
- **Zettel im Wochenplan:** Routinen ohne feste Tage (*Time budget per week*, *Several times per week*) stehen im Wochenplan auf einer Liste je Kategorie, z. B. „🥁 Bandprobe“ mit „Rhythmus (30m)“ ×3 – ein Kästchen pro Mal. Routinen ohne Kategorie stehen in **Routines this week**. Routinen mit festen Tagen bleiben in der Tagesspalte.
- Ändert sich etwas (Anzahl pro Woche, andere Kategorie, Kategorie umbenannt oder gelöscht), passt sich der Wochenplan beim nächsten **Öffnen** an (ab heute): fehlende Kästchen kommen dazu, überzählige **offene** verschwinden, abgehakte bleiben.

### Verlauf und Serie

- Im Panel einer Routine (unter *Repeat*) und auf der Workload-Seite steht, wie es in den **letzten 8 Wochen** lief (älteste links): **▣** erledigt · **□** verpasst · **◌** diese Woche, noch offen · **·** keine Einträge. Dazu die **Serie**, z. B. „4 Wochen in Folge“.
- Gezählt wird, was in den Plänen abgehakt ist: Eine Woche ist **erledigt**, wenn alle ihre Einträge dieser Routine abgehakt sind (bei „3× pro Woche“ alle drei Kästchen).
- **Gut zu wissen:** Wochen ohne Wochen- bzw. Tagesplan zählen nicht – weder als erledigt noch als verpasst (sie unterbrechen auch keine Serie). Ein **gelöschter** Eintrag („fällt diese Woche aus“) zählt nicht als verpasst. Die laufende Woche zählt erst, wenn sie erledigt ist.

## 15. Views und Auto-Layout

- Toolbar **Views** (oder Rechtsklick → **Show as**) zeigt die Map automatisch als **Tree**, **Radial mind map**, **Bubble map** oder **Treemap**. Grundlage sind die Pfeile (A → B: B ist Kind von A) und Gruppen.
  - Größe = geschätzte Zeit, Farbe = Status. Klick auf ein Element springt zur Note.
- **Auto-layout:** Rechtsklick auf eine Note → **Auto-layout sub-notes**, auf die Fläche → **Auto-layout whole map**, oder **Apply to map** im Views-Dialog. Ordnet die echten Notes als Baum oder radial an – `Ctrl+Z` macht es rückgängig.

## 16. Dateien und Bilder

- **Bilder** per Drag & Drop, `Ctrl+V` oder **Insert → Image…**. Sie werden in der Map gespeichert.
- **Andere Dateien** (Excel, Word, PDF, …) auf die Fläche ziehen oder **Insert → File…**: Die Datei wird in den Unterordner `Assets/` des Projektordners kopiert, die Note verweist darauf.
  - Öffnen per Klick auf das Symbol, ↗ oder `Ctrl+Klick`. PDF, Text, Bilder usw. öffnen im Browser, alles andere wird heruntergeladen.
  - Rechtsklick: **Open file ↗**, **Replace file…**, **Show file path**. Löschen der Note löscht die Datei nicht.

### Zeichnen auf Bildern und Notes

- Toolbar **✎ Draw** → **Rectangle**, **Ellipse**, **Line** oder **Arrow**, dann auf der Fläche ziehen. `Shift` beim Ziehen: Quadrat / Kreis, Linien in 45°-Schritten. `Esc` bricht ab.
- Zeichnungen liegen über allen Notes. Anklicken kann man sie nur auf ihrer Linie (oder ihrer Füllung) – das Bild darunter bleibt klickbar.
- **Verankert** (wie ein Bild „mit Text verschieben“ in Word – eine Einstellung, kein Pfeil): Wer über einer Note oder einem Bild zu zeichnen beginnt, verankert die Zeichnung daran. Wird die Note verschoben oder vergrößert, wandert und skaliert die Zeichnung mit. Verschiebst du die Zeichnung selbst, bleibt sie verankert und hat nur einen neuen Platz auf der Note. Wird die Note gelöscht oder in eine andere Map verschoben, geht die Zeichnung mit.
- **`Ctrl+G`** verankert wie Gruppieren in Inkscape: Zeichnung(en) und genau eine Note / ein Bild auswählen → die Zeichnungen hängen an dieser Note. Sind nur Zeichnungen ausgewählt, hängen sie an der Note darunter. **`Ctrl+Shift+G`** löst sie wieder (bei ausgewählten Notes: alle Zeichnungen, die an ihnen hängen).
- **Nicht verankert** (beim Zeichnen `Alt` halten, oder **Detach**): Die Zeichnung bewegt sich nur, wenn sie selbst ausgewählt ist – auch eine Gruppe nimmt sie nicht mit.
- Panel bzw. Rechtsklick: Form, **Anchor to the note below** / **Detach**, Linienfarbe und -stärke, Strichart, Füllung (Rechteck / Ellipse), Deckkraft. Die nächste Zeichnung übernimmt die zuletzt eingestellte Farbe und Stärke.

### Tagebuch / Laborbuch

- **Tagebuch anlegen:** Seitenleiste → Bereich **Diaries** → **+**. Jedes Tagebuch ist eine Datei im Ordner `Diaries/` des Projektordners.
- **Tagebuch löschen** geht bewusst nicht in der App (Schutz, z. B. fürs Laborbuch). Wer eines loswerden will, löscht im Explorer die Datei `Diaries/<Name>.diary.json` im Projektordner und klickt danach in der Seitenleiste auf **⟳** (Ordner neu einlesen). Damit verschwinden Gestaltung, Sticker und abgeschlossene Seiten. Die Einträge selbst sind Notizen in den Maps und bleiben dort, bis du sie löschst. Legst du später ein Tagebuch mit demselben Namen an, erscheinen sie wieder darin.
- **Eintrag schreiben:** Rechtsklick → **Diary entry** (oder **Insert → Diary entry**). Im Panel Tagebuch, Tag und Uhrzeit wählen – neue Einträge landen im zuletzt benutzten Tagebuch, mit heutigem Datum und aktueller Uhrzeit.
- **Inhalt** ist Markdown: `# Überschrift`, `**fett**`, `*kursiv*`, `~~durchgestrichen~~`, `- Liste` (eingerückt = Unterpunkt), `1. nummeriert`, `- [ ] Kästchen`, `> Zitat`, `` `Code` ``, `[Link](https://…)` und Tabellen:
  ```
  | Probe | Wert |
  |-------|-----:|
  | A     |  1,2 |
  ```
  **Bilder** beim Schreiben mit `Ctrl+V` einfügen oder hineinziehen – sie werden in der Map gespeichert. Doppelklick bearbeitet den Text, `Ctrl+Enter` oder `Esc` beendet.
- **Kopfzeile:** Zeigt ein Pfeil von einer anderen Note **auf** den Eintrag, erscheint diese Note im Tagebuch über dem Eintrag (Titel, Status, Fortschritt, Deadline, Tags), mehrere nebeneinander. Hängt sie über weitere Pfeile an einer Task, wird die oberste Task als **⤴ Haupttask** genannt. Liegt eine Note ohne eigenen Pfeil lose in einer Gruppe, geht die Suche über die Gruppe weiter (z. B. Subaufgabe → Gruppe → Note → Eintrag). Eine Task, die nur *in* derselben Gruppe liegt, ohne Pfeil auf die Gruppe, zählt nicht.
- **Lesen:** Klick auf das Tagebuch in der Seitenleiste, oder **↗** / `Ctrl+Klick` am Eintrag (öffnet direkt dessen Seite). Eine Seite pro Tag, leere Tage fehlen. **←/→** blättern, Mausrad scrollt, die Auswahl oben springt zu einem Tag. **↗ Map** am Eintrag zeigt ihn in seiner Map.
- **📅 Kalender** in der Leseansicht: Tage mit Einträgen sind anklickbar, abgeschlossene tragen 🔒.
- **🎨 Gestaltung** pro Tagebuch: Schrift (Liste oder beliebiger installierter Name), Größe, Text-, Akzent- und Papierfarbe, Linierung (keine, Linien, Karos, Punkte). Wird sofort angezeigt und im Tagebuch gespeichert – die Maps bleiben unverändert.
- **🔒 Seite abschließen** (z. B. fürs Laborbuch): Einträge, Kopfzeilen und Bilder des Tages werden ins Tagebuch kopiert, die Seite zeigt ab dann diesen Stand.
  - Wird eine Notiz danach geändert, gelöscht oder auf einen anderen Tag gelegt, steht das als ✎-Hinweis über dem Eintrag. Später hinzugekommene Einträge erscheinen unter **Nach dem Abschluss hinzugekommen**.
  - Auf der Map trägt die Notiz 🔒 im Kopf, nach einer Änderung zusätzlich **✎ geändert**.
  - **Wieder öffnen** (mit Rückfrage) verwirft die abgeschlossene Fassung.
- **🖼 Sticker** (Leseansicht oben rechts) schaltet die Seite in den Gestaltungsmodus: **😀 Sticker** (Emoji), **🖼 Bild** und Zeichnungen (▭ ◯ ╱ ➚, Farbe daneben) frei auf die Seite setzen. Ziehen verschiebt, die Ecke ändert die Größe, `Entf` oder 🗑 löscht. **✓ Fertig** beendet den Modus. Sticker & Co. gehören zur Tagebuchseite (nicht zur Notiz in der Map), bleiben auch auf abgeschlossenen Seiten und werden mitgedruckt.
  - **Wie eingeklebt:** Ein Sticker gehört zu dem Eintrag, auf dem er abgelegt wird (zwischen zwei Einträgen: zum oberen, über dem ersten: zur Seite). Rutscht der Eintrag später nach unten, z. B. weil darüber ein neuer Eintrag dazukommt, wandert der Sticker mit.
  - **Platz schaffen:** Im Gestaltungsmodus den **Kopf eines Eintrags** nach unten ziehen – darüber entstehen Leerzeilen (in ganzen Zeilen, zurück bis zum ursprünglichen Platz), z. B. für ein Bild zwischen zwei Einträgen.
  - **Auf der Linie:** Jeder Eintrag beginnt auf einer Linie der Linierung, Absätze und Überschriften haben Abstände in ganzen Zeilen. Die Seite ist mindestens so lang wie ihr tiefster Sticker, nichts wird abgeschnitten.
- **🖨 Drucken / PDF:** diese Seite, das ganze Tagebuch oder ein Zeitraum. Für ein PDF im Druckdialog „Als PDF speichern“ wählen. Jede Tagebuchseite beginnt auf einem neuen Blatt.
- Tagebucheinträge erscheinen nicht in Overview und Auslastung und werden beim Carry-over nicht übertragen.

## 17. Emoji

`Ctrl+.` oder `Ctrl+Shift+E` (auch beim Schreiben), Knopf **☺** in der Toolbar, Rechtsklick → **Emoji…** oder **Insert → Emoji…**: ins Textfeld einfügen oder als eigene, große Note. Steht der Cursor in einem **Eingabefeld des Panels** (z. B. Tags, Link, Name einer Routine-Kategorie), landet das Emoji in diesem Feld.

## 18. Darstellung: Darkmode, Sprache, Panel

- **Farbschema**: Knopf 🌓 / 🌙 / ☀️ oben rechts wechselt Auto → Dunkel → Hell. *Auto* folgt der Windows-Einstellung. Auch im Panel (leere Fläche anklicken) unter **Darstellung**. Notizfarben, die du selbst gesetzt hast, bleiben unverändert.
- **Sprache**: Knopf **EN / DE** oben rechts oder Panel → Darstellung → Sprache. Standard ist Englisch. Inhalte von Vorlagen (z. B. „Morning“, „Goals“ in Tages-/Wochenplänen) bleiben englisch, damit Übertrag und Routinen weiter funktionieren.
- **Panel ausblenden**: Toolbar **Panel** oder ✕ oben im Panel. Zurückholen mit der Lasche **‹** am rechten Rand.
- **Panel-Breite**: den schmalen Streifen links vom Panel ziehen. Doppelklick = Standardbreite, Pfeiltasten ←/→ ändern die Breite in 15-px-Schritten (Streifen vorher anklicken).
- Alle drei Einstellungen werden im Browser gespeichert.

## 19. Gut zu wissen

- Alles bleibt lokal: Maps sind lesbare JSON-Dateien in deinem Ordner.
- Undo/Redo gilt für die offene Map. Was in **andere** Maps geschrieben wurde (Move to map, Carry-over), nimmst du mit **Undo move** bzw. von Hand zurück. Ausnahme: Abgehakte 🔁/📌-Einträge und Termine werden beim Undo auch in den anderen Plänen zurückgenommen.
- Ist dieselbe Map in zwei Tabs oder auf zwei Rechnern gleichzeitig offen, wird nichts still überschrieben: Hat sich die Datei inzwischen woanders geändert, fragt MindMapper beim Speichern, welche Version bleiben soll (*Andere Version behalten*, *Beide behalten*, *Meine Version behalten*). Schreibzugriffe auf andere Maps und das Tagebuch brechen in diesem Fall mit einem Hinweis ab. Details in Kapitel 1 unter **Schutz vor Überschreiben**.
