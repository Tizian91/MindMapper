'use strict';
/*
 * Freehand (pen mode): handwriting and sketches with a stylus - or the mouse - on the map.
 * "✍ Pen" in the toolbar (or P) switches it on and it stays on until switched off (button,
 * P or Esc). A small palette shows pen / marker / eraser, colours and widths. Fingers keep
 * moving and zooming the map (touch.js); while the stylus is near the screen, touches are
 * ignored, so the hand can rest on it. "☝️ Finger" in the palette (touch screens, kept in
 * the browser): one finger writes, two fingers move and zoom - a second finger that comes
 * soon after the first turns the stroke just begun into a pinch.
 *
 * A freehand drawing is a drawing note (draw.js) with n.draw = 'ink':
 *   n.ink    = [[x, y, p, x, y, p, …], …]  one flat array per stroke: points as fractions of
 *              the box (like n.line, so it moves and scales like any drawing), p = pressure 0..1
 *   n.marker = true: a highlighter (even width, see-through - style.opacity)
 *   style.stroke = colour, style.strokeWidth = width at full pressure
 * Strokes written close to the last one go into the same drawing (a word, a sketch is one
 * object to move); over a note or image it is anchored to it, like any drawing. Each stroke
 * is one undo step, one erasing move as well.
 *
 * Automatic: the eraser end of a stylus (Windows) and the side button of the pen (S Pen,
 * Windows pens) erase while they are used.
 *
 * Sketches: "📏 Line" draws straight lines (drawings of kind 'line', draw.js), one after
 * the other without leaving the pen mode. Their ends snap to the ends of other lines
 * (a small circle shows it, with mouse and stylus already while hovering), with "▦ Grid"
 * (the grid of the map, settings.grid) to the grid as well; Shift: steps of 45°; Ctrl (Mac:
 * Cmd) held: that point does not snap at all.
 * "T Text" puts a text without a frame where you tap (draw.js placeText).
 */
