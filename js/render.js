'use strict';
/*
 * Draws the document into the DOM.
 *  - nodes:   HTML divs (easy text wrapping / editing) with an SVG outline inside
 *  - edges:   one SVG layer below the nodes
 *  - labels:  HTML layer above the nodes
 *  - overlay: SVG layer on top (handles, anchors, guides, connection preview)
 * Everything lives in #world, which is pan/zoom-transformed as a whole.
 */
(function (MM) {
  const R = (MM.render = {});
  /** Touch screen (finger): bigger handles, anchor points without hovering. */
  R.coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const S = MM.state;
  let els = {};

  R.nodeEls = new Map();
  R.edgeGeo = new Map(); // edge id -> geometry of last render

  R.esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const esc = R.esc;
  // trash can of the delete button on task notes
  const DEL_ICON = '<svg viewBox="0 0 16 16"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v4.5M9.2 6.5v4.5"/></svg>';

  R.init = function () {
    els = {
      viewport: document.getElementById('viewport'),
      world: document.getElementById('world'),
      groups: document.getElementById('group-layer'),
      edges: document.getElementById('edge-layer'),
      nodes: document.getElementById('node-layer'),
      labels: document.getElementById('label-layer'),
      overlayNodes: document.getElementById('overlay-node-layer'),
      overlay: document.getElementById('overlay-layer'),
    };
  };

  R.all = function () {
    R.applyView();
    R.nodes();
    R.edges();
    R.overlay();
  };

  // ---- View (pan / zoom / grid / filter) -----------------------------------

  R.applyView = function () {
    const v = S.doc.view;
    els.world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
    const vp = els.viewport;
    vp.classList.toggle('show-grid', S.settings.grid);
    if (S.settings.grid) {
      let g = S.settings.gridSize * v.zoom;
      while (g < 8) g *= 5; // keep dots readable when zoomed out
      vp.style.backgroundSize = `${g}px ${g}px`;
      vp.style.backgroundPosition = `${v.x}px ${v.y}px`;
    }
    vp.classList.toggle('filter-dim', S.filter.mode === 'dim');
    vp.classList.toggle('filter-hide', S.filter.mode === 'hide');
  };

  // ---- Nodes -------------------------------------------------------------

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Normal notes go into the node layer; image overlays into a layer above
  // connections and labels.
  R.nodes = function () {
    const seen = new Set();
    const index = new Map([[els.nodes, 0], [els.overlayNodes, 0], [els.groups, 0]]);
    for (const n of Object.values(S.doc.nodes)) {
      seen.add(n.id);
      let div = R.nodeEls.get(n.id);
      if (!div) {
        div = el('div', 'node');
        div.dataset.id = n.id;
        div.innerHTML = '<svg class="node-shape"><path/></svg><div class="node-content"></div><div class="node-badges"></div>' +
          `<button class="node-linkbtn" hidden>${MM.links.icon}</button>` +
          '<button class="node-movedbadge" hidden></button>' +
          `<button class="node-delbtn" hidden>${DEL_ICON}</button>`;
        div._shape = div.children[0];
        div._content = div.children[1];
        div._badges = div.children[2];
        div._linkBtn = div.children[3];
        div._movedBadge = div.children[4];
        div._delBtn = div.children[5];
        R.nodeEls.set(n.id, div);
      }
      // groups lie behind connections and notes, image overlays above everything
      // (drawings as well: they mark something on the notes below)
      const layer = n.overlay || n.type === 'draw' ? els.overlayNodes : n.type === 'group' ? els.groups : els.nodes;
      const i = index.get(layer);
      if (layer.children[i] !== div) layer.insertBefore(div, layer.children[i] || null);
      index.set(layer, i + 1);

      div.classList.toggle('selected', S.selection.has(n.id));
      div.classList.toggle('filtered-out', MM.meta.filteredOut(n));
      div.classList.toggle('overlay', !!n.overlay);
      div.classList.toggle('moved', !!n.movedTo);
      div.dataset.type = n.type;
      R.updateNode(div, n);
    }
    for (const [id, div] of R.nodeEls) {
      if (!seen.has(id)) {
        div.remove();
        R.nodeEls.delete(id);
      }
    }
  };

  /** Position, outline, content and badges of one node (only what changed). */
  R.updateNode = function (div, n) {
    const editing = MM.editing && MM.editing.nodeId === n.id;
    const st = n.style;
    const contentKey = JSON.stringify([n.type, n.text, n.items, n.blocks, st.textColor, st.fontSize, st.bold, st.align,
      n.type === 'link' ? n.link : 0,
      n.type === 'task' ? [n.meta, n.tags, new Date().toDateString(), MM.tasks.info(n), n.repeat, MM.getLang(), MM.prioKey()] : 0,
      n.type === 'image' ? [n.imageId, !!S.doc.assets[n.imageId], st.fit] : 0,
      n.type === 'file' ? [n.file && n.file.path, n.file && n.file.size] : 0,
      n.type === 'diary' ? [n.diary, MM.getLang(), MM.md.assetIds(n.text).map((id) => !!S.doc.assets[id]), MM.diary.badge(n)] : 0]);
    if (div._contentKey !== contentKey && !editing) {
      R.buildContent(div, n);
      div._contentKey = contentKey;
    }
    R.updateFrame(div, n);
    if (n.type !== 'image' && n.type !== 'draw') {
      const measureKey = contentKey + '|' + n.w + '|' + n.h + '|' + n.shape;
      if (div._measureKey !== measureKey) {
        if (R.autoGrow(div, n)) R.updateFrame(div, n);
        div._measureKey = contentKey + '|' + n.w + '|' + n.h + '|' + n.shape;
      }
    }

    // metadata badges below the note (task notes show them inside instead)
    const show = S.settings.showMeta && n.type !== 'task' && !n.overlay && MM.meta.hasAny(n);
    const badgeKey = show ? JSON.stringify([n.meta, n.tags, new Date().toDateString(), n.repeat, MM.getLang(), MM.prioKey()]) : '';
    if (div._badgeKey !== badgeKey) {
      div._badgeKey = badgeKey;
      div._badges.innerHTML = show ? MM.meta.chipsHTML(n, false) : '';
    }

    // small ↗ button for notes with a link or an attached file (not on drawings)
    const target = n.type === 'draw' ? '' : n.type === 'diary' ? (n.diary && n.diary.book ? 'diary:' + n.diary.book : '')
      : n.file && n.file.path ? n.file.path : n.link;
    if (div._link !== target) {
      div._link = target;
      div._linkBtn.hidden = !target;
      div._linkBtn.title = !target ? ''
        : n.type === 'diary' ? MM.tr('Open this page of the diary (or Ctrl+click the note)')
          : 'Open ' + target + ' (or Ctrl+click the note)';
    }
    // map badge: a map was derived from this note, or the note was moved away
    const badge = n.derivedMap ? 'derivedMap' : n.movedTo ? 'movedTo' : '';
    if (div._badgeMap !== badge) {
      div._badgeMap = badge;
      div.classList.toggle('has-map', !!n.derivedMap);
      div.classList.toggle('moved', !!n.movedTo);
    }
    // "→ 2026-W44" on a note that was moved to another map (click opens it)
    const moved = n.movedTo || '';
    if (div._moved !== moved) {
      div._moved = moved;
      div._movedBadge.hidden = !moved;
      div._movedBadge.textContent = moved ? '→ ' + MM.links.label(moved) : '';
      div._movedBadge.title = moved ? 'Moved to ' + moved + ' – click to open' : '';
    }
    // delete button of task notes (same as Del): shows that removing the task changes the workload
    const del = n.type === 'task' && !n.overlay ? MM.getLang() : '';
    if (div._del !== del) {
      div._del = del;
      div._delBtn.hidden = !del;
      div._delBtn.title = del ? MM.tr('Delete task (Del) – its time no longer counts for the workload') : '';
    }
  };

  R.updateFrame = function (div, n) {
    div.style.left = n.x + 'px';
    div.style.top = n.y + 'px';
    div.style.width = n.w + 'px';
    div.style.height = n.h + 'px';
    div.style.transform = n.type === 'image' && n.rotate ? `rotate(${n.rotate}deg)` : '';
    if (n.type === 'draw') return drawFrame(div, n);
    const isImage = n.type === 'image';
    const ins = isImage ? { x: 0, y: 0 } : MM.geo.contentInset(n.shape, n.w, n.h);
    const content = div._content;
    content.style.inset = `${ins.y}px ${ins.x}px`;

    const st = n.style;
    const shapeKey = [n.shape, n.w, n.h, st.fill, st.stroke, st.strokeWidth, st.strokeStyle, n.type].join('|');
    if (div._shapeKey !== shapeKey) {
      div._shapeKey = shapeKey;
      const svg = div._shape, path = svg.firstElementChild;
      svg.setAttribute('width', n.w);
      svg.setAttribute('height', n.h);
      const none = n.shape === 'none';
      const sw = none ? 0 : Number(st.strokeWidth) || 0;
      path.setAttribute('d', MM.geo.shapePath(n.shape, n.w, n.h, sw));
      path.setAttribute('fill', none || isImage ? 'transparent' : st.fill);
      path.setAttribute('stroke', none || sw === 0 ? 'none' : st.stroke);
      path.setAttribute('stroke-width', sw);
      const dash = st.strokeStyle === 'solid' ? '' : MM.geo.dashArray(st.strokeStyle, sw);
      if (dash) path.setAttribute('stroke-dasharray', dash);
      else path.removeAttribute('stroke-dasharray');
      path.setAttribute('stroke-linecap', st.strokeStyle === 'dotted' ? 'round' : 'butt');
      // images are clipped to the note's shape
      const clip = isImage && !['none', 'rect'].includes(n.shape);
      content.style.clipPath = clip ? `path('${MM.geo.shapePath(n.shape, n.w, n.h, 0)}')` : '';
    }
    if (isImage) content.style.opacity = st.opacity === undefined ? 1 : st.opacity;
  };

  /**
   * Drawing (draw.js): the shape in the note's SVG, plus a wide invisible copy
   * of its line that takes the clicks (the note itself lets clicks through).
   */
  function drawFrame(div, n) {
    const st = n.style;
    const key = [n.draw, JSON.stringify(n.line), n.w, n.h, st.fill, st.stroke, st.strokeWidth, st.strokeStyle, st.opacity].join('|');
    if (div._shapeKey === key) return;
    div._shapeKey = key;
    const svg = div._shape, path = svg.firstElementChild;
    if (!div._hit) {
      div._hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      div._hit.setAttribute('class', 'draw-hit');
      svg.append(div._hit);
    }
    svg.setAttribute('width', n.w);
    svg.setAttribute('height', n.h);
    const d = MM.draw.path(n), sw = Number(st.strokeWidth) || 0;
    const line = n.draw === 'line' || n.draw === 'arrow';
    const filled = !line && st.fill && st.fill !== 'none';
    path.setAttribute('d', d);
    path.setAttribute('fill', filled ? st.fill : 'none');
    path.setAttribute('stroke', sw ? st.stroke : 'none');
    path.setAttribute('stroke-width', sw);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    const dash = st.strokeStyle === 'solid' ? '' : MM.geo.dashArray(st.strokeStyle, sw);
    if (dash) path.setAttribute('stroke-dasharray', dash);
    else path.removeAttribute('stroke-dasharray');
    div._hit.setAttribute('d', d);
    div._hit.setAttribute('stroke-width', Math.max(12, sw + 8));
    div.classList.toggle('filled', !!filled);
    svg.style.opacity = st.opacity === undefined ? 1 : st.opacity;
  }

  /** Outline-style nested list (outline and task notes). */
  function blockList(n) {
    const list = el('ul', 'outline-list');
    const blocks = n.blocks;
    for (const i of MM.outline.visible(blocks)) {
      const b = blocks[i];
      const kids = MM.outline.hasChildren(blocks, i);
      const li = el('li', (kids ? 'has-children' : '') + (kids && b.collapsed ? ' collapsed' : ''));
      li.dataset.block = b.id;
      li.style.setProperty('--lvl', b.level);
      const text = el('span', 'outline-text', b.text);
      text.dataset.field = 'block';
      li.append(el('span', 'outline-toggle'), el('span', 'outline-bullet'), text);
      list.append(li);
    }
    return list;
  }

  R.buildContent = function (div, n) {
    const c = div._content;
    const st = n.style;
    c.style.color = st.textColor;
    c.style.fontSize = st.fontSize + 'px';
    c.style.fontWeight = st.bold ? '700' : '400';
    c.style.textAlign = st.align;
    c.innerHTML = '';
    if (n.type === 'draw') return; // a drawing has no text

    if (n.type === 'diary') {
      // diary entry: head like a to-do list (day, time, diary), below a preview of the Markdown
      const wrap = el('div', 'diary-note');
      const head = el('div', 'todo-head diary-head');
      const dm = n.diary || {};
      // 🔒 its page was closed; ✎ the note was changed after that (the diary keeps the closed version)
      const badge = MM.diary.badge(n);
      const date = el('span', 'diary-date', (badge ? '🔒 ' : '') + MM.meta.formatDate(dm.date) + (dm.time ? ' · ' + dm.time : ''));
      if (badge) date.title = MM.tr(badge === 'changed' ? 'Page closed – this note was changed afterwards' : 'Page closed in the diary');
      head.append(date);
      if (badge === 'changed') head.append(el('span', 'diary-changed', '✎ ' + MM.tr('changed')));
      head.append(el('span', 'diary-book', dm.book || MM.tr('no diary chosen')));
      const body = el('div', 'diary-body md');
      body.dataset.field = 'text';
      body.innerHTML = n.text.trim()
        ? MM.md.render(n.text, (id) => S.doc.assets[id])
        : `<p class="diary-empty">${R.esc(MM.tr('Double-click to write (Markdown)'))}</p>`;
      wrap.append(head, body);
      c.append(wrap);
      return;
    }

    if (n.type === 'todo') {
      const wrap = el('div', 'todo');
      const head = el('div', 'todo-head');
      const title = el('div', 'todo-title', n.text);
      title.dataset.field = 'text';
      const counted = n.items.filter((i) => !i.moved);
      const done = counted.filter((i) => i.done).length;
      head.append(title, el('span', 'todo-progress', `${done}/${counted.length}`));
      const list = el('ul', 'todo-list');
      for (const it of n.items) {
        const li = el('li', it.moved ? 'moved' : it.done ? 'done' : '');
        li.dataset.item = it.id;
        if (it.moved) li.title = 'Moved to ' + it.moved;
        const check = el('span', it.moved ? 'todo-moved' : 'todo-check', it.moved ? '→' : undefined);
        check.setAttribute('role', 'checkbox');
        check.setAttribute('aria-checked', it.done);
        const text = el('span', 'todo-text', it.text);
        text.dataset.field = 'item';
        li.append(check, text);
        // 🔁 / 📌 / 🏖 entry of a plan: ↗ shows the note it came from
        if (it.routine && !it.moved) {
          const jump = el('span', 'todo-jump', '↗');
          jump.title = MM.tr('Show the note of this entry');
          li.append(jump);
        }
        list.append(li);
      }
      wrap.append(head, list, el('div', 'todo-add', '+ Add item'));
      c.append(wrap);
    } else if (MM.hasBlocks(n)) {
      const done = n.type === 'task' && n.meta.status === 'done';
      const wrap = el('div', 'outline' + (n.type === 'task' ? ' task' : '') + (done ? ' task-done' : ''));
      const title = el('div', 'outline-title', n.text);
      title.dataset.field = 'text';
      wrap.append(title);
      if (n.type === 'task') {
        // thin progress bar right below the title (only once a value is set);
        // tasks with sub-tasks show the calculated value (∑)
        const calc = MM.tasks.info(n);
        const value = calc ? calc.progress : n.meta.progress;
        if (calc || MM.meta.hasProgress(n.meta)) {
          const bar = el('div', 'task-progress');
          bar.title = 'Progress ' + MM.meta.progressLabel(value) +
            (calc ? ` – average of ${calc.count} sub-task${calc.count === 1 ? '' : 's'}` : '');
          bar.innerHTML = MM.meta.progressBar(value) +
            `<span class="task-progress-val">${MM.meta.progressLabel(value)}${calc ? ' ∑' : ''}</span>`;
          wrap.append(bar);
        }
        const meta = el('div', 'task-meta');
        meta.innerHTML = MM.meta.chipsHTML(n, true);
        wrap.append(meta);
      }
      wrap.append(blockList(n), el('div', 'todo-add outline-add', '+ Add item'));
      c.append(wrap);
    } else if (n.type === 'link') {
      const wrap = el('div', 'link-note');
      const title = el('div', 'link-title', n.text);
      title.dataset.field = 'text';
      wrap.append(title, el('div', 'link-target', n.link ? '→ ' + MM.links.label(n.link) : 'no target yet'));
      c.append(wrap);
    } else if (n.type === 'file') {
      const wrap = el('div', 'file-note');
      const icon = el('div', 'file-icon');
      icon.innerHTML = MM.files ? MM.files.icon(n.file && n.file.name) : '';
      icon.title = 'Open the file';
      const body = el('div', 'file-body');
      const title = el('div', 'file-title', n.text);
      title.dataset.field = 'text';
      const sub = el('div', 'file-sub', MM.files ? MM.files.describe(n.file) : '');
      body.append(title, sub);
      wrap.append(icon, body);
      c.append(wrap);
    } else if (n.type === 'code') {
      const pre = el('pre', 'code-text', n.text);
      pre.dataset.field = 'text';
      c.append(pre);
    } else if (n.type === 'group') {
      const title = el('div', 'group-title', n.text);
      title.dataset.field = 'text';
      c.append(title);
    } else if (n.type === 'image') {
      const wrap = el('div', 'image-wrap');
      const src = S.doc.assets[n.imageId];
      if (src) {
        const img = el('img');
        img.src = src;
        img.draggable = false;
        img.alt = n.text || '';
        img.style.objectFit = st.fit || 'cover';
        wrap.append(img);
      } else {
        wrap.append(el('div', 'image-missing', 'Image missing'));
      }
      const cap = el('div', 'image-caption', n.text);
      cap.dataset.field = 'text';
      wrap.append(cap);
      c.append(wrap);
    } else {
      const t = el('div', 'node-text', n.text);
      t.dataset.field = 'text';
      c.append(t);
    }
  };

  /** Grow the node height until its content fits. Returns true if it grew. */
  R.autoGrow = function (div, n) {
    const c = div._content, inner = c.firstElementChild;
    if (!inner || n.type === 'image' || n.type === 'diary') return false; // a diary entry keeps its size, the preview is cut off
    let grew = false;
    for (let i = 0; i < 8; i++) {
      const over = inner.offsetHeight - c.clientHeight;
      if (over <= 1) break;
      const factor = n.shape === 'diamond' ? 2 : n.shape === 'ellipse' ? 1.45 : 1;
      n.h = Math.ceil(n.h + over * factor);
      R.updateFrame(div, n);
      grew = true;
    }
    return grew;
  };

  // ---- Edges -------------------------------------------------------------

  // Elements are reused between renders (keyed by edge id). Replacing them
  // on every redraw would make the browser drop clicks / double-clicks.
  R.edgeEls = new Map(); // edge id -> { g, hit, sel, line, heads, label }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, cls, parent) {
    const e = document.createElementNS(SVG_NS, tag);
    if (cls) e.setAttribute('class', cls);
    parent.appendChild(e);
    return e;
  }

  function createEdgeEls(id) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.dataset.id = id;
    const rec = {
      g,
      hit: svgEl('path', 'edge-hit', g),
      sel: svgEl('path', 'edge-sel', g),
      line: svgEl('path', 'edge-line', g),
      heads: svgEl('g', 'edge-heads', g),
      label: null,
    };
    R.edgeEls.set(id, rec);
    return rec;
  }

  R.edges = function () {
    R.edgeGeo.clear();
    const seen = new Set();
    let index = 0;
    for (const e of Object.values(S.doc.edges)) {
      const g = MM.geo.edgeGeometry(e, S.doc);
      if (!g) continue;
      R.edgeGeo.set(e.id, g);
      seen.add(e.id);
      const rec = R.edgeEls.get(e.id) || createEdgeEls(e.id);
      if (els.edges.children[index] !== rec.g) els.edges.insertBefore(rec.g, els.edges.children[index] || null);
      index++;

      const st = e.style, sel = S.selection.has(e.id);
      const w = Number(st.width) || 1;
      // a connection is filtered out if one of its notes is
      const out = [e.source, e.target].some((end) => end.node && MM.meta.filteredOut(S.doc.nodes[end.node]));
      rec.g.setAttribute('class', 'edge' + (sel ? ' selected' : '') + (out ? ' filtered-out' : ''));
      rec.hit.setAttribute('d', g.d);
      rec.sel.setAttribute('d', g.d);
      rec.sel.setAttribute('stroke-width', w + 8);
      rec.sel.style.display = sel ? '' : 'none';
      const line = rec.line;
      line.setAttribute('d', g.d);
      line.setAttribute('stroke', st.color);
      line.setAttribute('stroke-width', w);
      const dash = MM.geo.dashArray(st.lineStyle, w);
      if (dash) line.setAttribute('stroke-dasharray', dash);
      else line.removeAttribute('stroke-dasharray');
      line.setAttribute('stroke-linecap', st.lineStyle === 'dotted' ? 'round' : 'butt');

      // arrowheads are not clickable, so rebuilding them is fine
      let heads = '';
      for (const h of g.heads) {
        heads += `<path class="edge-head" d="${h.d}" stroke="${esc(st.color)}" stroke-width="${w}"` +
          ` fill="${h.fill ? esc(st.color) : 'none'}" stroke-linejoin="round" stroke-linecap="round"/>`;
      }
      rec.heads.innerHTML = heads;

      if (e.label) {
        if (!rec.label) {
          rec.label = el('div', 'edge-label');
          rec.label.dataset.id = e.id;
          els.labels.appendChild(rec.label);
        }
        const lab = rec.label;
        lab.className = 'edge-label' + (sel ? ' selected' : '') + (out ? ' filtered-out' : '');
        if (lab.textContent !== e.label) lab.textContent = e.label;
        lab.style.left = g.mid.x + 'px';
        lab.style.top = g.mid.y + 'px';
        lab.style.color = st.color;
      } else if (rec.label) {
        rec.label.remove();
        rec.label = null;
      }
    }
    for (const [id, rec] of R.edgeEls) {
      if (!seen.has(id)) {
        rec.g.remove();
        if (rec.label) rec.label.remove();
        R.edgeEls.delete(id);
      }
    }
  };

  // ---- Overlay -----------------------------------------------------------

  const HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  R.overlay = function () {
    const z = S.doc.view.zoom, k = 1 / z;
    const fat = R.coarse ? 1.8 : 1; // handles a finger can hit
    const drag = S.drag;
    const mode = drag && drag.mode;
    let s = '';

    // selection: resize handles (single node) or dashed bbox (several nodes)
    const selNodes = MM.selectedNodes();
    if (mode !== 'connect' && mode !== 'endpoint' && !MM.editing) {
      if (selNodes.length === 1) {
        const n = selNodes[0], off = 9 * k * fat, hs = 8 * k * fat;
        const pos = {
          nw: [n.x - off, n.y - off], n: [n.x + n.w / 2, n.y - off], ne: [n.x + n.w + off, n.y - off],
          e: [n.x + n.w + off, n.y + n.h / 2], se: [n.x + n.w + off, n.y + n.h + off],
          s: [n.x + n.w / 2, n.y + n.h + off], sw: [n.x - off, n.y + n.h + off], w: [n.x - off, n.y + n.h / 2],
        };
        for (const d of HANDLE_DIRS) {
          const [x, y] = pos[d];
          s += `<rect class="handle-resize h-${d}" data-dir="${d}" x="${x - hs / 2}" y="${y - hs / 2}"` +
            ` width="${hs}" height="${hs}" stroke-width="${k}"/>`;
        }
        // images: a round handle above them turns them
        if (n.type === 'image') {
          const rx = n.x + n.w / 2, ry = n.y - off - 24 * k * fat;
          s += `<line class="rotate-stem" x1="${rx}" y1="${n.y - off}" x2="${rx}" y2="${ry}" stroke-width="${k}"/>` +
            `<circle class="handle-rotate" cx="${rx}" cy="${ry}" r="${6 * k * fat}" stroke-width="${1.5 * k}"/>`;
        }
      } else if (selNodes.length > 1) {
        const b = MM.geo.bbox(selNodes), p = 6 * k;
        s += `<rect class="sel-box" x="${b.x - p}" y="${b.y - p}" width="${b.w + 2 * p}" height="${b.h + 2 * p}"` +
          ` stroke-width="${k}" stroke-dasharray="${4 * k} ${3 * k}"/>`;
      }
    }

    // smart guides
    for (const g of S.guides) {
      s += `<line class="guide" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke-width="${k}"/>`;
    }

    // connection preview while dragging a new connection
    if (mode === 'connect' && drag.moved) {
      const tmp = { source: drag.source, target: drag.target || drag.point, style: S.edgeStyle };
      const g = MM.geo.edgeGeometry(tmp, S.doc);
      if (g) {
        s += `<path class="temp-edge" d="${g.d}" stroke-width="${Math.max(1, S.edgeStyle.width)}"/>`;
        for (const h of g.heads) s += `<path class="temp-edge" d="${h.d}" fill="${h.fill ? 'currentColor' : 'none'}"/>`;
      }
    }

    // endpoint handles of selected edges
    if (!MM.editing) {
      for (const e of MM.selectedEdges()) {
        const g = R.edgeGeo.get(e.id);
        if (!g) continue;
        for (const [end, p] of [['source', g.p1], ['target', g.p2]]) {
          const attached = e[end].node ? ' attached' : '';
          s += `<circle class="handle-endpoint${attached}" data-edge="${esc(e.id)}" data-end="${end}"` +
            ` cx="${p.x}" cy="${p.y}" r="${6 * k * fat}" stroke-width="${1.5 * k}"/>`;
        }
      }
    }

    // anchor points of the hovered node (or the drop target while connecting)
    let anchorNode = null, activeAnchor = null;
    if (mode === 'connect' || mode === 'endpoint') {
      anchorNode = drag.target && drag.target.node;
      activeAnchor = drag.target && drag.target.anchor;
    } else if (!mode && !MM.editing) {
      // a finger does not hover: the anchor points of the selected note instead
      anchorNode = S.hover || (R.coarse && selNodes.length === 1 && !selNodes[0].movedTo ? selNodes[0].id : null);
    }
    const an = anchorNode && MM.node(anchorNode);
    if (an) {
      if (mode && activeAnchor === 'auto') {
        s += `<rect class="drop-target" x="${+an.x}" y="${+an.y}" width="${+an.w}" height="${+an.h}" stroke-width="${2 * k}"/>`;
      }
      for (const a of Object.values(MM.geo.anchors(an))) {
        const active = a.id === activeAnchor ? ' active' : '';
        s += `<circle class="anchor-dot${active}" data-node="${esc(an.id)}" data-anchor="${a.id}"` +
          ` cx="${a.x}" cy="${a.y}" r="${(active ? 6 : 4.5) * k * fat}" stroke-width="${1.5 * k}"/>`;
      }
    }

    els.overlay.innerHTML = s;
  };
})(window.MM);
