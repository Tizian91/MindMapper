'use strict';
/*
 * The lists "Overdue" and "Open tasks" of day / week / month plans
 * (plans/task-lists-plan.md).
 *
 * Unfinished notes are no longer carried into the next plan. Every running plan
 * lists the open main tasks of the whole project instead; an entry points at its
 * note (item.ref = { id, path }), the note stays where it was made. The lists are
 * filled and brought up to date when a running plan is opened (project.js fillPlan).
 *
 *   node.taskList = 'overdue' | 'open'     the two lists (to-do notes)
 *   item.ref      = { id, path }           the main task of an entry
 *
 * The entries are references: workload, overview and carry-over skip these lists.
 * Which notes are tasks, and which are main tasks, is decided as in the Overview.
 */
(function (MM) {
  const TL = (MM.taskLists = {});
  const T = () => MM.templates;

  /** Open tasks due later than this many days are only in the Overview. */
  TL.HORIZON = 28;

  const p2 = (v) => String(v).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const today = () => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const keyOf = (path, id) => path + '#' + id;

  /** Does the plan at `path` run today (begun, not over)? Past plans keep their lists as they were. */
  TL.running = function (path) {
    const info = T().parsePath(path);
    if (!info.date || !['day', 'week', 'month'].includes(info.kind)) return false;
    const start = info.date;
    const end = info.kind === 'day' ? start
      : info.kind === 'week' ? addDays(start, 6)
        : new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const t = today();
    return start <= t && t <= end;
  };

  /** A list item of the Overview that belongs into the lists: an open main task, no appointment. */
  function isOpenMainTask(it) {
    if (it.parent || it.type === 'todo' || it.status === 'done') return false;
    if (it.meta.scheduled && !it.meta.deadline) return false; // an appointment: 📌 in the plan of its day
    return it.type === 'task' || !!it.meta.deadline || ['open', 'progress', 'blocked'].includes(it.status);
  }

  /**
   * The open main tasks of all maps (Map path -> doc):
   * { overdue, open, later, model } - overdue: oldest deadline first; open: tightest first,
   * then the ones without a deadline; later: how many are due after the horizon.
   */
  TL.collect = function (docs) {
    const model = MM.overview.model(docs);
    const t = iso(today()), limit = iso(addDays(today(), TL.HORIZON));
    const overdue = [], open = [];
    let later = 0;
    for (const it of model.items) {
      if (!isOpenMainTask(it)) continue;
      const d = it.meta.deadline;
      if (d && d < t) overdue.push(it);
      else if (!d || d <= limit) open.push(it);
      else later++;
    }
    const byDate = (a, b) => (a.meta.deadline || '9999').localeCompare(b.meta.deadline || '9999') || a.title.localeCompare(b.title);
    overdue.sort(byDate);
    open.sort(byDate);
    return { overdue, open, later, model };
  };

  /**
   * Text of an entry: what helps deciding whether to follow the link -
   * "Budget Plan · 📅 30.10. · ☑ 2/4 · 45 %". Without words, so two devices in
   * different languages do not rewrite each other's plans.
   */
  TL.entryText = function (it, model) {
    const parts = [it.title];
    const d = it.meta.deadline;
    if (d) parts.push('📅 ' + d.slice(8, 10) + '.' + d.slice(5, 7) + '.');
    if (it.children.length) {
      const kids = it.children.map((k) => model.byKey.get(k)).filter(Boolean);
      parts.push(`☑ ${kids.filter((c) => c.status === 'done').length}/${kids.length}`);
    }
    const p = it.shownProgress;
    if (p) parts.push(Math.round(p) + ' %');
    return parts.join(' · ');
  };

  const listsOf = (doc) => Object.values(doc.nodes || {}).filter((n) => n.taskList === 'overdue' || n.taskList === 'open');

  /** The two lists of a plan; missing ones are added left of everything else. */
  function ensureLists(doc) {
    const have = {};
    for (const n of listsOf(doc)) if (!have[n.taskList]) have[n.taskList] = n;
    if (have.overdue && have.open) return have;
    const others = Object.values(doc.nodes || {}).filter((n) => !n.taskList);
    const minX = others.length ? Math.min(...others.map((n) => n.x)) : 0;
    const minY = others.length ? Math.min(...others.map((n) => n.y)) : 0;
    const w = 260;
    const make = (kind, x, text, style) => {
      const n = MM.createNode('todo', x + w / 2, minY + 60, { text, w });
      n.taskList = kind;
      n.items = [];
      Object.assign(n.style, style);
      doc.nodes[n.id] = n;
      return n;
    };
    if (!have.overdue) have.overdue = make('overdue', minX - 2 * (w + 40), 'Overdue', { fill: '#fff5f5', stroke: '#e53e3e' });
    if (!have.open) have.open = make('open', minX - (w + 40), 'Open tasks', { fill: '#ffffff', stroke: '#3182ce' });
    return have;
  }

  /**
   * Fill / bring up to date the lists of the plan `doc` at `path` from `docs` (all maps).
   * Only for a running plan. Returns true if something changed (then the caller saves).
   *   - new open main task -> entry appended at its place by deadline
   *   - task done elsewhere -> its entry is checked
   *   - deadline changed / now overdue -> text new, entry in the other list
   *   - gone (deleted, now a sub-task or an appointment, due later than the horizon)
   *     -> an open entry goes, a checked one stays
   */
  TL.fill = function (doc, path, docs) {
    if (!TL.running(path)) return false;
    const snapshot = () => JSON.stringify(listsOf(doc).map((n) => [n.taskList, n.text, n.items]));
    const before = snapshot();
    const lists = ensureLists(doc);
    const c = TL.collect(docs);

    const entries = new Map(); // task key -> { item, kind }
    for (const kind of ['overdue', 'open']) {
      for (const item of lists[kind].items) {
        if (item.ref && item.ref.id) entries.set(keyOf(item.ref.path, item.ref.id), { item, kind });
      }
    }
    const next = { overdue: [], open: [] }, kept = { overdue: [], open: [] };
    for (const kind of ['overdue', 'open']) {
      for (const it of c[kind]) {
        const key = keyOf(it.path, it.id);
        const e = entries.get(key);
        entries.delete(key);
        const item = e ? e.item : MM.createTodoItem('');
        item.ref = { id: it.id, path: it.path };
        if (!item.done) item.text = TL.entryText(it, c.model);
        next[kind].push(item);
      }
    }
    // entries whose task is no longer listed
    for (const [key, e] of entries) {
      const task = c.model.byKey.get(key);
      if (task && task.status === 'done') e.item.done = true;
      if (e.item.done) kept[e.kind].push(e.item);
    }
    // entries without a reference (written by hand) stay as they are
    for (const kind of ['overdue', 'open']) {
      for (const item of lists[kind].items) if (!item.ref || !item.ref.id) kept[kind].push(item);
    }
    lists.overdue.items = [...next.overdue, ...kept.overdue];
    lists.open.items = [...next.open, ...kept.open];
    lists.open.text = c.later ? `Open tasks (+${c.later} later)` : 'Open tasks';
    return snapshot() !== before;
  };

  // ---- From the list to the task -------------------------------------------------------

  /** ↗ of an entry: open the map of its task and show the task. */
  TL.openTask = async function (ref) {
    const S = MM.state, P = MM.project;
    if (ref.path === S.file.path && MM.node(ref.id)) {
      MM.actions.focusNode(ref.id);
      return;
    }
    if (!P.find(ref.path)) {
      MM.ui.flash(MM.tr('The task of this entry does not exist any more'));
      return;
    }
    if (await P.openMap(ref.path)) {
      if (MM.node(ref.id)) MM.actions.focusNode(ref.id);
      else MM.ui.flash(MM.tr('The task of this entry does not exist any more'));
    }
  };

  /** A sub-task and everything below it that is not done (model keys "path#id"). */
  function openBelow(it, byKey, out = []) {
    for (const k of it.children) {
      const c = byKey.get(k);
      if (!c) continue;
      if (c.status !== 'done') out.push(c);
      openBelow(c, byKey, out);
    }
    return out;
  }

  /**
   * Checkbox of an entry with a task (item.ref): checking it checks off the task - after a
   * question also its open sub-tasks, in whatever map they are; unchecking opens the task
   * again (its sub-tasks stay as they are). Without the task (deleted) it is a plain box.
   */
  TL.toggle = async function (list, item) {
    const S = MM.state, P = MM.project, tr = MM.tr;
    const done = !item.done;
    const plain = () => {
      item.done = done;
      MM.commit();
    };
    if (P.status !== 'ready') return plain();
    await MM.load.refresh(); // fresh state of the other maps
    const model = MM.overview.model(MM.load.docs());
    const task = model.byKey.get(keyOf(item.ref.path, item.ref.id));
    if (!task) return plain();
    const targets = [task];
    if (done) {
      const subs = openBelow(task, model.byKey);
      if (subs.length && !confirm(tr('"{task}" has {n} open sub-task(s). They are checked off as well - continue?', { task: task.title, n: subs.length }))) return;
      targets.push(...subs);
    }
    // per map: set the status (done: 100 %, open again: the progress of a done task goes)
    const byPath = new Map();
    for (const t of targets) byPath.set(t.path, [...(byPath.get(t.path) || []), t.id]);
    const ask = []; // checked off in another map: how long did it take? (actual.js)
    const set = (n, path) => {
      n.meta = Object.assign(MM.emptyMeta(), n.meta || {});
      if (done) {
        if (path && n.meta.status !== 'done') {
          MM.actual.checkedOff(n);
          if (MM.actual.askable(n)) ask.push({ path, node: n });
        }
        n.meta.status = 'done';
        if (n.type === 'task') n.meta.progress = 100;
      } else {
        n.meta.status = 'open';
        if (n.meta.progress === 100) n.meta.progress = null;
      }
    };
    try {
      for (const [path, ids] of byPath) {
        if (path === S.file.path) {
          for (const id of ids) if (S.doc.nodes[id]) set(S.doc.nodes[id]); // saved with the entry below
          continue;
        }
        const doc = await P.readMap(path);
        if (!doc) continue;
        for (const id of ids) if (doc.nodes[id]) set(doc.nodes[id], path);
        await P.writeMap(path, doc);
      }
    } catch (err) {
      alert(tr('Could not change the task: {err}', { err: (err && err.message) || err }));
      return;
    }
    if (list !== S.doc.nodes[list.id]) return; // another map was opened meanwhile
    item.done = done;
    MM.commit(); // asks itself for the tasks of the open map - the others join that question
    if (ask.length) MM.actual.askFor(ask);
    MM.load.scheduleRefresh();
    MM.tasks.refreshExternal();
    MM.ui.flash(done
      ? (targets.length > 1 ? tr('Checked off "{task}" and {n} sub-task(s)', { task: task.title, n: targets.length - 1 }) : tr('Checked off "{task}"', { task: task.title }))
      : tr('"{task}" is open again', { task: task.title }));
  };
})(window.MM);
