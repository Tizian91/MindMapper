'use strict';
/*
 * More German phrases for MM.tr() (views, chips, editing, emoji, templates).
 * Loaded after i18n-de.js; simply extends the phrase table.
 */
(function (MM) {
  const DE = {
    // ---- meta.js (chips) ----
    'Yesterday': 'Gestern',
    'Priority': 'Priorität',
    'Deadline': 'Frist',
    'Deadline {d}': 'Frist {d}',
    'Estimated time': 'Geschätzte Zeit',
    'Estimate': 'Aufwand',
    'Progress': 'Fortschritt',
    'Routine – edit the rule in the panel': 'Routine – Regel im Panel bearbeiten',
    // ---- views.js ----
    'Map': 'Map',
    'Views': 'Ansichten',
    'Tree': 'Baum',
    'Radial mind map': 'Radiale Mindmap',
    'Bubble map': 'Bubble-Map',
    'Treemap': 'Treemap',
    'Left to right': 'Von links nach rechts',
    'Top down': 'Von oben nach unten',
    'Show the whole map': 'Ganze Map anzeigen',
    'Whole map': 'Ganze Map',
    'Fit': 'Einpassen',
    'Arrange the real notes like this (undo with Ctrl+Z)': 'Die echten Notizen so anordnen (Strg+Z macht es rückgängig)',
    'Apply to map': 'Auf Map anwenden',
    'From: {name}': 'Ab: {name}',
    'Size = estimated time (no estimate = {m}m, parents = sum)': 'Größe = geschätzte Zeit (ohne Schätzung = {m}m, Eltern = Summe)',
    'Click: go to the note · Wheel: zoom · Drag: move': 'Klick: zur Notiz · Mausrad: zoomen · Ziehen: verschieben',
    // ---- placeholders in empty notes (render.js / CSS) ----
    'Type…': 'Tippen…',
    'Title': 'Titel',
    'File note': 'Datei-Notiz',
    'Label': 'Beschriftung',
    // ---- emoji.js ----
    'Into text': 'In den Text',
    'As note': 'Als Notiz',
    'Recent': 'Zuletzt',
    'Smileys': 'Smileys',
    'Gestures': 'Gesten',
    'Symbols': 'Symbole',
    'Objects': 'Objekte',
    'Activity': 'Aktivität',
    'Food': 'Essen',
    'Travel': 'Reisen',
    'Nature': 'Natur',
    'No match.': 'Kein Treffer.',
    'Search emoji…': 'Emoji suchen… (englisch)',
    // ---- map picker (transfer.js) ----
    'Filter maps…': 'Maps filtern…',
    'No maps found. Create one from the sidebar first.': 'Keine Maps gefunden. Lege zuerst eine in der Seitenleiste an.',
    'Move {n} note(s) to map': '{n} Notiz(en) in Map verschieben',
    // ---- scheduled notes / appointments ----
    'Scheduled': 'Termin',
    'Scheduled {d}': 'Termin {d}',
    'Scheduled (YYYY-MM-DD):': 'Termin (JJJJ-MM-TT):',
    'Time': 'Uhrzeit',
    'Time (HH:MM):': 'Uhrzeit (HH:MM):',
    'No time': 'Ohne Uhrzeit',
    'Appointment': 'Termin',
    'Set an estimate and a deadline or a scheduled date to see the effect on your plan.':
      'Setze eine Schätzung und eine Frist oder einen Termin, um die Wirkung auf deinen Plan zu sehen.',
    'day off': 'freier Tag',
    'no planning hours on this day': 'an diesem Tag keine Planungsstunden',
    'routines and appointments exceed the day': 'Routinen und Termine sprengen den Tag',
    '📌 conflict {d}': '📌 Konflikt {d}',
    'Appointment conflict {d}: {a} scheduled, {f} free ({r}) – {t}': 'Terminkonflikt {d}: {a} geplant, {f} frei ({r}) – {t}',
    'Set an estimate: the appointment then takes that time off the capacity of its day.':
      'Setze eine Schätzung: Der Termin zieht diese Zeit dann von der Kapazität seines Tages ab.',
    'This appointment is over and no longer takes time off your capacity.':
      'Dieser Termin ist vorbei und zieht keine Kapazität mehr ab.',
    '−{a} capacity ({b} free before appointments)': '−{a} Kapazität ({b} frei vor Terminen)',
    'Appointments on this day together: {a}': 'Termine an diesem Tag zusammen: {a}',
    'Conflict: {a} scheduled, but only {f} free ({r}).': 'Konflikt: {a} geplant, aber nur {f} frei ({r}).',
    'Project work left that day: {a} of {b}': 'Projektarbeit an dem Tag: {a} von {b}',
    'Taken by routines (🔁) and appointments (📌)': 'Belegt durch Routinen (🔁) und Termine (📌)',
    'Appointment conflicts': 'Terminkonflikte',
    'planned / free after routines and appointments': 'geplant / frei nach Routinen und Terminen',
    // ---- overview window ----
    'Drag to resize – double click: default size': 'Ziehen zum Skalieren – Doppelklick: Standardgröße',
    'Drag to move – double click: default position and size': 'Ziehen zum Verschieben – Doppelklick: Standardposition und -größe',
    // ---- Eisenhower matrix / delete button ----
    'Eisenhower': 'Eisenhower',
    'Matrix': 'Matrix',
    'Eisenhower matrix – drag tasks into a quadrant to classify them': 'Eisenhower-Matrix – Aufgaben zum Einordnen in einen Quadranten ziehen',
    'Important': 'Wichtig',
    'Not important': 'Nicht wichtig',
    'Not urgent': 'Nicht dringend',
    'No estimate': 'Kein Aufwand geschätzt',
    'Buffer until then: {b}': 'Puffer bis dahin: {b}',
    'Circle area = estimate, inner circle = progress. Orange / red ring: deadline soon / overdue. "!" = buffer too small. Drag a circle into a quadrant to classify it.':
      'Kreisfläche = Aufwand, Innenkreis = Fortschritt. Oranger / roter Rand: Frist bald / überschritten. „!“ = Puffer zu knapp. Kreis in einen Quadranten ziehen, um ihn einzuordnen.',
    'Undo': 'Rückgängig',
    'Undo the last classification (Ctrl+Z)': 'Letzte Einordnung zurücknehmen (Strg+Z)',
    'Old priority as a dot – drag into a quadrant': 'Alte Priorität als Punkt – in einen Quadranten ziehen',
    'Everything is classified.': 'Alles ist eingeordnet.',
    'Own classification within the main task: {q} – click to change': 'Eigene Einordnung innerhalb der Hauptaufgabe: {q} – Klick zum Ändern',
    'Within "{t}":': 'Innerhalb von „{t}“:',
    'note not found': 'Notiz nicht gefunden',
    'no write access to the project folder': 'kein Schreibzugriff auf den Projektordner',
    'Could not save the classification: {err}': 'Einordnung konnte nicht gespeichert werden: {err}',
    'Delete task (Del) – its time no longer counts for the workload': 'Aufgabe löschen (Entf) – ihre Zeit zählt nicht mehr für die Auslastung',
    // ---- tasks.js / routines.js ----
    'Sub-task deadline moved back to the main task\'s deadline ({n})': 'Frist der Unteraufgabe auf die Frist der Hauptaufgabe zurückgesetzt ({n})',
    'Also checked off in {n} other map(s)': 'Auch in {n} anderen Map(s) abgehakt',
    'Also unchecked in {n} other map(s)': 'Auch in {n} anderen Map(s) wieder geöffnet',
    'Could not update the other plans: {err}': 'Die anderen Pläne konnten nicht aktualisiert werden: {err}',
    // ---- sidebar ⋯, map picker, overview groups ----
    'Rename, move, delete…': 'Umbenennen, verschieben, löschen…',
    'New map…': 'Neue Map…',
    'Folder (empty = top level)': 'Ordner (leer = oberste Ebene)',
    'No maps found. Create one with "New map…".': 'Keine Maps gefunden. Mit „Neue Map…“ eine anlegen.',
    'Average progress of {n} task(s)': 'Durchschnittlicher Fortschritt von {n} Aufgabe(n)',
  };
  const P = (MM.i18n.phrases = MM.i18n.phrases || {});
  P.de = Object.assign(P.de || {}, DE);
})(window.MM);
