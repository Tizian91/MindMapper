'use strict';
/*
 * Freehand (pen mode): handwriting and sketches with a stylus - or the mouse - on the map.
 * "✍ Pen" in the toolbar (or P) switches it on and it stays on until switched off (button,
 * P or Esc). A small palette shows pen / marker / eraser, colours and widths. Fingers keep
 * moving and zooming the map (touch.js); while the stylus is near the screen, touches are
 * ignored, so the hand can rest on it.
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
  K.WIDTHS = { pen: [1.5, 3, 6], marker: [12, 20, 32], eraser: [8, 18, 36] };
  const DEFAULTS = {
    tool: 'pen',
    pen: { color: K.PEN_COLORS[0], width: 3 },
    marker: { color: K.MARKER_COLORS[0], width: 20 },
    eraser: { width: 18 }, // radius on screen
  };

  /** Settings of the palette (kept in the browser), completed with the defaults. */
  K.cfg = function () {
    const c = S.settings.pen && typeof S.settings.pen === 'object' ? S.settings.pen : {};
    const out = {
      tool: ['pen', 'marker', 'eraser'].includes(c.tool) ? c.tool : DEFAULTS.tool,
      pen: Object.assign({}, DEFAULTS.pen, c.pen),
      marker: Object.assign({}, DEFAULTS.marker, c.marker),
      eraser: Object.assign({}, DEFAULTS.eraser, c.eraser),
    };
    S.settings.pen = out;
    return out;
  };

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
      if (n.type !== 'draw' || n.draw !== 'ink' || (MM.meta && MM.meta.isHidden && MM.meta.isHidden(n))) continue;
      const half = (Number(n.style.strokeWidth) || 0) / 2;
      if (p.x < n.x - r || p.x > n.x + n.w + r || p.y < n.y - r || p.y > n.y + n.h + r) continue;
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
    if (!K.on() || e.pointerType === 'touch' || active) return;
    if (vp.classList.contains('space-pan')) return; // Space + drag pans the map
    const autoErase = erasing(e);
    if (e.button !== 0 && !autoErase) return; // right / middle mouse button as usual
    e.preventDefault();
    e.stopImmediatePropagation();
    if (MM.editing) MM.edit.finish();
    if (MM.menu && MM.menu.isOpen()) MM.menu.close();
    if (MM.touch && MM.touch.reset) MM.touch.reset(); // a hand that touched first does not pan on
    try { vp.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    const cfg = K.cfg();
    const tool = autoErase ? 'eraser' : cfg.tool;
    active = {
      id: e.pointerId, type: e.pointerType, tool, pts: [], erased: false,
      color: tool === 'pen' || tool === 'marker' ? cfg[tool].color : null,
      width: cfg[tool].width,
      under: null,
    };
    if (tool !== 'eraser') {
      const p = MM.interaction.toWorld(e.clientX, e.clientY);
      // anchored to the note / image it starts on (Alt: free), as a drawing
      active.under = e.altKey ? null : MM.interaction.nodeAt(p);
    }
    vp.classList.toggle('erasing', tool === 'eraser');
    addEvents([e]);
  }

  function move(e) {
    if (e.pointerType === 'pen') penSeen = Date.now();
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    addEvents(e.getCoalescedEvents ? e.getCoalescedEvents() : [e]);
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
    for (const ev of list) {
      const p = MM.interaction.toWorld(ev.clientX, ev.clientY);
      if (active.tool === 'eraser') {
        erase(p, (active.width / 2) / zoom);
        continue;
      }
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
      }
    }
    if (active.tool !== 'eraser') drawLive();
  }

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
      if (!live) {
        live = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        live.setAttribute('class', 'ink-live');
        live.setAttribute('width', 1);
        live.setAttribute('height', 1);
        live.append(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
        document.getElementById('ui-layer').append(live);
      }
      live.style.display = '';
      live.style.opacity = active.tool === 'marker' ? 0.4 : 1;
      const path = live.firstElementChild;
      path.setAttribute('fill', active.color);
      path.setAttribute('d', K.outline(active.pts, active.width, active.tool === 'marker'));
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
    if (!a.pts.length) return;
    const zoom = S.doc.view.zoom || 1;
    K.add(K.simplify(a.pts, 0.35 / zoom), { tool: a.tool, color: a.color, width: a.width, under: a.under });
    MM.commit();
  }

  // ---- Palette ---------------------------------------------------------------------------

  const TOOLS = [['pen', '✏️', 'Pen'], ['marker', '🖍️', 'Marker'], ['eraser', '🧽', 'Eraser']];

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
    const colors = tool === 'pen' ? K.PEN_COLORS : tool === 'marker' ? K.MARKER_COLORS : [];
    const cur = tool === 'eraser' ? null : cfg[tool].color;
    const widths = K.WIDTHS[tool];
    palette.innerHTML =
      TOOLS.map(([k, icon, label]) => `<button type="button" data-ink-tool="${k}" class="${tool === k ? 'active' : ''}" title="${esc(tr(label))}">${icon}<span>${esc(tr(label))}</span></button>`).join('') +
      '<span class="ink-sep"></span>' +
      colors.map((c) => `<button type="button" class="ink-color${c === cur ? ' active' : ''}" data-ink-color="${c}" style="--c:${c}" title="${c}"></button>`).join('') +
      (tool === 'eraser' ? '' : `<label class="ink-color ink-own${colors.includes(cur) ? '' : ' active'}" title="${esc(tr('Own colour'))}" style="--c:${esc(cur)}"><input type="color" value="${esc(cur)}" data-ink-own></label>`) +
      '<span class="ink-sep"></span>' +
      widths.map((w, i) => `<button type="button" class="ink-width${cfg[tool].width === w ? ' active' : ''}" data-ink-width="${w}" title="${esc(tr(['Thin', 'Medium', 'Thick'][i]))}"><i style="--w:${Math.min(22, tool === 'eraser' ? w / 1.6 : tool === 'marker' ? w / 1.5 : w * 1.6)}px"></i></button>`).join('') +
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
    if (change.tool) cfg.tool = change.tool;
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
    else if (b.hasAttribute('data-ink-close')) K.toggle(false);
  }

  K.refreshPalette = () => renderPalette(); // e.g. after the language changed
})(window.MM);
