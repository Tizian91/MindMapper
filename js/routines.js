'use strict';
/*
 * Routines: recurring notes such as a weekly meeting or a weekly time budget
 * for supervising students. Any note can get a rule (node.repeat, see
 * MM.normalizeRepeat in state.js); a map "Routines" in the project folder is
 * the natural place to keep them, but rules in other maps count as well.
 * The duration of one occurrence (or the hours per week of a budget) is the
 * note's estimate.
 *
 * Categories (settings.routineCategories, per project folder): a routine can
 * belong to one, e.g. "Band practice". A leisure category takes no time off the
 * capacity - the routine is still listed and checked off (motivation, not workload).
 *
 * Effects:
 *   - workload.js takes the routines' time off the capacity of each day (not leisure ones)
 *   - new day / week plans get the occurrences as to-do entries (item.routine = note id)
 *     in the matching day column (week) or morning / afternoon / evening (day);
 *     carry-over skips these entries, a missed meeting is not carried along
 *   - the workload page of the overview lists them
 */
(function (MM) {
  const R = (MM.routines = {});
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const NTH = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', '-1': 'last' };
  const ANCHOR = new Date(2026, 0, 5); // a Monday: "every n weeks" counts from here unless a start date is set

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

  R.WEEKDAYS = WEEKDAYS;
  R.NTH = NTH;

  /** Default rule for a new routine of `kind` (today's weekday, every week; days off: today). */
  R.defaults = (kind) => MM.normalizeRepeat({
    kind, every: 1, days: [new Date().getDay()], day: new Date().getDate(), nth: 1, weekday: new Date().getDay(),
    from: kind === 'off' ? iso(new Date()) : '', until: kind === 'off' ? iso(new Date()) : '',
  });

  /** Icon of a rule: 🏖 for days off, 🔁 for everything else. */
  R.icon = (rule) => (rule && rule.kind === 'off' ? '🏖' : '🔁');

  // ---- Categories -----------------------------------------------------------------

  R.categories = () => MM.state.settings.routineCategories || [];
  R.category = (id) => (id ? R.categories().find((c) => c.id === id) || null : null);
  /** Does the rule belong to a leisure category (no time off the capacity)? */
  R.isLeisure = (rule) => !!(rule && R.category(rule.category) && R.category(rule.category).leisure);
  /** "🥁 Band practice" */
  R.categoryTitle = (c) => (c ? (c.emoji ? c.emoji + ' ' : '') + c.name : 'Routines this week');

  /** Change the categories (fn gets the list) and store them - in the project folder if one is open. */
  R.editCategories = function (fn) {
    const list = R.categories().map((c) => Object.assign({}, c));
    fn(list);
    MM.state.settings.routineCategories = MM.normalizeCategories(list);
    MM.saveSettings();
    MM.storage.saveProjectSettings();
  };

  /** Ask for a name and add a category. Returns its id or null. */
  R.newCategory = function () {
    const name = (prompt(MM.tr('Name of the new routine category (e.g. "Band practice", "Learning"):'), '') || '').trim().slice(0, 40);
    if (!name) return null;
    const old = R.categories().find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (old) return old.id;
    const id = MM.uid('c');
    R.editCategories((list) => list.push({ id, name, emoji: '', leisure: false }));
    return id;
  };

  // ---- Days off -------------------------------------------------------------------

  /** Days-off entries active on day d. */
  const offsOn = (list, d) => list.filter((r) => r.rule.kind === 'off' && r.rule.from && active(r.rule, d));

  /**
   * Time off on day d: { full, minutes, title } or null.
   * An entry without an estimate is a whole day off.
   */
  R.offOn = function (list, d) {
    const offs = offsOn(list, d);
    if (!offs.length) return null;
    const full = offs.some((r) => !r.minutes);
    return { full, minutes: full ? Infinity : offs.reduce((s, r) => s + r.minutes, 0), title: offs.map((r) => r.title).join(', ') };
  };

  /** Is day d a whole day off? */
  R.isOff = (list, d) => {
    const o = R.offOn(list, d);
    return !!(o && o.full);
  };

  /** Is the rule active on that day (start / end date)? */
  function active(rule, d) {
    const from = parse(rule.from), until = parse(rule.until);
    return !(from && d < from) && !(until && d > until);
  }

  /** A routine of the week without fixed days: time budget or "n times per week". */
  R.isWeekly = (rule) => !!rule && (rule.kind === 'budget' || rule.kind === 'times');

  /** Does a dated routine (not a budget / n times per week) take place on day d? */
  R.occursOn = function (rule, d) {
    if (!rule || R.isWeekly(rule) || rule.kind === 'off' || !active(rule, d)) return false;
    if (rule.kind === 'weekly') {
      if (!rule.days.includes(d.getDay())) return false;
      if (rule.every <= 1) return true;
      const anchor = MM.templates.mondayOf(parse(rule.from) || ANCHOR);
      const weeks = Math.round((MM.templates.mondayOf(d) - anchor) / (7 * 864e5));
      return weeks >= 0 && weeks % rule.every === 0;
    }
    if (rule.kind === 'monthly-day') return d.getDate() === Math.min(rule.day, daysInMonth(d));
    if (rule.kind === 'monthly-nth') {
      if (d.getDay() !== rule.weekday) return false;
      return rule.nth === -1 ? d.getDate() + 7 > daysInMonth(d) : Math.ceil(d.getDate() / 7) === rule.nth;
    }
    return false;
  };

  /** Is a weekly budget / "n times per week" active in the week starting on Monday `mon`? */
  R.budgetActive = function (rule, mon) {
    if (!R.isWeekly(rule)) return false;
    for (let i = 0; i < 7; i++) if (active(rule, addDays(mon, i))) return true;
    return false;
  };

  /** Next date (today or later) a dated routine takes place, or null within a year. */
  R.next = function (rule, from) {
    let d = from || new Date();
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    for (let i = 0; i < 400; i++, d = addDays(d, 1)) if (R.occursOn(rule, d)) return d;
    return null;
  };

  /** "Every Tue, Thu 10:00", "Every 2 weeks on Thu", "1st Mon of the month", "3 h per week" (localized) */
  R.label = function (rule, minutes) {
    if (!rule) return '';
    const t = MM.t;
    const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    const wd = MM.weekdayNames();
    const dur = minutes ? ' · ' + MM.meta.formatDuration(minutes) : '';
    const time = rule.time ? ' ' + rule.time : '';
    if (rule.kind === 'budget') return fill(t('rl_budget'), { d: minutes ? MM.meta.formatDuration(minutes) : '?' });
    if (rule.kind === 'times') return MM.tr('{n}× per week', { n: rule.times }) + dur;
    if (rule.kind === 'off') {
      const f = (s) => (parse(s) ? parse(s).toLocaleDateString(MM.locale(), { day: 'numeric', month: 'short' }) : '?');
      const range = !rule.until || rule.until === rule.from ? f(rule.from) : `${f(rule.from)} – ${f(rule.until)}`;
      return fill(t('rl_off'), { range }) + (minutes ? fill(t('rl_offPerDay'), { d: MM.meta.formatDuration(minutes) }) : '');
    }
    if (rule.kind === 'weekly') {
      const days = rule.days.length ? rule.days.map((d) => wd[d]).join(', ') : t('rl_noDay');
      return (rule.every > 1 ? fill(t('rl_everyN'), { n: rule.every, days }) : fill(t('rl_every'), { days })) + time + dur;
    }
    if (rule.kind === 'monthly-day') return fill(t('rl_monthlyDay'), { day: rule.day }) + time + dur;
    return fill(t('rl_monthlyNth'), { nth: t('nth_' + rule.nth, NTH[rule.nth]), wd: wd[rule.weekday] }) + time + dur;
  };

  /** Average minutes per week a routine takes (for the overview). */
  R.perWeek = function (rule, minutes) {
    const m = minutes || 0;
    if (rule.kind === 'off') return 0;
    if (rule.kind === 'budget') return m;
    if (rule.kind === 'times') return m * rule.times;
    if (rule.kind === 'weekly') return (m * rule.days.length) / rule.every;
    return (m * 12) / 52;
  };

  // ---- Collecting --------------------------------------------------------------

  /**
   * All routines of the given docs (Map path -> doc): [{ path, id, title, rule, minutes, leisure }].
   * leisure: its category is leisure - listed and checked off, but no time off the capacity.
   */
  R.collect = function (docs) {
    const out = [];
    for (const [path, doc] of docs) {
      for (const n of Object.values(doc.nodes || {})) {
        if (!n.repeat || n.movedTo) continue;
        out.push({
          path, id: n.id, title: (n.text || '').split('\n')[0] || 'Routine', rule: n.repeat,
          minutes: Number(n.meta && n.meta.estimate) || 0, leisure: R.isLeisure(n.repeat),
        });
      }
    }
    return out.sort((a, b) => (a.rule.time || '99').localeCompare(b.rule.time || '99') || a.title.localeCompare(b.title));
  };

  /** Routines of the whole project (reads the other maps first if that has not happened yet). */
  R.all = async function () {
    if (!MM.load.loaded()) await MM.load.refresh();
    return R.collect(MM.load.docs());
  };

  /**
   * Minutes the routines take on day d: fixed appointments + share of weekly
   * budgets (workdaysOfWeek = work days of that week that are not off).
   * Nothing on a whole day off - the meeting takes place without you.
   * Leisure routines take no time (they are spare time).
   */
  R.minutesOn = function (list, d, workdaysOfWeek) {
    if (R.isOff(list, d)) return 0;
    let m = 0;
    for (const r of list) {
      if (r.leisure) continue;
      if (R.isWeekly(r.rule)) {
        if (workdaysOfWeek > 0 && R.budgetActive(r.rule, MM.templates.mondayOf(d))) m += R.perWeek(r.rule, r.minutes) / workdaysOfWeek;
      } else if (R.occursOn(r.rule, d)) {
        m += r.minutes;
      }
    }
    return m;
  };

  /**
   * Scheduled notes (appointments, meta.scheduled) of the given docs, not done / moved:
   * [{ path, id, title, date, rule: { time }, minutes }] sorted by date and time.
   */
  R.appointments = function (docs) {
    const out = [];
    for (const [path, doc] of docs) {
      for (const n of Object.values(doc.nodes || {})) {
        const m = n.meta || {};
        if (!m.scheduled || n.movedTo || n.repeat || m.status === 'done' || n.type === 'diary') continue;
        out.push({
          path, id: n.id, title: (n.text || '').split('\n')[0] || MM.tr('Appointment'), date: m.scheduled,
          rule: { time: m.scheduledTime || '' }, minutes: Number(m.estimate) || 0,
        });
      }
    }
    return out.sort((a, b) => (a.date + (a.rule.time || '99')).localeCompare(b.date + (b.rule.time || '99')) || a.title.localeCompare(b.title));
  };

  // ---- New day / week plans ------------------------------------------------------

  /**
   * The lists of a week plan for the routines without fixed days (node.routineList =
   * category id, '' = without category). Older plans have one list "Routines this week".
   */
  function routineLists(doc) {
    const out = [];
    for (const n of Object.values(doc.nodes)) {
      if (n.type !== 'todo') continue;
      if (n.routineList === undefined && n.text === 'Routines this week' && !(n.meta && n.meta.deadline)) n.routineList = '';
      if (n.routineList !== undefined) out.push(n);
    }
    return out;
  }

  const entryText = (r, icon) => `${icon || '🔁'} ${r.title}${r.rule.time ? ' ' + r.rule.time : ''}${r.minutes ? ' (' + MM.meta.formatDuration(r.minutes) + ')' : ''}`;

  function addEntry(col, r, icon) {
    // the template starts every column with one empty entry - use that first
    const empty = col.items.length === 1 && !col.items[0].text.trim() ? col.items[0] : null;
    const it = empty || MM.createTodoItem('');
    it.text = entryText(r, icon);
    it.routine = r.id;
    if (!empty) col.items.push(it);
  }

  /**
   * Put the routines and the scheduled notes (📌) into a freshly built day or
   * week plan (before it is written). Returns the number of entries added.
   * Entries of appointments carry item.routine = note id as well, so carry-over skips them.
   *
   * opts.fill: the plan exists already (opened again) - add only what is new since:
   * days before today are left alone, an entry that is in its list already is not
   * doubled, and one that was put in before (doc.planned) is not added again after
   * the user deleted it. Open entries of today and later that would not be put in
   * any more (note deleted, appointment on another day, routine changed) are
   * removed; checked ones stay. Returns { added, removed } then.
   */
  R.addToPlan = async function (doc, path, opts) {
    const fill = !!(opts && opts.fill);
    const info = MM.templates.parsePath(path);
    if (info.kind !== 'week' && info.kind !== 'day') return fill ? { added: 0, removed: 0 } : 0;
    const list = await R.all();
    const appts = R.appointments(MM.load.docs());
    if (!fill && !list.length && !appts.length) return 0;
    // the plan's columns (the "Carried over" list has a deadline as well, but is no column)
    const cols = Object.values(doc.nodes).filter((n) => n.type === 'todo' && n.meta && n.meta.deadline &&
      !(n.tags || []).includes('carried-over'));
    const planned = new Set(doc.planned || []);
    // "<list id>|<id>@<date>" -> number of entries that list should have now
    const expected = new Map();
    const today = iso(new Date());
    const sunday = info.kind === 'week' ? iso(addDays(info.date, 6)) : '';
    let count = 0, updated = 0, dry = false;
    // date: the day the entry is for (for a weekly routine the last day of the week);
    // slot: number of the check box of an "n times per week" routine (0 = the first / only one)
    const add = (col, r, icon, date, slot = 0) => {
      const base = `${r.id}@${date}`, key = slot ? `${base}#${slot}` : base, ek = `${col.id}|${base}`;
      expected.set(ek, Math.max(expected.get(ek) || 0, slot + 1));
      if (dry) return;
      if (fill && slot === 0) {
        // renamed note, other time / duration: open entries follow, checked ones keep their text
        const text = entryText(r, icon);
        for (const it of col.items) {
          if (it.routine === r.id && !it.done && it.text !== text) {
            it.text = text;
            updated++;
          }
        }
      }
      if (fill) {
        if (date < today || planned.has(key)) return;
        if (col.items.filter((it) => it.routine === r.id).length > slot) {
          planned.add(key); // put in before this list was kept
          return;
        }
      }
      addEntry(col, r, icon);
      planned.add(key);
      count++;
    };
    const colByTime = (time, byName) => {
      const h = time ? +time.slice(0, 2) : 0;
      return byName(h >= 17 ? 'Evening' : h >= 12 ? 'Afternoon' : 'Morning') || cols[0];
    };
    // a day off gets one entry ("🏖 Vacation") instead of its appointments
    const markOff = (col, d) => {
      const off = d && R.offOn(list, d);
      if (!off) return false;
      const src = offsOn(list, d)[0];
      add(col, { id: src.id, title: off.title, rule: { time: '' }, minutes: off.full ? 0 : off.minutes }, '🏖', iso(d));
      return off.full;
    };
    // Clean up first (fill only, and only when every map could be read - else its notes
    // just look deleted): a dry run tells what belongs on which list now; open entries
    // that do not (note deleted, appointment on another day / at another time, routine
    // changed or in another category) are removed, then the missing ones are put in.
    let removed = 0;
    if (fill && MM.load.complete()) {
      dry = true;
      place();
      dry = false;
      const lists = cols.map((c) => [c, c.meta.deadline]);
      if (sunday) for (const box of routineLists(doc)) lists.push([box, sunday]);
      const released = new Set();
      for (const [col, date] of lists) {
        if (!date || date < today) continue;
        // per routine: checked entries always stay, open ones up to the number it should have
        const kept = new Map();
        for (const it of col.items) if (it.routine && it.done) kept.set(it.routine, (kept.get(it.routine) || 0) + 1);
        const keep = col.items.filter((it) => {
          if (!it.routine || it.done) return true;
          const k = kept.get(it.routine) || 0;
          if (k < (expected.get(`${col.id}|${it.routine}@${date}`) || 0)) {
            kept.set(it.routine, k + 1);
            return true;
          }
          return false;
        });
        for (const it of col.items) if (!keep.includes(it)) released.add(`${it.routine}@${date}`);
        removed += col.items.length - keep.length;
        col.items = keep;
      }
      // released entries may come back later (e.g. the appointment moves back to this day):
      // forget them in doc.planned - beyond what is still on any list of the plan
      for (const base of released) {
        const [id, date] = base.split('@');
        let left = 0;
        for (const [col, d] of lists) if (d === date) left += col.items.filter((it) => it.routine === id).length;
        for (let s = left; s < 7; s++) planned.delete(s ? `${base}#${s}` : base);
      }
      // a routine list that is empty now goes (it comes back when a routine needs it)
      for (const box of routineLists(doc)) if (!box.items.length) delete doc.nodes[box.id];
    }
    place();
    if (planned.size || doc.planned) doc.planned = [...planned];
    return fill ? { added: count, removed, updated } : count;

    /** Put every entry where it belongs (dry: only note what belongs where). */
    function place() {
      if (info.kind === 'week') {
        for (const col of cols) {
          const d = parse(col.meta.deadline);
          if (!d || markOff(col, d)) continue;
          for (const r of list) {
            if (R.occursOn(r.rule, d)) add(col, r, '🔁', iso(d));
          }
          for (const a of appts) {
            if (a.date === iso(d)) add(col, a, '📌', iso(d));
          }
        }
        // routines of the week without fixed days (budget, n times per week): one list per
        // category left of the goals ("Routines this week" for those without category)
        const goals = Object.values(doc.nodes).find((n) => n.type === 'todo' && n.text === 'Goals');
        const made = [];
        for (const r of list.filter((x) => R.budgetActive(x.rule, info.date))) {
          const cat = R.category(r.rule.category);
          let box = routineLists(doc).find((n) => n.routineList === (cat ? cat.id : ''));
          if (!box && dry) continue; // a new list has nothing to clean up
          if (!box) {
            const k = routineLists(doc).length;
            const x = (goals ? goals.x - 160 : -840) - k * 260, y = goals ? goals.y + goals.h / 2 : 0;
            box = MM.createNode('todo', x, y, { text: R.categoryTitle(cat), w: 240 });
            box.items = [];
            box.routineList = cat ? cat.id : '';
            box.style.fill = '#f0fff4';
            box.style.stroke = '#38a169';
            doc.nodes[box.id] = box;
            made.push(box);
          } else if (!dry && cat && box.text !== R.categoryTitle(cat)) {
            box.text = R.categoryTitle(cat); // category renamed / new emoji
          }
          const n = r.rule.kind === 'times' ? r.rule.times : 1;
          for (let slot = 0; slot < n; slot++) add(box, r, '🔁', sunday, slot);
        }
        for (const box of made) if (!box.items.length) delete doc.nodes[box.id]; // nothing new for it
      } else {
        // day plan: by time of day (no time = morning)
        const byName = (name) => cols.find((c) => c.text === name);
        // appointments are listed even on a day off - they were set for that very day
        const day = iso(info.date);
        for (const a of appts) {
          if (a.date !== day) continue;
          const col = colByTime(a.rule.time, byName);
          if (col) add(col, a, '📌', day);
        }
        if (!markOff(byName('Morning') || cols[0], info.date)) {
          for (const r of list) {
            if (!R.occursOn(r.rule, info.date)) continue;
            const col = colByTime(r.rule.time, byName);
            if (col) add(col, r, '🔁', day);
          }
        }
      }
    }
  };

  /** Show the note behind a 🔁 / 📌 / 🏖 entry; its map is opened when it is another one. */
  R.openSource = async function (id) {
    const S = MM.state, P = MM.project;
    if (MM.node(id)) {
      MM.actions.focusNode(id);
      return;
    }
    const find = () => {
      for (const [path, doc] of MM.load.docs()) {
        const n = path !== S.file.path && doc.nodes && doc.nodes[id];
        if (n && !n.movedTo && P.find(path)) return path;
      }
      return null;
    };
    let path = find();
    if (!path && P.status === 'ready') {
      await MM.load.refresh(); // just created in another map: not in the cache yet
      path = find();
    }
    if (!path) {
      MM.ui.flash(MM.tr('The note of this entry does not exist any more'));
      return;
    }
    if (await P.openMap(path)) MM.actions.focusNode(id);
  };

  // ---- Done in one place = done everywhere --------------------------------------------
  //
  // A meeting (🔁) or an appointment (📌) is listed in the day plan and in the
  // week plan, and an appointment is a note of its own as well. Checking one of
  // them off (or opening it again) does the same with the others. The history
  // in state.js reports every change: track('commit') before a step is recorded,
  // track('restore') after undo / redo, track('reset') when a map is loaded.
  // The open map is adjusted within the same undo step; other maps are written
  // in the background. Undo in the open map takes the other maps back as well.

  /**
   * What is done in a doc: Map(key -> { id, date, done }), id = routine / appointment note id.
   *   entries: to-do items with item.routine in a dated column (day / week plan)
   *   appointments: notes with meta.scheduled (not a routine definition)
   * The weekly "Routines this week" list has no date and stays alone.
   */
  function doneState(doc) {
    const out = new Map();
    for (const n of Object.values((doc && doc.nodes) || {})) {
      const m = n.meta || {};
      if (m.scheduled && !n.repeat) out.set('n:' + n.id, { id: n.id, date: m.scheduled, done: m.status === 'done' });
      if (n.type !== 'todo' || !m.deadline) continue;
      for (const it of n.items || []) {
        if (it.routine) out.set(`i:${n.id}:${it.id}`, { id: it.routine, date: m.deadline, done: !!it.done });
      }
    }
    return out;
  }

  /**
   * Set entries and the appointment note of change c ({ id, date, done }) in doc.
   * A routine definition (n.repeat) stays open - only its entry of that day is done;
   * a note moved to another day is not touched by the entry of the old day.
   * Returns true if something changed.
   */
  function applyDone(doc, c) {
    let dirty = false;
    for (const n of Object.values((doc && doc.nodes) || {})) {
      const m = n.meta || {};
      if (n.id === c.id && !n.repeat && m.scheduled === c.date && (m.status === 'done') !== c.done) {
        MM.meta.setValue([n], 'status', c.done ? 'done' : 'open');
        dirty = true;
      }
      if (n.type !== 'todo' || m.deadline !== c.date) continue;
      for (const it of n.items || []) {
        if (it.routine === c.id && !!it.done !== c.done) {
          it.done = c.done;
          dirty = true;
        }
      }
    }
    return dirty;
  }

  let base = { doc: null, state: new Map() };
  let queue = Promise.resolve();

  /** mode: 'commit' | 'restore' | 'reset' (see above). */
  R.track = function (mode) {
    const S = MM.state;
    let before = base.doc === S.doc ? base.state : null;
    if (!before && mode === 'commit' && MM.history.last) {
      // no state of this doc yet (loaded before this file): the last undo snapshot is the state before the step
      try {
        before = doneState(JSON.parse(MM.history.last));
      } catch (err) { /* no snapshot: nothing to compare */ }
    }
    let changes = [];
    if (before && mode !== 'reset') {
      const now = doneState(S.doc);
      for (const [key, v] of now) {
        const old = before.get(key);
        if (old && old.done !== v.done) changes.push(v);
      }
      // the open map in the same step (after undo / redo it already is as it was)
      if (mode === 'commit') changes.forEach((c) => applyDone(S.doc, c));
    }
    base = { doc: S.doc, state: doneState(S.doc) };
    if (!changes.length) return;
    const from = S.file.path;
    queue = queue.then(() => syncOthers(changes, from));
  };

  /** Write the changes into the other maps of the project folder (not `from`, it has them). */
  async function syncOthers(changes, from) {
    const P = MM.project, T = MM.templates;
    if (!P || P.status !== 'ready') return;
    // the day plans and week plans of the dates (wherever they were moved to)
    const days = new Set(changes.map((c) => c.date));
    const weeks = new Set(changes.map((c) => iso(T.mondayOf(parse(c.date)))));
    const isPlan = (path) => {
      const info = T.parsePath(path);
      return (info.kind === 'day' && days.has(iso(info.date))) || (info.kind === 'week' && weeks.has(iso(info.date)));
    };
    const ids = new Set(changes.map((c) => c.id));
    let count = 0;
    try {
      for (const path of P.mapPaths()) {
        if (path === from) continue;
        // appointment notes live in any map - the cache tells where, the file is read fresh
        const cached = MM.load.docs().get(path);
        const hasNote = cached && cached.nodes && Object.keys(cached.nodes).some((id) => ids.has(id));
        if (!isPlan(path) && !hasNote) continue;
        const doc = await P.readMap(path);
        if (!doc) continue;
        let dirty = false;
        for (const c of changes) dirty = applyDone(doc, c) || dirty;
        if (!dirty) continue;
        if (!(await P.ensureWriteAccess())) throw new Error(MM.tr('no write access to the project folder'));
        await P.writeMap(path, doc);
        count++;
      }
    } catch (err) {
      MM.ui.flash(MM.tr('Could not update the other plans: {err}', { err: (err && err.message) || err }));
      return;
    }
    if (count) {
      MM.load.scheduleRefresh();
      const done = changes[changes.length - 1].done;
      MM.ui.flash(MM.tr(done ? 'Also checked off in {n} other map(s)' : 'Also unchecked in {n} other map(s)', { n: count }));
    }
  }

  R.iso = iso;
})(window.MM);