(function (MM) {
  const S = MM.state;
  const K = (MM.ink = {});
  const MIN = 10;          // smallest box of a drawing (as draw.js)
  const JOIN = 60;         // world px: a stroke this close to the last drawing joins it
  const NEAR = 500;        // ms: the stylus counts as "near" this long after its last event
  const r4 = (v) => Math.round(v * 10000) / 10000;
  const r2 = (v) => Math.round(v * 100) / 100;

  K.PEN_COLORS = ['#1f2937', '#2563eb', '#dc2626', '#16a34a', '#9333ea'];
  K.MARKER_COLORS = ['#facc15', '#4ade80', '#f472b6', '#60a5fa'];
  K.WIDTHS = { pen: [1.5, 3, 6], marker: [12, 20, 32], shape: [1.5, 3, 6], text: [14, 18, 28], eraser: [8, 18, 36] };
  K.TOOLS = ['pen', 'marker', 'shape', 'text', 'eraser', 'lasso'];
  // "Shapes": drawings of draw.js, drawn in the pen mode (lines snap, see snapPoint)
  K.SHAPES = ['line', 'arrow', 'arrow2', 'rect', 'round', 'ellipse', 'triangle', 'diamond'];
  const SNAP = 12;         // screen px: an end this close to the end of another line snaps to it
  const HOLD = 500;        // ms the pen rests at the end of a stroke: its shape is recognised
  const DEFAULTS = {
    tool: 'pen',
    pen: { color: K.PEN_COLORS[0], width: 3 },
    marker: { color: K.MARKER_COLORS[0], width: 20 },
    // kind: the shape; dash: dashed line; fill: filled, see-through in the colour
    shape: { color: K.PEN_COLORS[0], width: 3, kind: 'line', dash: false, fill: false },
    text: { color: K.PEN_COLORS[0], width: 18 }, // width = font size
    eraser: { width: 18 }, // radius on screen
    lasso: {},
  };

  /** Settings of the palette (kept in the browser), completed with the defaults. */
  K.cfg = function () {
    const c = S.settings.pen && typeof S.settings.pen === 'object' ? S.settings.pen : {};
    // older settings: the line tool was a tool of its own
    const tool = c.tool === 'line' ? 'shape' : c.tool;
    const out = {
      tool: K.TOOLS.includes(tool) ? tool : DEFAULTS.tool,
      pen: Object.assign({}, DEFAULTS.pen, c.pen),
      marker: Object.assign({}, DEFAULTS.marker, c.marker),
      shape: Object.assign({}, DEFAULTS.shape, c.line && !c.shape ? { color: c.line.color, width: c.line.width } : null, c.shape),
      text: Object.assign({}, DEFAULTS.text, c.text),
      eraser: Object.assign({}, DEFAULTS.eraser, c.eraser),
      lasso: {},
      finger: !!c.finger, // one finger writes (phones / tablets without a stylus)
      recognize: c.recognize !== false, // pen held still at the end of a stroke: a clean shape (on unless switched off)
    };
    if (!K.SHAPES.includes(out.shape.kind)) out.shape.kind = 'line';
    out.shape.dash = !!out.shape.dash;
    out.shape.fill = !!out.shape.fill;
    S.settings.pen = out;
    return out;
  };

  /** Does a finger write? (pen mode on and "☝️ Finger" chosen) */
  K.fingerDraws = () => K.on() && !!(S.settings.pen && S.settings.pen.finger);

  // ---- Geometry (pure: also used by the tests) ------------------------------------------

  /** Width factor of a pressure: light strokes thinner, from about 0.7 on the full width. */
  K.factor = (p) => 0.35 + 0.65 * Math.min(1, Math.max(0, p) / 0.7);

  /**
   * Outline of one stroke as a closed SVG path (filled, not stroked - so the width can
   * follow the pressure). pts: flat [x, y, p, …] in px; width: at full pressure.
   */
  K.outline = function (pts, width, even) {
    const P = [];
    for (let i = 0; i + 2 < pts.length; i += 3) {
      const r = Math.max(0.3, (width / 2) * (even ? 1 : K.factor(pts[i + 2])));
      P.push({ x: pts[i], y: pts[i + 1], r });
    }
    if (!P.length) return '';
    const f = (v) => Math.round(v * 100) / 100;
    const spread = P.reduce((m, q) => Math.max(m, Math.hypot(q.x - P[0].x, q.y - P[0].y)), 0);
    if (P.length === 1 || spread < 0.5) { // a dot
      const { x, y } = P[0], r = Math.max(...P.map((q) => q.r));
      return `M${f(x - r)},${f(y)}a${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0Z`;
    }
    const L = [], R = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y;
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;
      const q = P[i];
      L.push({ x: q.x - ty * q.r, y: q.y + tx * q.r });
      R.push({ x: q.x + ty * q.r, y: q.y - tx * q.r });
    }
    // smooth: quadratic curves through the middles of the points
    const side = (A) => {
      let d = '';
      for (let i = 1; i < A.length - 1; i++) {
        const m = { x: (A[i].x + A[i + 1].x) / 2, y: (A[i].y + A[i + 1].y) / 2 };
        d += `Q${f(A[i].x)},${f(A[i].y)} ${f(m.x)},${f(m.y)}`;
      }
      return d + `L${f(A[A.length - 1].x)},${f(A[A.length - 1].y)}`;
    };
    const end = P[P.length - 1], start = P[0];
    const Rr = R.slice().reverse();
    return `M${f(L[0].x)},${f(L[0].y)}` + side(L) +
      `A${f(end.r)},${f(end.r)} 0 0,0 ${f(Rr[0].x)},${f(Rr[0].y)}` + side(Rr) +
      `A${f(start.r)},${f(start.r)} 0 0,0 ${f(L[0].x)},${f(L[0].y)}Z`;
  };

  /** Fewer points, the same line (Ramer-Douglas-Peucker on x / y, tolerance in px). */
  K.simplify = function (pts, tol) {
    const n = pts.length / 3;
    if (n <= 2) return pts.slice();
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const ax = pts[a * 3], ay = pts[a * 3 + 1], bx = pts[b * 3], by = pts[b * 3 + 1];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      let far = -1, best = 0;
      for (let i = a + 1; i < b; i++) {
        const px = pts[i * 3], py = pts[i * 3 + 1];
        const d = len ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / len : Math.hypot(px - ax, py - ay);
        // a clear change of pressure is kept as well (the width follows it) - after the corners
        const dp = Math.abs(pts[i * 3 + 2] - (pts[a * 3 + 2] + pts[b * 3 + 2]) / 2);
        const score = d > tol ? d : dp > 0.15 ? tol * dp : 0;
        if (score > best) {
          best = score;
          far = i;
        }
      }
      if (far >= 0) {
        keep[far] = 1;
        stack.push([a, far], [far, b]);
      }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
    return out;
  };

  /** Strokes of a freehand drawing in world coordinates. */
  K.strokes = function (n) {
    return (n.ink || []).map((s) => {
      const out = [];
      for (let i = 0; i + 2 < s.length; i += 3) out.push(n.x + s[i] * n.w, n.y + s[i + 1] * n.h, s[i + 2]);
      return out;
    });
  };

  /** Give drawing n these strokes (world coordinates): the box is fitted around them. */
  K.setStrokes = function (n, strokes) {
    const pad = (Number(n.style.strokeWidth) || 0) / 2 + 1;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) {
      for (let i = 0; i + 2 < s.length; i += 3) {
        x0 = Math.min(x0, s[i]);
        x1 = Math.max(x1, s[i]);
        y0 = Math.min(y0, s[i + 1]);
        y1 = Math.max(y1, s[i + 1]);
      }
    }
    x0 -= pad;
    y0 -= pad;
    x1 += pad;
    y1 += pad;
    // at least MIN wide / high, the strokes in the middle
    if (x1 - x0 < MIN) {
      const c = (x0 + x1) / 2;
      x0 = c - MIN / 2;
      x1 = c + MIN / 2;
    }
    if (y1 - y0 < MIN) {
      const c = (y0 + y1) / 2;
      y0 = c - MIN / 2;
      y1 = c + MIN / 2;
    }
    Object.assign(n, { x: r2(x0), y: r2(y0), w: r2(x1 - x0), h: r2(y1 - y0) });
    n.ink = strokes.map((s) => {
      const out = [];
      for (let i = 0; i + 2 < s.length; i += 3) out.push(r4((s[i] - n.x) / n.w), r4((s[i + 1] - n.y) / n.h), r2(s[i + 2]));
      return out;
    });
  };

  /** SVG path of a freehand drawing in its own box (draw.js D.path). */
  K.path = function (n) {
    const w = Number(n.style.strokeWidth) || 0;
    return (n.ink || []).map((s) => {
      const px = [];
      for (let i = 0; i + 2 < s.length; i += 3) px.push(s[i] * n.w, s[i + 1] * n.h, s[i + 2]);
      return K.outline(px, w, !!n.marker);
    }).join('');
  };

  /** Distance of point p to the segment a-b. */
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  /** Does a stroke (world coordinates) come within `r` of point p? */
  K.hits = function (s, p, r) {
    if (s.length < 6) return s.length >= 2 && Math.hypot(s[0] - p.x, s[1] - p.y) <= r;
    for (let i = 3; i + 2 < s.length; i += 3) {
      if (segDist(p.x, p.y, s[i - 3], s[i - 2], s[i], s[i + 1]) <= r) return true;
    }
    return false;
  };

  /**
   * A finished stroke (world coordinates) onto the map: into the last freehand drawing if it
   * is close by, of the same pen and on the same note - else into a new one (anchored to the
   * note it starts on, like a drawing). Returns the drawing.
   */
  K.add = function (pts, opts) {
    const marker = opts.tool === 'marker';
    const under = opts.under || null;
    let n = K.last && S.doc.nodes[K.last];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 2 < pts.length; i += 3) {
      x0 = Math.min(x0, pts[i]);
      x1 = Math.max(x1, pts[i]);
      y0 = Math.min(y0, pts[i + 1]);
      y1 = Math.max(y1, pts[i + 1]);
    }
    const near = n && n.type === 'draw' && n.draw === 'ink' &&
      !!n.marker === marker && n.style.stroke === opts.color && Number(n.style.strokeWidth) === opts.width &&
      x0 < n.x + n.w + JOIN && x1 > n.x - JOIN && y0 < n.y + n.h + JOIN && y1 > n.y - JOIN &&
      (!under || (n.anchor && n.anchor.node === under.id));
    if (near) {
      K.setStrokes(n, K.strokes(n).concat([pts]));
    } else {
      n = MM.createNode('draw', 0, 0, { draw: 'ink', anchor: null, marker });
      delete n.line;
      Object.assign(n.style, { stroke: opts.color, strokeWidth: opts.width, strokeStyle: 'solid', fill: 'none', opacity: marker ? 0.4 : 1 });
      K.setStrokes(n, [pts]);
      S.doc.nodes[n.id] = n;
      MM.draw.setAnchor(n, under);
    }
    K.last = n.id;
    return n;
  };

  /**
   * Erase the strokes within `r` of point p (world coordinates). A drawing without strokes
   * goes. Returns true if something was erased.
   */
  K.eraseAt = function (p, r) {
    let any = false;
    for (const n of Object.values(S.doc.nodes)) {
      if (n.type !== 'draw' || (MM.meta && MM.meta.isHidden && MM.meta.isHidden(n))) continue;
      const half = (Number(n.style.strokeWidth) || 0) / 2;
      if (p.x < n.x - r || p.x > n.x + n.w + r || p.y < n.y - r || p.y > n.y + n.h + r) continue;
      if (n.draw !== 'ink') {
        // a shape (line, arrow, rectangle …): it goes as a whole when the eraser touches its line
        const pts = MM.draw.outline(n);
        let hit = false;
        for (let i = 1; i < pts.length && !hit; i++) hit = K.segDist(p, pts[i - 1], pts[i]) <= r + half;
        if (hit) {
          delete S.doc.nodes[n.id];
          S.selection.delete(n.id);
          any = true;
        }
        continue;
      }
      const strokes = K.strokes(n);
      const left = strokes.filter((s) => !K.hits(s, p, r + half));
      if (left.length === strokes.length) continue;
      any = true;
      if (!left.length) {
        delete S.doc.nodes[n.id];
        S.selection.delete(n.id);
      } else {
        K.setStrokes(n, left);
      }
    }
    return any;
  };

  // ---- Shape recognition ------------------------------------------------------------------
  // A stroke after which the pen rested a moment (HOLD) becomes a clean shape if it looks
  // like one: open and straight - a line; closed - triangle, rectangle, diamond or ellipse.

  /** Is point p inside the polygon pts ([{x, y}])? */
  K.inside = function (p, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };

  /**
   * The shape a stroke (flat [x, y, p, …], world coordinates) was meant to be, or null:
   * { kind, a, b } - a line from a to b, or a shape in the box a (top left) - b.
   * minSize: smallest size in world units (small strokes are letters, not shapes).
   */
  K.recognize = function (flat, minSize) {
    const pts = [];
    for (let i = 0; i + 2 < flat.length; i += 3) pts.push({ x: flat[i], y: flat[i + 1] });
    if (pts.length < 4) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0;
    pts.forEach((p, i) => {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      if (i) len += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    });
    const w = x1 - x0, h = y1 - y0, diag = Math.hypot(w, h);
    if (diag < (minSize || 0)) return null;
    const first = pts[0], last = pts[pts.length - 1];
    const chord = Math.hypot(last.x - first.x, last.y - first.y);
    // open and straight: a line (nearly level / upright: exactly)
    if (chord > diag * 0.85 && chord / len > 0.94) {
      const b = { x: last.x, y: last.y };
      const ang = Math.atan2(b.y - first.y, b.x - first.x), step = Math.PI / 4;
      const near = Math.round(ang / step) * step;
      if (Math.abs(ang - near) < 0.09) { // ~5°: onto the 45° steps
        b.x = first.x + chord * Math.cos(near);
        b.y = first.y + chord * Math.sin(near);
      }
      return { kind: 'line', a: { x: r2(first.x), y: r2(first.y) }, b: { x: r2(b.x), y: r2(b.y) } };
    }
    if (chord > diag * 0.3 || w < diag * 0.15 || h < diag * 0.15) return null; // not closed, or too thin
    const box = { kind: '', a: { x: r2(x0), y: r2(y0) }, b: { x: r2(x1), y: r2(y1) } };
    // corners: the stroke with fewer points, then points on a straight way dropped
    const simple = K.simplify(flat, diag * 0.07);
    let v = [];
    for (let i = 0; i + 2 < simple.length; i += 3) v.push({ x: simple[i], y: simple[i + 1] });
    if (v.length > 2 && Math.hypot(v[0].x - v[v.length - 1].x, v[0].y - v[v.length - 1].y) < diag * 0.3) v.pop();
    for (let again = true; again && v.length > 3;) {
      again = false;
      for (let i = 0; i < v.length; i++) {
        const a = v[(i + v.length - 1) % v.length], p = v[i], b = v[(i + 1) % v.length];
        const turn = Math.abs(Math.atan2(b.y - p.y, b.x - p.x) - Math.atan2(p.y - a.y, p.x - a.x));
        const bend = Math.min(turn, 2 * Math.PI - turn);
        if (bend < 0.45) { // less than ~25°: no corner
          v.splice(i, 1);
          again = true;
          break;
        }
      }
    }
    const near = (p, q, tol) => Math.hypot(p.x - q.x, p.y - q.y) < tol;
    const tol = Math.min(w, h) * 0.35;
    const corners = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    const middles = [{ x: (x0 + x1) / 2, y: y0 }, { x: x1, y: (y0 + y1) / 2 }, { x: (x0 + x1) / 2, y: y1 }, { x: x0, y: (y0 + y1) / 2 }];
    if (v.length === 3) return Object.assign(box, { kind: 'triangle' });
    if (v.length === 4) {
      if (v.every((p) => corners.some((c) => near(p, c, tol)))) return Object.assign(box, { kind: 'rect' });
      if (v.every((p) => middles.some((c) => near(p, c, tol)))) return Object.assign(box, { kind: 'diamond' });
    }
    // round: every point about as far from the middle as an ellipse in the box would be
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = w / 2, ry = h / 2;
    const err = pts.reduce((s, p) => s + Math.abs(Math.hypot((p.x - cx) / rx, (p.y - cy) / ry) - 1), 0) / pts.length;
    if (v.length >= 5 && err < 0.16) return Object.assign(box, { kind: 'ellipse' });
    if (v.length === 4) return Object.assign(box, { kind: 'rect' });
    return null;
  };

  // ---- Straight lines (sketches) --------------------------------------------------------

  /** The two ends of a line drawing in world coordinates. */
  K.ends = function (n) {
    const l = n.line || { x1: 0, y1: 0, x2: 1, y2: 1 };
    return [{ x: n.x + l.x1 * n.w, y: n.y + l.y1 * n.h }, { x: n.x + l.x2 * n.w, y: n.y + l.y2 * n.h }];
  };

  /** Distance of point p from the segment a-b. */
  K.segDist = function (p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };

  /**
   * Where an end of a line goes: onto the end of another line (r: world distance), else
   * onto the grid (if on), else where it is. Returns { x, y, kind: 'end' | 'grid' | null }.
   */
  K.snapPoint = function (p, r) {
    let best = null, bd = r;
    for (const n of Object.values(S.doc.nodes)) {
      if (n.type !== 'draw' || !MM.isLineKind(n.draw) || (MM.meta && MM.meta.isHidden && MM.meta.isHidden(n))) continue;
      for (const e of K.ends(n)) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d <= bd) {
          bd = d;
          best = e;
        }
      }
    }
    if (best) return { x: r2(best.x), y: r2(best.y), kind: 'end' };
    if (S.settings.grid) {
      const g = Number(S.settings.gridSize) || 20;
      return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g, kind: 'grid' };
    }
    return { x: r2(p.x), y: r2(p.y), kind: null };
  };

  /** End point b of a line from a: Shift - in steps of 45°; free (Ctrl) - where it is; else snapped. */
  K.lineEnd = function (a, p, shift, r, free) {
    if (shift) {
      const len = Math.hypot(p.x - a.x, p.y - a.y), ang = Math.round(Math.atan2(p.y - a.y, p.x - a.x) / (Math.PI / 4)) * (Math.PI / 4);
      return { x: r2(a.x + len * Math.cos(ang)), y: r2(a.y + len * Math.sin(ang)), kind: null };
    }
    return free ? { x: r2(p.x), y: r2(p.y), kind: null } : K.snapPoint(p, r);
  };

  /** Ctrl (Mac: Cmd) held: the point is put freely, it does not snap. */
  const freeKey = (e) => !!(e.ctrlKey || e.metaKey);

  // ---- Pen mode --------------------------------------------------------------------------

  let vp = null, palette = null, live = null;
  let active = null;   // the stroke / erasing move in progress
  let penSeen = 0;     // time of the last stylus event (palm rejection)
  let quietUntil = 0;  // click / dblclick / context menu of the stylus after a stroke are ignored

  K.on = () => !!S.settings.penMode;

  /** The stylus is touching or near the screen: touches are the hand resting on it. */
  K.penNear = () => K.on() && (!!(active && active.type === 'pen') || Date.now() - penSeen < NEAR);

  K.toggle = function (on) {
    S.settings.penMode = on === undefined ? !S.settings.penMode : !!on;
    if (S.settings.penMode) {
      if (S.tool) MM.draw.setTool(null);
      if (MM.editing) MM.edit.finish();
      K.last = null; // a new pen session starts new drawings
    }
    vp.classList.toggle('inking', K.on());
    if (live && !K.on()) live.style.display = 'none';
    renderPalette();
    MM.ui.update();
  };

  K.init = function () {
    vp = document.getElementById('viewport');
    K.cfg();
    S.settings.penMode = false; // always off at the start
    // capture phase: before interaction.js (mouse) - touch.js only takes touches
    vp.addEventListener('pointerdown', down, true);
    vp.addEventListener('pointermove', move, true);
    vp.addEventListener('pointerup', up, true);
    vp.addEventListener('pointercancel', cancel, true);
    const quiet = (e) => {
      if (K.on() && (active || Date.now() < quietUntil || (e.type === 'contextmenu' && Date.now() - penSeen < NEAR))) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    for (const t of ['click', 'dblclick', 'contextmenu']) vp.addEventListener(t, quiet, true);
  };

  /** Eraser end (Windows: button 5 / buttons 32) or side button of the pen held (buttons 2). */
  const erasing = (e) => e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) || (e.buttons & 2));

  function down(e) {
    if (e.pointerType === 'pen') penSeen = Date.now();
    if (!K.on() || e.pointerType === 'touch' || active) return; // a finger: touch.js asks K.fingerDown
    if (vp.classList.contains('space-pan')) return; // Space + drag pans the map
    if (e.button !== 0 && !erasing(e)) return; // right / middle mouse button as usual
    if (!erasing(e) && onSelection(e)) return; // lasso: what was caught is moved (interaction.js)
    begin(e);
  }

  /**
   * Lasso: does the pointer come down on what the lasso caught (the box around it, a little
   * wider)? Then it is moved, resized or deleted as usual - no new lasso.
   */
  function onSelection(e) {
    if (K.cfg().tool !== 'lasso') return false;
    const sel = MM.selectedNodes();
    if (!sel.length) return false;
    const p = MM.interaction.toWorld(e.clientX, e.clientY), b = MM.geo.bbox(sel), pad = 16 / (S.doc.view.zoom || 1);
    return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
  }

  /**
   * A finger came down (touch.js, only when no other finger is on the screen): it writes
   * if "☝️ Finger" is on. Returns true if it took the touch.
   */
  K.fingerDown = function (e) {
    if (!K.fingerDraws() || active || onSelection(e)) return false;
    begin(e);
    return true;
  };

  /**
   * A second finger came: the first one was the start of a pinch, not a stroke. A stroke
   * just begun is dropped, a longer one is kept. Returns the first finger { id, x, y }
   * (for touch.js to go on with both) or null if no finger was writing.
   */
  K.fingerTakeover = function () {
    if (!active || active.type !== 'touch') return null;
    const a = active;
    if (Date.now() - a.t0 < 300 || a.pts.length < 12) {
      active = null;
      erasePrev = null;
      vp.classList.remove('erasing');
      if (live) live.style.display = 'none';
      if (a.tool === 'eraser' && a.erased) MM.commit(); // what was erased stays erased (one undo step)
    } else {
      finish();
    }
    return { id: a.id, x: a.cx, y: a.cy };
  };

  function begin(e) {
    const autoErase = erasing(e);
    e.preventDefault();
    e.stopImmediatePropagation();
    const wasEditing = !!MM.editing;
    if (MM.editing) MM.edit.finish();
    if (MM.menu && MM.menu.isOpen()) MM.menu.close();
    if (MM.touch && MM.touch.reset) MM.touch.reset(); // a hand that touched first does not pan on
    try { vp.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    const cfg = K.cfg();
    const tool = autoErase ? 'eraser' : cfg.tool;
    active = {
      id: e.pointerId, type: e.pointerType, tool, pts: [], erased: false, t0: Date.now(), cx: e.clientX, cy: e.clientY,
      color: tool !== 'eraser' && tool !== 'lasso' ? cfg[tool].color : null,
      width: cfg[tool].width,
      under: null,
      kind: tool === 'shape' ? cfg.shape.kind : null,
      dash: tool === 'shape' && cfg.shape.dash,
      fill: tool === 'shape' && cfg.shape.fill,
      shape: null, // a stroke recognised as a shape (pen held still at its end)
    };
    if (tool === 'lasso') {
      MM.select([]);
      MM.refresh();
      addEvents([e]);
      return;
    }
    if (tool !== 'eraser') {
      const p = MM.interaction.toWorld(e.clientX, e.clientY);
      // anchored to the note / image it starts on (Alt: free), as a drawing
      active.under = e.altKey ? null : MM.interaction.nodeAt(p);
    }
    if (tool === 'text') {
      // a text without a frame where you tap; a tap while writing one only ends it
      active = null;
      quietUntil = Date.now() + 400;
      if (!wasEditing) MM.draw.placeText(MM.interaction.toWorld(e.clientX, e.clientY), { color: cfg.text.color, size: cfg.text.width, free: freeKey(e) });
      return;
    }
    if (tool === 'shape') {
      // lines snap to the ends of other lines (and the grid), boxes only to the grid
      const r = MM.isLineKind(active.kind) ? SNAP / (S.doc.view.zoom || 1) : 0, w = MM.interaction.toWorld(e.clientX, e.clientY);
      active.a = freeKey(e) ? { x: r2(w.x), y: r2(w.y), kind: null } : K.snapPoint(w, r);
      active.b = active.a;
      drawLive();
      return;
    }
    vp.classList.toggle('erasing', tool === 'eraser');
    addEvents([e]);
  }

  function move(e) {
    if (e.pointerType === 'pen') penSeen = Date.now();
    if (!active && K.on() && e.pointerType !== 'touch' && S.settings.pen && S.settings.pen.tool === 'shape' &&
      MM.isLineKind(S.settings.pen.shape && S.settings.pen.shape.kind)) hover(e);
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    active.cx = e.clientX;
    active.cy = e.clientY;
    const all = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    addEvents(all.length ? all : [e]); // some browsers give none (e.g. made-up events)
  }

  function up(e) {
    if (e.pointerType === 'pen') penSeen = Date.now();
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    finish();
  }

  function cancel(e) {
    if (!active || e.pointerId !== active.id) return;
    e.stopImmediatePropagation();
    finish();
  }

  /** Points of the pointer events: world coordinates, a little steadied, pressure. */
  function addEvents(list) {
    const zoom = S.doc.view.zoom || 1;
    if (active.tool === 'shape') {
      const ev = list[list.length - 1], p = MM.interaction.toWorld(ev.clientX, ev.clientY);
      if (MM.isLineKind(active.kind)) active.b = K.lineEnd(active.a, p, ev.shiftKey, SNAP / zoom, freeKey(ev));
      else {
        // a box: Shift - square / circle; corners onto the grid (if on)
        active.b = freeKey(ev) ? { x: r2(p.x), y: r2(p.y), kind: null } : K.snapPoint(p, 0);
        active.square = ev.shiftKey;
      }
      drawLive();
      return;
    }
    if (active.shape) return; // recognised: the shape stays as it is until the pen is lifted
    let moved = false;
    for (const ev of list) {
      const p = MM.interaction.toWorld(ev.clientX, ev.clientY);
      if (active.tool === 'eraser') {
        erase(p, (active.width / 2) / zoom);
        continue;
      }
      if (active.tool === 'lasso') {
        const pts = active.pts, n = pts.length;
        if (!n || Math.hypot(p.x - pts[n - 3], p.y - pts[n - 2]) >= 3 / zoom) pts.push(p.x, p.y, 1);
        continue;
      }
      // the pen rests: no new point yet, the hold timer goes on (shape recognition)
      if (active.pts.length && Math.hypot(p.x - active.pts[active.pts.length - 3], p.y - active.pts[active.pts.length - 2]) * zoom > 3) moved = true;
      // a mouse has no pressure (reports 0.5 while pressed): the full width
      const pr = active.type === 'pen' ? (ev.pressure > 0 ? ev.pressure : 0.5) : 1;
      const pts = active.pts, n = pts.length;
      if (n) {
        const lx = pts[n - 3], ly = pts[n - 2];
        if (Math.hypot(p.x - lx, p.y - ly) < 0.75 / zoom) continue; // no new point yet
        // steadied a little against jitter, without a noticeable lag
        p.x = lx + (p.x - lx) * 0.8;
        p.y = ly + (p.y - ly) * 0.8;
        pts.push(p.x, p.y, pts[n - 1] * 0.5 + pr * 0.5);
      } else {
        pts.push(p.x, p.y, pr);
        moved = true;
      }
    }
    if (active.tool !== 'eraser') drawLive();
    // shape recognition: the pen rests a moment at the end of a pen stroke
    if (active.tool === 'pen' && K.cfg().recognize && moved) {
      clearTimeout(holdTimer);
      const a = active;
      holdTimer = setTimeout(() => {
        if (active !== a || a.shape) return;
        const shape = K.recognize(a.pts, 40 / (S.doc.view.zoom || 1));
        if (!shape) return;
        a.shape = shape;
        if (navigator.vibrate) navigator.vibrate(10);
        drawLive();
      }, HOLD);
    }
  }
  let holdTimer = 0;

  let erasePrev = null, eraseFrame = 0;
  function erase(p, r) {
    // along the way since the last point, so a quick move does not jump over a stroke
    const from = erasePrev || p;
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / Math.max(1, r / 2)));
    for (let i = 1; i <= steps; i++) {
      const q = { x: from.x + ((p.x - from.x) * i) / steps, y: from.y + ((p.y - from.y) * i) / steps };
      if (K.eraseAt(q, r)) active.erased = true;
    }
    erasePrev = p;
    if (active.erased && !eraseFrame) {
      eraseFrame = requestAnimationFrame(() => {
        eraseFrame = 0;
        MM.refresh();
      });
    }
  }

  // the stroke being written: a path of its own, redrawn once per frame
  let liveFrame = 0;
  function drawLive() {
    if (liveFrame) return;
    liveFrame = requestAnimationFrame(() => {
      liveFrame = 0;
      if (!active || active.tool === 'eraser') return;
      ensureLive();
      live.style.display = '';
      live.style.opacity = active.tool === 'marker' ? 0.4 : 1;
      const path = live.firstElementChild;
      const zoom = S.doc.view.zoom || 1;
      path.removeAttribute('stroke-dasharray');
      path.removeAttribute('transform');
      if (active.tool === 'lasso') {
        // the loop being drawn: dashed, closed
        const p = active.pts, d = [];
        for (let i = 0; i + 2 < p.length; i += 3) d.push((i ? 'L' : 'M') + p[i] + ',' + p[i + 1]);
        path.setAttribute('fill', 'rgba(43, 108, 222, 0.08)');
        path.setAttribute('stroke', '#2b6cde');
        path.setAttribute('stroke-width', 1.5 / zoom);
        path.setAttribute('stroke-dasharray', `${6 / zoom} ${4 / zoom}`);
        path.setAttribute('d', d.join('') + (d.length > 2 ? 'Z' : ''));
        markers([]);
        return;
      }
      const shape = active.tool === 'shape' ? { kind: active.kind, a: active.a, b: active.b, square: active.square } : active.shape;
      if (shape) {
        // a shape being drawn, or a stroke recognised as one: as it will look (draw.js)
        const box = MM.draw.boxFor(shape.kind, shape.a, shape.b, !!shape.square);
        const n = { draw: shape.kind, line: box.line, w: box.w, h: box.h, style: { strokeWidth: active.width } };
        path.setAttribute('fill', active.fill ? active.color + '40' : 'none');
        path.setAttribute('stroke', active.color);
        path.setAttribute('stroke-width', active.width);
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        if (active.dash) path.setAttribute('stroke-dasharray', MM.geo.dashArray('dashed', active.width));
        path.setAttribute('transform', `translate(${box.x},${box.y})`);
        path.setAttribute('d', MM.draw.path(n));
        markers(MM.isLineKind(shape.kind) && active.tool === 'shape' ? [active.a, active.b] : []);
        return;
      }
      path.removeAttribute('transform');
      path.setAttribute('stroke', 'none');
      path.setAttribute('fill', active.color);
      path.setAttribute('d', K.outline(active.pts, active.width, active.tool === 'marker'));
      markers([]);
    });
  }

  /** The layer of what is being drawn (world coordinates, in the ui layer). */
  function ensureLive() {
    if (live) return;
    live = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    live.setAttribute('class', 'ink-live');
    live.setAttribute('width', 1);
    live.setAttribute('height', 1);
    live.append(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
    document.getElementById('ui-layer').append(live);
  }

  /** Small circles where an end of a line snaps (to another line's end, or the grid). */
  function markers(points) {
    if (!live) return;
    let m = live.querySelector('.ink-snap');
    if (!m) {
      m = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      m.setAttribute('class', 'ink-snap');
      live.append(m);
    }
    const r = 5 / (S.doc.view.zoom || 1);
    m.setAttribute('stroke-width', 1.5 / (S.doc.view.zoom || 1));
    m.setAttribute('d', points.filter((p) => p && p.kind).map((p) =>
      `M${p.x - r},${p.y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`).join(''));
  }

  // line tool, mouse / stylus over the map: where the line would begin
  let hoverFrame = 0, hoverAt = null;
  function hover(e) {
    hoverAt = { x: e.clientX, y: e.clientY, free: freeKey(e) };
    if (hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      if (active || !K.on() || !hoverAt || K.cfg().tool !== 'shape' || !MM.isLineKind(K.cfg().shape.kind)) return;
      ensureLive();
      const p = K.snapPoint(MM.interaction.toWorld(hoverAt.x, hoverAt.y), SNAP / (S.doc.view.zoom || 1));
      live.style.display = '';
      live.firstElementChild.setAttribute('d', '');
      markers(hoverAt.free ? [] : [p]); // Ctrl: it would not snap
    });
  }

  function finish() {
    const a = active;
    active = null;
    erasePrev = null;
    quietUntil = Date.now() + 400;
    vp.classList.remove('erasing');
    if (live) live.style.display = 'none';
    if (a.tool === 'eraser') {
      if (a.erased) {
        K.last = null;
        MM.commit();
      }
      return;
    }
    clearTimeout(holdTimer);
    const zoom = S.doc.view.zoom || 1;
    if (a.tool === 'lasso') {
      lassoSelect(a.pts);
      return;
    }
    const shape = a.tool === 'shape' ? { kind: a.kind, a: a.a, b: a.b, square: a.square } : a.shape;
    if (shape) {
      if (Math.hypot(shape.b.x - shape.a.x, shape.b.y - shape.a.y) * zoom < 3) return; // a tap, no shape
      const n = MM.draw.create(shape.kind, shape.a, shape.b, !!shape.square);
      Object.assign(n.style, {
        stroke: a.color, strokeWidth: a.width, opacity: 1, strokeStyle: a.dash ? 'dashed' : 'solid',
        fill: a.fill && !MM.isLineKind(shape.kind) ? a.color + '40' : 'none', // see-through in the colour of the line
      });
      MM.draw.setAnchor(n, a.under);
      K.last = null;
      MM.commit();
      return;
    }
    if (!a.pts.length) return;
    K.add(K.simplify(a.pts, 0.35 / zoom), { tool: a.tool, color: a.color, width: a.width, under: a.under });
    MM.commit();
  }

  /**
   * Lasso drawn: what lies inside the loop is selected - a note or shape with its middle,
   * a freehand drawing with most of its points. Then it can be moved, resized or deleted.
   */
  function lassoSelect(flat) {
    const loop = [];
    for (let i = 0; i + 2 < flat.length; i += 3) loop.push({ x: flat[i], y: flat[i + 1] });
    const ids = loop.length < 3 ? [] : Object.values(S.doc.nodes).filter((n) => {
      if ((MM.meta.isHidden && MM.meta.isHidden(n)) || (MM.notebook && MM.notebook.off(n))) return false;
      if (n.type === 'draw' && n.draw === 'ink') {
        const pts = K.strokes(n).flatMap((s) => {
          const out = [];
          for (let i = 0; i + 2 < s.length; i += 3) out.push({ x: s[i], y: s[i + 1] });
          return out;
        });
        return pts.filter((p) => K.inside(p, loop)).length * 2 >= pts.length;
      }
      return K.inside({ x: n.x + n.w / 2, y: n.y + n.h / 2 }, loop);
    }).map((n) => n.id);
    MM.select(ids);
    MM.refresh();
    renderPalette();
    if (ids.length) MM.ui.flash(MM.tr('{n} caught - drag to move, the corner to resize, 🗑 deletes', { n: ids.length }));
  }

  // ---- Palette ---------------------------------------------------------------------------

  // the button of the shapes shows the shape chosen (icon from SHAPE_ICONS)
  const TOOLS = [['pen', '✏️', 'Pen'], ['marker', '🖍️', 'Marker'], ['shape', '', 'Shapes'], ['text', '<b class="ink-t">T</b>', 'Text'],
    ['eraser', '🧽', 'Eraser'], ['lasso', '<b class="ink-lasso-icon">◌</b>', 'Lasso']];
  const SHAPE_ICONS = {
    line: 'M4,18L28,4', arrow: 'M4,18L28,4M20,4H28V10', arrow2: 'M4,18L28,4M20,4H28V10M4,10V18H12',
    rect: 'M4,4H28V18H4Z', round: 'M9,4H23A5,5 0 0 1 28,9V13A5,5 0 0 1 23,18H9A5,5 0 0 1 4,13V9A5,5 0 0 1 9,4Z',
    ellipse: 'M4,11A12,7 0 1,0 28,11A12,7 0 1,0 4,11Z', triangle: 'M16,3L28,19H4Z', diamond: 'M16,2L29,11L16,20L3,11Z',
  };
  const shapeIcon = (kind) => `<svg class="ink-shape" viewBox="0 0 32 22" width="28" height="19"><path d="${SHAPE_ICONS[kind]}"/></svg>`;

  function renderPalette() {
    if (!K.on()) {
      if (palette) palette.hidden = true;
      return;
    }
    if (!palette) {
      palette = document.createElement('div');
      palette.id = 'ink-palette';
      palette.addEventListener('pointerdown', (e) => e.stopPropagation());
      palette.addEventListener('click', onPalette);
      document.getElementById('app').append(palette);
    }
    const esc = MM.render.esc, tr = MM.tr;
    const cfg = K.cfg(), tool = cfg.tool;
    const plain = tool === 'eraser' || tool === 'lasso'; // no colour
    const colors = tool === 'marker' ? K.MARKER_COLORS : plain ? [] : K.PEN_COLORS;
    const cur = plain ? null : cfg[tool].color;
    const widths = K.WIDTHS[tool] || [];
    const toggle = (attr, on, icon, label, title) =>
      `<button type="button" ${attr} class="${on ? 'active' : ''}" title="${esc(tr(title))}">${icon}<span>${esc(tr(label))}</span></button>`;
    // what belongs to the tool chosen: the shapes, recognising shapes, deleting what the lasso caught
    let extra = '';
    if (tool === 'shape') {
      extra = K.SHAPES.map((k) => `<button type="button" data-ink-shape="${k}" class="ink-kind${cfg.shape.kind === k ? ' active' : ''}" title="${esc(tr(MM.DRAW_KINDS[k]))}">${shapeIcon(k)}</button>`).join('') +
        '<span class="ink-sep"></span>' +
        toggle('data-ink-dash', cfg.shape.dash, '┄', 'Dashed', 'Dashed line') +
        (MM.isLineKind(cfg.shape.kind) ? '' : toggle('data-ink-fill', cfg.shape.fill, '◧', 'Filled', 'Filled, see-through in the colour of the line'));
    } else if (tool === 'pen') {
      extra = toggle('data-ink-recognize', cfg.recognize, '✨', 'Shapes', cfg.recognize
        ? 'Recognise shapes is on: hold the pen still a moment at the end of a stroke - a line, circle, rectangle, triangle or diamond becomes a clean shape. Tap to switch it off'
        : 'Recognise shapes is off. Tap to switch it on: hold the pen still at the end of a stroke and it becomes a clean shape');
    } else if (tool === 'lasso') {
      const n = S.selection.size;
      extra = `<button type="button" data-ink-delete ${n ? '' : 'disabled'} title="${esc(tr('Delete what the lasso caught (Del)'))}">🗑<span>${esc(tr('Delete'))}</span></button>`;
    }
    palette.classList.toggle('compact', tool === 'shape'); // many buttons: the tools without their names
    palette.innerHTML =
      // first: on a phone the palette scrolls sideways, this one must be in sight
      // touch screens: draw with a finger (one finger writes, two move and zoom)
      (navigator.maxTouchPoints > 0
        ? `<button type="button" data-ink-finger class="${cfg.finger ? 'active' : ''}" title="${esc(tr(cfg.finger
          ? 'One finger draws, two fingers move and zoom the map. Tap: fingers move the map again, only the stylus draws'
          : 'Draw with a finger: one finger draws, two fingers move and zoom the map'))}">☝️<span>${esc(tr('Finger'))}</span></button><span class="ink-sep"></span>`
        : '') +
      TOOLS.map(([k, icon, label]) => `<button type="button" data-ink-tool="${k}" class="${tool === k ? 'active' : ''}" title="${esc(tr(label))}">${k === 'shape' ? shapeIcon(cfg.shape.kind) : icon}<span>${esc(tr(label))}</span></button>`).join('') +
      (extra ? '<span class="ink-sep"></span>' + extra : '') +
      (plain && tool === 'lasso' ? '' : '<span class="ink-sep"></span>') +
      colors.map((c) => `<button type="button" class="ink-color${c === cur ? ' active' : ''}" data-ink-color="${c}" style="--c:${c}" title="${c}"></button>`).join('') +
      (plain ? '' : `<label class="ink-color ink-own${colors.includes(cur) ? '' : ' active'}" title="${esc(tr('Own colour'))}" style="--c:${esc(cur)}"><input type="color" value="${esc(cur)}" data-ink-own></label>`) +
      (widths.length && !plain ? '<span class="ink-sep"></span>' : '') +
      widths.map((w, i) => `<button type="button" class="ink-width${cfg[tool].width === w ? ' active' : ''}" data-ink-width="${w}" title="${esc(tr(tool === 'text' ? ['Small', 'Medium', 'Large'][i] : ['Thin', 'Medium', 'Thick'][i]))}">` +
        (tool === 'text' ? `<b style="font-size:${11 + i * 4}px">A</b>` : `<i style="--w:${Math.min(22, tool === 'eraser' ? w / 1.6 : tool === 'marker' ? w / 1.5 : w * 1.6)}px"></i>`) + '</button>').join('') +
      // shapes and texts: snap to the grid of the map (the same as "Snap to grid")
      (tool === 'shape' || tool === 'text'
        ? `<span class="ink-sep"></span><button type="button" data-ink-grid class="${S.settings.grid ? 'active' : ''}" title="${esc(tr('Snap to the grid (the grid of the map - notes snap to it as well)'))}">▦<span>${esc(tr('Grid'))}</span></button>`
        : '') +
      '<span class="ink-sep"></span>' +
      `<button type="button" data-ink-close title="${esc(tr('End freehand (P / Esc)'))}">✕</button>`;
    const own = palette.querySelector('[data-ink-own]');
    if (own) {
      own.addEventListener('input', () => setCfg({ color: own.value }, false));
      own.addEventListener('change', () => setCfg({ color: own.value }));
    }
    // just below the toolbar (its height differs: narrow window, phone)
    const bar = document.getElementById('toolbar');
    palette.style.top = (bar ? bar.getBoundingClientRect().bottom : 44) + 8 + 'px';
    palette.hidden = false;
  }

  function setCfg(change, redraw) {
    const cfg = K.cfg();
    if (change.tool) {
      cfg.tool = change.tool;
      if (live) live.style.display = 'none'; // no snap circle of the line tool left over
      if (change.tool === 'shape' && MM.isLineKind(cfg.shape.kind)) MM.ui.flash(MM.tr('📏 Drag to draw a line - its ends snap to the ends of other lines. Shift: steps of 45°, Ctrl: no snapping'));
      if (change.tool === 'shape' && !MM.isLineKind(cfg.shape.kind)) MM.ui.flash(MM.tr('Drag to draw the shape - Shift: square / circle'));
      if (change.tool === 'lasso') MM.ui.flash(MM.tr('◌ Draw a loop around what you want to move, resize or delete'));
      if (change.tool !== 'lasso' && S.selection.size) { // what the lasso caught is let go
        MM.select([]);
        MM.refresh();
      }
      if (change.tool === 'text') MM.ui.flash(MM.tr('T Tap where the text should go'));
    }
    else Object.assign(cfg[cfg.tool], change);
    S.settings.pen = cfg;
    MM.saveSettings();
    if (redraw !== false) renderPalette();
  }

  function onPalette(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.inkTool) setCfg({ tool: b.dataset.inkTool });
    else if (b.dataset.inkColor) setCfg({ color: b.dataset.inkColor });
    else if (b.dataset.inkWidth) setCfg({ width: Number(b.dataset.inkWidth) });
    else if (b.hasAttribute('data-ink-grid')) {
      MM.actions.toggleGrid();
      renderPalette();
      MM.ui.flash(MM.tr(S.settings.grid ? '▦ Lines and texts snap to the grid' : '▦ Grid off - lines still snap to the ends of other lines'));
    } else if (b.hasAttribute('data-ink-finger')) {
      const cfg = K.cfg();
      cfg.finger = !cfg.finger;
      S.settings.pen = cfg;
      MM.saveSettings();
      renderPalette();
      MM.ui.flash(MM.tr(cfg.finger ? '☝️ One finger draws - two fingers move and zoom' : '☝️ Fingers move the map again - the stylus draws'));
    } else if (b.dataset.inkShape) {
      setCfg({ kind: b.dataset.inkShape });
    } else if (b.hasAttribute('data-ink-dash')) {
      setCfg({ dash: !K.cfg().shape.dash });
    } else if (b.hasAttribute('data-ink-fill')) {
      setCfg({ fill: !K.cfg().shape.fill });
    } else if (b.hasAttribute('data-ink-recognize')) {
      const cfg = K.cfg();
      cfg.recognize = !cfg.recognize;
      S.settings.pen = cfg;
      MM.saveSettings();
      renderPalette();
      MM.ui.flash(MM.tr(cfg.recognize
        ? '✨ Recognise shapes on: hold the pen still a moment at the end of a stroke'
        : '✨ Recognise shapes off: strokes stay as you write them'));
    } else if (b.hasAttribute('data-ink-delete')) {
      if (S.selection.size) MM.actions.deleteSelection();
      renderPalette();
    } else if (b.hasAttribute('data-ink-close')) K.toggle(false);
  }

  K.refreshPalette = () => renderPalette(); // e.g. after the language changed
})(window.MM);
