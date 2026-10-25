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
      const page = { overlays: (Array.isArray(p.overlays) ? p.overlays : []).map(cleanOverlay).filter(Boolean) };
      // empty lines above entries: { entry id: number of lines }
      if (p.gaps && typeof p.gaps === 'object') {
        page.gaps = {};
        for (const [id, n] of Object.entries(p.gaps)) {
          const lines = Math.round(Number(n));
          if (lines > 0 && lines <= 200) page.gaps[str(id).slice(0, 80)] = lines;
        }
      }
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
  // edit: overlays can be placed; tool: drawing shape being drawn; sel: selected overlay id
  const view = { book: '', diary: null, entries: [], days: [], day: '', month: null, edit: false, tool: null, sel: null, scale: 1 }; // scale: of the page on screen (phones)

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
        <button type="button" data-dy="editOverlays" class="dy-ov-toggle"></button>
        <button type="button" data-dy="design">🎨</button>
        <button type="button" data-dy="print">🖨</button>
        <button type="button" class="dy-close" data-dy="close">✕</button>
      </div>
      <div class="dy-ov-tools" hidden></div>
      <div class="dy-pop dy-cal" hidden></div>
      <div class="dy-pop dy-design" hidden></div>
      <div class="dy-pop dy-print" hidden></div>
      <div class="dy-scroll"><div class="dy-sheet"><article class="dy-page"></article></div></div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', onClick);
    dialog.querySelector('.dy-days').addEventListener('change', (e) => show(e.target.value));
    dialog.querySelector('.dy-design').addEventListener('input', onDesign);
    dialog.querySelector('.dy-design').addEventListener('change', onDesign);
    dialog.querySelector('.dy-ov-tools').addEventListener('input', onToolColor);
    const page = dialog.querySelector('.dy-page');
    page.addEventListener('pointerdown', onPagePointerDown);
    page.addEventListener('pointermove', onPagePointerMove);
    page.addEventListener('pointerup', onPagePointerUp);
    page.addEventListener('pointercancel', onPagePointerUp);
    initPinch(dialog.querySelector('.dy-scroll'));
    // the sheet follows the size of the (scaled) page
    if (window.ResizeObserver) new ResizeObserver(() => sizeSheet()).observe(page);
    dialog.addEventListener('keydown', (e) => {
      e.stopPropagation(); // the canvas must not move notes meanwhile
      if (/^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (view.edit && view.sel && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        deleteOverlay();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        turn(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        turn(1);
      }
    });
    // a narrower window wraps the text differently: put the entries on the lines again
    window.addEventListener('resize', () => {
      if (!dialog.open) return;
      applyScale();
      if (view.day) layoutPage(dialog.querySelector('.dy-page'));
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
    if (!e.target.closest('.dy-pop') && !(b && /^(calendar|design|print)$/.test(b.dataset.dy))) popup(null);
    if (b) {
      const a = b.dataset.dy;
      if (a === 'prev') turn(-1);
      else if (a === 'next') turn(1);
      else if (a === 'close') dialog.close();
      else if (a === 'calendar') popup('cal');
      else if (a === 'design') popup('design');
      else if (a === 'print') popup('print');
      else if (a === 'doPrint') doPrint();
      else if (a === 'editOverlays') setEdit(!view.edit);
      else if (a === 'tool') setTool(view.tool === b.dataset.kind ? null : b.dataset.kind);
      else if (a === 'sticker') addSticker(b);
      else if (a === 'image') addImage();
      else if (a === 'deleteOverlay') deleteOverlay();
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

  /** Show pop-up 'cal' | 'design' | 'print', or close them (null / the open one again). */
  function popup(which) {
    if (!dialog) return;
    const pops = { cal: dialog.querySelector('.dy-cal'), design: dialog.querySelector('.dy-design'), print: dialog.querySelector('.dy-print') };
    const open = Object.keys(pops).find((k) => !pops[k].hidden) || null;
    Object.values(pops).forEach((p) => (p.hidden = true));
    if (!which || which === open) return;
    if (which === 'cal') {
      const d = parse(view.day) || new Date();
      view.month = new Date(d.getFullYear(), d.getMonth(), 1);
      renderCalendar();
    } else if (which === 'design') renderDesign();
    else renderPrint();
    pops[which].hidden = false;
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
    let diary;
    try {
      diary = P.status === 'ready' ? await P.readDiary(book, { edit: true }) : DY.normalize(null, book);
    } catch (err) {
      alert(tr('Could not open the diary: {err}', { err: err.message }));
      return;
    }
    view.book = book;
    userZoom = 1; // opened again: the page fits the width
    view.diary = diary;
    indexDiary(view.diary);
    if (S.settings.lastDiary !== book) {
      S.settings.lastDiary = book;
      MM.saveSettings();
    }
    dialog.querySelector('.dy-title').textContent = '📖 ' + book;
    dialog.querySelector('.dy-page').innerHTML = `<p class="hint">${esc(tr('Reading the maps…'))}</p>`;
    if (!dialog.open) dialog.showModal();
    popup(null);
    setEdit(false);
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

  /** CSS variables of the diary's look (values are checked in cleanStyle: no quotes or brackets). */
  function styleVars() {
    const st = view.diary.style;
    return `--dy-font:"${st.font}", Georgia, serif; --dy-size:${st.fontSize}px; --dy-text:${st.text}; ` +
      `--dy-accent:${st.accent}; --dy-paper:${st.paper};`;
  }

  function applyStyle() {
    const page = dialog.querySelector('.dy-page');
    page.setAttribute('style', styleVars());
    page.dataset.ruling = view.diary.style.ruling;
    layoutPage(page); // another font size = another line height
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
    view.sel = null;
    applyScale();
    layoutPage(page);
    watchHeights(page);
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
    const ids = [];
    const entry = (d, assetUrl, mark, added) => {
      ids.push(d.id);
      return entryHTML(day, d, assetUrl, mark, added);
    };
    if (!closed) {
      h += live.map((e) => entry(entryData(e), (id) => (e.doc.assets || {})[id])).join('');
    } else {
      // closed: the frozen copy; what happened to the notes since is marked
      const assetUrl = (id) => view.diary.assets[id];
      for (const en of closed.entries) {
        const now = view.entries.find((e) => e.n.id === en.id);
        const mark = !now ? tr('the note was deleted or moved to another diary / day')
          : now.n.text !== en.markdown || now.date !== day ? tr('the note was changed after closing – this is the closed version') : '';
        h += entry(en, assetUrl, mark);
      }
      const added = live.filter((e) => !closed.entries.some((en) => en.id === e.n.id));
      if (added.length) {
        h += `<div class="dy-added-head">${esc(tr('Added after closing'))}</div>` +
          added.map((e) => entry(entryData(e), (id) => (e.doc.assets || {})[id], '', true)).join('');
      }
    }
    // stickers of the page itself (above the first entry, or whose entry is no longer on the page)
    const loose = overlaysOf(day).filter((o) => !o.entry || !ids.includes(o.entry));
    return h + `<div class="dy-ov-layer" data-owner="">${loose.map(overlayHTML).join('')}</div>`;
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

  /**
   * One entry (live data or a frozen one) on the page of `day`: the empty lines
   * pushed in above it (dragging its head), the entry, and the stickers stuck to it.
   * mark: note about later changes; added: written after closing.
   */
  function entryHTML(day, d, assetUrl, mark, added) {
    const body = d.markdown.trim() ? MM.md.render(d.markdown, assetUrl) : `<p class="dy-empty">${esc(tr('(empty entry)'))}</p>`;
    const gap = gapOf(day, d.id);
    const stuck = overlaysOf(day).filter((o) => o.entry === d.id);
    return `<div class="dy-gap" data-gap="${esc(d.id)}" style="height:calc(${gap} * var(--dy-line))"></div>
    <section class="dy-entry${added ? ' dy-added' : ''}" data-entry="${esc(d.id)}">
      <div class="dy-ov-layer" data-owner="${esc(d.id)}">${stuck.map(overlayHTML).join('')}</div>
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
    pruneAssets(); // images only the closed copy used
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
      // a folder of a sync program: after a longer pause, as the maps (storage.js SYNC_DELAY)
      const P = MM.project;
      const synced = S.settings.syncedFolder && P.backend && P.backend.kind === 'local';
      saveTimer = setTimeout(() => save(true), synced ? MM.storage.SYNC_DELAY : 600);
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
  DY.flush = flushSave; // leaving the app (storage.js initLifecycle)

  // ---- Page overlays: stickers, images, drawings ----------------------------------------
  //
  // page.overlays = [{ id, kind: 'sticker'|'image'|'draw', x, y, w, h, ... }]
  // Position and size are in page widths (x 0.5 = middle), so they sit at the same
  // place of the page on screen and on paper; the CSS uses container units (cqw).
  //   sticker: char        image: asset (id in diary.assets)
  //   draw:    shape (MM.DRAW_KINDS), line (end points as fractions), color, width (px), fill

  const REF_WIDTH = 720; // page width the stroke widths are meant for

  function getPage(day) {
    return view.diary.pages[day] || (view.diary.pages[day] = { overlays: [] });
  }
  const overlaysOf = (day) => (view.diary.pages[day] && view.diary.pages[day].overlays) || [];

  function overlayHTML(o) {
    const pos = `left:calc(${o.x} * 100cqw);top:calc(${o.y} * 100cqw);width:calc(${o.w} * 100cqw);height:calc(${o.h} * 100cqw)` +
      (o.rot ? `;transform:rotate(${o.rot}deg)` : '');
    const cls = `dy-ov dy-ov-${o.kind}${o.id === view.sel ? ' sel' : ''}`;
    const handle = '<span class="dy-ov-handle"></span><span class="dy-ov-rot"></span>';
    if (o.kind === 'sticker') {
      return `<div class="${cls}" data-ov="${esc(o.id)}" style="${pos};font-size:calc(${o.h} * 82cqw)">${esc(o.char)}${handle}</div>`;
    }
    if (o.kind === 'image') {
      const url = view.diary.assets[o.asset];
      return `<div class="${cls}" data-ov="${esc(o.id)}" style="${pos}">` +
        (url ? `<img src="${esc(url)}" alt="" draggable="false">` : '') + `${handle}</div>`;
    }
    // drawing: the shape of draw.js in a box of 1000 units width, line width in px
    const W = 1000, H = Math.max(1, (W * o.h) / o.w);
    const d = MM.draw.path({ draw: o.shape, line: o.line, w: W, h: H, style: { strokeWidth: (o.width * W) / (o.w * REF_WIDTH) } });
    const line = o.shape === 'line' || o.shape === 'arrow';
    return `<div class="${cls}" data-ov="${esc(o.id)}" style="${pos}">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="${line || o.fill === 'none' ? 'none' : esc(o.fill)}"
        stroke="${esc(o.color)}" stroke-width="${o.width}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>${handle}</div>`;
  }

  /** Empty lines pushed in above an entry (dragging its head in edit mode). */
  const gapOf = (day, id) => (view.diary.pages[day] && view.diary.pages[day].gaps && view.diary.pages[day].gaps[id]) || 0;

  /**
   * Layout after rendering a page (screen, and the copy for printing):
   *   - every entry starts on a line of the ruling: its text is moved down to
   *     the next multiple of the line height (measured from the top of the page)
   *   - the page is at least as long as its lowest sticker / image, so nothing is cut off
   * print: the page has no minimum height of the screen (100 %).
   */
  function layoutPage(page, print) {
    const L = parseFloat(getComputedStyle(page).lineHeight) || 25.6;
    const k = scaleOf(page); // screen px -> page px (the page may be scaled on phones)
    const top0 = page.getBoundingClientRect().top + page.clientTop * k;
    page.style.minHeight = '';
    const entries = [...page.querySelectorAll('.dy-entry')];
    entries.forEach((s) => {
      s.style.marginTop = '0px';
      s.style.paddingBottom = '';
    });
    for (const s of entries) {
      const body = s.querySelector('.dy-body');
      const rest = ((body.getBoundingClientRect().top - top0) / k) % L;
      if (rest > 0.5 && L - rest > 0.5) s.style.marginTop = (L - rest) + 'px';
      // stickers stuck to the entry that reach below its text belong to it: the next
      // entry starts below them (whole lines, so it stays on the ruling)
      const end = s.getBoundingClientRect().bottom;
      let low = end;
      s.querySelectorAll(':scope > .dy-ov-layer > .dy-ov').forEach((el) => (low = Math.max(low, el.getBoundingClientRect().bottom)));
      if (low - end > 0.5) s.style.paddingBottom = Math.ceil((low - end) / k / L) * L + 'px';
    }
    let bottom = 0;
    page.querySelectorAll('.dy-ov').forEach((el) => (bottom = Math.max(bottom, (el.getBoundingClientRect().bottom - top0) / k)));
    if (bottom) {
      const need = Math.ceil(bottom + parseFloat(getComputedStyle(page).paddingBottom));
      page.style.minHeight = print ? need + 'px' : `max(var(--dy-minh, 100%), ${need}px)`;
    }
  }

  /** Scale of a page on screen (1 = as laid out; smaller on phones, larger when zoomed in). */
  function scaleOf(page) {
    return (page.offsetWidth && page.getBoundingClientRect().width / page.offsetWidth) || 1;
  }

  // ---- Phones: the page as a whole, scaled like a PDF -------------------------------
  // The page keeps its A4 width (same line breaks as in print, stickers stay in
  // place); on a narrow screen it is scaled down to fit, two fingers zoom in.
  // The sheet around it gets the scaled size, so the scroll area fits.

  let userZoom = 1; // 1 = fitting the width; set by two fingers

  function applyScale() {
    const scroll = dialog.querySelector('.dy-scroll'), page = dialog.querySelector('.dy-page');
    const cs = getComputedStyle(scroll);
    const availW = scroll.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = scroll.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const fit = availW > 0 && page.offsetWidth ? Math.min(1, availW / page.offsetWidth) : 1; // not laid out yet: as it is
    userZoom = Math.max(1, Math.min(userZoom, 2 / fit)); // at most twice the real size
    const s = fit * userZoom;
    view.scale = s;
    page.style.setProperty('--dy-minh', Math.max(0, availH / s) + 'px'); // the page fills the visible area
    page.style.setProperty('--dy-k', String(1 / s)); // handles of the stickers keep their size on screen (css)
    page.style.transform = Math.abs(s - 1) < 0.001 ? '' : `scale(${s})`;
    sizeSheet();
  }

  function sizeSheet() {
    const sheet = dialog && dialog.querySelector('.dy-sheet'), page = sheet && sheet.firstElementChild;
    if (!page) return;
    const s = view.scale || 1;
    sheet.style.width = page.offsetWidth * s + 'px';
    sheet.style.height = page.offsetHeight * s + 'px';
  }

  /** Two fingers on the page: zoom in and out (the point between them stays put). */
  function initPinch(scroll) {
    const fingers = new Map();
    let pinch = null, twist = null;
    const state = () => {
      const [a, b] = [...fingers.values()];
      return { d: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    scroll.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2) {
        const o = view.edit && ovDrag && ovDrag.o && ovDrag.mode !== 'draw' ? ovDrag.o : null;
        ovDrag = null; // a sticker drag of the first finger ends
        const [a, b] = [...fingers.values()];
        if (o) {
          // the first finger is on the selected sticker / image: turn and resize it
          twist = { o, a0: Math.atan2(b.y - a.y, b.x - a.x), d0: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
            orig: { rot: o.rot || 0, x: o.x, y: o.y, w: o.w, h: o.h } };
        } else {
          pinch = Object.assign(state(), { zoom: userZoom });
        }
        e.stopPropagation();
      }
    }, true);
    scroll.addEventListener('pointermove', (e) => {
      if (!fingers.has(e.pointerId)) return;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (twist && fingers.size === 2) {
        e.stopPropagation();
        const [a, b] = [...fingers.values()], k = twist.orig, o = twist.o;
        o.rot = MM.snapAngle(k.rot + ((Math.atan2(b.y - a.y, b.x - a.x) - twist.a0) * 180) / Math.PI);
        if (!o.rot) delete o.rot;
        const f = Math.hypot(a.x - b.x, a.y - b.y) / twist.d0;
        const w = Math.max(0.01, k.w * f), h = Math.max(0.01, k.h * f);
        Object.assign(o, { x: k.x + (k.w - w) / 2, y: k.y + (k.h - h) / 2, w, h });
        refreshOverlays();
        return;
      }
      if (!pinch || fingers.size !== 2) return;
      e.stopPropagation();
      const now = state(), r = scroll.getBoundingClientRect();
      const before = view.scale || 1;
      userZoom = pinch.zoom * now.d / pinch.d;
      applyScale();
      const f = (view.scale || 1) / before;
      const mx = now.x - r.left, my = now.y - r.top;
      scroll.scrollLeft = (scroll.scrollLeft + mx) * f - mx;
      scroll.scrollTop = (scroll.scrollTop + my) * f - my;
    }, true);
    const lift = (e) => {
      fingers.delete(e.pointerId);
      if (fingers.size < 2) pinch = null;
      if (fingers.size < 2 && twist) {
        anchorOverlay(twist.o); // stuck to the entry it now lies on
        twist = null;
        renderLayer();
        save();
      }
    };
    scroll.addEventListener('pointerup', lift, true);
    scroll.addEventListener('pointercancel', lift, true);
  }

  /**
   * Whenever the text of an entry changes its height (images or fonts loaded
   * late, …), the entries are put on the lines again. Only the text blocks are
   * watched - layoutPage changes the gaps between them, not their size, so
   * this cannot run in circles.
   */
  let heightWatch = null, layoutQueued = false;
  function watchHeights(page) {
    if (heightWatch) heightWatch.disconnect();
    if (!window.ResizeObserver) return;
    heightWatch = new ResizeObserver(() => {
      if (layoutQueued) return;
      layoutQueued = true;
      requestAnimationFrame(() => {
        layoutQueued = false;
        if (dialog.open && view.day) layoutPage(page);
      });
    });
    page.querySelectorAll('.dy-body, .dy-entry-head').forEach((el) => heightWatch.observe(el));
  }

  /** Resolves when the images in `root` and the fonts are loaded. */
  function whenLoaded(root) {
    const imgs = [...root.querySelectorAll('img')].filter((i) => !i.complete);
    return Promise.all(imgs.map((i) => new Promise((ok) => {
      i.addEventListener('load', ok, { once: true });
      i.addEventListener('error', ok, { once: true });
    })).concat(document.fonts ? [document.fonts.ready] : []));
  }

  /** Redraw the stickers of the shown page (each layer: the page's own, and one per entry). */
  function refreshOverlays() {
    const page = dialog.querySelector('.dy-page');
    const ids = [...page.querySelectorAll('.dy-entry')].map((s) => s.dataset.entry);
    for (const layer of page.querySelectorAll('.dy-ov-layer')) {
      const owner = layer.dataset.owner;
      const list = overlaysOf(view.day).filter((o) => (owner ? o.entry === owner : !o.entry || !ids.includes(o.entry)));
      layer.innerHTML = list.map(overlayHTML).join('');
    }
    layoutPage(page);
  }

  /** Origin of a sticker layer (page or entry) in page widths, relative to the page. */
  function originOf(owner, g) {
    const page = dialog.querySelector('.dy-page');
    const layer = owner && page.querySelector(`.dy-ov-layer[data-owner="${CSS.escape(owner)}"]`);
    if (!layer) return { x: 0, y: 0 };
    const r = layer.getBoundingClientRect();
    return { x: (r.left - g.left) / g.unit, y: (r.top - g.top) / g.unit };
  }

  /**
   * Stick a sticker to the entry it lies on (like into an exercise book): the
   * entry whose area contains its middle - between two entries the upper one,
   * above the first entry the page itself. Its position is converted, so it
   * does not move; from then on it moves with its entry.
   */
  function anchorOverlay(o) {
    const g = pageUnit(), page = dialog.querySelector('.dy-page');
    const sections = [...page.querySelectorAll('.dy-entry')];
    const present = o.entry && sections.some((s) => s.dataset.entry === o.entry);
    const from = originOf(present ? o.entry : '', g);
    const abs = { x: from.x + o.x, y: from.y + o.y };
    const mid = abs.y + o.h / 2;
    let owner = '';
    for (const s of sections) if (mid >= (s.getBoundingClientRect().top - g.top) / g.unit) owner = s.dataset.entry;
    const to = originOf(owner, g);
    o.entry = owner;
    o.x = abs.x - to.x;
    o.y = abs.y - to.y;
  }

  function renderLayer() {
    refreshOverlays();
    renderTools();
  }

  /** Overlay from a file (untrusted) -> clean object, or null. */
  function cleanOverlay(o) {
    if (!o || typeof o !== 'object' || !['sticker', 'image', 'draw'].includes(o.kind)) return null;
    const num = (v, lo, hi, d) => {
      const x = Number(v);
      return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d;
    };
    const color = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d);
    const c = {
      id: str(o.id) || MM.uid('o'), kind: o.kind,
      entry: str(o.entry).slice(0, 80), // entry it is stuck to ('' = the page)
      x: num(o.x, -1, 2, 0), y: num(o.y, -1000, 1000, 0), w: num(o.w, 0.005, 3, 0.1), h: num(o.h, 0.005, 3, 0.1),
    };
    const rot = Math.round(num(o.rot, 0, 359, 0));
    if (rot) c.rot = rot; // turned around its middle, degrees clockwise
    if (o.kind === 'sticker') c.char = str(o.char).slice(0, 16);
    if (o.kind === 'image') c.asset = str(o.asset);
    if (o.kind === 'draw') {
      const l = o.line && typeof o.line === 'object' ? o.line : {};
      c.shape = Object.hasOwn(MM.DRAW_KINDS, o.shape) ? o.shape : 'rect';
      c.line = { x1: num(l.x1, 0, 1, 0), y1: num(l.y1, 0, 1, 0), x2: num(l.x2, 0, 1, 1), y2: num(l.y2, 0, 1, 1) };
      c.color = color(o.color, '#e53e3e');
      c.width = num(o.width, 0.5, 24, 3);
      c.fill = o.fill === 'none' ? 'none' : color(o.fill, 'none');
    }
    return c;
  }
  DY.cleanOverlay = cleanOverlay;

  /** Edit mode: overlays can be added, moved, resized and deleted. */
  function setEdit(on) {
    if (on && MM.project.status !== 'ready') {
      alert(tr('Diaries live in a project folder.\nOpen a folder in the "Project" sidebar first.'));
      on = false;
    }
    view.edit = !!on && !!view.day;
    view.tool = null;
    view.sel = null;
    view.color = view.color || (view.diary ? view.diary.style.accent : '#e53e3e');
    dialog.querySelector('.dy-page').classList.toggle('dy-editing', view.edit);
    const btn = dialog.querySelector('.dy-ov-toggle');
    btn.textContent = view.edit ? '✓ ' + tr('Done editing') : '🖼 ' + tr('Stickers');
    btn.title = tr('Put stickers, images and drawings on this page');
    btn.classList.toggle('active', view.edit);
    if (view.day) renderLayer();
    else renderTools();
  }

  const KIND_ICONS = { rect: '▭', ellipse: '◯', line: '╱', arrow: '➚' };

  function renderTools() {
    const box = dialog.querySelector('.dy-ov-tools');
    box.hidden = !view.edit;
    if (!view.edit) return;
    box.innerHTML = `
      <button type="button" data-dy="sticker">😀 ${esc(tr('Sticker'))}</button>
      <button type="button" data-dy="image">🖼 ${esc(tr('Image'))}</button>
      <span class="dy-tools-sep"></span>
      ${Object.keys(MM.DRAW_KINDS).map((k) => `<button type="button" data-dy="tool" data-kind="${k}" class="${view.tool === k ? 'active' : ''}"
        title="${esc(tr(MM.DRAW_KINDS[k]))}">${KIND_ICONS[k]}</button>`).join('')}
      <input type="color" class="dy-ov-color" value="${esc(view.color)}" title="${esc(tr('Colour of drawings'))}">
      <button type="button" data-dy="deleteOverlay" ${view.sel ? '' : 'disabled'} title="${esc(tr('Delete (Del)'))}">🗑</button>
      <span class="dy-tools-hint">${esc(view.tool ? tr('Drag on the page to draw') : tr('Drag to move, the corner to resize. Drag the head of an entry down to make room above it.'))}</span>`;
  }

  function setTool(kind) {
    view.tool = kind;
    dialog.querySelector('.dy-page').classList.toggle('dy-drawing', !!kind);
    renderTools();
  }

  /** Page geometry: origin (screen) of the page box and its width unit in px (= 100cqw). */
  function pageUnit() {
    const page = dialog.querySelector('.dy-page');
    const r = page.getBoundingClientRect(), cs = getComputedStyle(page), k = scaleOf(page);
    const unit = (page.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * k; // screen px
    return { left: r.left + page.clientLeft * k, top: r.top + page.clientTop * k, unit: unit || 1 };
  }

  /** Where new stickers / images go: centred in the visible part of the page. */
  function visibleCenter(w, h) {
    const g = pageUnit(), sr = dialog.querySelector('.dy-scroll').getBoundingClientRect();
    const cy = (sr.top + sr.height / 2 - g.top) / g.unit;
    return { x: 0.5 - w / 2, y: Math.max(0, cy - h / 2) };
  }

  /** New sticker at page coordinates: shown, then stuck to the entry it lies on. */
  function addOverlay(o) {
    o.entry = '';
    getPage(view.day).overlays.push(o);
    view.sel = o.id;
    refreshOverlays();
    anchorOverlay(o);
    renderLayer();
    save();
  }

  async function addSticker(btn) {
    const char = await MM.emoji.pick({ mode: 'pick', container: dialog, anchorRect: btn.getBoundingClientRect() });
    if (!char || !view.edit) return;
    const s = 0.09;
    addOverlay(Object.assign({ id: MM.uid('o'), kind: 'sticker', char, w: s, h: s }, visibleCenter(s, s)));
  }

  async function addImage() {
    const files = await MM.images.pick(false);
    if (!files.length || !view.edit) return;
    try {
      const img = await MM.images.prepare(files[0]);
      const id = MM.uid('a');
      view.diary.assets[id] = img.url;
      const w = 0.4, h = (w * img.h) / (img.w || 1);
      addOverlay(Object.assign({ id: MM.uid('o'), kind: 'image', asset: id, w, h }, visibleCenter(w, h)));
    } catch (err) {
      MM.ui.flash(tr('Could not read the image'));
    }
  }

  function deleteOverlay() {
    const page = view.diary.pages[view.day];
    if (!page || !view.sel) return;
    page.overlays = page.overlays.filter((o) => o.id !== view.sel);
    view.sel = null;
    pruneAssets();
    renderLayer();
    save();
  }

  function onToolColor(e) {
    if (!e.target.classList.contains('dy-ov-color')) return;
    view.color = e.target.value;
    const o = overlaysOf(view.day).find((x) => x.id === view.sel);
    if (o && o.kind === 'draw') {
      o.color = view.color;
      refreshOverlays(); // keep the colour input (no renderTools)
      save();
    }
  }

  /** Images still used: by closed entries and by overlays. The rest is removed from the diary. */
  function pruneAssets() {
    const used = new Set();
    for (const p of Object.values(view.diary.pages)) {
      if (p.closed) p.closed.entries.forEach((en) => MM.md.assetIds(en.markdown).forEach((id) => used.add(id)));
      (p.overlays || []).forEach((o) => o.asset && used.add(o.asset));
    }
    for (const id of Object.keys(view.diary.assets)) if (!used.has(id)) delete view.diary.assets[id];
  }

  // dragging on the page (edit mode only)
  let ovDrag = null;

  function onPagePointerDown(e) {
    if (!view.edit || e.button !== 0) return;
    const g = pageUnit();
    const p = { x: (e.clientX - g.left) / g.unit, y: (e.clientY - g.top) / g.unit };
    const el = e.target.closest('.dy-ov');
    const head = !el && !view.tool && !e.target.closest('button') && e.target.closest('.dy-entry-head');
    if (el) {
      const o = overlaysOf(view.day).find((x) => x.id === el.dataset.ov);
      if (!o) return;
      view.sel = o.id;
      if (e.target.classList.contains('dy-ov-rot')) {
        // round handle above it: turn around the middle (Shift: 15 degree steps)
        const r = el.getBoundingClientRect(), c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        ovDrag = { mode: 'rotate', o, c, a0: Math.atan2(e.clientY - c.y, e.clientX - c.x), orig: o.rot || 0, moved: false };
      } else {
        ovDrag = { mode: e.target.classList.contains('dy-ov-handle') ? 'resize' : 'move', o, start: p, orig: { x: o.x, y: o.y, w: o.w, h: o.h }, unit: g.unit, moved: false };
      }
    } else if (head) {
      // head of an entry: dragging down pushes empty lines in above it (whole lines, so the text stays on the ruling)
      const id = head.closest('.dy-entry').dataset.entry;
      const pg = dialog.querySelector('.dy-page');
      const L = (parseFloat(getComputedStyle(pg).lineHeight) || 25.6) * scaleOf(pg); // one line on screen
      ovDrag = { mode: 'gap', id, startY: e.clientY, orig: gapOf(view.day, id), line: L, moved: false };
    } else if (view.tool) {
      ovDrag = { mode: 'draw', start: p, o: null, unit: g.unit, moved: false };
    } else {
      if (view.sel) {
        view.sel = null;
        renderLayer();
      }
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    renderLayer();
  }

  function onPagePointerMove(e) {
    if (!ovDrag) return;
    if (ovDrag.mode === 'gap') {
      const lines = Math.max(0, Math.min(200, ovDrag.orig + Math.round((e.clientY - ovDrag.startY) / ovDrag.line)));
      if (lines === gapOf(view.day, ovDrag.id)) return;
      ovDrag.moved = true;
      const page = getPage(view.day);
      page.gaps = page.gaps || {};
      if (lines) page.gaps[ovDrag.id] = lines;
      else delete page.gaps[ovDrag.id];
      const spacer = dialog.querySelector(`.dy-gap[data-gap="${CSS.escape(ovDrag.id)}"]`);
      if (spacer) spacer.style.height = `calc(${lines} * var(--dy-line))`;
      layoutPage(dialog.querySelector('.dy-page'));
      return;
    }
    if (ovDrag.mode === 'rotate') {
      const a = Math.atan2(e.clientY - ovDrag.c.y, e.clientX - ovDrag.c.x);
      ovDrag.o.rot = MM.snapAngle(ovDrag.orig + ((a - ovDrag.a0) * 180) / Math.PI, e.shiftKey);
      if (!ovDrag.o.rot) delete ovDrag.o.rot;
      ovDrag.moved = true;
      refreshOverlays();
      return;
    }
    const g = pageUnit();
    const p = { x: (e.clientX - g.left) / g.unit, y: (e.clientY - g.top) / g.unit };
    const dx = p.x - ovDrag.start.x, dy = p.y - ovDrag.start.y;
    if (!ovDrag.moved && Math.hypot(dx, dy) * g.unit < 3) return;
    ovDrag.moved = true;
    const o = ovDrag.o, k = ovDrag.orig;
    if (ovDrag.mode === 'move') {
      o.x = k.x + dx;
      o.y = o.entry ? k.y + dy : Math.max(0, k.y + dy); // above the page top only via an entry
    } else if (ovDrag.mode === 'resize') {
      o.w = Math.max(0.01, k.w + dx);
      // stickers and images keep their proportions, drawings are free
      o.h = o.kind === 'draw' ? Math.max(0.01, k.h + dy) : (o.w * k.h) / k.w;
    } else {
      // draw: the same geometry as drawings on the map (in px, then in page widths)
      const u = g.unit, px = (q) => ({ x: q.x * u, y: q.y * u });
      const b = MM.draw.boxFor(view.tool, px(ovDrag.start), px(p), e.shiftKey);
      if (!ovDrag.o) {
        ovDrag.o = { id: MM.uid('o'), kind: 'draw', entry: '', shape: view.tool, color: view.color, width: 3, fill: 'none' };
        getPage(view.day).overlays.push(ovDrag.o);
        view.sel = ovDrag.o.id;
      }
      Object.assign(ovDrag.o, { x: b.x / u, y: b.y / u, w: b.w / u, h: b.h / u, line: b.line });
    }
    refreshOverlays();
  }

  function onPagePointerUp(e) {
    if (!ovDrag) return;
    const d = ovDrag;
    ovDrag = null;
    if (e.currentTarget.hasPointerCapture && e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d.mode === 'gap') {
      if (d.moved) save();
      return;
    }
    if (d.mode === 'draw') setTool(null);
    // moved, resized or drawn: stuck to the entry it now lies on
    if (d.moved && d.o) anchorOverlay(d.o);
    renderLayer();
    if (d.moved) save();
  }

  // ---- Printing / PDF --------------------------------------------------------------------

  function renderPrint() {
    const first = view.days[0] || '', last = view.days[view.days.length - 1] || '';
    dialog.querySelector('.dy-print').innerHTML = `
      <label class="dy-print-row"><input type="radio" name="dy-pr" value="page" checked> ${esc(tr('This page'))}</label>
      <label class="dy-print-row"><input type="radio" name="dy-pr" value="all"> ${esc(tr('Whole diary ({n} pages)', { n: view.days.length }))}</label>
      <label class="dy-print-row"><input type="radio" name="dy-pr" value="range"> ${esc(tr('From'))}
        <input type="date" class="dy-pr-from" value="${esc(first)}"> ${esc(tr('to'))} <input type="date" class="dy-pr-to" value="${esc(last)}"></label>
      <div class="dy-print-row"><button type="button" class="primary" data-dy="doPrint">🖨 ${esc(tr('Print / PDF'))}</button></div>
      <p class="hint">${esc(tr('For a PDF choose "Save as PDF" as the printer.'))}</p>`;
  }

  async function doPrint() {
    const box = dialog.querySelector('.dy-print');
    const how = (box.querySelector('input[name="dy-pr"]:checked') || {}).value;
    let days = how === 'all' ? view.days.slice() : view.day ? [view.day] : [];
    if (how === 'range') {
      const from = box.querySelector('.dy-pr-from').value || '0000', to = box.querySelector('.dy-pr-to').value || '9999';
      days = view.days.filter((d) => d >= from && d <= to);
    }
    if (!days.length) {
      alert(tr('No pages in this period.'));
      return;
    }
    popup(null);
    flushSave();
    let out = document.getElementById('diary-print');
    if (!out) {
      out = document.createElement('div');
      out.id = 'diary-print';
      document.body.appendChild(out);
    }
    const ruling = view.diary.style.ruling;
    const sel = view.sel;
    view.sel = null; // no selection frame on paper
    out.innerHTML = days.map((d) => `<article class="dy-page" style="${esc(styleVars())}" data-ruling="${esc(ruling)}">` +
      `<div class="dy-print-book">${esc(view.book)}</div>${pageHTML(d)}</article>`).join('');
    view.sel = sel;
    // laid out off screen at the width of the paper (A4), so lines and page lengths fit the print
    out.classList.add('dy-measure');
    await whenLoaded(out);
    out.querySelectorAll('.dy-page').forEach((p) => layoutPage(p, true));
    out.classList.remove('dy-measure');
    const cleanup = () => {
      window.removeEventListener('afterprint', cleanup);
      out.innerHTML = '';
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
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
