'use strict';
/*
 * Diaries / lab books (see plans/diary-plan.md).
 *
 * Entries are notes of the type 'diary' anywhere in the maps:
 *   node.text  = Markdown (markdown.js), images as ![x](asset:<id>)
 *   node.diary = { book, date 'YYYY-MM-DD', time 'HH:MM' }
 * A diary itself is a file Diaries/<name>.diary.json (project.js):
 *   style  - look of the pages (font, size, colours, ruling), set with 🎨
 *   pages  - per day: closed = { at, entries } when the page was closed (frozen copy
 *            of the entries with their heads and images), later overlays
 *   assets - images of closed pages
 *
 * The reader shows one page per day that has entries (empty days are skipped),
 * the entries of a day by time. Each entry has a head with the note(s) whose
 * arrow points at it ("mothers", side by side) and, above them, the topmost
 * task reached going upwards ("master task").
 * ←/→ turn the pages, the mouse wheel scrolls a page, 📅 jumps to a day.
 *
 * "Close page" freezes a day (lab book): from then on the page shows the copy.
 * Entries changed, removed or added afterwards are marked on the page, and the
 * note on the map shows 🔒 (✎ when it was changed after closing).
 */
(function (MM) {
  const S = MM.state;
  const DY = (MM.diary = {});
  const tr = (s, v) => MM.tr(s, v);
  const esc = (s) => MM.render.esc(s);
  const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d{2}:\d{2}$/;
  const str = (v) => (v === null || v === undefined ? '' : String(v));

  DY.DEFAULT_STYLE = { font: 'Georgia', fontSize: 16, text: '#2d2a26', accent: '#b7791f', paper: '#fdf8ec', ruling: 'none' };
  DY.RULINGS = { none: 'None', lines: 'Lines', grid: 'Squares', dots: 'Dots' };
  DY.FONTS = ['Georgia', 'Times New Roman', 'Garamond', 'Cambria', 'Arial', 'Calibri', 'Verdana', 'Trebuchet MS',
    'Comic Sans MS', 'Segoe Print', 'Segoe Script', 'Courier New'];

  // ---- Diary file ----------------------------------------------------------------

  function cleanStyle(st) {
    const s = st && typeof st === 'object' ? st : {};
    const D = DY.DEFAULT_STYLE;
    const color = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d);
    const size = Number(s.fontSize);
    return {
      font: typeof s.font === 'string' && s.font.trim() ? s.font.replace(/[^\w\s-]/g, '').trim().slice(0, 60) || D.font : D.font,
      fontSize: size >= 10 && size <= 32 ? size : D.fontSize,
      text: color(s.text, D.text), accent: color(s.accent, D.accent), paper: color(s.paper, D.paper),
      ruling: Object.hasOwn(DY.RULINGS, s.ruling) ? s.ruling : D.ruling,
    };
  }

  /** Metadata of a mother note in a closed page: checked like any note from a file. */
  function cleanMeta(type, meta, tags) {
    const n = MM.normalizeDoc({ nodes: { x: { id: 'x', type, meta, tags } } }).nodes.x;
    return { type: n.type, meta: n.meta, tags: n.tags };
  }

  /** A frozen entry of a closed page (untrusted, from the file). */
  function cleanEntry(e) {
    const x = e && typeof e === 'object' ? e : {};
    return {
      id: str(x.id), path: str(x.path), map: str(x.map).slice(0, 200),
      time: TIME.test(x.time) ? x.time : '', markdown: str(x.markdown),
      head: (Array.isArray(x.head) ? x.head : []).filter((h) => h && typeof h === 'object').map((h) =>
        Object.assign({ title: str(h.title).slice(0, 300), master: str(h.master).slice(0, 300) }, cleanMeta(h.type, h.meta, h.tags))),
    };
  }

  /** A diary file as read from disk (untrusted) -> clean object. */
  DY.normalize = function (raw, name) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const assets = {};
    if (r.assets && typeof r.assets === 'object') {
      for (const [id, url] of Object.entries(r.assets)) if (typeof url === 'string' && url.startsWith('data:image/')) assets[id] = url;
    }
    const pages = {};
    for (const [day, p] of Object.entries(r.pages && typeof r.pages === 'object' ? r.pages : {})) {
      if (!DATE.test(day) || !p || typeof p !== 'object') continue;
      const page = { overlays: Array.isArray(p.overlays) ? p.overlays : [] }; // overlays: stage 3
      if (p.closed && typeof p.closed === 'object') {
        page.closed = { at: str(p.closed.at).slice(0, 40), entries: (Array.isArray(p.closed.entries) ? p.closed.entries : []).map(cleanEntry) };
      }
      pages[day] = page;
    }
    return { app: 'MindMapper-diary', version: 1, name: String(name), style: cleanStyle(r.style), pages, assets };
  };

  // ---- Collecting the entries ---------------------------------------------------

  /** All entries of a diary in all maps: [{ path, doc, n, date, time }] by date and time. */
  DY.entries = function (book) {
    const out = [];
    for (const [path, doc] of MM.load.docs()) {
      for (const n of Object.values(doc.nodes || {})) {
        if (n.type !== 'diary' || !n.diary || n.diary.book !== book || n.movedTo) continue;
        out.push({ path, doc, n, date: n.diary.date, time: n.diary.time || '' });
      }
    }
    return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  };

  /**
   * Head of an entry: its mothers (notes whose arrow points at it) and for each
   * the master task - the topmost task reached going upwards, not named again
   * if it is the mother itself. Upwards = the first arrow pointing at a note;
   * a note without one that lies in a group goes on with the (innermost) group,
   * e.g. note loose in a group -> group -> sub-task -> master task. Cycles stop.
   */
  DY.headOf = function (e) {
    const nodes = e.doc.nodes || {}, edges = Object.values(e.doc.edges || {});
    const parentsOf = (id) => edges
      .filter((x) => x.target && x.target.node === id && x.source && nodes[x.source.node] && nodes[x.source.node].type !== 'draw')
      .map((x) => nodes[x.source.node]);
    // smallest first, so the first group containing a note is the innermost one
    const groups = Object.values(nodes).filter((g) => g.type === 'group').sort((a, b) => a.w * a.h - b.w * b.h);
    const groupOf = (n) => groups.find((g) => g.id !== n.id &&
      n.x >= g.x && n.y >= g.y && n.x + n.w <= g.x + g.w && n.y + n.h <= g.y + g.h) || null;
    const up = (n) => parentsOf(n.id)[0] || groupOf(n);
    const masterOf = (m) => {
      let top = null;
      const seen = new Set([e.n.id]);
      for (let cur = m; cur && !seen.has(cur.id); cur = up(cur)) {
        seen.add(cur.id);
        if (cur.type === 'task') top = cur;
      }
      return top && top !== m ? top : null;
    };
    return parentsOf(e.n.id).map((m) => ({ m, master: masterOf(m) }));
  };

  const titleOf = (n) => (n.text || '').split('\n')[0] || tr(MM.NODE_TYPES[n.type] || 'Note');

  /** Name of the map an entry lives in. */
  function mapOf(e) {
    const open = e.path === S.file.path || !MM.project.find(e.path);
    return open ? (S.file.path ? MM.project.mapName(S.file.path) : S.file.name) : MM.project.mapName(e.path);
  }

  /**
   * An entry as plain data (what the page shows, and what closing a page stores):
   * { id, path, map, time, markdown, head: [{ title, type, meta, tags, master }] }
   */
  function entryData(e) {
    const calc = MM.tasks.compute(e.doc, null).info; // progress of main tasks
    return {
      id: e.n.id, path: e.path, map: mapOf(e), time: e.time, markdown: e.n.text,
      head: DY.headOf(e).map(({ m, master }) => {
        const c = m.type === 'task' ? calc.get(m.id) : null;
        return {
          title: titleOf(m), type: m.type, tags: (m.tags || []).slice(),
          meta: Object.assign({}, m.meta || {}, c ? { progress: c.progress } : {}),
          master: master ? titleOf(master) : '',
        };
      }),
    };
  }

  // ---- Closed pages: index for the notes on the map ---------------------------------

  let closedIndex = new Map(); // entry id -> { book, date, markdown }
  let indexVersion = 0;

  function indexDiary(d) {
    for (const [id, rec] of closedIndex) if (rec.book === d.name) closedIndex.delete(id);
    for (const [date, p] of Object.entries(d.pages)) {
      if (!p.closed) continue;
      for (const en of p.closed.entries) closedIndex.set(en.id, { book: d.name, date, markdown: en.markdown });
    }
    indexVersion++;
  }

  /** Read every diary of the project folder (after a scan) for the 🔒 marks on the map. */
  DY.loadIndex = async function () {
    const P = MM.project;
    closedIndex = new Map();
    if (P.status === 'ready') {
      for (const d of P.diaries) {
        try {
          indexDiary(await P.readDiary(d.name));
        } catch (err) { /* unreadable diary: no marks */ }
      }
    }
    indexVersion++;
    MM.refresh();
  };

  /** '' | 'closed' | 'changed' (closed, but edited or moved afterwards) for a diary note. */
  DY.badge = function (n) {
    const rec = n.type === 'diary' && closedIndex.get(n.id);
    if (!rec) return '';
    const d = n.diary || {};
    return rec.markdown === n.text && rec.date === d.date && rec.book === d.book ? 'closed' : 'changed';
  };
  DY.indexVersion = () => indexVersion;

  // ---- Reader ----------------------------------------------------------------------

  let dialog = null;
  const view = { book: '', diary: null, entries: [], days: [], day: '', month: null };

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'diary-dialog';
    dialog.innerHTML = `
      <div class="dy-bar">
        <span class="dy-title"></span>
        <button type="button" class="dy-prev" data-dy="prev">◀</button>
        <select class="dy-days"></select>
        <button type="button" class="dy-next" data-dy="next">▶</button>
        <button type="button" data-dy="calendar">📅</button>
        <span class="dy-spacer"></span>
        <button type="button" data-dy="design">🎨</button>
        <button type="button" class="dy-close" data-dy="close">✕</button>
      </div>
      <div class="dy-pop dy-cal" hidden></div>
      <div class="dy-pop dy-design" hidden></div>
      <div class="dy-scroll"><article class="dy-page"></article></div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', onClick);
    dialog.querySelector('.dy-days').addEventListener('change', (e) => show(e.target.value));
    dialog.querySelector('.dy-design').addEventListener('input', onDesign);
    dialog.querySelector('.dy-design').addEventListener('change', onDesign);
    dialog.addEventListener('keydown', (e) => {
      e.stopPropagation(); // the canvas must not move notes meanwhile
      if (/^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        turn(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        turn(1);
      }
    });
    dialog.addEventListener('close', () => {
      popup(null);
      flushSave();
    });
  }

  function onClick(e) {
    if (e.target === dialog) return dialog.close(); // backdrop
    const b = e.target.closest('[data-dy]');
    // a click outside an open pop-up closes it
    if (!e.target.closest('.dy-pop') && !(b && /^(calendar|design)$/.test(b.dataset.dy))) popup(null);
    if (b) {
      const a = b.dataset.dy;
      if (a === 'prev') turn(-1);
      else if (a === 'next') turn(1);
      else if (a === 'close') dialog.close();
      else if (a === 'calendar') popup('cal');
      else if (a === 'design') popup('design');
      else if (a === 'month') {
        view.month = new Date(view.month.getFullYear(), view.month.getMonth() + Number(b.dataset.step), 1);
        renderCalendar();
      } else if (a === 'day') {
        popup(null);
        show(b.dataset.day);
      } else if (a === 'closePage') closePage();
      else if (a === 'reopenPage') reopenPage();
      else if (a === 'resetDesign') {
        view.diary.style = cleanStyle(null);
        applyStyle();
        renderDesign();
        save();
      }
      return;
    }
    const go = e.target.closest('[data-goto]');
    if (go) showInMap(go.dataset.path, go.dataset.goto);
  }

  /** Show pop-up 'cal' | 'design', or close them (null / the open one again). */
  function popup(which) {
    if (!dialog) return;
    const cal = dialog.querySelector('.dy-cal'), des = dialog.querySelector('.dy-design');
    const open = !cal.hidden ? 'cal' : !des.hidden ? 'design' : null;
    cal.hidden = des.hidden = true;
    if (!which || which === open) return;
    if (which === 'cal') {
      const d = parse(view.day) || new Date();
      view.month = new Date(d.getFullYear(), d.getMonth(), 1);
      renderCalendar();
      cal.hidden = false;
    } else {
      renderDesign();
      des.hidden = false;
    }
  }

  /**
   * Open a diary. opts.date: the page to show (else the newest);
   * opts.entry: id of an entry to scroll to and highlight.
   */
  DY.open = async function (book, opts) {
    const o = opts || {};
    if (!book) return;
    if (!dialog) build();
    flushSave();
    const P = MM.project;
    view.book = book;
    view.diary = P.status === 'ready' ? await P.readDiary(book) : DY.normalize(null, book);
    indexDiary(view.diary);
    if (S.settings.lastDiary !== book) {
      S.settings.lastDiary = book;
      MM.saveSettings();
    }
    dialog.querySelector('.dy-title').textContent = '📖 ' + book;
    dialog.querySelector('.dy-page').innerHTML = `<p class="hint">${esc(tr('Reading the maps…'))}</p>`;
    if (!dialog.open) dialog.showModal();
    popup(null);
    if (P.status === 'ready') await MM.load.refresh(); // every map, fresh from disk
    view.entries = DY.entries(book);
    collectDays();
    applyStyle();
    const day = view.days.includes(o.date) ? o.date : view.days[view.days.length - 1] || '';
    show(day, o.entry);
  };

  /** Days with a page: live entries and closed pages (their notes may be gone). */
  function collectDays() {
    const closed = Object.keys(view.diary.pages).filter((d) => view.diary.pages[d].closed);
    view.days = [...new Set(view.entries.map((e) => e.date).concat(closed))].sort();
  }

  function applyStyle() {
    const st = view.diary.style, page = dialog.querySelector('.dy-page');
    page.style.setProperty('--dy-font', `"${st.font}", Georgia, serif`);
    page.style.setProperty('--dy-size', st.fontSize + 'px');
    page.style.setProperty('--dy-text', st.text);
    page.style.setProperty('--dy-accent', st.accent);
    page.style.setProperty('--dy-paper', st.paper);
    page.dataset.ruling = st.ruling;
  }

  function turn(step) {
    const i = view.days.indexOf(view.day);
    const next = view.days[i + step];
    if (next) show(next);
  }

  const parse = (s) => {
    const m = DATE.exec(s || '') && /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const longDate = (s) => {
    const d = parse(s);
    return d ? d.toLocaleDateString(MM.locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : s;
  };
  const stamp = (s) => {
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleString(MM.locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  /** Show the page of `day`; scroll to entry `entryId` if given. */
  function show(day, entryId) {
    view.day = day;
    const sel = dialog.querySelector('.dy-days');
    sel.innerHTML = view.days.slice().reverse().map((d) =>
      `<option value="${esc(d)}"${d === day ? ' selected' : ''}>${view.diary.pages[d] && view.diary.pages[d].closed ? '🔒 ' : ''}${esc(longDate(d))}</option>`).join('');
    sel.disabled = !view.days.length;
    const i = view.days.indexOf(day);
    dialog.querySelector('.dy-prev').disabled = i <= 0;
    dialog.querySelector('.dy-next').disabled = i < 0 || i >= view.days.length - 1;
    const page = dialog.querySelector('.dy-page');
    if (!day) {
      page.innerHTML = `<p class="dy-none">${esc(tr('No entries yet. Add a note of the type "Diary entry" to a map and choose this diary in its panel.'))}</p>`;
      return;
    }
    page.innerHTML = pageHTML(day);
    dialog.querySelector('.dy-scroll').scrollTop = 0;
    const target = entryId && page.querySelector(`[data-entry="${CSS.escape(entryId)}"]`);
    if (target) {
      target.scrollIntoView({ block: 'start' });
      target.classList.add('dy-focus');
    }
  }

  function pageHTML(day) {
    const live = view.entries.filter((e) => e.date === day);
    const closed = view.diary.pages[day] && view.diary.pages[day].closed;
    const canWrite = MM.project.status === 'ready';
    let h = `<div class="dy-day-row"><h2 class="dy-day">${esc(longDate(day))}</h2>`;
    if (closed) {
      h += `<span class="dy-closed-info">🔒 ${esc(tr('Closed {at}', { at: stamp(closed.at) }))}</span>` +
        (canWrite ? `<button type="button" class="dy-page-btn" data-dy="reopenPage">${esc(tr('Reopen'))}</button>` : '');
    } else if (canWrite && live.length) {
      h += `<button type="button" class="dy-page-btn" data-dy="closePage" title="${esc(tr('Freeze this page: later changes to the notes no longer change it'))}">🔒 ${esc(tr('Close page'))}</button>`;
    }
    h += '</div>';
    if (!closed) return h + live.map((e) => entryHTML(entryData(e), (id) => (e.doc.assets || {})[id])).join('');
    // closed: the frozen copy; what happened to the notes since is marked
    const assetUrl = (id) => view.diary.assets[id];
    for (const en of closed.entries) {
      const now = view.entries.find((e) => e.n.id === en.id);
      const mark = !now ? tr('the note was deleted or moved to another diary / day')
        : now.n.text !== en.markdown || now.date !== day ? tr('the note was changed after closing – this is the closed version') : '';
      h += entryHTML(en, assetUrl, mark);
    }
    const added = live.filter((e) => !closed.entries.some((en) => en.id === e.n.id));
    if (added.length) {
      h += `<div class="dy-added-head">${esc(tr('Added after closing'))}</div>` +
        added.map((e) => entryHTML(entryData(e), (id) => (e.doc.assets || {})[id], '', true)).join('');
    }
    return h;
  }

  /** Small card of a mother note: master task, title, status / progress / deadline / tags. */
  function motherHTML(m) {
    const chips = MM.meta.chipsHTML({ type: m.type, meta: m.meta, tags: m.tags || [], repeat: null }, false);
    return `<div class="dy-mother">
      ${m.master ? `<div class="dy-master" title="${esc(tr('Master task'))}">⤴ ${esc(m.master)}</div>` : ''}
      <div class="dy-m-title">${esc(m.title)}</div>
      ${chips ? `<div class="dy-m-chips">${chips}</div>` : ''}
    </div>`;
  }

  /** One entry (live data or a frozen one). mark: note about later changes; added: written after closing. */
  function entryHTML(d, assetUrl, mark, added) {
    const body = d.markdown.trim() ? MM.md.render(d.markdown, assetUrl) : `<p class="dy-empty">${esc(tr('(empty entry)'))}</p>`;
    return `<section class="dy-entry${added ? ' dy-added' : ''}" data-entry="${esc(d.id)}">
      <div class="dy-entry-head">
        <span class="dy-time">${esc(d.time || '')}</span>
        <div class="dy-mothers">${d.head.map(motherHTML).join('')}</div>
        <button type="button" class="dy-goto" data-goto="${esc(d.id)}" data-path="${esc(d.path)}" title="${esc(tr('Show the entry in its map ({map})', { map: d.map }))}">↗ ${esc(d.map)}</button>
      </div>
      ${mark ? `<div class="dy-mark">✎ ${esc(mark)}</div>` : ''}
      <div class="dy-body md">${body}</div>
    </section>`;
  }

  /** Close the reader and show an entry in its map. */
  async function showInMap(path, id) {
    dialog.close();
    if (path !== S.file.path && MM.project.find(path) && !(await MM.project.openMap(path))) return;
    if (MM.node(id)) MM.actions.focusNode(id);
    else MM.ui.flash(tr('The note is no longer in this map'));
  }

  // ---- Closing a page --------------------------------------------------------------------

  async function closePage() {
    const day = view.day;
    const live = view.entries.filter((e) => e.date === day);
    if (!live.length) return;
    const entries = live.map((e) => {
      // images of the entry are copied into the diary, the page stays complete without the map
      for (const id of MM.md.assetIds(e.n.text)) if (e.doc.assets && e.doc.assets[id]) view.diary.assets[id] = e.doc.assets[id];
      return entryData(e);
    });
    const page = view.diary.pages[day] || (view.diary.pages[day] = { overlays: [] });
    page.closed = { at: new Date().toISOString(), entries: JSON.parse(JSON.stringify(entries)) };
    if (await save(true)) {
      MM.ui.flash(tr('Page closed'));
      show(day);
    }
  }

  async function reopenPage() {
    const day = view.day;
    if (!confirm(tr('Reopen the page of {day}?\n\nIt shows the notes as they are now again; the closed version is discarded.', { day: longDate(day) }))) return;
    delete view.diary.pages[day].closed;
    // images only the closed copy used are dropped
    const used = new Set();
    for (const p of Object.values(view.diary.pages)) if (p.closed) p.closed.entries.forEach((en) => MM.md.assetIds(en.markdown).forEach((id) => used.add(id)));
    for (const id of Object.keys(view.diary.assets)) if (!used.has(id)) delete view.diary.assets[id];
    if (await save(true)) {
      collectDays();
      show(view.days.includes(day) ? day : view.days[view.days.length - 1] || '');
    }
  }

  // ---- Saving ----------------------------------------------------------------------

  let saveTimer = null;

  /** Write the diary file (now, or a moment later while the design is being changed). Returns true if written. */
  async function save(now) {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!now) {
      saveTimer = setTimeout(() => save(true), 600);
      return false;
    }
    if (MM.project.status !== 'ready') return false;
    try {
      await MM.project.writeDiary(view.diary);
      indexDiary(view.diary);
      MM.refresh(); // 🔒 marks of the notes
      return true;
    } catch (err) {
      alert(tr('Could not save the diary: {err}', { err: (err && err.message) || err }));
      return false;
    }
  }

  function flushSave() {
    if (saveTimer) save(true);
  }

  // ---- Calendar ------------------------------------------------------------------------

  function renderCalendar() {
    const m = view.month;
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const has = new Set(view.days), today = iso(new Date());
    const names = [];
    for (let i = 0; i < 7; i++) names.push(new Date(2026, 0, 5 + i).toLocaleDateString(MM.locale(), { weekday: 'narrow' }));
    let h = `<div class="dy-cal-head">
        <button type="button" data-dy="month" data-step="-1">◀</button>
        <span>${esc(first.toLocaleDateString(MM.locale(), { month: 'long', year: 'numeric' }))}</span>
        <button type="button" data-dy="month" data-step="1">▶</button>
      </div><div class="dy-cal-grid">` + names.map((n) => `<span class="dy-cal-wd">${esc(n)}</span>`).join('');
    for (let i = 0; i < offset; i++) h += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const k = iso(new Date(m.getFullYear(), m.getMonth(), d));
      const closed = view.diary.pages[k] && view.diary.pages[k].closed;
      const cls = ['dy-cal-day', k === view.day ? 'current' : '', k === today ? 'today' : '', closed ? 'closed' : ''].filter(Boolean).join(' ');
      h += has.has(k)
        ? `<button type="button" class="${cls}" data-dy="day" data-day="${k}" title="${esc(longDate(k))}${closed ? ' 🔒' : ''}">${d}</button>`
        : `<span class="${cls} empty">${d}</span>`;
    }
    dialog.querySelector('.dy-cal').innerHTML = h + '</div>';
  }

  // ---- Design --------------------------------------------------------------------------

  function renderDesign() {
    const st = view.diary.style;
    const rulings = Object.entries(DY.RULINGS).map(([k, l]) => `<option value="${k}"${k === st.ruling ? ' selected' : ''}>${esc(tr(l))}</option>`).join('');
    dialog.querySelector('.dy-design').innerHTML = `
      <div class="dy-design-row"><label>${esc(tr('Font'))}</label>
        <input type="text" data-style="font" list="dy-fonts" value="${esc(st.font)}">
        <datalist id="dy-fonts">${DY.FONTS.map((f) => `<option value="${esc(f)}">`).join('')}</datalist></div>
      <div class="dy-design-row"><label>${esc(tr('Size'))}</label>
        <input type="number" data-style="fontSize" min="10" max="32" step="1" value="${esc(st.fontSize)}"></div>
      <div class="dy-design-row"><label>${esc(tr('Text'))}</label><input type="color" data-style="text" value="${esc(st.text)}">
        <label>${esc(tr('Accent'))}</label><input type="color" data-style="accent" value="${esc(st.accent)}">
        <label>${esc(tr('Paper'))}</label><input type="color" data-style="paper" value="${esc(st.paper)}"></div>
      <div class="dy-design-row"><label>${esc(tr('Ruling'))}</label><select data-style="ruling">${rulings}</select></div>
      <div class="dy-design-row dy-design-foot">
        <span class="hint">${esc(tr('Only for this diary – the maps stay as they are.'))}</span>
        <button type="button" data-dy="resetDesign">${esc(tr('Reset'))}</button></div>`;
  }

  function onDesign(e) {
    const key = e.target.dataset.style;
    if (!key) return;
    const next = Object.assign({}, view.diary.style, { [key]: key === 'fontSize' ? Number(e.target.value) : e.target.value });
    const clean = cleanStyle(next);
    // a font name being typed may be invalid for a moment - only take it when it is complete
    if (key === 'font' && e.type === 'input' && clean.font !== next.font.trim()) return;
    view.diary.style = clean;
    applyStyle();
    if (MM.project.status === 'ready') save();
  }

  // ---- Actions ---------------------------------------------------------------------

  /** Panel button: open the diary page of the selected entry. */
  MM.actions.openDiary = function () {
    const n = MM.selectedNodes().find((x) => x.type === 'diary');
    if (!n) return;
    if (!n.diary.book) {
      alert(tr('Choose a diary for this entry first.'));
      return;
    }
    DY.open(n.diary.book, { date: n.diary.date, entry: n.id });
  };
})(window.MM);
