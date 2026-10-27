'use strict';
/*
 * Right-click context menu (also used for the toolbar's "+ Insert" drop-down).
 *
 * A menu is a list of entries:
 *   { label, action, shortcut?, checked?, disabled?, submenu?: [...] }
 *   '-'  -> separator
 *   falsy entries are skipped, so `cond && {...}` works.
 */
(function (MM) {
  const M = (MM.menu = {});
  const S = MM.state;
  const esc = (s) => MM.render.esc(s);
  let root;
  let entries = [];

  M.init = function () {
    root = document.getElementById('context-menu');
    root.addEventListener('click', onClick);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    root.addEventListener('mouseover', onHover);
    document.addEventListener('pointerdown', (e) => {
      if (!root.hidden && !root.contains(e.target) && !e.target.closest('#insert-btn, #file-btn, #zoom-label')) M.close();
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !root.hidden) {
        e.stopPropagation();
        M.close();
      }
    }, true);
    window.addEventListener('blur', () => M.close());
  };

  M.isOpen = () => root && !root.hidden;

  function build(list, path) {
    let h = '';
    list.forEach((it, i) => {
      if (!it) return;
      if (it === '-') {
        h += '<div class="menu-sep"></div>';
        return;
      }
      const p = path.concat(i).join('.');
      const cls = ['menu-item'];
      if (it.disabled) cls.push('disabled');
      if (it.submenu) cls.push('has-sub');
      h += `<div class="${cls.join(' ')}" data-path="${p}">` +
        `<span class="menu-check">${it.checked ? '✓' : ''}</span>` +
        `<span class="menu-label">${esc(MM.tr(it.label))}</span>` +
        `<span class="menu-shortcut">${it.submenu ? '▸' : esc(MM.tr(it.shortcut || ''))}</span>`;
      if (it.submenu) h += `<div class="menu menu-sub">${build(it.submenu, path.concat(i))}</div>`;
      h += '</div>';
    });
    return h;
  }

  // Touch screens and phones: submenus open in place ("‹ back" on top) instead of
  // beside the menu, and the menu scrolls instead of reaching beyond the screen.
  const drill = () => MM.render.coarse || window.matchMedia('(max-width: 600px)').matches;
  let at = { x: 0, y: 0 };

  /** Open a menu at screen position (x, y). */
  M.open = function (list, x, y) {
    entries = list;
    at = { x, y };
    root.classList.toggle('menu-drill', drill());
    show([]);
  };

  /** Show the entries of `path` (array of indices; [] = the menu itself) and keep it on screen. */
  function show(path) {
    const parent = path.length ? entryAt(path.join('.')) : null;
    root.innerHTML = (parent
      ? `<div class="menu-item menu-back" data-back="${path.slice(0, -1).join('.')}"><span class="menu-check">‹</span>` +
        `<span class="menu-label">${esc(MM.tr(parent.label))}</span></div><div class="menu-sep"></div>`
      : '') + build(parent ? parent.submenu : entries, path);
    root.hidden = false;
    root.scrollTop = 0;
    const r = root.getBoundingClientRect();
    root.style.left = Math.max(4, Math.min(at.x, window.innerWidth - r.width - 4)) + 'px';
    root.style.top = Math.max(4, Math.min(at.y, window.innerHeight - r.height - 4)) + 'px';
  }

  M.close = function () {
    if (root) root.hidden = true;
    entries = [];
  };

  function entryAt(path) {
    let list = entries, it = null;
    for (const i of path.split('.').map(Number)) {
      it = list[i];
      list = (it && it.submenu) || [];
    }
    return it;
  }

  function onClick(e) {
    const back = e.target.closest('.menu-back');
    if (back) {
      show(back.dataset.back ? back.dataset.back.split('.').map(Number) : []);
      return;
    }
    const el = e.target.closest('.menu-item');
    if (el && root.classList.contains('menu-drill') && el.classList.contains('has-sub') && !el.classList.contains('disabled')) {
      show(el.dataset.path.split('.').map(Number)); // submenu in place
      return;
    }
    if (!el || el.classList.contains('disabled') || el.classList.contains('has-sub')) return;
    const it = entryAt(el.dataset.path);
    M.close();
    if (it && it.action) it.action();
  }

  // flip submenus that would leave the window
  function onHover(e) {
    const el = e.target.closest('.menu-item.has-sub');
    if (!el) return;
    const sub = el.querySelector(':scope > .menu-sub');
    sub.classList.remove('flip-x');
    sub.style.top = '';
    const r = sub.getBoundingClientRect();
    if (r.right > window.innerWidth - 4) sub.classList.add('flip-x');
    if (r.bottom > window.innerHeight - 4) sub.style.top = `${window.innerHeight - 4 - r.bottom - 4}px`;
  }

  // ---- Metadata chips of task notes ----------------------------------------
  // A click on a chip (status, priority, deadline, estimate, progress) opens
  // a drop-down with the usual values right at the chip.

  const pad = (x) => String(x).padStart(2, '0');
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const inDays = (k) => {
    const d = new Date();
    return isoDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + k));
  };
  const nextMonday = () => {
    const d = new Date();
    return inDays(((8 - d.getDay()) % 7) || 7);
  };

  /** Native date picker at the chip (falls back to a prompt). key: 'deadline' | 'scheduled' */
  function pickDate(n, rect, key = 'deadline') {
    const input = document.createElement('input');
    input.type = 'date';
    input.value = n.meta[key] || inDays(0);
    const max = key === 'deadline' ? MM.tasks.maxDeadline([n]) : ''; // sub-task: not after the main task
    if (max) input.max = max;
    input.className = 'chip-date-input';
    input.style.left = rect.left + 'px';
    input.style.top = rect.bottom + 'px';
    document.body.appendChild(input);
    let done = false;
    const finish = (apply) => {
      if (done) return;
      done = true;
      if (apply && /^\d{4}-\d{2}-\d{2}$/.test(input.value)) setMeta(n, key, input.value);
      input.remove();
    };
    input.addEventListener('change', () => finish(true));
    input.addEventListener('blur', () => setTimeout(() => finish(false), 200));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.focus();
    try {
      input.showPicker();
    } catch (e) {
      finish(false);
      const v = prompt(MM.tr(key === 'scheduled' ? 'Scheduled (YYYY-MM-DD):' : 'Deadline (YYYY-MM-DD):'), n.meta[key] || inDays(0));
      if (v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) setMeta(n, key, v.trim());
    }
  }

  function setMeta(n, key, value) {
    MM.meta.setValue([n], key, value);
    MM.commit();
  }

  /** Open the drop-down for metadata field `key` of note n below the chip's rect. */
  M.openMeta = function (n, key, rect) {
    const m = n.meta;
    const set = (v) => () => setMeta(n, key, v);
    let list;
    if (key === 'status' || key === 'priority' || key === 'quadrant') {
      const catalog = key === 'status' ? MM.STATUSES : MM.prioCatalog();
      list = Object.entries(catalog).map(([k, v]) => ({
        label: key === 'status' ? (k === 'none' ? 'No status' : v.label) : k === 'none' && key === 'priority' ? 'No priority' : MM.prioLabel(k),
        checked: (m[key] || 'none') === k, action: set(k),
      }));
    } else if (key === 'deadline') {
      const max = MM.tasks.maxDeadline([n]); // sub-task: not after the main task
      const opt = (label, value) => ({
        label, shortcut: MM.meta.formatDate(value), checked: m.deadline === value, disabled: !!max && value > max, action: set(value),
      });
      list = [
        opt('Today', inDays(0)), opt('Tomorrow', inDays(1)), opt('In 3 days', inDays(3)),
        opt('Next Monday', nextMonday()), opt('In a week', inDays(7)), opt('In 2 weeks', inDays(14)),
        max && opt('Deadline of the main task', max),
        '-',
        { label: 'Pick date…', action: () => pickDate(n, rect) },
        { label: 'Clear', disabled: !m.deadline, action: set('') },
      ];
    } else if (key === 'scheduled') {
      const opt = (label, value) => ({ label, shortcut: MM.meta.formatDate(value), checked: m.scheduled === value, action: set(value) });
      const time = (hhmm) => ({
        label: hhmm, checked: m.scheduledTime === hhmm, action: () => setMeta(n, 'scheduledTime', hhmm),
      });
      list = [
        opt('Today', inDays(0)), opt('Tomorrow', inDays(1)), opt('In 3 days', inDays(3)),
        opt('Next Monday', nextMonday()), opt('In a week', inDays(7)),
        { label: 'Pick date…', action: () => pickDate(n, rect, 'scheduled') },
        '-',
        {
          label: 'Time', submenu: ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '18:00', '19:00'].map(time).concat(['-', {
            label: 'Other…',
            action: () => {
              const v = prompt(MM.tr('Time (HH:MM):'), m.scheduledTime || '');
              if (v === null) return;
              const t = /^(\d{1,2})[:.]?(\d{2})?$/.exec(v.trim());
              if (!v.trim()) setMeta(n, 'scheduledTime', '');
              else if (t && +t[1] < 24 && +(t[2] || 0) < 60) setMeta(n, 'scheduledTime', `${pad(t[1])}:${t[2] || '00'}`);
              else alert(MM.tr('Could not read "{v}".', { v }));
            },
          }, { label: 'No time', disabled: !m.scheduledTime, action: () => setMeta(n, 'scheduledTime', '') }]),
        },
        { label: 'Clear', disabled: !m.scheduled, action: set('') },
      ];
    } else if (key === 'estimate') {
      list = [15, 30, 45, 60, 90, 120, 180, 240, 480].map((min) => ({
        label: MM.meta.formatDuration(min), checked: m.estimate === min, action: set(min),
      })).concat(['-', {
        label: 'Other…',
        action: () => {
          const v = prompt(MM.tr('Estimated time (e.g. 1h 30m, 90m, 2h, 1d):'), MM.meta.formatDuration(m.estimate));
          if (v === null) return;
          const min = MM.meta.parseDuration(v);
          if (min === undefined) alert(MM.tr('Could not read "{v}".', { v }));
          else setMeta(n, 'estimate', min);
        },
      }, { label: 'Clear', disabled: m.estimate === null || m.estimate === undefined, action: set(null) }]);
    } else if (key === 'repeat') {
      MM.panel.focusField('repeat'); // the rule has several fields: edit it in the panel
      return;
    } else if (key === 'progress' && MM.tasks.info(n)) {
      // calculated from the sub-tasks: nothing to set here
      const calc = MM.tasks.info(n);
      M.open([{ label: MM.tr('{p} % – calculated from {n} sub-task(s)', { p: calc.progress, n: calc.count }), disabled: true }],
        rect.left, rect.bottom + 4);
      return;
    } else if (key === 'progress') {
      list = [0, 10, 25, 50, 75, 90, 100].map((p) => ({
        label: p + ' %', checked: m.progress === p, action: set(p),
      })).concat(['-', { label: 'Clear', disabled: !MM.meta.hasProgress(m), action: set(null) }]);
    } else {
      return;
    }
    list.push('-', { label: 'More in panel…', action: () => MM.panel.focusField(key) });
    M.open(list, rect.left, rect.bottom + 4);
  };

  // ---- Menus for canvas / notes / connections ----------------------------

  /** Build and open the right menu for a right-click on the canvas. */
  M.openFor = function (e) {
    const A = MM.actions;
    const t = e.target;
    const p = MM.interaction.toWorld(e.clientX, e.clientY);
    const nodeEl = t.closest('.node');
    const edgeEl = t.closest('.edge') || t.closest('.edge-label');
    let list;

    if (nodeEl) {
      const id = nodeEl.dataset.id;
      if (!S.selection.has(id)) MM.select([id]);
      MM.refresh();
      const nodes = MM.selectedNodes();
      const multi = nodes.length > 1;
      const one = multi ? null : nodes[0];
      const images = nodes.filter((n) => n.type === 'image');
      const hasImage = images.length > 0;
      const fileNotes = nodes.filter((n) => n.type === 'file');
      const hasFile = fileNotes.length > 0;
      const allMoved = nodes.length > 0 && nodes.every((n) => n.movedTo);
      const anchor = { left: e.clientX, top: e.clientY, bottom: e.clientY };
      list = [
        !multi && one.link && { label: 'Open link ↗', shortcut: 'Ctrl+click', action: A.openLink },
        !multi && { label: hasImage ? 'Edit caption' : 'Edit text', shortcut: 'Enter', action: A.editSelected },
        !multi && !one.overlay && { label: 'Add connected note', submenu: MM.insertItems((ty) => A.addChild(ty)) },
        // ---- emoji / symbols (F9) ----
        {
          label: 'Emoji…',
          shortcut: 'Ctrl+.',
          action: () => MM.emoji.pick({ target: one, at: p, mode: multi ? 'note' : 'text', anchorRect: anchor }),
        },
        // ---- attached files (F3) ----
        hasFile && !multi && { label: 'Open file ↗', action: A.openFile },
        hasFile && !multi && { label: 'Replace file…', action: A.replaceFile },
        hasFile && !multi && { label: 'Show file path', action: A.revealFile },
        // ---- derived map (F5) ----
        !multi && one.derivedMap && { label: 'Open derived map ↗', action: () => A.openDerivedMap(one) },
        !multi && !one.derivedMap && { label: 'Create map from note…', action: A.deriveMapFromSelection },
        nodes.some(MM.canRotate) && { label: 'Rotate', submenu: [
          { label: 'Rotate right (90°)', action: () => A.rotateImages(90) },
          { label: 'Rotate left (90°)', action: () => A.rotateImages(-90) },
          { label: 'Straighten', disabled: !nodes.some((n) => MM.canRotate(n) && n.rotate), action: () => A.rotateImages(null) },
        ] },
        // a thought that grew: it and the notes below it become tasks (only tasks count as sub-tasks)
        A.subNotesToConvert(nodes).length > 0 && { label: 'Make tasks (with notes below)', action: A.makeTasksWithSubNotes },
        !hasImage && !hasFile && {
          label: 'Change type',
          submenu: MM.TEXT_TYPES.map((ty) => ({
            label: MM.NODE_TYPES[ty], checked: nodes.every((n) => n.type === ty), action: () => A.setType(ty),
          })),
        },
        {
          label: 'Status',
          submenu: Object.entries(MM.STATUSES).map(([st, s]) => ({
            label: s.label, checked: nodes.every((n) => (n.meta.status || 'none') === st), action: () => A.setStatus(st),
          })),
        },
        hasImage && !multi && { label: 'Replace image…', action: A.replaceImage },
        hasImage && { label: 'Show as overlay', checked: images.every((n) => n.overlay), action: A.toggleOverlay },
        // ---- views / auto-layout of the subtree below this note ----
        '-',
        !multi && {
          label: 'Show as',
          submenu: Object.entries(MM.views.KINDS).map(([k, l]) => ({ label: l, action: () => MM.views.open(k, one.id) })),
        },
        !multi && {
          label: 'Auto-layout sub-notes',
          submenu: [
            { label: 'Tree →', action: () => MM.views.autoLayout('right', one.id) },
            { label: 'Tree ↓', action: () => MM.views.autoLayout('down', one.id) },
            { label: 'Radial', action: () => MM.views.autoLayout('radial', one.id) },
          ],
        },
        // ---- move to another map (F8) ----
        '-',
        {
          label: allMoved ? 'Move to map (already moved)' : 'Move to map',
          submenu: MM.transfer.quickTargets()
            .map((q) => ({
              label: q.label,
              action: () => MM.transfer.move(nodes.map((n) => n.id), q.path),
            }))
            .concat([{ label: 'Other map…', action: MM.transfer.moveSelection }]),
        },
        allMoved && { label: 'Undo move', action: () => MM.transfer.undoMove(nodes[0]) },
        allMoved && nodes[0].movedTo && {
          label: MM.tr('Open {target}', { target: MM.transfer.targetLabel(nodes[0]) }),
          action: () => MM.project.openMap(nodes[0].movedTo),
        },
        !allMoved && nodes.some((n) => n.movedTo) && { label: 'Undo move', action: () => MM.transfer.undoMove(nodes.find((n) => n.movedTo)) },
        '-',
        { label: 'Copy', shortcut: 'Ctrl+C', action: A.copy },
        { label: 'Cut', shortcut: 'Ctrl+X', action: A.cut },
        { label: 'Duplicate', shortcut: 'Ctrl+D', action: A.duplicate },
        '-',
        multi && {
          label: 'Align',
          submenu: [
            { label: 'Left', action: () => A.align('left') },
            { label: 'Center', action: () => A.align('hcenter') },
            { label: 'Right', action: () => A.align('right') },
            '-',
            { label: 'Top', action: () => A.align('top') },
            { label: 'Middle', action: () => A.align('vcenter') },
            { label: 'Bottom', action: () => A.align('bottom') },
            '-',
            { label: 'Distribute horizontally', disabled: nodes.length < 3, action: () => A.distribute('x') },
            { label: 'Distribute vertically', disabled: nodes.length < 3, action: () => A.distribute('y') },
          ],
        },
        { label: 'Bring to front', action: A.toFront },
        { label: 'Send to back', action: A.toBack },
        '-',
        { label: 'Delete', shortcut: 'Del', action: A.deleteSelection },
      ];
      // drawings only: their own short menu (anchor, clipboard, order, delete)
      if (nodes.every((n) => n.type === 'draw')) list = MM.draw.menuItems(nodes);
    } else if (edgeEl) {
      const id = edgeEl.dataset.id;
      if (!S.selection.has(id)) MM.select([id]);
      MM.refresh();
      const edges = MM.selectedEdges();
      list = [
        edges.length === 1 && { label: 'Edit label', shortcut: 'Enter', action: () => MM.edit.editLabel(id) },
        {
          label: 'Route',
          submenu: Object.entries(MM.ROUTES).map(([route, label]) => ({
            label, checked: edges.every((ed) => ed.style.route === route), action: () => A.setEdgeStyle('route', route),
          })),
        },
        {
          label: 'Line',
          submenu: Object.entries(MM.LINE_STYLES).map(([ls, label]) => ({
            label, checked: edges.every((ed) => ed.style.lineStyle === ls), action: () => A.setEdgeStyle('lineStyle', ls),
          })),
        },
        { label: 'Reverse direction', action: A.reverseEdges },
        '-',
        { label: 'Delete', shortcut: 'Del', action: A.deleteSelection },
      ];
    } else {
      list = [
        { label: 'Insert', submenu: MM.insertItems((type) => A.addNode(type, p), p) },
        { label: 'Paste', shortcut: 'Ctrl+V', disabled: !A.hasClipboard(), action: () => A.pasteAt(p) },
        '-',
        { label: 'Select all', shortcut: 'Ctrl+A', action: A.selectAll },
        { label: 'Fit to window', shortcut: 'Shift+1', action: A.fit },
        '-',
        { label: 'Views…', submenu: Object.entries(MM.views.KINDS).map(([k, l]) => ({ label: l, action: () => MM.views.open(k, null) })) },
        {
          label: 'Auto-layout whole map',
          submenu: [
            { label: 'Tree →', action: () => MM.views.autoLayout('right', null) },
            { label: 'Tree ↓', action: () => MM.views.autoLayout('down', null) },
            { label: 'Radial', action: () => MM.views.autoLayout('radial', null) },
          ],
        },
        '-',
        { label: 'Show details', checked: S.settings.showMeta, action: A.toggleMeta },
        { label: 'Filter…', checked: S.filter.open, action: A.toggleFilter },
        '-',
        { label: 'Smart guides', checked: S.settings.smartGuides, action: A.toggleGuides },
        { label: 'Snap to grid', checked: S.settings.grid, action: A.toggleGrid },
      ];
    }
    M.open(list, e.clientX, e.clientY);
  };
})(window.MM);
