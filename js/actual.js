'use strict';
/*
 * Actual time of a task (meta.actual, minutes): how long it really took, to learn
 * how well one estimates. Always editable in the panel and at its chip; after a
 * task with an estimate is checked off, MindMapper asks for it (setting askActual,
 * per project folder, on by default). Nothing is filled in by itself: no answer,
 * no value - few but right numbers rather than many wrong ones.
 *
 * meta.estimateFirst: the estimate when work on the task began (in progress,
 * progress > 0 or done). Correcting the estimate later does not change it, so
 * the comparison stays honest.
 *
 * Stopwatch of a task (optional): ▶ at the task starts it (meta.timerStart, ms),
 * ■ stops it and adds an entry to meta.timeLog = [{ s, e }] (ms) - shown below the
 * task's details, each entry with its duration and × to delete it. The list is not
 * added up into the actual time; the question after checking off only offers its
 * sum as a button. Checking a task off (or setting it aside) stops its stopwatch.
 */
(function (MM) {
  const S = MM.state;
  const AT = (MM.actual = {});
  const tr = (s, v) => MM.tr(s, v);
  const esc = (s) => MM.render.esc(s);
  const has = (v) => v !== null && v !== undefined;

  const started = (m) => !!m && (m.status === 'progress' || m.status === 'done' || Number(m.progress) > 0);

  /**
   * Called by MM.commit before a step is recorded (prev: the doc before it, or null).
   * Keeps the first estimate of tasks begun in this step, notes the day of the ones
   * finished (meta.doneAt, for the evaluation) and asks for the actual
   * time of the tasks checked off in it.
   */
  AT.commit = function (doc, prev) {
    if (!prev) return;
    const done = [];
    for (const n of Object.values(doc.nodes || {})) {
      const m = n.meta, old = prev.nodes && prev.nodes[n.id];
      if (!m || !old) continue;
      const om = old.meta || {};
      // begun now, or the first estimate of a task already begun
      if (!has(m.estimateFirst) && has(m.estimate) && started(m) && (!started(om) || !has(om.estimate))) m.estimateFirst = m.estimate;
      // finished or set aside: its stopwatch stops
      if (MM.notPlanned(m.status) && !MM.notPlanned(om.status) && m.timerStart) AT.stop(n);
      // the day it was finished (for a period in the evaluation later on)
      if (m.status === 'done' && om.status !== 'done') m.doneAt = MM.meta.todayStr();
      else if (m.status !== 'done' && m.doneAt) delete m.doneAt;
      if (m.status === 'done' && om.status !== 'done' && AT.askable(n)) done.push(n.id);
    }
    if (done.length) setTimeout(() => AT.ask(done), 0);
  };

  // ---- Stopwatch -------------------------------------------------------------------

  const MIN_ENTRY = 60 * 1000; // a shorter run is taken for a click by mistake

  /** Start the stopwatch of task n (does not commit). */
  AT.start = function (n) {
    n.meta.timerStart = Date.now();
  };

  /** Stop it: the run goes into the list. Returns its minutes, or 0 if it was too short. */
  AT.stop = function (n, now = Date.now()) {
    const s = n.meta.timerStart;
    n.meta.timerStart = null;
    if (!s || now - s < MIN_ENTRY) return 0;
    n.meta.timeLog = (n.meta.timeLog || []).concat([{ s, e: now }]);
    return Math.round((now - s) / 60000);
  };

  /** ▶ / ■ at the task: start or stop, one undo step. */
  AT.toggle = function (n) {
    if (n.meta.timerStart) {
      const min = AT.stop(n);
      MM.ui.flash(min ? tr('Stopped: {d}', { d: MM.meta.formatDuration(min) }) : tr('Stopped - less than a minute, not listed'));
    } else {
      AT.start(n);
      MM.ui.flash(tr('Time is running - press ■ when you stop'));
    }
    MM.commit();
  };

  /** × at an entry of the list. */
  AT.remove = function (n, i) {
    if (!n.meta.timeLog || !n.meta.timeLog[i]) return;
    n.meta.timeLog = n.meta.timeLog.filter((x, k) => k !== i);
    if (!n.meta.timeLog.length) delete n.meta.timeLog;
    MM.commit();
  };

  const minutesOf = (x) => Math.round((x.e - x.s) / 60000);
  const pad = (v) => String(v).padStart(2, '0');
  const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const dayOf = (ms) => { const d = new Date(ms); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`; };

  /** The ▶ / ■ button for the task's detail row. */
  AT.buttonHTML = function (n) {
    const s = n.meta.timerStart;
    return s
      ? `<span class="task-timer running" data-timer title="${esc(tr('Running since {t} - click to stop', { t: dayOf(s) + ' ' + clock(s) }))}">■ ${esc(clock(s))}</span>`
      : `<span class="task-timer" data-timer title="${esc(tr('Start the stopwatch (the time goes into a list below)'))}">▶</span>`;
  };

  /** The list of recorded runs below the task's details ('' if none). */
  AT.logHTML = function (n) {
    const log = n.meta.timeLog || [];
    if (!log.length) return '';
    return '<div class="task-log">' + log.map((x, i) => {
      const end = dayOf(x.e) === dayOf(x.s) ? clock(x.e) : dayOf(x.e) + ' ' + clock(x.e);
      return `<div class="task-log-row"><span>${dayOf(x.s)} ${clock(x.s)}–${end}</span><b>${MM.meta.formatDuration(minutesOf(x))}</b>` +
        `<span class="task-log-del" data-log-del="${i}" title="${esc(tr('Delete this entry'))}">×</span></div>`;
    }).join('') + '</div>';
  };

  /** Sum of the list in minutes (for the question after checking off). */
  AT.logged = (n) => (n.meta.timeLog || []).reduce((sum, x) => sum + minutesOf(x), 0);

  /** Is the actual time of note n asked for once it is checked off? */
  AT.askable = (n) => S.settings.askActual !== false && !!n.meta &&
    // appointments and routines took the time they were set for
    !n.repeat && !n.meta.scheduled && !n.movedTo && !has(n.meta.actual) && has(n.meta.estimate);

  /** Note n of another map was checked off (written there, e.g. from a plan's task list): as AT.commit does it. */
  AT.checkedOff = function (n) {
    if (!n.meta) return;
    if (!has(n.meta.estimateFirst) && has(n.meta.estimate)) n.meta.estimateFirst = n.meta.estimate;
    n.meta.doneAt = MM.meta.todayStr();
    if (n.meta.timerStart) AT.stop(n);
  };

  let dialog = null, rows = [];

  function build() {
    const d = document.createElement('dialog');
    d.id = 'actual-dialog';
    d.innerHTML = `
      <form method="dialog" class="dlg">
        <h3>${esc(tr('How long did it take?'))}</h3>
        <div class="act-rows"></div>
        <p class="hint">${esc(tr('Only if you know it - no value is better than a guessed one. Turn the question off: panel without selection → Planning capacity.'))}</p>
        <div class="dlg-buttons">
          <button type="button" data-dlg="cancel">${esc(tr('Skip'))}</button>
          <button type="submit" class="primary">${esc(tr('Save'))}</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    d.addEventListener('keydown', (e) => e.stopPropagation());
    d.querySelector('[data-dlg="cancel"]').addEventListener('click', () => d.close());
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-same]');
      if (!b) return;
      const input = b.closest('.act-row').querySelector('input');
      input.value = b.dataset.same;
      input.classList.remove('invalid');
    });
    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (save()) d.close();
    });
    return d;
  }

  /** Write the entered values (empty = not recorded) into their maps. False if one could not be read. */
  function save() {
    const inputs = dialog.querySelectorAll('.act-row input');
    const values = [];
    for (let i = 0; i < rows.length; i++) {
      const v = MM.meta.parseDuration(inputs[i].value);
      inputs[i].classList.toggle('invalid', v === undefined);
      if (v === undefined) {
        inputs[i].focus();
        return false;
      }
      values.push([rows[i], v]);
    }
    const set = (n, v) => {
      if (!n || (has(n.meta.actual) ? n.meta.actual : null) === v) return false;
      n.meta.actual = v;
      return true;
    };
    // the open map: one undo step; other maps: written in the background
    const others = new Map();
    let changed = false;
    for (const [r, v] of values) {
      if (r.path === S.file.path) changed = set(S.doc.nodes[r.id], v) || changed;
      else others.set(r.path, [...(others.get(r.path) || []), [r.id, v]]);
    }
    if (changed) MM.commit();
    if (others.size) writeOthers(others);
    return true;
  }

  async function writeOthers(byPath) {
    const P = MM.project;
    try {
      for (const [path, list] of byPath) {
        const doc = await P.readMap(path);
        if (!doc) continue;
        let dirty = false;
        for (const [id, v] of list) {
          const n = doc.nodes[id];
          if (!n || (has(n.meta.actual) ? n.meta.actual : null) === v) continue;
          n.meta.actual = v;
          dirty = true;
        }
        if (!dirty) continue;
        if (!(await P.ensureWriteAccess())) throw new Error(tr('no write access to the project folder'));
        await P.writeMap(path, doc);
      }
      MM.load.scheduleRefresh();
    } catch (err) {
      alert(tr('Could not save the actual time: {err}', { err: (err && err.message) || err }));
    }
  }

  /** Ask for the actual time of notes of the open map (ids); shows their current value. */
  AT.ask = (ids) => AT.askFor(ids.map((id) => S.doc.nodes[id]).filter(Boolean).map((n) => ({ path: S.file.path, node: n })));

  /**
   * Ask for the actual time of notes of any map: [{ path, node }] (node: as read from
   * its map). While the question is open, further ones are added to it.
   */
  AT.askFor = function (list) {
    if (!dialog) dialog = build();
    const F = MM.meta.formatDuration;
    const box = dialog.querySelector('.act-rows');
    if (!dialog.open) {
      rows = [];
      box.innerHTML = '';
    }
    for (const { path, node: n } of list) {
      if (rows.some((r) => r.path === path && r.id === n.id)) continue;
      rows.push({ path, id: n.id });
      const m = n.meta, est = has(m.estimateFirst) ? m.estimateFirst : m.estimate, logged = AT.logged(n);
      const title = (n.text || '').split('\n')[0] || tr('Task');
      const where = path && path !== S.file.path ? ` <span class="hint">${esc(MM.project.mapName(path))}</span>` : '';
      box.insertAdjacentHTML('beforeend', `<div class="act-row">
          <div class="act-title">${esc(title)}${where}</div>
          <div class="row">
            <input type="text" value="${esc(F(m.actual))}" placeholder="${esc(tr('e.g. 1h 30m'))}">
            ${logged ? `<button type="button" data-same="${esc(F(logged))}" title="${esc(tr('Sum of the stopwatch list ({n} entries)', { n: (m.timeLog || []).length }))}">⏱ ${esc(F(logged))}</button>` : ''}
            ${has(est) ? `<button type="button" data-same="${esc(F(est))}" title="${esc(tr('It took as long as estimated'))}">= ${esc(F(est))}</button>` : ''}
          </div>
        </div>`);
    }
    if (!rows.length) return;
    if (!dialog.open) {
      dialog.showModal();
      box.querySelector('input').focus();
    }
  };
})(window.MM);
