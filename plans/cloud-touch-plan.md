# MindMapper – Plan Cloud (pCloud, später OneDrive / Google Drive) + Handy (Touch)

Stand: 23.10.2026, ergänzt 24.10.2026 (mehrere Cloud-Anbieter), mit dem Nutzer abgestimmt, **noch nicht umgesetzt**. Grundregeln des Projekts gelten weiter: Modell in `MM.state.doc` ändern → `MM.commit()`, keine Build-Tools, keine ES-Module, alles über `window.MM`, UI-Texte englisch mit deutscher Übersetzung. Keine fremden Bibliotheken (das pCloud-SDK wird nicht gebraucht, die REST-API reicht).

## Ziel

Private Maps (z. B. Übungsplan Band) am **Android-Handy** im Browser ansehen und abhaken, ohne dass Arbeitsdaten in eine Cloud gehen.

- **Arbeit:** bleibt wie heute ein **lokaler Projektordner** – nie Cloud.
- **Privat:** Projektordner in **pCloud** (Konto vorhanden). Am PC wahlweise lokal (pCloud-Laufwerk) oder direkt über pCloud, am Handy direkt über pCloud.
- Am Handy: Map öffnen, **Zoomen / Verschieben mit zwei Fingern**, **Abhaken**, **Fortschritt / Status setzen**, Tagebuch lesen. Notes anlegen geht, muss aber nicht komfortabel sein.

## Ausgangslage

- Die App läuft über **GitHub Pages** (`https://tizian91.github.io/MindMapper/`, Adresse beim Umsetzen prüfen) und ist am PC als App installiert (PWA, `manifest.webmanifest`, `sw.js`).
- Projektordner nutzen `showDirectoryPicker` (File System Access API) – **gibt es auf Android nicht**. Deshalb ist auf dem Handy heute nur „einzelne Datei“ möglich.
- Direkte Dateizugriffe stecken fast nur in `project.js` (27 Stellen) und `storage.js` (17, davon Einzeldatei-Öffnen/Speichern), dazu je 1–2 in `files.js`, `transfer.js`, `actions.js`.

## Mehrere Cloud-Anbieter (keine Entweder-oder-Entscheidung)

Die Speicher-Schnittstelle (Architektur, Abschnitt 1) ist für **mehrere Anbieter** gebaut: jeder Dienst ist ein eigenes Modul mit denselben Funktionen und eigener Anmeldung. Seitenleiste ohne Ordner z. B.: *Open folder… · Connect pCloud… · Connect OneDrive… · Connect Google Drive…* (nur die eingebauten Anbieter). Jeder Nutzer verbindet sein eigenes Konto; die Daten bleiben in seiner Cloud, kein Server dazwischen. Die App wird später auch an Freunde weitergegeben.

**Reihenfolge (entschieden):**

| # | Anbieter | Aufwand | Warum / Besonderheiten |
|---|---|---|---|
| 1 | **pCloud** | gering | Konto des Nutzers vorhanden. Token-Flow für Browser-Apps, lang gültiger Token, Pfade wie im lokalen Ordner, keine App-Prüfung. |
| 2 | **OneDrive** (Microsoft Graph) | mittel | Für Freunde naheliegend. App-Registrierung (kostenlos, private Microsoft-Konten). Pfadbasiert (`/me/drive/root:/MindMapper/…`), eTag als Version für den Konfliktschutz. Anmeldung im Browser per Auth-Code + PKCE; Tokens laufen ab und werden erneuert (meist unsichtbar). Unverifizierte App: nur Hinweis „nicht verifiziert“. |
| 3 | **Google Drive** | höher | Auf jedem Android-Handy vorhanden, aber aufwendiger: |

**Google Drive – warum aufwendiger, vor der Umsetzung klären:**
- **Keine echten Pfade:** Dateien haben IDs, Ordner sind „Eltern“, gleiche Namen im selben Ordner sind erlaubt. Es braucht eine Übersetzung Pfad ↔ ID (Cache, beim Umbenennen / Verschieben pflegen, doppelte Namen behandeln).
- **Rechte:** Zugriff aufs ganze Drive gilt als „restricted“ → für öffentliche Apps teure Sicherheitsprüfung, kommt nicht in Frage. Möglich ist `drive.file`: die App sieht nur Dateien, die sie selbst angelegt hat oder die der Nutzer per Google-Auswahl (Picker) freigibt. **Folge:** Dateien, die das Google-Drive-Programm am PC hochgeladen hat (lokaler, synchronisierter Ordner), sieht die App am Handy nicht – Nutzer müssten auch am PC „Connect Google Drive“ verwenden oder die Dateien freigeben. Prüfen: Gibt eine Ordner-Freigabe per Picker auch den Inhalt frei?
- **Weitergabe:** ohne Verifizierung Warnbildschirm „App nicht überprüft“; Testmodus max. 100 eingetragene Testnutzer, Anmeldung läuft dort nach 7 Tagen ab. Verifizierung braucht Datenschutzerklärung und bestätigte Webadresse.
- Anmeldung im Browser (Google Identity Services) liefert Tokens für ~1 Stunde ohne Refresh-Token → regelmäßig erneuern.

