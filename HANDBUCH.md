# MindMapper – Handbuch

MindMapper ist ein Mindmap- und Planungswerkzeug, das komplett im Browser läuft – ohne Installation, ohne Konto, ohne Internet. Dieses Handbuch erklärt die wichtigsten Funktionen. Die Bezeichnungen der Oberfläche sind englisch und stehen hier **fett**.

> Tipp: Über den Knopf **?** oben rechts in der Toolbar öffnest du dieses Handbuch und die Beispiel-Map jederzeit wieder.

---

## 1. Starten und Speichern

- **Starten:** `index.html` doppelklicken. Empfohlen sind **Edge** oder **Chrome** – nur dort kann MindMapper direkt in Dateien und Ordner schreiben.
- **Einzelne Map:** **Open** / **Save** / **Save as** öffnen und speichern eine Datei `*.mindmap.json`.
- **Projektordner (empfohlen):** In der linken Seitenleiste **Project** → **Open folder…** einen Ordner wählen. Alle Maps darin erscheinen als Liste, Unterordner (z. B. `Weeks/`, `Months/`, `Days/`) werden angezeigt.
  - Maps aus dem Projektordner werden **automatisch gespeichert** (Einstellung „Auto-save project maps into their file“ im Panel rechts, wenn nichts markiert ist).
  - Nach einem Neustart fragt der Browser einmal nach der Erlaubnis: **Reconnect**.
- **Sicherung im Browser:** Zusätzlich wird die offene Map ständig im Browser zwischengespeichert und beim nächsten Start wiederhergestellt.
- **Arbeiten an zwei Rechnern** (z. B. synchronisierter Ordner): Ist die Datei auf der Platte neuer als die Kopie im Browser, lädt MindMapper die Datei. Hattest du lokal ungespeicherte Änderungen, wirst du gefragt.

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
| Löschen | `Entf`; bei Tasks auch der Papierkorb oben rechts (beim Überfahren / Markieren) |

- **Rechtsklick** auf eine Note, eine Verbindung oder die Fläche öffnet ein Menü mit allen passenden Befehlen.
- Das **Panel rechts** zeigt die Eigenschaften der Markierung: Typ, Form, Farben, Details. Ist nichts markiert, stehen dort die Einstellungen.
- **Smart guides** und **Grid** helfen beim Ausrichten. `Alt` beim Ziehen schaltet das Einrasten aus.
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
| **File** | Datennote: eine beliebige Datei (siehe Kapitel 13) |

Den Typ änderst du per Rechtsklick → **Change type** oder im Panel.

## 4. Details: Status, Priorität, Deadline, Termin, Schätzung, Tags

- Im Panel unter **Details**: **Deadline**, **Scheduled** (Termin), **Estimate** (z. B. `1h 30m`, `90m`, `2h`, `1d` = 8 h), **Progress** (nur Tasks), **Status**, **Priority**, **Tags**, **Link**.
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

## 5. Filter

Toolbar **Filter** öffnet die Filterleiste: Suchtext, Tags (*any* / *all*), Status, Priorität, Deadline, Typ.
- **Dim** blendet nicht passende Notes ab, **Hide** versteckt sie.
- **Keep sub-notes** lässt Notes sichtbar, die per Pfeil unter einem Treffer hängen oder in einer passenden Gruppe liegen.

## 6. Projekt: mehrere Maps

- **+ New map** legt eine Map an – leer oder als Vorlage (siehe Kapitel 7), in einem beliebigen (Unter-)Ordner.
- **Rechtsklick auf eine Map** in der Seitenleiste (oder der **⋯**-Knopf, der beim Darüberfahren erscheint): **Open**, **Rename or move…**, **Move to folder**, **Delete map…**. Beim Umbenennen werden Links in allen anderen Maps automatisch angepasst.
- **Links zwischen Maps:** Eine Note mit Link auf eine Map öffnet diese per ↗. Existiert die Map noch nicht, bietet MindMapper an, sie anzulegen.
- **← Back** in der Seitenleiste springt zur vorher geöffneten Map zurück.

## 7. Tages-, Wochen- und Monatspläne

