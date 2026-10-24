'use strict';
/*
 * Workload: planned hours per day and week from estimates and deadlines,
 * across all maps of the project folder (the open map live, the others read
 * in the background and cached).
 *
 *   - planned work = notes that are not done / moved and have an estimate:
 *     remaining = estimate x (1 - progress); a to-do list with an estimate
 *     counts its open share of the entries
 *   - a task with sub-tasks (arrows, derived map) is not counted itself, its
 *     sub-tasks carry the work (no double counting)
 *   - the remaining work is spread over the planning days (days with hours)
 *     from today to the deadline, weighted by the hours of each day;
 *     overdue work counts for today
 *   - buffer check: for every deadline D, the work due until D must fit into
 *     the hours available from today until D (capacity x work days)
 *   - notes with a deadline but no estimate are not counted, only reported
 *   - scheduled notes (appointments, meta.scheduled) are no project work: like
 *     routines they take their estimate off the capacity of their day (also when
 *     ticked off; past ones no longer count). An appointment that does not fit
 *     into the free time of its day (day off, 0 h day, day full of routines) is
 *     reported as a conflict.
 *
 * Capacity: S.settings.hoursPerDay (default 8) on workDays, S.settings.hoursPerWeekendDay (default 0) on all other days.
 */
(function (MM) {
  const S = MM.state;
  const L = (MM.load = {});
  let others = new Map(); // path -> doc of the other maps of the project
  let othersVersion = 0;

  const tr = (s, v) => MM.tr(s, v);
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

  /** Capacity settings: { hours, weekendHours, days: [weekday numbers] }. */
  L.capacity = function () {
    const h = Number(S.settings.hoursPerDay);
    const w = Number(S.settings.hoursPerWeekendDay);
    const days = Array.isArray(S.settings.workDays) ? S.settings.workDays.map(Number) : [1, 2, 3, 4, 5];
    return { hours: h > 0 && h <= 24 ? h : 8, weekendHours: w >= 0 && w <= 24 ? w : 0, days };
  };

  /** Base hours of a date: work day hours or weekend day hours (before days off and routines). */
  L.baseHours = function (d, cap) {
    const c = cap || L.capacity();
    return c.days.includes(d.getDay()) ? c.hours : c.weekendHours;
  };

  /** "6.5 h" */
  L.hours = (min) => {
    const h = Math.round((min / 60) * 10) / 10;
    return (Number.isInteger(h) ? h : h.toFixed(1)) + ' h';
  };

  // ---- Planned work ------------------------------------------------------------

  /** All maps: the others from the cache, the open one live. */
  function allDocs() {
    const docs = new Map(others);
    docs.set(S.file.path || '(open map)', S.doc);
    return docs;
  }

  /**
   * Planned work items of the given docs (Map path -> doc).
   * skip: Set of note ids of the open map to leave out (for the "without this note" preview).
   * Item: { path, id, title, deadline, scheduled, time, minutes, missing }
   */
  L.items = function (docs, skip) {
    const roots = new Map();
    const rootsOf = (p) => {
      if (!roots.has(p)) roots.set(p, docs.has(p) ? MM.tasks.compute(docs.get(p), null).roots : null);
      return roots.get(p);
    };
    const out = [];
    for (const [path, doc] of docs) {
      const isOpen = doc === S.doc;
      // tasks with sub-tasks (here or in their derived map): their sub-tasks carry the work
      const parents = MM.tasks.compute(doc, (p) => (p !== path ? rootsOf(p) : null)).info;
      for (const n of Object.values(doc.nodes || {})) {
        if (n.movedTo || n.repeat || (isOpen && skip && skip.has(n.id))) continue; // routines reduce the capacity instead
        if (n.type === 'diary') continue; // a diary entry is no planned work
        const m = n.meta || {};
        if (m.scheduled) {
          // appointment: a fixed block of time on its day - it stays reserved when ticked off
          const est = Number(m.estimate) || 0;
          if (!est && (n.type === 'todo' || m.status === 'done' || (n.type !== 'task' && (!m.status || m.status === 'none')))) continue;
          out.push({
            path, id: n.id, title: (n.text || '').split('\n')[0] || tr('Appointment'),
            deadline: '', scheduled: m.scheduled, time: m.scheduledTime || '', minutes: est, missing: !est,
          });
          continue;
        }
        if (m.status === 'done') continue;
        if (n.type === 'task' && parents.has(n.id)) {
          // only the part of its estimate that is not split up into sub-tasks yet
          const info = parents.get(n.id);
          if (info.rest > 0) {
            out.push({
              path, id: n.id, title: ((n.text || '').split('\n')[0] || tr('Task')) + tr(' (not split up)'),
              deadline: m.deadline || '', scheduled: '', minutes: info.rest, missing: false,
            });
          }
          continue;
        }
        const est = Number(m.estimate) || 0;
        let minutes = est;
        if (n.type === 'todo') {
          if (!est) continue; // a plain to-do list is not planned work
          const filled = (n.items || []).filter((i) => i.text.trim() && !i.moved);
          const open = filled.filter((i) => !i.done).length;
          if (filled.length && !open) continue;
          if (filled.length) minutes = (est * open) / filled.length;
        } else {
          if (!(est || m.deadline)) continue;
          if (n.type !== 'task' && !est && (!m.status || m.status === 'none')) continue; // just a dated note
          if (MM.meta.hasProgress(m)) minutes = est * (1 - m.progress / 100);
        }
        out.push({
          path, id: n.id, title: (n.text || '').split('\n')[0] || tr(MM.NODE_TYPES[n.type] || 'Note'),
          deadline: m.deadline || '', scheduled: '', minutes, missing: !est,
        });
      }
    }
    return out;
  };

  /**
   * Workload of a list of items:
   *   byDay: Map(iso -> minutes), days (next 14 days), weeks (this + 3 weeks),
   *   buffers (per deadline), critical (smallest buffer), missing, unscheduled,
   *   conflicts (appointments that do not fit into their day).
   */
  L.compute = function (items, routines) {
    const cap = L.capacity(), capDay = cap.hours * 60;
    const t0 = today();
    const list = routines || [];
    // a whole day off (vacation) is no work day; partial days off reduce the capacity
    const offOn = (d) => (list.length ? MM.routines.offOn(list, d) : null);
    const baseOf = (d) => L.baseHours(d, cap);
    const isWork = (d) => baseOf(d) > 0 && !(offOn(d) || {}).full;
    // capacity of a day = hours per work day minus time off minus the routines on that day
    const routineMemo = new Map();
    const routineOn = (d) => {
      const k = iso(d);
      if (!routineMemo.has(k)) {
        let wd = 0;
        const mon = MM.templates.mondayOf(d);
        for (let i = 0; i < 7; i++) if (isWork(addDays(mon, i))) wd++;
        routineMemo.set(k, isWork(d) && list.length ? MM.routines.minutesOn(list, d, wd) : 0);
      }
      return routineMemo.get(k);
    };
    // appointments (today and later): minutes and titles per day
    const appts = new Map();
    let missing = 0, unscheduled = 0;
    for (const it of items) {
      if (!it.scheduled) continue;
      if (it.missing) {
        missing++;
        continue;
      }
      const ap = parse(it.scheduled);
      if (!ap || ap < t0 || !(it.minutes > 0)) continue; // a past appointment takes no time any more
      const k = iso(ap);
      const a = appts.get(k) || { minutes: 0, titles: [] };
      a.minutes += it.minutes;
      a.titles.push(it.title + (it.time ? ' ' + it.time : ''));
      appts.set(k, a);
    }
    const apptOn = (d) => (appts.get(iso(d)) || { minutes: 0 }).minutes;
    // free time of a day before appointments: hours minus time off minus routines
    const freeOf = (d) => {
      if (!isWork(d)) return 0;
      const off = offOn(d);
      return Math.max(0, baseOf(d) * 60 - (off ? off.minutes : 0) - routineOn(d));
    };
    // capacity for project work = free time minus the appointments of that day
    const capOf = (d) => Math.max(0, freeOf(d) - apptOn(d));
    const conflicts = [];
    for (const [k, a] of appts) {
      const d = parse(k), free = freeOf(d);
      if (a.minutes <= free + 0.5) continue;
      const off = offOn(d);
      const reason = off && off.full ? tr('day off') : !baseOf(d) ? tr('no planning hours on this day') : tr('routines and appointments exceed the day');
      conflicts.push({ date: k, minutes: a.minutes, free, titles: a.titles, reason });
    }
    conflicts.sort((a, b) => a.date.localeCompare(b.date));
    const conflictOn = (d) => conflicts.some((c) => c.date === iso(d));
    const workdays = (a, b) => {
      const out = [];
      for (let d = a; d <= b; d = addDays(d, 1)) if (isWork(d)) out.push(iso(d));
      return out;
    };
    const byDay = new Map();
    const sched = [];
    for (const it of items) {
      if (it.scheduled) continue; // appointments: see above
      if (it.missing) {
        if (it.deadline) missing++;
        continue;
      }
      if (it.minutes <= 0) continue;
      const dl = parse(it.deadline);
      if (!dl) {
        unscheduled += it.minutes;
        continue;
      }
      let days = dl < t0 ? [iso(t0)] : workdays(t0, dl);
      if (!days.length) days = [iso(t0)]; // due before the next planning day
      const weights = days.map((k) => baseOf(parse(k)) || 1);
      const total = weights.reduce((a, b) => a + b, 0);
      days.forEach((k, i) => byDay.set(k, (byDay.get(k) || 0) + (it.minutes * weights[i]) / total));
      sched.push({ due: dl < t0 ? t0 : dl, minutes: it.minutes });
    }

    // buffer per deadline: work due until D vs. hours available until D
    sched.sort((a, b) => a.due - b.due);
    const buffers = [];
    let work = 0;
    sched.forEach((s, i) => {
      work += s.minutes;
      if (i + 1 < sched.length && sched[i + 1].due.getTime() === s.due.getTime()) return;
      const avail = workdays(t0, s.due).reduce((sum, k) => sum + capOf(parse(k)), 0);
      buffers.push({ date: iso(s.due), work, cap: avail, buffer: avail - work });
    });
    const critical = buffers.reduce((m, b) => (!m || b.buffer < m.buffer ? b : m), null);

    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = addDays(t0, i);
      days.push({
        date: iso(d), load: byDay.get(iso(d)) || 0, cap: capOf(d), routine: routineOn(d), appt: apptOn(d),
        off: offOn(d), conflict: conflictOn(d),
      });
    }
    const weeks = [];
    const mon = MM.templates.mondayOf(t0);
    for (let w = 0; w < 4; w++) {
      const start = addDays(mon, w * 7), end = addDays(start, 6);
      let load = 0, capW = 0, routine = 0, appt = 0, conflict = false;
      for (let d = start < t0 ? t0 : start; d <= end; d = addDays(d, 1)) {
        load += byDay.get(iso(d)) || 0;
        capW += capOf(d);
        routine += routineOn(d);
        appt += apptOn(d);
        conflict = conflict || conflictOn(d);
      }
      weeks.push({ start: iso(start), label: tr('Week {n}', { n: MM.templates.isoWeek(start).week }), load, cap: capW, routine, appt, conflict });
    }
    return {
      capDay, capOf, freeOf, apptOn, byDay, days, weeks, buffers, critical, missing, unscheduled, conflicts, isWork, routines: list,
    };
  };

  let cache = { key: null, value: null };
  /** Workload of the whole project (cached per change). */
  L.summary = function () {
    const key = [S.rev, othersVersion, iso(today()), JSON.stringify(L.capacity()), MM.getLang()].join('|');
    if (cache.key !== key || cache.doc !== S.doc) {
      const docs = allDocs();
      cache = { key, doc: S.doc, value: L.compute(L.items(docs), MM.routines.collect(docs)) };
    }
    return cache.value;
  };

  /** All maps of the project (other maps from the cache, the open one live). */
  L.docs = allDocs;
  /** Have the other maps been read at least once? */
  L.loaded = () => othersVersion > 0;

  // ---- Reading the other maps ------------------------------------------------------

  let timer = null, running = 0, latest = null, failed = 0;
  /** Were all maps of the last refresh readable? (Otherwise their notes only look missing.) */
  L.complete = () => othersVersion > 0 && !failed;
  L.scheduleRefresh = function () {
    clearTimeout(timer);
    timer = setTimeout(() => L.refresh(), 400);
  };

  /**
   * Read all other maps of the project folder (background). Resolves once the
   * cache is fresh - if a newer refresh started meanwhile, once that one is done.
   */
  L.refresh = function () {
    const run = ++running;
    const done = read(run).then(() => (run === running ? undefined : latest));
    latest = done;
    return done;
  };

  async function read(run) {
    const P = MM.project;
    const next = new Map();
    let bad = 0;
    if (P && P.status === 'ready') {
      for (const p of P.mapPaths()) {
        if (p === S.file.path) continue;
        try {
          const d = await P.readMap(p);
          if (d) next.set(p, d);
          else bad++;
        } catch (err) { bad++; /* unreadable map: skipped */ }
      }
    }
    if (run !== running) return;
    others = next;
    failed = bad;
    othersVersion++;
    if (MM.ui) MM.ui.update();
  }

  // ---- Display ---------------------------------------------------------------------

  const fmtDate = (s) => {
    const d = parse(s);
    return d ? d.toLocaleDateString(MM.locale(), { weekday: 'short', day: 'numeric', month: 'short' }) : s;
  };
  L.fmtDate = fmtDate;

  /** Week of the summary containing `date` (computed on the fly for later weeks). */
  function weekOf(sum, date) {
    const d = parse(date);
    if (!d) return null;
    const t0 = today();
    const start = MM.templates.mondayOf(d < t0 ? t0 : d), end = addDays(start, 6);
    let load = 0, cap = 0;
    for (let x = start < t0 ? t0 : start; x <= end; x = addDays(x, 1)) {
      load += sum.byDay.get(iso(x)) || 0;
      cap += sum.capOf(x);
    }
    return { label: tr('Week {n}', { n: MM.templates.isoWeek(start).week }), start: iso(start), load, cap };
  }

  let last = null; // { rev, doc, version, sum } of the last status update

  /** Status bar: today / this week / smallest buffer; flashes what a change did. */
  L.renderStatus = function () {
    const el = document.getElementById('status-load');
    if (!el) return;
    const sum = L.summary();
    const td = sum.days[0], wk = sum.weeks[0], cr = sum.critical;
    const cf = sum.conflicts;
    const over = (cr && cr.buffer < 0) || td.load > td.cap || wk.load > wk.cap || cf.length > 0;
    el.classList.toggle('over', !!over);
    const signedH = (m) => (m < 0 ? '−' : '') + L.hours(Math.abs(m));
    const todayText = td.off && td.off.full && !td.load ? tr('Today off 🏖')
      : tr('Today {a} / {b}', { a: L.hours(td.load), b: L.hours(td.cap) });
    el.textContent = todayText + ' · ' + tr('Week {a} / {b}', { a: L.hours(wk.load), b: L.hours(wk.cap) }) +
      (cr ? ' · ' + tr('Buffer {b}', { b: signedH(cr.buffer) }) : '') +
      (cf.length ? ' · ' + tr('📌 conflict {d}', { d: fmtDate(cf[0].date) }) + (cf.length > 1 ? ' +' + (cf.length - 1) : '') : '') +
      (sum.missing ? ' · ' + tr('{n} without estimate', { n: sum.missing }) : '');
    el.title = cf.map((c) => tr('Appointment conflict {d}: {a} scheduled, {f} free ({r}) – {t}',
      { d: fmtDate(c.date), a: L.hours(c.minutes), f: L.hours(c.free), r: c.reason, t: c.titles.join(', ') }) + '\n').join('') +
      (cr ? tr('Tightest deadline: {d} – {w} of work, {c} available', { d: fmtDate(cr.date), w: L.hours(cr.work), c: L.hours(cr.cap) }) + '\n' : '') +
      (sum.unscheduled ? tr('{h} planned without a deadline', { h: L.hours(sum.unscheduled) }) + '\n' : '') +
      (sum.missing ? tr('{n} open note(s) with a deadline have no time estimate', { n: sum.missing }) + '\n' : '') +
      tr('Click: workload in the overview');

    // a change of the open map: show what it did to the plan
    if (last && last.doc === S.doc && last.version === othersVersion && last.rev !== S.rev) {
      const msg = [];
      sum.weeks.forEach((w, i) => {
        const before = last.sum.weeks[i];
        if (!msg.length && before && Math.abs(before.load - w.load) >= 1) {
          msg.push(tr('{w}: {a} → {b} of {c}', { w: w.label, a: L.hours(before.load), b: L.hours(w.load), c: L.hours(w.cap) }));
        }
      });
      const b0 = last.sum.critical, b1 = sum.critical;
      if (b1 && (!b0 || Math.abs(b0.buffer - b1.buffer) >= 1)) {
        const signed = (m) => (m < 0 ? '−' : '') + L.hours(Math.abs(m));
        msg.push(tr('smallest buffer {a} → {b} ({d})', { a: b0 ? signed(b0.buffer) : '–', b: signed(b1.buffer), d: fmtDate(b1.date) }));
      }
      if (msg.length) MM.ui.flash(tr('Plan: ') + msg.join(' · '));
    }
    last = { rev: S.rev, doc: S.doc, version: othersVersion, sum };
  };

  /** Panel box for the selected notes: their effect on the week and the buffer of their deadline. */
  L.previewHTML = function (nodes) {
    const n = nodes[0];
    const m = n.meta || {};
    if (n.repeat && n.repeat.kind === 'off') {
      return `<p class="hint">${MM.render.esc(tr('Days off: {r} – no work is planned then.', { r: MM.routines.label(n.repeat, m.estimate) }))}</p>`;
    }
    if (n.repeat) {
      const per = MM.routines.perWeek(n.repeat, Number(m.estimate) || 0);
      return `<p class="hint">${tr('Routine: takes about {h} per week off your capacity.', { h: L.hours(per) })}</p>`;
    }
    // main task: how much of its estimate the sub-tasks cover
    const info = MM.tasks.info(n);
    let split = '';
    if (info) {
      const e = MM.meta.formatDuration, own = Number(m.estimate) || 0;
      const x = MM.render.esc;
      split = !own
        ? `<div>${x(tr('Sub-tasks: {a} – give this task an estimate to plan a total.', { a: e(info.split) || '0m' }))}</div>`
        : info.over
          ? `<div class="over">${x(tr('Sub-tasks: {a} > {b} estimated – the sub-tasks count.', { a: e(info.split), b: e(own) }))}</div>`
          : `<div>${x(tr('{a} of {b} split up into sub-tasks', { a: e(info.split) || '0m', b: e(own) }) +
            (info.rest ? tr('; the rest ({r}) is planned with this task.', { r: e(info.rest) }) : '.'))}</div>`;
      if (!info.rest || !m.deadline || m.status === 'done') return `<div class="load-box">${split}</div>`;
    } else if (m.scheduled) {
      return L.appointmentHTML(n);
    } else if (!m.estimate || !m.deadline) {
      return `<p class="hint">${tr('Set an estimate and a deadline or a scheduled date to see the effect on your plan.')}</p>`;
    }
    if (m.status === 'done' || n.movedTo) return `<p class="hint">${tr('Done or moved notes are not planned work.')}</p>`;
    const sum = L.summary();
    const without = L.compute(L.items(allDocs(), new Set(nodes.map((x) => x.id))), sum.routines);
    const w1 = weekOf(sum, m.deadline), w0 = weekOf(without, m.deadline);
    const buf = sum.buffers.find((b) => b.date === (parse(m.deadline) < today() ? iso(today()) : m.deadline));
    const cls = (bad) => (bad ? ' class="over"' : '');
    let h = '<div class="load-box">' + split;
    if (w1) {
      h += `<div${cls(w1.load > w1.cap)}><b>${w1.label}:</b> ${tr('{a} of {b}', { a: L.hours(w1.load), b: L.hours(w1.cap) })}` +
        ` <span class="muted">(${tr(nodes.length > 1 ? '+{h} from these notes' : '+{h} from this note', { h: L.hours(w1.load - w0.load) })})</span></div>`;
    }
    if (buf) {
      h += `<div${cls(buf.buffer < 0)}><b>${tr('Until {d}:', { d: fmtDate(buf.date) })}</b> ${tr('{a} of {b}', { a: L.hours(buf.work), b: L.hours(buf.cap) })}` +
        ` → ${tr('buffer {b}', { b: (buf.buffer < 0 ? '−' : '') + L.hours(Math.abs(buf.buffer)) })}</div>`;
    }
    if (sum.critical && buf && sum.critical.date !== buf.date && sum.critical.buffer < 0) {
      h += `<div class="over">${tr('Tightest deadline overall: {d} ({h})', { d: fmtDate(sum.critical.date), h: L.hours(sum.critical.buffer) })}</div>`;
    }
    return h + '</div>';
  };

  /** Panel box of an appointment: its day (free time before / after) and conflicts. */
  L.appointmentHTML = function (n) {
    const m = n.meta || {};
    const esc = MM.render.esc;
    const d = parse(m.scheduled);
    const k = m.scheduled;
    if (!m.estimate) return `<p class="hint">${tr('Set an estimate: the appointment then takes that time off the capacity of its day.')}</p>`;
    if (d < today()) return `<p class="hint">${tr('This appointment is over and no longer takes time off your capacity.')}</p>`;
    const sum = L.summary();
    const free = sum.freeOf(d), appt = sum.apptOn(d), load = sum.byDay.get(k) || 0, cap = sum.capOf(d);
    const conflict = sum.conflicts.find((c) => c.date === k);
    let h = '<div class="load-box">';
    h += `<div${conflict ? ' class="over"' : ''}><b>📌 ${esc(fmtDate(k))}${m.scheduledTime ? ' ' + m.scheduledTime : ''}:</b> ` +
      esc(tr('−{a} capacity ({b} free before appointments)', { a: L.hours(Number(m.estimate) || 0), b: L.hours(free) })) + '</div>';
    if (appt > (Number(m.estimate) || 0)) h += `<div class="muted">${esc(tr('Appointments on this day together: {a}', { a: L.hours(appt) }))}</div>`;
    if (conflict) {
      h += `<div class="over">${esc(tr('Conflict: {a} scheduled, but only {f} free ({r}).', { a: L.hours(conflict.minutes), f: L.hours(conflict.free), r: conflict.reason }))}</div>`;
    } else {
      h += `<div${load > cap ? ' class="over"' : ''}>${esc(tr('Project work left that day: {a} of {b}', { a: L.hours(load), b: L.hours(cap) }))}</div>`;
    }
    return h + '</div>';
  };

  /** Workload page of the overview: bars for days and weeks, buffers, warnings. */
  L.overviewHTML = function () {
    const sum = L.summary();
    const esc = MM.render.esc;
    const bar = (load, cap) => {
      const pct = cap ? (load / cap) * 100 : load ? 200 : 0;
      return `<span class="load-bar${pct > 100 ? ' over' : pct > 85 ? ' tight' : ''}"><span style="width:${Math.min(100, pct)}%"></span></span>`;
    };
    const taken = (routine, appt) => [routine >= 1 ? '−' + L.hours(routine) + ' 🔁' : '', appt >= 1 ? '−' + L.hours(appt) + ' 📌' : '']
      .filter(Boolean).join(' ');
    const row = (label, load, cap, routine, appt, conflict) => `<div class="load-row${load > cap || conflict ? ' over' : ''}">` +
      `<span class="load-label">${esc(label)}${conflict ? ' ⚠' : ''}</span>${bar(load, cap)}` +
      `<span class="load-val">${L.hours(load)} / ${L.hours(cap)}</span>` +
      `<span class="load-buf" title="${esc(tr('Taken by routines (🔁) and appointments (📌)'))}">${taken(routine, appt)}</span></div>`;
    let h = '';
    if (sum.conflicts.length) {
      h += `<div class="ov-group"><div class="ov-group-head">${tr('Appointment conflicts')}</div>`;
      for (const c of sum.conflicts) {
        h += `<div class="load-row over"><span class="load-label">⚠ ${esc(fmtDate(c.date))} · ${esc(c.titles.join(', '))}</span>` +
          `<span class="muted">${esc(c.reason)}</span><span class="load-val">${L.hours(c.minutes)} / ${L.hours(c.free)}</span>` +
          '<span class="load-buf"></span></div>';
      }
      h += '</div>';
    }
    h += `<div class="ov-group"><div class="ov-group-head">${tr('Weeks')}<span class="muted">${tr('planned / free after routines and appointments')}</span></div>`;
    for (const w of sum.weeks) {
      const d = parse(w.start);
      h += row(`${w.label} · ${fmtDate(w.start)} – ${fmtDate(iso(addDays(d, 6)))}`, w.load, w.cap, w.routine, w.appt, w.conflict);
    }
    h += `</div><div class="ov-group"><div class="ov-group-head">${tr('Days')}</div>`;
    for (const d of sum.days) {
      if (!d.cap && !d.load && !d.routine && !d.off && !d.appt) continue; // weekend without planned work
      const off = d.off ? ` · 🏖 ${d.off.title}${d.off.full ? '' : ' (' + MM.meta.formatDuration(d.off.minutes) + ')'}` : '';
      h += row(fmtDate(d.date) + (d === sum.days[0] ? tr(' (today)') : '') + off, d.load, d.cap, d.routine, d.appt, d.conflict);
    }
    h += `</div><div class="ov-group"><div class="ov-group-head">${tr('Buffer until each deadline')}</div>`;
    if (!sum.buffers.length) h += `<p class="hint">${tr('No open work with an estimate and a deadline.')}</p>`;
    for (const b of sum.buffers.slice(0, 15)) {
      h += `<div class="load-row${b.buffer < 0 ? ' over' : ''}"><span class="load-label">${esc(tr('Until {d}', { d: fmtDate(b.date) }))}</span>` +
        `${bar(b.work, b.cap)}<span class="load-val">${L.hours(b.work)} / ${L.hours(b.cap)}</span>` +
        `<span class="load-buf">${b.buffer < 0 ? '−' : '+'}${L.hours(Math.abs(b.buffer))}</span></div>`;
    }
    h += '</div>';
    // routines: rule, next date, hours per week (click opens the map with the note)
    const R = MM.routines;
    h += `<div class="ov-group"><div class="ov-group-head">${tr('Routines')}<span class="muted">` +
      (sum.routines.length ? tr('{h} per week', { h: L.hours(sum.routines.reduce((s, r) => s + R.perWeek(r.rule, r.minutes), 0)) }) : '') + '</span></div>';
    if (!sum.routines.length) {
      h += `<p class="hint">${esc(tr('No routines yet. Give a note a rule in the panel ("Repeat"), e.g. in a map "Routines".'))}</p>`;
    }
    for (const r of sum.routines) {
      if (r.rule.kind === 'off') continue; // listed below
      const next = R.next(r.rule);
      h += `<div class="load-row ov-routine" data-path="${esc(r.path)}" data-id="${esc(r.id)}">` +
        `<span class="load-label">🔁 ${esc(r.title)}</span><span class="muted">${esc(R.label(r.rule, r.minutes))}` +
        `${r.minutes ? '' : esc(tr(' – no duration (Estimate) set'))}</span>` +
        `<span class="load-val">${r.rule.kind === 'budget' ? tr('weekly') : next ? esc(fmtDate(iso(next))) : '–'}</span>` +
        `<span class="load-buf">${L.hours(R.perWeek(r.rule, r.minutes))}${tr('/wk')}</span></div>`;
    }
    h += '</div>';
    // days off that are not over yet
    const t0 = iso(today());
    const offs = sum.routines.filter((r) => r.rule.kind === 'off' && (r.rule.until || r.rule.from) >= t0)
      .sort((a, b) => a.rule.from.localeCompare(b.rule.from));
    h += `<div class="ov-group"><div class="ov-group-head">${tr('Days off')}</div>`;
    if (!offs.length) h += `<p class="hint">${esc(tr('No days off ahead. Give a note the rule "Day(s) off / vacation" (from / until).'))}</p>`;
    for (const r of offs) {
      h += `<div class="load-row ov-routine" data-path="${esc(r.path)}" data-id="${esc(r.id)}">` +
        `<span class="load-label">🏖 ${esc(r.title)}</span><span class="muted">${esc(R.label(r.rule, r.minutes))}</span>` +
        '<span class="load-val"></span><span class="load-buf"></span></div>';
    }
    h += '</div>';
    const notes = [];
    if (sum.missing) notes.push(tr('{n} open note(s) with a deadline have no time estimate and are not counted.', { n: sum.missing }));
    if (sum.unscheduled) notes.push(tr('{h} of estimated work has no deadline.', { h: L.hours(sum.unscheduled) }));
    const cap = L.capacity();
    const names = MM.weekdayNames();
    const work = names.filter((x, i) => cap.days.includes(i)).join(', ') || tr('none');
    const rest = names.filter((x, i) => !cap.days.includes(i)).join(', ');
    notes.push(tr('Capacity: {h} h per work day ({days})', { h: cap.hours, days: work }) +
      (rest ? tr(', {h} h per weekend day ({days})', { h: cap.weekendHours, days: rest }) : '') +
      tr(' – stored {where}. Change it in the panel (click the empty canvas). ', { where: MM.storage.capacityLocation() }) +
      tr('Work is spread over the planning days until its deadline.'));
    return h + notes.map((t) => `<p class="hint">${esc(t)}</p>`).join('');
  };
})(window.MM);
