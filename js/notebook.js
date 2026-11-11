'use strict';
/*
 * Blocks (see plans/notebook-plan.md): a map with fixed pages, like a paper notepad -
 * one block per topic, written on mostly with the pen.
 *
 * A block is a normal map with doc.page (cleaned by MM.cleanPage, state.js):
 *   { id, size 'A4', orient 'portrait'|'landscape', count, ruling, paper, created: [day per page] }
 * The pages lie one below the other in world coordinates: page k (from 0) at
 *   x = 0, y = k * (H + GAP)
 * A note belongs to the page its position lies on - notes have no page field, so all the
 * tools of the map (pen, shapes, text, images) work on a block unchanged.
 * Blocks live in Blocks/ of the project folder (own sidebar section, project.js).
 */
(function (MM) {
  const S = MM.state;
  const NB = (MM.notebook = {});
  const tr = (s, v) => MM.tr(s, v);
  NB.FOLDER = 'Blocks';
  NB.IMAGE_FOLDER = '_images'; // Blocks/_images/<block id>/ (step 3 of the plan)
  NB.GAP = 40;  // world px between two pages
  NB.HEAD = 26; // head line at the top of a page (name, page, date)

  /** Is the open map (or `doc`) a block? */
  NB.on = (doc = S.doc) => !!(doc && doc.page);

  /** Width / height of a page in world px. */
  NB.dims = function (page = S.doc.page) {
    const [w, h] = MM.PAGE_SIZES[page.size] || MM.PAGE_SIZES.A4;
    return page.orient === 'landscape' ? { w: h, h: w } : { w, h };
  };

  /** Box of page k (from 0) in world coordinates. */
  NB.pageBox = function (k, page = S.doc.page) {
    const { w, h } = NB.dims(page);
    return { x: 0, y: k * (h + NB.GAP), w, h };
  };

  /** Page at world height y (nearest one, within 0 … count-1). */
  NB.pageOf = function (y, page = S.doc.page) {
    const { h } = NB.dims(page);
    const k = Math.floor((y + NB.GAP / 2) / (h + NB.GAP));
    return Math.max(0, Math.min(page.count - 1, k));
  };

  const today = () => {
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  /** A new, empty block: one page. */
  NB.newDoc = function (opts = {}) {
    const doc = MM.emptyDoc();
    doc.carriedOver = true; // no plan: nothing to carry over
    doc.page = MM.cleanPage({
      id: MM.pageId(), size: 'A4', orient: opts.orient, ruling: opts.ruling, paper: opts.paper, count: 1, created: [today()],
    });
    return doc;
  };

  // ---- Pages on the map (below the notes) ---------------------------------------------

  let layer = null, lastKey = '';

  /** Name of the open block for the head lines. */
  function blockName() {
    return S.file.path ? MM.project.mapName(S.file.path) : S.file.name.replace(/\.mindmap\.json$|\.json$/i, '');
  }

  const fmtDay = (d) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString(MM.getLang(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  /** Draw the paper sheets (only when something about them changed). */
  NB.render = function () {
    if (!layer) layer = document.getElementById('page-layer');
    if (!layer) return;
    const page = S.doc.page;
    document.getElementById('viewport').classList.toggle('block-mode', !!page);
    const key = page ? JSON.stringify([page, blockName(), MM.getLang()]) : '';
    if (key === lastKey) return;
    lastKey = key;
    if (!page) {
      layer.innerHTML = '';
      if (bar) bar.hidden = true;
      return;
    }
    renderBar(); // name, number of pages
    const esc = MM.render.esc, name = esc(blockName());
    let h = '';
    for (let k = 0; k < page.count; k++) {
      const b = NB.pageBox(k, page);
      h += `<div class="nb-page" data-page="${k}" data-ruling="${esc(page.ruling)}" ` +
        `style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;--nb-paper:${esc(page.paper)};--nb-head:${NB.HEAD}px">` +
        `<div class="nb-head"><span>${name}</span><span>${esc(tr('Page {n}', { n: k + 1 }))} · ${esc(fmtDay(page.created[k]))}</span></div></div>`;
    }
    layer.innerHTML = h;
  };

  // ---- Current page, only nearby pages drawn ---------------------------------------------
  // Notes further than one page from the visible area get the class "offpage" (display:
  // none): the browser neither lays them out nor paints them, their elements stay (editing,
  // undo, selection keep working). Recomputed only when the range of pages changes.

  NB.cur = 0;          // page shown (the one in the middle of the screen)
  let range = '';      // key of the drawn range
  let lo = 0, hi = -1; // world y range drawn
  let all = false;     // NB.showAll: everything drawn (export)
  let seenId = '';     // block whose first view was set up
  let shownId = '';    // block a page of which was shown on purpose (NB.show, e.g. a link to a page)

  /** Is note n outside the pages drawn now? */
  NB.off = function (n) {
    if (!S.doc.page || all) return false;
    if (n.y <= hi && n.y + n.h >= lo) return false;
    return !S.selection.has(n.id) && !(MM.editing && MM.editing.nodeId === n.id);
  };

  function cull() {
    const R = MM.render;
    for (const [id, div] of R.nodeEls) {
      const n = S.doc.nodes[id];
      if (!n) continue;
      const off = NB.off(n);
      if (div.classList.contains('offpage') === off) continue;
      div.classList.toggle('offpage', off);
      if (!off && R.autoGrow(div, n)) R.updateFrame(div, n); // changed while hidden (undo)
    }
  }

  /** Draw every note (true) for the PDF / PNG copy, or only nearby pages again (false). */
  NB.showAll = function (on) {
    all = !!on;
    range = '';
    if (S.doc.page) NB.onView();
  };

  const vpRect = () => document.getElementById('viewport').getBoundingClientRect();

  /** After every change of the view (render.js applyView): current page, range drawn, bar. */
  NB.onView = function () {
    const page = S.doc.page;
    if (!page) {
      if (bar) bar.hidden = true;
      return;
    }
    const r = vpRect(), v = S.doc.view;
    if (!r.height) return;
    const top = -v.y / v.zoom, bottom = (r.height - v.y) / v.zoom;
    if (page.id !== seenId) {
      seenId = page.id;
      // a new block (view never moved): show its first page
      if (!v.x && !v.y && v.zoom === 1) return setTimeout(() => { if (shownId !== page.id) NB.show(0); }, 0);
      // a touch screen: write at once
      if (navigator.maxTouchPoints > 0 && MM.ink && !MM.ink.on()) setTimeout(() => MM.ink.toggle(true), 0);
    }
    const k0 = Math.max(0, NB.pageOf(top) - 1), k1 = Math.min(page.count - 1, NB.pageOf(bottom) + 1);
    const key = [page.id, page.count, page.orient, k0, k1, all].join(':');
    if (key !== range) {
      range = key;
      lo = NB.pageBox(k0).y - NB.GAP;
      hi = NB.pageBox(k1).y + NB.dims().h + NB.GAP;
      cull();
    }
    const cur = NB.pageOf((top + bottom) / 2);
    if (cur !== NB.cur || !bar || bar.hidden) {
      NB.cur = cur;
      renderBar();
    }
  };

  /** Show page k: fit its width (or the whole page, settings.blockFit), its top at the top. */
  NB.show = function (k) {
    const page = S.doc.page;
    if (!page) return;
    k = Math.max(0, Math.min(page.count - 1, k));
    const b = NB.pageBox(k), r = vpRect(), v = S.doc.view;
    const topPad = 72, botPad = 76, side = 16; // room for the pen palette (top) and the bar (bottom)
    const zWidth = Math.min(2, (r.width - 2 * side) / b.w);
    const zPage = Math.min(zWidth, (r.height - topPad - botPad) / b.h);
    const z = MM.geo.clamp(S.settings.blockFit === 'page' ? zPage : zWidth, 0.1, 4);
    v.zoom = z;
    v.x = (r.width - b.w * z) / 2 - b.x * z;
    v.y = topPad - b.y * z;
    NB.cur = k;
    shownId = page.id;
    MM.refresh();
    renderBar();
  };

  /** Next / previous page. */
  NB.turn = function (d) {
    const page = S.doc.page;
    if (!page) return;
    if (NB.cur + d >= page.count) {
      MM.ui.flash(tr('Last page - "+" adds a new one'));
      return;
    }
    NB.show(NB.cur + d);
  };

  // ---- Pages: add, delete, move ------------------------------------------------------------

  /** Page of a note - an anchored drawing goes with its note. */
  function pageOfNode(n, page) {
    const a = n.anchor && S.doc.nodes[n.anchor.node];
    const m = a || n;
    return NB.pageOf(m.y + Math.min(m.h, 40) / 2, page);
  }

  const onPage = (k) => Object.values(S.doc.nodes).filter((n) => pageOfNode(n, S.doc.page) === k);

  /**
   * Move every note from its page k to page fn(k) (-1: delete it) and take the new page
   * settings `next` (count, orientation …). One undo step.
   */
  function remap(fn, next) {
    const doc = S.doc, old = doc.page;
    const dy = (k, nk) => NB.pageBox(nk, next).y - NB.pageBox(k, old).y;
    const gone = new Set();
    const moves = [];
    for (const n of Object.values(doc.nodes)) {
      const k = pageOfNode(n, old), nk = fn(k);
      if (nk < 0) gone.add(n.id);
      else if (nk !== k || next.orient !== old.orient) moves.push([n, dy(k, nk)]);
    }
    for (const [n, d] of moves) n.y = Math.round((n.y + d) * 100) / 100;
    for (const id of gone) {
      delete doc.nodes[id];
      S.selection.delete(id);
    }
    for (const e of Object.values(doc.edges)) {
      if ((e.source.node && gone.has(e.source.node)) || (e.target.node && gone.has(e.target.node))) {
        delete doc.edges[e.id];
        continue;
      }
      for (const end of [e.source, e.target]) {
        if (end.node) continue;
        const k = NB.pageOf(end.y, old), nk = fn(k);
        if (nk >= 0) end.y += dy(k, nk);
      }
    }
    doc.page = next;
    MM.commit();
  }

  /** Insert an empty page at index i (count = after the last one). */
  NB.insert = function (i) {
    const page = S.doc.page;
    if (!page) return;
    if (page.count >= MM.PAGE_MAX) return;
    const next = MM.clone(page);
    next.count++;
    next.created.splice(i, 0, today());
    remap((k) => (k >= i ? k + 1 : k), next);
    NB.show(i);
  };

  /** Delete page k (asks when something is on it). The only page is emptied instead. */
  NB.remove = function (k) {
    const page = S.doc.page;
    if (!page) return;
    const n = onPage(k).length;
    if (page.count === 1) {
      if (!n || !confirm(tr('Clear the only page of this block ({n} objects)?', { n }))) return;
      remap(() => -1, MM.clone(page));
      return;
    }
    if (n && !confirm(tr('Delete page {page} with {n} objects?', { page: k + 1, n }))) return;
    const next = MM.clone(page);
    next.count--;
    next.created.splice(k, 1);
    remap((j) => (j === k ? -1 : j > k ? j - 1 : j), next);
    NB.show(Math.min(k, next.count - 1));
  };

  /** Swap page k with its neighbour (d = -1 up / +1 down). */
  NB.move = function (k, d) {
    const page = S.doc.page, j = k + d;
    if (!page || j < 0 || j >= page.count) return;
    const next = MM.clone(page);
    [next.created[k], next.created[j]] = [next.created[j], next.created[k]];
    remap((x) => (x === k ? j : x === j ? k : x), next);
    NB.show(j);
  };

  /** Change the look: { ruling, paper, orient } (orient moves the notes with their pages). */
  NB.setLook = function (change) {
    const page = S.doc.page;
    if (!page) return;
    remap((k) => k, Object.assign(MM.clone(page), change));
    if (change.orient) NB.show(NB.cur);
  };

  /** "Copy link to this page": a Markdown link - for a diary entry, or the link field of a note. */
  NB.copyLink = async function (k) {
    if (!S.file.path) {
      alert(tr('Only a block in the project folder can be linked.'));
      return;
    }
    const text = `[${blockName()} · ${tr('p. {n}', { n: k + 1 })}](${S.file.path}#${k + 1})`;
    const ok = await MM.links.copy(text);
    MM.ui.flash(ok ? tr('Link copied - paste it into a diary entry or the link of a note') : text);
  };

  /** Ctrl+A in a block: the notes of the current page. */
  NB.selectPage = function () {
    MM.select(onPage(NB.cur).map((n) => n.id));
    MM.refresh();
  };

  // ---- Bar of the block (bottom) ----------------------------------------------------------

  let bar = null;
  const PAPERS = [['#fdfdf8', 'White'], ['#fdf8ec', 'Cream'], ['#fffbe0', 'Yellow'], ['#f1f4f7', 'Grey'], ['#eef5ff', 'Blue']];

  function renderBar() {
    const page = S.doc.page;
    if (!page) {
      if (bar) bar.hidden = true;
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'nb-bar';
      bar.addEventListener('pointerdown', (e) => e.stopPropagation());
      bar.addEventListener('click', onBar);
      document.getElementById('app').append(bar);
    }
    const esc = MM.render.esc, pen = MM.ink && MM.ink.on(), tool = pen && MM.ink.cfg().tool;
    const b = (a, label, title, cls = '') => `<button type="button" data-nb="${a}" class="${cls}" title="${esc(tr(title))}">${label}</button>`;
    const html =
      b('prev', '◀', 'Previous page (Page Up)', NB.cur ? '' : 'dim') +
      b('pages', esc(tr('Page {n} / {count}', { n: NB.cur + 1, count: page.count })), 'Go to page…', 'nb-label') +
      b('next', '▶', 'Next page (Page Down)', NB.cur < page.count - 1 ? '' : 'dim') +
      b('add', '＋', 'New page at the end') +
      b('more', '⋯', 'Page: insert, move, delete') +
      '<span class="nb-sep"></span>' +
      b('pen', '✍️', 'Pen on / off (P)', pen && tool !== 'text' ? 'active' : '') +
      b('text', '<b class="nb-t">T</b>', 'Text: tap where it goes', pen && tool === 'text' ? 'active' : '') +
      b('camera', '📷', 'Take a photo (straight onto this page)') +
      b('gallery', '🖼️', 'Add pictures from the device') +
      b('todo', '☐', 'To-do list') +
      '<span class="nb-sep"></span>' +
      b('design', '🎨', 'Paper, ruling, page view');
    if (html !== bar._html) bar.innerHTML = bar._html = html; // rebuilt only when changed: no lost clicks
    const r = vpRect();
    bar.style.bottom = Math.max(8, window.innerHeight - r.bottom + 10) + 'px';
    bar.style.left = r.left + r.width / 2 + 'px';
    bar.hidden = false;
  }
  NB.renderBar = renderBar;

  function menuAt(btn, items) {
    const r = btn.getBoundingClientRect();
    MM.menu.open(items, r.left, r.top - 4);
  }

  function onBar(e) {
    const btn = e.target.closest('[data-nb]');
    if (!btn || !S.doc.page) return;
    const page = S.doc.page, a = btn.dataset.nb, k = NB.cur;
    const fmt = (i) => tr('Page {n}', { n: i + 1 }) + ' · ' + fmtDay(page.created[i]);
    if (a === 'prev') NB.turn(-1);
    else if (a === 'next') NB.turn(1);
    else if (a === 'add') NB.insert(page.count);
    else if (a === 'pages') {
      menuAt(btn, page.created.map((d, i) => ({ label: fmt(i), checked: i === k, action: () => NB.show(i) })));
    } else if (a === 'more') {
      menuAt(btn, [
        { label: 'Insert a page before this one', action: () => NB.insert(k) },
        { label: 'Insert a page after this one', action: () => NB.insert(k + 1) },
        '-',
        { label: 'Move page up', disabled: k === 0, action: () => NB.move(k, -1) },
        { label: 'Move page down', disabled: k >= page.count - 1, action: () => NB.move(k, 1) },
        '-',
        { label: 'Delete this page…', action: () => NB.remove(k) },
        '-',
        { label: 'Pictures of this block…', action: NB.showPictures },
        { label: 'Print / PDF…', shortcut: 'Ctrl+P', action: () => MM.mapPrint.open() },
        { label: 'Copy link to this page', action: () => NB.copyLink(k) },
      ]);
    } else if (a === 'pen') {
      const pen = MM.ink.on();
      if (pen && MM.ink.cfg().tool === 'text') {
        MM.ink.cfg().tool = 'pen';
        MM.ink.toggle(true);
      } else MM.ink.toggle(!pen);
      MM.saveSettings();
      renderBar();
    } else if (a === 'text') {
      MM.ink.cfg().tool = 'text';
      MM.ink.toggle(true);
      MM.saveSettings();
      renderBar();
    } else if (a === 'camera' || a === 'gallery') {
      NB.addPhotos(a === 'camera');
    } else if (a === 'todo') {
      if (MM.ink.on()) MM.ink.toggle(false);
      const pb = NB.pageBox(k), c = MM.viewCenter();
      const at = { x: MM.geo.clamp(c.x, pb.x + 140, pb.x + pb.w - 140), y: MM.geo.clamp(c.y, pb.y + 80, pb.y + pb.h - 80) };
      MM.actions.addNode('todo', at);
      renderBar();
    } else if (a === 'design') {
      const check = (on, label) => ({ label, checked: on });
      menuAt(btn, [
        { label: 'Ruling', submenu: Object.entries(MM.PAGE_RULINGS).map(([v, l]) => ({ ...check(page.ruling === v, l), action: () => NB.setLook({ ruling: v }) })) },
        { label: 'Paper colour', submenu: PAPERS.map(([v, l]) => ({ ...check(page.paper === v, l), action: () => NB.setLook({ paper: v }) })) },
        { label: 'Orientation', submenu: [
          { ...check(page.orient === 'portrait', 'A4 portrait'), action: () => NB.setLook({ orient: 'portrait' }) },
          { ...check(page.orient === 'landscape', 'A4 landscape'), action: () => NB.setLook({ orient: 'landscape' }) }] },
        '-',
        { ...check(S.settings.blockFit !== 'page', 'Page view: fit the width'), action: () => setFit('width') },
        { ...check(S.settings.blockFit === 'page', 'Page view: whole page'), action: () => setFit('page') },
      ]);
    }
  }

  function setFit(v) {
    S.settings.blockFit = v;
    MM.saveSettings();
    NB.show(NB.cur);
  }

  // ---- Images of a block: files in Blocks/_images/<block id>/ ---------------------------
  // A block is made for photos: kept as data in the map (doc.assets) every autosave would
  // upload them again. So a block keeps them as files (n.imageFile = "<block id>/<id>.jpg",
  // MM.IMAGE_FILE). Files are never overwritten (a new id per picture) and never deleted
  // on their own (undo) - the image list of the block (🖼) shows unused ones to clean up.
  // Normal maps and diaries keep their pictures inside (copies are embedded, NB.fitImages).

  NB.IMAGE_SIZE = { max: 1600, quality: 0.8 }; // plenty for an A4 page
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

  NB.imagePath = (file) => `${NB.FOLDER}/${NB.IMAGE_FOLDER}/${file}`;

  /** Does `doc` (default: the open map) keep its pictures as files? A block in the project folder. */
  NB.storesFiles = function (doc = S.doc) {
    return !!(doc && doc.page && MM.project && MM.project.status === 'ready' && (doc !== S.doc || S.file.path));
  };

  const cache = new Map(); // file -> { state: 'loading' | 'ok' | 'missing', url, blob }
  const cloud = () => !!(MM.project.backend && MM.project.backend.kind === 'dropbox');
  const idbKey = (file) => 'blockimg:' + file;

  /** Load state of a picture file without loading it ('none' if not asked for yet). */
  NB.imageState = (file) => (cache.get(file) || { state: 'none' }).state;

  /** { state, url } of a picture file; starts loading it (the note is drawn again then). */
  NB.imageUrl = function (file) {
    let c = cache.get(file);
    if (!c) {
      c = { state: 'loading', url: '' };
      cache.set(file, c);
      loadImage(file, c);
    }
    return c;
  };

  async function loadImage(file, c) {
    let blob = null;
    // Dropbox: a copy in this browser (pictures never change) - also offline
    if (cloud() || MM.project.status !== 'ready') {
      try { blob = await MM.storage.idb.get(idbKey(file)); } catch (e) { /* no copy */ }
    }
    if (!blob && MM.project.status === 'ready') {
      try {
        blob = await MM.project.backend.readBlob(NB.imagePath(file));
        if (blob && cloud()) MM.storage.idb.set(idbKey(file), blob).catch(() => {});
      } catch (e) { /* missing or offline */ }
    }
    if (!blob && MM.project.status !== 'ready') {
      cache.delete(file); // the folder is not connected yet: again after P.scan (NB.retryImages)
      return;
    }
    c.state = blob ? 'ok' : 'missing';
    c.url = blob ? URL.createObjectURL(blob) : '';
    c.blob = blob;
    MM.render.all();
    if (picList) renderPictures(); // the list of pictures shows it as well
  }

  /** The project folder is (again) there: load the pictures that could not be loaded. */
  NB.retryImages = function () {
    let any = false;
    for (const [file, c] of cache) {
      if (c.state === 'missing') {
        cache.delete(file);
        any = true;
      }
    }
    if (any || S.doc.page) MM.render.all();
  };

  function dataUrlToBlob(url) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
    if (!m) return null;
    const bytes = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const a = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) a[i] = bytes.charCodeAt(i);
    return new Blob([a], { type: m[1] });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  /**
   * Write a picture (data URL or Blob) as a file of block `doc`. Returns its imageFile, or ''
   * when it stays inside the map (no block in a folder, SVG, no write access, an error).
   */
  NB.storeImage = async function (data, doc = S.doc) {
    if (!NB.storesFiles(doc)) return '';
    const blob = typeof data === 'string' ? dataUrlToBlob(data) : data;
    const ext = blob && EXT[blob.type];
    if (!ext) return '';
    const file = `${doc.page.id}/${MM.pageId()}.${ext}`;
    try {
      await MM.project.writeBlob(NB.imagePath(file), blob);
    } catch (err) {
      console.warn('MindMapper: picture kept in the map', err);
      return '';
    }
    cache.set(file, { state: 'ok', url: URL.createObjectURL(blob), blob });
    if (cloud()) MM.storage.idb.set(idbKey(file), blob).catch(() => {});
    return file;
  };

  /** The data of a picture note (file or embedded) as a Blob, or null. */
  NB.imageBlob = async function (n, doc = S.doc) {
    if (n.imageFile) {
      const c = cache.get(n.imageFile);
      if (c && c.blob) return c.blob;
      try {
        const copy = await MM.storage.idb.get(idbKey(n.imageFile)); // Dropbox: the copy in this browser
        if (copy) return copy;
      } catch (e) { /* none */ }
      try { return await MM.project.backend.readBlob(NB.imagePath(n.imageFile)); } catch (e) { return null; }
    }
    const url = doc.assets && doc.assets[n.imageId];
    return url ? dataUrlToBlob(url) : null;
  };


  /**
   * Pictures of copied / moved notes fit their new map: into a block as its own files, into
   * a normal map embedded again (a map never points into the folder of a block).
   * Returns the number of pictures changed (0: nothing to do or not possible now).
   */
  NB.fitImages = async function (doc, nodes) {
    let changed = 0;
    const toFiles = NB.storesFiles(doc);
    for (const n of nodes) {
      if (!n || n.type !== 'image') continue;
      if (toFiles) {
        // a file of another block or an embedded picture: a file of this block
        if (n.imageFile && n.imageFile.startsWith(doc.page.id + '/')) continue;
        const blob = await NB.imageBlob(n, doc);
        const file = blob && (await NB.storeImage(blob, doc));
        if (!file) continue;
        n.imageFile = file;
        delete n.imageId;
        changed++;
      } else if (n.imageFile) {
        const blob = await NB.imageBlob(n, doc);
        if (!blob) continue; // stays a reference until it can be read (shown while the file is there)
        const id = MM.uid('a');
        doc.assets = doc.assets || {};
        doc.assets[id] = await blobToDataUrl(blob);
        n.imageId = id;
        delete n.imageFile;
        changed++;
      }
    }
    return changed;
  };

  /**
   * After pasting into the open map: its pictures fit it (see fitImages) - no undo step
   * of its own (undo takes back the paste).
   */
  NB.fitPasted = async function (ids) {
    const doc = S.doc;
    const nodes = ids.map((id) => doc.nodes[id]).filter((n) => n && n.type === 'image' && (n.imageFile || NB.storesFiles(doc)));
    if (!nodes.length) return;
    if (!(await NB.fitImages(doc, nodes)) || doc !== S.doc) return;
    MM.history.rebase();
    S.dirty = true;
    S.rev++;
    MM.storage.scheduleAutosave();
    MM.refresh();
  };

  /** 📷 / 🖼 of the bar: photos onto the page shown, about as wide as the page; then the pen. */
  NB.addPhotos = async function (camera) {
    const page = S.doc.page;
    if (!page) return;
    const files = await MM.images.pick(!camera, camera);
    if (!files.length || S.doc.page !== page) return;
    const b = NB.pageBox(NB.cur), v = S.doc.view;
    const width = b.w - 80;
    // below the head, or at the top of what is visible of the page
    const top = Math.max(b.y + NB.HEAD + 24, -v.y / v.zoom + 24);
    const ids = await MM.images.insertFiles(files, { x: b.x + b.w / 2, y: Math.min(top, b.y + b.h - 200) }, { width, top: true });
    if (!ids.length) return;
    MM.select([]);
    MM.refresh();
    if (MM.ink && !MM.ink.on()) MM.ink.toggle(true); // to write on it
  };

  /** The picture files of the block at `path`: { id, folder, files: [name] }, or null (no block). */
  NB.picturesOf = async function (path) {
    const doc = path === S.file.path ? S.doc : await MM.project.readMap(path);
    if (!doc || !doc.page) return null;
    const folder = `${NB.FOLDER}/${NB.IMAGE_FOLDER}/${doc.page.id}`;
    let files = [];
    try {
      files = (await MM.project.backend.list(folder)).filter((e) => e.kind === 'file' && !e.name.startsWith('.')).map((e) => e.name);
    } catch (e) { /* no pictures yet */ }
    return { id: doc.page.id, folder, files };
  };

  /** A block was deleted: offer to delete its pictures as well. */
  NB.deletePictures = async function (pics) {
    if (!pics || !pics.files.length) return;
    if (!confirm(tr('Also delete the {n} picture(s) of this block?\n\nThey are not used anywhere else.', { n: pics.files.length }))) return;
    try {
      await MM.project.backend.removeDir(pics.folder);
      for (const name of pics.files) cache.delete(`${pics.id}/${name}`);
    } catch (err) {
      alert(tr('Could not delete the pictures: {err}', { err: err.message }));
    }
  };

  // ---- Pictures of the open block (dialog) ---------------------------------------------------

  let picDialog = null, picList = null;

  NB.showPictures = async function () {
    const page = S.doc.page;
    if (!page) return;
    if (!NB.storesFiles()) {
      alert(tr('The pictures of a block are kept as files in the project folder.\nThis block is not part of an open project folder.'));
      return;
    }
    const esc = MM.render.esc;
    if (!picDialog) {
      picDialog = document.createElement('dialog');
      picDialog.id = 'nb-pictures';
      picDialog.addEventListener('keydown', (e) => e.stopPropagation());
      picDialog.addEventListener('click', onPictures);
      picDialog.addEventListener('close', () => { picList = null; });
      document.body.appendChild(picDialog);
    }
    picDialog.innerHTML = `<div class="dlg"><h3>${esc(tr('Pictures of this block'))}</h3><p class="hint">${esc(tr('Loading…'))}</p></div>`;
    if (!picDialog.open) picDialog.showModal();
    const pics = await NB.picturesOf(S.file.path);
    if (!pics || !picDialog.open) return;
    // which page shows each file (several notes may show the same one)
    const used = new Map();
    for (const n of Object.values(S.doc.nodes)) {
      if (n.type !== 'image' || !n.imageFile) continue;
      if (!used.has(n.imageFile)) used.set(n.imageFile, []);
      used.get(n.imageFile).push(n);
    }
    picList = pics.files.map((name) => ({ file: `${pics.id}/${name}`, notes: used.get(`${pics.id}/${name}`) || [] }));
    // shown on the pages but no file (deleted outside the app)
    for (const [file, notes] of used) if (!pics.files.some((name) => `${pics.id}/${name}` === file)) picList.push({ file, notes, gone: true });
    picList.sort((a, b) => (a.notes.length ? NB.pageOf(a.notes[0].y) : 1e9) - (b.notes.length ? NB.pageOf(b.notes[0].y) : 1e9));
    renderPictures();
  };

  function renderPictures() {
    if (!picDialog || !picList) return;
    const esc = MM.render.esc;
    const unused = picList.filter((p) => !p.notes.length && !p.gone);
    const size = (p) => {
      const c = cache.get(p.file);
      return c && c.blob ? MM.files.humanSize(c.blob.size) : '';
    };
    const cards = picList.map((p, i) => {
      const c = p.gone ? null : NB.imageUrl(p.file);
      const thumb = c && c.state === 'ok' ? `<img src="${esc(c.url)}" alt="">` : `<span>${esc(tr(p.gone ? 'File missing' : c && c.state === 'missing' ? 'Image missing' : 'Loading…'))}</span>`;
      const where = p.notes.length
        ? [...new Set(p.notes.map((n) => NB.pageOf(n.y)))].map((k) => `<button type="button" data-pic-go="${i}" data-page="${k}">${esc(tr('Page {n}', { n: k + 1 }))}</button>`).join('')
        : p.gone ? '' : `<label class="nb-pic-unused"><input type="checkbox" data-pic-del="${i}" checked> ${esc(tr('unused'))}</label>`;
      return `<div class="nb-pic${p.notes.length ? '' : ' unused'}"><div class="nb-pic-thumb">${thumb}</div>` +
        `<div class="nb-pic-info"><span>${esc(size(p))}</span>${where}` +
        (p.gone ? '' : `<button type="button" data-pic-save="${i}" title="${esc(tr('Save the original'))}">⤓</button>`) + '</div></div>';
    }).join('');
    picDialog.innerHTML = `<div class="dlg nb-pics-dlg">
      <h3>${esc(tr('Pictures of this block'))}</h3>
      <p class="hint">${esc(tr('{n} picture(s) in Blocks/_images/ - {u} of them not used on any page (e.g. deleted notes; undo may still need them).', { n: picList.filter((p) => !p.gone).length, u: unused.length }))}</p>
      <div class="nb-pic-grid">${cards || `<p class="hint">${esc(tr('No pictures yet - 📷 and 🖼 in the bar add some.'))}</p>`}</div>
      <div class="dlg-buttons">
        ${unused.length ? `<button type="button" data-pic="delete" class="danger">${esc(tr('Delete the chosen unused pictures…'))}</button>` : ''}
        <button type="button" data-pic="close" class="primary">${esc(tr('Close'))}</button>
      </div></div>`;
  }

  async function onPictures(e) {
    const t = e.target;
    if (t === picDialog) return picDialog.close(); // click beside the box
    const go = t.closest('[data-pic-go]'), save = t.closest('[data-pic-save]'), act = t.closest('[data-pic]');
    if (go) {
      const p = picList[+go.dataset.picGo], k = +go.dataset.page;
      picDialog.close();
      NB.show(k);
      MM.select(p.notes.filter((n) => NB.pageOf(n.y) === k).map((n) => n.id));
      MM.refresh();
    } else if (save) {
      const p = picList[+save.dataset.picSave];
      NB.saveOriginal(p.notes[0] || { type: 'image', imageFile: p.file, text: '' });
    } else if (act && act.dataset.pic === 'close') {
      picDialog.close();
    } else if (act && act.dataset.pic === 'delete') {
      const chosen = [...picDialog.querySelectorAll('[data-pic-del]:checked')].map((x) => picList[+x.dataset.picDel]);
      if (!chosen.length || !confirm(tr('Delete {n} unused picture(s)? This cannot be undone.', { n: chosen.length }))) return;
      for (const p of chosen) {
        try {
          await MM.project.backend.remove(NB.imagePath(p.file));
          cache.delete(p.file);
          MM.storage.idb.set(idbKey(p.file), undefined).catch(() => {});
        } catch (err) {
          alert(tr('Could not delete the pictures: {err}', { err: err.message }));
          break;
        }
      }
      NB.showPictures();
    }
  }

  /** Save the picture of note n as a file (Downloads). */
  NB.saveOriginal = async function (n) {
    const blob = n && (await NB.imageBlob(n));
    if (!blob) {
      alert(tr('The picture could not be read.'));
      return;
    }
    const ext = EXT[blob.type] || (n.imageFile || '').split('.').pop() || 'png';
    const base = (n.text || '').split('\n')[0].trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 60) ||
      (S.doc.page ? blockName() : tr('image'));
    const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: MIME[ext] }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  // ---- "New block" dialog ---------------------------------------------------------------

  let dialog = null;

  function build() {
    const esc = MM.render.esc;
    const d = document.createElement('dialog');
    d.id = 'new-block-dialog';
    const rulings = Object.entries(MM.PAGE_RULINGS)
      .map(([k, l]) => `<option value="${k}"${k === 'grid' ? ' selected' : ''}>${esc(tr(l))}</option>`).join('');
    d.innerHTML = `
      <form method="dialog" class="dlg">
        <h3>${esc(tr('New block'))}</h3>
        <label class="row"><span>${esc(tr('Topic'))}</span><input type="text" name="name" required></label>
        <label class="row"><span>${esc(tr('Folder'))}</span><input type="text" name="folder" list="block-folders" placeholder="${esc(tr('(top level)'))}"></label>
        <datalist id="block-folders"></datalist>
        <label class="row"><span>${esc(tr('Paper'))}</span><select name="orient">
          <option value="portrait">${esc(tr('A4 portrait'))}</option><option value="landscape">${esc(tr('A4 landscape'))}</option></select></label>
        <label class="row"><span>${esc(tr('Ruling'))}</span><select name="ruling">${rulings}</select></label>
        <p class="hint">${esc(tr('A block is a notepad for one topic: A4 pages to write on with the pen, type on or add photos to.'))}</p>
        <div class="dlg-buttons">
          <button type="button" data-dlg="cancel">${esc(tr('Cancel'))}</button>
          <button type="submit" class="primary">${esc(tr('Create'))}</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    d.addEventListener('keydown', (e) => e.stopPropagation());
    d.querySelector('[data-dlg="cancel"]').addEventListener('click', () => d.close());
    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      d.returnValue = 'ok';
      d.close();
    });
    return d;
  }

  /** Ask for topic, folder and paper, then create the block and open it. */
  NB.create = async function () {
    const P = MM.project;
    if (P.status !== 'ready') {
      alert(tr('Blocks live in a project folder.\nOpen a folder in the "Project" sidebar first.'));
      return;
    }
    if (!dialog) dialog = build();
    const f = dialog.querySelector('form');
    f.name.value = '';
    f.folder.value = '';
    const inside = P.folders().filter((p) => p.startsWith(NB.FOLDER + '/')).map((p) => p.slice(NB.FOLDER.length + 1));
    dialog.querySelector('#block-folders').innerHTML = inside.map((p) => `<option value="${MM.render.esc(p)}">`).join('');
    dialog.returnValue = '';
    dialog.showModal();
    f.name.focus();
    await new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));
    const name = P.sanitizeName(f.name.value);
    if (dialog.returnValue !== 'ok' || !name) return;
    const sub = P.sanitizeFolder(f.folder.value);
    const doc = NB.newDoc({ orient: f.orient.value, ruling: f.ruling.value });
    try {
      await P.createMap({ folder: NB.FOLDER + (sub ? '/' + sub : ''), name, doc });
    } catch (err) {
      alert(tr('Could not create the block: {err}', { err: err.message }));
    }
  };
})(window.MM);