- Vorlagen im Dialog **New map**: **Day plan** (Morning / Afternoon / Evening), **Week plan** (eine Spalte pro Tag), **Month plan** (eine Spalte pro Woche). Jede mit „Goals“ links und „Notes“ rechts.
- Die Pläne sind verknüpft: Monat → Wochen → Tage (↗ an Spalten bzw. Überschrift).
- Namen: `Days/2026-10-21`, `Weeks/2026-W43`, `Months/2026-10`. Wer das Namensschema verlässt, verliert die automatische Verknüpfung.
- **Termine (📌):** Neue Tages- und Wochenpläne bekommen alle offenen Notes mit Termin aus allen Maps als Eintrag – im Wochenplan in der Spalte des Tages, im Tagesplan nach Uhrzeit (ab 12 Uhr *Afternoon*, ab 17 Uhr *Evening*, sonst *Morning*). Wie Routinen werden sie nicht übertragen.
- **Abhaken im Tages- oder Wochenplan:** Ein 🔁- oder 📌-Eintrag steht im Tagesplan und im Wochenplan. Wird er in einem davon abgehakt (oder wieder geöffnet), passiert das im anderen Plan desselben Datums automatisch mit. Bei einem 📌-Termin gilt das auch für die Original-Note, in beide Richtungen: Wird die Note auf *Done* gesetzt, sind ihre Einträge in Tages- und Wochenplan abgehakt. **Strg+Z** nimmt das Abhaken überall zurück. Die Regel-Note einer Routine bleibt offen, und ein auf einen anderen Tag verschobener Termin wird vom Eintrag des alten Tages nicht berührt. Voraussetzung: Der Projektordner ist verbunden.
- **Carry-over:** Beim Anlegen des nächsten Tages / der nächsten Woche / des nächsten Monats werden **unerledigte Einträge** übernommen und im alten Plan als übertragen markiert (→).
  - Offene Einträge von To-do-Listen landen gesammelt in der Liste **Carried over**; deren Deadline ist der erste Tag des neuen Plans, so bleiben sie in der Overview.
  - Unerledigte **Tasks und Notes mit Status** kommen als Ganzes mit, so wie bei **Move to map** (Kapitel 8): mit allen Untertasks, ihrer Gruppe und der Anordnung.
  - Übertragen werden nur To-do-Listen, die als Aufgabe zählen (siehe Kapitel 10) – die Spalten der Pläne gehören dazu, eine reine Abhakliste (z. B. Einkaufszettel ohne Deadline) bleibt im alten Plan.
  - Legst du einen Plan **im Voraus** an (z. B. nächste Woche), wird noch nichts übertragen. Sobald der Zeitraum begonnen hat, fragt MindMapper beim Öffnen einmal nach.

## 8. Notes in eine andere Map verschieben

- Rechtsklick auf eine oder mehrere Notes → **Move to map** → **Next day / Next week / Next month / Today / This week** oder **Other map…**.
- **Other map…** zeigt die Maps als Ordnerbaum (Ordner auf- und zuklappbar, Suchfeld = flache Trefferliste). **New map…** legt eine neue Ziel-Map an: Name und Ordner eingeben. Heißt sie wie ein Tag, eine Woche oder ein Monat (`2026-10-24`, `2026-W44`, `2026-11`), bekommt sie die passende Vorlage.
- **Was mitkommt:**
  - alles, was **unter** der Note hängt, beliebig tief: Notes, auf die ihre Pfeile zeigen (Untertasks, auch erledigte), und bei einer Gruppe deren Inhalt
  - liegt die Note in einer **Gruppe**, die ganze (innerste) Gruppe mit allem darin und allem, was darunter hängt – auch Bilder
  - Pfeile *von außen* auf die Note sind kein Grund zum Mitkommen; diese Notes bleiben, wo sie sind.
  - Die Anordnung bleibt erhalten, Pfeile innerhalb des Pakets werden mitkopiert. Die Statusleiste meldet, wie viele Notes zusätzlich mitgekommen sind.
- Die Kopie landet in der Ziel-Map, das Original bleibt ausgegraut mit dem Hinweis **→ 2026-W44** stehen (Klick öffnet die Ziel-Map). Gezählt wird nur noch die Kopie.
- **Undo move** (Rechtsklick auf ein Original) nimmt den ganzen Umzug zurück, auch die mitgekommenen Notes.

## 9. Map aus einer Note ableiten

- Rechtsklick auf eine Note → **Create map from note…**: Es entsteht eine neue Map mit dem Titel der Note (Stichpunkte / Einträge werden als Startpunkt übernommen). Die Note verweist danach auf die Map (**Open derived map ↗**).
- Typischer Einsatz: Eine große Aufgabe bekommt ihre eigene Map für die Detailplanung.

## 10. Overview: alle Aufgaben aller Maps

