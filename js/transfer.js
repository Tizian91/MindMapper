'use strict';
/*
 * Moving notes between maps ("carry over by hand") and picking a target map.
 *
 * A moved note follows the bullet-journal idea the templates already use:
 *   - the copy in the target map gets `movedFrom` = path of the source map
 *   - the original stays where it is, but gets `movedTo` = path of the target
 *     and is greyed out. Everything that lists work (overview, carry over,
 *     filter counts) ignores notes with `movedTo`, so nothing shows up twice.
 *   - `movedCopyId` on the original remembers the copy, so "undo move" can
 *     delete it again.
 */
(function (MM) {
  const S = MM.state;
  const T = (MM.transfer = {});

  // ---- Target map picker -----------------------------------------------------

  let dlg = null;
  let resolver = null;

  function build() {
    dlg = document.createElement('dialog');
    dlg.id = 'map-picker-dialog';
    dlg.innerHTML = `
      <div class="dlg mp">
        <h3 class="mp-title">Move to map</h3>
        <div class="pick mp-quick"></div>
        <input type="search" class="mp-search" placeholder="Filter maps…">
        <div class="mp-list"></div>
        <div class="mp-new" hidden>
          <input type="text" class="mp-new-name" placeholder="Name">
          <input type="text" class="mp-new-folder" list="mp-folders" placeholder="Folder">
          <datalist id="mp-folders"></datalist>
          <button type="button" class="primary" data-mp="create">Create</button>
        </div>
        <div class="dlg-buttons">
          <button type="button" data-mp="new">New map…</button>
          <button type="button" data-mp="cancel">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    const search = dlg.querySelector('.mp-search');
    search.addEventListener('input', render);
    search.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const first = dlg.querySelector('.mp-row');
        if (first) choose(first.dataset.path);
      }
    });
    dlg.querySelector('.mp-new').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') create();
    });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) return close(null); // backdrop
      const row = e.target.closest('.mp-row');
      if (row) return choose(row.dataset.path);
      const dir = e.target.closest('.mp-dir');
      if (dir) {
        if (closedDirs.has(dir.dataset.dir)) closedDirs.delete(dir.dataset.dir);
        else closedDirs.add(dir.dataset.dir);
        return render();
      }
      const q = e.target.closest('[data-mp-quick]');
      if (q) return choose(q.dataset.mpQuick);
      if (e.target.closest('[data-mp="new"]')) return showNew();
      if (e.target.closest('[data-mp="create"]')) return create();
      if (e.target.closest('[data-mp="cancel"]')) close(null);
    });
    dlg.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') close(null);
    });
    dlg.addEventListener('close', () => {
      if (resolver) {
        const r = resolver;
        resolver = null;
        r(null);
      }
    });
  }

  const closedDirs = new Set(); // folders collapsed in the tree (kept while the page is open)

  /** Folder tree of the project like the sidebar, without the open map and empty folders. */
  function treeHTML(entries, depth, cur) {
    const esc = MM.render.esc;
    let h = '';
    for (const e of entries) {
      if (e.kind === 'dir') {
        const inner = treeHTML(e.children, depth + 1, cur);
        if (!inner) continue;
        const closed = closedDirs.has(e.path);
        h += `<div class="mp-dir${closed ? ' closed' : ''}" data-dir="${esc(e.path)}" style="--d:${depth}">` +
          `<span class="sb-caret"></span>${esc(e.name)}</div>`;
        if (!closed) h += inner;
      } else if (e.path !== cur) {
        h += `<div class="mp-row" data-path="${esc(e.path)}" style="--d:${depth}">` +
          `<span class="mp-name">${esc(MM.project.mapName(e.path))}</span></div>`;
      }
    }
    return h;
  }

  function render() {
    if (!dlg) return;
    const esc = MM.render.esc;
    // static texts follow the current language
    dlg.querySelector('.mp-search').placeholder = MM.tr('Filter maps…');
    dlg.querySelector('[data-mp="cancel"]').textContent = MM.tr('Cancel');
    dlg.querySelector('[data-mp="new"]').textContent = MM.tr('New map…');
    dlg.querySelector('[data-mp="create"]').textContent = MM.tr('Create');
    dlg.querySelector('.mp-new-name').placeholder = MM.tr('Name');
    dlg.querySelector('.mp-new-folder').placeholder = MM.tr('Folder (empty = top level)');
    const title = dlg.querySelector('.mp-title');
    if (title.dataset.en) title.textContent = MM.tr(title.dataset.en);
    const text = dlg.querySelector('.mp-search').value.trim().toLowerCase();
    const cur = S.file.path;
    const quick = dlg.querySelector('.mp-quick');
    quick.innerHTML = (T.quickTargets() || []).map((q) =>
      `<button type="button" class="pick-chip" data-mp-quick="${esc(q.path)}">${esc(q.label)}</button>`).join('');
    const list = dlg.querySelector('.mp-list');
    const none = `<p class="hint">${MM.tr('No maps found. Create one with "New map…".')}</p>`;
    if (!text) {
      list.innerHTML = treeHTML(MM.project.entries, 0, cur) || none;
      return;
    }
    // searching: a flat list of the matches with their folder
    const shown = MM.project.mapPaths().filter((p) => p !== cur && p.toLowerCase().includes(text));
    list.innerHTML = shown.length
      ? shown.map((p) => `<div class="mp-row" data-path="${esc(p)}">
          <span class="mp-name">${esc(MM.project.mapName(p))}</span>
          <span class="mp-folder muted">${esc(MM.project.folderOf(p) || MM.tr('(top level)'))}</span>
        </div>`).join('')
      : none;
  }

  /** "New map…": name and folder (the folder of the open map to start with). */
  function showNew() {
    const box = dlg.querySelector('.mp-new');
    box.hidden = false;
    dlg.querySelector('#mp-folders').innerHTML = MM.project.folders()
      .map((f) => `<option value="${MM.render.esc(f)}">`).join('');
    const name = dlg.querySelector('.mp-new-name');
    name.value = dlg.querySelector('.mp-search').value.trim();
    dlg.querySelector('.mp-new-folder').value = MM.project.folderOf(S.file.path);
    name.focus();
  }

  /** Pick the new map; it is created when the notes are moved (with the template matching its name). */
  function create() {
    const P = MM.project;
    const name = P.sanitizeName(dlg.querySelector('.mp-new-name').value).replace(/\.mindmap\.json$|\.json$/i, '');
    if (!name) return dlg.querySelector('.mp-new-name').focus();
    const folder = P.sanitizeFolder(dlg.querySelector('.mp-new-folder').value);
    choose((folder ? folder + '/' : '') + name + '.mindmap.json');
  }

  function choose(path) {
    if (!path) return;
    close(path);
  }

  function close(value) {
    T._extraQuick = null; // the quick picks of this call must not leak into the next menu
    // hand the result over first: the dialog's own 'close' listener would
    // otherwise resolve with null
    const r = resolver;
    resolver = null;
    if (dlg && dlg.open) dlg.close();
    if (r) r(value || null);
  }

  /**
   * Ask for a target map. Resolves with the chosen path or null.
   * opts.title: dialog heading; opts.suggestions: extra quick buttons.
   */
  T.pickMap = function (opts) {
    if (MM.project.status !== 'ready') {
      alert(MM.tr('Maps live in a project folder.\nOpen a folder in the "Project" sidebar first.'));
      return Promise.resolve(null);
    }
    if (!dlg) build();
    const o = opts || {};
    const titleEl = dlg.querySelector('.mp-title');
    titleEl.dataset.en = o.title || 'Move to map';
    titleEl.textContent = MM.tr(titleEl.dataset.en);
    dlg.querySelector('.mp-search').value = '';
    dlg.querySelector('.mp-new').hidden = true;
    T._extraQuick = Array.isArray(o.suggestions) ? o.suggestions : null;
    render();
    dlg.showModal();
    dlg.querySelector('.mp-search').focus();
    return new Promise((resolve) => (resolver = resolve));
  };

  /**
   * Quick picks based on the kind of the open map (day / week / month).
   * The dates are relative to the OPEN map, not to today: carrying a task from
   * last week's plan should offer that plan's neighbour, not this week.
   */
  T.quickTargets = function () {
    if (T._extraQuick) return T._extraQuick;
    const out = [];
    const cur = S.file.path;
    const base = cur ? MM.templates.parsePath(cur) : null; // { kind, date }
    const now = new Date();
    const add = (label, path) => {
      if (path && path !== cur && !out.some((q) => q.path === path)) out.push({ label, path });
    };
    const shift = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

    if (base && base.kind === 'day') {
      add(MM.tr('Next day'), MM.templates.dayPath(shift(base.date, 1)));
      add('This week', MM.templates.weekPath(base.date));
      if (base.date.toDateString() !== now.toDateString()) add('Today', MM.templates.dayPath(now));
    } else if (base && base.kind === 'week') {
      const mon = MM.templates.mondayOf(base.date);
      add(MM.tr('Next week'), MM.templates.weekPath(shift(mon, 7)));
      add('This month', MM.templates.monthPath(mon));
      add('Today', MM.templates.dayPath(now));
    } else if (base && base.kind === 'month') {
      const first = new Date(base.date.getFullYear(), base.date.getMonth(), 1);
      add(MM.tr('Next month'), MM.templates.monthPath(new Date(first.getFullYear(), first.getMonth() + 1, 1)));
      add('This week', MM.templates.weekPath(now));
      add('Today', MM.templates.dayPath(now));
    } else {
      add('Today', MM.templates.dayPath(now));
      add('This week', MM.templates.weekPath(now));
      add('This month', MM.templates.monthPath(now));
    }
    return out;
  };

  // ---- What travels together ---------------------------------------------------

  /** Is note n completely inside group g (like MM.interaction.groupMembers, for any doc)? */
  const inside = (n, g) => n.id !== g.id && !n.overlay && n.type !== 'draw' &&
    n.x >= g.x && n.y >= g.y && n.x + n.w <= g.x + g.w && n.y + n.h <= g.y + g.h;

  /**
   * Notes of doc that travel with the given ones (Move to map and carry over):
   *   - a note inside a group takes its (innermost) group along
   *   - everything below comes too, at any depth: notes an arrow points to
   *     (a task's sub-tasks, done ones as well) and the notes inside a group
   * Connections from outside into the bundle are no reason to come along, and
   * notes moved before (movedTo) stay. Notes that are linked that way form one
   * bundle, unrelated notes separate ones. Returns arrays of ids.
   * opts.group === false: without the group around a note (only what is below it).
   */
  T.bundles = function (doc, ids, opts) {
    const lift = !opts || opts.group !== false;
    const nodes = doc.nodes || {};
    const ok = (id) => !!nodes[id] && !nodes[id].movedTo;
    // smallest first, so the first group containing a note is the innermost one
    const groups = Object.values(nodes).filter((n) => n.type === 'group' && ok(n.id))
      .sort((a, b) => a.w * a.h - b.w * b.h);
    const below = new Map();
    const add = (a, b) => (below.has(a) ? below.get(a).push(b) : below.set(a, [b]));
    for (const e of Object.values(doc.edges || {})) {
      const a = e.source && e.source.node, b = e.target && e.target.node;
      if (a && b && a !== b) add(a, b);
    }
    for (const g of groups) for (const n of Object.values(nodes)) if (inside(n, g)) add(g.id, n.id);
    // drawings anchored to a note travel with it
    for (const n of Object.values(nodes)) if (n.type === 'draw' && n.anchor) add(n.anchor.node, n.id);

    let out = [];
    for (const id of ids) {
      if (!ok(id)) continue;
      const set = new Set();
      const walk = (k) => {
        if (set.has(k) || !ok(k)) return;
        set.add(k);
        for (const c of below.get(k) || []) walk(c);
      };
      const g = lift && groups.find((x) => inside(nodes[id], x));
      walk(g ? g.id : id);
      // bundles sharing a note become one
      const overlap = out.filter((b) => b.some((k) => set.has(k)));
      overlap.forEach((b) => b.forEach((k) => set.add(k)));
      out = out.filter((b) => !overlap.includes(b)).concat([[...set]]);
    }
    return out;
  };

  /**
   * Copy bundles of notes from src into doc: new ids, the connections inside
   * the bundles and the image data come along. Every bundle keeps its own
   * layout; the bundles lie side by side from x, their top edge at y.
   * Returns [{ src, copy }].
   */
  T.copyBundles = function (src, bundles, doc, x, y) {
    const copies = [], idMap = new Map();
    for (const ids of bundles) {
      const list = ids.map((id) => src.nodes[id]);
      const minX = Math.min(...list.map((n) => n.x)), minY = Math.min(...list.map((n) => n.y));
      const maxX = Math.max(...list.map((n) => n.x + n.w));
      for (const s of list) {
        const n = MM.clone(s);
        n.id = MM.uid('n');
        (n.items || []).forEach((i) => (i.id = MM.uid('i')));
        (n.blocks || []).forEach((b) => (b.id = MM.uid('b')));
        n.x = Math.round(x + s.x - minX);
        n.y = Math.round(y + s.y - minY);
        delete n.movedTo;
        n.movedCopyId = null;
        doc.nodes[n.id] = n;
        idMap.set(s.id, n.id);
        copies.push({ src: s, copy: n });
        // image data travels along (like A.copy), the target map is self-contained
        if (n.imageId && src.assets && src.assets[n.imageId]) {
          doc.assets = doc.assets || {};
          doc.assets[n.imageId] = src.assets[n.imageId];
        }
      }
      x += maxX - minX + 40;
    }
    // anchored drawings: anchored to the copy of their note (or free if it stayed behind)
    for (const { copy: n } of copies) {
      if (!n.anchor) continue;
      const a = doc.nodes[idMap.get(n.anchor.node)];
      n.anchor = a ? { node: a.id, box: { x: a.x, y: a.y, w: a.w, h: a.h } } : null;
    }
    for (const e of Object.values(src.edges || {})) {
      const a = idMap.get(e.source && e.source.node), b = idMap.get(e.target && e.target.node);
      if (!a || !b) continue;
      const ne = MM.clone(e);
      ne.id = MM.uid('e');
      ne.source = Object.assign({}, e.source, { node: a });
      ne.target = Object.assign({}, e.target, { node: b });
      doc.edges[ne.id] = ne;
    }
    return copies;
  };

  // ---- Moving ----------------------------------------------------------------

  /**
   * Copy the given notes into the map at `targetPath` and mark the originals
   * as moved. Returns the number of copied notes.
   */
  T.move = async function (nodeIds, targetPath) {
    if (MM.project.status !== 'ready') {
      alert(MM.tr('Moving notes needs a project folder.\nOpen a folder in the "Project" sidebar first.'));
      return 0;
    }
    const ids = (nodeIds || []).filter((id) => MM.node(id));
    if (!ids.length || !targetPath) return 0;
    if (targetPath === S.file.path) {
      alert(MM.tr('The notes are already in this map.'));
      return 0;
    }
    const movable = ids.map(MM.node).filter((n) => !n.movedTo);
    if (!movable.length) {
      alert(MM.tr('These notes were already moved to another map.'));
      return 0;
    }

    await MM.project.ensureMap(targetPath);
    const doc = await MM.project.readMap(targetPath);
    if (!doc) {
      alert(MM.tr('Could not read {path}', { path: targetPath }));
      return 0;
    }

    const fromLabel = S.file.path ? MM.project.mapName(S.file.path) : S.file.name;
    // sub-tasks, the group around a note and everything below come along
    const bundles = T.bundles(S.doc, movable.map((n) => n.id));
    // below everything else in the target (measured before the copies are added), hint above them
    const y = Math.round(MM.templates.bottomOf(doc) + 120);
    const copies = T.copyBundles(S.doc, bundles, doc, -560, y);
    for (const { copy: n } of copies) {
      // the copy lives on its own: no back-reference to the old map in link
      n.movedFrom = S.file.path || null;
      if (n.link === S.file.path) n.link = '';
    }
    const hint = MM.createNode('text', -560, y - 40, {
      text: 'Moved from ' + fromLabel, w: 260, h: 32, shape: 'none',
    });
    hint.style.textColor = '#c53030';
    hint.style.align = 'left';
    hint.style.fontSize = 13;
    doc.nodes[hint.id] = hint;
    // the copies remember the hint so "undo move" can take it away again
    for (const c of copies) c.copy.movedHintId = hint.id;

    await MM.project.writeMap(targetPath, doc);

    // mark the originals as moved (greyed out, no longer listed anywhere);
    // movedBatch: "undo move" on one of them takes the whole move back
    const batch = MM.uid('m');
    for (const c of copies) {
      c.src.movedTo = targetPath;
      c.src.movedCopyId = c.copy.id;
      c.src.movedBatch = batch;
      if (!c.src.link && c.src.type !== 'draw') c.src.link = targetPath;
    }
    MM.commit();
    if (S.file.handle) await MM.storage.writeFile();

    MM.tasks.refreshExternal(); // the target may be a derived map of a task here
    MM.load.scheduleRefresh();
    const extra = copies.length - movable.length;
    MM.ui.flash(extra > 0
      ? MM.tr('Moved {n} note(s) to {map} (with {m} sub-note(s) / group)', { n: movable.length, m: extra, map: MM.project.mapName(targetPath) })
      : MM.tr('Moved {n} note(s) to {map}', { n: copies.length, map: MM.project.mapName(targetPath) }));
    MM.refresh();
    return copies.length;
  };

  /** Move the selected notes to a map chosen in the picker. */
  T.moveSelection = async function () {
    const nodes = MM.selectedNodes().filter((n) => !n.movedTo);
    if (!nodes.length) {
      alert(MM.tr('Select one or more notes first (notes that were already moved cannot be moved again).'));
      return;
    }
    const target = await T.pickMap({ title: MM.tr('Move {n} note(s) to map', { n: nodes.length }) });
    if (!target) return;
    await T.move(nodes.map((n) => n.id), target);
  };

  /**
   * Undo a move: delete the copies in the target map and clear `movedTo` on
   * the originals. Notes moved together (movedBatch: sub-tasks, a group) are
   * taken back together.
   */
  T.undoMove = async function (node) {
    const n = node || MM.selectedNodes().find((x) => x.movedTo);
    if (!n || !n.movedTo) return;
    const targetPath = n.movedTo;
    const originals = n.movedBatch
      ? Object.values(S.doc.nodes).filter((x) => x.movedBatch === n.movedBatch && x.movedTo === targetPath)
      : [n];

    if (MM.project.find(targetPath)) {
      const doc = await MM.project.readMap(targetPath);
      if (doc) {
        let changed = false;
        const hints = new Set();
        for (const o of originals) {
          const copy = o.movedCopyId && doc.nodes[o.movedCopyId];
          if (!copy) continue;
          if (copy.movedHintId) hints.add(copy.movedHintId);
          delete doc.nodes[copy.id];
          changed = true;
        }
        // drop connections that pointed at the removed copies
        // (free ends have no node and stay untouched)
        for (const e of Object.values(doc.edges)) {
          if ((e.source.node && !doc.nodes[e.source.node]) || (e.target.node && !doc.nodes[e.target.node])) {
            delete doc.edges[e.id];
          }
        }
        // the "Moved from …" hint goes too, unless another copy still uses it
        for (const hintId of hints) {
          if (doc.nodes[hintId] && !Object.values(doc.nodes).some((x) => x.movedHintId === hintId)) {
            delete doc.nodes[hintId];
            changed = true;
          }
        }
        if (changed) await MM.project.writeMap(targetPath, doc);
      }
    }

    for (const o of originals) {
      if (o.link === targetPath) o.link = '';
      o.movedTo = null;
      o.movedCopyId = null;
      o.movedBatch = null;
    }
    MM.commit();
    if (S.file.handle) await MM.storage.writeFile();
    MM.tasks.refreshExternal();
    MM.load.scheduleRefresh();
    MM.ui.flash(MM.tr('Move undone'));
    MM.refresh();
  };

  /** Move target of a note as a label ("2026-W44"). */
  T.targetLabel = (node) => (node && node.movedTo ? MM.project.mapName(node.movedTo) : '');
})(window.MM);
