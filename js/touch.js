'use strict';
/*
 * Touch (phones, tablets): finger gestures on the canvas, translated into what
 * the mouse does in interaction.js. Mouse and pen are not handled here - only
 * pointerType 'touch'.
 *
 *   one finger, moved          pan the map (on a note as well - no accidental moves)
 *   tap                        like a click: select, tick a box, open a chip menu, deselect
 *   double tap                 edit the text
 *   hold (~0.45 s)             context menu - or keep holding and move: drag the note
 *                              (on the empty canvas: draw a selection frame)
 *   handles, anchor dots,      as with the mouse (resize, connect, draw tools)
 *   drawing tools
 *   two fingers                pinch = zoom around the fingers, move = pan;
 *                              on the selected image: turn and resize it
 */
(function (MM) {
  const S = MM.state;
  const T = (MM.touch = {});
  const HOLD = 450, SLOP = 10, DOUBLE = 320; // ms, px, ms

  let vp = null;
  const touches = new Map(); // pointerId -> { x, y }
  let mode = null;           // null | pending | held | pan | drag | direct | pinch | rest
  let start = null;          // the first finger: { e (pointerdown), x, y, timer }
  let pan = null, pinch = null, twist = null, lastTap = null;
  let quietUntil = 0;        // the browser's own contextmenu / dblclick after a gesture are ignored

  const I = () => MM.interaction;
  const stop = (e) => e.stopImmediatePropagation();
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pts = () => [...touches.values()];

  T.init = function () {
    vp = document.getElementById('viewport');
    // capture phase: before the mouse handlers of interaction.js on the same element
    vp.addEventListener('pointerdown', down, true);
    vp.addEventListener('pointermove', move, true);
    vp.addEventListener('pointerup', up, true);
    vp.addEventListener('pointercancel', cancel, true);
    const quiet = (e) => {
      if (touches.size || Date.now() < quietUntil) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    vp.addEventListener('contextmenu', quiet, true);
    vp.addEventListener('dblclick', quiet, true);
  };

  /** Does this finger act exactly like the mouse? (handles, anchor dots, drawing tools, text being edited) */
  function direct(t) {
    if (MM.editing && MM.editing.el.contains(t)) return true;
    if (S.tool || t.classList.contains('label-editor') || t.classList.contains('anchor-dot')) return true;
    return !!(t.closest && t.closest('.handle-resize, .handle-endpoint, .handle-rotate'));
  }

  function down(e) {
    if (e.pointerType !== 'touch') return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      startPinch();
      stop(e);
      return;
    }
    if (touches.size > 2 || mode === 'pinch' || mode === 'rest') {
      stop(e);
      return;
    }
    if (direct(e.target)) {
      mode = 'direct'; // interaction.js gets the event as it is
      start = { e, x: e.clientX, y: e.clientY, timer: 0 }; // to end its drag if a 2nd finger comes
      return;
    }
    stop(e);
    try { vp.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    start = { e, x: e.clientX, y: e.clientY, timer: setTimeout(held, HOLD) };
    mode = 'pending';
  }

  /** The finger stayed still long enough: the note is "picked up" (menu on release, drag on move). */
  function held() {
    if (mode !== 'pending') return;
    mode = 'held';
    if (navigator.vibrate) navigator.vibrate(12);
    const nodeEl = start.e.target.closest && start.e.target.closest('.node');
    if (nodeEl && !S.selection.has(nodeEl.dataset.id)) {
      MM.select([nodeEl.dataset.id]);
      MM.refresh();
    }
  }

  function move(e) {
    if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'direct' || mode === 'drag') return; // interaction.js moves it
    stop(e);
    const p = { x: e.clientX, y: e.clientY };
    if (mode === 'pinch') return doPinch();
    if (mode === 'twist') return doTwist();
    if (mode === 'pending' && dist(p, start) > SLOP) {
      clearTimeout(start.timer);
      mode = 'pan';
      pan = { x: start.x, y: start.y };
    }
    if (mode === 'held' && dist(p, start) > SLOP) {
      // picked up and moved: drag the note (or a selection frame on the empty canvas)
      mode = 'drag';
      I().pointerDown(start.e);
      I().pointerMove(e);
      return;
    }
    if (mode === 'pan') {
      S.doc.view.x += p.x - pan.x;
      S.doc.view.y += p.y - pan.y;
      pan = p;
      MM.render.applyView();
    }
  }

  function up(e) {
    if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
    touches.delete(e.pointerId);
    if (mode === 'direct' || mode === 'drag') {
      if (!touches.size) {
        mode = null; // interaction.js finishes it
        start = null;
      }
      return;
    }
    stop(e);
    if (start) clearTimeout(start.timer);
    if (mode === 'twist') {
      MM.commit(); // the image was turned / resized
      twist = null;
      mode = touches.size ? 'rest' : null;
      return;
    }
    if (mode === 'pinch' || mode === 'rest') {
      if (touches.size === 1) mode = 'rest'; // the other finger is still down: it does nothing more
      else if (!touches.size) {
        mode = null;
        MM.refresh();
        MM.storage.scheduleAutosave();
      }
      return;
    }
    if (mode === 'pending') tap(start.e, e);
    else if (mode === 'held') {
      // held without moving: the context menu (as a right click there)
      quietUntil = Date.now() + 700;
      const t = document.elementFromPoint(start.x, start.y) || start.e.target;
      MM.menu.openFor({ target: t, clientX: start.x, clientY: start.y, preventDefault() {} });
    } else if (mode === 'pan') {
      MM.storage.scheduleAutosave();
    }
    mode = null;
    start = null;
  }

  function cancel(e) {
    if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
    touches.delete(e.pointerId);
    if (start) clearTimeout(start.timer);
    if (mode === 'direct' || mode === 'drag') {
      if (!touches.size) mode = null;
      return; // interaction.js treats pointercancel like pointerup
    }
    stop(e);
    if (mode === 'twist') {
      MM.commit(); // keep what was turned so far (one undo step)
      twist = null;
      mode = touches.size ? 'rest' : null;
    }
    if (!touches.size) {
      mode = null;
      start = null;
    }
  }

  /** A short tap: a click - or the second tap of a double tap: edit. */
  function tap(downE, upE) {
    const now = Date.now(), p = { x: upE.clientX, y: upE.clientY };
    if (lastTap && now - lastTap.time < DOUBLE && dist(p, lastTap) < 30) {
      lastTap = null;
      quietUntil = now + 500; // the browser may send its own dblclick as well
      const t = document.elementFromPoint(p.x, p.y) || downE.target;
      I().doubleClick({ target: t, clientX: p.x, clientY: p.y });
      return;
    }
    lastTap = { time: now, x: p.x, y: p.y };
    I().pointerDown(downE);
    I().pointerUp(upE);
  }

  // ---- Two fingers: zoom and pan -------------------------------------------------

  function startPinch() {
    if (start) clearTimeout(start.timer);
    // two fingers on the selected image (the first one on it): turn and resize the image
    const img = start && imageAt(start.e.target);
    if (img && mode !== 'drag' && mode !== 'direct') {
      const [a, b] = pts();
      twist = { id: img.id, a0: Math.atan2(b.y - a.y, b.x - a.x), d0: Math.max(dist(a, b), 1),
        orig: { rotate: img.rotate || 0, x: img.x, y: img.y, w: img.w, h: img.h } };
      mode = 'twist';
      start = null;
      return;
    }
    // a drag of the first finger ends where it is
    if ((mode === 'drag' || mode === 'direct') && S.drag && start) I().pointerUp(start.e);
    const [a, b] = pts();
    const r = vp.getBoundingClientRect(), v = S.doc.view;
    const mid = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
    pinch = { d0: Math.max(dist(a, b), 1), zoom0: v.zoom, wx: (mid.x - v.x) / v.zoom, wy: (mid.y - v.y) / v.zoom };
    mode = 'pinch';
    start = null;
  }

  /** The selected image note under element t (only when it is the one selected note). */
  function imageAt(t) {
    const el = t && t.closest && t.closest('.node');
    const n = el && MM.node(el.dataset.id);
    return n && n.type === 'image' && S.selection.size === 1 && S.selection.has(n.id) ? n : null;
  }

  function doTwist() {
    const [a, b] = pts();
    const n = a && b && MM.node(twist.id);
    if (!n) return;
    const o = twist.orig;
    const turn = ((Math.atan2(b.y - a.y, b.x - a.x) - twist.a0) * 180) / Math.PI;
    n.rotate = MM.snapAngle(o.rotate + turn);
    // resize around the middle, keeping the proportions
    const f = dist(a, b) / twist.d0;
    const w = Math.max(20, o.w * f), h = Math.max(20, (o.h * w) / o.w);
    Object.assign(n, { x: Math.round(o.x + (o.w - w) / 2), y: Math.round(o.y + (o.h - h) / 2), w: Math.round(w), h: Math.round(h) });
    MM.render.nodes();
    MM.render.edges();
    MM.render.overlay();
  }

  function doPinch() {
    const [a, b] = pts();
    if (!a || !b) return;
    const r = vp.getBoundingClientRect(), v = S.doc.view;
    const mid = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
    const zoom = MM.geo.clamp(pinch.zoom0 * dist(a, b) / pinch.d0, 0.1, 4);
    // the point of the map that was between the fingers stays between them
    v.zoom = zoom;
    v.x = mid.x - pinch.wx * zoom;
    v.y = mid.y - pinch.wy * zoom;
    MM.render.applyView();
  }
})(window.MM);