Toolbar **Overview** sammelt die Aufgaben **aller Maps** des Projektordners:
- **To-do-Listen** sind normalerweise reine Abhaklisten (wie ein Einkaufszettel) und erscheinen hier nicht. Sie zählen erst als Aufgabe, wenn sie eine **Schätzung**, eine **Deadline**, einen **Termin** oder eine **Priorität / Eisenhower-Einordnung** haben. Die Spalten der Tages-, Wochen- und Monatspläne haben ihre Deadline automatisch.
- **By deadline:** gruppiert nach *Overdue*, *Today*, *Tomorrow*, *Next 7 days*, *Later*, *No deadline* – mit Zeitsummen und dem durchschnittlichen Fortschritt der Gruppe (**Ø**; auch bei *By task*).
- **By task:** Haupttasks mit ihren Untertasks als aufklappbarer Baum.
- **Workload:** Auslastung (siehe Kapitel 12).
- **Matrix** (nur im Eisenhower-Modus): die vier Quadranten mit den Aufgaben als Kreisen.
  - **Kreisfläche** = geschätzter Aufwand (gestrichelt = keine Schätzung), **Innenkreis** = Fortschritt. Große Kreise stehen vorne – aufgeblähte Aufgaben fallen so auf. Die Kopfzeile zeigt Anzahl und Stunden je Quadrant.
  - **Oranger Rand:** Deadline in höchstens 3 Tagen; **roter Rand:** Deadline überschritten; **„!“:** Puffer bis zur Deadline zu knapp (rot = negativ, orange = unter 10 %).
  - **Einordnen per Ziehen:** Kreis in einen Quadranten ziehen; zurück in **Nicht eingeordnet** hebt die Einordnung auf. Klappt auch für Maps, die gerade nicht offen sind. Der farbige Punkt an nicht eingeordneten Aufgaben zeigt ihre alte Stufe – nur als Erinnerung.
  - **Untertasks** werden im Kontext ihrer Haupttask beurteilt: Sie stehen immer im Quadranten der obersten Haupttask, zusammen mit ihr in einem Rahmen (tiefere Ebenen flach darin). Ihre **eigene Einordnung** zeigt die Farbe des Kreises und das kleine **2×2-Symbol**; Klick darauf öffnet die Auswahl. Innerhalb des Rahmens stehen sie nach eigener Einordnung sortiert. Gezogen wird nur die Haupttask – der ganze Rahmen wandert mit, die Untertasks behalten ihre eigene Einordnung.
  - Hinweis: Filter und Chips auf der Map zeigen bei Untertasks diese relative Einordnung.
  - `Ctrl+Z` bzw. **Rückgängig** in der Matrix nimmt die letzte Einordnung zurück. Klick auf einen Kreis öffnet die Note.
- Suche, Typ-, Status- und Prioritätsfilter, **Hide done**. Klick auf eine Zeile öffnet die Map und markiert die Note; **↗ map** öffnet eine abgeleitete Map.
- **Fenster verschieben und skalieren:** an der Kopfzeile ziehen = verschieben; an den Rändern oder der Ecke unten rechts ziehen = Größe ändern. Doppelklick auf die Kopfzeile stellt Standardposition und -größe wieder her. Position und Größe werden im Browser gespeichert.

## 11. Haupt- und Untertasks

- Ein **Pfeil von Task A auf Task B** macht B zur Untertask von A (beliebig tief).
- Die Tasks einer **aus A abgeleiteten Map** sind ebenfalls Untertasks von A.
- **Deadline:** Eine Untertask ist spätestens zur Deadline ihrer Haupttask fällig. Ohne eigene Deadline übernimmt sie die der Haupttask. Eine frühere ist erlaubt, eine spätere wird auf die der Haupttask zurückgesetzt (Hinweis in der Statusleiste). Wird die Haupttask früher fällig, rücken ihre Untertasks mit. Untertasks mit Termin (Scheduled) statt Deadline bleiben unberührt, ebenso Untertasks in abgeleiteten Maps.
- **Zeitaufwand:** Die Schätzung der Haupttask ist der **Gesamtaufwand**, die Untertasks teilen ihn auf. Was noch nicht aufgeteilt ist (z. B. 10 h geschätzt, Untertasks zusammen 6 h → 4 h), wird bei der Haupttask mit ihrer Deadline eingeplant. Ergeben die Untertasks mehr als die Haupttask, zählen die Untertasks (Hinweis „sub-tasks 12h > 10h estimated“). Nichts wird doppelt gezählt.
- Eine Task mit Untertasks zeigt ihren Fortschritt **berechnet**, erkennbar am **∑**: nach Stunden gewichtet (Untertasks ohne Schätzung zählen wie der Durchschnitt der anderen), der noch nicht aufgeteilte Rest zählt als nicht begonnen, *Done* = 100 %. Dieser Wert ist nicht von Hand verstellbar.

## 12. Auslastung und Puffer

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

## 13. Routinen und Urlaub

