'use strict';
/*
 * Automatic views of the open map and auto-layout.
 *
 * Hierarchy: an arrow from note A to note B makes B a child of A (the first
 * arrow wins, cycles are ignored); in the views the notes inside a group are
 * its children too. Roots are the notes no arrow points to, or one chosen note.
 *
 * Views (own dialog, the map is not changed; a click jumps to the note):
 *   tree    - left to right or top down
 *   radial  - root in the middle, branches around it
 *   bubble  - circles, children packed inside their parent
 *   treemap - nested rectangles
 * Size = estimated time (leaves without an estimate count as 30 min, a parent
 * is the sum of its children), color = status.
 *
 * Auto-layout: the tree and radial layouts can be applied to the real notes
 * (whole map or the subtree of one note); one undo step.
 */
(function (MM) {
  const S = MM.state;
  const V = (MM.views = {});
  const esc = (s) => MM.render.esc(s);
  const DEFAULT_MIN = 30; // size of a leaf without an estimate
  const KINDS = { tree: 'Tree', radial: 'Radial mind map', bubble: 'Bubble map', treemap: 'Treemap' };

  // ---- Hierarchy ---------------------------------------------------------------

  /**
   * Forest of the open map as [{ n, depth, children }].
   * rootId: only the subtree of that note. opts.groups: group members are children.
   * opts.skip(n): notes to leave out.
   */
  V.hierarchy = function (rootId, opts) {
    const o = Object.assign({ groups: true, skip: () => false }, opts);
    const nodes = S.doc.nodes;
    const usable = (n) => !!n && !n.overlay && n.type !== 'draw' && !o.skip(n);
    const parent = new Map(), children = new Map();
    const below = (id, anc) => {
      for (let k = id; k; k = parent.get(k)) if (k === anc) return true;
      return false;
    };
    const link = (a, b) => {
      if (a === b || parent.has(b) || below(a, b)) return;
      parent.set(b, a);
      if (!children.has(a)) children.set(a, []);
      children.get(a).push(b);
    };
    for (const e of Object.values(S.doc.edges)) {
      const a = e.source && e.source.node, b = e.target && e.target.node;
      if (a && b && usable(nodes[a]) && usable(nodes[b])) link(a, b);
    }
    if (o.groups) {
      // smaller groups first, so a note inside nested groups belongs to the inner one
      const groups = Object.values(nodes).filter((n) => n.type === 'group' && usable(n)).sort((x, y) => x.w * x.h - y.w * y.h);
      for (const g of groups) for (const m of MM.interaction.groupMembers(g)) if (usable(m)) link(g.id, m.id);
    }
    // children in reading order of the current layout
    const order = (a, b) => nodes[a].y - nodes[b].y || nodes[a].x - nodes[b].x;
    const make = (id, depth) => ({
      n: nodes[id], depth, children: (children.get(id) || []).slice().sort(order).map((c) => make(c, depth + 1)),
    });
    if (rootId && usable(nodes[rootId])) return [make(rootId, 0)];
    return Object.values(nodes).filter((n) => usable(n) && !parent.has(n.id))
      .sort((a, b) => a.y - b.y || a.x - b.x).map((n) => make(n.id, 0));
  };

  const walk = (t, fn) => {
    fn(t);
    for (const c of t.children) walk(c, fn);
  };

  /** One tree for the views: several roots hang below a virtual root named after the map. */
  function viewTree(rootId) {
    const roots = V.hierarchy(rootId);
    if (roots.length === 1) return roots[0];
    for (const r of roots) walk(r, (t) => t.depth++);
    return { n: null, label: S.file.path ? MM.project.mapName(S.file.path) : S.file.name.replace(/\.mindmap\.json$|\.json$/i, ''), depth: 0, children: roots };
  }

  // ---- Values, labels, colors ---------------------------------------------------

  function label(t) {
    if (!t.n) return t.label || MM.tr('Map');
    const s = String(t.n.text || '').split('\n')[0].trim() || MM.tr(MM.NODE_TYPES[t.n.type] || 'Note');
    return s.length > 40 ? s.slice(0, 38) + '…' : s;
  }

  /** value: size (minutes), est: estimated time actually entered. */
  function measure(t) {
    for (const c of t.children) measure(c);
    const own = t.n && t.n.meta ? Number(t.n.meta.estimate) || 0 : 0;
    if (t.children.length) {
      t.value = t.children.reduce((s, c) => s + c.value, 0);
      t.est = t.children.reduce((s, c) => s + c.est, 0) || own;
    } else {
      t.value = own || DEFAULT_MIN;
      t.est = own;
    }
  }

  function colorOf(t) {
    const n = t.n;
    if (!n) return '#64748b';
    const st = n.meta && n.meta.status;
    if (st && st !== 'none' && MM.STATUSES[st]) return MM.STATUSES[st].color;
    if (n.type === 'task') return MM.STATUSES.open.color;
    // the note's own colors: the fill unless it is (almost) white, then the border
    const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : /^#[0-9a-f]{3}$/i.test(c) ? '#' + c.slice(1).replace(/./g, '$&$&') : null);
    const light = (c) => {
      const v = parseInt(c.slice(1), 16);
      return 0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255) > 225;
    };
    const fill = hex(String((n.style && n.style.fill) || ''));
    if (fill && !light(fill)) return fill;
    return hex(String((n.style && n.style.stroke) || '')) || '#94a3b8';
  }

  function progressOf(n) {
    if (!n || n.type !== 'task') return null;
    const calc = MM.tasks.info(n);
    if (calc) return calc.progress;
    return MM.meta.hasProgress(n.meta) ? n.meta.progress : null;
  }

  function tooltip(t) {
    const parts = [label(t)];
    if (t.n && t.n.meta && t.n.meta.status !== 'none') parts.push(MM.STATUSES[t.n.meta.status].label);
    const p = progressOf(t.n);
    if (p !== null) parts.push(p + ' %');
    if (t.est) parts.push('≈ ' + MM.meta.formatDuration(t.est));
    if (t.children.length) parts.push(t.children.length + ' sub-note' + (t.children.length === 1 ? '' : 's'));
    return parts.join(' · ');
  }

  // ---- Layouts (positions in t.x / t.y = top left, t.box = { w, h }) ----------------

  /** Tidy tree, dir 'right' or 'down'. size(t) -> { w, h }. Several roots are stacked. */
  function layoutTree(roots, size, dir, gapLevel, gapSib) {
    const A = dir === 'right' ? 'w' : 'h', C = dir === 'right' ? 'h' : 'w';
    const levels = [];
    for (const r of roots) {
      walk(r, (t) => {
        t.box = size(t);
        levels[t.depth] = Math.max(levels[t.depth] || 0, t.box[A]);
      });
    }
    const levelPos = [];
    let acc = 0;
    for (let i = 0; i < levels.length; i++) {
      levelPos[i] = acc;
      acc += (levels[i] || 0) + gapLevel;
    }
    const extent = (t) => {
      const kids = t.children.reduce((s, c) => s + extent(c), 0) + gapSib * Math.max(0, t.children.length - 1);
      t.ext = Math.max(t.box[C], kids);
      return t.ext;
    };
    const place = (t, start) => {
      const kids = t.children.reduce((s, c) => s + c.ext, 0) + gapSib * Math.max(0, t.children.length - 1);
      let pos = start + (t.ext - kids) / 2;
      for (const c of t.children) {
        place(c, pos);
        pos += c.ext + gapSib;
      }
      const center = start + t.ext / 2;
      if (dir === 'right') {
        t.x = levelPos[t.depth];
        t.y = center - t.box.h / 2;
      } else {
        t.x = center - t.box.w / 2;
        t.y = levelPos[t.depth];
      }
    };
    let cursor = 0;
    for (const r of roots) {
      extent(r);
      place(r, cursor);
      cursor += r.ext + gapSib * 3;
    }
  }

  /** Root in the middle, each subtree gets an angle proportional to its leaves. */
  function layoutRadial(root, size, minRing) {
    const leaves = (t) => (t.leaves = t.children.length ? t.children.reduce((s, c) => s + leaves(c), 0) : 1);
    leaves(root);
    // 1) angle range of every note, proportional to its leaves (starting at the top)
    const angles = (t, a0, a1) => {
      t.a0 = a0;
      t.a1 = a1;
      let cur = a0;
      for (const c of t.children) {
        const span = ((a1 - a0) * c.leaves) / t.leaves;
        angles(c, cur, cur + span);
        cur += span;
      }
    };
    angles(root, -Math.PI / 2, (3 * Math.PI) / 2);
    // 2) radius per ring: far enough from the inner ring, and wide enough that
    //    every note fits into its angle range
    const rings = [];
    walk(root, (t) => {
      t.box = size(t);
      const d = t.depth - root.depth;
      const ext = Math.hypot(t.box.w, t.box.h);
      const r = rings[d] || (rings[d] = { ext: 0, need: 0 });
      r.ext = Math.max(r.ext, ext);
      if (d) r.need = Math.max(r.need, (ext + 16) / Math.min(t.a1 - t.a0, Math.PI));
    });
    const radius = [0];
    for (let d = 1; d < rings.length; d++) {
      radius[d] = Math.max(radius[d - 1] + Math.max(minRing, (rings[d - 1].ext + rings[d].ext) / 2 + 24), rings[d].need);
    }
    // 3) positions
    walk(root, (t) => {
      const a = (t.a0 + t.a1) / 2, r = radius[t.depth - root.depth];
      t.cx = r * Math.cos(a);
      t.cy = r * Math.sin(a);
      t.x = t.cx - t.box.w / 2;
      t.y = t.cy - t.box.h / 2;
    });
  }

  /** Circle packing: children inside their parent. Sets t.cx / t.cy / t.r. */
  function layoutBubble(root) {
    let min = Infinity;
    walk(root, (t) => { if (!t.children.length) min = Math.min(min, t.value); });
    const k = 26 / Math.sqrt(min || DEFAULT_MIN); // smallest bubble: radius 26
    const PAD = 6;
    const pack = (t) => {
      if (!t.children.length) {
        t.r = Math.sqrt(t.value) * k;
        return;
      }
      t.children.forEach(pack);
      const placed = [];
      for (const c of t.children.slice().sort((a, b) => b.r - a.r)) {
        if (!placed.length) {
          c.px = 0;
          c.py = 0;
          placed.push(c);
          continue;
        }
        let best = null;
        for (const p of placed) {
          for (let i = 0; i < 24; i++) {
            const a = (i / 24) * 2 * Math.PI, d = p.r + c.r + PAD;
            const x = p.px + d * Math.cos(a), y = p.py + d * Math.sin(a);
            if (placed.some((q) => Math.hypot(q.px - x, q.py - y) < q.r + c.r + PAD - 0.01)) continue;
            const score = Math.hypot(x, y) + c.r;
            if (!best || score < best.s) best = { x, y, s: score };
          }
        }
        c.px = best.x;
        c.py = best.y;
        placed.push(c);
      }
      // centre the cluster and enclose it (room at the top for the parent's name)
      const x0 = Math.min(...placed.map((c) => c.px - c.r)), x1 = Math.max(...placed.map((c) => c.px + c.r));
      const y0 = Math.min(...placed.map((c) => c.py - c.r)), y1 = Math.max(...placed.map((c) => c.py + c.r));
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      for (const c of placed) {
        c.px -= mx;
        c.py -= my;
      }
      t.r = Math.max(...placed.map((c) => Math.hypot(c.px, c.py) + c.r)) + PAD * 2 + 14;
      for (const c of placed) c.py += 10; // shift down a bit, the label sits at the top
    };
    pack(root);
    const absolute = (t, x, y) => {
      t.cx = x;
      t.cy = y;
      for (const c of t.children) absolute(c, x + c.px, y + c.py);
    };
    absolute(root, 0, 0);
  }

  /** Squarified treemap. Sets t.rect = { x, y, w, h }. */
  function layoutTreemap(root, W, H) {
    const squarify = (kids, rect) => {
      const total = kids.reduce((s, c) => s + c.value, 0);
      if (!total || rect.w <= 0 || rect.h <= 0) {
        for (const c of kids) c.rect = { x: rect.x, y: rect.y, w: 0, h: 0 };
        return;
      }
      const scale = (rect.w * rect.h) / total;
      let items = kids.map((c) => ({ c, a: c.value * scale })).sort((p, q) => q.a - p.a);
      let { x, y, w, h } = rect;
      while (items.length) {
        const side = Math.min(w, h);
        const worst = (row) => {
          const s = row.reduce((t, p) => t + p.a, 0);
          const mx = Math.max(...row.map((p) => p.a)), mn = Math.min(...row.map((p) => p.a));
          return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
        };
        const row = [items[0]];
        let i = 1;
        while (i < items.length && worst(row.concat(items[i])) <= worst(row)) row.push(items[i++]);
        const s = row.reduce((t, p) => t + p.a, 0);
        if (w >= h) {
          const cw = s / h;
          let cy = y;
          for (const p of row) {
            const ph = p.a / cw;
            p.c.rect = { x, y: cy, w: cw, h: ph };
            cy += ph;
          }
          x += cw;
          w -= cw;
        } else {
          const rh = s / w;
          let cx = x;
          for (const p of row) {
            const pw = p.a / rh;
            p.c.rect = { x: cx, y, w: pw, h: rh };
            cx += pw;
          }
          y += rh;
          h -= rh;
        }
        items = items.slice(i);
      }
    };
    const nest = (t) => {
      if (!t.children.length) return;
      const r = t.rect, head = r.h > 40 && r.w > 60 ? 20 : 3, pad = 3;
      squarify(t.children, { x: r.x + pad, y: r.y + head, w: r.w - 2 * pad, h: r.h - head - pad });
      t.children.forEach(nest);
    };
    root.rect = { x: 0, y: 0, w: W, h: H };
    nest(root);
  }

  // ---- Drawing (SVG) ------------------------------------------------------------------

  const textW = (s) => Math.min(240, Math.max(70, s.length * 7 + 26));
  const viewBox = (t) => ({ w: textW(label(t)), h: t.n && t.n.type === 'heading' ? 40 : 34 });

  function item(t, inner) {
    return `<g class="vw-item${t.n ? '' : ' vw-virtual'}"${t.n ? ` data-id="${esc(t.n.id)}"` : ''}><title>${esc(tooltip(t))}</title>${inner}</g>`;
  }

  function boxSVG(t) {
    const c = colorOf(t), p = progressOf(t.n);
    const done = t.n && t.n.meta && t.n.meta.status === 'done';
    // opaque underlay (panel color, follows the theme), so connection lines don't show through the tinted box
    let s = `<rect class="vw-box-bg" x="${t.x}" y="${t.y}" width="${t.box.w}" height="${t.box.h}" rx="8"/>` +
      `<rect class="vw-box-tint" x="${t.x}" y="${t.y}" width="${t.box.w}" height="${t.box.h}" rx="8" fill="${esc(c)}" stroke="${esc(c)}" stroke-width="${t.depth === 0 ? 2.5 : 1.5}"/>`;
    if (p !== null) {
      s += `<rect x="${t.x + 4}" y="${t.y + t.box.h - 6}" width="${(t.box.w - 8) * p / 100}" height="3" rx="1.5" fill="${esc(c)}"/>`;
    }
    s += `<text x="${t.x + t.box.w / 2}" y="${t.y + t.box.h / 2 + 4}" text-anchor="middle" class="vw-label${done ? ' vw-done' : ''}${t.depth === 0 ? ' vw-root' : ''}">${esc(label(t))}</text>`;
    return item(t, s);
  }

  function drawTree(root, dir) {
    layoutTree([root], viewBox, dir, 70, 14);
    let links = '', boxes = '';
    walk(root, (t) => {
      for (const c of t.children) {
        if (dir === 'right') {
          const x1 = t.x + t.box.w, y1 = t.y + t.box.h / 2, x2 = c.x, y2 = c.y + c.box.h / 2, mx = (x1 + x2) / 2;
          links += `<path d="M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}" class="vw-link"/>`;
        } else {
          const x1 = t.x + t.box.w / 2, y1 = t.y + t.box.h, x2 = c.x + c.box.w / 2, y2 = c.y, my = (y1 + y2) / 2;
          links += `<path d="M${x1},${y1}C${x1},${my} ${x2},${my} ${x2},${y2}" class="vw-link"/>`;
        }
      }
      boxes += boxSVG(t);
    });
    return links + boxes;
  }

  function drawRadial(root) {
    layoutRadial(root, viewBox, 60);
    let links = '', boxes = '', rings = '';
    let maxDepth = 0;
    walk(root, (t) => {
      maxDepth = Math.max(maxDepth, t.depth);
      for (const c of t.children) links += `<line x1="${t.cx}" y1="${t.cy}" x2="${c.cx}" y2="${c.cy}" class="vw-link"/>`;
      boxes += boxSVG(t);
    });
    for (let d = 1; d <= maxDepth; d++) {
      const any = [];
      walk(root, (t) => { if (t.depth === d) any.push(Math.hypot(t.cx, t.cy)); });
      if (any.length) rings += `<circle cx="0" cy="0" r="${any[0]}" class="vw-ring"/>`;
    }
    return rings + links + boxes;
  }

  function drawBubble(root) {
    layoutBubble(root);
    let s = '';
    walk(root, (t) => {
      const c = colorOf(t), p = progressOf(t.n);
      const kids = t.children.length > 0;
      let inner = `<circle cx="${t.cx}" cy="${t.cy}" r="${t.r}" fill="${esc(c)}" fill-opacity="${kids ? 0.08 : 0.28}" stroke="${esc(c)}" stroke-width="${kids ? 1.5 : 1}"/>`;
      const text = label(t), maxChars = Math.max(4, Math.floor((t.r * 2) / 7));
      const shown = text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text;
      const y = kids ? t.cy - t.r + 18 : t.cy + 4;
      inner += `<text x="${t.cx}" y="${y}" text-anchor="middle" class="vw-label${kids ? ' vw-parent' : ''}">${esc(shown)}</text>`;
      if (!kids && t.r > 30 && (t.est || p !== null)) {
        const sub = [t.est ? MM.meta.formatDuration(t.est) : '', p !== null ? p + ' %' : ''].filter(Boolean).join(' · ');
        inner += `<text x="${t.cx}" y="${t.cy + 19}" text-anchor="middle" class="vw-sub">${esc(sub)}</text>`;
      }
      s += item(t, inner);
    });
    return s;
  }

  function drawTreemap(root) {
    layoutTreemap(root, 1200, 760);
    let s = '';
    walk(root, (t) => {
      const r = t.rect;
      if (!r || r.w < 1 || r.h < 1) return;
      const c = colorOf(t), p = progressOf(t.n), kids = t.children.length > 0;
      let inner = `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${esc(c)}" fill-opacity="${kids ? 0.07 : 0.24}" stroke="${esc(c)}" stroke-width="${kids ? 1.5 : 1}"/>`;
      if (r.w > 40 && r.h > 16) {
        const maxChars = Math.floor((r.w - 8) / 7);
        const text = label(t);
        const shown = text.length > maxChars ? text.slice(0, Math.max(1, maxChars - 1)) + '…' : text;
        inner += `<text x="${r.x + 5}" y="${r.y + 14}" class="vw-label${kids ? ' vw-parent' : ''}">${esc(shown)}</text>`;
        if (!kids && r.h > 34 && (t.est || p !== null)) {
          const sub = [t.est ? MM.meta.formatDuration(t.est) : '', p !== null ? p + ' %' : ''].filter(Boolean).join(' · ');
          inner += `<text x="${r.x + 5}" y="${r.y + 30}" class="vw-sub">${esc(sub)}</text>`;
        }
      }
      if (!kids && p !== null && r.w > 12) {
        inner += `<rect x="${r.x + 3}" y="${r.y + r.h - 6}" width="${(r.w - 6) * p / 100}" height="3" fill="${esc(c)}"/>`;
      }
      s += item(t, inner);
    });
    return s;
  }

  // ---- Dialog ------------------------------------------------------------------------

  let dlg = null, svg = null;
  const state = { kind: 'tree', dir: 'right', rootId: null };
  let vb = { x: 0, y: 0, w: 100, h: 100 }, bounds = vb;

  function build() {
    dlg = document.createElement('dialog');
    dlg.id = 'views-dialog';
    dlg.innerHTML = `
      <div class="vw">
        <div class="vw-head">
          <h3>${MM.tr('Views')}</h3>
          <span class="seg seg-mini vw-kinds">${Object.entries(KINDS).map(([k, l]) => `<button data-vw-kind="${k}">${MM.tr(l)}</button>`).join('')}</span>
          <span class="seg seg-mini vw-dir">
            <button data-vw-dir="right" title="${esc(MM.tr('Left to right'))}">→</button><button data-vw-dir="down" title="${esc(MM.tr('Top down'))}">↓</button>
          </span>
          <span class="vw-root muted"></span>
          <button data-vw="whole" title="${esc(MM.tr('Show the whole map'))}">${MM.tr('Whole map')}</button>
          <span class="seg seg-mini"><button data-vw="zoomOut" title="${esc(MM.tr('Zoom out'))}">−</button><button data-vw="zoomIn" title="${esc(MM.tr('Zoom in'))}">+</button></span>
          <button data-vw="fit" title="${esc(MM.tr('Fit to window'))}">${MM.tr('Fit')}</button>
          <button data-vw="apply" class="primary" title="${esc(MM.tr('Arrange the real notes like this (undo with Ctrl+Z)'))}">${MM.tr('Apply to map')}</button>
          <button data-vw="close" title="${esc(MM.tr('Close (Esc)'))}">✕</button>
        </div>
        <svg class="vw-canvas" xmlns="http://www.w3.org/2000/svg"></svg>
        <div class="vw-legend"></div>
      </div>`;
    document.body.appendChild(dlg);
    svg = dlg.querySelector('.vw-canvas');
    dlg.addEventListener('keydown', (e) => e.stopPropagation());
    dlg.querySelector('.vw-head').addEventListener('click', (e) => {
      const k = e.target.closest('[data-vw-kind]'), d = e.target.closest('[data-vw-dir]'), b = e.target.closest('[data-vw]');
      if (k) state.kind = k.dataset.vwKind;
      else if (d) state.dir = d.dataset.vwDir;
      else if (b && b.dataset.vw === 'whole') state.rootId = null;
      else if (b && b.dataset.vw === 'fit') return fit();
      else if (b && (b.dataset.vw === 'zoomIn' || b.dataset.vw === 'zoomOut')) {
        const r = svg.getBoundingClientRect();
        return zoomAt(b.dataset.vw === 'zoomIn' ? 1 / 1.4 : 1.4, r.left + r.width / 2, r.top + r.height / 2);
      }
      else if (b && b.dataset.vw === 'apply') {
        dlg.close();
        V.autoLayout(state.kind === 'radial' ? 'radial' : state.dir === 'down' ? 'down' : 'right', state.rootId);
        return;
      } else if (b && b.dataset.vw === 'close') return dlg.close();
      else return;
      render();
    });

    // click / tap: jump to the note; wheel or two fingers: zoom; drag: pan
    let drag = null, pinch = null;
    const fingers = new Map(); // pointerId -> { x, y }
    const pinchState = () => {
      const [a, b] = [...fingers.values()];
      return { d: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    svg.addEventListener('pointerdown', (e) => {
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      svg.setPointerCapture(e.pointerId);
      if (fingers.size === 2) {
        drag = null; // two fingers: zoom, no jump
        pinch = pinchState();
        return;
      }
      drag = { x: e.clientX, y: e.clientY, vb: Object.assign({}, vb), moved: false };
    });
    svg.addEventListener('pointermove', (e) => {
      if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && fingers.size === 2) {
        const now = pinchState();
        zoomAt(pinch.d / now.d, now.x, now.y, now.x - pinch.x, now.y - pinch.y);
        pinch = now;
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      const k = vb.w / svg.clientWidth;
      vb = Object.assign({}, drag.vb, { x: drag.vb.x - dx * k, y: drag.vb.y - dy * k });
      applyVB();
    });
    const lift = (e) => {
      fingers.delete(e.pointerId);
      if (fingers.size < 2) pinch = null;
    };
    svg.addEventListener('pointercancel', (e) => {
      lift(e);
      drag = null;
    });
    svg.addEventListener('pointerup', (e) => {
      lift(e);
      const d = drag;
      drag = null;
      if (!d || d.moved) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const g = hit && hit.closest('.vw-item[data-id]');
      if (!g) return;
      dlg.close();
      MM.actions.focusNode(g.dataset.id);
    });
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });
  }

  /**
   * Zoom the view by factor f (> 1 = out, < 1 = in), keeping screen point (cx, cy)
   * where it is; dx / dy (screen px) also pan (two fingers moving together).
   */
  function zoomAt(f, cx, cy, dx = 0, dy = 0) {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // not further out than 8x the whole view, not closer than 3 % of it
    const w = Math.max(bounds.w * 0.03, Math.min(vb.w * f, Math.max(bounds.w, bounds.h * r.width / r.height) * 8));
    f = w / vb.w;
    const k = vb.w / r.width;
    const px = vb.x + (cx - r.left) * k, py = vb.y + (cy - r.top) * k;
    vb = { x: px - (px - vb.x) * f - dx * k * f, y: py - (py - vb.y) * f - dy * k * f, w: vb.w * f, h: vb.h * f };
    applyVB();
  }

  const applyVB = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

  function fit() {
    const pad = 30, r = svg.getBoundingClientRect();
    const b = bounds, ratio = r.width && r.height ? r.width / r.height : 1.6;
    // small trees are not blown up beyond 1.5x
    let w = Math.max(b.w + 2 * pad, (r.width || 0) / 1.5), h = Math.max(b.h + 2 * pad, (r.height || 0) / 1.5);
    if (w / h < ratio) w = h * ratio;
    else h = w / ratio;
    vb = { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
    applyVB();
  }

  function render() {
    dlg.querySelectorAll('[data-vw-kind]').forEach((b) => b.classList.toggle('active', b.dataset.vwKind === state.kind));
    dlg.querySelectorAll('[data-vw-dir]').forEach((b) => b.classList.toggle('active', b.dataset.vwDir === state.dir));
    dlg.querySelector('.vw-dir').hidden = state.kind !== 'tree';
    dlg.querySelector('[data-vw="apply"]').hidden = !(state.kind === 'tree' || state.kind === 'radial');
    const rootNode = state.rootId && MM.node(state.rootId);
    if (!rootNode) state.rootId = null;
    dlg.querySelector('.vw-root').textContent = rootNode ? MM.tr('From: {name}', { name: label({ n: rootNode, children: [] }) }) : MM.tr('Whole map');
    dlg.querySelector('[data-vw="whole"]').hidden = !rootNode;

    const root = viewTree(state.rootId);
    measure(root);
    const body = state.kind === 'radial' ? drawRadial(root)
      : state.kind === 'bubble' ? drawBubble(root)
        : state.kind === 'treemap' ? drawTreemap(root)
          : drawTree(root, state.dir);
    svg.innerHTML = body || '';
    const b = svg.getBBox ? svg.getBBox() : { x: 0, y: 0, width: 100, height: 100 };
    bounds = { x: b.x, y: b.y, w: b.width || 100, h: b.height || 100 };
    fit();

    const used = new Set();
    walk(root, (t) => { if (t.n && t.n.meta && t.n.meta.status !== 'none') used.add(t.n.meta.status); });
    dlg.querySelector('.vw-legend').innerHTML =
      [...used].map((st) => `<span><i style="background:${MM.STATUSES[st].color}"></i>${esc(MM.tr(MM.STATUSES[st].label))}</span>`).join('') +
      (state.kind === 'bubble' || state.kind === 'treemap'
        ? `<span class="muted">${esc(MM.tr('Size = estimated time (no estimate = {m}m, parents = sum)', { m: DEFAULT_MIN }))}</span>` : '') +
      `<span class="muted">${esc(MM.tr('Click: go to the note · Wheel, − / + or two fingers: zoom · Drag: move'))}</span>`;
  }

  /** Open the views dialog. kind: tree | radial | bubble | treemap; rootId: subtree of that note. */
  V.open = function (kind, rootId) {
    if (dlg && dlg.dataset.lang !== MM.getLang()) { dlg.remove(); dlg = null; } // built in another language
    if (!dlg) { build(); dlg.dataset.lang = MM.getLang(); }
    if (kind && KINDS[kind]) state.kind = kind;
    const sel = MM.selectedNodes();
    state.rootId = rootId !== undefined ? rootId : sel.length === 1 ? sel[0].id : null;
    MM.edit.finish();
    dlg.showModal();
    render();
  };

  // ---- Auto-layout of the real notes ---------------------------------------------------

  /**
   * Arrange the notes like the tree ('right' / 'down') or radial view.
   * rootId: only that note's subtree (it keeps its position); otherwise every
   * tree of the map (notes without connections stay where they are).
   */
  V.autoLayout = function (how, rootId) {
    // groups are not moved: they would leave their members behind
    const roots = V.hierarchy(rootId, { groups: false, skip: (n) => n.type === 'group' })
      .filter((r) => r.children.length);
    if (!roots.length) {
      MM.ui.flash(MM.tr('Nothing to arrange: connect notes with arrows first'));
      return;
    }
    const size = (t) => ({ w: t.n.w, h: t.n.h });
    const anchor = { x: roots[0].n.x, y: roots[0].n.y }; // the first root stays where it is
    let moved = 0;
    if (how === 'radial') {
      let offsetX = 0;
      for (const r of roots) {
        layoutRadial(r, size, 80);
        let x0 = Infinity, x1 = -Infinity;
        walk(r, (t) => { x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x + t.box.w); });
        walk(r, (t) => { t.x += offsetX - x0; });
        offsetX += x1 - x0 + 160;
      }
    } else {
      layoutTree(roots, size, how === 'down' ? 'down' : 'right', 90, 30);
    }
    const dx = anchor.x - roots[0].x, dy = anchor.y - roots[0].y;
    const ids = new Set();
    for (const r of roots) {
      walk(r, (t) => {
        t.n.x = Math.round(t.x + dx);
        t.n.y = Math.round(t.y + dy);
        ids.add(t.n.id);
        moved++;
      });
    }
    // connections inside the arranged trees pick the facing sides again
    for (const e of Object.values(S.doc.edges)) {
      if (ids.has(e.source.node) && ids.has(e.target.node)) {
        e.source.anchor = 'auto';
        e.target.anchor = 'auto';
      }
    }
    MM.commit();
    MM.actions.fit();
    MM.ui.flash(MM.tr('Arranged {n} notes (Ctrl+Z to undo)', { n: moved }));
  };

  V.KINDS = KINDS;
})(window.MM);
