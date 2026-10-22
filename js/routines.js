'use strict';
/*
 * Routines: recurring notes such as a weekly meeting or a weekly time budget
 * for supervising students. Any note can get a rule (node.repeat, see
 * MM.normalizeRepeat in state.js); a map "Routines" in the project folder is
 * the natural place to keep them, but rules in other maps count as well.
 * The duration of one occurrence (or the hours per week of a budget) is the
 * note's estimate.
 *
 * Effects:
 *   - workload.js takes the routines' time off the capacity of each day
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

  /** Does a dated routine (not a budget) take place on day d? */
  R.occursOn = function (rule, d) {
    if (!rule || rule.kind === 'budget' || rule.kind === 'off' || !active(rule, d)) return false;
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

  /** Is a weekly budget active in the week starting on Monday `mon`? */
  R.budgetActive = function (rule, mon) {
    if (!rule || rule.kind !== 'budget') return false;
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
    if (rule.kind === 'weekly') return (m * rule.days.length) / rule.every;
    return (m * 12) / 52;
  };

  // ---- Collecting --------------------------------------------------------------

  /** All routines of the given docs (Map path -> doc): [{ path, id, title, rule, minutes }]. */
  R.collect = function (docs) {
    const out = [];
    for (const [path, doc] of docs) {
      for (const n of Object.values(doc.nodes || {})) {
        if (!n.repeat || n.movedTo) continue;
        out.push({
          path, id: n.id, title: (n.text || '').split('\n')[0] || 'Routine', rule: n.repeat,
          minutes: Number(n.meta && n.meta.estimate) || 0,
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
   */
  R.minutesOn = function (list, d, workdaysOfWeek) {
    if (R.isOff(list, d)) return 0;
    let m = 0;
    for (const r of list) {
      if (r.rule.kind === 'budget') {
        if (workdaysOfWeek > 0 && R.budgetActive(r.rule, MM.templates.mondayOf(d))) m += r.minutes / workdaysOfWeek;
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
        if (!m.scheduled || n.movedTo || n.repeat || m.status === 'done') continue;
        out.push({
          path, id: n.id, title: (n.text || '').split('\n')[0] || MM.tr('Appointment'), date: m.scheduled,
          rule: { time: m.scheduledTime || '' }, minutes: Number(m.estimate) || 0,
        });
      }
    }
    return out.sort((a, b) => (a.date + (a.rule.time || '99')).localeCompare(b.date + (b.rule.time || '99')) || a.title.localeCompare(b.title));
  };

  // ---- New day / week plans ------------------------------------------------------

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
   */
  R.addToPlan = async function (doc, path) {
    const info = MM.templates.parsePath(path);
    if (info.kind !== 'week' && info.kind !== 'day') return 0;
    const list = await R.all();
    const appts = R.appointments(MM.load.docs());
    if (!list.length && !appts.length) return 0;
    // the plan's columns (the "Carried over" list has a deadline as well, but is no column)
    const cols = Object.values(doc.nodes).filter((n) => n.type === 'todo' && n.meta && n.meta.deadline &&
      !(n.tags || []).includes('carried-over'));
    let count = 0;
    const colByTime = (time, byName) => {
      const h = time ? +time.slice(0, 2) : 0;
      return byName(h >= 17 ? 'Evening' : h >= 12 ? 'Afternoon' : 'Morning') || cols[0];
    };
    // a day off gets one entry ("🏖 Vacation") instead of its appointments
    const markOff = (col, d) => {
      const off = d && R.offOn(list, d);
      if (!off) return false;
      const src = offsOn(list, d)[0];
      addEntry(col, { id: src.id, title: off.title, rule: { time: '' }, minutes: off.full ? 0 : off.minutes }, '🏖');
      count++;
      return off.full;
    };
    if (info.kind === 'week') {
      for (const col of cols) {
        const d = parse(col.meta.deadline);
        if (markOff(col, d)) continue;
        for (const r of list) {
          if (d && R.occursOn(r.rule, d)) {
            addEntry(col, r);
            count++;
          }
        }
        for (const a of appts) {
          if (d && a.date === iso(d)) {
            addEntry(col, a, '📌');
            count++;
          }
        }
      }
      // weekly budgets: one list left of the goals (the day columns are below them)
      const budgets = list.filter((r) => R.budgetActive(r.rule, info.date));
      if (budgets.length) {
        const goals = Object.values(doc.nodes).find((n) => n.type === 'todo' && n.text === 'Goals');
        const x = goals ? goals.x - 160 : -840, y = goals ? goals.y + goals.h / 2 : 0;
        const box = MM.createNode('todo', x, y, { text: 'Routines this week', w: 240 });
        box.items = budgets.map((r) => Object.assign(MM.createTodoItem(entryText(r)), { routine: r.id }));
        box.style.fill = '#f0fff4';
        box.style.stroke = '#38a169';
        doc.nodes[box.id] = box;
        count += budgets.length;
      }
    } else {
      // day plan: by time of day (no time = morning)
      const byName = (name) => cols.find((c) => c.text === name);
      // appointments are listed even on a day off - they were set for that very day
      const day = iso(info.date);
      for (const a of appts) {
        if (a.date !== day) continue;
        const col = colByTime(a.rule.time, byName);
        if (col) {
          addEntry(col, a, '📌');
          count++;
        }
      }
      if (markOff(byName('Morning') || cols[0], info.date)) return count;
      for (const r of list) {
        if (!R.occursOn(r.rule, info.date)) continue;
        const col = colByTime(r.rule.time, byName);
        if (col) {
          addEntry(col, r);
          count++;
        }
      }
    }
    return count;
  };

  R.iso = iso;
})(window.MM);
