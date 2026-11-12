'use strict';
/*
 * Map as PDF (or on paper): the browser's print dialog with "Save as PDF".
 * No library - a copy of the drawn map (#world) is scaled onto one page.
 *   scope:       whole map | visible area | selected notes
 *   paper:       A4 | A3, orientation auto | landscape | portrait
 * While printing the page shows only #map-print (body.print-map, see app.css)
 * and the light theme, so dark mode does not end up on paper.
 */
(function (MM) {
  const S = MM.state;
  const X = (MM.mapPrint = {});
  const tr = (s, v) => MM.tr(s, v);
  const esc = (s) => MM.render.esc(s);
  const PAPER = { A4: [297, 210], A3: [420, 297] }; // mm, landscape
  const MARGIN = 10; // mm
  const PX = 96 / 25.4; // CSS px per mm
  let dialog = null;
  const choice = { scope: 'map', paper: 'A4', orient: 'auto', title: true };

  // ---- Area to print (world coordinates) --------------------------------------------

  function boxOf(nodes, edges, pad = 24) { // pad: arrow heads, labels, shadows
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const take = (x, y) => {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    };
    for (const n of nodes) {
      take(n.x, n.y);
      take(n.x + n.w, n.y + n.h);
    }
    // free ends of connections reach beyond the notes
    for (const e of edges) for (const end of [e.source, e.target]) if (end && typeof end.x === 'number') take(end.x, end.y);
    if (!isFinite(x0)) return null;
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  }

  /** { box, nodeIds (null = all) } for the chosen scope. */
  function area(scope, pad) {
    const nodes = Object.values(S.doc.nodes), edges = Object.values(S.doc.edges);
    // a block: the page shown (notebook.js)
    if (scope === 'page' && S.doc.page) return { box: MM.notebook.pageBox(MM.notebook.cur), nodeIds: null };
    if (scope === 'view') {
      const vp = document.getElementById('viewport').getBoundingClientRect(), v = S.doc.view;
      return { box: { x: -v.x / v.zoom, y: -v.y / v.zoom, w: vp.width / v.zoom, h: vp.height / v.zoom }, nodeIds: null };
    }
    if (scope === 'selection') {
      const ids = new Set(MM.selectedNodes().map((n) => n.id));
      // drawings anchored to them belong to them (e.g. handwriting on a picture)
      MM.draw.anchoredTo(ids).forEach((id) => ids.add(id));
      const sel = nodes.filter((n) => ids.has(n.id));
      const inner = edges.filter((e) => ids.has(e.source.node) && ids.has(e.target.node));
      return { box: boxOf(sel, inner, pad), nodeIds: ids };
    }
    return { box: boxOf(nodes, edges, pad), nodeIds: null };
  }

  /**
   * A copy of the drawn map (#world) without selection, handles and guides; with nodeIds
   * only those notes and the connections between them. keepIds: for a document of its own
   * (the PNG) - in this page a second #node-layer etc. must not be.
   * before(orig, copy): called while the copy still has every element of the original.
   */
  function copyOfWorld(nodeIds, keepIds, before) {
    // a block: every page into the copy (notebook.js draws only those near the screen)
    if (MM.notebook) MM.notebook.showAll(true);
    const orig = document.getElementById('world');
    const world = orig.cloneNode(true);
    try {
      if (before) before(orig, world);
    } finally {
      if (MM.notebook) MM.notebook.showAll(false);
    }
    world.removeAttribute('id');
    for (const sel of ['#overlay-layer', '#ui-layer']) world.querySelectorAll(sel).forEach((x) => x.remove());
    if (!keepIds) world.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id')); // no second #node-layer etc.
    world.querySelectorAll('.selected').forEach((x) => x.classList.remove('selected'));
    world.querySelectorAll('.edge-sel').forEach((x) => x.remove()); // the halo of a selected connection
    const vp = document.getElementById('viewport');
    if (vp.classList.contains('filter-hide')) world.querySelectorAll('.filtered-out').forEach((x) => x.remove());
    else if (vp.classList.contains('filter-dim')) world.querySelectorAll('.filtered-out').forEach((x) => (x.style.opacity = '0.13'));
    if (nodeIds) {
      // selected notes only: other notes and connections that do not join two of them go
      world.querySelectorAll('.node[data-id]').forEach((x) => { if (!nodeIds.has(x.dataset.id)) x.remove(); });
      for (const e of Object.values(S.doc.edges)) {
        if (nodeIds.has(e.source.node) && nodeIds.has(e.target.node)) continue;
        world.querySelectorAll(`[data-id="${CSS.escape(e.id)}"]`).forEach((x) => x.remove());
      }
    }
    return world;
  }

  /** Name of the open map (for the title line and the file name). */
  const mapName = () => (S.file.path ? MM.project.mapName(S.file.path) : S.file.name.replace(/\.mindmap\.json$|\.json$/i, ''));

  // ---- Web links stay clickable in the PDF -------------------------------------------

  /** Web address of a note link (http/https/www./mailto), or '' for maps, PC paths, file:. */
  function webHref(link) {
    const s = String(link || '').trim();
    if (/^https?:\/\//i.test(s) || /^mailto:/i.test(s)) return s;
    if (/^www\./i.test(s)) return 'https://' + s;
    return '';
  }

  /**
   * The print copy gets real <a href> elements: the browser's "Save as PDF" keeps
   * them as clickable areas. Link notes become clickable as a whole and show the full
   * address (readable on paper), other notes with a web link get it on their ↗ button.
   * Only the copy is changed - the map itself still opens links via MM.links.open.
   */
  function webLinks(world) {
    world.querySelectorAll('.node[data-id]').forEach((div) => {
      const n = S.doc.nodes[div.dataset.id];
      const href = n && webHref(n.link);
      if (!href) return;
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'mp-link';
      if (n.type === 'link') {
        const target = div.querySelector('.link-target');
        if (target) {
          target.textContent = '→ ' + href.replace(/^mailto:/i, '');
          target.classList.add('mp-link-full');
        }
        div.appendChild(a);
      } else {
        const btn = div.querySelector('.node-linkbtn');
        if (!btn || btn.hidden) return;
        btn.appendChild(a);
      }
    });
  }

  // ---- Printing --------------------------------------------------------------------

  X.print = function () {
    MM.edit.finish();
    const { box, nodeIds } = area(choice.scope);
    if (!box) {
      alert(tr('There is nothing to print.'));
      return;
    }
    const [lw, lh] = PAPER[choice.paper];
    const landscape = choice.orient === 'auto' ? box.w >= box.h : choice.orient === 'landscape';
    const pageW = (landscape ? lw : lh) - 2 * MARGIN, pageH = (landscape ? lh : lw) - 2 * MARGIN;
    const head = choice.title ? 9 : 0; // mm for the title line
    const W = pageW * PX, H = (pageH - head) * PX - 2; // a little room against an empty 2nd page
    const scale = Math.min(W / box.w, H / box.h);

    // the copy of the drawn map, without selection handles / guides
    const world = copyOfWorld(nodeIds, false);
    world.className = 'mp-world';
    webLinks(world);
    const offX = (W - box.w * scale) / 2, offY = (H - box.h * scale) / 2;
    world.style.transform = `translate(${offX - box.x * scale}px, ${offY - box.y * scale}px) scale(${scale})`;

    const out = printArea();
    const name = mapName();
    const date = new Date().toLocaleDateString(MM.locale(), { day: 'numeric', month: 'long', year: 'numeric' });
    out.innerHTML = (choice.title ? `<div class="mp-title"><b>${esc(name)}</b><span>${esc(date)}</span></div>` : '') +
      `<div class="mp-page" style="width:${W}px;height:${H}px"></div>`;
    out.querySelector('.mp-page').appendChild(world);
    printOut(out, `size: ${choice.paper} ${landscape ? 'landscape' : 'portrait'}; margin: ${MARGIN}mm;`);
  };

  function printArea() {
    let out = document.getElementById('map-print');
    if (!out) {
      out = document.createElement('div');
      out.id = 'map-print';
      document.body.appendChild(out);
    }
    delete out.dataset.bg; // a map is printed as it is (blocks: X.printPages sets it)
    return out;
  }

  /** Open the print dialog for #map-print: `page` = the @page rule, the light theme while printing. */
  function printOut(out, page) {
    const style = document.createElement('style');
    style.textContent = `@media print { @page { ${page} } }`;
    document.head.appendChild(style);
    const root = document.documentElement, theme = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    document.body.classList.add('print-map');
    const done = () => {
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('print-map');
      if (theme === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', theme);
      style.remove();
      out.innerHTML = '';
    };
    window.addEventListener('afterprint', done);
    // let the browser lay out the copy (images, fonts) before the dialog opens
    requestAnimationFrame(() => setTimeout(() => window.print(), 50));
  }

  // ---- A block (notebook.js): its pages 1:1 on A4 sheets ------------------------------

  /** Print / PDF of pages from … to (indices) of the open block, one sheet per page; bg: MM.PRINT_BGS. */
  X.printPages = function (from, to, bg) {
    MM.edit.finish();
    const NB = MM.notebook, page = S.doc.page;
    if (!page) return;
    const { w, h } = NB.dims();
    const landscape = page.orient === 'landscape';
    const sheetW = (landscape ? 297 : 210) * PX, sheetH = (landscape ? 210 : 297) * PX;
    const s = Math.min(sheetW / w, sheetH / h); // 1:1 (A4 at 96 dpi), rounding only
    const base = copyOfWorld(null, false);
    base.className = 'mp-world';
    const out = printArea();
    out.innerHTML = '';
    out.dataset.bg = bg || MM.printBg();
    for (let k = from; k <= to; k++) {
      const box = NB.pageBox(k);
      const world = base.cloneNode(true);
      // only this page: its sheet of paper and the notes on it
      world.querySelectorAll('.nb-page').forEach((x) => { if (+x.dataset.page !== k) x.remove(); });
      world.querySelectorAll('.node[data-id]').forEach((x) => {
        const n = S.doc.nodes[x.dataset.id];
        if (!n || n.x > box.x + box.w || n.x + n.w < box.x || n.y > box.y + box.h || n.y + n.h < box.y) x.remove();
      });
      webLinks(world);
      world.style.transform = `scale(${s}) translate(${-box.x}px, ${-box.y}px)`;
      const sheet = document.createElement('div');
      sheet.className = 'mp-page mp-sheet';
      sheet.style.cssText = `width:${sheetW}px;height:${sheetH - 1}px`; // a hair less: no empty sheet in between
      sheet.appendChild(world);
      out.appendChild(sheet);
    }
    printOut(out, `size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 0;`);
  };

  /** Ctrl+P / "PDF" in a block: which pages. */
  function blockDialog() {
    const page = S.doc.page, NB = MM.notebook, cur = NB.cur + 1;
    const d = document.createElement('dialog');
    d.id = 'map-print-dialog';
    d.innerHTML = `
      <form method="dialog" class="dlg">
        <h3>${esc(tr('Block as PDF / print'))}</h3>
        <div class="row col"><label>${esc(tr('Pages'))}</label>
          <label class="check"><input type="radio" name="which" value="cur" checked> ${esc(tr('This page ({n})', { n: cur }))}</label>
          <label class="check"><input type="radio" name="which" value="all"> ${esc(tr('All pages (1 – {n})', { n: page.count }))}</label>
          <label class="check"><input type="radio" name="which" value="range"> ${esc(tr('Pages'))}
            <input type="number" name="from" min="1" max="${page.count}" value="${cur}" style="width:4.5em"> –
            <input type="number" name="to" min="1" max="${page.count}" value="${page.count}" style="width:4.5em"></label></div>
        ${MM.printBgHTML()}
        <p class="hint">${esc(tr('Every page on its own A4 sheet, in its real size. For a PDF choose "Save as PDF" as the printer.'))}</p>
        <div class="dlg-buttons">
          <button type="button" data-mp="cancel">${esc(tr('Cancel'))}</button>
          <span style="flex:1"></span>
          <button type="button" data-mp="png">📋 ${esc(tr('Copy as PNG'))}</button>
          <button type="submit" class="primary">🖨 ${esc(tr('Print / PDF'))}</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    const f = d.querySelector('form');
    const range = () => {
      const clamp = (v) => Math.max(1, Math.min(page.count, Math.round(+v) || 1)) - 1;
      if (f.which.value === 'all') return [0, page.count - 1];
      if (f.which.value === 'range') {
        const a = clamp(f.from.value), b = clamp(f.to.value);
        return [Math.min(a, b), Math.max(a, b)];
      }
      return [cur - 1, cur - 1];
    };
    for (const x of [f.from, f.to]) x.addEventListener('focus', () => { f.which.value = 'range'; });
    d.addEventListener('keydown', (e) => e.stopPropagation());
    d.addEventListener('close', () => d.remove());
    d.querySelector('[data-mp="cancel"]').addEventListener('click', () => d.close());
    // the page shown as a picture (PNG)
    d.querySelector('[data-mp="png"]').addEventListener('click', () => {
      d.close();
      X.copyPng('page', false);
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const [a, b] = range();
      const bg = MM.takePrintBg(f);
      d.close();
      X.printPages(a, b, bg);
    });
    d.showModal();
  }

  // ---- As a picture (PNG) into the clipboard -----------------------------------------
  // No library: the copy of the map goes into an SVG (<foreignObject>) together with the
  // page's CSS, the browser draws that onto a canvas, the canvas gives the PNG. Always in
  // the light theme (like the PDF), on white, twice the resolution of zoom 100 %.

  /**
   * The CSS of the page as text - @media rules that apply here and now taken in as plain
   * rules (the picture has another size than the window). null: the browser does not let
   * the page read its CSS (a page opened from disk, file://).
   */
  function pageCss() {
    let out = '';
    const add = (rules) => {
      for (const r of rules) {
        if (r.type === CSSRule.MEDIA_RULE) {
          if (window.matchMedia(r.media.mediaText).matches) add(r.cssRules);
        } else if (r.type === CSSRule.SUPPORTS_RULE) {
          if (CSS.supports(r.conditionText)) add(r.cssRules);
        } else if (r.type === CSSRule.STYLE_RULE || r.type === CSSRule.KEYFRAMES_RULE || r.type === CSSRule.FONT_FACE_RULE) {
          out += r.cssText + '\n';
        }
      }
    };
    try {
      for (const sheet of document.styleSheets) add(sheet.cssRules);
    } catch (e) {
      return null;
    }
    return out;
  }

  /** CSS a style declaration has, as text. */
  function declared(cs) {
    let t = '';
    for (let i = 0; i < cs.length; i++) t += `${cs[i]}:${cs.getPropertyValue(cs[i])};`;
    return t;
  }

  /**
   * Without readable CSS: every element of the copy gets its computed style written onto it
   * (and ::before / ::after as rules of their own). Returns the CSS of those pseudo elements.
   */
  function inlineStyles(orig, copy) {
    const a = [orig, ...orig.querySelectorAll('*')], b = [copy, ...copy.querySelectorAll('*')];
    const pseudo = [];
    a.forEach((el, i) => {
      if (!b[i]) return;
      b[i].setAttribute('style', declared(getComputedStyle(el)));
      for (const ps of ['::before', '::after']) {
        const pc = getComputedStyle(el, ps);
        if (!pc.content || pc.content === 'none' || pc.content === 'normal') continue;
        const cls = 'png-ps' + pseudo.length;
        b[i].classList.add(cls);
        pseudo.push(`.${cls}${ps}{${declared(pc)}}`);
      }
    });
    return pseudo.join('\n');
  }

  /** Pictures shown from blob: addresses (files of the folder) become data: - the SVG picture loads nothing itself. */
  function embedImages(orig, copy) {
    const a = orig.querySelectorAll('img'), b = copy.querySelectorAll('img');
    a.forEach((img, i) => {
      if (!b[i] || !/^blob:/.test(img.src) || !img.complete || !img.naturalWidth) return;
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        b[i].src = c.toDataURL('image/png');
      } catch (e) { /* stays empty in the picture */ }
    });
  }

  /** The PNG (a Blob) of the scope: 'map' | 'view' | 'selection'. */
  X.renderPng = async function (scope, withTitle) {
    const { box, nodeIds } = area(scope, 12);
    if (!box || box.w <= 0 || box.h <= 0) throw new Error(tr('There is nothing to copy.'));
    const head = withTitle ? 36 : 0; // px for the title line
    // twice zoom 100 % - less for a huge map (browsers refuse very large canvases)
    const r = Math.min(2, Math.sqrt(32e6 / (box.w * (box.h + head))), 16000 / box.w, 16000 / (box.h + head));
    const W = Math.ceil(box.w * r), H = Math.ceil((box.h + head) * r);

    let css = pageCss(), world;
    const root = document.documentElement, theme = root.getAttribute('data-theme');
    if (css === null) {
      // the computed styles - of the light theme, as the picture is light
      root.setAttribute('data-theme', 'light');
      try {
        world = copyOfWorld(nodeIds, true, (orig, copy) => {
          css = inlineStyles(orig, copy);
          embedImages(orig, copy);
        });
      } finally {
        if (theme === null) root.removeAttribute('data-theme');
        else root.setAttribute('data-theme', theme);
      }
    } else {
      world = copyOfWorld(nodeIds, true, embedImages);
    }
    world.querySelectorAll('.node-linkbtn').forEach((x) => x.remove()); // ↗: clickable in the app / PDF, not in a picture
    world.id = 'world';
    Object.assign(world.style, {
      position: 'absolute', left: '0', top: '0', transformOrigin: '0 0',
      transform: `translate(${-box.x * r}px, ${(head - box.y) * r}px) scale(${r})`,
    });

    // the page around it: font of the app, the canvas white
    const bodyCs = getComputedStyle(document.body);
    const page = document.createElement('div');
    page.setAttribute('style', `width:${W}px;height:${H}px;font-family:${bodyCs.fontFamily};font-size:${bodyCs.fontSize};` +
      `line-height:${bodyCs.lineHeight};color:var(--text, #1f2933);background:#ffffff;`);
    const style = document.createElement('style');
    style.textContent = css;
    page.appendChild(style);
    if (withTitle) {
      const date = new Date().toLocaleDateString(MM.locale(), { day: 'numeric', month: 'long', year: 'numeric' });
      const t = document.createElement('div');
      t.setAttribute('style', `position:absolute;left:${12 * r}px;top:${10 * r}px;font-size:${15 * r}px;font-weight:600;color:#1f2933;z-index:5`);
      t.textContent = mapName();
      const d = document.createElement('span');
      d.setAttribute('style', `font-weight:400;color:#7b8794;margin-left:${12 * r}px`);
      d.textContent = date;
      t.appendChild(d);
      page.appendChild(t);
    }
    const vp = document.createElement('div');
    vp.id = 'viewport';
    vp.setAttribute('style', `position:relative;overflow:hidden;width:${W}px;height:${H}px;background:#ffffff;`);
    vp.appendChild(world);
    page.appendChild(vp);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" data-theme="light">` +
      `<foreignObject x="0" y="0" width="${W}" height="${H}">${new XMLSerializer().serializeToString(page)}</foreignObject></svg>`;
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error(tr('the browser could not draw the map')));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(tr('the picture is too large')))), 'image/png'));
  };

  /** Save the PNG as a file (where the clipboard does not take pictures). */
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  /**
   * The selected notes (or, with none selected, the whole map) as a picture into the
   * clipboard - paste it anywhere with Ctrl+V. Where the clipboard does not take
   * pictures, it is saved as a PNG file. Must be called right from the click / key.
   */
  X.copyPng = function (scope, withTitle) {
    MM.edit.finish();
    scope = scope || (MM.selectedNodes().length ? 'selection' : 'map');
    const png = X.renderPng(scope, !!withTitle);
    png.catch(() => {}); // reported below
    const name = (MM.project.sanitizeName ? MM.project.sanitizeName(mapName()) : mapName()) + '.png';
    const fail = (err) => alert(tr('Could not create the picture: {err}', { err: (err && err.message) || err }));
    const asFile = () => png.then((blob) => {
      download(blob, name);
      MM.ui.flash(tr('The clipboard does not take pictures here - saved as {name}', { name }));
    }).catch(fail);
    if (!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem)) return asFile();
    // the promise goes in at once, so the browser still counts it as the user's click
    navigator.clipboard.write([new window.ClipboardItem({ 'image/png': png })])
      .then(() => MM.ui.flash(tr('Copied as a picture - paste it with Ctrl+V')))
      .catch(() => png.then(asFile, fail));
  };

  // ---- Dialog ----------------------------------------------------------------------

  function build() {
    const d = document.createElement('dialog');
    d.id = 'map-print-dialog';
    const radio = (name, value, label) => `<label class="check"><input type="radio" name="${name}" value="${value}"> ${esc(tr(label))}</label>`;
    d.innerHTML = `
      <form method="dialog" class="dlg">
        <h3>${esc(tr('Map as PDF / print'))}</h3>
        <div class="row col"><label>${esc(tr('What'))}</label>
          ${radio('scope', 'map', 'Whole map')}
          ${radio('scope', 'view', 'Visible area')}
          ${radio('scope', 'selection', 'Selected notes')}</div>
        <div class="row col"><label>${esc(tr('Paper'))}</label>
          <div class="mp-line">${radio('paper', 'A4', 'A4')} ${radio('paper', 'A3', 'A3')}</div>
          <div class="mp-line">${radio('orient', 'auto', 'Automatic')} ${radio('orient', 'landscape', 'Landscape')} ${radio('orient', 'portrait', 'Portrait')}</div></div>
        <label class="check"><input type="checkbox" name="withTitle"> ${esc(tr('Name of the map and date on top'))}</label>
        <p class="hint">${esc(tr('Everything is scaled onto one page. For a PDF choose "Save as PDF" as the printer.'))}</p>
        <p class="hint">${esc(tr('Copy as PNG puts a picture into the clipboard (paper and orientation do not matter) - paste it with Ctrl+V.'))}</p>
        <div class="dlg-buttons">
          <button type="button" data-mp="cancel">${esc(tr('Cancel'))}</button>
          <span style="flex:1"></span>
          <button type="button" data-mp="png">📋 ${esc(tr('Copy as PNG'))}</button>
          <button type="submit" class="primary">🖨 ${esc(tr('Print / PDF'))}</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    const f = d.querySelector('form');
    d.addEventListener('keydown', (e) => e.stopPropagation());
    d.querySelector('[data-mp="cancel"]').addEventListener('click', () => d.close());
    d.querySelector('[data-mp="png"]').addEventListener('click', () => {
      choice.scope = f.scope.value;
      choice.title = f.withTitle.checked;
      d.close();
      X.copyPng(choice.scope, choice.title);
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      choice.scope = f.scope.value;
      choice.paper = f.paper.value;
      choice.orient = f.orient.value;
      choice.title = f.withTitle.checked;
      d.close();
      X.print();
    });
    return d;
  }

  /** Toolbar "PDF" / Ctrl+P: the dialog with the last choice. */
  X.open = function () {
    if (S.doc.page) return blockDialog(); // a block: pages on A4 sheets
    if (dialog) dialog.remove(); // built in the current language each time
    dialog = build();
    const f = dialog.querySelector('form');
    const hasSel = MM.selectedNodes().length > 0;
    f.querySelector('input[name="scope"][value="selection"]').disabled = !hasSel;
    f.scope.value = choice.scope === 'selection' && !hasSel ? 'map' : hasSel && MM.selectedNodes().length > 1 ? 'selection' : choice.scope;
    f.paper.value = choice.paper;
    f.orient.value = choice.orient;
    f.withTitle.checked = choice.title;
    dialog.showModal();
  };
})(window.MM);
