'use strict';
/*
 * Note metadata (deadline, estimated time, priority), tags and the view filter.
 *
 *   node.meta = { deadline: 'YYYY-MM-DD' | '', estimate: minutes | null, priority: 'none'|'low'|...,
 *                 quadrant: 'none'|'both'|'important'|'urgent'|'neither' }  (only the active system is shown)
 *   node.tags = ['idea', 'work', ...]
 */
(function (MM) {
  const S = MM.state;
  const META = (MM.meta = {});
  const esc = (s) => MM.render.esc(s);
  const tr = (s, v) => MM.tr(s, v);

  // ---- Estimated time --------------------------------------------------------

  /**
   * Parse "1h 30m", "90m", "1.5h", "2" (= hours), "1d" into minutes.
   * A day is one work day of the planning capacity (hours per work day of the
   * project folder, see workload.js), converted when typed: estimates are stored
   * in minutes, so changing the capacity later does not change them.
   * Returns null for an empty string and undefined if nothing could be read.
   */
  META.parseDuration = function (str) {
    str = String(str || '').trim().toLowerCase().replace(/,/g, '.');
    if (!str) return null;
    const re = /(\d+(?:\.\d+)?)\s*(d|h|min|m)?/g;
    const day = (MM.load ? MM.load.capacity().hours : 8) * 60;
    let total = 0, found = false, lastUnit = null, m;
    while ((m = re.exec(str))) {
      found = true;
      const v = parseFloat(m[1]);
      // a bare number after hours means minutes ("1h30"), otherwise hours
      const unit = m[2] || (lastUnit === 'h' ? 'm' : 'h');
      total += unit === 'd' ? v * day : unit === 'h' ? v * 60 : v;
      lastUnit = unit;
    }
    return found ? Math.round(total) : undefined;
  };

  META.formatDuration = function (min) {
    if (min === null || min === undefined || isNaN(min)) return '';
    const h = Math.floor(min / 60), m = min % 60;
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  // ---- Deadlines ---------------------------------------------------------------

  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  /** Whole days from today until the deadline (negative = overdue), or null. */
  META.daysUntil = function (s) {
    const d = parseDate(s);
    if (!d) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 864e5);
  };

  /** 'overdue' | 'today' | 'soon' (<= 3 days) | 'later' | null */
  META.deadlineStatus = function (s) {
    const days = META.daysUntil(s);
    if (days === null) return null;
    if (days < 0) return 'overdue';
    if (days === 0) return 'today';
    if (days <= 3) return 'soon';
    return 'later';
  };

  /** Today as 'YYYY-MM-DD' (local time). */
  META.todayStr = function () {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  META.formatDate = function (s) {
    const d = parseDate(s);
    if (!d) return '';
    const days = META.daysUntil(s);
    if (days === 0) return tr('Today');
    if (days === 1) return tr('Tomorrow');
    if (days === -1) return tr('Yesterday');
    const opts = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(MM.locale(), opts);
  };

  // ---- Tags ----------------------------------------------------------------------

  META.normalizeTag = (t) => String(t || '').trim().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 40);

  /** All tags in the document with their usage count, sorted by name. */
  META.allTags = function () {
    const counts = new Map();
    for (const n of Object.values(S.doc.nodes)) {
      for (const t of n.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag));
  };

  /** Stable color hue for a tag. */
  META.tagHue = function (tag) {
    let h = 0;
    for (const c of tag.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  };

  // ---- Chips (shared by badges, task notes, panel and filter bar) -----------------

  const ICONS = {
    // bar icon for the percent chip (the status icon named `progress` comes below)
    percent: '<svg viewBox="0 0 16 16"><rect x="1.5" y="6" width="13" height="4" rx="2"/><rect x="2.5" y="7" width="6" height="2" rx="1" class="fill"/></svg>',
    deadline: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 7h12M5 1.5v3M11 1.5v3"/></svg>',
    scheduled: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 7h12M5 1.5v3M11 1.5v3"/><rect x="5" y="9" width="3" height="2.5" class="fill"/></svg>',
    estimate: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></svg>',
    actual: '<svg viewBox="0 0 16 16"><circle cx="8" cy="9" r="5.5"/><path d="M8 9V6M6.5 1.5h3M8 1.5v2"/></svg>',
    priority: '<svg viewBox="0 0 16 16"><path d="M3.5 14.5V2M3.5 2.5h8.5l-2 3 2 3H3.5"/></svg>',
    quadrant: '<svg viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M8 2v12M2 8h12"/></svg>',
    // status icons: one per state
    none: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke-dasharray="2 2"/></svg>',
    open: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/></svg>',
    progress: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" class="fill"/></svg>',
    blocked: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><path d="M5.5 8h5"/></svg>',
    // deferred: a pause; dropped: crossed out
    deferred: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><path d="M6.5 5.8v4.4M9.5 5.8v4.4"/></svg>',
    done: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" class="fill"/><path d="M5.4 8.2l1.8 1.8 3.4-3.6" class="check"/></svg>',
    dropped: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><path d="M6 6l4 4M10 6l-4 4"/></svg>',
  };
  META.icon = (k) => ICONS[k];

  META.tagChip = function (tag, extraAttrs) {
    return `<span class="chip chip-tag" style="--h:${META.tagHue(tag)}" ${extraAttrs || ''}>#${esc(tag)}</span>`;
  };

  /**
   * HTML for a note's metadata chips.
   * placeholders: also show empty fields (used by task notes, where they are always visible).
   */
  META.chipsHTML = function (n, placeholders) {
    const m = n.meta || MM.emptyMeta();
    let h = '';
    const status = m.status || 'none';
    if (status !== 'none') {
      const s = MM.STATUSES[status] || MM.STATUSES.none;
      h += `<span class="chip chip-status" data-meta="status" style="--c:${s.color}">${ICONS[status]}${esc(tr(s.label))}</span>`;
    } else if (placeholders) {
      h += `<span class="chip chip-empty" data-meta="status">${ICONS.none}${tr('Status')}</span>`;
    }
    // priority level or Eisenhower quadrant, whichever system the project uses
    const pKey = MM.prioKey(), pVal = MM.prioOf(m);
    if (pVal !== 'none') {
      const prio = MM.prioCatalog()[pVal];
      h += `<span class="chip chip-prio" data-meta="${pKey}" style="--c:${prio.color}">${ICONS[pKey]}${esc(MM.prioLabel(pVal))}</span>`;
    } else if (placeholders) {
      h += `<span class="chip chip-empty" data-meta="${pKey}">${ICONS[pKey]}${tr(pKey === 'quadrant' ? 'Eisenhower' : 'Priority')}</span>`;
    }
    if (m.deadline) {
      // a finished task is never "overdue"
      const st = status === 'done' || status === 'dropped' ? 'finished' : META.deadlineStatus(m.deadline);
      h += `<span class="chip chip-date ${st}" data-meta="deadline" title="${esc(tr('Deadline {d}', { d: m.deadline }))}">${ICONS.deadline}${META.formatDate(m.deadline)}</span>`;
    } else if (placeholders && !m.scheduled) {
      h += `<span class="chip chip-empty" data-meta="deadline">${ICONS.deadline}${tr('Deadline')}</span>`;
    }
    if (m.scheduled) {
      const st = status === 'done' || status === 'dropped' ? 'finished' : META.deadlineStatus(m.scheduled);
      const label = META.formatDate(m.scheduled) + (m.scheduledTime ? ' ' + m.scheduledTime : '');
      h += `<span class="chip chip-date chip-scheduled ${st}" data-meta="scheduled" title="${esc(tr('Scheduled {d}', { d: m.scheduled + (m.scheduledTime ? ' ' + m.scheduledTime : '') }))}">${ICONS.scheduled}${esc(label)}</span>`;
    } else if (placeholders && !m.deadline) {
      h += `<span class="chip chip-empty" data-meta="scheduled">${ICONS.scheduled}${tr('Scheduled')}</span>`;
    }
    // a main task: how much of it the sub-tasks estimate (∑), see tasks.js
    const split = n.id && MM.tasks ? (MM.tasks.info(n) || {}).split : 0;
    const F = META.formatDuration;
    if (split && (m.estimate === null || m.estimate === undefined)) {
      h += `<span class="chip chip-time chip-calc" data-meta="estimate" title="${esc(tr('Sum of the sub-task estimates (no own estimate)'))}">${ICONS.estimate}${F(split)} ∑</span>`;
    } else if (split && split < m.estimate) {
      h += `<span class="chip chip-time" data-meta="estimate" title="${esc(tr('Estimated {e} - {s} of it split into sub-tasks, {r} not split up yet', { e: F(m.estimate), s: F(split), r: F(m.estimate - split) }))}">` +
        `${ICONS.estimate}${F(m.estimate)} <span class="chip-part">(${F(split)} ∑)</span></span>`;
    } else if (split) {
      h += `<span class="chip chip-time" data-meta="estimate" title="${esc(tr('Estimated {e} - all of it split into sub-tasks', { e: F(m.estimate) }))}">${ICONS.estimate}${F(m.estimate)} ∑</span>`;
    } else if (m.estimate !== null && m.estimate !== undefined) {
      h += `<span class="chip chip-time" data-meta="estimate" title="${esc(tr('Estimated time'))}">${ICONS.estimate}${META.formatDuration(m.estimate)}</span>`;
    } else if (placeholders) {
      h += `<span class="chip chip-empty" data-meta="estimate">${ICONS.estimate}${tr('Estimate')}</span>`;
    }
    // actual time: only when recorded (see actual.js), no placeholder
    if (m.actual !== null && m.actual !== undefined) {
      const est = m.estimateFirst !== null && m.estimateFirst !== undefined ? m.estimateFirst : m.estimate;
      const title = est ? tr('Actual time - estimated {e}', { e: META.formatDuration(est) }) : tr('Actual time');
      h += `<span class="chip chip-time chip-actual" data-meta="actual" title="${esc(title)}">${ICONS.actual}${META.formatDuration(m.actual)}</span>`;
    }
    // only task notes carry an explicit progress value; tasks with sub-tasks a calculated one
    const calc = n.id && MM.tasks ? MM.tasks.info(n) : null;
    if (calc) {
      h += `<span class="chip chip-progress chip-calc" data-meta="progress" title="${esc(tr('Average of {n} sub-task(s)', { n: calc.count }))}">` +
        `${ICONS.percent}${calc.progress} % ∑</span>`;
    } else if (n.type === 'task' || META.hasProgress(m)) {
      if (META.hasProgress(m)) {
        h += `<span class="chip chip-progress" data-meta="progress" title="${esc(tr('Progress'))}">${ICONS.percent}${META.progressLabel(m.progress)}</span>`;
      } else if (placeholders) {
        h += `<span class="chip chip-empty" data-meta="progress">${ICONS.percent}${tr('Progress')}</span>`;
      }
    }
    // routine: its rule ("Every Tue 10:00")
    if (n.repeat && MM.routines) {
      const minutes = n.repeat.kind === 'budget' || n.repeat.kind === 'off' ? m.estimate : 0; // others: the estimate chip shows it
      h += `<span class="chip chip-repeat" data-meta="repeat" title="${esc(tr('Routine – edit the rule in the panel'))}">` +
        `${MM.routines.icon(n.repeat)} ${esc(MM.routines.label(n.repeat, minutes))}</span>`;
    }
    for (const t of n.tags || []) h += META.tagChip(t);
    return h;
  };

  /** Progress value of a meta block, or null. */
  META.hasProgress = (m) => m && m.progress !== null && m.progress !== undefined && !isNaN(m.progress);

  /** Clamp a user entered progress to 0..100 (or null for empty). */
  META.progressValue = function (v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!isFinite(n)) return null;
    return Math.max(0, Math.min(100, Math.round(n)));
  };

  META.progressLabel = (v) => (META.hasProgress({ progress: v }) ? Math.round(v) + ' %' : '0 %');

  /** Small progress bar for task notes and the overview. */
  META.progressBar = (v) => {
    const p = META.hasProgress({ progress: v }) ? Math.max(0, Math.min(100, v)) : 0;
    return `<span class="progress-bar" title="${Math.round(p)} %"><span style="width:${p}%"></span></span>`;
  };

  /**
   * Set one metadata field on notes, keeping status and progress in sync
   * (progress 100 = done, done = 100 %). Used by the panel, the context menu
   * and the chip drop-down of task notes. Does not commit.
   */
  META.setValue = function (nodes, key, value) {
    for (const n of nodes) {
      n.meta[key] = value;
      // deadline and appointment exclude each other
      if (key === 'scheduled') {
        if (value) n.meta.deadline = '';
        else n.meta.scheduledTime = '';
      } else if (key === 'scheduledTime') {
        if (value && !n.meta.scheduled) n.meta.scheduled = META.todayStr();
        if (value) n.meta.deadline = '';
      } else if (key === 'deadline' && value) {
        n.meta.scheduled = '';
        n.meta.scheduledTime = '';
      } else if (key === 'progress') {
        if (value === 100) n.meta.status = 'done';
        else if (value !== null && value > 0 && (!n.meta.status || n.meta.status === 'none' || n.meta.status === 'open')) {
          n.meta.status = 'progress';
        } else if (value === 0 && n.meta.status === 'done') {
          n.meta.status = 'open';
        }
      } else if (key === 'status') {
        delete n.meta.along; // set by hand now, not taken along by its main task (see tasks.js followStatus)
        if (value === 'done') n.meta.progress = 100;
        else if (value === 'dropped') { /* dropped: everything stays as it was */ }
        else if (n.meta.progress === 100) n.meta.progress = 90;
        // deferred: comes some day, no date yet (its sub-tasks follow, see tasks.js)
        if (value === 'deferred') Object.assign(n.meta, { deadline: '', scheduled: '', scheduledTime: '' });
      }
      // a deferred task that gets a date is planned again
      if (['deadline', 'scheduled', 'scheduledTime'].includes(key) && value && n.meta.status === 'deferred') n.meta.status = 'open';
    }
  };

  /**
   * A to-do list is a plain check list (like a shopping list) unless it has an
   * estimate, a deadline, an appointment or a priority / Eisenhower classification.
   * Only then it counts as a task: in the overview and when work is carried over.
   * Lists carried over before they got a deadline stay tasks.
   */
  META.isTaskTodo = (n) => {
    const m = n.meta || {};
    return !!(Number(m.estimate) || m.deadline || m.scheduled ||
      (m.priority && m.priority !== 'none') || (m.quadrant && m.quadrant !== 'none') ||
      (n.tags || []).includes('carried-over'));
  };

  META.hasAny = (n) => {
    const m = n.meta || {};
    return MM.prioOf(m) !== 'none' || (m.status && m.status !== 'none') || !!m.deadline || !!m.scheduled ||
      (m.estimate !== null && m.estimate !== undefined) || META.hasProgress(m) || !!n.repeat ||
      (n.tags && n.tags.length > 0);
  };

  // ---- Filter ----------------------------------------------------------------------

  META.filterActive = function () {
    const f = S.filter;
    return !!(f.text.trim() || f.tags.length || f.priorities.length || f.statuses.length ||
      f.deadline !== 'any' || f.type !== 'any');
  };

  // ---- Visible set (filter + "keep sub-notes") --------------------------------
  // Cached per render because R.nodes() asks for every note. Invalidated by
  // MM.state.rev (bumped in MM.commit) and by the filter object itself.

  let visCache = { key: null, set: null };

  /**
   * Ids of the notes that stay visible with the current filter.
   * With keepChildren, notes reachable from a match (following connections in
   * arrow direction) and notes inside a matching group stay visible too.
   */
  META.visibleSet = function () {
    const key = JSON.stringify([S.filter, S.rev]);
    if (visCache.key === key) return visCache.set;

    const doc = S.doc;
    const nodes = Object.values(doc.nodes);
    const set = new Set();
    for (const n of nodes) if (META.matches(n)) set.add(n.id);

    if (S.filter.keepChildren && META.filterActive()) {
      // outgoing connections: source -> target
      const out = new Map();
      for (const e of Object.values(doc.edges)) {
        const from = e.source && e.source.node;
        const to = e.target && e.target.node;
        if (!from || !to) continue;
        if (!out.has(from)) out.set(from, []);
        out.get(from).push(to);
      }
      const queue = [...set];
      const seen = new Set(set);
      while (queue.length) {
        const id = queue.shift();
        const push = (nid) => {
          if (!nid || seen.has(nid) || !doc.nodes[nid]) return;
          seen.add(nid);
          set.add(nid);
          queue.push(nid);
        };
        for (const t of out.get(id) || []) push(t);
        // notes lying inside a group that is already visible
        const n = doc.nodes[id];
        if (n && n.type === 'group') {
          for (const m of MM.interaction.groupMembers(n)) push(m.id);
        }
      }
    }

    visCache = { key, set };
    return set;
  };

  /** Does note n pass the current filter? */
  META.matches = function (n) {
    const f = S.filter;
    if (f.type !== 'any' && n.type !== f.type) return false;
    const text = f.text.trim().toLowerCase();
    if (text) {
      const hay = [n.text, ...(n.items || []).map((i) => i.text), ...(n.blocks || []).map((b) => b.text), ...(n.tags || [])]
        .join('\n').toLowerCase();
      if (!hay.includes(text)) return false;
    }
    if (f.tags.length) {
      const own = new Set((n.tags || []).map((t) => t.toLowerCase()));
      const want = f.tags.map((t) => t.toLowerCase());
      const ok = f.tagMode === 'all' ? want.every((t) => own.has(t)) : want.some((t) => own.has(t));
      if (!ok) return false;
    }
    const m = n.meta || {};
    if (f.priorities.length && !f.priorities.includes(MM.prioOf(m))) return false;
    if (f.statuses.length && !f.statuses.includes(m.status || 'none')) return false;
    if (f.deadline !== 'any') {
      // finished tasks don't count as due / overdue
      // an appointment counts as the date of the note as well
      const date = m.deadline || m.scheduled;
      const days = MM.notPlanned(m.status) && ['overdue', 'today', 'week'].includes(f.deadline) ? null : META.daysUntil(date);
      switch (f.deadline) {
        case 'overdue': if (!(days !== null && days < 0)) return false; break;
        case 'today': if (!(days !== null && days <= 0)) return false; break;
        case 'week': if (!(days !== null && days <= 7)) return false; break;
        case 'has': if (days === null) return false; break;
        case 'none': if (days !== null) return false; break;
      }
    }
    return true;
  };

  /** Filtered out (dimmed or hidden)? */
  META.filteredOut = function (n) {
    if (!META.filterActive()) return false;
    if (!S.filter.keepChildren) return !META.matches(n);
    return !META.visibleSet().has(n.id);
  };

  /** Number of notes that stay visible with the current filter. */
  META.visibleCount = function () {
    if (!META.filterActive()) return Object.keys(S.doc.nodes).length;
    if (!S.filter.keepChildren) return Object.values(S.doc.nodes).filter(META.matches).length;
    return META.visibleSet().size;
  };

  /** Hidden completely (filter in "hide" mode)? Hidden notes are not interactive. */
  META.isHidden = (n) => S.filter.mode === 'hide' && META.filteredOut(n);
})(window.MM);
