'use strict';
/*
 * Drawings: rectangles, ellipses, lines and arrows on top of the map (note type 'draw').
 *   n.draw   = 'rect' | 'ellipse' | 'line' | 'arrow'
 *   n.line   = { x1, y1, x2, y2 }: end points of a line / arrow as fractions of the box
 *   n.anchor = { node, box: { x, y, w, h } } or null
 *
 * Anchored (like a picture anchored to a paragraph in Word - a setting, no
 * connection): the drawing belongs to a note or image. When that note is
 * moved or resized, the drawing is moved and scaled along. anchor.box is the
 * note's frame at the last sync; a change of it is the transformation the
 * drawing follows. Moving or resizing the drawing itself keeps the anchor,
 * it just gets a new place on the note. Deleting the note deletes it.
 * Not anchored: it only moves or scales when it is selected itself; groups do
 * not carry it.
 *
 * Drawings lie above all notes (overlay layer) and only their line takes clicks,
 * so the image below stays clickable.
 */
(function (MM) {
  const S = MM.state;
  const D = (MM.draw = {});
  const A = MM.actions;

  D.is = (n) => !!n && n.type === 'draw';
  const isLine = (n) => n.draw === 'line' || n.draw === 'arrow';
  const frame = (n) => ({ x: n.x, y: n.y, w: n.w, h: n.h });
  const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  const r2 = (v) => Math.round(v * 100) / 100;
  const MIN = 10; // smallest box (normalizeDoc keeps notes at least 10 wide / high)

  // ---- Geometry ----------------------------------------------------------------

  /** SVG path of a drawing in its own box (0,0 .. w,h). */
  D.path = function (n) {
    const w = n.w, h = n.h, sw = Number(n.style.strokeWidth) || 0, k = sw / 2;
    if (n.draw === 'ellipse') {
      const rx = Math.max(0.5, (w - sw) / 2), ry = Math.max(0.5, (h - sw) / 2);
      return `M${k},${h / 2}A${rx},${ry} 0 1,0 ${w - k},${h / 2}A${rx},${ry} 0 1,0 ${k},${h / 2}Z`;
    }
    if (isLine(n)) {
      const l = n.line || { x1: 0, y1: 0, x2: 1, y2: 1 };
      const x1 = l.x1 * w, y1 = l.y1 * h, x2 = l.x2 * w, y2 = l.y2 * h;
      let d = `M${x1},${y1}L${x2},${y2}`;
      if (n.draw === 'arrow') {
        const len = Math.max(10, sw * 4), ang = Math.atan2(y2 - y1, x2 - x1), spread = 0.45;
        const p = (a) => `${x2 - len * Math.cos(a)},${y2 - len * Math.sin(a)}`;
        d += `M${p(ang - spread)}L${x2},${y2}L${p(ang + spread)}`;
      }
      return d;
    }
    return `M${k},${k}H${w - k}V${h - k}H${k}Z`;
  };

  /**
   * Box (and line end points) of a drawing dragged from point a to point b.
   * square: Shift - square / circle, lines in steps of 45°.
   */
  D.boxFor = function (kind, a, b, square) {
    let dx = b.x - a.x, dy = b.y - a.y;
    if (square) {
      if (kind === 'line' || kind === 'arrow') {
        const len = Math.hypot(dx, dy), ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        dx = Math.round(len * Math.cos(ang));
        dy = Math.round(len * Math.sin(ang));
      } else {
        const s = Math.max(Math.abs(dx), Math.abs(dy));
        dx = Math.sign(dx || 1) * s;
        dy = Math.sign(dy || 1) * s;
      }
    }
    const end = { x: a.x + dx, y: a.y + dy };
    // a flat line still gets a box of MIN, the line runs through its middle
    const span = (p, q) => {
      const lo = Math.min(p, q), size = Math.abs(q - p);
      return size >= MIN ? { lo, size } : { lo: lo - (MIN - size) / 2, size: MIN };
    };
    const sx = span(a.x, end.x), sy = span(a.y, end.y);
    const box = { x: r2(sx.lo), y: r2(sy.lo), w: r2(sx.size), h: r2(sy.size) };
    box.line = {
      x1: (a.x - sx.lo) / sx.size, y1: (a.y - sy.lo) / sy.size,
      x2: (end.x - sx.lo) / sx.size, y2: (end.y - sy.lo) / sy.size,
    };
    return box;
  };

  // ---- Anchor ------------------------------------------------------------------

  /** Anchor drawing n to note a (null: not anchored). */
  D.setAnchor = function (n, a) {
    n.anchor = a && !D.is(a) ? { node: a.id, box: frame(a) } : null;
  };

  /**
   * The note below a drawing, drawings left out: the one at its centre, else the one
   * it overlaps most (an arrow pointing at a note has its centre beside it).
   */
  D.noteBelow = function (n) {
    const at = MM.interaction.nodeAt({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
    if (at) return at;
    let best = null, most = 0;
    for (const a of Object.values(S.doc.nodes)) {
      if (D.is(a) || a.type === 'group' || MM.meta.isHidden(a)) continue;
      const w = Math.min(n.x + n.w, a.x + a.w) - Math.max(n.x, a.x), h = Math.min(n.y + n.h, a.y + a.h) - Math.max(n.y, a.y);
      if (w > 0 && h > 0 && w * h > most) {
        most = w * h;
        best = a;
      }
    }
    return best;
  };

  /** Drawings anchored to one of the notes `ids` (not in ids themselves): they move along. */
  D.anchoredTo = function (ids) {
    return Object.values(S.doc.nodes).filter((n) => D.is(n) && n.anchor && ids.has(n.anchor.node) && !ids.has(n.id)).map((n) => n.id);
  };

  /**
   * Anchored drawings follow their note: when its frame differs from the one
   * remembered, the drawing is moved and scaled the same way. Drawings in
   * `skip` were changed directly - they keep their place, only the frame is
   * remembered anew.
   */
  D.follow = function (doc, skip) {
    for (const n of Object.values(doc.nodes)) {
      if (!D.is(n) || !n.anchor) continue;
      const a = doc.nodes[n.anchor.node];
      if (!a || D.is(a)) continue;
      const o = n.anchor.box, now = frame(a);
      if (same(o, now)) continue;
      if (!skip || !skip.has(n.id)) {
        const sx = o.w ? now.w / o.w : 1, sy = o.h ? now.h / o.h : 1;
        n.x = r2(now.x + (n.x - o.x) * sx);
        n.y = r2(now.y + (n.y - o.y) * sy);
        n.w = Math.max(MIN, r2(n.w * sx));
        n.h = Math.max(MIN, r2(n.h * sy));
      }
      n.anchor.box = now;
    }
  };

  /**
   * Called by MM.commit before the step is recorded: drawings follow notes
   * changed in this step (move, resize, nudge, align, auto-layout, …).
   * Drawings whose note was deleted go too. A drawing changed in this step
   * itself (compared with the last undo snapshot) keeps its new place.
   */
  D.sync = function () {
    const doc = S.doc;
    const anchored = Object.values(doc.nodes).filter((n) => D.is(n) && n.anchor);
    if (!anchored.length) return;
    for (const n of anchored) {
      const a = doc.nodes[n.anchor.node];
      if (!a) {
        delete doc.nodes[n.id];
        S.selection.delete(n.id);
      } else if (D.is(a)) n.anchor = null;
    }
    let prev = {};
    try {
      prev = (JSON.parse(MM.history.last) || {}).nodes || {};
    } catch (err) { /* no snapshot yet: treat every drawing as changed (no transformation) */ }
    const skip = new Set(anchored.filter((n) => !prev[n.id] || !same(frame(prev[n.id]), frame(n))).map((n) => n.id));
    D.follow(doc, skip);
  };

  /** Label of a drawing's anchor note for the panel, or ''. */
  D.anchorLabel = function (n) {
    const a = n.anchor && S.doc.nodes[n.anchor.node];
    if (!a) return '';
    const title = (a.text || '').split('\n')[0].trim();
    return title || MM.tr(MM.NODE_TYPES[a.type] || a.type);
  };

  // ---- Drawing tool ----------------------------------------------------------------

  D.KINDS = MM.DRAW_KINDS;

  /** Choose a tool: the next drag on the canvas draws that shape (Esc cancels). */
  D.setTool = function (kind) {
    S.tool = kind || null;
    document.getElementById('viewport').classList.toggle('drawing', !!S.tool);
    if (S.tool) MM.ui.flash(MM.tr('Drag to draw – over a note or image it is anchored to it (Alt: not anchored). Esc cancels.'));
  };

  /** New drawing while the mouse is dragged (not committed yet). */
  D.create = function (kind, a, b, square) {
    const n = MM.createNode('draw', 0, 0, { draw: kind, anchor: null });
    const box = D.boxFor(kind, a, b, square);
    Object.assign(n, { x: box.x, y: box.y, w: box.w, h: box.h, line: box.line });
    if (S.drawStyle) Object.assign(n.style, S.drawStyle);
    S.doc.nodes[n.id] = n;
    return n;
  };

  /** Update the drawing being dragged. */
  D.resizeTo = function (n, a, b, square) {
    const box = D.boxFor(n.draw, a, b, square);
    Object.assign(n, { x: box.x, y: box.y, w: box.w, h: box.h, line: box.line });
  };

  // ---- Actions (toolbar, panel, context menu) -----------------------------------

  A.drawMenu = function () {
    if (MM.menu.isOpen()) return MM.menu.close();
    const r = document.getElementById('draw-btn').getBoundingClientRect();
    MM.menu.open(Object.entries(D.KINDS).map(([k, label]) => ({ label, checked: S.tool === k, action: () => D.setTool(k) })),
      r.left, r.bottom + 2);
  };

  A.drawTool = (kind) => D.setTool(kind);

  /**
   * Ctrl+G (like grouping in Inkscape): anchor the selected drawings. With
   * exactly one note / image selected as well, to that one; otherwise each to
   * the note below it. Only one note selected: the free drawings lying on it.
   */
  A.drawAnchor = function () {
    const sel = MM.selectedNodes();
    let drawings = sel.filter(D.is);
    const notes = sel.filter((n) => !D.is(n));
    if (!drawings.length && notes.length === 1) {
      drawings = Object.values(S.doc.nodes).filter((n) => D.is(n) && !n.anchor && D.noteBelow(n) === notes[0]);
      if (!drawings.length) {
        MM.ui.flash(MM.tr('No free drawing lies on this note'));
        return;
      }
    }
    if (!drawings.length) {
      MM.ui.flash(MM.tr('Select a drawing (and the note to anchor it to) first'));
      return;
    }
    const target = notes.length === 1 ? notes[0] : null;
    let count = 0;
    for (const n of drawings) {
      const a = target || D.noteBelow(n);
      if (!a) continue;
      D.setAnchor(n, a);
      count++;
    }
    MM.ui.flash(!count ? MM.tr('No note below the drawing')
      : target ? MM.tr('Anchored {n} drawing(s) to "{note}"', { n: count, note: D.anchorLabel(drawings.find((d) => d.anchor)) })
        : MM.tr('Anchored to the note below'));
    MM.commit();
  };

  /** Ctrl+Shift+G: detach the selected drawings (or, with only notes selected, the drawings anchored to them). */
  A.drawDetach = function () {
    const sel = MM.selectedNodes();
    let drawings = sel.filter(D.is);
    if (!drawings.length) {
      const ids = new Set(sel.map((n) => n.id));
      drawings = Object.values(S.doc.nodes).filter((n) => D.is(n) && n.anchor && ids.has(n.anchor.node));
    }
    const count = drawings.filter((n) => n.anchor).length;
    drawings.forEach((n) => (n.anchor = null));
    MM.ui.flash(count ? MM.tr('Detached {n} drawing(s)', { n: count }) : MM.tr('Nothing anchored here'));
    MM.commit();
  };

  /** Context menu of drawings. */
  D.menuItems = function (nodes) {
    const anyAnchored = nodes.some((n) => n.anchor);
    return [
      { label: 'Anchor to the note below', shortcut: 'Ctrl+G', action: A.drawAnchor },
      anyAnchored && { label: 'Detach (not anchored)', shortcut: 'Ctrl+Shift+G', action: A.drawDetach },
      '-',
      { label: 'Copy', shortcut: 'Ctrl+C', action: A.copy },
      { label: 'Cut', shortcut: 'Ctrl+X', action: A.cut },
      { label: 'Duplicate', shortcut: 'Ctrl+D', action: A.duplicate },
      '-',
      { label: 'Bring to front', action: A.toFront },
      { label: 'Send to back', action: A.toBack },
      '-',
      { label: 'Delete', shortcut: 'Del', action: A.deleteSelection },
    ];
  };
})(window.MM);