Konfliktschutz, Touch-Bedienung und die verkleinerte Tagebuchseite gelten für alle Anbieter gleich und werden nur einmal gebaut.

## pCloud – was geklärt ist

- OAuth **„token flow“** (`response_type=token`) ist laut pCloud-Doku für reine Browser-/JavaScript-Apps gedacht: kein eigener Server, kein Geheimnis im Code. Pflicht: `client_id`, `redirect_uri`. Zurück kommen im URL-Fragment `access_token`, `locationid` (1 = USA, 2 = EU) und **`hostname`** – alle weiteren Aufrufe gehen an diesen Host (EU: `eapi.pcloud.com`).
- Das offizielle pCloud-JS-SDK läuft im Browser (inkl. Upload) → die API ist aus dem Browser erreichbar (CORS).
- Quellen: https://docs.pcloud.com/methods/oauth_2.0/authorize.html, https://github.com/pCloud/pcloud-sdk-js

**Beim Umsetzen in der pCloud-Doku prüfen:** genaue Methodennamen und Parameter für Ordner auflisten (`listfolder`, rekursiv), Datei lesen (`getfilelink` + Download oder `file_open`/`file_read`), Datei schreiben (`uploadfile`, ohne Umbenennen bei Namensgleichheit), Ordner anlegen (`createfolderifnotexists`), Umbenennen/Verschieben (`renamefile`), Löschen (`deletefile`), Metadaten mit Versionskennung (`stat`: `hash` / `modified`).

## Architektur

### 1. Speicher-Schnittstelle (`MM.fsys`)

`project.js` greift nicht mehr direkt auf Datei-/Ordner-Handles zu, sondern über einen Anbieter:

```
backend = {
  kind: 'local' | 'pcloud', name,             // Anzeige in der Seitenleiste
  list()                 -> Baum wie heute P.entries (ohne Handles: { kind, name, path, children })
  read(path)             -> { text, version }    // version: lastModified (lokal) / hash (pCloud)
  readBlob(path)         -> Blob                 // Assets/ (Datennotes)
  write(path, text, { expect })  -> { version }  // expect: Version beim Lesen -> Konflikt erkennen
  writeBlob(path, blob)
  mkdir(folder), rename(from, to), remove(path), exists(path)
  canWrite() / ensureWriteAccess()
}
```

- **`local`**: der heutige Code (Handles, `queryPermission`, IndexedDB für den Ordner-Handle) wandert unverändert hierher.
- **`pcloud`**: REST-Aufrufe mit `access_token` an `hostname`. Pfade relativ zum gewählten pCloud-Ordner (z. B. `/MindMapper`).
- `P.find`, `P.readMap`, `P.writeMap`, `P.writeText`, `P.getHandle`, `P.ensureDir`, `P.writeBlob`, `readDiary`/`writeDiary`, Projekt-Einstellungen (`storage.js` `loadProjectSettings`/`saveProjectSettings`) und das Autospeichern der offenen Map (`storage.js` `writeFile`, heute über `S.file.handle`) laufen danach über `backend`.
- „Einzelne Datei öffnen / speichern unter“ (ohne Projektordner) bleibt wie heute lokal.

### 2. Konfliktschutz (löst auch R7)

- Beim Lesen merkt sich die App die **Version** jeder Map (`S.file.version`, für andere Maps beim Lesen in `readMap`).
- Vor dem Schreiben wird verglichen: Ist die Datei inzwischen anders (am PC weitergearbeitet, zweiter Tab), wird **nicht überschrieben**, sondern gefragt: *Neu laden (meine Änderung verwerfen)* / *Trotzdem speichern* / *Als Kopie speichern*.
- Gilt für lokal und pCloud gleich. Schreiben in andere Maps (Termin-Sync, Move to map, Carry-over, Tagebuch) prüft ebenso.

### 3. pCloud-Anmeldung und Ordner

