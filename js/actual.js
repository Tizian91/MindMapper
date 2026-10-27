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
   * Keeps the first estimate of tasks begun in this step and asks for the actual
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
      if (m.status === 'done' && om.status !== 'done' && AT.askable(n)) done.push(n.id);
    }
    if (done.length) setTimeout(() => AT.ask(done), 0);
  };

  /** Is the actual time of note n asked for once it is checked off? */
  AT.askable = (n) => S.settings.askActual !== false && !!n.meta &&
    // appointments and routines took the time they were set for
    !n.repeat && !n.meta.scheduled && !n.movedTo && !has(n.meta.actual) && has(n.meta.estimate);

  /** Note n of another map was checked off (written there, e.g. from a plan's task list): keep its first estimate. */
  AT.checkedOff = function (n) {
    if (n.meta && !has(n.meta.estimateFirst) && has(n.meta.estimate)) n.meta.estimateFirst = n.meta.estimate;
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
      const m = n.meta, est = has(m.estimateFirst) ? m.estimateFirst : m.estimate;
      const title = (n.text || '').split('\n')[0] || tr('Task');
      const where = path && path !== S.file.path ? ` <span class="hint">${esc(MM.project.mapName(path))}</span>` : '';
      box.insertAdjacentHTML('beforeend', `<div class="act-row">
          <div class="act-title">${esc(title)}${where}</div>
          <div class="row">
            <input type="text" value="${esc(F(m.actual))}" placeholder="${esc(tr('e.g. 1h 30m'))}">
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
