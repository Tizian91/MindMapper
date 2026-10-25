'use strict';
/*
 * Pure geometry helpers: shape outlines, anchor points, connection routing
 * (straight / elbow / rounded elbow / curve) and arrowheads.
 * No DOM access in here.
 */
(function (MM) {
  const G = (MM.geo = {});
  const SQ = Math.SQRT1_2;

  G.dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  G.unit = (dx, dy) => {
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  };
  G.center = (n) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });
  G.contains = (n, p, pad = 0) =>
    p.x >= n.x - pad && p.x <= n.x + n.w + pad && p.y >= n.y - pad && p.y <= n.y + n.h + pad;
  G.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const f = (p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;

  /** Bounding box of a list of nodes (or boxes). */
  G.bbox = function (boxes) {
    if (!boxes.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const b of boxes) {
      x1 = Math.min(x1, b.x);
      y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.w);
      y2 = Math.max(y2, b.y + b.h);
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  };

  // ---- Shapes ------------------------------------------------------------

  function slant(shape, w, h) {
    if (shape === 'hexagon') return Math.min(w * 0.22, h * 0.5);
    if (shape === 'parallelogram') return Math.min(w * 0.2, h * 0.6);
    return 0;
  }

  function cornerRadius(shape, w, h) {
    if (shape === 'rounded') return Math.min(14, w / 4, h / 4);
    if (shape === 'pill') return Math.min(w, h) / 2;
    return 0;
  }

  /** SVG path of a shape outline in local coordinates (0..w, 0..h). */
  G.shapePath = function (shape, w, h, strokeWidth) {
    const i = strokeWidth / 2, W = w - i, H = h - i;
    switch (shape) {
      case 'rounded':
      case 'pill': {
        const r = Math.max(0, cornerRadius(shape, w, h) - i);
        return `M${i + r},${i}H${W - r}A${r},${r} 0 0 1 ${W},${i + r}V${H - r}` +
          `A${r},${r} 0 0 1 ${W - r},${H}H${i + r}A${r},${r} 0 0 1 ${i},${H - r}V${i + r}` +
          `A${r},${r} 0 0 1 ${i + r},${i}Z`;
      }
      case 'ellipse': {
        const rx = Math.max(0, w / 2 - i), ry = Math.max(0, h / 2 - i);
        return `M${i},${h / 2}A${rx},${ry} 0 1 1 ${W},${h / 2}A${rx},${ry} 0 1 1 ${i},${h / 2}Z`;
      }
      case 'diamond':
        return `M${w / 2},${i}L${W},${h / 2}L${w / 2},${H}L${i},${h / 2}Z`;
      case 'hexagon': {
        const k = slant(shape, w, h);
        return `M${k},${i}H${w - k}L${W},${h / 2}L${w - k},${H}H${k}L${i},${h / 2}Z`;
      }
      case 'parallelogram': {
        const k = slant(shape, w, h);
        return `M${k},${i}H${W}L${w - k},${H}H${i}Z`;
      }
      default: // rect, none
        return `M${i},${i}H${W}V${H}H${i}Z`;
    }
  };

  /** Padding between the bounding box and the text area for each shape. */
  G.contentInset = function (shape, w, h) {
    switch (shape) {
      case 'ellipse': return { x: w * 0.15 + 6, y: h * 0.15 + 4 };
      case 'diamond': return { x: w * 0.25 + 4, y: h * 0.25 + 4 };
      case 'hexagon':
      case 'parallelogram': return { x: slant(shape, w, h) + 6, y: 8 };
      case 'pill': return { x: Math.min(w, h) * 0.3 + 6, y: 8 };
      default: return { x: 10, y: 8 };
    }
  };

  // ---- Anchors -----------------------------------------------------------

  G.ANCHOR_DIRS = {
    n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 },
    ne: { x: SQ, y: -SQ }, se: { x: SQ, y: SQ }, sw: { x: -SQ, y: SQ }, nw: { x: -SQ, y: -SQ },
  };

  G.QUARTER_MIN = 260; // side length from which a note gets the quarter anchors (n1, n2, …): bigger than a standard task note (240)

  /** Snap points on a node's outline: { id: {id, x, y, dir} }. */
  G.anchors = function (n) {
    const { x, y, w, h } = n, cx = x + w / 2, cy = y + h / 2;
    let dx = 0, dy = 0;
    switch (n.shape) {
      case 'ellipse': dx = (w / 2) * (1 - SQ); dy = (h / 2) * (1 - SQ); break;
      case 'diamond': dx = w / 4; dy = h / 4; break;
      case 'rounded':
      case 'pill': dx = dy = cornerRadius(n.shape, w, h) * (1 - SQ); break;
      case 'hexagon': dx = slant(n.shape, w, h); break;
    }
    const pts = {
      n: { x: cx, y }, e: { x: x + w, y: cy }, s: { x: cx, y: y + h }, w: { x, y: cy },
      nw: { x: x + dx, y: y + dy }, ne: { x: x + w - dx, y: y + dy },
      se: { x: x + w - dx, y: y + h - dy }, sw: { x: x + dx, y: y + h - dy },
    };
    if (n.shape === 'parallelogram') {
      const k = slant(n.shape, w, h);
      pts.e.x = x + w - k / 2;
      pts.w.x = x + k / 2;
      pts.nw = { x: x + k, y };
      pts.ne = { x: x + w, y };
      pts.se = { x: x + w - k, y: y + h };
      pts.sw = { x, y: y + h };
    }
    // big notes with straight sides: two more anchors per side (at a quarter and three
    // quarters), so connections do not all meet in the middle; a shorter side keeps
    // three - a connection at a quarter point falls back to auto then
    if (!['ellipse', 'diamond', 'hexagon', 'parallelogram', 'pill'].includes(n.shape)) {
      if (w >= G.QUARTER_MIN) {
        pts.n1 = { x: x + w / 4, y }; pts.n2 = { x: x + (3 * w) / 4, y };
        pts.s1 = { x: x + w / 4, y: y + h }; pts.s2 = { x: x + (3 * w) / 4, y: y + h };
      }
      if (h >= G.QUARTER_MIN) {
        pts.e1 = { x: x + w, y: y + h / 4 }; pts.e2 = { x: x + w, y: y + (3 * h) / 4 };
        pts.w1 = { x, y: y + h / 4 }; pts.w2 = { x, y: y + (3 * h) / 4 };
      }
    }
    const out = {};
    for (const id in pts) out[id] = { id, x: pts[id].x, y: pts[id].y, dir: G.ANCHOR_DIRS[id] || G.ANCHOR_DIRS[id[0]] };
    // a turned image / emoji: its anchors turn with it (around the middle, as it is drawn)
    const rot = MM.canRotate && MM.canRotate(n) ? Number(n.rotate) || 0 : 0;
    if (rot) {
      const a = (rot * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
      for (const id in out) {
        const p = out[id], px = p.x - cx, py = p.y - cy, d = p.dir;
        out[id] = { id, x: cx + px * cs - py * sn, y: cy + px * sn + py * cs, dir: { x: d.x * cs - d.y * sn, y: d.x * sn + d.y * cs } };
      }
    }
    return out;
  };

  /** Point that the *other* end of a connection aims at. */
  G.endRef = function (end, doc) {
    const n = end.node && doc.nodes[end.node];
    if (!n) return { x: end.x, y: end.y };
    if (end.anchor && end.anchor !== 'auto') {
      const a = G.anchors(n)[end.anchor];
      if (a) return a;
    }
    return G.center(n);
  };

  /** Actual position + outgoing direction of a connection end. */
  G.resolveEnd = function (end, other, doc, axis) {
    const n = end.node && doc.nodes[end.node];
    if (!n) return { x: end.x, y: end.y, dir: null };
    const A = G.anchors(n);
    if (end.anchor && A[end.anchor]) return A[end.anchor];
    // auto: use the side that faces the other end
    const c = G.center(n);
    if (MM.canRotate && MM.canRotate(n) && n.rotate) {
      // turned: the side whose outgoing direction points most towards the other end
      const u = G.unit(other.x - c.x, other.y - c.y);
      let best = A.e;
      for (const id of ['n', 'e', 's', 'w']) {
        if (A[id].dir.x * u.x + A[id].dir.y * u.y > best.dir.x * u.x + best.dir.y * u.y) best = A[id];
      }
      return best;
    }
    const dx = (other.x - c.x) / Math.max(n.w, 1), dy = (other.y - c.y) / Math.max(n.h, 1);
    const horizontal = axis ? axis === 'x' : Math.abs(dx) > Math.abs(dy);
    if (horizontal) return other.x > c.x ? A.e : A.w;
    return other.y > c.y ? A.s : A.n;
  };

  /** For two auto-attached notes: connect along the axis with the larger gap. */
  function autoAxis(edge, doc) {
    const a = doc.nodes[edge.source.node], b = doc.nodes[edge.target.node];
    const auto = (end) => !end.anchor || end.anchor === 'auto';
    if (!a || !b || !auto(edge.source) || !auto(edge.target)) return null;
    const hgap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const vgap = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    return hgap >= vgap ? 'x' : 'y';
  }

  // ---- Routing -----------------------------------------------------------

  /** Reduce a direction to a horizontal or vertical one (for elbow routing). */
  function axisDir(d, toward) {
    if (Math.abs(d.x) > 0.99) return { x: Math.sign(d.x), y: 0 };
    if (Math.abs(d.y) > 0.99) return { x: 0, y: Math.sign(d.y) };
    const useX = Math.abs(toward.x) >= Math.abs(toward.y);
    if (useX) return { x: Math.sign(d.x) || Math.sign(toward.x) || 1, y: 0 };
    return { x: 0, y: Math.sign(d.y) || Math.sign(toward.y) || 1 };
  }

  function simplify(pts) {
    const out = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
      out.push(p);
    }
    for (let i = out.length - 2; i > 0; i--) {
      const a = out[i - 1], b = out[i], c = out[i + 1];
      const sameX = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5;
      const sameY = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5;
      if (sameX || sameY) out.splice(i, 1);
    }
    return out;
  }

  /** Orthogonal route from p1 (leaving in d1) to p2 (entering against d2). */
  G.orthoPoints = function (p1, d1, p2, d2) {
    const off = 20;
    const a = { x: p1.x + d1.x * off, y: p1.y + d1.y * off };
    const b = { x: p2.x + d2.x * off, y: p2.y + d2.y * off };
    const h1 = d1.x !== 0, h2 = d2.x !== 0;
    let mid;
    if (h1 && h2) {
      const mx = (a.x + b.x) / 2;
      if ((mx - a.x) * d1.x >= 0 && (mx - b.x) * d2.x >= 0) mid = [{ x: mx, y: a.y }, { x: mx, y: b.y }];
      else {
        const my = (a.y + b.y) / 2;
        mid = [{ x: a.x, y: my }, { x: b.x, y: my }];
      }
    } else if (!h1 && !h2) {
      const my = (a.y + b.y) / 2;
      if ((my - a.y) * d1.y >= 0 && (my - b.y) * d2.y >= 0) mid = [{ x: a.x, y: my }, { x: b.x, y: my }];
      else {
        const mx = (a.x + b.x) / 2;
        mid = [{ x: mx, y: a.y }, { x: mx, y: b.y }];
      }
    } else if (h1) {
      if ((b.x - a.x) * d1.x >= 0 && (a.y - b.y) * d2.y >= 0) mid = [{ x: b.x, y: a.y }];
      else mid = [{ x: a.x, y: b.y }];
    } else {
      if ((b.y - a.y) * d1.y >= 0 && (a.x - b.x) * d2.x >= 0) mid = [{ x: a.x, y: b.y }];
      else mid = [{ x: b.x, y: a.y }];
    }
    return simplify([p1, a, ...mid, b, p2]);
  };

  function polylinePath(pts, radius) {
    let d = `M${f(pts[0])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
      const r = Math.min(radius, G.dist(prev, cur) / 2, G.dist(cur, next) / 2);
      if (r < 0.5) {
        d += `L${f(cur)}`;
        continue;
      }
      const u1 = G.unit(cur.x - prev.x, cur.y - prev.y), u2 = G.unit(next.x - cur.x, next.y - cur.y);
      d += `L${f({ x: cur.x - u1.x * r, y: cur.y - u1.y * r })}`;
      d += `Q${f(cur)} ${f({ x: cur.x + u2.x * r, y: cur.y + u2.y * r })}`;
    }
    return d + `L${f(pts[pts.length - 1])}`;
  }

  function polylineMid(pts) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += G.dist(pts[i - 1], pts[i]);
    let half = total / 2;
    for (let i = 1; i < pts.length; i++) {
      const l = G.dist(pts[i - 1], pts[i]);
      if (half <= l && l > 0) {
        const t = half / l;
        return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
      }
      half -= l;
    }
    return pts[0];
  }

  /** Move point p toward q by `len` (but never past q). */
  function pullToward(p, q, len) {
    const l = G.dist(p, q);
    if (len <= 0 || l < 1) return p;
    const t = Math.min(len, l - 1) / l;
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
  }

  /**
   * Full geometry for a connection.
   * Returns { d, heads: [{d, fill}], mid, p1, p2 } or null if an end is missing.
   */
  G.edgeGeometry = function (edge, doc) {
    for (const end of [edge.source, edge.target]) {
      if (end.node && !doc.nodes[end.node]) return null;
    }
    const st = edge.style;
    const refS = G.endRef(edge.source, doc), refT = G.endRef(edge.target, doc);
    const axis = autoAxis(edge, doc);
    const s = G.resolveEnd(edge.source, refT, doc, axis), t = G.resolveEnd(edge.target, refS, doc, axis);
    const p1 = { x: s.x, y: s.y }, p2 = { x: t.x, y: t.y };
    const d1 = s.dir || G.unit(p2.x - p1.x, p2.y - p1.y);
    const d2 = t.dir || G.unit(p1.x - p2.x, p1.y - p2.y);

    let pts = null, c1, c2, uStart, uEnd;
    if (st.route === 'curved') {
      const k = G.clamp(G.dist(p1, p2) * 0.45, 30, 160);
      c1 = { x: p1.x + d1.x * k, y: p1.y + d1.y * k };
      c2 = { x: p2.x + d2.x * k, y: p2.y + d2.y * k };
      uStart = G.unit(p1.x - c1.x, p1.y - c1.y);
      uEnd = G.unit(p2.x - c2.x, p2.y - c2.y);
    } else if (st.route === 'elbow' || st.route === 'rounded') {
      pts = G.orthoPoints(p1, axisDir(d1, { x: p2.x - p1.x, y: p2.y - p1.y }), p2,
        axisDir(d2, { x: p1.x - p2.x, y: p1.y - p2.y }));
      if (pts.length < 2) pts = [p1, p2];
      uStart = G.unit(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const n = pts.length;
      uEnd = G.unit(pts[n - 1].x - pts[n - 2].x, pts[n - 1].y - pts[n - 2].y);
    } else {
      pts = [p1, p2];
      uStart = G.unit(p1.x - p2.x, p1.y - p2.y);
      uEnd = G.unit(p2.x - p1.x, p2.y - p1.y);
    }

    const heads = [];
    const hs = G.arrowHead(st.startArrow, p1, uStart, st.width);
    const he = G.arrowHead(st.endArrow, p2, uEnd, st.width);
    if (hs) heads.push(hs);
    if (he) heads.push(he);

    let d, mid;
    if (pts) {
      const q = pts.slice();
      if (hs) q[0] = pullToward(q[0], q[1], hs.shorten);
      if (he) q[q.length - 1] = pullToward(q[q.length - 1], q[q.length - 2], he.shorten);
      d = polylinePath(q, st.route === 'rounded' ? 14 : 0);
      mid = polylineMid(pts);
    } else {
      const a = hs ? pullToward(p1, c1, hs.shorten) : p1;
      const b = he ? pullToward(p2, c2, he.shorten) : p2;
      d = `M${f(a)}C${f(c1)} ${f(c2)} ${f(b)}`;
      mid = { x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8, y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8 };
    }
    return { d, heads, mid, p1, p2 };
  };

  // ---- Line styles and arrowheads ------------------------------------------

  G.dashArray = function (lineStyle, w) {
    switch (lineStyle) {
      case 'dashed': return `${Math.max(6, w * 3)} ${Math.max(4, w * 2)}`;
      case 'dotted': return `0 ${Math.max(4, w * 2.2)}`;
      case 'dashdot': return `${Math.max(8, w * 4)} ${Math.max(4, w * 2)} 0 ${Math.max(4, w * 2)}`;
      default: return '';
    }
  };

  /** Arrowhead with its tip at `tip`, pointing along unit vector `u`. */
  G.arrowHead = function (type, tip, u, width) {
    if (!type || type === 'none') return null;
    const L = 7 + width * 2.6, hw = L * 0.42;
    const nx = -u.y, ny = u.x;
    const P = (back, side) => ({ x: tip.x - u.x * back + nx * side, y: tip.y - u.y * back + ny * side });
    switch (type) {
      case 'arrow':
        return { d: `M${f(P(L, hw))}L${f(tip)}L${f(P(L, -hw))}`, fill: false, shorten: width * 0.5 };
      case 'triangle':
        return { d: `M${f(tip)}L${f(P(L, hw))}L${f(P(L, -hw))}Z`, fill: true, shorten: L * 0.85 };
      case 'diamond':
        return {
          d: `M${f(tip)}L${f(P(L * 0.6, hw * 0.8))}L${f(P(L * 1.2, 0))}L${f(P(L * 0.6, -hw * 0.8))}Z`,
          fill: true, shorten: L * 1.1,
        };
      case 'circle': {
        const r = L * 0.36, c = P(r, 0);
        return {
          d: `M${f({ x: c.x - r, y: c.y })}a${r.toFixed(1)},${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)},0` +
            `a${r.toFixed(1)},${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)},0Z`,
          fill: true, shorten: r * 1.8,
        };
      }
      case 'bar':
        return { d: `M${f(P(width * 0.5, hw))}L${f(P(width * 0.5, -hw))}`, fill: false, shorten: 0 };
      default:
        return null;
    }
  };
})(window.MM);