Regelmäßige Aufgaben sind normale Notes mit einer Regel – am besten gesammelt in einer Map „Routines“. Im Panel unter **Repeat**:

| Art | Beispiel |
|---|---|
| **Weekly / every n weeks** | Wochenmeeting jeden Di 10:00; alle 2 Wochen donnerstags |
| **Monthly (day of month)** | am 15. jedes Monats |
| **Monthly (n-th weekday)** | jeden 1. Montag, letzten Freitag |
| **Time budget per week** | Studentenbetreuung 5 h pro Woche |
| **Day(s) off / vacation** | Urlaub vom 23.12. bis 06.01. |

- Die **Dauer** (bzw. Stunden pro Woche) ist das Feld **Estimate**. Optional **from / until**.
- Routinen ziehen ihre Zeit von der **Kapazität** ab; neue Tages- und Wochenpläne bekommen sie als abhakbaren Eintrag (🔁). Verpasste Termine werden nicht übertragen.
- **Urlaub:** *Estimate* leer = ganzer Tag frei (keine Kapazität, Termine entfallen, 🏖 im Plan); *Estimate* z. B. `4h` = halber Tag frei.
- Übersicht: **Overview → Workload** mit den Listen *Routines* und *Days off*.

## 14. Views und Auto-Layout

- Toolbar **Views** (oder Rechtsklick → **Show as**) zeigt die Map automatisch als **Tree**, **Radial mind map**, **Bubble map** oder **Treemap**. Grundlage sind die Pfeile (A → B: B ist Kind von A) und Gruppen.
  - Größe = geschätzte Zeit, Farbe = Status. Klick auf ein Element springt zur Note.
- **Auto-layout:** Rechtsklick auf eine Note → **Auto-layout sub-notes**, auf die Fläche → **Auto-layout whole map**, oder **Apply to map** im Views-Dialog. Ordnet die echten Notes als Baum oder radial an – `Ctrl+Z` macht es rückgängig.

## 15. Dateien und Bilder

- **Bilder** per Drag & Drop, `Ctrl+V` oder **Insert → Image…**. Sie werden in der Map gespeichert.
- **Andere Dateien** (Excel, Word, PDF, …) auf die Fläche ziehen oder **Insert → File…**: Die Datei wird in den Unterordner `Assets/` des Projektordners kopiert, die Note verweist darauf.
  - Öffnen per Klick auf das Symbol, ↗ oder `Ctrl+Klick`. PDF, Text, Bilder usw. öffnen im Browser, alles andere wird heruntergeladen.
  - Rechtsklick: **Open file ↗**, **Replace file…**, **Show file path**. Löschen der Note löscht die Datei nicht.

## 16. Emoji

`Ctrl+.` oder `Ctrl+Shift+E` (auch beim Schreiben), Knopf **☺** in der Toolbar, Rechtsklick → **Emoji…** oder **Insert → Emoji…**: ins Textfeld einfügen oder als eigene, große Note.

## 17. Darstellung: Darkmode, Sprache, Panel

- **Farbschema**: Knopf 🌓 / 🌙 / ☀️ oben rechts wechselt Auto → Dunkel → Hell. *Auto* folgt der Windows-Einstellung. Auch im Panel (leere Fläche anklicken) unter **Darstellung**. Notizfarben, die du selbst gesetzt hast, bleiben unverändert.
- **Sprache**: Knopf **EN / DE** oben rechts oder Panel → Darstellung → Sprache. Standard ist Englisch. Inhalte von Vorlagen (z. B. „Morning“, „Goals“ in Tages-/Wochenplänen) bleiben englisch, damit Übertrag und Routinen weiter funktionieren.
- **Panel ausblenden**: Toolbar **Panel** oder ✕ oben im Panel. Zurückholen mit der Lasche **‹** am rechten Rand.
- **Panel-Breite**: den schmalen Streifen links vom Panel ziehen. Doppelklick = Standardbreite, Pfeiltasten ←/→ ändern die Breite in 15-px-Schritten (Streifen vorher anklicken).
- Alle drei Einstellungen werden im Browser gespeichert.

## 18. Gut zu wissen

- Alles bleibt lokal: Maps sind lesbare JSON-Dateien in deinem Ordner.
- Undo/Redo gilt für die offene Map. Was in **andere** Maps geschrieben wurde (Move to map, Carry-over), nimmst du mit **Undo move** bzw. von Hand zurück. Ausnahme: Abgehakte 🔁/📌-Einträge und Termine werden beim Undo auch in den anderen Plänen zurückgenommen.
- Ist dieselbe Map in zwei Tabs oder auf zwei Rechnern gleichzeitig offen, gewinnt die zuletzt gespeicherte Fassung.
