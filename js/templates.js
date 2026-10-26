'use strict';
/*
 * Templates for new maps: blank, week plan, month plan.
 * Each returns { doc, name, folder }.
 *
 * Week and month plans link to each other (month column -> week map,
 * week heading -> month map) and can take over unfinished work from the
 * previous week / month ("carry over").
 */
(function (MM) {
  const T = (MM.templates = {});
  const pad = (n) => String(n).padStart(2, '0');
  const DAY = 864e5;
  T.WEEK_FOLDER = 'Weeks';
  T.MONTH_FOLDER = 'Months';
  T.DAY_FOLDER = 'Days';

  // ---- Date helpers (ISO weeks start on Monday) --------------------------------

  T.mondayOf = function (d) {
    const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
    return r;
  };

  T.isoWeek = function (d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return { year: t.getUTCFullYear(), week: Math.ceil(((t - yearStart) / DAY + 1) / 7) };
  };

  /** "2026-W43" -> Monday of that week */
  T.parseWeek = function (s) {
    const m = /^(\d{4})-W(\d{1,2})$/.exec(s || '');
    if (!m) return null;
    const monday = T.mondayOf(new Date(+m[1], 0, 4));
    monday.setDate(monday.getDate() + (+m[2] - 1) * 7);
    return monday;
  };

  /** "2026-10" -> first day of that month */
  T.parseMonth = function (s) {
    const m = /^(\d{4})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, 1) : null;
  };

  /** "2026-10-20" -> that day */
  T.parseDay = function (s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };

  T.weekValue = (d) => {
    const w = T.isoWeek(d);
    return `${w.year}-W${pad(w.week)}`;
  };
  T.monthValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  T.dayValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const fmt = (d, opts) => d.toLocaleDateString('en-GB', opts);

  T.weekPath = (d) => `${T.WEEK_FOLDER}/${T.weekValue(d)}.mindmap.json`;
  T.monthPath = (d) => `${T.MONTH_FOLDER}/${T.monthValue(d)}.mindmap.json`;
  T.dayPath = (d) => `${T.DAY_FOLDER}/${T.dayValue(d)}.mindmap.json`;

  /** "19 – 25 Oct 2026" style range */
  function range(a, b) {
    const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    return sameMonth
      ? `${a.getDate()} – ${fmt(b, { day: 'numeric', month: 'short', year: 'numeric' })}`
      : `${fmt(a, { day: 'numeric', month: 'short' })} – ${fmt(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  // ---- Building blocks -------------------------------------------------------------

  function builder() {
    const doc = MM.emptyDoc();
    return {
      doc,
      add(type, cx, cy, extra) {
        const n = MM.createNode(type, cx, cy, extra);
        doc.nodes[n.id] = n;
        return n;
      },
      link(a, b, style, anchors) {
        const e = MM.createEdge({ node: a.id, anchor: anchors ? anchors[0] : 'auto' },
          { node: b.id, anchor: anchors ? anchors[1] : 'auto' }, style);
        doc.edges[e.id] = e;
      },
    };
  }

  /**
   * Heading in the middle, goals on the left, notes on the right, columns below.
   * columns: [{ title, type, style?, extra? }]
   */
  function plan(title, columns, headExtra) {
    const b = builder();
    const head = b.add('heading', 0, 0, Object.assign({ text: title, w: 380 }, headExtra || {}));
    const goals = b.add('todo', -560, 0, { text: 'Goals', w: 240 });
    goals.items = [MM.createTodoItem('')];
    const notes = b.add('outline', 560, 0, { text: 'Notes', w: 260 });
    b.link(head, goals, { route: 'straight', endArrow: 'none', lineStyle: 'dashed' });
    b.link(head, notes, { route: 'straight', endArrow: 'none', lineStyle: 'dashed' });
    const w = 210, gap = 26;
    const x0 = -((columns.length * w + (columns.length - 1) * gap) / 2) + w / 2;
    columns.forEach((col, i) => {
      const n = b.add(col.type, x0 + i * (w + gap), 230, Object.assign({ text: col.title, w }, col.extra || {}));
      if (col.type === 'todo') n.items = [MM.createTodoItem('')];
      if (col.style) Object.assign(n.style, col.style);
      b.link(head, n, { route: 'rounded', endArrow: 'triangle' }, ['s', 'n']);
    });
    return b.doc;
  }

  // ---- Templates ---------------------------------------------------------------------

  T.blank = function (name) {
    const b = builder();
    b.add('heading', 0, 0, { text: name || 'New map' });
    return { doc: b.doc, name: name || 'New map', folder: '' };
  };

  /** Week plan for the week containing `date`: one to-do list per day. */
  T.week = function (date) {
    const monday = T.mondayOf(date);
    const { week } = T.isoWeek(monday);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      days.push({
        type: 'todo',
        title: fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }),
        style: i >= 5 ? { fill: '#f7fafc', stroke: '#a0aec0' } : { fill: '#ffffff', stroke: '#718096' },
        extra: {
          meta: Object.assign(MM.emptyMeta(), { deadline: iso(d) }),
          link: T.dayPath(d), // ↗ opens (or creates) the day map of that column
        },
      });
    }
    const title = `Week ${week} · ${range(monday, addDays(monday, 6))}`;
    const doc = plan(title, days, { link: T.monthPath(monday) });
    return { doc, name: T.weekValue(monday), folder: T.WEEK_FOLDER };
  };

  /** Day plan: morning / afternoon / evening to-do lists, linked to its week. */
  T.day = function (date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const title = fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const meta = () => Object.assign(MM.emptyMeta(), { deadline: iso(d) });
    const columns = [
      { type: 'todo', title: 'Morning', extra: { meta: meta() } },
      { type: 'todo', title: 'Afternoon', extra: { meta: meta() } },
      { type: 'todo', title: 'Evening', extra: { meta: meta() } },
    ];
    const doc = plan(title, columns, { link: T.weekPath(d) });
    return { doc, name: T.dayValue(d), folder: T.DAY_FOLDER };
  };

  /** Month plan with one column per (ISO) week touching the month, linked to the week maps. */
  T.month = function (date) {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const cols = [];
    for (let m = T.mondayOf(first); m <= last; m = addDays(m, 7)) {
      cols.push({ type: 'outline', title: `Week ${T.isoWeek(m).week} · ${range(m, addDays(m, 6))}`, extra: { link: T.weekPath(m) } });
    }
    const title = fmt(first, { month: 'long', year: 'numeric' });
    return { doc: plan(title, cols), name: T.monthValue(first), folder: T.MONTH_FOLDER };
  };

  /**
   * What kind of plan a path describes, without building it:
   * { kind: 'day'|'week'|'month'|'blank', date }.
   */
  T.parsePath = function (path) {
    const file = String(path || '').split('/').pop().replace(/\.mindmap\.json$/i, '').replace(/\.json$/i, '');
    // day first: "2026-10-20" must not be taken for a week or a month
    const dy = T.parseDay(file);
    if (dy) return { kind: 'day', date: dy };
    const wk = T.parseWeek(file);
    if (wk) return { kind: 'week', date: wk };
    const mo = T.parseMonth(file);
    if (mo) return { kind: 'month', date: mo };
    return { kind: 'blank', date: null };
  };

  const today = () => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  };

  /**
   * Has the day / week / month of that map begun (today or earlier)?
   * Unfinished work is only carried over then - a map created ahead of time
   * (a future week) must not take the work of the current one yet.
   * Other maps: true.
   */
  T.hasStarted = function (path) {
    const info = T.parsePath(path);
    return !info.date || info.date <= today(); // parse* return the first day of the period
  };

  /**
   * Template matching a file path: "Weeks/2026-W43…" -> week, "Months/2026-10…" -> month,
   * anything else -> blank. Returns { kind, result, prevName }.
   */
  T.forPath = function (path) {
    const info = T.parsePath(path);
    if (info.kind === 'day') return { kind: 'day', result: T.day(info.date), prevName: T.dayValue(addDays(info.date, -1)) };
    if (info.kind === 'week') return { kind: 'week', result: T.week(info.date), prevName: T.weekValue(addDays(info.date, -7)) };
    if (info.kind === 'month') {
      const mo = info.date;
      return { kind: 'month', result: T.month(mo), prevName: T.monthValue(new Date(mo.getFullYear(), mo.getMonth() - 1, 1)) };
    }
    const file = String(path || '').split('/').pop().replace(/\.mindmap\.json$/i, '').replace(/\.json$/i, '');
    return { kind: 'blank', result: T.blank(file), prevName: null };
  };

  // ---- Carry over unfinished work ------------------------------------------------

  /**
   * Unfinished work in a map that is carried over: the open entries ({ text, from }) of
   * its task lists - written right into a list, they have no note a link could point at.
   * Unfinished notes stay where they are: the next plan lists them in "Overdue" /
   * "Open tasks" (tasklists.js). notes / bundles / open stay empty (kept for the callers).
   */
  T.collectUnfinished = function (doc) {
    const items = [];
    for (const n of Object.values(doc.nodes || {})) {
      // appointments: no work before their day; the plan of that day lists them (📌)
      if (n.type !== 'todo' || n.movedTo || n.repeat || n.taskList || !MM.meta.isTaskTodo(n) || (n.meta && n.meta.scheduled)) continue;
      for (const it of n.items || []) {
        // entries of routines (a meeting) are not carried along - the next plan gets its own
        if (it.done || it.moved || it.routine || !it.text.trim()) continue;
        items.push({ text: it.text, from: n.text === 'Carried over' ? null : n.text, nodeId: n.id, itemId: it.id });
      }
    }
    return { items, bundles: [], open: 0, notes: [], edges: doc.edges || {}, assets: doc.assets || {} };
  };

  /**
   * Mark carried-over work in the old map as "migrated" (bullet journal style),
   * so it is not open twice. Notes get a link to the new map.
   */
  T.markMoved = function (doc, carry, newPath, newName) {
    const noteIds = new Set(carry.notes.map((n) => n.id));
    for (const n of Object.values(doc.nodes || {})) {
      if (noteIds.has(n.id)) {
        n.movedTo = newPath;
        if (!n.link && n.type !== 'draw') n.link = newPath;
      }
      for (const it of n.items || []) {
        if (carry.items.some((c) => c.itemId === it.id && c.nodeId === n.id)) it.moved = newName;
      }
    }
  };

  /** Lowest bottom edge of all notes in a document. */
  T.bottomOf = function (doc) {
    const nodes = Object.values(doc.nodes || {});
    return nodes.length ? Math.max(...nodes.map((n) => n.y + n.h)) : 0;
  };

  /**
   * Lay out notes in a row below everything else in `doc`.
   * Returns the y coordinate the row was placed at.
   */
  T.placeBelow = function (doc, nodes, startX) {
    const bottom = T.bottomOf(doc);
    const y = bottom + 120;
    let x = startX === undefined ? -560 : startX;
    for (const n of nodes) {
      n.x = Math.round(x);
      n.y = Math.round(y);
      x += n.w + 30;
    }
    return y;
  };

  /**
   * Put carried-over work into a new map (below the plan). Returns the number of things added.
   * path: the new map; the "Carried over" list is due on its first day (today for other maps),
   * so the entries stay in the overview.
   */
  T.addCarryOver = function (doc, carry, fromName, path) {
    const nodes = Object.values(doc.nodes);
    const bottom = nodes.length ? Math.max(...nodes.map((n) => n.y + n.h)) : 0;
    let count = 0;
    if (carry.items.length) {
      const todo = MM.createNode('todo', -560, bottom + 140, { text: 'Carried over', w: 260 });
      todo.items = carry.items.map((i) => MM.createTodoItem(i.from ? `${i.text} (${i.from})` : i.text));
      todo.style.fill = '#fff5f5';
      todo.style.stroke = '#e53e3e';
      todo.tags = ['carried-over'];
      const start = T.parsePath(path).date;
      todo.meta = Object.assign(MM.emptyMeta(), { deadline: start ? iso(start) : iso(today()) });
      doc.nodes[todo.id] = todo;
      count += carry.items.length;
    }
    // tasks with their sub-tasks and groups keep their layout, side by side right of the list
    const src = { nodes: Object.fromEntries(carry.notes.map((n) => [n.id, n])), edges: carry.edges, assets: carry.assets };
    const copies = MM.transfer.copyBundles(src, carry.bundles || [], doc, carry.items.length ? -240 : -560, bottom + 110);
    for (const { copy: n } of copies) {
      if (n.type !== 'group' && n.type !== 'image') n.tags = Array.from(new Set([...(n.tags || []), 'carried-over']));
    }
    count += copies.length;
    if (count) {
      const hint = MM.createNode('text', -560, bottom + 60, {
        text: `Carried over from ${fromName}`, w: 260, h: 36, shape: 'none',
      });
      hint.style.textColor = '#c53030';
      hint.style.align = 'left';
      doc.nodes[hint.id] = hint;
    }
    return count;
  };
})(window.MM);
