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
    document.getElementById('zoom-label').textContent = Math.round(S.doc.view.zoom * 100) + '% ▾';

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
    ['5 · Die Task', ['Deadline → Projektaufgabe: Zeit bis dahin verteilt', 'Scheduled → Termin 📌: blockt seinen Tag',
      'Repeat → Routine 🔁: nimmt Kapazität (Freizeit nicht)', 'Ohne Estimate wird nichts eingeplant']],
    ['6 · Projekt & Pläne', ['+ New map: leer, Day / Week / Month plan', 'Rechtsklick auf eine Map: umbenennen, verschieben, löschen',
      'Carry-over: Unerledigtes wandert in den nächsten Plan', 'Rechtsklick → Move to map: Note in eine andere Map']],
    ['7 · Overview & Untertasks', ['Toolbar „Overview“: alle Aufgaben aller Maps', 'By deadline · By task · Workload',
      'Pfeil Task → Task: Untertask, Fortschritt ∑', 'Create map from note…: eigene Map für eine große Aufgabe']],
    ['8 · Auslastung', ['Schätzung + Deadline → Stunden pro Tag und Woche', 'Statusleiste: Today · Week · Buffer (rot = Überlast)',
      'Panel → Workload: was eine Note zur Woche beiträgt', 'Kapazität: Panel bei leerer Auswahl']],
    ['9 · Routinen & Urlaub', ['Panel → Repeat: Meeting, Budget pro Woche, monatlich', 'Day(s) off / vacation: Urlaub (Estimate leer = ganzer Tag)',
      'Ziehen ihre Zeit von der Kapazität ab', 'Erscheinen in neuen Tages- und Wochenplänen']],
    ['10 · Views & Auto-Layout', ['Toolbar „Views“: Baum, radial, Bubble, Treemap', 'Größe = Schätzung, Farbe = Status',
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
    let url = 'HANDBUCH.html';
    try { url = new URL('HANDBUCH.html', location.href).href; } catch (e) { /* keep relative */ }
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

  /**
   * Second example: a small creative project with everything the planning shows -
   * main and sub-tasks, a bloated and an overdue task, an appointment, routines,
   * days off, a plain to-do list and short notes that explain it. Dates are relative
   * to today, so the Overview (By deadline, By task, Workload, Matrix) is always filled.
   */
  function projectDoc() {
    const doc = MM.emptyDoc();
    const p = (v) => String(v).padStart(2, '0');
    const day = (n) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const add = (type, cx, cy, extra) => {
      const n = MM.createNode(type, cx, cy, extra);
      doc.nodes[n.id] = n;
      return n;
    };
    const task = (cx, cy, text, meta, extra) => {
      const n = add('task', cx, cy, Object.assign({ text, w: 260 }, extra));
      n.meta = Object.assign(MM.emptyMeta(), meta);
      return n;
    };
    const link = (a, b, style) => {
      const e = MM.createEdge({ node: a.id, anchor: 'auto' }, { node: b.id, anchor: 'auto' }, style);
      doc.edges[e.id] = e;
      return e;
    };
    const sub = (a, b) => link(a, b, { route: 'elbow', endArrow: 'arrow' });
    const hint = (cx, cy, text, w) => {
      const n = add('text', cx, cy, { text, w: w || 260, h: 92 });
      n.style.fill = '#fffbea';
      n.style.stroke = '#d69e2e';
      n.style.align = 'left';
      return n;
    };
    const h = 60; // hours -> minutes

    const root = add('heading', 0, -420, { text: 'Beispielprojekt: EP aufnehmen', w: 380 });
    const guide = add('outline', -760, -460, { text: 'So probierst du es aus', w: 420 });
    guide.blocks = [
      'Zuerst: File → Save as… in einen Projektordner (am besten einen leeren Testordner)',
      'Erst dann zeigt die Overview die Aufgaben – sie liest die Maps des Ordners',
      'Toolbar „Overview“: By deadline, By task, Workload',
      'Matrix: Panel (nichts markiert) → Priorities → Eisenhower',
      'Statusleiste unten: heute, Woche, Puffer',
      'Daten sind relativ zu heute – das Beispiel bleibt aktuell',
    ].map((t) => MM.createBlock(t, 0));
    guide.h = 230;

    // main task with sub-tasks: 17 h of 20 h split up, one sub-task done
    const songs = task(-700, -140, 'Songs fertig schreiben', { deadline: day(10), estimate: 20 * h, status: 'progress', priority: 'high', quadrant: 'important' });
    const s1 = task(-990, 130, 'Song 1: Text überarbeiten', { deadline: day(4), estimate: 3 * h, status: 'done', progress: 100, priority: 'medium', quadrant: 'important' }, { w: 230 });
    const s2 = task(-700, 130, 'Song 2: Bridge komponieren', { deadline: day(6), estimate: 6 * h, status: 'progress', progress: 40, priority: 'high', quadrant: 'important' }, { w: 230 });
    const s3 = task(-410, 130, 'Song 3: Arrangement', { deadline: day(10), estimate: 8 * h, status: 'open', priority: 'medium', quadrant: 'important' }, { w: 230 });
    [s1, s2, s3].forEach((n) => sub(songs, n));

    // second main task: one sub-task is urgent, but not important
    const session = task(-120, -140, 'Aufnahme-Session vorbereiten', { deadline: day(14), estimate: 6 * h, status: 'open', priority: 'high', quadrant: 'both' });
    const studio = task(-240, 130, 'Studio buchen', { deadline: day(2), estimate: 30, status: 'open', priority: 'urgent', quadrant: 'urgent' }, { w: 210 });
    const gear = task(0, 130, 'Equipment-Liste', { deadline: day(12), estimate: 1 * h, status: 'open', priority: 'low', quadrant: 'both' }, { w: 210 });
    [studio, gear].forEach((n) => sub(session, n));

    // a bloated task (big circle in the Matrix) and an overdue one
    const web = task(380, -140, 'Website relaunchen', { deadline: day(21), estimate: 40 * h, status: 'open', priority: 'low', quadrant: 'neither' });
    web.blocks = [MM.createBlock('40 h in einem Stück – zu groß?', 0), MM.createBlock('besser in Untertasks zerlegen', 0)];
    const grant = task(380, 130, 'Förderantrag abschicken', { deadline: day(-2), estimate: 2 * h, status: 'blocked', priority: 'urgent', quadrant: 'both' });
    const merch = task(380, 330, 'Merch-Ideen sammeln', { estimate: 3 * h, status: 'open', priority: 'medium', quadrant: 'important' });
    // urgent, but it does not move the project forward
    const reply = task(-120, -330, 'Rückmeldung an Veranstalter', { deadline: day(1), estimate: 30, status: 'open', priority: 'high', quadrant: 'urgent' }, { w: 240 });

    // appointment: blocks its day
    const rehearsal = task(820, -140, 'Bandprobe mit allen', { scheduled: day(3), scheduledTime: '19:00', estimate: 150, status: 'open', priority: 'medium', quadrant: 'both' });

    // routines and days off: they take time off the capacity
    const plan = task(820, 130, 'Wochenplanung', { estimate: 30, status: 'open' });
    plan.repeat = MM.normalizeRepeat({ kind: 'weekly', every: 1, days: [1], time: '09:00' });
    const practice = task(820, 330, 'Gitarre üben', { estimate: 45, status: 'open' });
    practice.repeat = MM.normalizeRepeat({ kind: 'times', times: 3 });
    const off = task(820, 530, 'Kurzurlaub', { status: 'none' });
    off.repeat = MM.normalizeRepeat({ kind: 'off', from: day(17), until: day(18) });

    // a plain checklist: no estimate / deadline, so it is no task in the Overview
    const ideas = add('todo', -120, 380, { text: 'Ideen-Parkplatz', w: 260 });
    ideas.items = ['Cover-Foto im Wald', 'Live-Session filmen', 'Release-Party?'].map((t) => MM.createTodoItem(t));

    // short explanations
    hint(-700, 380, 'Pfeil von Task zu Task = Untertask. Die Haupttask zeigt ihren Fortschritt als ∑ und wie viel der 20 h schon verteilt ist.', 300);
    hint(380, 560, '40 h ohne Untertasks: in der Matrix ein großer Kreis. Überfällige Aufgaben stehen in By deadline ganz oben.', 300);
    hint(1160, -140, 'Scheduled = Termin 📌: blockt 2 h 30 an seinem Tag.', 230);
    hint(1160, 230, 'Repeat = Routine 🔁: zieht ihre Zeit von der Kapazität ab. Day(s) off = Urlaub 🏖.', 230);
    hint(-120, 560, 'To-do-Listen ohne Schätzung oder Deadline sind reine Abhaklisten – sie zählen nicht als Aufgabe.', 280);

    // only the heading links the parts: any connection from one task to another makes a sub-task
    [songs, session, web, rehearsal, reply].forEach((n) => link(root, n, { route: 'curved' }));
    link(session, ideas, { route: 'straight', lineStyle: 'dashed', endArrow: 'none' });
    return doc;
  }
  MM.projectDoc = projectDoc;

  /** Toolbar "?": handbook (HANDBUCH.html, built from HANDBUCH.md) and the example map. */
  MM.actions.help = function () {
    if (MM.menu.isOpen()) return MM.menu.close();
    const r = document.querySelector('[data-action="help"]').getBoundingClientRect();
    MM.menu.open([
      {
        label: MM.t('helpOpenHandbook'),
        action: () => {
          let url = 'HANDBUCH.html';
          try { url = new URL('HANDBUCH.html', location.href).href; } catch (e) { /* keep relative */ }
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
      {
        label: MM.t('helpLoadProject'),
        action: async () => {
          if (!(await MM.storage.confirmLeave('open the example map'))) return;
          S.file = { handle: null, backend: null, name: 'Beispielprojekt.mindmap.json', path: null };
          MM.storage.load(projectDoc(), S.file.name);
          S.dirty = false;
          MM.actions.fit();
        },
      },
    ], Math.max(4, r.right - 280), r.bottom + 2);
  };

  async function init() {
    MM.render.init();
    MM.interaction.init();
    MM.touch.init(); // finger gestures (phones, tablets)
    MM.panel.init();
    MM.menu.init();
    MM.filterbar.init();
    MM.storage.loadSettings();
    MM.applyTheme();
    MM.updateUIStrings();
    MM.filterbar.rebuild();
    MM.panel.applyLayout();

    const toolbar = document.getElementById('toolbar');
    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (btn && !btn.disabled) MM.actions[btn.dataset.action](btn.dataset.value);
    });
    // a window too narrow for the toolbar: the mouse wheel moves it sideways (it never wraps)
    toolbar.addEventListener('wheel', (e) => {
      if (toolbar.scrollWidth <= toolbar.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      toolbar.scrollLeft += e.deltaY;
    }, { passive: false });
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
    MM.storage.initLifecycle(); // save when leaving, check the file when coming back
  }

  MM.ready = init(); // resolves once the last session (or the demo) is loaded

  // installable app + offline copy (sw.js); only from a web server (https or localhost), not for file://
  if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('MindMapper: no offline copy', e));
  }
})(window.MM);
