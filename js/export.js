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

  function boxOf(nodes, edges) {
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
    const pad = 24; // arrow heads, labels, shadows
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  }

  /** { box, nodeIds (null = all) } for the chosen scope. */
  function area(scope) {
    const nodes = Object.values(S.doc.nodes), edges = Object.values(S.doc.edges);
    if (scope === 'view') {
      const vp = document.getElementById('viewport').getBoundingClientRect(), v = S.doc.view;
      return { box: { x: -v.x / v.zoom, y: -v.y / v.zoom, w: vp.width / v.zoom, h: vp.height / v.zoom }, nodeIds: null };
    }
    if (scope === 'selection') {
      const ids = new Set(MM.selectedNodes().map((n) => n.id));
      const sel = nodes.filter((n) => ids.has(n.id));
      const inner = edges.filter((e) => ids.has(e.source.node) && ids.has(e.target.node));
      return { box: boxOf(sel, inner), nodeIds: ids };
    }
    return { box: boxOf(nodes, edges), nodeIds: null };
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
    const world = document.getElementById('world').cloneNode(true);
    world.removeAttribute('id');
    world.className = 'mp-world';
    for (const sel of ['#overlay-layer', '#ui-layer']) world.querySelectorAll(sel).forEach((x) => x.remove());
    world.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id')); // no second #node-layer etc.
    world.querySelectorAll('.selected').forEach((x) => x.classList.remove('selected'));
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
    const offX = (W - box.w * scale) / 2, offY = (H - box.h * scale) / 2;
    world.style.transform = `translate(${offX - box.x * scale}px, ${offY - box.y * scale}px) scale(${scale})`;

    let out = document.getElementById('map-print');
    if (!out) {
      out = document.createElement('div');
      out.id = 'map-print';
      document.body.appendChild(out);
    }
    const name = S.file.path ? MM.project.mapName(S.file.path) : S.file.name.replace(/\.mindmap\.json$|\.json$/i, '');
    const date = new Date().toLocaleDateString(MM.locale(), { day: 'numeric', month: 'long', year: 'numeric' });
    out.innerHTML = (choice.title ? `<div class="mp-title"><b>${esc(name)}</b><span>${esc(date)}</span></div>` : '') +
      `<div class="mp-page" style="width:${W}px;height:${H}px"></div>`;
    out.querySelector('.mp-page').appendChild(world);

    // page size for this print, the light theme while printing
    const style = document.createElement('style');
    style.textContent = `@media print { @page { size: ${choice.paper} ${landscape ? 'landscape' : 'portrait'}; margin: ${MARGIN}mm; } }`;
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
        <div class="dlg-buttons">
          <button type="button" data-mp="cancel">${esc(tr('Cancel'))}</button>
          <button type="submit" class="primary">🖨 ${esc(tr('Print / PDF'))}</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    const f = d.querySelector('form');
    d.addEventListener('keydown', (e) => e.stopPropagation());
    d.querySelector('[data-mp="cancel"]').addEventListener('click', () => d.close());
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
