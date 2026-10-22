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
 * Derived maps live in other files, so they are read in the background
 * (refreshExternal: when a map is opened or the project folder connects, and
 * when a task links a derived map that was not read yet) and cached.
 * Nothing is written into the maps; the manual progress stays stored.
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
  TK.compute = function (doc, external) {
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
