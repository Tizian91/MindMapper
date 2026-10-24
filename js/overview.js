'use strict';
/*
 * Overview: tasks of all maps in the project folder in one list.
 *
 * Two views:
 *   - "By deadline": grouped by deadline (overdue, today, tomorrow, this week, later, none)
 *   - "By task":     main tasks with their sub-tasks as a collapsible tree
 *
 * A note counts as a task if it is a task note or has a status, priority or
 * deadline. To-do notes count while they have open entries – and only if they
 * are more than a check list (estimate, deadline, appointment or priority, see
 * MM.meta.isTaskTodo).
 *
 * Hierarchy (computed on every open, nothing is stored in the maps):
 *   - an arrow from task A to task B makes B a sub-task of A
 *   - the tasks of a map derived from task A (A.derivedMap) that have no main
 *     task in that map become sub-tasks of A
 * A task with sub-tasks shows the average progress of its sub-tasks.
 *
 * Clicking a row opens the map and selects the note.
 */
(function (MM) {
  const S = MM.state;
  const O = (MM.overview = {});
  const esc = (s) => MM.render.esc(s);
  const tr = (s, v) => MM.tr(s, v);
  let dialog, items = [], links = [], byKey = new Map();
  const view = { text: '', hideDone: true, status: 'any', priority: 'any', type: 'any', mode: 'deadline' };
  const collapsed = new Set(); // keys of collapsed tasks in the tree view

  const BUCKETS = [
    ['overdue', 'Overdue'], ['today', 'Today'], ['tomorrow', 'Tomorrow'],
    ['week', 'Next 7 days'], ['later', 'Later'], ['none', 'No deadline'],
  ];

  const keyOf = (it) => it.path + '#' + it.id;

  function bucket(deadline) {
    const d = MM.meta.daysUntil(deadline);
    if (d === null) return 'none';
    if (d < 0) return 'overdue';
    if (d === 0) return 'today';
    if (d === 1) return 'tomorrow';
    if (d <= 7) return 'week';
    return 'later';
  }

  /** Task-like entries of one map, plus the task -> sub-task connections in it. */
  function collect(doc, path) {
    const out = [];
    for (const n of Object.values(doc.nodes || {})) {
      const m = Object.assign(MM.emptyMeta(), n.meta || {});
      let status = m.status, detail = '';
      if (n.movedTo) continue; // carried over into another map, listed there
      if (n.repeat) continue;  // routine definition: listed on the workload page
      if (n.type === 'diary') continue; // diary entries live in their diary
      if (n.type === 'todo') {
        if (!MM.meta.isTaskTodo(n)) continue; // a plain check list, not a task
        const filled = (n.items || []).filter((i) => i.text.trim() && !i.moved);
        if (!filled.length) continue; // empty list (e.g. an unused day of a week plan)
        const open = filled.filter((i) => !i.done);
        detail = open.slice(0, 3).map((i) => i.text).join(' · ') + (open.length > 3 ? ` · +${open.length - 3}` : '');
        if (status === 'none') status = open.length ? 'open' : 'done';
        detail = tr('{d}/{n} done', { d: filled.length - open.length, n: filled.length }) + (detail ? ' — ' + detail : '');
      } else if (!(n.type === 'task' || m.status !== 'none' || MM.prioOf(m) !== 'none' || m.deadline || m.scheduled)) {
        continue;
      }
      if (n.type === 'task' && status === 'none') status = 'open';
      out.push({
        path, id: n.id, title: (n.text || '').split('\n')[0] || tr('(untitled)'), type: n.type, meta: m,
        status, detail, tags: n.tags || [],
        progress: m.progress === null || m.progress === undefined ? null : m.progress,
        derived: n.derivedMap || '',
      });
    }
    // arrows between tasks: source = main task, target = sub-task
    const isTask = (id) => doc.nodes[id] && doc.nodes[id].type === 'task' && !doc.nodes[id].movedTo;
    const conn = [];
    for (const e of Object.values(doc.edges || {})) {
      const a = e.source && e.source.node, b = e.target && e.target.node;
      if (a && b && a !== b && isTask(a) && isTask(b)) conn.push([path + '#' + a, path + '#' + b]);
    }
    return { items: out, links: conn };
  }

  /** Parent / children of every item and the progress of main tasks. */
  function buildTree() {
    byKey = new Map(items.map((it) => [keyOf(it), it]));
    for (const it of items) {
      it.parent = null;
      it.children = [];
    }
    // never create a cycle (A -> B -> A): the parent must not already hang below the child
    const below = (key, ancestor) => {
      for (let k = key; k; k = byKey.get(k).parent) if (k === ancestor) return true;
      return false;
    };
    const attach = (pKey, cKey) => {
      const p = byKey.get(pKey), c = byKey.get(cKey);
      if (!p || !c || c.parent || below(pKey, cKey)) return; // first main task wins
      c.parent = pKey;
      p.children.push(cKey);
    };
    for (const [a, b] of links) attach(a, b);
    // a derived map hangs below the task it came from: its top level tasks become sub-tasks
    for (const it of items) {
      if (it.type !== 'task' || !it.derived || it.derived === it.path) continue;
      for (const sub of items) {
        if (sub.path === it.derived && sub.type === 'task' && !sub.parent) attach(keyOf(it), keyOf(sub));
      }
    }

    // main task: estimate = total, sub-tasks split it up, progress weighted by effort (MM.tasks.combine)
    const memo = new Map();
    const effective = (key) => {
      if (memo.has(key)) return memo.get(key);
      const it = byKey.get(key);
      const own = Number(it.meta.estimate) || 0;
      let v;
      if (it.children.length) {
        const c = MM.tasks.combine(it.children.map(effective), own, it.status === 'done');
        Object.assign(it, { split: c.split, rest: c.rest, over: c.over });
        v = { p: c.progress, w: c.effort };
      } else {
        v = { p: it.status === 'done' ? 100 : it.progress || 0, w: own };
      }
      memo.set(key, v);
      return v;
    };
    for (const it of items) {
      const v = effective(keyOf(it));
      it.shownProgress = it.children.length ? Math.round(v.p) : it.progress;
      // own share of the time: a main task only adds what its sub-tasks do not cover
      it.minutes = it.children.length ? it.rest || 0 : Number(it.meta.estimate) || 0;
    }
  }

  /** Open the overview; mode: 'deadline' | 'tree' | 'load' (default: the last one). */
  O.open = async function (mode) {
    if (typeof mode === 'string') view.mode = mode;
    if (MM.project.status !== 'ready') {
      alert(tr('The overview collects tasks from all maps of a project folder.\nOpen a folder in the "Project" sidebar first.'));
      return;
    }
    if (!dialog) build();
    dialog.querySelector('.ov-list').innerHTML = `<p class="hint">${tr('Reading maps…')}</p>`;
    dialog.showModal();
    applyRect();
    await MM.project.scan();
    items = [];
    links = [];
    for (const path of MM.project.mapPaths()) {
      const doc = await MM.project.readMap(path);
      if (!doc) continue;
      const r = collect(doc, path);
      items.push(...r.items);
      links.push(...r.links);
    }
    buildTree();
    await MM.load.refresh(); // workload page uses the same, fresh state of all maps
    render();
  };

  /** Language change: the dialog is built again (in the new language) the next time it opens. */
  O.rebuild = function () {
    if (!dialog) return;
    const wasOpen = dialog.open;
    dialog.remove();
    dialog = null;
    if (wasOpen) O.open();
  };

  // ---- Moving and resizing the window ------------------------------------------
  // Drag the head to move, the corner / edges to resize. Position and size are
  // kept in the settings (overviewRect); a double click on the head resets them.

  const MIN_W = 520, MIN_H = 300;

  /** Keep a rect inside the browser window (at least the head stays reachable). */
  function clampRect(r) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.max(MIN_W, Math.min(r.w, vw - 8));
    const h = Math.max(MIN_H, Math.min(r.h, vh - 8));
    const x = Math.max(4, Math.min(r.x, vw - w - 4));
    const y = Math.max(4, Math.min(r.y, vh - h - 4));
    return { x, y, w, h };
  }

  function setRect(r) {
    Object.assign(dialog.style, { margin: '0', left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  }

  /** Saved position / size, or the centered default. */
  function applyRect() {
    const saved = S.settings.overviewRect;
    if (saved && isFinite(saved.x) && isFinite(saved.w)) {
      setRect(clampRect(saved));
    } else {
      for (const k of ['margin', 'left', 'top', 'width', 'height']) dialog.style[k] = '';
    }
  }

  function currentRect() {
    const b = dialog.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  }

  function saveRect(r) {
    S.settings.overviewRect = r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) } : null;
    MM.saveSettings();
  }

  function initMoveResize() {
    const head = dialog.querySelector('.ov-head');
    let drag = null;
    const start = (e, mode) => {
      if (e.button !== 0) return;
      e.preventDefault();
      drag = { mode, x0: e.clientX, y0: e.clientY, r0: currentRect(), el: e.currentTarget };
      e.currentTarget.setPointerCapture(e.pointerId);
      dialog.classList.add('ov-dragging');
    };
    const move = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0, r = Object.assign({}, drag.r0);
      if (drag.mode === 'move') {
        r.x += dx;
        r.y += dy;
      } else {
        if (drag.mode.includes('e')) r.w += dx;
        if (drag.mode.includes('s')) r.h += dy;
        if (drag.mode.includes('w')) {
          const w = Math.max(MIN_W, r.w - dx);
          r.x += r.w - w;
          r.w = w;
        }
      }
      setRect(clampRect(r));
    };
    const stop = (e) => {
      if (!drag) return;
      try { drag.el.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
      drag = null;
      dialog.classList.remove('ov-dragging');
      saveRect(currentRect());
    };
    // move: the head, but not its controls
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('input, select, button, label, textarea')) return;
      start(e, 'move');
    });
    head.addEventListener('dblclick', (e) => {
      if (e.target.closest('input, select, button, label, textarea')) return;
      saveRect(null);
      applyRect();
    });
    for (const h of dialog.querySelectorAll('.ov-resize')) {
      h.addEventListener('pointerdown', (e) => start(e, h.dataset.dir));
      h.addEventListener('dblclick', () => { saveRect(null); applyRect(); });
    }
    for (const el of [head, ...dialog.querySelectorAll('.ov-resize')]) {
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', stop);
      el.addEventListener('pointercancel', stop);
    }
    window.addEventListener('resize', () => {
      if (dialog && dialog.open && S.settings.overviewRect) setRect(clampRect(currentRect()));
    });
  }

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'overview-dialog';
    dialog.innerHTML = `
      <div class="ov-resize ov-resize-e" data-dir="e"></div>
      <div class="ov-resize ov-resize-w" data-dir="w"></div>
      <div class="ov-resize ov-resize-s" data-dir="s"></div>
      <div class="ov-resize ov-resize-se" data-dir="se" title="${esc(tr('Drag to resize – double click: default size'))}"></div>
      <div class="ov-resize ov-resize-sw" data-dir="sw"></div>
      <div class="ov">
        <div class="ov-head" title="${esc(tr('Drag to move – double click: default position and size'))}">
          <h3>${tr('Overview')} <span class="muted ov-folder"></span></h3>
          <span class="seg seg-mini ov-mode">
            <button data-ov-mode="deadline" title="${esc(tr('Grouped by deadline'))}">${tr('By deadline')}</button>
            <button data-ov-mode="tree" title="${esc(tr('Main tasks with their sub-tasks'))}">${tr('By task')}</button>
            <button data-ov-mode="load" title="${esc(tr('Planned hours per day / week and the buffer until each deadline'))}">${tr('Workload')}</button>
            ${MM.prioKey() === 'quadrant' ? `<button data-ov-mode="matrix" title="${esc(tr('Eisenhower matrix – drag tasks into a quadrant to classify them'))}">${tr('Matrix')}</button>` : ''}
          </span>
          <input type="search" class="ov-search" placeholder="${esc(tr('Search tasks…'))}">
          <select class="ov-type"></select>
          <select class="ov-status"></select>
          <select class="ov-prio"></select>
          <label class="check"><input type="checkbox" class="ov-hide"${view.hideDone ? ' checked' : ''}> ${tr('Hide done')}</label>
          <button class="ov-close" title="${esc(tr('Close (Esc)'))}">✕</button>
        </div>
        <div class="ov-list"></div>
      </div>`;
    document.body.appendChild(dialog);
    initMoveResize();
    const st = dialog.querySelector('.ov-status'), pr = dialog.querySelector('.ov-prio');
    const ty = dialog.querySelector('.ov-type');
    ty.innerHTML = `<option value="any">${tr('Any type')}</option>`;
    st.innerHTML = `<option value="any">${tr('Any status')}</option>` +
      Object.entries(MM.STATUSES).filter(([k]) => k !== 'none').map(([k, v]) => `<option value="${k}">${esc(tr(v.label))}</option>`).join('');
    pr.innerHTML = `<option value="any">${tr('Any priority')}</option>` +
      Object.keys(MM.prioCatalog()).filter((k) => k !== 'none').map((k) => `<option value="${k}">${esc(MM.prioLabel(k))}</option>`).join('');
    if (!MM.prioCatalog()[view.priority]) view.priority = 'any'; // value of the other system
    if (view.mode === 'matrix' && MM.prioKey() !== 'quadrant') view.mode = 'deadline';
    st.value = view.status;
    pr.value = view.priority;
    dialog.querySelector('.ov-search').value = view.text;
    dialog.addEventListener('keydown', (e) => {
      e.stopPropagation();
      // matrix: Ctrl+Z takes back the last classification (it may live in another map)
      if (view.mode === 'matrix' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.target.closest('input')) {
        e.preventDefault();
        undoQuadrant();
      }
    });
    dialog.querySelector('.ov-close').addEventListener('click', () => dialog.close());
    dialog.querySelector('.ov-mode').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ov-mode]');
      if (b) { view.mode = b.dataset.ovMode; render(); }
    });
    dialog.querySelector('.ov-search').addEventListener('input', (e) => { view.text = e.target.value; render(); });
    dialog.querySelector('.ov-hide').addEventListener('change', (e) => { view.hideDone = e.target.checked; render(); });
    ty.addEventListener('change', () => { view.type = ty.value; render(); });
    st.addEventListener('change', () => { view.status = st.value; render(); });
    pr.addEventListener('change', () => { view.priority = pr.value; render(); });
    initMatrixDrag();
    dialog.querySelector('.ov-list').addEventListener('click', async (e) => {
      if (e.target.closest('[data-mx-undo]')) {
        undoQuadrant();
        return;
      }
      // own classification of a sub-task: small 2x2 picker at its icon
      const choice = e.target.closest('[data-mx-set]');
      if (choice) {
        const it = byKey.get(choice.closest('.mx-picker').dataset.key);
        closePicker();
        if (it) setQuadrant(it, choice.dataset.mxSet, true);
        return;
      }
      const pick = e.target.closest('[data-mx-pick]');
      if (pick) {
        e.stopPropagation();
        openPicker(pick);
        return;
      }
      if (closePicker()) return; // a click next to the picker only closes it
      // caret in the tree view: fold / unfold the sub-tasks
      const caret = e.target.closest('[data-ov-toggle]');
      if (caret) {
        e.stopPropagation();
        const k = caret.dataset.ovToggle;
        if (collapsed.has(k)) collapsed.delete(k);
        else collapsed.add(k);
        render();
        return;
      }
      // the map badge of a derived task opens that map instead of the source note
      const badge = e.target.closest('[data-map]');
      if (badge) {
        e.stopPropagation();
        if (badge.classList.contains('disabled')) return;
        dialog.close();
        await MM.project.openMap(badge.dataset.map);
        return;
      }
      const row = e.target.closest('[data-path]');
      if (!row) return;
      dialog.close();
      if (await MM.project.openMap(row.dataset.path)) MM.actions.focusNode(row.dataset.id);
    });
  }

  // date of an entry: its deadline or its appointment (with time for sorting)
  const dateOf = (it) => it.meta.deadline || it.meta.scheduled || '';
  const sortKey = (it, empty) => (dateOf(it) ? dateOf(it) + ' ' + (it.meta.scheduledTime || '99:99') : empty);
  const byDeadline = (a, b) => sortKey(a, '').localeCompare(sortKey(b, '')) ||
    MM.prioRank(a.meta) - MM.prioRank(b.meta);
  // in the tree, notes without a deadline come last
  const byDeadlineLast = (a, b) => sortKey(a, '9999').localeCompare(sortKey(b, '9999')) ||
    MM.prioRank(a.meta) - MM.prioRank(b.meta);

  /**
   * One row. opts.depth / opts.caret ('open' | 'closed' | 'leaf') are used by
   * the tree view, opts.context marks a row only shown because of a sub-task.
   */
  function rowHTML(it, opts) {
    const o = opts || {};
    const s = MM.STATUSES[it.status] || MM.STATUSES.none;
    // status and progress have their own columns
    const chips = MM.meta.chipsHTML({ meta: Object.assign({}, it.meta, { status: 'none', progress: null }), tags: it.tags }, false);
    // both cells are always rendered so every row keeps the same columns
    const sub = it.children.length;
    const prog = it.shownProgress !== null && it.shownProgress !== undefined
      ? `<span class="ov-progress"${sub ? ` title="${esc(tr('Average of {n} sub-task(s)', { n: sub }))}"` : ''}>` +
        `${MM.meta.progressBar(it.shownProgress)}<b>${MM.meta.progressLabel(it.shownProgress)}${sub ? ' ∑' : ''}</b></span>`
      : '<span class="ov-progress"></span>';
    // a derived map can be opened from the row; tasks show a disabled
    // button as a hint that they could have one
    // (greyed out when that map was deleted or renamed outside the app)
    const mapBadge = it.derived
      ? MM.project.find(it.derived)
        ? `<span class="ov-derived-cell"><button class="ov-derived" data-map="${esc(it.derived)}" title="${esc(tr('Open the map derived from this note ({map})', { map: it.derived }))}">${tr('↗ map')}</button></span>`
        : `<span class="ov-derived-cell"><button class="ov-derived disabled" data-map="${esc(it.derived)}" title="${esc(tr('Map not found: {map}', { map: it.derived }))}">${tr('↗ map')}</button></span>`
      : it.type === 'task'
        ? `<span class="ov-derived-cell"><button class="ov-derived disabled" disabled title="${esc(tr('No map derived from this task yet'))}">${tr('↗ map')}</button></span>`
        : '<span class="ov-derived-cell"></span>';
    // the deadline view names the main task, the tree shows it by indentation
    const parent = it.parent && byKey.get(it.parent);
    const e = MM.meta.formatDuration, own = Number(it.meta.estimate) || 0;
    const splitText = !sub || !(own || it.split) ? ''
      : !own ? tr('sub-tasks {a}', { a: e(it.split) })
        : it.over ? tr('sub-tasks {a} > {b} estimated', { a: e(it.split), b: e(own) })
          : tr('{a} of {b} split up', { a: e(it.split), b: e(own) });
    const detail = [
      it.detail,
      o.depth === undefined && parent ? '↳ ' + parent.title : '',
      o.depth === undefined && sub ? tr('{n} sub-task(s)', { n: sub }) : '',
      splitText,
    ].filter(Boolean).join(' · ');
    const caret = o.caret === undefined ? ''
      : o.caret === 'leaf' ? '<span class="ov-caret"></span>'
        : `<button class="ov-caret${o.caret === 'closed' ? ' closed' : ''}" data-ov-toggle="${esc(keyOf(it))}" title="${esc(tr('Show / hide sub-tasks'))}">▾</button>`;
    const indent = o.depth ? ` style="padding-left:${o.depth * 22}px"` : '';
    return `<div class="ov-row${it.status === 'done' ? ' done' : ''}${o.context ? ' ov-context' : ''}" data-path="${esc(it.path)}" data-id="${esc(it.id)}">
      <span class="status-ico" style="--c:${s.color}" title="${esc(tr(s.label))}">${MM.meta.icon(it.status)}</span>
      <span class="ov-title"${indent}>${caret}<span class="ov-title-text">${esc(it.title)}${detail ? `<span class="ov-detail">${esc(detail)}</span>` : ''}</span></span>
      ${prog}
      <span class="ov-chips">${chips}</span>
      ${mapBadge}
      <span class="ov-map" title="${esc(it.path)}">${esc(MM.links.label(it.path))}</span>
    </div>`;
  }

  function render() {
    dialog.querySelector('.ov-folder').textContent = MM.project.backend ? '· ' + MM.project.backend.name : '';
    dialog.querySelectorAll('[data-ov-mode]').forEach((b) => b.classList.toggle('active', b.dataset.ovMode === view.mode));
    // type filter is built from what is actually there
    const typeSel = dialog.querySelector('.ov-type');
    const types = Array.from(new Set(items.map((it) => it.type))).sort();
    const current = types.includes(view.type) || view.type === 'any' ? view.type : 'any';
    if (typeSel.dataset.types !== types.join(',')) {
      typeSel.dataset.types = types.join(',');
      typeSel.innerHTML = `<option value="any">${tr('Any type')}</option>` +
        types.map((t) => `<option value="${esc(t)}">${esc(tr(MM.NODE_TYPES[t] || t))}</option>`).join('');
    }
    typeSel.value = current;

    const text = view.text.trim().toLowerCase();
    const matches = (it) =>
      !(view.hideDone && it.status === 'done') &&
      (current === 'any' || it.type === current) &&
      (view.status === 'any' || it.status === view.status) &&
      (view.priority === 'any' || view.mode === 'matrix' || MM.prioOf(it.meta) === view.priority) &&
      (!text || (it.title + ' ' + it.detail + ' ' + it.tags.join(' ') + ' ' + it.path).toLowerCase().includes(text));

    // the filters of the head do not apply to the workload page
    dialog.querySelectorAll('.ov-search, .ov-type, .ov-status, .ov-prio, .ov-hide').forEach((el) => {
      (el.closest('label') || el).hidden = view.mode === 'load' || (view.mode === 'matrix' && el.classList.contains('ov-prio'));
    });
    if (view.mode === 'load') {
      dialog.querySelector('.ov-list').innerHTML = MM.load.overviewHTML();
      return;
    }
    if (view.mode === 'matrix') {
      dialog.querySelector('.ov-list').innerHTML = renderMatrix(items.filter(matches));
      return;
    }
    const h = view.mode === 'tree' ? renderTree(matches) : renderBuckets(items.filter(matches));
    dialog.querySelector('.ov-list').innerHTML = h ||
      `<p class="hint">${items.length ? tr('Nothing matches.') : tr('No tasks yet. Give notes a status, priority or deadline – or use task / to-do notes.')}</p>`;
  }

  /**
   * " · Ø 45 %" for a group head: plain average of the rows that show a progress
   * (a main task counts once, with its calculated value). Empty if none has one.
   */
  function avgProgress(list) {
    const vals = list.map((it) => it.shownProgress).filter((p) => p !== null && p !== undefined && !isNaN(p));
    if (!vals.length) return '';
    const avg = Math.round(vals.reduce((s, p) => s + p, 0) / vals.length);
    return `<span title="${esc(tr('Average progress of {n} task(s)', { n: vals.length }))}"> · Ø ${avg} %</span>`;
  }

  function renderBuckets(shown) {
    let h = '';
    for (const [key, label] of BUCKETS) {
      const list = shown.filter((it) => bucket(dateOf(it)) === key).sort(byDeadline);
      if (!list.length) continue;
      // no double counting: main tasks only add their part not split up into sub-tasks
      const total = list.reduce((s, it) => s + (it.minutes || 0), 0);
      h += `<div class="ov-group ov-${key}"><div class="ov-group-head">${tr(label)}<span class="muted">${list.length}` +
        (total ? ` · ${MM.meta.formatDuration(total)}` : '') + avgProgress(list) + '</span></div>';
      for (const it of list) h += rowHTML(it);
      h += '</div>';
    }
    return h;
  }

  /** Tree of main tasks. A row that does not match stays (faded) when one of its sub-tasks does. */
  function renderTree(matches) {
    const visible = new Set();
    for (const it of items) {
      if (!matches(it)) continue;
      for (let k = keyOf(it); k && !visible.has(k); k = byKey.get(k).parent) visible.add(k);
    }
    const kids = (it) => it.children.map((k) => byKey.get(k)).filter((c) => visible.has(keyOf(c))).sort(byDeadlineLast);
    let h = '';
    const walk = (it, depth) => {
      const list = kids(it);
      const key = keyOf(it);
      const closed = collapsed.has(key);
      h += rowHTML(it, { depth, caret: list.length ? (closed ? 'closed' : 'open') : 'leaf', context: !matches(it) });
      if (!closed) for (const c of list) walk(c, depth + 1);
    };
    const roots = items.filter((it) => !it.parent && visible.has(keyOf(it))).sort(byDeadlineLast);
    // main tasks (with sub-tasks) first, then everything else
    const main = roots.filter((it) => kids(it).length), rest = roots.filter((it) => !kids(it).length);
    if (main.length) {
      h += `<div class="ov-group"><div class="ov-group-head">${tr('Main tasks')}<span class="muted">${main.length}${avgProgress(main)}</span></div>`;
      for (const it of main) walk(it, 0);
      h += '</div>';
    }
    if (rest.length) {
      h += `<div class="ov-group"><div class="ov-group-head">${tr('Other')}<span class="muted">${rest.length}${avgProgress(rest)}</span></div>`;
      for (const it of rest) walk(it, 0);
      h += '</div>';
    }
    return h;
  }

  // ---- Eisenhower matrix -----------------------------------------------------------
  // Tasks as circles in the four quadrants (they flow like words, so they never overlap):
  //   area of the circle = estimate, inner circle = progress (also by area),
  //   orange ring = deadline within 3 days, red ring = overdue,
  //   "!" = the buffer until its deadline is negative (red) or below 10 % (orange).
  // Dragging a circle into a quadrant (or back to "not classified") sets meta.quadrant
  // in its map. Ctrl+Z or the undo button in the matrix takes the last one back.
  //
  // Sub-tasks are judged in the context of their main task: they stay with the top
  // main task in its quadrant (one framed group per main task, deeper levels flat),
  // their own classification is their color plus a small 2x2 icon. A click on the
  // icon picks it; dragging is only possible for the main task (moves the group).

  // row by row: [quadrant, label of the row]
  const QUADS = [['both', 'Important'], ['important', 'Important'], ['urgent', 'Not important'], ['neither', 'Not important']];
  const mxUndo = []; // { key, old } of the last classifications
  let dragKey = null;

  /** Diameter in px: grows with the square root, so the area matches the time. */
  const diameter = (min) => (min ? Math.min(120, Math.round(18 + 22 * Math.sqrt(min / 60))) : 18);

  /** Buffer until the deadline of an item ({ buffer, cap } or null). */
  function bufferOf(it, buffers) {
    const dl = it.meta.deadline;
    if (!dl || it.status === 'done') return null;
    const date = MM.meta.daysUntil(dl) < 0 ? MM.meta.todayStr() : dl;
    return buffers.find((b) => b.date === date) || null;
  }

  /** 2x2 icon with the own quadrant of a sub-task filled (top row = important, left column = urgent). */
  function miniHTML(it) {
    const quad = it.meta.quadrant || 'none';
    const cells = QUADS.map(([q], i) => `<rect x="${i % 2 ? 7 : 1}" y="${i < 2 ? 1 : 7}" width="6" height="6" rx="1"` +
      `${q === quad ? ` class="on" style="fill:${MM.QUADRANTS[q].color}"` : ''}/>`).join('');
    return `<button class="mx-mini" data-mx-pick="${esc(keyOf(it))}" draggable="false"` +
      ` title="${esc(tr('Own classification within the main task: {q} – click to change', { q: MM.t('quad_' + quad) }))}">` +
      `<svg viewBox="0 0 14 14">${cells}</svg></button>`;
  }

  function bubbleHTML(it, buffers, sub) {
    const est = Number(it.meta.estimate) || it.split || 0;
    const d = diameter(est), r = d / 2 - 2, c = d / 2;
    const quad = it.meta.quadrant || 'none';
    const color = MM.QUADRANTS[quad].color;
    const p = Math.max(0, Math.min(100, it.status === 'done' ? 100 : it.shownProgress || 0));
    const due = it.status === 'done' ? null : MM.meta.deadlineStatus(it.meta.deadline);
    const ring = due === 'overdue' ? ' overdue' : due === 'today' || due === 'soon' ? ' soon' : '';
    const buf = bufferOf(it, buffers);
    const warn = !buf ? '' : buf.buffer < 0 ? 'bad' : buf.buffer < buf.cap * 0.1 ? 'tight' : '';
    // not classified yet: the old priority level as a reminder, not as a decision
    const old = quad === 'none' && it.meta.priority !== 'none' ? MM.PRIORITIES[it.meta.priority] : null;
    const e = MM.meta.formatDuration;
    const tip = [
      it.title,
      est ? tr('Estimate') + ': ' + e(est) : tr('No estimate'),
      tr('Progress') + ': ' + Math.round(p) + ' %',
      it.meta.deadline ? tr('Deadline {d}', { d: MM.meta.formatDate(it.meta.deadline) }) : '',
      buf ? tr('Buffer until then: {b}', { b: (buf.buffer < 0 ? '−' : '+') + MM.load.hours(Math.abs(buf.buffer)) }) : '',
      old ? tr('Priority') + ': ' + MM.t('prio_' + it.meta.priority, old.label) : '',
      MM.links.label(it.path),
    ].filter(Boolean).join('\n');
    // sub-tasks are not dragged: their place follows the main task
    return `<div class="mx-b${ring}${est ? '' : ' no-est'}${it.status === 'done' ? ' done' : ''}${sub ? ' mx-sub' : ''}"` +
      ` draggable="${sub ? 'false' : 'true'}"` +
      ` data-path="${esc(it.path)}" data-id="${esc(it.id)}" style="--c:${color}" title="${esc(tip)}">` +
      `<span class="mx-dot-wrap" style="width:${d}px;height:${d}px"><svg width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">` +
      `<circle class="mx-out" cx="${c}" cy="${c}" r="${r}"/>` +
      (p ? `<circle class="mx-in" cx="${c}" cy="${c}" r="${(r * Math.sqrt(p / 100)).toFixed(1)}"/>` : '') +
      '</svg>' +
      (warn ? `<span class="mx-warn ${warn}">!</span>` : '') +
      (old && !sub ? `<span class="mx-old" style="--c:${old.color}"></span>` : '') +
      (sub ? miniHTML(it) : '') +
      `</span><span class="mx-label" style="max-width:${Math.max(d, 84)}px">${esc(it.title)}</span></div>`;
  }

  const estOf = (it) => Number(it.meta.estimate) || it.split || 0;

  /** Top main task of an item (the item itself if it has none). */
  const rootOf = (it) => {
    let r = it;
    while (r.parent && byKey.get(r.parent)) r = byKey.get(r.parent);
    return r;
  };

  /** One main task with its (shown) sub-tasks in a frame; the main task can be dragged. */
  function groupHTML(root, subs, buffers) {
    const e = MM.meta.formatDuration, own = Number(root.meta.estimate) || 0;
    const info = [
      own ? e(own) : root.split ? e(root.split) : '',
      tr('{n} sub-task(s)', { n: subs.length }),
      own && root.split ? (root.over ? tr('sub-tasks {a} > {b} estimated', { a: e(root.split), b: e(own) })
        : tr('{a} of {b} split up', { a: e(root.split), b: e(own) })) : '',
    ].filter(Boolean).join(' · ');
    // compare the sub-tasks: own classification first, then the bigger ones
    const sorted = subs.slice().sort((a, b) => MM.prioRank(a.meta) - MM.prioRank(b.meta) || estOf(b) - estOf(a));
    return `<div class="mx-grp"><div class="mx-grp-head"><b>${esc(root.title)}</b><span class="muted">${esc(info)}</span></div>` +
      `<div class="mx-grp-body">${bubbleHTML(root, buffers, false)}<span class="mx-grp-sep"></span>` +
      sorted.map((it) => bubbleHTML(it, buffers, true)).join('') + '</div></div>';
  }

  /** Items of one quadrant: main tasks with sub-tasks as groups, the rest as single circles. */
  function zoneHTML(list, buffers) {
    const roots = [], subsOf = new Map();
    for (const it of list) {
      const r = rootOf(it);
      if (!subsOf.has(r)) {
        subsOf.set(r, []);
        roots.push(r);
      }
      if (r !== it) subsOf.get(r).push(it);
    }
    // biggest first: bloated tasks catch the eye; groups before single circles
    roots.sort((a, b) => (subsOf.get(b).length > 0) - (subsOf.get(a).length > 0) || estOf(b) - estOf(a) || byDeadlineLast(a, b));
    return roots.map((r) => (subsOf.get(r).length ? groupHTML(r, subsOf.get(r), buffers) : bubbleHTML(r, buffers, false))).join('');
  }

  function renderMatrix(shown) {
    const buffers = MM.load.summary().buffers;
    // a sub-task stands where its top main task stands
    const of = (q) => shown.filter((it) => (rootOf(it).meta.quadrant || 'none') === q);
    // no double counting: main tasks only add their part not split up into sub-tasks
    const total = (list) => list.reduce((s, it) => s + (it.minutes || 0), 0);
    const head = (q, list, sub) => `<div class="mx-q-head"><b>${esc(MM.t('quad_' + q, MM.QUADRANTS[q].label))}</b>` +
      (sub ? `<span class="muted">${esc(sub)}</span>` : '') +
      `<span class="mx-sum">${list.length}${total(list) ? ' · ' + MM.meta.formatDuration(total(list)) : ''}</span></div>`;
    let h = `<div class="mx-bar"><span class="hint">${esc(tr('Circle area = estimate, inner circle = progress. Orange / red ring: deadline soon / overdue. "!" = buffer too small. Drag a circle into a quadrant to classify it.'))}</span>` +
      (mxUndo.length ? `<button data-mx-undo title="${esc(tr('Undo the last classification (Ctrl+Z)'))}">↶ ${tr('Undo')}</button>` : '') + '</div>';
    h += `<div class="mx"><span></span><span class="mx-axis">${tr('Urgent')}</span><span class="mx-axis">${tr('Not urgent')}</span>`;
    QUADS.forEach(([q, row], i) => {
      if (i % 2 === 0) h += `<span class="mx-axis mx-axis-y">${tr(row)}</span>`;
      const list = of(q);
      h += `<div class="mx-q mx-${q}" data-quad="${q}" style="--c:${MM.QUADRANTS[q].color}">${head(q, list)}` +
        `<div class="mx-zone">${zoneHTML(list, buffers)}</div></div>`;
    });
    h += '</div>';
    const rest = of('none');
    h += `<div class="mx-q mx-none" data-quad="none">${head('none', rest, rest.length ? tr('Old priority as a dot – drag into a quadrant') : '')}` +
      `<div class="mx-zone">${zoneHTML(rest, buffers) || `<span class="hint">${esc(tr('Everything is classified.'))}</span>`}</div></div>`;
    return h;
  }

  /** Set the quadrant of an item in its map (the open one in memory, others in their file). */
  async function setQuadrant(it, q, record) {
    const old = it.meta.quadrant || 'none';
    if (old === q) return;
    try {
      if (it.path === S.file.path) {
        const n = S.doc.nodes[it.id];
        if (!n) throw new Error(tr('note not found'));
        MM.meta.setValue([n], 'quadrant', q);
        MM.commit(); // part of the undo history of the open map as well
      } else {
        if (!(await MM.project.ensureWriteAccess())) throw new Error(tr('no write access to the project folder'));
        const doc = await MM.project.readMap(it.path);
        const n = doc && doc.nodes[it.id];
        if (!n) throw new Error(tr('note not found'));
        n.meta.quadrant = q;
        await MM.project.writeMap(it.path, doc);
        MM.load.scheduleRefresh();
      }
    } catch (err) {
      alert(tr('Could not save the classification: {err}', { err: (err && err.message) || err }));
      return;
    }
    it.meta.quadrant = q;
    if (record) mxUndo.push({ key: keyOf(it), old });
    render();
  }

  /** 2x2 choice (same layout as the matrix) below the icon of a sub-task. */
  function openPicker(btn) {
    closePicker();
    const it = byKey.get(btn.dataset.mxPick);
    if (!it) return;
    const cur = it.meta.quadrant || 'none';
    const opt = (q) => `<button data-mx-set="${q}" class="${q === cur ? 'on' : ''}" style="--c:${MM.QUADRANTS[q].color}">` +
      `${esc(MM.t('quad_' + q))}</button>`;
    const el = document.createElement('div');
    el.className = 'mx-picker';
    el.dataset.key = keyOf(it);
    el.innerHTML = `<div class="mx-picker-title">${esc(tr('Within "{t}":', { t: rootOf(it).title }))}</div>` +
      `<div class="mx-picker-grid">${QUADS.map(([q]) => opt(q)).join('')}</div>${opt('none')}`;
    const r = btn.getBoundingClientRect();
    el.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 270)) + 'px';
    el.style.top = Math.min(r.bottom + 4, window.innerHeight - 150) + 'px';
    dialog.querySelector('.ov-list').appendChild(el);
  }

  /** Close the picker; true if one was open. */
  function closePicker() {
    const el = dialog && dialog.querySelector('.mx-picker');
    if (el) el.remove();
    return !!el;
  }

  async function undoQuadrant() {
    const u = mxUndo.pop();
    const it = u && byKey.get(u.key);
    if (it) await setQuadrant(it, u.old, false);
    else if (u) render();
  }

  function initMatrixDrag() {
    const list = dialog.querySelector('.ov-list');
    const clear = () => list.querySelectorAll('.dragging, .drop-on').forEach((el) => el.classList.remove('dragging', 'drop-on'));
    list.addEventListener('dragstart', (e) => {
      const b = e.target.closest('.mx-b');
      if (!b) return;
      dragKey = b.dataset.path + '#' + b.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragKey);
      b.classList.add('dragging');
    });
    list.addEventListener('dragend', () => {
      dragKey = null;
      clear();
    });
    list.addEventListener('dragover', (e) => {
      const zone = dragKey && e.target.closest('[data-quad]');
      if (!zone) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!zone.classList.contains('drop-on')) {
        list.querySelectorAll('.drop-on').forEach((el) => el.classList.remove('drop-on'));
        zone.classList.add('drop-on');
      }
    });
    list.addEventListener('drop', (e) => {
      const zone = dragKey && e.target.closest('[data-quad]');
      if (!zone) return;
      e.preventDefault();
      const it = byKey.get(dragKey);
      dragKey = null;
      clear();
      if (it) setQuadrant(it, zone.dataset.quad, true);
    });
  }
})(window.MM);
