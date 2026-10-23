'use strict';
/*
 * Diaries / lab books (see plans/diary-plan.md).
 *
 * Entries are notes of the type 'diary' anywhere in the maps:
 *   node.text  = Markdown (markdown.js), images as ![x](asset:<id>)
 *   node.diary = { book, date 'YYYY-MM-DD', time 'HH:MM' }
 * A diary itself is a file Diaries/<name>.diary.json (project.js) with its look
 * and, later, page overlays and closed pages.
 *
 * The reader shows one page per day that has entries (empty days are skipped),
 * the entries of a day by time. Each entry has a head with the note(s) whose
 * arrow points at it ("mothers", side by side) and, above them, the topmost
 * task reached by following the arrows upwards ("master task").
 * ←/→ turn the pages, the mouse wheel scrolls a page.
 */
(function (MM) {
  const S = MM.state;
  const DY = (MM.diary = {});
  const tr = (s, v) => MM.tr(s, v);
  const esc = (s) => MM.render.esc(s);

  DY.DEFAULT_STYLE = { font: 'Georgia', fontSize: 16, text: '#2d2a26', accent: '#b7791f', paper: '#fdf8ec', ruling: 'none' };
  DY.RULINGS = ['none', 'lines', 'grid', 'dots'];

  /** A diary file as read from disk (untrusted) -> clean object. */
  DY.normalize = function (raw, name) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const st = r.style && typeof r.style === 'object' ? r.style : {};
    const D = DY.DEFAULT_STYLE;
    const color = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d);
    const size = Number(st.fontSize);
    const assets = {};
    if (r.assets && typeof r.assets === 'object') {
      for (const [id, url] of Object.entries(r.assets)) if (typeof url === 'string' && url.startsWith('data:image/')) assets[id] = url;
    }
    return {
      app: 'MindMapper-diary', version: 1, name: String(name),
      style: {
        font: typeof st.font === 'string' && st.font.trim() ? st.font.replace(/[^\w\s-]/g, '').slice(0, 60) : D.font,
        fontSize: size >= 10 && size <= 32 ? size : D.fontSize,
        text: color(st.text, D.text), accent: color(st.accent, D.accent), paper: color(st.paper, D.paper),
        ruling: DY.RULINGS.includes(st.ruling) ? st.ruling : D.ruling,
      },
      pages: r.pages && typeof r.pages === 'object' ? r.pages : {}, // closed pages and overlays (stage 2 / 3)
      assets,
    };
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

  // ---- Reader ----------------------------------------------------------------------

  let dialog = null;
  const view = { book: '', diary: null, entries: [], days: [], day: '' };

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'diary-dialog';
    dialog.innerHTML = `
      <div class="dy-bar">
        <span class="dy-title"></span>
        <button type="button" class="dy-prev" data-dy="prev">◀</button>
        <select class="dy-days"></select>
        <button type="button" class="dy-next" data-dy="next">▶</button>
        <span class="dy-spacer"></span>
        <button type="button" class="dy-close" data-dy="close">✕</button>
      </div>
      <div class="dy-scroll"><article class="dy-page"></article></div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) return dialog.close(); // backdrop
      const b = e.target.closest('[data-dy]');
      if (b) {
        if (b.dataset.dy === 'prev') turn(-1);
        else if (b.dataset.dy === 'next') turn(1);
        else if (b.dataset.dy === 'close') dialog.close();
        return;
      }
      const go = e.target.closest('[data-goto]');
      if (go) showInMap(go.dataset.path, go.dataset.goto);
    });
    dialog.querySelector('.dy-days').addEventListener('change', (e) => show(e.target.value));
    dialog.addEventListener('keydown', (e) => {
      e.stopPropagation(); // the canvas must not move notes meanwhile
      if (e.target.tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        turn(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        turn(1);
      }
    });
  }

  /**
   * Open a diary. opts.date: the page to show (else the newest);
   * opts.entry: id of an entry to scroll to and highlight.
   */
  DY.open = async function (book, opts) {
    const o = opts || {};
    if (!book) return;
    if (!dialog) build();
    const P = MM.project;
    view.book = book;
    view.diary = P.status === 'ready' ? await P.readDiary(book) : DY.normalize(null, book);
    if (S.settings.lastDiary !== book) {
      S.settings.lastDiary = book;
      MM.saveSettings();
    }
    dialog.querySelector('.dy-title').textContent = '📖 ' + book;
    dialog.querySelector('.dy-page').innerHTML = `<p class="hint">${esc(tr('Reading the maps…'))}</p>`;
    if (!dialog.open) dialog.showModal();
    if (P.status === 'ready') await MM.load.refresh(); // every map, fresh from disk
    view.entries = DY.entries(book);
    view.days = [...new Set(view.entries.map((e) => e.date))];
    applyStyle();
    const day = view.days.includes(o.date) ? o.date : view.days[view.days.length - 1] || '';
    show(day, o.entry);
  };

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

  const longDate = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(MM.locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : s;
  };

  /** Show the page of `day`; scroll to entry `entryId` if given. */
  function show(day, entryId) {
    view.day = day;
    const sel = dialog.querySelector('.dy-days');
    sel.innerHTML = view.days.slice().reverse().map((d) =>
      `<option value="${esc(d)}"${d === day ? ' selected' : ''}>${esc(longDate(d))}</option>`).join('');
    sel.disabled = !view.days.length;
    const i = view.days.indexOf(day);
    dialog.querySelector('.dy-prev').disabled = i <= 0;
    dialog.querySelector('.dy-next').disabled = i < 0 || i >= view.days.length - 1;
    const page = dialog.querySelector('.dy-page');
    if (!day) {
      page.innerHTML = `<p class="dy-none">${esc(tr('No entries yet. Add a note of the type "Diary entry" to a map and choose this diary in its panel.'))}</p>`;
      return;
    }
    const list = view.entries.filter((e) => e.date === day);
    page.innerHTML = `<h2 class="dy-day">${esc(longDate(day))}</h2>` + list.map(entryHTML).join('');
    const scroll = dialog.querySelector('.dy-scroll');
    scroll.scrollTop = 0;
    const target = entryId && page.querySelector(`[data-entry="${CSS.escape(entryId)}"]`);
    if (target) {
      target.scrollIntoView({ block: 'start' });
      target.classList.add('dy-focus');
    }
    dialog.focus();
  }

  /** Small card of a mother note: title, map, status / progress / deadline / tags, master task. */
  function motherHTML(e, { m, master }) {
    const calc = m.type === 'task' ? MM.tasks.compute(e.doc, null).info.get(m.id) : null;
    const meta = Object.assign({}, m.meta || {}, calc ? { progress: calc.progress } : {});
    const chips = MM.meta.chipsHTML({ type: m.type, meta, tags: m.tags || [], repeat: null }, false);
    const title = (m.text || '').split('\n')[0] || tr(MM.NODE_TYPES[m.type] || 'Note');
    return `<div class="dy-mother">
      ${master ? `<div class="dy-master" title="${esc(tr('Master task'))}">⤴ ${esc((master.text || '').split('\n')[0])}</div>` : ''}
      <div class="dy-m-title">${esc(title)}</div>
      ${chips ? `<div class="dy-m-chips">${chips}</div>` : ''}
    </div>`;
  }

  function entryHTML(e) {
    const head = DY.headOf(e);
    const map = e.path === S.file.path || !MM.project.find(e.path) ? (S.file.path ? MM.project.mapName(S.file.path) : S.file.name) : MM.project.mapName(e.path);
    const body = e.n.text.trim() ? MM.md.render(e.n.text, (id) => (e.doc.assets || {})[id]) : `<p class="dy-empty">${esc(tr('(empty entry)'))}</p>`;
    return `<section class="dy-entry" data-entry="${esc(e.n.id)}">
      <div class="dy-entry-head">
        <span class="dy-time">${esc(e.time || '')}</span>
        <div class="dy-mothers">${head.map((h) => motherHTML(e, h)).join('')}</div>
        <button type="button" class="dy-goto" data-goto="${esc(e.n.id)}" data-path="${esc(e.path)}" title="${esc(tr('Show the entry in its map ({map})', { map }))}">↗ ${esc(map)}</button>
      </div>
      <div class="dy-body md">${body}</div>
    </section>`;
  }

  /** Close the reader and show an entry in its map. */
  async function showInMap(path, id) {
    dialog.close();
    if (path !== S.file.path && MM.project.find(path) && !(await MM.project.openMap(path))) return;
    MM.actions.focusNode(id);
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
