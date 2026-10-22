'use strict';
/*
 * Internationalization (i18n) and Theme handling for MindMapper.
 * Supports German (de) and English (en), as well as Light / Dark / Auto themes.
 */
window.MM = window.MM || {};

(function (MM) {
  const I18N = (MM.i18n = {});

  I18N.translations = {
    de: {
      // Toolbar
      tbNew: 'Neu',
      tbNewTitle: 'Neue Map',
      tbOpen: 'Öffnen',
      tbOpenTitle: 'Öffnen… (Strg+O)',
      tbSave: 'Speichern',
      tbSaveTitle: 'Speichern (Strg+S)',
      tbSaveAs: 'Speichern unter',
      tbSaveAsTitle: 'Speichern unter… (Strg+Umschalt+S)',
      tbProject: 'Projekt',
      tbProjectTitle: 'Projektordner mit mehreren Maps',
      tbPanel: 'Panel',
      tbPanelTitle: 'Eigenschaften-Panel ein-/ausblenden',
      tbPanelAria: 'Eigenschaften-Panel ein- oder ausblenden',
      closePanel: 'Panel einklappen',
      expandPanel: 'Panel ausklappen',
      panelResizerTitle: 'Breite anpassen (Doppelklick für Standardgröße, Pfeiltasten)',
      tbOverview: 'Übersicht',
      tbOverviewTitle: 'Aufgaben aller Maps im Projektordner',
      tbViews: 'Ansichten',
      tbViewsTitle: 'Baum-, Radial-, Bubble- und Treemap-Ansicht dieser Map (ausgewählte Notiz = Start)',
      tbUndoTitle: 'Rückgängig (Strg+Z)',
      tbUndoAria: 'Rückgängig',
      tbRedoTitle: 'Wiederholen (Strg+Y)',
      tbRedoAria: 'Wiederholen',
      tbInsert: '+ Einfügen ▾',
      tbInsertTitle: 'Notiz einfügen (oder Rechtsklick auf die Canvas)',
      tbGuides: 'Hilfslinien',
      tbGuidesTitle: 'An anderen Notizen ausrichten (Smart Guides). Alt beim Ziehen gedrückt halten zum Deaktivieren.',
      tbGrid: 'Raster',
      tbGridTitle: 'Am Raster ausrichten',
      tbDetails: 'Details',
      tbDetailsTitle: 'Frist, Aufwand, Priorität und Tags unter Notizen anzeigen',
      tbFilter: 'Filter',
      tbFilterTitle: 'Notizen nach Text, Tags, Priorität, Frist filtern',
      tbZoomOutTitle: 'Verkleinern (-)',
      tbZoomOutAria: 'Verkleinern',
      tbZoomResetTitle: 'Zoom auf 100% zurücksetzen',
      tbZoomResetAria: 'Zoom auf 100% zurücksetzen',
      tbZoomInTitle: 'Vergrößern (+)',
      tbZoomInAria: 'Vergrößern',
      tbFit: 'Einpassen',
      tbFitTitle: 'Map ins Fenster einpassen (Umschalt+1)',
      tbThemeTitle: 'Farbschema wechseln (Hell / Dunkel / Auto)',
      tbThemeAria: 'Farbschema wechseln',
      tbLangTitle: 'Sprache wechseln (aktuell: Deutsch)',
      tbLangAria: 'Sprache wechseln',
      tbHelpTitle: 'Handbuch und Beispiel-Map',
      tbHelpAria: 'Handbuch und Beispiel-Map',

      // Statusbar & hints
      defaultHint: 'Rechtsklick: einfügen · Blauen Punkt ziehen: verbinden · Tab: Kindnotiz',
      st_counts: '{nodes} Notizen · {edges} Verbindungen',
      st_selected: '{n} ausgewählt',
      st_filterShown: 'Filter: {n} sichtbar',
      helpOpenHandbook: 'Handbuch öffnen (HANDBUCH.md)',
      helpLoadExample: 'Beispiel-Map laden',

      // Filterbar (dynamic part)
      fb_tagCount: '{n} Notiz(en)',
      fb_noTags: 'noch keine Tags',
      fb_any: 'eins', fb_anyTitle: 'Notizen mit mindestens einem der Tags',
      fb_all: 'alle', fb_allTitle: 'Notizen mit allen Tags',
      fb_dim: 'Abblenden', fb_dimTitle: 'Nicht passende Notizen blass anzeigen',
      fb_hide: 'Ausblenden', fb_hideTitle: 'Nicht passende Notizen ausblenden',
      fb_keep: 'Unternotizen behalten',
      fb_keepTitle: 'Notizen unterhalb eines Treffers (Pfeilrichtung) und Notizen in einer passenden Gruppe bleiben sichtbar',
      fb_allTypes: 'Alle Typen',
      fb_dl_any: 'Beliebige Frist', fb_dl_overdue: 'Überfällig', fb_dl_today: 'Heute fällig (oder überfällig)',
      fb_dl_week: 'Fällig in 7 Tagen', fb_dl_has: 'Hat eine Frist', fb_dl_none: 'Keine Frist',
      fb_count: '{m} Treffer von {n} Notizen',
      fb_countSub: '{m} Treffer (+{s} Unternotizen) von {n}',

      // Filterbar
      filterSearchPlaceholder: 'Notizen suchen…',
      filterClear: 'Zurücksetzen',
      filterClearTitle: 'Alle Filter zurücksetzen',
      filterCloseTitle: 'Filterleiste schließen (Filter bleibt aktiv)',

      // Common & Panel
      close: 'Schließen',
      delete: 'Löschen',
      duplicate: 'Duplizieren',
      optional: 'optional',
      type: 'Typ',
      file: 'Datei',
      image: 'Bild',
      note: 'Notiz',
      openFile: 'Öffnen ↗',
      replaceFile: 'Ersetzen…',
      path: 'Pfad',
      pathTitle: 'Speicherort der Datei anzeigen',
      showAs: 'Anzeige',
      overlay: 'Overlay',
      fit: 'Einpassen',
      fitCover: 'Füllen',
      fitContain: 'Ganzes Bild',
      opacity: 'Deckkraft',
      replaceImage: 'Bild ersetzen…',
      imageHint: 'Doppelklick aufs Bild fügt eine Bildunterschrift hinzu. Umschalt beim Skalieren hält das Seitenverhältnis frei.',
      shape: 'Form',
      style: 'Stil',
      fill: 'Füllung',
      border: 'Rand',
      borderWidth: 'Randbreite',
      borderLine: 'Randlinie',
      solid: 'Durchgezogen',
      dashed: 'Gestrichelt',
      dotted: 'Gepunktet',
      text: 'Text',
      fontSize: 'Schriftgröße',
      bold: 'Fett',
      align: 'Ausrichtung',
      alignLeft: 'Links',
      alignCenter: 'Zentriert',
      alignRight: 'Rechts',
      alignDistribute: 'Ausrichten & Verteilen',
      align_left: 'Linksbündig ausrichten',
      align_hcenter: 'Horizontal zentrieren',
      align_right: 'Rechtsbündig ausrichten',
      align_top: 'Obenbündig ausrichten',
      align_vcenter: 'Vertikal zentrieren',
      align_bottom: 'Untenbündig ausrichten',
      distributeH: 'Verteilen ↔',
      distributeV: 'Verteilen ↕',
      arrange: 'Anordnung',
      toFront: 'Nach vorne',
      toBack: 'Nach hinten',
      details: 'Details',
      deadline: 'Frist',
      clearDeadline: 'Frist löschen',
      deadlineTitle: 'Bis wann es fertig sein muss – die Zeit wird auf die Arbeitstage bis dahin verteilt. Löscht einen Termin.',
      scheduled: 'Termin',
      clearScheduled: 'Termin löschen',
      scheduledTitle: 'An welchem Tag es stattfindet – die geschätzte Zeit wird wie bei einer Routine von der Kapazität dieses Tages abgezogen. Löscht die Frist.',
      scheduledTimeTitle: 'Uhrzeit (optional) – bestimmt Vormittag / Nachmittag / Abend im Tagesplan',
      estimate: 'Aufwand',
      estimatePlaceholder: 'z. B. 1h 30m',
      progress: 'Fortschritt',
      clearProgress: 'Fortschritt löschen',
      progressPercent: 'Fortschritt in Prozent',
      workload: 'Auslastung',
      status: 'Status',
      priority: 'Priorität',
      tags: 'Tags',
      removeTag: 'Tag entfernen',
      addTagPlaceholder: 'Tag hinzufügen…',
      link: 'Link',
      linkPlaceholder: 'Map, https://… oder C:\\Ordner',
      linkInputTitle: 'Eine Map des Projekts, eine Webadresse oder ein Ordner / eine Datei auf dem PC (C:\\… oder \\\\server\\freigabe)',
      openLinkTitle: 'Link öffnen (oder Strg+Klick auf die Notiz)',
      repeat: 'Wiederholung',
      repeatNone: 'Keine Wiederholung',
      repeatWeekly: 'Wöchentlich',
      repeatMonthlyDay: 'Monatlich (fester Tag)',
      repeatMonthlyNth: 'Monatlich (z. B. 1. Montag)',
      repeatBudget: 'Wöchentliches Zeitbudget',
      repeatOff: 'Urlaub / Abwesend',
      every: 'alle',
      weeksOn: 'Woche(n) am',
      onDay: 'am Tag',
      onThe: 'am',
      from: 'von',
      until: 'bis',
      atTime: 'um',
      connection: 'Verbindung',
      route: 'Verlauf',
      routeStraight: 'Gerade',
      routeElbow: 'Rechter Winkel',
      routeRounded: 'Abgerundeter Winkel',
      routeCurved: 'Kurve',
      line: 'Linie',
      lineSolid: 'Durchgezogen',
      lineDashed: 'Gestrichelt',
      lineDotted: 'Gepunktet',
      lineDashdot: 'Strichpunkt',
      color: 'Farbe',
      lineWidth: 'Linienbreite',
      start: 'Start',
      end: 'Ende',
      label: 'Beschriftung',
      reverse: 'Umkehren ⇄',
      edgeHint: 'Runde End-Punkte auf eine Notiz ziehen zum Andocken. Alt gedrückt halten für freies Ende.',
      canvas: 'Canvas',
      smartGuidesCheck: 'Hilfslinien (an Notizen einrasten)',
      snapGridCheck: 'Am Raster einrasten',
      gridSize: 'Rastergröße',
      autoSaveCheck: 'Projekt-Maps automatisch in Datei speichern',
      mouseWheel: 'Mausrad',
      wheelZoom: 'Zoomen',
      wheelScroll: 'Scrollen (Strg = Zoom)',
      theme: 'Farbschema',
      themeAuto: 'Automatisch (System)',
      themeLight: 'Hell',
      themeDark: 'Dunkel',
      language: 'Sprache',
      planningCapacity: 'Planungskapazität',
      hoursDay: 'Stunden / Tag',
      workDays: 'Arbeitstage',
      workloadHint: 'Wird für die Auslastung in der Statusleiste und der Übersicht verwendet.',
      newConnections: 'Neue Verbindungen',
      shortcuts: 'Tastenkürzel',

      // Node types
      node_text: 'Notiz',
      node_heading: 'Überschrift',
      node_todo: 'To-Do',
      node_outline: 'Outline',
      node_task: 'Aufgabe',
      node_link: 'Link',
      node_code: 'Code',
      node_group: 'Gruppe',
      node_image: 'Bild',
      node_file: 'Datei',

      // Shapes
      shape_rect: 'Rechteck',
      shape_rounded: 'Abgerundet',
      shape_pill: 'Pille',
      shape_ellipse: 'Ellipse',
      shape_diamond: 'Raute',
      shape_hexagon: 'Sechseck',
      shape_parallelogram: 'Parallelogramm',
      shape_none: 'Kein Rand',

      // Arrows
      arrow_none: 'Keiner',
      arrow_arrow: 'Pfeil',
      arrow_triangle: 'Dreieck',
      arrow_circle: 'Kreis',
      arrow_diamond: 'Raute',
      arrow_bar: 'Balken',

      // Priorities
      prio_none: 'Keine',
      prio_low: 'Niedrig',
      prio_medium: 'Mittel',
      prio_high: 'Hoch',
      prio_urgent: 'Dringend',
      // Eisenhower quadrants (alternative priority system)
      quad_none: 'Nicht eingeordnet',
      quad_both: 'Wichtig + dringend',
      quad_important: 'Nur wichtig',
      quad_urgent: 'Nur dringend',
      quad_neither: 'Weder noch',
      eisenhower: 'Eisenhower',
      prioLevels: 'Stufen (Niedrig … Dringend)',
      prioSystem: 'Prioritäten',
      prioSystemHint: 'Stufen und Eisenhower-Einordnung werden getrennt gespeichert – beim Wechsel geht nichts verloren, angezeigt wird nur das gewählte System. Gespeichert {where}.',

      // Statuses
      status_none: 'Keiner',
      status_open: 'Offen',
      status_progress: 'In Bearbeitung',
      status_blocked: 'Blockiert',
      status_done: 'Erledigt',

      // Shortcuts table
      sc_rightClick: 'Notiz einfügen / Kontextmenü',
      sc_ctrlV: 'Bild einfügen',
      sc_ctrlClick: 'Link der Notiz öffnen',
      sc_codeNote: 'Enter = neue Zeile, Tab = einrücken, Strg+Enter / Esc = fertig',
      sc_group: 'Gruppe verschieben bewegt enthaltene Notizen mit',
      sc_dblClick: 'Text bearbeiten',
      sc_dragAnchor: 'Neue Verbindung (auf leere Fläche = neue Notiz)',
      sc_tab: 'Neue verbundene Kindnotiz',
      sc_enterF2: 'Auswahl bearbeiten',
      sc_shiftEnter: 'Neue Zeile beim Bearbeiten',
      sc_outline: 'Enter = neuer Punkt, Tab / Umschalt+Tab = ein-/ausrücken, Klick auf Punkt = zuklappen',
      sc_spaceDrag: 'Ansicht verschieben (oder mittlere Maustaste)',
      sc_altDrag: 'Verschieben ohne Einrasten',
      sc_shiftResize: 'Seitenverhältnis beibehalten',
      sc_undoRedo: 'Rückgängig / Wiederholen',
      sc_clipboard: 'Kopieren / Einfügen / Duplizieren',
      sc_arrows: 'Verschieben (Umschalt = 10px)',
      sc_fit: 'Ins Fenster einpassen',

      // Shortcut keys (left column)
      key_rightClick: 'Rechtsklick',
      key_ctrlV: 'Strg+V / Datei ablegen',
      key_ctrlClick: 'Strg+Klick',
      key_codeNote: 'Code-Notiz',
      key_group: 'Gruppe',
      key_dblClick: 'Doppelklick',
      key_dragAnchor: 'Ankerpunkt ziehen',
      key_shiftEnter: 'Umschalt+Enter',
      key_outline: 'Outline',
      key_spaceDrag: 'Leertaste + Ziehen',
      key_altDrag: 'Alt + Ziehen',
      key_shiftResize: 'Umschalt + Skalieren',
      key_undoRedo: 'Strg+Z / Strg+Y',
      key_clipboard: 'Strg+C / V / D',
      key_arrows: 'Pfeiltasten',
      key_fit: 'Umschalt+1',

      // Panel extras
      appearance: 'Darstellung',
      hoursWorkDay: 'Std. / Arbeitstag',
      hoursWeekendDay: 'Std. / Wochenendtag',
      capacityHint: 'Nicht angehakte Tage sind Wochenendtage. 0 h pro Wochenendtag = an diesen Tagen wird nichts geplant. Wird für die Auslastung in Statusleiste und Übersicht verwendet. Gespeichert {where}.',
      calcFromOne: 'Berechnet aus {n} Untertask (Pfeile zu anderen Tasks und der abgeleiteten Map).',
      calcFromMany: 'Berechnet aus {n} Untertasks (Pfeile zu anderen Tasks und der abgeleiteten Map).',
      calcSome: 'Einige dieser Tasks haben Untertasks; ihr Fortschritt wird berechnet.',
      reverseTitle: 'Start und Ende tauschen',
      repeatOffHint: '<b>Aufwand</b> leer lassen für ganze freie Tage, oder die freien Stunden pro Tag angeben (z. B. 4h). An ganzen freien Tagen wird nichts geplant und ihre Termine entfallen.',
      repeatBudgetHint: 'Stunden pro Woche = <b>Aufwand</b> oben. Wird von der Kapazität abgezogen; neue Tages- / Wochenpläne bekommen einen Eintrag.',
      repeatDurationHint: 'Dauer = <b>Aufwand</b> oben. Wird von der Kapazität abgezogen; neue Tages- / Wochenpläne bekommen einen Eintrag.',
      'repeatKind_weekly': 'Wöchentlich / alle n Wochen',
      'repeatKind_monthly-day': 'Monatlich (Tag im Monat)',
      'repeatKind_monthly-nth': 'Monatlich (n-ter Wochentag)',
      'repeatKind_budget': 'Zeitbudget pro Woche',
      'repeatKind_off': 'Freie Tage / Urlaub',
      route_straight: 'Gerade', route_elbow: 'Rechter Winkel', route_rounded: 'Abgerundeter Winkel', route_curved: 'Kurve',
      line_solid: 'Durchgezogen', line_dashed: 'Gestrichelt', line_dotted: 'Gepunktet', line_dashdot: 'Strichpunkt',

      // Weekdays (0 = Sunday) and ordinals
      wd_0: 'So', wd_1: 'Mo', wd_2: 'Di', wd_3: 'Mi', wd_4: 'Do', wd_5: 'Fr', wd_6: 'Sa',
      nth_1: '1.', nth_2: '2.', nth_3: '3.', nth_4: '4.', nth_5: '5.', 'nth_-1': 'letzter',

      // Routine labels
      rl_budget: '{d} pro Woche',
      rl_off: 'Frei {range}',
      rl_offPerDay: ' ({d} pro Tag)',
      rl_noDay: '(kein Tag)',
      rl_every: 'Jeden {days}',
      rl_everyN: 'Alle {n} Wochen am {days}',
      rl_monthlyDay: 'Monatlich am {day}.',
      rl_monthlyNth: '{nth} {wd} im Monat',
    },
    en: {
      // Toolbar
      tbNew: 'New',
      tbNewTitle: 'New map',
      tbOpen: 'Open',
      tbOpenTitle: 'Open… (Ctrl+O)',
      tbSave: 'Save',
      tbSaveTitle: 'Save (Ctrl+S)',
      tbSaveAs: 'Save as',
      tbSaveAsTitle: 'Save as… (Ctrl+Shift+S)',
      tbProject: 'Project',
      tbProjectTitle: 'Project folder with several maps',
      tbPanel: 'Panel',
      tbPanelTitle: 'Toggle properties panel',
      tbPanelAria: 'Toggle properties panel',
      closePanel: 'Collapse panel',
      expandPanel: 'Expand panel',
      panelResizerTitle: 'Resize panel (double-click for default width, arrow keys)',
      tbOverview: 'Overview',
      tbOverviewTitle: 'Tasks of all maps in the project folder',
      tbViews: 'Views',
      tbViewsTitle: 'Tree, radial, bubble and treemap view of this map (selected note = start)',
      tbUndoTitle: 'Undo (Ctrl+Z)',
      tbUndoAria: 'Undo',
      tbRedoTitle: 'Redo (Ctrl+Y)',
      tbRedoAria: 'Redo',
      tbInsert: '+ Insert ▾',
      tbInsertTitle: 'Insert a note (or right-click the canvas)',
      tbGuides: 'Smart guides',
      tbGuidesTitle: 'Snap to other notes (smart guides). Hold Alt while dragging to bypass.',
      tbGrid: 'Grid',
      tbGridTitle: 'Snap to grid',
      tbDetails: 'Details',
      tbDetailsTitle: 'Show deadline, estimate, priority and tags below notes',
      tbFilter: 'Filter',
      tbFilterTitle: 'Filter notes by text, tags, priority, deadline',
      tbZoomOutTitle: 'Zoom out (-)',
      tbZoomOutAria: 'Zoom out',
      tbZoomResetTitle: 'Reset zoom to 100%',
      tbZoomResetAria: 'Reset zoom to 100%',
      tbZoomInTitle: 'Zoom in (+)',
      tbZoomInAria: 'Zoom in',
      tbFit: 'Fit',
      tbFitTitle: 'Fit map to window (Shift+1)',
      tbThemeTitle: 'Toggle theme (Light / Dark / Auto)',
      tbThemeAria: 'Toggle theme',
      tbLangTitle: 'Switch language (current: English)',
      tbLangAria: 'Switch language',
      tbHelpTitle: 'Handbook and example map',
      tbHelpAria: 'Handbook and example map',

      // Statusbar & hints
      defaultHint: 'Right-click: insert · Drag a blue dot: connect · Tab: child note',
      st_counts: '{nodes} notes · {edges} connections',
      st_selected: '{n} selected',
      st_filterShown: 'filter: {n} shown',
      helpOpenHandbook: 'Open handbook (HANDBUCH.md, German)',
      helpLoadExample: 'Load example map',

      // Filterbar (dynamic part)
      fb_tagCount: '{n} note(s)',
      fb_noTags: 'no tags yet',
      fb_any: 'any', fb_anyTitle: 'Notes with at least one of the tags',
      fb_all: 'all', fb_allTitle: 'Notes with all of the tags',
      fb_dim: 'Dim', fb_dimTitle: 'Show non-matching notes faded',
      fb_hide: 'Hide', fb_hideTitle: 'Hide non-matching notes',
      fb_keep: 'Keep sub-notes',
      fb_keepTitle: 'Notes connected below a match (arrow direction) and notes inside a matching group stay visible',
      fb_allTypes: 'All types',
      fb_dl_any: 'Any deadline', fb_dl_overdue: 'Overdue', fb_dl_today: 'Due today (or overdue)',
      fb_dl_week: 'Due within 7 days', fb_dl_has: 'Has a deadline', fb_dl_none: 'No deadline',
      fb_count: '{m} matching of {n} notes',
      fb_countSub: '{m} matching (+{s} sub-notes) of {n}',

      // Filterbar
      filterSearchPlaceholder: 'Search notes…',
      filterClear: 'Clear',
      filterClearTitle: 'Reset all filters',
      filterCloseTitle: 'Close filter bar (filter stays active)',

      // Common & Panel
      close: 'Close',
      delete: 'Delete',
      duplicate: 'Duplicate',
      optional: 'optional',
      type: 'Type',
      file: 'File',
      image: 'Image',
      note: 'Note',
      openFile: 'Open ↗',
      replaceFile: 'Replace…',
      path: 'Path',
      pathTitle: 'Show where the file is stored',
      showAs: 'Show as',
      overlay: 'Overlay',
      fit: 'Fit',
      fitCover: 'Fill',
      fitContain: 'Whole image',
      opacity: 'Opacity',
      replaceImage: 'Replace image…',
      imageHint: 'Double-click the image to add a caption. Shift while resizing frees the aspect ratio.',
      shape: 'Shape',
      style: 'Style',
      fill: 'Fill',
      border: 'Border',
      borderWidth: 'Border width',
      borderLine: 'Border line',
      solid: 'Solid',
      dashed: 'Dashed',
      dotted: 'Dotted',
      text: 'Text',
      fontSize: 'Font size',
      bold: 'Bold',
      align: 'Align',
      alignLeft: 'Left',
      alignCenter: 'Center',
      alignRight: 'Right',
      alignDistribute: 'Align & distribute',
      align_left: 'Align left',
      align_hcenter: 'Align horizontal center',
      align_right: 'Align right',
      align_top: 'Align top',
      align_vcenter: 'Align vertical center',
      align_bottom: 'Align bottom',
      distributeH: 'Distribute ↔',
      distributeV: 'Distribute ↕',
      arrange: 'Arrange',
      toFront: 'To front',
      toBack: 'To back',
      details: 'Details',
      deadline: 'Deadline',
      clearDeadline: 'Clear deadline',
      deadlineTitle: 'When it must be finished – the time is spread over the work days until then. Clears a scheduled date.',
      scheduled: 'Scheduled',
      clearScheduled: 'Clear scheduled date',
      scheduledTitle: 'The day it takes place – like a routine, the estimated time is taken off the capacity of that day. Clears the deadline.',
      scheduledTimeTitle: 'Time (optional) – decides morning / afternoon / evening in the day plan',
      estimate: 'Estimate',
      estimatePlaceholder: 'e.g. 1h 30m',
      progress: 'Progress',
      clearProgress: 'Clear progress',
      progressPercent: 'Progress in percent',
      workload: 'Workload',
      status: 'Status',
      priority: 'Priority',
      tags: 'Tags',
      removeTag: 'Remove tag',
      addTagPlaceholder: 'Add tag…',
      link: 'Link',
      linkPlaceholder: 'Map, https://… or C:\\folder',
      linkInputTitle: 'A map of the project, a web address, or a folder / file on the PC (C:\\… or \\\\server\\share)',
      openLinkTitle: 'Open link (or Ctrl+click the note)',
      repeat: 'Repeat',
      repeatNone: 'Does not repeat',
      repeatWeekly: 'Weekly',
      repeatMonthlyDay: 'Monthly (day of month)',
      repeatMonthlyNth: 'Monthly (nth weekday)',
      repeatBudget: 'Weekly time budget',
      repeatOff: 'Vacation / Day off',
      every: 'every',
      weeksOn: 'week(s) on',
      onDay: 'on day',
      onThe: 'on the',
      from: 'from',
      until: 'until',
      atTime: 'at',
      connection: 'Connection',
      route: 'Route',
      routeStraight: 'Straight',
      routeElbow: 'Elbow',
      routeRounded: 'Rounded elbow',
      routeCurved: 'Curve',
      line: 'Line',
      lineSolid: 'Solid',
      lineDashed: 'Dashed',
      lineDotted: 'Dotted',
      lineDashdot: 'Dash-dot',
      color: 'Color',
      lineWidth: 'Line width',
      start: 'Start',
      end: 'End',
      label: 'Label',
      reverse: 'Reverse ⇄',
      edgeHint: 'Drag the round end handles onto a note to attach or re-attach. Hold Alt to leave an end free.',
      canvas: 'Canvas',
      smartGuidesCheck: 'Smart guides (snap to other notes)',
      snapGridCheck: 'Snap to grid',
      gridSize: 'Grid size',
      autoSaveCheck: 'Auto-save project maps into their file',
      mouseWheel: 'Mouse wheel',
      wheelZoom: 'Zoom',
      wheelScroll: 'Scroll (Ctrl = zoom)',
      theme: 'Theme',
      themeAuto: 'Automatic (System)',
      themeLight: 'Light',
      themeDark: 'Dark',
      language: 'Language',
      planningCapacity: 'Planning capacity',
      hoursDay: 'Hours / day',
      workDays: 'Work days',
      workloadHint: 'Used for the workload in the status bar and the overview.',
      newConnections: 'New connections',
      shortcuts: 'Shortcuts',

      // Node types
      node_text: 'Note',
      node_heading: 'Heading',
      node_todo: 'To-Do',
      node_outline: 'Outline',
      node_task: 'Task',
      node_link: 'Link',
      node_code: 'Code',
      node_group: 'Group',
      node_image: 'Image',
      node_file: 'File',

      // Shapes
      shape_rect: 'Rectangle',
      shape_rounded: 'Rounded',
      shape_pill: 'Pill',
      shape_ellipse: 'Ellipse',
      shape_diamond: 'Diamond',
      shape_hexagon: 'Hexagon',
      shape_parallelogram: 'Parallelogram',
      shape_none: 'No border',

      // Arrows
      arrow_none: 'None',
      arrow_arrow: 'Arrow',
      arrow_triangle: 'Triangle',
      arrow_circle: 'Circle',
      arrow_diamond: 'Diamond',
      arrow_bar: 'Bar',

      // Priorities
      prio_none: 'None',
      prio_low: 'Low',
      prio_medium: 'Medium',
      prio_high: 'High',
      prio_urgent: 'Urgent',
      // Eisenhower quadrants (alternative priority system)
      quad_none: 'Not classified',
      quad_both: 'Important + urgent',
      quad_important: 'Important only',
      quad_urgent: 'Urgent only',
      quad_neither: 'Neither',
      eisenhower: 'Eisenhower',
      prioLevels: 'Levels (Low … Urgent)',
      prioSystem: 'Priorities',
      prioSystemHint: 'Levels and Eisenhower quadrants are stored separately – switching loses nothing, only the chosen system is shown. Stored {where}.',

      // Statuses
      status_none: 'None',
      status_open: 'Open',
      status_progress: 'In progress',
      status_blocked: 'Blocked',
      status_done: 'Done',

      // Shortcuts table
      sc_rightClick: 'Insert note / context menu',
      sc_ctrlV: 'Insert image',
      sc_ctrlClick: 'Open the note\'s link',
      sc_codeNote: 'Enter = new line, Tab = indent, Ctrl+Enter / Esc = done',
      sc_group: 'Moving a group moves the notes inside it',
      sc_dblClick: 'Edit text',
      sc_dragAnchor: 'New connection (drop on empty canvas = new note)',
      sc_tab: 'New connected child note',
      sc_enterF2: 'Edit selected',
      sc_shiftEnter: 'New line while editing',
      sc_outline: 'Enter = new item, Tab / Shift+Tab = indent / outdent, click bullet = collapse',
      sc_spaceDrag: 'Pan (or middle mouse)',
      sc_altDrag: 'Move without snapping',
      sc_shiftResize: 'Keep aspect ratio',
      sc_undoRedo: 'Undo / redo',
      sc_clipboard: 'Copy / paste / duplicate',
      sc_arrows: 'Nudge (Shift = 10px)',
      sc_fit: 'Fit to window',

      // Shortcut keys (left column)
      key_rightClick: 'Right-click',
      key_ctrlV: 'Ctrl+V / drop file',
      key_ctrlClick: 'Ctrl+click',
      key_codeNote: 'Code note',
      key_group: 'Group',
      key_dblClick: 'Double-click',
      key_dragAnchor: 'Drag anchor dot',
      key_shiftEnter: 'Shift+Enter',
      key_outline: 'Outline',
      key_spaceDrag: 'Space + drag',
      key_altDrag: 'Alt + drag',
      key_shiftResize: 'Shift + resize',
      key_undoRedo: 'Ctrl+Z / Ctrl+Y',
      key_clipboard: 'Ctrl+C / V / D',
      key_arrows: 'Arrows',
      key_fit: 'Shift+1',

      // Panel extras
      appearance: 'Appearance',
      hoursWorkDay: 'Hours / work day',
      hoursWeekendDay: 'Hours / weekend day',
      capacityHint: 'Unchecked days are weekend days. 0 h per weekend day = no planning on those days. Used for the workload in the status bar and the overview. Stored {where}.',
      calcFromOne: 'Calculated from {n} sub-task (arrows to other tasks and the derived map).',
      calcFromMany: 'Calculated from {n} sub-tasks (arrows to other tasks and the derived map).',
      calcSome: 'Some of these tasks have sub-tasks; their progress is calculated.',
      reverseTitle: 'Swap start and end',
      repeatOffHint: 'Leave <b>Estimate</b> empty for whole days off, or set the hours off per day (e.g. 4h). No work is planned on whole days off and their appointments are skipped.',
      repeatBudgetHint: 'Hours per week = <b>Estimate</b> above. Takes its time off the workload capacity; new day / week plans get it as an entry.',
      repeatDurationHint: 'Duration = <b>Estimate</b> above. Takes its time off the workload capacity; new day / week plans get it as an entry.',
      'repeatKind_weekly': 'Weekly / every n weeks',
      'repeatKind_monthly-day': 'Monthly (day of month)',
      'repeatKind_monthly-nth': 'Monthly (n-th weekday)',
      'repeatKind_budget': 'Time budget per week',
      'repeatKind_off': 'Day(s) off / vacation',
      route_straight: 'Straight', route_elbow: 'Elbow', route_rounded: 'Rounded elbow', route_curved: 'Curve',
      line_solid: 'Solid', line_dashed: 'Dashed', line_dotted: 'Dotted', line_dashdot: 'Dash-dot',

      // Weekdays (0 = Sunday) and ordinals
      wd_0: 'Sun', wd_1: 'Mon', wd_2: 'Tue', wd_3: 'Wed', wd_4: 'Thu', wd_5: 'Fri', wd_6: 'Sat',
      nth_1: '1st', nth_2: '2nd', nth_3: '3rd', nth_4: '4th', nth_5: '5th', 'nth_-1': 'last',

      // Routine labels
      rl_budget: '{d} per week',
      rl_off: 'Off {range}',
      rl_offPerDay: ' ({d} per day)',
      rl_noDay: '(no day)',
      rl_every: 'Every {days}',
      rl_everyN: 'Every {n} weeks on {days}',
      rl_monthlyDay: 'Monthly on the {day}.',
      rl_monthlyNth: '{nth} {wd} of the month',
    }
  };

  MM.getLang = function () {
    return (MM.state && MM.state.settings && MM.state.settings.lang) || 'en';
  };

  MM.t = function (key, fallback) {
    const lang = MM.getLang();
    const dict = I18N.translations[lang] || I18N.translations.en;
    if (dict && dict[key] !== undefined) return dict[key];
    const enDict = I18N.translations.en;
    if (enDict && enDict[key] !== undefined) return enDict[key];
    return fallback !== undefined ? fallback : key;
  };

  /** t() with {placeholders}: MM.tf('calcFromMany', { n: 3 }) */
  MM.tf = function (key, vars) {
    return String(MM.t(key)).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));
  };

  /** Locale for dates and numbers. */
  MM.locale = () => (MM.getLang() === 'de' ? 'de-DE' : 'en-GB');

  /** Short weekday names, index 0 = Sunday. */
  MM.weekdayNames = () => [0, 1, 2, 3, 4, 5, 6].map((i) => MM.t('wd_' + i));

  MM.setLang = function (lang) {
    if (!MM.state || !MM.state.settings) return;
    MM.state.settings.lang = lang === 'de' ? 'de' : 'en';
    MM.saveSettings();
    MM.updateUIStrings();
    if (MM.filterbar && MM.filterbar.rebuild) MM.filterbar.rebuild();
    if (MM.panel && MM.panel.rebuild) MM.panel.rebuild();
    if (MM.overview && MM.overview.rebuild) MM.overview.rebuild();
    if (MM.project && MM.project.rebuild) MM.project.rebuild();
    MM.refresh();
  };

  MM.isDarkMode = function () {
    const t = (MM.state && MM.state.settings && MM.state.settings.theme) || 'auto';
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  };

  MM.applyTheme = function () {
    const t = (MM.state && MM.state.settings && MM.state.settings.theme) || 'auto';
    const root = document.documentElement;
    if (t === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else if (t === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }

    const btn = document.getElementById('theme-btn');
    if (btn) {
      const isDark = MM.isDarkMode();
      btn.textContent = t === 'auto' ? '🌓' : (isDark ? '🌙' : '☀️');
      const label = MM.t('tbThemeTitle');
      btn.title = `${label} (${t.toUpperCase()})`;
      btn.setAttribute('aria-label', btn.title);
    }
  };

  MM.updateUIStrings = function () {
    const lang = MM.getLang();
    document.documentElement.lang = lang;

    const tbButtons = {
      newDoc: { text: MM.t('tbNew'), title: MM.t('tbNewTitle'), aria: MM.t('tbNewTitle') },
      open: { text: MM.t('tbOpen'), title: MM.t('tbOpenTitle'), aria: MM.t('tbOpenTitle') },
      save: { text: MM.t('tbSave'), title: MM.t('tbSaveTitle'), aria: MM.t('tbSaveTitle') },
      saveAs: { text: MM.t('tbSaveAs'), title: MM.t('tbSaveAsTitle'), aria: MM.t('tbSaveAsTitle') },
      toggleProject: { text: MM.t('tbProject'), title: MM.t('tbProjectTitle'), aria: MM.t('tbProjectTitle') },
      togglePanel: { text: MM.t('tbPanel'), title: MM.t('tbPanelTitle'), aria: MM.t('tbPanelAria') },
      overview: { text: MM.t('tbOverview'), title: MM.t('tbOverviewTitle'), aria: MM.t('tbOverviewTitle') },
      views: { text: MM.t('tbViews'), title: MM.t('tbViewsTitle'), aria: MM.t('tbViewsTitle') },
      undo: { title: MM.t('tbUndoTitle'), aria: MM.t('tbUndoAria') },
      redo: { title: MM.t('tbRedoTitle'), aria: MM.t('tbRedoAria') },
      insertMenu: { text: MM.t('tbInsert'), title: MM.t('tbInsertTitle'), aria: MM.t('tbInsertTitle') },
      toggleGuides: { text: MM.t('tbGuides'), title: MM.t('tbGuidesTitle'), aria: MM.t('tbGuidesTitle') },
      toggleGrid: { text: MM.t('tbGrid'), title: MM.t('tbGridTitle'), aria: MM.t('tbGridTitle') },
      toggleMeta: { text: MM.t('tbDetails'), title: MM.t('tbDetailsTitle'), aria: MM.t('tbDetailsTitle') },
      toggleFilter: { text: MM.t('tbFilter'), title: MM.t('tbFilterTitle'), aria: MM.t('tbFilterTitle') },
      zoomOut: { title: MM.t('tbZoomOutTitle'), aria: MM.t('tbZoomOutAria') },
      zoomReset: { title: MM.t('tbZoomResetTitle'), aria: MM.t('tbZoomResetAria') },
      zoomIn: { title: MM.t('tbZoomInTitle'), aria: MM.t('tbZoomInAria') },
      fit: { text: MM.t('tbFit'), title: MM.t('tbFitTitle'), aria: MM.t('tbFitTitle') },
      help: { title: MM.t('tbHelpTitle'), aria: MM.t('tbHelpAria') },
    };

    for (const [action, cfg] of Object.entries(tbButtons)) {
      const btn = document.querySelector(`#toolbar button[data-action="${action}"]`);
      if (!btn) continue;
      if (cfg.text) btn.textContent = cfg.text;
      if (cfg.title) btn.title = cfg.title;
      if (cfg.aria) btn.setAttribute('aria-label', cfg.aria);
    }

    const langBtn = document.getElementById('lang-btn');
    if (langBtn) {
      langBtn.textContent = lang.toUpperCase();
      langBtn.title = MM.t('tbLangTitle');
      langBtn.setAttribute('aria-label', MM.t('tbLangAria'));
    }

    MM.applyTheme();

    if (MM.ui) {
      MM.ui.defaultHint = MM.t('defaultHint');
      const hintEl = document.getElementById('status-hint');
      if (hintEl && !hintEl.classList.contains('flash')) {
        hintEl.textContent = MM.ui.defaultHint;
      }
    }

    const fbSearch = document.querySelector('#filterbar .fb-search');
    if (fbSearch) fbSearch.placeholder = MM.t('filterSearchPlaceholder');
    const fbClear = document.querySelector('#filterbar [data-f-clear]');
    if (fbClear) {
      fbClear.textContent = MM.t('filterClear');
      fbClear.title = MM.t('filterClearTitle');
      fbClear.setAttribute('aria-label', MM.t('filterClearTitle'));
    }
    const fbClose = document.querySelector('#filterbar [data-f-close]');
    if (fbClose) {
      fbClose.title = MM.t('filterCloseTitle');
      fbClose.setAttribute('aria-label', MM.t('filterCloseTitle'));
    }

    const resizer = document.getElementById('panel-resizer');
    if (resizer) {
      resizer.title = MM.t('panelResizerTitle');
      resizer.setAttribute('aria-label', MM.t('panelResizerTitle'));
    }

    const expandBtn = document.getElementById('panel-expand-btn');
    if (expandBtn) {
      expandBtn.title = MM.t('expandPanel');
      expandBtn.setAttribute('aria-label', MM.t('expandPanel'));
    }

    // placeholders of empty notes (CSS ::before content, see app.css)
    if (MM.tr) {
      const css = (s) => JSON.stringify(MM.tr(s));
      const rs = document.documentElement.style;
      rs.setProperty('--ph-type', css('Type…'));
      rs.setProperty('--ph-title', css('Title'));
      rs.setProperty('--ph-file', css('File note'));
    }
  };

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const t = (MM.state && MM.state.settings && MM.state.settings.theme) || 'auto';
      if (t === 'auto') {
        MM.applyTheme();
      }
    });
  }
})(window.MM);
