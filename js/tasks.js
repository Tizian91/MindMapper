'use strict';
/*
 * Task hierarchy of the open map (same rules as the overview, see overview.js):
 *   - an arrow from task A to task B makes B a sub-task of A
 *   - the top level tasks of a map derived from A (A.derivedMap) are sub-tasks of A
 * The estimate of a main task is its total effort; the sub-tasks split it up
 * and the part not split up yet is planned with the main task (see combine).
 * Its progress comes from the sub-tasks, weighted by effort; done counts as
 * 100 %, a done main task is 100 %.
 *
 * Deadlines: a sub-task is due by its main task's deadline (enforceDeadlines);
 * a derived map follows when the deadline of its main task changes (syncDerived).
 *
 * Derived maps live in other files, so they are read in the background
 * (refreshExternal: when a map is opened or the project folder connects, and
 * when a task links a derived map that was not read yet) and cached.
 * The progress is not written into the maps; the manual progress stays stored.
 */
(function (MM) {
  const S = MM.state;
  const TK = (MM.tasks = {});
  let ext = new Map();  // derived map path -> [{ p, w }] of its top level tasks (null: unreadable)
  let extVersion = 0;
  let cache = { key: null, doc: null, info: new Map() };

  const isTask = (n) => !!n && n.type === 'task' && !n.movedTo;

  /**
   * Combine the sub-tasks of a main task (shared with overview.js).
   *   kids: [{ p: progress 0..100, w: effort in minutes (0 = no estimate) }]
   *   own:  estimate of the main task = its total effort
   * The sub-tasks split the main task up; what is not split up yet ("rest")
   * is planned with the main task and counts as not started. Progress is
   * weighted by effort; sub-tasks without an estimate weigh like the average
   * of the others (or all equally if none has one).
   * Returns { progress, effort, split, rest, over }.
   */
  TK.combine = function (kids, own, done) {
    own = Number(own) || 0;
    const known = kids.filter((k) => k.w > 0);
    const split = known.reduce((s, k) => s + k.w, 0);
    const avg = known.length ? split / known.length : 1;
    const ws = kids.map((k) => (k.w > 0 ? k.w : avg));
    const kidsW = ws.reduce((s, w) => s + w, 0);
    const restW = known.length && own > kidsW ? own - kidsW : 0;
    const progress = done ? 100 : kidsW + restW ? kids.reduce((s, k, i) => s + k.p * ws[i], 0) / (kidsW + restW) : 0;
    return {
      progress, effort: Math.max(own, split), split,
      rest: Math.max(0, own - split), over: own > 0 && split > own,
    };
  };

  /**
   * Hierarchy of one document. external(path) returns [{ p, w }] (progress and
   * effort) of the top level tasks of another map, or null.
   * Returns { info: Map(id -> { progress, count, effort, split, rest, over }),
   *           roots: [{ p, w }] of the top level tasks }.
   */
  /** Main task / sub-task relations of a document: { parent: Map(id -> id), children: Map(id -> [id]) }. */
  function hierarchy(doc) {
    const nodes = doc.nodes || {};
    const parent = new Map(), children = new Map();
    // never create a cycle (A -> B -> A); the first main task wins
    const below = (id, anc) => {
      for (let k = id; k; k = parent.get(k)) if (k === anc) return true;
      return false;
    };
    for (const e of Object.values(doc.edges || {})) {
      const a = e.source && e.source.node, b = e.target && e.target.node;
      if (!a || !b || a === b || !isTask(nodes[a]) || !isTask(nodes[b])) continue;
      if (parent.has(b) || below(a, b)) continue;
      parent.set(b, a);
      if (!children.has(a)) children.set(a, []);
      children.get(a).push(b);
    }
    return { parent, children };
  }

  /**
   * A sub-task is due by its main task's deadline at the latest:
   *   - a later one is moved back to it (also when the main task becomes due earlier)
   *   - a task that becomes a sub-task (new arrow, new task) without a deadline takes the main task's
   *   - when the main task's deadline changes (or is cleared), the sub-tasks that had the
   *     old one (or none) follow; a sub-task's deadline cleared by hand stays cleared
   * Sub-tasks with an appointment instead of a deadline are left alone.
   *   prev:  the doc before this step (null: every relation counts as new)
   *   outer: { due, was } - this is a derived map: the deadline of its main task in the
   *          other map now and before; the top level tasks are its sub-tasks (or null)
   * Changes doc in place (called by MM.commit). Returns the number of moved-back deadlines.
   */
  TK.enforceDeadlines = function (doc, prev, outer) {
    const nodes = doc.nodes || {};
    const { parent, children } = hierarchy(doc);
    const before = prev ? prev.nodes || {} : null;
    const oldParent = prev ? hierarchy(prev).parent : null;
    const dl = (n) => (n && n.meta && n.meta.deadline) || '';
    let limited = 0;
    // k is a sub-task of a main task due `due` now and `was` before this step (undefined: unknown)
    const fit = (k, due, was, fresh) => {
      const m = nodes[k].meta;
      if (!m || m.scheduled) return;
      const own = m.deadline || '';
      const touched = before && before[k] ? dl(before[k]) !== own : false; // changed by hand in this step
      if (fresh) {
        if (!own && due) m.deadline = due;
      } else if (was !== undefined && was !== due && own === was && !touched) {
        m.deadline = due || '';
      }
      if (due && m.deadline > due) {
        m.deadline = due;
        limited++;
      }
    };
    const visit = (id) => {
      const due = dl(nodes[id]);
      const was = before ? (before[id] ? dl(before[id]) : undefined) : due;
      for (const k of children.get(id) || []) {
        fit(k, due, was, !oldParent || oldParent.get(k) !== id);
        visit(k);
      }
    };
    if (outer) {
      // the top level tasks of a derived map: sub-tasks of its main task
      for (const n of Object.values(nodes)) {
        if (!isTask(n) || parent.has(n.id)) continue;
        const fresh = !before || !isTask(before[n.id]) || oldParent.has(n.id);
        fit(n.id, outer.due || '', outer.was, fresh);
      }
    }
    for (const id of children.keys()) if (!parent.has(id)) visit(id);
    return limited;
  };

  let syncing = Promise.resolve();

  /**
   * Called by MM.commit before a step is recorded (last: the undo snapshot before it):
   * sub-task deadlines of the open map, and the derived maps follow their main task.
   * Returns the number of moved-back deadlines.
   */
  TK.commit = function (doc, last) {
    if (!Object.values(doc.nodes || {}).some(isTask)) return 0;
    let prev = null;
    try {
      prev = last ? JSON.parse(last) : null;
    } catch (err) { /* no snapshot: every relation counts as new */ }
    const due = TK.outerDeadline();
    const limited = TK.enforceDeadlines(doc, prev, due === null ? null : { due, was: due });
    const moved = prev && Object.values(doc.nodes).some((n) => isTask(n) && n.derivedMap && prev.nodes[n.id] &&
      ((n.meta && n.meta.deadline) || '') !== ((prev.nodes[n.id].meta || {}).deadline || ''));
    if (moved) {
      const now = { nodes: JSON.parse(JSON.stringify(doc.nodes)) }; // as it is now, not after the next step
      const from = S.file.path;
      syncing = syncing.then(async () => {
        try {
          const n = await TK.syncDerived(now, prev, new Set([from]));
          if (n) {
            MM.load.scheduleRefresh();
            MM.ui.flash(MM.tr('Deadline of the sub-tasks also changed in {n} derived map(s)', { n }));
          }
        } catch (err) {
          MM.ui.flash(MM.tr('Could not update the derived maps: {err}', { err: (err && err.message) || err }));
        }
      });
    }
    return limited;
  };

  /**
   * The main task of the open map in another map (the task it was derived from):
   * its deadline, from the maps read last (see workload.js). '' = none, null = no derived map.
   */
  TK.outerDeadline = function () {
    const path = S.file.path;
    if (!path || !MM.load || !MM.load.loaded()) return null;
    for (const [p, doc] of MM.load.docs()) {
      if (p === path) continue;
      for (const n of Object.values((doc && doc.nodes) || {})) {
        if (isTask(n) && n.derivedMap === path) return (n.meta && n.meta.deadline) || '';
      }
    }
    return null;
  };

  /**
   * Latest deadline the given notes may get (their main task's, the earliest of
   * several), or '' if there is no limit. For the date pickers.
   */
  TK.maxDeadline = function (list) {
    const { parent } = hierarchy(S.doc);
    let outer;
    let max = '';
    for (const n of list) {
      let due = '';
      if (parent.has(n.id)) due = (S.doc.nodes[parent.get(n.id)].meta || {}).deadline || '';
      else if (isTask(n)) {
        if (outer === undefined) outer = TK.outerDeadline() || '';
        due = outer;
      }
      if (due && (!max || due < max)) max = due;
    }
    return max;
  };

  /**
   * The deadline of a task with a derived map changed (doc before: prev): the
   * derived maps follow - their top level tasks are its sub-tasks (and so on,
   * for maps derived from those). Written in the background; returns the number
   * of maps changed.
   */
  TK.syncDerived = async function (doc, prev, seen = new Set()) {
    const P = MM.project;
    if (!P || P.status !== 'ready') return 0;
    let count = 0;
    for (const n of Object.values(doc.nodes || {})) {
      if (!isTask(n) || !n.derivedMap || seen.has(n.derivedMap) || n.derivedMap === S.file.path) continue;
      const old = prev && prev.nodes && prev.nodes[n.id];
      const due = (n.meta && n.meta.deadline) || '', was = old ? (old.meta && old.meta.deadline) || '' : due;
      if (due === was) continue;
      seen.add(n.derivedMap);
      const sub = P.find(n.derivedMap) ? await P.readMap(n.derivedMap) : null;
      if (!sub) continue;
      const before = JSON.parse(JSON.stringify(sub));
      TK.enforceDeadlines(sub, before, { due, was });
      if (JSON.stringify(sub.nodes) === JSON.stringify(before.nodes)) continue;
      if (!(await P.ensureWriteAccess())) throw new Error(MM.tr('no write access to the project folder'));
      await P.writeMap(n.derivedMap, sub);
      count += 1 + (await TK.syncDerived(sub, before, seen));
    }
    return count;
  };

  TK.compute = function (doc, external) {
    const nodes = doc.nodes || {};
    const { parent, children } = hierarchy(doc);
    // effective { p, w } of a task: progress and effort (estimate, or the total of a main task)
    const memo = new Map(), info = new Map();
    const effective = (id) => {
      if (memo.has(id)) return memo.get(id);
      const n = nodes[id];
      const m = n.meta || {};
      const kids = (children.get(id) || []).map(effective);
      const outside = n.derivedMap && external ? external(n.derivedMap) : null;
      if (outside) kids.push(...outside);
      const done = m.status === 'done';
      let v;
      if (kids.length) {
        const c = TK.combine(kids, m.estimate, done);
        info.set(id, { progress: Math.round(c.progress), count: kids.length, effort: c.effort, split: c.split, rest: c.rest, over: c.over });
        v = { p: c.progress, w: c.effort };
      } else {
        v = { p: done ? 100 : Number(m.progress) || 0, w: Number(m.estimate) || 0 };
      }
      memo.set(id, v);
      return v;
    };
    const roots = [];
    for (const n of Object.values(nodes)) {
      if (!isTask(n)) continue;
      const v = effective(n.id);
      if (!parent.has(n.id)) roots.push(v);
    }
    return { info, roots };
  };

  /** { progress, count } of a task of the open map that has sub-tasks, else null. */
  TK.info = function (n) {
    if (!isTask(n) || S.doc.nodes[n.id] !== n) return null;
    const key = S.rev + '|' + extVersion;
    if (cache.key !== key || cache.doc !== S.doc) {
      const external = (path) => {
        if (!ext.has(path)) scheduleRefresh(); // not read yet (e.g. just derived)
        return ext.get(path) || null;
      };
      cache = { key, doc: S.doc, info: TK.compute(S.doc, external).info };
    }
    return cache.info.get(n.id) || null;
  };

  // ---- Reading the derived maps --------------------------------------------

  let timer = null, running = 0;
  function scheduleRefresh() {
    clearTimeout(timer);
    timer = setTimeout(() => TK.refreshExternal(), 300);
  }

  /** Read every map derived from a task of the open map (recursively) and redraw if a value changed. */
  TK.refreshExternal = async function () {
    const run = ++running;
    const P = MM.project;
    if (!P || P.status !== 'ready') return;
    const next = new Map(), loading = new Set();
    const summary = async (path) => {
      if (next.has(path)) return;
      if (loading.has(path) || path === S.file.path) return; // cycle back to a map being read / the open map
      loading.add(path);
      let roots = null;
      try {
        const doc = P.find(path) ? await P.readMap(path) : null;
        if (doc) {
          for (const n of Object.values(doc.nodes)) if (isTask(n) && n.derivedMap) await summary(n.derivedMap);
          roots = TK.compute(doc, (p) => next.get(p) || null).roots;
        }
      } catch (err) { /* unreadable map: counts as unknown */ }
      loading.delete(path);
      next.set(path, roots);
    };
    for (const n of Object.values(S.doc.nodes)) if (isTask(n) && n.derivedMap) await summary(n.derivedMap);
    if (run !== running) return; // a newer refresh started meanwhile
    // paths that could not be read are remembered too, so they don't trigger new refreshes
    for (const n of Object.values(S.doc.nodes)) if (isTask(n) && n.derivedMap && !next.has(n.derivedMap)) next.set(n.derivedMap, null);
    const changed = JSON.stringify([...next]) !== JSON.stringify([...ext]);
    ext = next;
    if (changed) {
      extVersion++;
      MM.refresh();
    }
  };
})(window.MM);
