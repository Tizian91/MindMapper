'use strict';
/*
 * Week board (plans/week-board-plan.md): a Scrumban board of one week, as a mode of
 * its own next to the maps - Board | Maps in the toolbar. The maps are the place to
 * think (structure, derive and split up tasks), the board the place to plan.
 *
 *   columns  Backlog | To-Do | Doing | Done
 *   lanes    one per project tag (settings.boardLanes, per project folder), the rest in "Other"
 *
 * The board keeps nothing of its own. It shows what is in the maps:
 *   - Backlog: the open main tasks of all maps (as in the lists "Open tasks" / "Overdue"),
 *     the ones without a deadline folded at the bottom of their lane
 *   - To-Do:   tasks planned for the week (meta.week = 'YYYY-Www'), not started yet;
 *              older weeks stay with "from W46"
 *   - Doing:   status "In progress"
 *   - Done:    finished in that week (meta.doneAt)
 * A main task with sub-tasks is a project: it stays in the backlog, its sub-tasks are
 * the cards that move.
 *
 * Hours: "Soll" = what the workload calculation (workload.js) gives the week for the
 * deadlines, by project; "planned" = what is left of the cards in To-Do and Doing;
 * "available" = the hours of the week after routines, appointments and days off.
 * Planning a card does not change the calculation - otherwise Soll and plan would be
 * the same number and could not be compared.
 *
 * Stage A: the board is shown (cards open their note in the map); planning on it follows.
 */
