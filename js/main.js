'use strict';
/* Startup, toolbar/status bar updates and the demo map shown on first start. */
(function (MM) {
  const S = MM.state;
  const UI = (MM.ui = {});

  MM.refresh = function () {
    MM.render.all();
    MM.panel.update();
    MM.filterbar.update();
    MM.project.render();
    UI.update();
  };

  UI.update = function () {
    document.querySelectorAll('#toolbar [data-toggle]').forEach((b) => {
      b.classList.toggle('active', !!S.settings[b.dataset.toggle]);
    });
    document.querySelector('[data-action="undo"]').disabled = !MM.history.undoStack.length;
    document.querySelector('[data-action="redo"]').disabled = !MM.history.redoStack.length;
    document.getElementById('zoom-label').textContent = Math.round(S.doc.view.zoom * 100) + '%';

    const name = (S.file.path || S.file.name) + (S.dirty ? ' •' : '');
    document.getElementById('status-file').textContent = name;
    document.title = name + ' – MindMapper';
    const nodes = Object.keys(S.doc.nodes).length, edges = Object.keys(S.doc.edges).length;
    const sel = S.selection.size ? ' · ' + MM.tf('st_selected', { n: S.selection.size }) : '';
    const shown = MM.meta.filterActive()
      ? ' · ' + MM.tf('st_filterShown', { n: Object.values(S.doc.nodes).filter(MM.meta.matches).length }) : '';
    document.getElementById('status-info').textContent = MM.tf('st_counts', { nodes, edges }) + sel + shown;
    MM.load.renderStatus(); // planned hours today / this week / smallest buffer
  };

  let flashTimer = null;
  UI.flash = function (msg) {
    const el = document.getElementById('status-hint');
    el.textContent = msg;
    el.classList.add('flash');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      el.classList.remove('flash');
      el.textContent = UI.defaultHint;
    }, 2500);
  };
  UI.defaultHint = MM.t('defaultHint');

  function demoDoc() {
    const doc = MM.emptyDoc();
    const add = (type, cx, cy, extra) => {
      const n = MM.createNode(type, cx, cy, extra);
      doc.nodes[n.id] = n;
      return n;
    };
    const link = (a, b, style, label, anchors) => {
      const e = MM.createEdge(
        { node: a.id, anchor: (anchors && anchors[0]) || 'auto' },
        { node: b.id, anchor: (anchors && anchors[1]) || 'auto' }, style);
      e.label = label || '';
      doc.edges[e.id] = e;
    };
    const root = add('heading', 0, 0, { text: 'MindMapper' });
    const shapes = add('text', -340, -150, { text: 'Formen:\nRechteck, Ellipse, Raute, Sechseck …', shape: 'ellipse', w: 200, h: 90 });
    const conn = add('text', 340, -150, { text: 'Verbindungen rasten an Ankerpunkten ein und folgen den Notes', shape: 'hexagon', w: 240, h: 84 });
    const todo = add('todo', 340, 140, { text: 'Erste Schritte', w: 250 });
    todo.items = [
      MM.createTodoItem('Projektordner öffnen (links: Open folder…)'),
      MM.createTodoItem('Ersten Wochenplan anlegen (+ New map)'),
      MM.createTodoItem('Routinen und Urlaub eintragen'),
      Object.assign(MM.createTodoItem('Beispiel-Map ansehen'), { done: true }),
    ];
    const notes = add('outline', 0, 260, { text: 'Outline-Note', w: 280 });
    notes.blocks = [
      MM.createBlock('Enter = neuer Punkt', 0),
      MM.createBlock('Tab = einrücken', 0),
      MM.createBlock('Shift+Tab = ausrücken', 1),
      MM.createBlock('Klick auf den Punkt = zuklappen', 0),
      MM.createBlock('versteckter Unterpunkt', 1),
    ];
    notes.blocks[3].collapsed = true;
    const task = add('task', 0, 470, { text: 'Präsentation vorbereiten', w: 300 });
    task.blocks = [MM.createBlock('Zahlen sammeln', 0), MM.createBlock('Folien entwerfen', 0), MM.createBlock('Diagramme', 1)];
    const inFive = new Date(Date.now() + 5 * 864e5);
    task.meta = { deadline: inFive.toISOString().slice(0, 10), estimate: 150, priority: 'high', status: 'progress', progress: 30 };
    task.tags = ['arbeit'];
    todo.tags = ['start'];
    conn.tags = ['hilfe'];
    conn.meta.priority = 'low';
    const tip = add('text', -340, 140, { text: 'Rechtsklick: einfügen.\nDoppelklick: bearbeiten.', shape: 'diamond', w: 220, h: 120 });
    tip.style.fill = '#f0fff4';
    tip.style.stroke = '#2f855a';
    link(root, shapes, { route: 'curved' });
    link(root, conn, { route: 'rounded', lineStyle: 'dashed' }, 'abgerundeter Winkel');
    link(root, todo, { route: 'elbow', endArrow: 'arrow' });
    link(root, tip, { route: 'straight', lineStyle: 'dotted', endArrow: 'circle', color: '#2f855a' });
    link(root, notes, { route: 'curved' });
    link(notes, task, { route: 'straight' });
    handbook(doc, add, link, task);
    return doc;
  }

  /** Short version of HANDBUCH.md, one outline note per chapter, inside a group below the demo. */
  const HANDBOOK = [
    ['1 · Starten & Speichern', ['index.html in Edge oder Chrome öffnen', 'Projektordner: links „Project“ → Open folder…',
      'Maps im Projektordner speichern sich automatisch', 'Knopf „?“ oben rechts: Handbuch und diese Beispiel-Map']],
    ['2 · Bedienung', ['Rechtsklick: einfügen und alle Befehle', 'Doppelklick oder Enter: Text bearbeiten', 'Tab: verbundene Note anlegen',
      'Blauen Punkt ziehen: verbinden', 'Leertaste + Ziehen: Ansicht verschieben', 'Ctrl+Z / Ctrl+Y: rückgängig / wiederholen']],
    ['3 · Notiztypen', ['Note, Heading, To-Do, Outline, Task', 'Link, Code, Group, Image, File',
      'Typ ändern: Rechtsklick → Change type', 'Dateien auf die Fläche ziehen → Datennote (Assets/)']],
    ['4 · Details & Filter', ['Panel → Details: Deadline, Estimate, Status, Priority, Tags', 'In Tasks: Klick auf einen Chip öffnet ein Auswahlmenü',
      'Toolbar „Filter“: Suche, Tags, Status … (Dim / Hide)']],
    ['5 · Projekt & Pläne', ['+ New map: leer, Day / Week / Month plan', 'Rechtsklick auf eine Map: umbenennen, verschieben, löschen',
      'Carry-over: Unerledigtes wandert in den nächsten Plan', 'Rechtsklick → Move to map: Note in eine andere Map']],
    ['6 · Overview & Untertasks', ['Toolbar „Overview“: alle Aufgaben aller Maps', 'By deadline · By task · Workload',
      'Pfeil Task → Task: Untertask, Fortschritt ∑', 'Create map from note…: eigene Map für eine große Aufgabe']],
    ['7 · Auslastung', ['Schätzung + Deadline → Stunden pro Tag und Woche', 'Statusleiste: Today · Week · Buffer (rot = Überlast)',
      'Panel → Workload: was eine Note zur Woche beiträgt', 'Kapazität: Panel bei leerer Auswahl']],
    ['8 · Routinen & Urlaub', ['Panel → Repeat: Meeting, Budget pro Woche, monatlich', 'Day(s) off / vacation: Urlaub (Estimate leer = ganzer Tag)',
      'Ziehen ihre Zeit von der Kapazität ab', 'Erscheinen in neuen Tages- und Wochenplänen']],
    ['9 · Views & Auto-Layout', ['Toolbar „Views“: Baum, radial, Bubble, Treemap', 'Größe = Schätzung, Farbe = Status',
      'Rechtsklick → Auto-layout: Notes automatisch anordnen', 'Ctrl+. : Emoji einfügen']],
  ];

  /** Adds the handbook group below the demo, connected to the note `from`. */
  function handbook(doc, add, link, from) {
    const COLS = 3, W = 340, GAP = 40, X0 = -560, Y0 = 760;
    // heights are estimated (about 42 characters per line); the note grows if needed
    const height = (lines) => 50 + lines.reduce((s, l) => s + Math.ceil(l.length / 42) * 21, 0);
    const colY = [Y0, Y0, Y0];
    HANDBOOK.forEach(([title, lines], i) => {
      const c = i % COLS;
      const n = add('outline', 0, 0, { text: title, w: W });
      n.blocks = lines.map((l) => MM.createBlock(l, 0));
      n.h = height(lines);
      n.x = X0 + c * (W + GAP);
      n.y = colY[c];
      n.style.stroke = '#3c6fd1';
      colY[c] += n.h + GAP;
    });
    // link to the full handbook next to this map
    let url = 'HANDBUCH.md';
    try { url = new URL('HANDBUCH.md', location.href).href; } catch (e) { /* keep relative */ }
    const open = add('link', 0, 0, { text: 'Ganzes Handbuch öffnen', link: url, w: 260, h: 48 });
    open.x = X0;
    open.y = Y0 - 80;
    const right = X0 + COLS * W + (COLS - 1) * GAP;
    const bottom = Math.max(...colY);
    const group = add('group', 0, 0, { text: 'Handbuch – Kurzfassung', w: right - X0 + 60, h: bottom - (Y0 - 140) + 10 });
    group.x = X0 - 30;
    group.y = Y0 - 140;
    // the group lies behind its notes: put it first in drawing order
    const rest = Object.assign({}, doc.nodes);
    delete rest[group.id];
    doc.nodes = Object.assign({ [group.id]: group }, rest);
    link(from, group, { route: 'straight', lineStyle: 'dashed', endArrow: 'none' });
  }

  MM.demoDoc = demoDoc;

  /** Toolbar "?": handbook (HANDBUCH.md) and the example map. */
  MM.actions.help = function () {
    if (MM.menu.isOpen()) return MM.menu.close();
    const r = document.querySelector('[data-action="help"]').getBoundingClientRect();
    MM.menu.open([
      {
        label: MM.t('helpOpenHandbook'),
        action: () => {
          let url = 'HANDBUCH.md';
          try { url = new URL('HANDBUCH.md', location.href).href; } catch (e) { /* keep relative */ }
          window.open(url, '_blank', 'noopener');
        },
      },
      {
        label: MM.t('helpLoadExample'),
        action: async () => {
          if (!(await MM.storage.confirmLeave('open the example map'))) return;
          S.file = { handle: null, backend: null, name: 'Beispiel.mindmap.json', path: null };
          MM.storage.load(demoDoc(), S.file.name);
          S.dirty = false;
          MM.actions.fit();
        },
      },
    ], Math.max(4, r.right - 240), r.bottom + 2);
  };

  async function init() {
    MM.render.init();
    MM.interaction.init();
    MM.panel.init();
    MM.menu.init();
    MM.filterbar.init();
    MM.storage.loadSettings();
    MM.applyTheme();
    MM.updateUIStrings();
    MM.filterbar.rebuild();
    MM.panel.applyLayout();

    document.getElementById('toolbar').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (btn && !btn.disabled) MM.actions[btn.dataset.action](btn.dataset.value);
    });
    // ☺ must not end a running text edit: the emoji goes in at the caret
    document.getElementById('emoji-btn').addEventListener('mousedown', (e) => e.preventDefault());
    document.getElementById('status-hint').textContent = UI.defaultHint;
    document.getElementById('status-load').addEventListener('click', () => MM.overview.open('load'));

    if (!(await MM.storage.restoreAutosave())) {
      MM.storage.load(demoDoc());
      MM.actions.fit();
    } else {
      MM.refresh();
    }
    await MM.project.init(); // after the autosave, so the restored map can be linked to its file
    window.addEventListener('resize', () => MM.render.applyView());
    window.addEventListener('beforeunload', () => MM.storage.autosave());
  }

  MM.ready = init(); // resolves once the last session (or the demo) is loaded

  // installable app + offline copy (sw.js); only from a web server (https or localhost), not for file://
  if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('MindMapper: no offline copy', e));
  }
})(window.MM);
