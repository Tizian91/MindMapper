'use strict';
/*
 * Estimate vs. actual time (overview view "Estimates"). Computed from the overview's
 * items every time the view is shown - nothing is stored, nothing is written.
 *
 *   Steps:    done tasks without sub-tasks that have an estimate (the one when work
 *             began, meta.estimateFirst, else the estimate) and an actual time
 *             (meta.actual), grouped by tag. A step also counts under the tags of its
 *             main tasks (a step of project #MoS2 is in "MoS2" as well). One step may
 *             be in several groups; "All" counts every step once.
 *   Projects: main tasks without a main task above them: the estimate when begun ->
 *             the steps' estimates together -> their recorded actual times together,
 *             and how many steps are done and recorded. Steps and projects never add up.
 *
 * Dropped sub-tasks are no part of a project; deferred and dropped tasks are no steps.
 * A period (since) keeps the steps finished in it, the running projects and the ones
 * finished in it.
 */
(function (MM) {
  const ST = (MM.stats = {});
  const has = (v) => v !== null && v !== undefined;

  ST.FEW = 5;    // below this many steps a group says little
  ST.HIT = 0.25; // "on target": within ±25 % of the estimate

  const firstEstimate = (m) => Number(has(m.estimateFirst) ? m.estimateFirst : m.estimate) || 0;
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  function median(xs) {
    const s = [...xs].sort((a, b) => a - b), k = s.length >> 1;
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
  }

  /** Numbers of a list of steps [{ est, act }]: totals, factor of the totals, median factor, share on target. */
  ST.summary = function (steps) {
    const n = steps.length, est = sum(steps.map((s) => s.est)), act = sum(steps.map((s) => s.act));
    const ratios = steps.map((s) => s.act / s.est);
    return {
      n, est, act, steps,
      factor: est ? act / est : null,
      median: n ? median(ratios) : null,
      hit: n ? ratios.filter((r) => Math.abs(r - 1) <= ST.HIT).length / n : null,
    };
  };

  const pad = (v) => String(v).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  /**
   * The day a task was finished: meta.doneAt (noted since 28.10.2026), else the end of
   * its last stopwatch run; '' if unknown.
   */
  ST.doneDay = function (m) {
    if (m.doneAt) return m.doneAt;
    const log = m.timeLog || [];
    return log.length ? iso(new Date(Math.max(...log.map((x) => x.e)))) : '';
  };

  /** First day of a period: 'all' -> '', '30' / '90' / '365' -> that many days back, 'year' -> 1 January. */
  ST.since = function (period, today = new Date()) {
    if (period === 'year') return `${today.getFullYear()}-01-01`;
    const days = Number(period);
    return days > 0 ? iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1)) : '';
  };

  /**
   * items: the overview's items (path, id, title, status, meta, tags, children / parent keys);
   * since: first day of the period ('' = everything) - a step counts when it was finished
   * then; one without a known day only without a period (counted in `undated`).
   * Returns { all, tags: [{ tag, ...summary }] ('' = without tag, last), projects: [...], undated }.
   */
  ST.compute = function (items, since = '') {
    const byKey = new Map(items.map((it) => [it.path + '#' + it.id, it]));
    const kids = (it) => it.children.map((k) => byKey.get(k)).filter((c) => c && c.status !== 'dropped');

    const steps = [];
    let undated = 0;
    for (const it of items) {
      if (it.status !== 'done' || kids(it).length || !has(it.meta.actual)) continue;
      const est = firstEstimate(it.meta), act = Number(it.meta.actual);
      if (!est || isNaN(act)) continue;
      if (since) {
        const day = ST.doneDay(it.meta);
        if (!day) undated++;
        if (!day || day < since) continue;
      }
      const tags = new Set(it.tags);
      for (let p = it.parent && byKey.get(it.parent); p; p = p.parent && byKey.get(p.parent)) p.tags.forEach((t) => tags.add(t));
      steps.push({ it, est, act, tags: [...tags] });
    }
    const groups = new Map();
    for (const s of steps) {
      for (const t of s.tags.length ? s.tags : ['']) groups.set(t, (groups.get(t) || []).concat([s]));
    }
    const tags = [...groups].map(([tag, list]) => Object.assign({ tag }, ST.summary(list)))
      .sort((a, b) => (a.tag === '') - (b.tag === '') || b.n - a.n || a.tag.localeCompare(b.tag));

    const projects = [];
    for (const it of items) {
      if (it.parent || it.status === 'dropped' || !kids(it).length) continue;
      // with a period: running projects, and the ones finished in it
      if (since && it.status === 'done' && !(ST.doneDay(it.meta) >= since)) continue;
      const leaves = [];
      const walk = (x) => kids(x).forEach((c) => (kids(c).length ? walk(c) : leaves.push(c)));
      walk(it);
      const done = leaves.filter((c) => c.status === 'done');
      const recorded = done.filter((c) => has(c.meta.actual));
      // no step recorded, but the project itself: that is its total
      const own = !recorded.length && has(it.meta.actual);
      const p = {
        it, first: firstEstimate(it.meta), planned: sum(leaves.map((c) => Number(c.meta.estimate) || 0)),
        act: own ? Number(it.meta.actual) : sum(recorded.map((c) => Number(c.meta.actual))),
        steps: leaves.length, done: done.length, recorded: recorded.length, own, finished: it.status === 'done',
      };
      if (p.first || p.planned || p.act) projects.push(p);
    }
    // running projects first, then the finished ones
    projects.sort((a, b) => a.finished - b.finished || a.it.title.localeCompare(b.it.title));
    return { all: ST.summary(steps), tags, projects, undated };
  };
})(window.MM);