(function (MM) {
  const S = MM.state;
  const B = (MM.board = {});
  const tr = (s, v) => MM.tr(s, v);
  const esc = (s) => MM.render.esc(s);

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const today = () => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  };
  const keyOf = (path, id) => path + '#' + id;
  const T = () => MM.templates;

  /** 'Other': the lane of cards without a project tag. */
  B.OTHER = '';

  // ---- The model of one week (no DOM, tested in tools/tests/test_board.js) -----------

  /** An open main task of the backlog (as tasklists.js: no appointment, no list, not set aside). */
  function isOpenMain(it) {
    if (it.parent || it.type === 'todo' || MM.notPlanned(it.status)) return false;
    if (it.meta.scheduled && !it.meta.deadline) return false;
    return it.type === 'task' || !!it.meta.deadline || ['open', 'progress', 'blocked'].includes(it.status);
  }

  /** Something that can be a card at all: no to-do list (plan columns), no appointment. */
  const isCardItem = (it) => it.type !== 'todo' && !(it.meta.scheduled && !it.meta.deadline);

  /**
   * The board of the week starting on Monday `mon`.
   *   docs   Map path -> doc (all maps)
   *   opts   { lanes: [tag], sum: workload summary of the same docs (else computed),
   *            today: Date (tests), threshold: minutes (else one work day) }
   * Returns { week, mon, sun, kind: 'past' | 'current' | 'future', lanes: [...], totals, fixed }.
   */
  B.compute = function (docs, mon, opts = {}) {
    const t0 = opts.today || today();
    const sum = opts.sum || MM.load.compute(MM.load.items(docs), MM.routines.collect(docs));
    const model = MM.overview.model(docs);
    const byKey = model.byKey;
    const week = T().weekValue(mon), sun = addDays(mon, 6);
    const thisWeek = T().weekValue(t0);
    const kind = week < thisWeek ? 'past' : week > thisWeek ? 'future' : 'current';
    const monIso = iso(mon), sunIso = iso(sun);
    const threshold = opts.threshold || MM.load.capacity().hours * 60;

    // lanes: the configured project tags in their order, then "Other"
    const lanes = MM.normalizeLanes(opts.lanes || []);
    const laneIdx = new Map(lanes.map((t, i) => [t.toLowerCase(), i]));
    const laneList = lanes.map((tag) => ({ tag, cards: { backlog: [], nodl: [], todo: [], doing: [], done: [] }, soll: 0, plan: 0 }));
    laneList.push({ tag: B.OTHER, cards: { backlog: [], nodl: [], todo: [], doing: [], done: [] }, soll: 0, plan: 0 });
    const other = laneList.length - 1;
    // first matching tag: its own ones first, then those of its main tasks (a step inherits its project)
    const laneOf = (it) => {
      for (let x = it, hop = 0; x && hop < 50; x = x.parent && byKey.get(x.parent), hop++) {
        for (const t of x.tags || []) {
          const i = laneIdx.get(String(t).toLowerCase());
          if (i !== undefined) return i;
        }
      }
      return other;
    };

    const kids = (it) => it.children.map((k) => byKey.get(k)).filter((c) => c && c.status !== 'dropped');
    const isLeaf = (it) => !kids(it).length;
    const open = (it) => !MM.notPlanned(it.status);
    // what is not split up into sub-tasks yet - more than a work day: not thought through
    const notSplit = (it) => open(it) && (isLeaf(it) ? it.open : it.minutes) > threshold;

    const card = (it, extra) => Object.assign({
      key: keyOf(it.path, it.id), path: it.path, id: it.id, title: it.title, map: MM.project ? MM.project.mapName(it.path) : it.path,
      deadline: it.meta.deadline || '', overdue: !!(it.meta.deadline && it.meta.deadline < iso(t0) && open(it)),
      left: isLeaf(it) ? it.open : it.openAll || 0, estimate: !!(Number(it.meta.estimate) || !isLeaf(it)),
      progress: it.shownProgress || 0, status: it.status, week: it.meta.week || '', main: !isLeaf(it),
      notSplit: notSplit(it), parts: 0, from: '', unplanned: false,
    }, extra || {});

    const placed = new Set(); // keys shown in To-Do / Doing
    const add = (col, it, extra) => {
      const c = card(it, extra);
      laneList[laneOf(it)].cards[col].push(c);
      return c;
    };

    for (const it of model.items) {
      if (!isCardItem(it)) continue;
      const m = it.meta;
      // Done: finished in this week (planned or not)
      if (it.status === 'done' && m.doneAt && m.doneAt >= monIso && m.doneAt <= sunIso) {
        add('done', it, { unplanned: !m.week || m.week > week });
        continue;
      }
      if (!isLeaf(it)) continue; // a project: its sub-tasks are the cards that move
      if (kind === 'current' && open(it) && it.status === 'progress') {
        add('doing', it, { from: m.week && m.week < week ? m.week : '' });
        placed.add(keyOf(it.path, it.id));
      } else if (m.week && (kind === 'current' ? open(it) && m.week <= week
        : kind === 'future' ? open(it) && m.week === week
          // a past week: what was planned and is still open, or was only finished later
          : m.week === week && (open(it) || (m.doneAt && m.doneAt > sunIso)))) {
        add('todo', it, { from: kind === 'current' && m.week < week ? m.week : '' });
        placed.add(keyOf(it.path, it.id));
      }
    }

    // Backlog: open main tasks that are not on the week (a past week has none)
    if (kind !== 'past') {
      // planned somewhere: a card of any week, or in progress
      const busy = (it) => isLeaf(it) && open(it) && (!!it.meta.week || it.status === 'progress');
      // the steps of a project: its open sub-tasks without sub-tasks of their own (to plan them)
      const subsOf = (it) => {
        const out = [];
        const walk = (x, hop) => {
          for (const c of kids(x)) {
            if (isLeaf(c)) {
              if (open(c) && isCardItem(c)) out.push(card(c, { planned: placed.has(keyOf(c.path, c.id)) }));
            } else if (hop < 50) walk(c, hop + 1);
          }
        };
        walk(it, 0);
        return out;
      };
      for (const it of model.items) {
        if (!isOpenMain(it) || busy(it)) continue;
        const subs = isLeaf(it) ? [] : subsOf(it);
        add(it.meta.deadline ? 'backlog' : 'nodl', it, { parts: subs.filter((s) => s.planned).length, subs });
      }
    }

    const byDeadline = (a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.title.localeCompare(b.title);
    for (const l of laneList) {
      for (const col of Object.keys(l.cards)) l.cards[col].sort(byDeadline);
      l.plan = l.cards.todo.concat(l.cards.doing).reduce((s, c) => s + (c.left || 0), 0);
    }

    // Soll: the share of this week of every work item (workload.js spread), by lane
    const first = kind === 'current' ? t0 : mon;
    let soll = null;
    if (kind !== 'past') {
      soll = 0;
      const a = iso(first);
      for (const w of sum.items || []) {
        let m = 0;
        for (const p of sum.spread(w)) if (p.day >= a && p.day <= sunIso) m += p.minutes;
        if (!m) continue;
        const it = byKey.get(keyOf(w.path, w.id));
        laneList[it ? laneOf(it) : other].soll += m;
        soll += m;
      }
    } else for (const l of laneList) l.soll = null;

    // available: the hours of the week (from today on) after routines, appointments, days off
    let avail = null, fixedMin = null;
    if (kind !== 'past') {
      avail = 0;
      fixedMin = 0;
      for (let d = first; d <= sun; d = addDays(d, 1)) {
        avail += sum.capOf(d);
        fixedMin += sum.routineOn(d) + sum.apptOn(d);
      }
    }

    const shown = laneList.filter((l, i) => i !== other || i === 0 || Object.values(l.cards).some((c) => c.length));
    const all = (col) => laneList.reduce((s, l) => s.concat(l.cards[col]), []);
    const planned = laneList.reduce((s, l) => s + l.plan, 0);
    const todoDoing = all('todo').concat(all('doing'));
    return {
      week, mon, sun, kind, lanes: shown,
      totals: {
        soll, avail, planned, doing: all('doing').length,
        noEstimate: todoDoing.filter((c) => !c.estimate).length,
        notSplit: todoDoing.filter((c) => c.notSplit).length,
      },
      fixed: fixedOf(docs, mon, sum, t0, fixedMin),
    };
  };

  /**
   * What is fixed in the week: routines (on their days, weekly budgets once), appointments,
   * days off - with their ticks from the plans (routines.js historyIndex) and the done state
   * of appointments. minutes: what they take off the capacity (from today on).
   */
  function fixedOf(docs, mon, sum, t0, minutes) {
    const R = MM.routines, list = sum.routines || R.collect(docs);
    const idx = R.historyIndex(docs);
    const monIso = iso(mon), sunIso = iso(addDays(mon, 6));
    const appts = R.appointments(docs, true).filter((a) => a.date <= sunIso && (a.until || a.date) >= monIso);
    const doneOf = (a) => {
      const doc = docs.get(a.path), n = doc && doc.nodes && doc.nodes[a.id];
      return !!(n && n.meta && n.meta.status === 'done');
    };
    const entries = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(mon, i), k = iso(d);
      const off = R.offOn(list, d);
      if (off) entries.push({ kind: 'off', day: k, title: off.title, full: off.full, minutes: off.full ? 0 : off.minutes });
      if ((off && off.full) || R.allDayOn(appts, k).length) continue; // the meeting takes place without you
      for (const r of list) {
        if (R.isWeekly(r.rule) || r.rule.kind === 'off' || !R.occursOn(r.rule, d)) continue;
        const w = (idx.get(r.id) || new Map()).get(monIso);
        entries.push({ kind: 'routine', day: k, time: r.rule.time || '', title: r.title, minutes: r.minutes, leisure: r.leisure,
          done: !!(w && w.dates.get(k)), path: r.path, id: r.id });
      }
    }
    for (const r of list) {
      if (!R.isWeekly(r.rule) || !R.budgetActive(r.rule, mon)) continue;
      const w = (idx.get(r.id) || new Map()).get(monIso);
      entries.push({ kind: 'budget', title: r.title, minutes: R.perWeek(r.rule, r.minutes), times: r.rule.kind === 'times' ? r.rule.times : 0,
        leisure: r.leisure, ticked: w ? w.ticked : 0, boxes: w ? w.boxes : 0, path: r.path, id: r.id });
    }
    for (const a of appts) {
      entries.push({ kind: 'appt', day: a.date < monIso ? monIso : a.date, date: a.date, until: a.until || a.date, time: a.rule.time || a.begins || '',
        allDay: a.allDay, title: a.title, minutes: a.minutes, done: doneOf(a), path: a.path, id: a.id });
    }
    const order = { off: 0, appt: 1, routine: 2 };
    entries.sort((a, b) => (a.kind === 'budget') - (b.kind === 'budget') || (a.day || '').localeCompare(b.day || '') ||
      (a.time || '99').localeCompare(b.time || '99') || order[a.kind] - order[b.kind] || a.title.localeCompare(b.title));
    return { entries, minutes };
  }

  // ---- Mode: Board | Maps -------------------------------------------------------------

  let shownMon = null; // Monday of the week on the board (null = this week)
  let data = null;
  let loading = null;
  const openNoDl = new Set(); // lanes whose tasks without a deadline are folded out

  B.active = () => document.body.classList.contains('board-mode');
  const ready = () => !!(MM.project && MM.project.status === 'ready');
  const root = () => document.getElementById('board');

  /** Switch between the board and the maps (remembered on this device). */
  B.setMode = function (mode) {
    const board = mode === 'board';
    if (board && !ready()) {
      MM.ui.flash(tr('The board shows the tasks of all maps of a project folder - open a folder first (sidebar "Project").'));
      return;
    }
    if (board === B.active()) {
      if (board) B.reload();
      return;
    }
    if (board) {
      if (MM.editing && MM.edit) MM.edit.finish();
      if (MM.menu && MM.menu.isOpen()) MM.menu.close();
    }
    S.settings.mode = board ? 'board' : 'maps';
    MM.saveSettings();
    document.body.classList.toggle('board-mode', board);
    root().hidden = !board;
    B.updateButtons();
    if (board) B.reload();
    else {
      // the canvas was hidden: its size may have changed meanwhile
      MM.render.applyView();
      MM.refresh();
    }
  };

  /** Toolbar: which mode is on; the board needs a project folder. */
  B.updateButtons = function () {
    const bBtn = document.getElementById('mode-board'), mBtn = document.getElementById('mode-maps');
    if (!bBtn || !mBtn) return;
    if (B.active() && !ready()) { // the folder was closed or lost
      B.setMode('maps');
      return;
    }
    bBtn.classList.toggle('active', B.active());
    mBtn.classList.toggle('active', !B.active());
    bBtn.setAttribute('aria-pressed', String(B.active()));
    mBtn.setAttribute('aria-pressed', String(!B.active()));
    bBtn.classList.toggle('unavailable', !ready());
    bBtn.title = ready() ? tr('Week board: what do I do this week? (tasks of all maps)') : tr('The board needs a project folder (sidebar "Project")');
    mBtn.title = tr('Maps: think, structure, derive and split up tasks');
    bBtn.textContent = tr('Board');
    mBtn.textContent = tr('Maps');
  };

  /** Start: the last mode of this device (the board only with a project folder). */
  B.start = function () {
    B.updateButtons();
    if (S.settings.mode === 'board' && ready()) B.setMode('board');
  };

  /** Read all maps again and draw the board. */
  B.reload = async function () {
    if (!B.active()) return;
    const el = root();
    if (!data) el.innerHTML = `<p class="hint bd-loading">${esc(tr('Reading maps…'))}</p>`;
    el.classList.add('bd-busy');
    const run = (loading = (async () => {
      await MM.project.scan();
      await MM.load.refresh();
    })());
    try {
      await run;
    } catch (e) { /* drawn from what was read */ }
    if (run !== loading) return; // a newer reload is on its way
    el.classList.remove('bd-busy');
    B.render();
  };

  let cards = new Map(); // key -> { card, col } of the board as drawn

  /** Draw the board from the maps as read (no reading). */
  B.render = function () {
    if (!B.active()) return;
    const mon = shownMon || T().mondayOf(today());
    // calculated from the maps as they are now - a change on the board shows at once
    // (the cached workload of the status bar follows with the next reading)
    data = B.compute(MM.load.docs(), mon, { lanes: S.settings.boardLanes });
    cards = new Map();
    for (const l of data.lanes) {
      for (const col of Object.keys(l.cards)) {
        for (const c of l.cards[col]) {
          cards.set(c.key, { card: c, col: col === 'nodl' ? 'backlog' : col });
          for (const s of c.subs || []) if (!cards.has(s.key)) cards.set(s.key, { card: s, col: s.planned ? 'todo' : 'backlog' });
        }
      }
    }
    const el = root();
    const scroll = el.querySelector('.bd-scroll');
    const keep = scroll ? { x: scroll.scrollLeft, y: scroll.scrollTop } : null;
    el.innerHTML = headHTML(data) + fixedHTML(data) + `<div class="bd-scroll">${gridHTML(data)}</div>`;
    if (keep) Object.assign(el.querySelector('.bd-scroll'), { scrollLeft: keep.x, scrollTop: keep.y });
  };

  // ---- Drawing -----------------------------------------------------------------------

  const H = (m) => MM.load.hours(m || 0);
  const shortDate = (s) => {
    const d = parse(s);
    return d ? d.toLocaleDateString(MM.locale(), { day: 'numeric', month: 'short' }) : '';
  };
  const weekdayOf = (s) => {
    const d = parse(s);
    return d ? d.toLocaleDateString(MM.locale(), { weekday: 'short' }) : '';
  };
  /** "W46" / "KW 46" of 'YYYY-Www' */
  const weekShort = (w) => tr('Week {n}', { n: +String(w).slice(6) });

  /** green / yellow / red: planned against available (as the bars of the workload page) */
  function loadClass(plan, avail) {
    if (avail === null) return '';
    if (plan > avail + 0.5) return 'bd-over';
    if (plan > avail * 0.85) return 'bd-tight';
    return 'bd-ok';
  }
  /** Doing: 1 is fine, 2 is borderline, 3 or more: attention */
  const doingClass = (n) => (n >= 3 ? 'bd-over' : n === 2 ? 'bd-tight' : n === 1 ? 'bd-ok' : '');

  function headHTML(d) {
    const label = `${weekShort(d.week)} · ${shortDate(iso(d.mon))} – ${shortDate(iso(d.sun))}`;
    const kindLabel = d.kind === 'current' ? tr('this week') : d.kind === 'past' ? tr('past - only to look at') : tr('ahead');
    const t = d.totals;
    const sums = d.kind === 'past' ? '' : `<span class="bd-total ${loadClass(t.planned, t.avail)}" title="${esc(tr('Planned: what is left of the cards in To-Do and Doing.\nAvailable: the hours of the week (from today on) after routines, appointments and days off.'))}">${esc(tr('planned {p} / {a} available', { p: H(t.planned), a: H(t.avail) }))}</span>
      <span class="bd-soll" title="${esc(tr('Soll: what the deadlines need this week - the workload calculation, spread evenly up to each deadline. Planning cards does not change it.'))}">${esc(tr('Soll {h}', { h: H(t.soll) }))}</span>`;
    return `<div class="bd-head">
      <div class="bd-nav">
        <button type="button" data-bd-week="-1" title="${esc(tr('Previous week'))}" aria-label="${esc(tr('Previous week'))}">‹</button>
        <button type="button" data-bd-week="0" class="bd-week" title="${esc(tr('Back to this week'))}">${esc(label)}</button>
        <button type="button" data-bd-week="1" title="${esc(tr('Next week'))}" aria-label="${esc(tr('Next week'))}">›</button>
        <span class="bd-kind">${esc(kindLabel)}</span>
      </div>
      <div class="bd-sums">${sums}</div>
      <div class="bd-actions">
        <button type="button" data-bd-plan title="${esc(tr('Open the week plan of this week in the maps'))}">${esc(tr('Week plan ↗'))}</button>
        <button type="button" data-bd-lanes title="${esc(tr('Which tags are projects (one lane each)'))}">${esc(tr('Lanes…'))}</button>
        <button type="button" data-bd-reload title="${esc(tr('Read all maps again'))}" aria-label="${esc(tr('Read all maps again'))}">↻</button>
      </div>
    </div>`;
  }

  function fixedHTML(d) {
    const f = d.fixed;
    const todayIso = iso(today());
    // a box to check off: what took place (today or before); not ahead of time
    const tick = (e, i) => {
      const can = (e.kind === 'appt' ? e.date : e.day) <= todayIso;
      return can ? `<button type="button" class="bd-tick" data-bd-tick="${i}" role="checkbox" aria-checked="${!!e.done}" title="${esc(tr(e.done ? 'Open again' : 'Check off'))}">${e.done ? '☑' : '☐'}</button>`
        : `<span class="bd-tick off" title="${esc(tr('Not yet - it has not taken place'))}">☐</span>`;
    };
    const open = (e) => `data-bd-open="${esc(e.path)}" data-bd-id="${esc(e.id)}" title="${esc(tr('Open the note in its map'))}"`;
    const chip = (e, i) => {
      const day = e.day ? `<b>${esc(weekdayOf(e.day))}</b> ` : '';
      const past = e.day && (e.until || e.day) < todayIso ? ' past' : ''; // a day of this week that is over
      const dur = e.minutes ? ' · ' + esc(MM.meta.formatDuration(e.minutes)) : '';
      if (e.kind === 'off') return `<span class="bd-fx bd-fx-off${past}">${day}🏖 ${esc(e.title)}${e.full ? '' : dur}</span>`;
      if (e.kind === 'appt') {
        const when = e.allDay ? (e.until > e.date ? `${esc(shortDate(e.date))} – ${esc(shortDate(e.until))}` : esc(tr('all day'))) : esc(e.time);
        return `<span class="bd-fx${past}${e.done ? ' done' : ''}">${day}${tick(e, i)}<span class="bd-fx-t" ${open(e)}>📌 ${esc(e.title)} ${when}${e.allDay ? '' : dur}</span></span>`;
      }
      if (e.kind === 'routine') {
        return `<span class="bd-fx${past}${e.done ? ' done' : ''}${e.leisure ? ' leisure' : ''}">${day}${tick(e, i)}<span class="bd-fx-t" ${open(e)}>🔁 ${esc(e.title)}${e.time ? ' ' + esc(e.time) : ''}${dur}</span></span>`;
      }
      // a weekly budget / "n times per week": its boxes as ticked on the week plan, one click each
      const n = e.boxes || e.times || 1;
      const can = d.kind !== 'future' && (d.kind === 'current' || e.boxes > 0);
      const boxes = Array.from({ length: n }, (x, k) => (can
        ? `<button type="button" class="bd-tick" data-bd-box="${i}:${k}" role="checkbox" aria-checked="${k < e.ticked}">${k < e.ticked ? '☑' : '☐'}</button>`
        : `<span class="bd-tick off">${k < e.ticked ? '☑' : '☐'}</span>`)).join('');
      return `<span class="bd-fx${past}${e.leisure ? ' leisure' : ''}"><span class="bd-fx-t" ${open(e)}>🔁 ${esc(e.title)} ${esc(MM.routines.label(e.times ? { kind: 'times', times: e.times } : { kind: 'budget' }, e.times ? 0 : e.minutes))}</span> ${boxes}</span>`;
    };
    const head = `<span class="bd-fx-head" title="${esc(tr('Routines, appointments and days off of this week. They take their time off the capacity before any project work - that is why less than the hours of the week is available. Ticked off in the week plan.'))}">${esc(d.kind === 'current' ? tr('Fixed this week') : tr('Fixed in {w}', { w: weekShort(d.week) }))}${f.minutes ? ' · ' + esc(H(f.minutes)) : ''}</span>`;
    return `<div class="bd-fixed">${head}${f.entries.length ? f.entries.map((e, i) => chip(e, i)).join('') : `<span class="hint">${esc(tr('nothing'))}</span>`}</div>`;
  }

  function cardHTML(c, col) {
    const meta = [];
    if (c.deadline) meta.push(`<span class="${c.overdue ? 'bd-late' : ''}">📅 ${esc(shortDate(c.deadline))}</span>`);
    if (c.left) meta.push(`<span>⏱ ${esc(H(c.left))}</span>`);
    else if (!c.estimate && col !== 'done') meta.push(`<span class="bd-noest">${esc(tr('no estimate'))}</span>`);
    if (c.progress && col !== 'done') meta.push(`<span>${Math.round(c.progress)} %${c.main ? ' ∑' : ''}</span>`);
    const marks = [];
    if (c.from) marks.push(`<span class="bd-mark" title="${esc(tr('Planned for an earlier week and not done yet'))}">${esc(tr('from {w}', { w: weekShort(c.from) }))}</span>`);
    if (c.unplanned) marks.push(`<span class="bd-mark bd-mark-soft">${esc(tr('unplanned'))}</span>`);
    if (c.parts) marks.push(`<span class="bd-mark bd-mark-soft">${esc(tr('{n} part(s) this week', { n: c.parts }))}</span>`);
    if (c.notSplit && col !== 'done') {
      marks.push(`<span class="bd-mark bd-mark-warn" title="${esc(tr('More than a work day that is not split up into sub-tasks - plan the steps in the map first.'))}">${esc(tr('✂ not split up'))}</span>`);
    }
    // a step can be dragged into another column (not in a past week); a project is planned by its steps
    const drag = !c.main && data && data.kind !== 'past';
    return `<div class="bd-card${c.overdue ? ' overdue' : ''}${col === 'done' ? ' done' : ''}${c.main ? ' main' : ''}" data-bd-card="${esc(c.key)}" tabindex="0"${drag ? ' draggable="true"' : ''} title="${esc(tr(c.main ? 'Click: plan its sub-tasks or open it in the map' : drag ? 'Drag into another column, or click: move / open in the map' : 'Click: open in the map'))}">
      <div class="bd-title">${esc(c.title)}</div>
      ${meta.length ? `<div class="bd-meta">${meta.join('')}</div>` : ''}
      ${marks.length ? `<div class="bd-marks">${marks.join('')}</div>` : ''}
      <div class="bd-map">${esc(c.map)}</div>
    </div>`;
  }

  function gridHTML(d) {
    const t = d.totals;
    const past = d.kind === 'past';
    const heads = [
      `<div class="bd-colhead">${esc(tr('Backlog'))}</div>`,
      `<div class="bd-colhead">${esc(tr('To-Do'))}${past ? '' : ` <span class="bd-badge ${loadClass(t.planned, t.avail)}">${esc(H(t.planned))} / ${esc(H(t.avail))}</span>`}` +
        (t.noEstimate ? `<div class="bd-colnote">${esc(tr('{n} without estimate - not counted', { n: t.noEstimate }))}</div>` : '') + '</div>',
      `<div class="bd-colhead">${esc(tr('Doing'))}${d.kind === 'current' ? ` <span class="bd-badge ${doingClass(t.doing)}" title="${esc(tr('Cards in progress at the same time: 1 fine, 2 borderline, 3 or more: attention'))}">${t.doing}</span>` : ''}</div>`,
      `<div class="bd-colhead">${esc(tr('Done'))}</div>`,
    ];
    let html = `<div class="bd-grid"><div class="bd-corner"></div>${heads.join('')}`;
    d.lanes.forEach((l, i) => {
      const name = l.tag === B.OTHER ? (d.lanes.length === 1 ? tr('All tasks') : tr('Other')) : l.tag;
      const nums = past ? '' : `<div class="bd-lanenums"><span title="${esc(tr('Soll: what the deadlines need this week'))}">${esc(tr('Soll {h}', { h: H(l.soll) }))}</span><span>${esc(tr('planned {h}', { h: H(l.plan) }))}</span></div>`;
      html += `<div class="bd-lanehead">${esc(name)}${nums}</div>`;
      const laneKey = l.tag.toLowerCase() || '\u0000';
      const nodl = l.cards.nodl.length ? `<button type="button" class="bd-nodl" data-bd-nodl="${esc(laneKey)}" aria-expanded="${openNoDl.has(laneKey)}">${openNoDl.has(laneKey) ? '▾' : '▸'} ${esc(tr('{n} without deadline', { n: l.cards.nodl.length }))}</button>` +
        (openNoDl.has(laneKey) ? l.cards.nodl.map((c) => cardHTML(c, 'backlog')).join('') : '') : '';
      html += `<div class="bd-cell" data-lane="${i}" data-col="backlog">${l.cards.backlog.map((c) => cardHTML(c, 'backlog')).join('')}${nodl}</div>`;
      for (const col of ['todo', 'doing', 'done']) html += `<div class="bd-cell" data-lane="${i}" data-col="${col}">${l.cards[col].map((c) => cardHTML(c, col)).join('')}</div>`;
    });
    html += '</div>';
    if (!S.settings.boardLanes || !S.settings.boardLanes.length) {
      html += `<p class="hint bd-hint">${esc(tr('Tip: "Lanes…" makes tags into projects - one lane each.'))}</p>`;
    }
    return html;
  }

  // ---- Clicks ------------------------------------------------------------------------

  /** Open a note in its map (switches to the maps). */
  async function openNote(path, id) {
    B.setMode('maps');
    if ((await MM.project.openMap(path)) && id) MM.actions.focusNode(id);
  }

  /** The week plan of the week shown: wherever it is in the folder, else Weeks/2026-W47 (created). */
  async function openWeekPlan() {
    const mon = shownMon || T().mondayOf(today());
    const file = T().weekValue(mon) + '.mindmap.json';
    let path = MM.project.mapPaths().find((p) => p.split('/').pop() === file);
    if (!path) {
      if (data && data.kind === 'past') {
        MM.ui.flash(tr('There is no week plan of {w}', { w: weekShort(T().weekValue(mon)) }));
        return;
      }
      path = await MM.project.ensureMap(T().weekPath(mon)); // the board keeps the week plan in the background
    }
    await openNote(path, null);
  }

  // ---- Planning on the board: moving cards ---------------------------------------------
  //
  // A card is a note in its map. Moving it changes that note: the open map in one undo
  // step of its own, another map in the board's copy at once (drawn right away) and in
  // its file a moment later (project.js P.later - several moves in a row write the file
  // once, as checking off from a plan's list does). Ctrl+Z on the board takes the last
  // move back.

  /** Which columns a card may go to in the week shown (a past week is only looked at). */
  const targets = () => (!data || data.kind === 'past' ? [] : data.kind === 'future' ? ['backlog', 'todo'] : ['backlog', 'todo', 'doing', 'done']);

  /**
   * Set note n for column col of week `week` (no saving). other: n is in another map than
   * the open one - then do here what MM.commit does for the open map (actual.js): the day
   * it was finished, the first estimate, the stopwatch. Returns true if it was checked off now.
   */
  B.applyMove = function (n, col, week, other) {
    const m = (n.meta = Object.assign(MM.emptyMeta(), n.meta || {}));
    const wasDone = m.status === 'done';
    const begun = m.status === 'progress' || wasDone || Number(m.progress) > 0;
    const reopen = () => {
      if (m.status === 'done' || m.status === 'progress') m.status = 'open';
      if (m.progress === 100) m.progress = null;
    };
    if (col === 'backlog') {
      delete m.week;
      reopen();
    } else if (col === 'todo') {
      m.week = week;
      reopen();
    } else if (col === 'doing') {
      m.status = 'progress';
      if (m.progress === 100) m.progress = null;
      if (!m.week) m.week = week;
    } else if (col === 'done') {
      m.status = 'done';
      if (n.type === 'task') m.progress = 100;
    }
    const doneNow = m.status === 'done' && !wasDone;
    if (other) {
      if (doneNow) MM.actual.checkedOff(n); // the day, the first estimate, the stopwatch stops
      else if (m.status !== 'done' && m.doneAt) delete m.doneAt;
      if (m.status === 'progress' && !begun && m.estimateFirst == null && m.estimate != null) m.estimateFirst = m.estimate;
    }
    return doneNow;
  };

  const undoStack = []; // [{ label, undo: async () => {} }]
  const clone = (v) => JSON.parse(JSON.stringify(v));

  /**
   * Change note `id` of map `path` with fn(node, other): the open map in one undo step,
   * another map in the board's copy and (a moment later) in its file.
   * Returns { node } as changed here (null if it is not there).
   */
  function editNote(path, id, fn) {
    if (path === S.file.path) {
      const n = S.doc.nodes[id];
      if (!n) return null;
      fn(n, false);
      MM.commit();
      return { node: n };
    }
    const cached = MM.load.docs().get(path);
    const n = cached && cached.nodes && cached.nodes[id];
    if (!n) return null;
    fn(n, true);
    MM.project.later(path, (doc) => { if (doc.nodes[id]) fn(doc.nodes[id], true); });
    return { node: n };
  }

  /** Move card c into column col (with the question for a task not split up). */
  async function move(c, col) {
    const from = cards.get(c.key);
    if (!targets().includes(col) || (from && from.col === col)) return;
    if (c.main) return MM.ui.flash(tr('A project is planned by its sub-tasks'));
    if (c.notSplit && (col === 'todo' || col === 'doing') && from && from.col === 'backlog') {
      const answer = await askSplit(c);
      if (answer === 'split') return openNote(c.path, c.id);
      if (answer !== 'anyway') return;
    }
    const week = data.week;
    let before = null, ask = null;
    const r = editNote(c.path, c.id, (n, other) => {
      if (!before) before = clone(n.meta || {});
      const doneNow = B.applyMove(n, col, week, other);
      if (doneNow && other && !ask && MM.actual.askable(n)) ask = n;
    });
    if (!r) {
      MM.ui.flash(tr('The note of this card was not found - read the maps again (↻)'));
      return;
    }
    if (ask) MM.actual.askFor([{ path: c.path, node: ask }]); // how long did it take? (the open map asks itself)
    const label = c.title;
    undoStack.push({
      label,
      undo: async () => editNote(c.path, c.id, (n) => { n.meta = clone(before); }),
    });
    MM.load.scheduleRefresh(); // the status bar follows
    MM.tasks.refreshExternal();
    B.render();
    MM.ui.flash(tr('"{t}" → {col} (undo: Ctrl+Z)', { t: label, col: tr(COLS[col]) }));
  }
  const COLS = { backlog: 'Backlog', todo: 'To-Do', doing: 'Doing', done: 'Done' };

  /** Ctrl+Z on the board: the last move / check back. */
  B.undo = async function () {
    const step = undoStack.pop();
    if (!step) return MM.ui.flash(tr('Nothing to undo on the board'));
    await step.undo();
    MM.load.scheduleRefresh();
    MM.tasks.refreshExternal();
    B.render();
    MM.ui.flash(tr('Undone: {t}', { t: step.label }));
  };

  // ---- "Not split up": plan the steps first ------------------------------------------

  let splitDialog = null;
  /** 'split' | 'anyway' | 'cancel' */
  function askSplit(c) {
    if (!splitDialog) {
      splitDialog = document.createElement('dialog');
      splitDialog.className = 'bd-split-dialog';
      document.body.appendChild(splitDialog);
      splitDialog.addEventListener('keydown', (e) => e.stopPropagation());
    }
    splitDialog.innerHTML = `<h3>${esc(tr('✂ not split up'))}</h3>
      <p>${esc(tr('"{t}" has {h} that are not split up into sub-tasks. Plan the steps first.', { t: c.title, h: H(c.left) }))}</p>
      <div class="bd-split-btns">
        <button type="button" value="split" class="primary">${esc(tr('Split up in the map ↗'))}</button>
        <button type="button" value="anyway">${esc(tr('Plan it anyway'))}</button>
        <button type="button" value="cancel">${esc(tr('Cancel'))}</button>
      </div>`;
    return new Promise((resolve) => {
      const done = (v) => {
        splitDialog.onclick = null;
        splitDialog.onclose = null;
        if (splitDialog.open) splitDialog.close();
        resolve(v);
      };
      splitDialog.onclick = (e) => {
        const b = e.target.closest('button[value]');
        if (b) done(b.value);
        else if (e.target === splitDialog) done('cancel');
      };
      splitDialog.onclose = () => done('cancel');
      splitDialog.showModal();
      splitDialog.querySelector('button[value="split"]').focus();
    });
  }

  // ---- Menu of a card (click / tap; on touch screens the way to move) --------------------

  function cardMenu(c, x, y) {
    const here = (cards.get(c.key) || {}).col;
    const list = [];
    if (c.main) {
      // a project: its steps for this week (those already planned are ticked: click = back)
      const subs = c.subs || [];
      if (targets().includes('todo') && subs.length) {
        list.push({ label: tr('Plan sub-tasks for {w}:', { w: weekShort(data.week) }), disabled: true });
        for (const s of subs) {
          list.push({
            label: s.title + (s.left ? ' · ' + H(s.left) : '') + (s.notSplit ? ' ✂' : ''), checked: s.planned,
            action: () => move(s, s.planned ? 'backlog' : 'todo'),
          });
        }
        list.push('-');
      } else if (!subs.length) {
        list.push({ label: tr('No open sub-tasks'), disabled: true }, '-');
      }
    } else {
      for (const col of targets()) {
        if (col === here) continue;
        list.push({ label: tr('→ {col}', { col: tr(COLS[col]) }), action: () => move(c, col) });
      }
      if (list.length) list.push('-');
    }
    list.push({ label: tr('Open in the map ↗'), action: () => openNote(c.path, c.id) });
    MM.menu.open(list, x, y);
  }

  // ---- Checking off in "Fixed this week" ------------------------------------------------

  /** The week plan of the week shown (made when it is missing - the board keeps it in the background). */
  async function weekPlanPath(make) {
    const mon = data.mon;
    const file = T().weekValue(mon) + '.mindmap.json';
    let path = MM.project.mapPaths().find((p) => p.split('/').pop() === file);
    if (!path && make) {
      path = await MM.project.ensureMap(T().weekPath(mon));
      await MM.load.refresh();
    }
    return path || null;
  }

  /** Routine (on its day) or appointment: checked off where it is listed - week / day plan, the appointment note. */
  async function toggleFixed(e) {
    const done = !e.done;
    const c = { id: e.id, date: e.kind === 'appt' ? e.date : e.day, done };
    if (e.kind === 'routine') await weekPlanPath(true); // the entry lives in the week plan
    await MM.routines.setDone([c]);
    await MM.load.refresh();
    undoStack.push({ label: e.title, undo: async () => { await MM.routines.setDone([Object.assign({}, c, { done: !done })]); await MM.load.refresh(); } });
    B.render();
    const now = data.fixed.entries.find((x) => x.id === e.id && x.kind === e.kind && (x.day === e.day));
    if (now && now.done !== done) MM.ui.flash(tr('The week plan has no entry for this yet - open it once (Week plan ↗), then check it off.'));
    else MM.ui.flash(tr(done ? 'Checked off: {t}' : 'Open again: {t}', { t: e.title }));
  }

  /** A box of a weekly budget / "n times per week": the first k boxes of the week plan's list are checked. */
  async function setBoxes(e, k) {
    const path = await weekPlanPath(data.kind === 'current');
    if (!path) return MM.ui.flash(tr('There is no week plan of {w}', { w: weekShort(data.week) }));
    // the lists of the routines without fixed days (routines.js routineLists)
    const apply = (doc, count) => {
      let changed = false, i = 0;
      for (const n of Object.values(doc.nodes || {})) {
        const isList = n.type === 'todo' && (n.routineList !== undefined || (n.text === 'Routines this week' && !(n.meta && n.meta.deadline)));
        if (!isList) continue;
        for (const it of n.items || []) {
          if (it.routine !== e.id) continue;
          const want = i++ < count;
          if (!!it.done !== want) {
            it.done = want;
            changed = true;
          }
        }
      }
      return changed;
    };
    const set = (count) => {
      if (path === S.file.path) {
        if (apply(S.doc, count)) MM.commit();
        return;
      }
      const cached = MM.load.docs().get(path);
      if (cached) apply(cached, count);
      MM.project.later(path, (doc) => { apply(doc, count); });
    };
    const before = e.ticked;
    set(k);
    undoStack.push({ label: e.title, undo: async () => set(before) });
    MM.load.scheduleRefresh();
    B.render();
  }

  function onClick(e) {
    const t = e.target;
    const tk = t.closest('[data-bd-tick]');
    if (tk) {
      const entry = data.fixed.entries[+tk.dataset.bdTick];
      if (entry) toggleFixed(entry);
      return;
    }
    const bx = t.closest('[data-bd-box]');
    if (bx) {
      const [i, k] = bx.dataset.bdBox.split(':').map(Number);
      const entry = data.fixed.entries[i];
      // a click on a checked box takes it (and the ones after it) back, on an open one checks up to it
      if (entry) setBoxes(entry, k < entry.ticked ? k : k + 1);
      return;
    }
    const cd = t.closest('[data-bd-card]');
    if (cd) {
      const hit = cards.get(cd.dataset.bdCard);
      if (!hit) return;
      if (data.kind === 'past') return openNote(hit.card.path, hit.card.id);
      const r = cd.getBoundingClientRect();
      cardMenu(hit.card, e.clientX || r.left + 12, e.clientY || r.bottom);
      return;
    }
    const wk = t.closest('[data-bd-week]');
    if (wk) {
      const step = +wk.dataset.bdWeek;
      shownMon = step ? addDays(shownMon || T().mondayOf(today()), 7 * step) : null;
      if (shownMon && iso(shownMon) === iso(T().mondayOf(today()))) shownMon = null;
      B.render();
      return;
    }
    const nd = t.closest('[data-bd-nodl]');
    if (nd) {
      const k = nd.dataset.bdNodl;
      if (openNoDl.has(k)) openNoDl.delete(k);
      else openNoDl.add(k);
      B.render();
      return;
    }
    if (t.closest('[data-bd-reload]')) return B.reload();
    if (t.closest('[data-bd-lanes]')) return showLanes();
    if (t.closest('[data-bd-plan]')) return openWeekPlan();
    const o = t.closest('[data-bd-open]');
    if (o) openNote(o.dataset.bdOpen, o.dataset.bdId || null);
  }

  // ---- Lanes: which tags are projects -----------------------------------------------------

  let lanesDialog = null;
  function showLanes() {
    if (!lanesDialog) {
      lanesDialog = document.createElement('dialog');
      lanesDialog.id = 'board-lanes';
      lanesDialog.className = 'bd-lanes-dialog';
      document.body.appendChild(lanesDialog);
      lanesDialog.addEventListener('keydown', (e) => e.stopPropagation());
      lanesDialog.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (e.target === lanesDialog) return lanesDialog.close();
        if (!b) return;
        const lanes = MM.normalizeLanes(S.settings.boardLanes);
        const i = +b.dataset.i;
        if (b.dataset.act === 'up' && i > 0) [lanes[i - 1], lanes[i]] = [lanes[i], lanes[i - 1]];
        else if (b.dataset.act === 'down' && i < lanes.length - 1) [lanes[i + 1], lanes[i]] = [lanes[i], lanes[i + 1]];
        else if (b.dataset.act === 'del') lanes.splice(i, 1);
        else if (b.dataset.act === 'add') {
          const inp = lanesDialog.querySelector('input');
          lanes.push(inp.value);
          inp.value = '';
        } else if (b.dataset.act === 'close') return lanesDialog.close();
        else return;
        saveLanes(lanes);
      });
      lanesDialog.addEventListener('submit', (e) => e.preventDefault());
      lanesDialog.addEventListener('change', (e) => {
        if (e.target.matches('input[list]') && e.target.value.trim()) lanesDialog.querySelector('[data-act="add"]').click();
      });
      lanesDialog.addEventListener('close', () => B.render());
    }
    drawLanes();
    lanesDialog.showModal();
    lanesDialog.querySelector('input').focus();
  }

  function saveLanes(lanes) {
    S.settings.boardLanes = MM.normalizeLanes(lanes);
    MM.saveSettings();
    MM.storage.saveProjectSettings();
    drawLanes();
    lanesDialog.querySelector('input').focus();
  }

  function drawLanes() {
    const lanes = MM.normalizeLanes(S.settings.boardLanes);
    const used = new Set(lanes.map((t) => t.toLowerCase()));
    const tags = MM.meta.projectTags().filter((t) => !used.has(t.tag.toLowerCase()));
    lanesDialog.innerHTML = `<h3>${esc(tr('Lanes of the board'))}</h3>
      <p class="hint">${esc(tr('Each tag here is a project with a lane of its own, in this order. A card goes into the lane of its first tag in this list (a sub-task without one: that of its main task); all others into "Other". Stored {where}.', { where: MM.storage.capacityLocation() }))}</p>
      <ol class="bd-lane-list">${lanes.map((t, i) => `<li><span>${esc(t)}</span>
        <button type="button" data-act="up" data-i="${i}" ${i ? '' : 'disabled'} aria-label="${esc(tr('Up'))}">↑</button>
        <button type="button" data-act="down" data-i="${i}" ${i < lanes.length - 1 ? '' : 'disabled'} aria-label="${esc(tr('Down'))}">↓</button>
        <button type="button" data-act="del" data-i="${i}" aria-label="${esc(tr('Remove'))}">×</button></li>`).join('') ||
        `<li class="hint">${esc(tr('No lanes yet - all tasks are in one lane.'))}</li>`}</ol>
      <div class="bd-lane-add"><input type="text" list="bd-lane-tags" placeholder="${esc(tr('Tag…'))}" maxlength="60">
        <button type="button" data-act="add">${esc(tr('Add'))}</button></div>
      <datalist id="bd-lane-tags">${tags.map((t) => `<option value="${esc(t.tag)}">${esc(t.tag)} · ${t.count}×</option>`).join('')}</datalist>
      <div class="bd-lane-foot"><button type="button" data-act="close">${esc(tr('Close'))}</button></div>`;
  }

  // ---- Planning from the map (context menu "Week board") ------------------------------

  /** 'YYYY-Www' of this week (0), the next one (1) … */
  B.weekOf = (offset) => T().weekValue(addDays(T().mondayOf(today()), 7 * (offset || 0)));

  /** Tasks that can be planned for a week: no routine, no appointment, not done / set aside. */
  B.plannable = (nodes) => nodes.length > 0 && nodes.every((n) => n.type === 'task' && !n.repeat && !n.movedTo &&
    !(n.meta && n.meta.scheduled) && !MM.notPlanned(n.meta && n.meta.status));

  /** Does one of them have sub-tasks in this map (arrow to a task)? A project is planned by its steps. */
  B.hasSubTasks = (nodes) => {
    const ids = new Set(nodes.map((n) => n.id));
    return Object.values(S.doc.edges || {}).some((e) => e.source && ids.has(e.source.node) && e.target &&
      S.doc.nodes[e.target.node] && S.doc.nodes[e.target.node].type === 'task' && e.target.node !== e.source.node) ||
      nodes.some((n) => !!n.derivedMap);
  };

  /** Plan the notes for this week + offset, or take them back into the backlog (offset null). */
  B.planWeek = async function (nodes, offset) {
    const w = offset === null ? '' : B.weekOf(offset);
    // more than a work day not split up: plan the steps first (see the board)
    const left = (n) => (Number(n.meta.estimate) || 0) * (1 - (Number(n.meta.progress) || 0) / 100);
    const big = w ? nodes.find((n) => n.meta.week !== w && left(n) > MM.load.capacity().hours * 60) : null;
    if (big) {
      const answer = await askSplit({ title: (big.text || '').split('\n')[0], left: left(big) });
      if (answer === 'split') return MM.actions.focusNode(big.id);
      if (answer !== 'anyway') return;
    }
    for (const n of nodes) {
      if (w) n.meta.week = w;
      else delete n.meta.week;
    }
    MM.commit();
    MM.ui.flash(w ? tr('Planned for {w}', { w: weekShort(w) }) : tr('Back in the backlog'));
  };

  // ---- Setup -------------------------------------------------------------------------

  B.init = function () {
    const el = root();
    if (!el) return;
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.bd-card')) {
        e.preventDefault();
        e.target.click();
      }
    });
    // dragging a card into another column (mouse; on touch screens the card's menu does it)
    let dragKey = null;
    const cellOf = (e) => e.target.closest && e.target.closest('.bd-cell[data-col]');
    const clearDrop = () => el.querySelectorAll('.bd-drop').forEach((x) => x.classList.remove('bd-drop'));
    el.addEventListener('dragstart', (e) => {
      const cd = e.target.closest && e.target.closest('[data-bd-card][draggable="true"]');
      if (!cd) return;
      dragKey = cd.dataset.bdCard;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragKey);
      cd.classList.add('bd-dragging');
    });
    el.addEventListener('dragover', (e) => {
      const cell = cellOf(e);
      if (!dragKey || !cell || !targets().includes(cell.dataset.col)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!cell.classList.contains('bd-drop')) {
        clearDrop();
        cell.classList.add('bd-drop');
      }
    });
    el.addEventListener('dragleave', (e) => {
      if (e.target.classList && e.target.classList.contains('bd-drop') && !e.target.contains(e.relatedTarget)) e.target.classList.remove('bd-drop');
    });
    el.addEventListener('drop', (e) => {
      const cell = cellOf(e);
      const hit = dragKey && cards.get(dragKey);
      clearDrop();
      dragKey = null;
      if (!cell || !hit) return;
      e.preventDefault();
      e.stopPropagation(); // not a file for the map (interaction.js)
      move(hit.card, cell.dataset.col);
    });
    el.addEventListener('dragend', () => {
      dragKey = null;
      clearDrop();
      el.querySelectorAll('.bd-dragging').forEach((x) => x.classList.remove('bd-dragging'));
    });
    // Ctrl+Z on the board: its last move (the keys of the hidden map are off, interaction.js)
    window.addEventListener('keydown', (e) => {
      if (!B.active() || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
      e.preventDefault();
      B.undo();
    });
    // back in the app: the maps may have changed elsewhere (other device, other window)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && B.active()) B.reload();
    });
  };

  MM.actions.setMode = (mode) => B.setMode(mode);
})(window.MM);
