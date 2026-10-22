'use strict';
/*
 * Inkscape-style snapping while moving / resizing notes:
 *  - smart guides: left/center/right and top/middle/bottom of the moved box
 *    snap to the same lines of other notes
 *  - grid: box corner snaps to the grid (used when no smart guide matched)
 * Each function returns a correction plus guide lines to draw.
 */
(function (MM) {
  const SN = (MM.snap = {});

  const threshold = () => 7 / MM.state.doc.view.zoom;

  function otherNodes(excludeIds) {
    return Object.values(MM.state.doc.nodes).filter((n) => !excludeIds.has(n.id) && !MM.meta.isHidden(n));
  }

  function lines(nodes) {
    const xs = [], ys = [];
    for (const n of nodes) {
      xs.push(n.x, n.x + n.w / 2, n.x + n.w);
      ys.push(n.y, n.y + n.h / 2, n.y + n.h);
    }
    return { xs, ys };
  }

  /** Smallest correction that moves one of `cands` onto one of `targets`. */
  function best(cands, targets, thr) {
    let res = null;
    for (const c of cands) {
      for (const t of targets) {
        const d = t - c;
        if (Math.abs(d) <= thr && (!res || Math.abs(d) < Math.abs(res))) res = d;
      }
    }
    return res;
  }

  const gridDelta = (v) => {
    const g = MM.state.settings.gridSize;
    return Math.round(v / g) * g - v;
  };

  /** Guide lines for every coincidence between the box and other nodes. */
  SN.guides = function (box, others) {
    const out = [];
    const bx = [box.x, box.x + box.w / 2, box.x + box.w];
    const by = [box.y, box.y + box.h / 2, box.y + box.h];
    for (const x of bx) {
      const hits = others.filter((n) => [n.x, n.x + n.w / 2, n.x + n.w].some((v) => Math.abs(v - x) < 0.5));
      if (!hits.length) continue;
      const all = hits.concat([box]);
      const y1 = Math.min(...all.map((n) => n.y)), y2 = Math.max(...all.map((n) => n.y + n.h));
      out.push({ x1: x, y1: y1 - 10, x2: x, y2: y2 + 10 });
    }
    for (const y of by) {
      const hits = others.filter((n) => [n.y, n.y + n.h / 2, n.y + n.h].some((v) => Math.abs(v - y) < 0.5));
      if (!hits.length) continue;
      const all = hits.concat([box]);
      const x1 = Math.min(...all.map((n) => n.x)), x2 = Math.max(...all.map((n) => n.x + n.w));
      out.push({ x1: x1 - 10, y1: y, x2: x2 + 10, y2: y });
    }
    return out;
  };

  /** Snap a moving box. Returns { dx, dy, guides }. */
  SN.move = function (box, excludeIds) {
    const set = MM.state.settings, thr = threshold();
    const others = otherNodes(excludeIds);
    let dx = null, dy = null;
    if (set.smartGuides) {
      const L = lines(others);
      dx = best([box.x, box.x + box.w / 2, box.x + box.w], L.xs, thr);
      dy = best([box.y, box.y + box.h / 2, box.y + box.h], L.ys, thr);
    }
    if (set.grid) {
      if (dx === null) dx = gridDelta(box.x);
      if (dy === null) dy = gridDelta(box.y);
    }
    dx = dx || 0;
    dy = dy || 0;
    const moved = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
    return { dx, dy, guides: set.smartGuides ? SN.guides(moved, others) : [] };
  };

  /** Snap the moving edges of a box being resized via handle `dir` (e.g. 'se'). */
  SN.resize = function (box, dir, excludeIds) {
    const set = MM.state.settings, thr = threshold();
    const others = otherNodes(excludeIds);
    const L = lines(others);
    const b = Object.assign({}, box);

    const snapValue = (v, targets) => {
      let d = set.smartGuides ? best([v], targets, thr) : null;
      if (d === null && set.grid) d = gridDelta(v);
      return d || 0;
    };

    if (dir.includes('e')) b.w += snapValue(b.x + b.w, L.xs);
    if (dir.includes('w')) {
      const d = snapValue(b.x, L.xs);
      b.x += d;
      b.w -= d;
    }
    if (dir.includes('s')) b.h += snapValue(b.y + b.h, L.ys);
    if (dir.includes('n')) {
      const d = snapValue(b.y, L.ys);
      b.y += d;
      b.h -= d;
    }
    return { box: b, guides: set.smartGuides ? SN.guides(b, others) : [] };
  };
})(window.MM);