- Seitenleiste ohne Ordner: **„Open folder…“** (lokal, nur wo unterstützt) und **„Connect pCloud…“**.
- Anmeldung: Weiterleitung zu pCloud `oauth2/authorize?client_id=…&response_type=token&redirect_uri=<App-URL>`, Rückkehr mit Token im Fragment → Token + Host in `localStorage`, Fragment aus der Adresse entfernen.
- Danach pCloud-Ordner wählen (einfacher Ordner-Browser oder Pfad eingeben, Vorschlag `/MindMapper`). Merken wie heute den lokalen Ordner.
- „Disconnect pCloud“ löscht Token und Ordner.
- Sicherheit: Der Token liegt im Browser-Speicher. Die App lädt keine fremden Skripte, und die Absicherungen gegen eingeschleusten Code (R2, Markdown-Escaping) bleiben Pflicht. Der Token gilt nur für diese App-Registrierung und lässt sich in pCloud widerrufen.
- `sw.js`: Anfragen an pCloud (fremder Host) **nicht** cachen / nicht abfangen.

### 4. Touch-Bedienung (Android, Chrome)

- **Zwei Finger:** Pinch-Zoom um den Mittelpunkt, Verschieben. Ein Finger auf leerer Fläche: Verschieben (statt Rahmenauswahl).
- **Antippen:** Note auswählen; Checkbox / Status-Chip / Fortschritt-Chip direkt bedienbar (größere Trefferflächen auf Touch: `@media (pointer: coarse)`).
- **Langes Drücken** (~500 ms ohne Bewegung): Kontextmenü (wie Rechtsklick).
- **Doppeltippen:** Text bearbeiten (Bildschirmtastatur).
- **Schmale Leiste:** auf kleinen Bildschirmen nur das Nötigste (Projekt, Overview, Rückgängig, Zoom/Einpassen), Rest in einem „⋯“-Menü; Panel als Blatt von unten statt Seitenleiste.
- Ziehen von Notes per Finger nur nach kurzem Halten, damit Scrollen/Verschieben nicht versehentlich Notes bewegt.
- **Tagebuch auf dem Handy:** Die Tagebuchseite hat seit 24.10.2026 eine feste Breite wie auf A4 (186 mm), damit Bildschirm und Druck gleich umbrechen und Sticker an ihrem Platz bleiben. Auf schmalen Bildschirmen die Seite deshalb **als Ganzes verkleinern** (wie ein PDF, z. B. `transform: scale()` auf einer Hülle, Höhe der Hülle mitskalieren), nicht umbrechen. Achtung: `layoutPage`, `pageUnit` und das Ziehen von Stickern rechnen mit Bildschirm-Pixeln (`getBoundingClientRect`) – bei Skalierung durch den Faktor teilen. Zwei-Finger-Zoom zum Vergrößern.

## Etappen

| # | Inhalt | Ergebnis |
|---|---|---|
| **1** | Speicher-Schnittstelle, `local`-Anbieter = heutiger Code | keine sichtbare Änderung, alles läuft wie vorher (gründlich testen: Maps, Move to map, Carry-over, Umbenennen, Assets, Tagebuch, Termin-Sync) |
| **2** | Konfliktschutz über Versionen (lokal) | R7 erledigt |
| **3** | pCloud-Anbieter: Anmeldung, Ordnerwahl, alle Dateioperationen, Konfliktschutz | privater Ordner am PC über pCloud nutzbar |
| **4** | Touch-Bedienung + schmale Ansicht | am Android-Handy bedienbar |
| 5 (optional) | Offline am Handy: Änderungen ohne Netz merken und beim nächsten Netz hochladen | Bandraum ohne Empfang |
| 6 | OneDrive-Anbieter (App-Registrierung bei Microsoft, Client-ID) | Freunde mit Microsoft-Konto |
| 7 | Google Drive-Anbieter – vorher Rechte-Frage (`drive.file`, Picker, Verifizierung) klären | Freunde mit Google-Konto |

## Aufgaben für den Nutzer (vor Etappe 3)

1. Im pCloud-Entwicklerbereich (docs.pcloud.com → „My applications“) eine App anlegen.
2. Als Redirect-URI die GitHub-Pages-Adresse der App eintragen (genau, mit abschließendem `/`).
3. Die **Client-ID** weitergeben – sie kommt in den Code (öffentlich, das ist bei diesem Verfahren vorgesehen).

## Offene Punkte

- Wie viel Netz gibt es im Bandraum? Falls oft keines: Etappe 5 vorziehen.
- Lokale Arbeit am PC mit dem pCloud-Laufwerk **und** gleichzeitig am Handy über die API: Der Konfliktschutz erkennt das, beide Wege sind aber verschiedene Wege zur selben Datei – nach Etappe 3 einmal bewusst testen (pCloud-Laufwerk synchronisiert verzögert).
- Darf die Tagebuch-Funktion auf pCloud laufen (privates Tagebuch)? Technisch ja, über dieselbe Schnittstelle.
