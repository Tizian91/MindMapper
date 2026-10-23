'use strict';
/*
 * Pointer and keyboard handling.
 *
 * A drag is described by MM.state.drag = { mode, ... } with modes:
 *   move      - moving the selected notes (with snapping)
 *   resize    - resizing one note via a handle
 *   connect   - dragging a new connection out of an anchor point
 *   endpoint  - dragging an end of an existing connection
 *   pan       - moving the view (middle mouse or Space + drag)
 *   rubber    - rubber-band selection on empty canvas
 */
(function (MM) {
  const S = MM.state;
  const I = (MM.interaction = {});
  let vp, band;
  let spaceDown = false;

  const MIN_W = 40, MIN_H = 28;

  /** Screen (client) coordinates -> world coordinates. */
  I.toWorld = function (clientX, clientY) {
    const r = vp.getBoundingClientRect(), v = S.doc.view;
    return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
  };

  /**
   * Topmost visible note at a world point (optionally with padding; optionally ignoring overlays).
   * Drawings never count: they are only hit on their line (in the DOM).
   */
  I.nodeAt = function (p, pad = 0, noOverlay = false) {
    const nodes = Object.values(S.doc.nodes);
    // groups lie behind the other notes, so they only count if no note is hit
    for (const groups of [false, true]) {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if ((n.type === 'group') !== groups || n.type === 'draw') continue;
        if (MM.meta.isHidden(n) || (noOverlay && n.overlay)) continue;
        if (MM.geo.contains(n, p, pad)) return n;
      }
    }
    return null;
  };

  /**
   * Notes lying completely inside a group note. Drawings are no members: an
   * anchored one follows its note anyway, a free one only moves when selected.
   */
  I.groupMembers = function (g) {
    return Object.values(S.doc.nodes).filter((n) => n.id !== g.id && !n.overlay && n.type !== 'draw' &&
      n.x >= g.x && n.y >= g.y && n.x + n.w <= g.x + g.w && n.y + n.h <= g.y + g.h);
  };

  /** Where a dragged connection end would attach: nearby anchor, note body, or nothing. */
  function dropTarget(p, excludeNodeId) {
    const k = 1 / S.doc.view.zoom;
    const n = I.nodeAt(p, 12 * k, true);
    if (!n || n.id === excludeNodeId) return null;
    let bestA = null, bestD = 14 * k;
    for (const a of Object.values(MM.geo.anchors(n))) {
      const d = MM.geo.dist(a, p);
      if (d < bestD) {
        bestD = d;
        bestA = a.id;
      }
    }
    if (bestA) return { node: n.id, anchor: bestA };
    if (MM.geo.contains(n, p)) return { node: n.id, anchor: 'auto' };
    return null;
  }

  I.init = function () {
    vp = document.getElementById('viewport');
    band = document.getElementById('rubber-band');
    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('pointermove', onPointerMove);
    vp.addEventListener('pointerup', onPointerUp);
    vp.addEventListener('pointercancel', onPointerUp);
    vp.addEventListener('pointerleave', () => {
      if (!S.drag && S.hover) {
        S.hover = null;
        MM.render.overlay();
      }
    });
    // We manage focus ourselves: stop the browser from moving focus to the
    // canvas on mouse down, which would end a text edit we just started.
    vp.addEventListener('mousedown', (e) => {
      const t = e.target;
      if ((MM.editing && MM.editing.el.contains(t)) || t.closest('input, textarea, select')) return;
      e.preventDefault();
    });
    vp.addEventListener('dblclick', onDoubleClick);
    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Ctrl+V: images from the system clipboard, otherwise files, otherwise copied notes
    window.addEventListener('paste', (e) => {
      if (isTyping(e)) return;
      const images = MM.images.filesFrom(e.clipboardData);
      const files = MM.files.filesFrom(e.clipboardData);
      if (!images.length && !files.length) {
        e.preventDefault();
        MM.actions.paste();
        return;
      }
      e.preventDefault();
      const at = I.lastPoint || MM.viewCenter();
      if (images.length) MM.images.insertFiles(images, at);
      if (files.length) MM.files.insertFiles(files, at);
    });

    // drag & drop files: images become image notes, everything else data notes
    vp.addEventListener('dragover', (e) => {
      if ([...e.dataTransfer.types].includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    vp.addEventListener('drop', (e) => {
      e.preventDefault();
      const at = I.toWorld(e.clientX, e.clientY);
      insertDropped(e.dataTransfer, at);
    });

    // Never let the browser navigate to a dropped file, not even when the drop
    // misses the canvas (toolbar, panel, status bar) - that looked like "nothing happened".
    window.addEventListener('dragover', (e) => {
      if ([...((e.dataTransfer && e.dataTransfer.types) || [])].includes('Files')) e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      if (![...((e.dataTransfer && e.dataTransfer.types) || [])].includes('Files')) return;
      e.preventDefault();
      if (vp.contains(e.target)) return; // the canvas handler already took it
      insertDropped(e.dataTransfer, MM.viewCenter());
    });
  };

  /** Turn dropped files into image / data notes at world point `at`. */
  function insertDropped(dt, at) {
    const all = [...((dt && dt.files) || [])];
    if (!all.length) return;
    const images = all.filter((f) => f.type && f.type.startsWith('image/'));
    const data = all.filter((f) => MM.files.isDataFile(f));
    if (images.length) MM.images.insertFiles(images, at);
    if (data.length) MM.files.insertFiles(data, at);
  }

  // ---- Pointer down ----------------------------------------------------------

  function onPointerDown(e) {
    const t = e.target;
    // clicks inside the text being edited behave like a normal text field
    if (MM.editing && MM.editing.el.contains(t)) return;
    if (t.classList.contains('label-editor')) return;
    MM.edit.finish();
    MM.edit.finishLabel();
    vp.focus({ preventScroll: true });

    const p = I.toWorld(e.clientX, e.clientY);

    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      startDrag(e, { mode: 'pan', lastX: e.clientX, lastY: e.clientY });
      vp.classList.add('panning');
      return;
    }
    if (e.button !== 0) return;

    // drawing tool chosen: the drag draws a shape, also across notes and images
    if (S.tool && !t.classList.contains('handle-resize')) {
      startDrag(e, { mode: 'draw', kind: S.tool, start: p, id: null, free: e.altKey });
      return;
    }

    // resize handle
    if (t.classList.contains('handle-resize')) {
      const n = MM.selectedNodes()[0];
      startDrag(e, { mode: 'resize', id: n.id, dir: t.dataset.dir, start: p, orig: { x: n.x, y: n.y, w: n.w, h: n.h } });
      return;
    }

    // end of a selected connection
    if (t.classList.contains('handle-endpoint')) {
      const edge = MM.edge(t.dataset.edge);
      startDrag(e, { mode: 'endpoint', edgeId: edge.id, end: t.dataset.end, orig: MM.clone(edge[t.dataset.end]), target: null, moved: false, start: p });
      return;
    }

    // anchor point -> new connection
    if (t.classList.contains('anchor-dot')) {
      startDrag(e, {
        mode: 'connect',
        source: { node: t.dataset.node, anchor: t.dataset.anchor },
        start: p, point: p, target: null, moved: false,
      });
      return;
    }

    const nodeEl = t.closest('.node');
    if (nodeEl) {
      const id = nodeEl.dataset.id;
      const n = MM.node(id);

      // delete button of a task note: delete just this note, like Del
      if (t.closest('.node-delbtn')) {
        MM.select([id]);
        MM.actions.deleteSelection();
        return;
      }

      // "→ <map>" badge of a moved note: open the map the note went to
      if (n.movedTo && t.closest('.node-movedbadge')) {
        MM.project.openLinked(n.movedTo);
        return;
      }
      // file note: the icon, the ↗ button or Ctrl+click opens the attached file
      if (n.type === 'file' && (t.closest('.file-icon') || t.closest('.node-linkbtn') || e.ctrlKey)) {
        MM.files.open(n);
        return;
      }
      // diary entry: ↗ or Ctrl+click opens its page in the diary
      if (n.type === 'diary' && n.diary.book && (t.closest('.node-linkbtn') || e.ctrlKey)) {
        MM.diary.open(n.diary.book, { date: n.diary.date, entry: n.id });
        return;
      }
      // ↗ button or Ctrl+click: follow the note's link
      if (n.link && (t.closest('.node-linkbtn') || e.ctrlKey)) {
        MM.links.open(n.link);
        return;
      }

      const chip = t.closest('.task-meta .chip[data-meta]');
      // metadata chip of a task: drop-down with the values right at the chip
      if (chip) {
        const rect = chip.getBoundingClientRect();
        MM.select([id]);
        MM.refresh();
        MM.menu.openMeta(n, chip.dataset.meta, rect);
        return;
      }

      // to-do checkbox / add item
      if (t.classList.contains('todo-check')) {
        const it = n.items.find((i) => i.id === t.closest('li').dataset.item);
        if (it) it.done = !it.done;
        MM.commit();
        return;
      }
      // outline: collapse/expand, add block
      if (t.classList.contains('outline-toggle') || t.classList.contains('outline-bullet')) {
        const li = t.closest('li');
        const b = n.blocks.find((x) => x.id === li.dataset.block);
        if (b && li.classList.contains('has-children')) {
          b.collapsed = !b.collapsed;
          MM.commit();
          return;
        }
      }
      if (t.classList.contains('outline-add')) {
        const last = n.blocks[n.blocks.length - 1];
        const block = MM.createBlock('', 0);
        n.blocks.push(block);
        if (last && last.collapsed) last.collapsed = false;
        MM.select([id]);
        MM.refresh();
        MM.edit.start(id, 'block', block.id);
        return;
      }
      if (t.classList.contains('todo-add')) {
        const item = MM.createTodoItem('');
        n.items.push(item);
        MM.select([id]);
        MM.refresh();
        MM.edit.start(id, 'item', item.id);
        return;
      }

      let deselectOnClick = false;
      if (e.shiftKey || e.ctrlKey) {
        if (S.selection.has(id)) deselectOnClick = true;
        else S.selection.add(id);
      } else if (!S.selection.has(id)) {
        MM.select([id]);
      }
      startMove(e, p, { clickedId: id, deselectOnClick });
      MM.refresh();
      return;
    }

    // connection line or label
    const edgeEl = t.closest('.edge') || t.closest('.edge-label');
    if (edgeEl) {
      const id = edgeEl.dataset.id;
      if (e.shiftKey || e.ctrlKey) {
        if (S.selection.has(id)) S.selection.delete(id);
        else S.selection.add(id);
      } else {
        MM.select([id]);
      }
      MM.refresh();
      return;
    }

    // empty canvas -> rubber band
    if (!e.shiftKey && !e.ctrlKey) MM.select([]);
    startDrag(e, { mode: 'rubber', start: p, additive: e.shiftKey || e.ctrlKey, base: new Set(S.selection) });
    MM.refresh();
  }

  function startDrag(e, drag) {
    S.drag = drag;
    try {
      vp.setPointerCapture(e.pointerId);
    } catch (err) {
      /* synthetic or already released pointer */
    }
  }

  function startMove(e, p, extra) {
    const orig = new Map();
    for (const n of MM.selectedNodes()) {
      orig.set(n.id, { x: n.x, y: n.y });
      // a group carries the notes inside it
      if (n.type === 'group') {
        for (const m of I.groupMembers(n)) if (!orig.has(m.id)) orig.set(m.id, { x: m.x, y: m.y });
      }
    }
    // with Ctrl held while dragging, everything below goes along (arrows, group contents, anchored drawings)
    const sub = new Map();
    for (const id of MM.transfer.bundles(S.doc, [...orig.keys()], { group: false }).flat()) {
      const n = MM.node(id);
      if (!orig.has(id) && !n.movedTo) sub.set(id, { x: n.x, y: n.y });
    }
    // free ends of selected connections move along
    const freeEnds = [];
    for (const edge of MM.selectedEdges()) {
      for (const end of ['source', 'target']) {
        if (!edge[end].node) freeEnds.push({ end: edge[end], x: edge[end].x, y: edge[end].y });
      }
    }
    startDrag(e, Object.assign({ mode: 'move', start: p, orig, sub, freeEnds, moved: false }, extra));
  }

  // ---- Pointer move ----------------------------------------------------------

  function onPointerMove(e) {
    const drag = S.drag;
    const p = I.toWorld(e.clientX, e.clientY);
    I.lastPoint = p; // paste position for images

    if (!drag) {
      updateHover(e, p);
      return;
    }

    switch (drag.mode) {
      case 'pan': {
        S.doc.view.x += e.clientX - drag.lastX;
        S.doc.view.y += e.clientY - drag.lastY;
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        MM.render.applyView();
        break;
      }
      case 'move': doMove(e, p); break;
      case 'resize': doResize(e, p); break;
      case 'draw': {
        if (!drag.id) {
          if (MM.geo.dist(p, drag.start) * S.doc.view.zoom < 4) return;
          drag.id = MM.draw.create(drag.kind, drag.start, p, e.shiftKey).id;
        } else {
          MM.draw.resizeTo(MM.node(drag.id), drag.start, p, e.shiftKey);
        }
        MM.render.nodes();
        break;
      }
      case 'connect': {
        drag.point = p;
        if (!drag.moved && MM.geo.dist(p, drag.start) * S.doc.view.zoom < 4) return;
        drag.moved = true;
        drag.target = dropTarget(p, null);
        MM.render.overlay();
        break;
      }
      case 'endpoint': {
        const edge = MM.edge(drag.edgeId);
        if (!drag.moved && MM.geo.dist(p, drag.start) * S.doc.view.zoom < 3) return;
        drag.moved = true;
        drag.target = e.altKey ? null : dropTarget(p, null);
        edge[drag.end] = drag.target ? Object.assign({}, drag.target) : { x: p.x, y: p.y };
        MM.render.edges();
        MM.render.overlay();
        break;
      }
      case 'rubber': {
        drag.current = p;
        const v = S.doc.view;
        const x1 = Math.min(drag.start.x, p.x), y1 = Math.min(drag.start.y, p.y);
        const x2 = Math.max(drag.start.x, p.x), y2 = Math.max(drag.start.y, p.y);
        Object.assign(band.style, {
          left: x1 * v.zoom + v.x + 'px', top: y1 * v.zoom + v.y + 'px',
          width: (x2 - x1) * v.zoom + 'px', height: (y2 - y1) * v.zoom + 'px',
        });
        band.hidden = false;
        break;
      }
    }
  }

  function updateHover(e, p) {
    const t = e.target;
    let id = null;
    if (t.classList && t.classList.contains('anchor-dot')) id = t.dataset.node;
    else if (t.closest && t.closest('.node')) id = t.closest('.node').dataset.id;
    else {
      const n = I.nodeAt(p, 14 / S.doc.view.zoom);
      if (n && !(t.closest && (t.closest('.edge') || t.closest('.handle-resize')))) id = n.id;
      if (t.classList && (t.classList.contains('handle-resize') || t.classList.contains('handle-endpoint'))) id = null;
    }
    // overlays (images on top of everything) and drawings have no anchor points
    if (id && MM.node(id) && (MM.node(id).overlay || MM.node(id).type === 'draw')) id = null;
    if (id !== S.hover) {
      S.hover = id;
      MM.render.overlay();
    }
  }

  function doMove(e, p) {
    const drag = S.drag;
    let dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) * S.doc.view.zoom < 3) return;
    drag.moved = true;

    // Ctrl (Cmd) can be pressed or released during the drag: the sub-notes join or jump back
    const withSub = (e.ctrlKey || e.metaKey) && drag.sub.size > 0;
    for (const [id, o] of drag.sub) {
      const n = MM.node(id);
      if (n && !withSub) Object.assign(n, o);
    }
    const moving = withSub ? new Map([...drag.orig, ...drag.sub]) : drag.orig;
    if (withSub !== !!drag.withSub) {
      drag.withSub = withSub;
      if (withSub) MM.ui.flash(MM.tr('Moving with {n} sub-note(s)', { n: drag.sub.size }));
    }

    const ids = new Set(moving.keys());
    if (ids.size && !e.altKey) {
      const boxes = [...moving].map(([id, o]) => {
        const n = MM.node(id);
        return { x: o.x + dx, y: o.y + dy, w: n.w, h: n.h };
      });
      const snap = MM.snap.move(MM.geo.bbox(boxes), ids);
      dx += snap.dx;
      dy += snap.dy;
      S.guides = snap.guides;
    } else {
      S.guides = [];
    }
    for (const [id, o] of moving) {
      const n = MM.node(id);
      n.x = Math.round((o.x + dx) * 100) / 100;
      n.y = Math.round((o.y + dy) * 100) / 100;
    }
    for (const f of drag.freeEnds) {
      f.end.x = f.x + dx;
      f.end.y = f.y + dy;
    }
    // drawings anchored to a moved note go along (the dragged ones keep their place on it)
    MM.draw.follow(S.doc, ids);
    MM.render.nodes();
    MM.render.edges();
    MM.render.overlay();
  }

  function doResize(e, p) {
    const drag = S.drag, o = drag.orig, dir = drag.dir;
    const n = MM.node(drag.id);
    const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    let b = { x: o.x, y: o.y, w: o.w, h: o.h };
    if (dir.includes('e')) b.w = o.w + dx;
    if (dir.includes('w')) { b.x = o.x + dx; b.w = o.w - dx; }
    if (dir.includes('s')) b.h = o.h + dy;
    if (dir.includes('n')) { b.y = o.y + dy; b.h = o.h - dy; }

    if (!e.altKey) {
      const snap = MM.snap.resize(b, dir, new Set([n.id]));
      b = snap.box;
      S.guides = snap.guides;
    } else {
      S.guides = [];
    }

    // keep aspect ratio: images by default, other notes with Shift (Shift frees images)
    if ((n.type === 'image') !== e.shiftKey) {
      const ratio = o.w / o.h;
      if (dir.length === 2) {
        if (b.w / b.h > ratio) b.h = b.w / ratio;
        else b.w = b.h * ratio;
      } else if (dir === 'e' || dir === 'w') {
        b.h = b.w / ratio;
      } else {
        b.w = b.h * ratio;
      }
      if (dir.includes('w')) b.x = o.x + o.w - b.w;
      if (dir.includes('n')) b.y = o.y + o.h - b.h;
      S.guides = [];
    }

    if (b.w < MIN_W) {
      if (dir.includes('w')) b.x = o.x + o.w - MIN_W;
      b.w = MIN_W;
    }
    if (b.h < MIN_H) {
      if (dir.includes('n')) b.y = o.y + o.h - MIN_H;
      b.h = MIN_H;
    }
    Object.assign(n, { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });
    // drawings anchored to this note are scaled along
    MM.draw.follow(S.doc, new Set([n.id]));
    MM.render.nodes();
    MM.render.edges();
    MM.render.overlay();
  }

  // ---- Pointer up ------------------------------------------------------------

  function onPointerUp(e) {
    const drag = S.drag;
    if (!drag) return;
    S.drag = null;
    S.guides = [];
    vp.classList.remove('panning');
    if (vp.hasPointerCapture(e.pointerId)) vp.releasePointerCapture(e.pointerId);

    switch (drag.mode) {
      case 'pan':
        MM.storage.scheduleAutosave();
        break;
      case 'move':
        if (drag.moved) MM.commit();
        else if (drag.deselectOnClick) {
          S.selection.delete(drag.clickedId);
          MM.refresh();
        } else if (!e.shiftKey && !e.ctrlKey && S.selection.size > 1) {
          MM.select([drag.clickedId]);
          MM.refresh();
        } else MM.refresh();
        break;
      case 'resize':
        MM.commit();
        break;
      case 'draw': {
        MM.draw.setTool(null);
        const n = drag.id && MM.node(drag.id);
        if (!n) {
          MM.refresh();
          break;
        }
        // anchored to the note / image where the drag began (Alt: free)
        MM.draw.setAnchor(n, drag.free ? null : I.nodeAt(drag.start));
        MM.select([n.id]);
        MM.commit();
        break;
      }
      case 'connect':
        finishConnect(e, drag);
        break;
      case 'endpoint': {
        if (drag.moved) MM.commit();
        else MM.refresh();
        break;
      }
      case 'rubber': {
        band.hidden = true;
        if (drag.current) {
          const x1 = Math.min(drag.start.x, drag.current.x), y1 = Math.min(drag.start.y, drag.current.y);
          const x2 = Math.max(drag.start.x, drag.current.x), y2 = Math.max(drag.start.y, drag.current.y);
          const sel = drag.additive ? new Set(drag.base) : new Set();
          for (const n of Object.values(S.doc.nodes)) {
            if (MM.meta.isHidden(n)) continue;
            if (n.x >= x1 && n.y >= y1 && n.x + n.w <= x2 && n.y + n.h <= y2) sel.add(n.id);
          }
          for (const ed of Object.values(S.doc.edges)) {
            const inside = (end) => (end.node ? sel.has(end.node) : end.x >= x1 && end.x <= x2 && end.y >= y1 && end.y <= y2);
            if (inside(ed.source) && inside(ed.target)) sel.add(ed.id);
          }
          S.selection = sel;
        }
        MM.refresh();
        break;
      }
    }
  }

  function finishConnect(e, drag) {
    if (!drag.moved) {
      MM.refresh();
      return;
    }
    const p = drag.point;
    let target = drag.target;
    let newNode = null;
    if (target && target.node === drag.source.node && target.anchor === drag.source.anchor) {
      MM.refresh();
      return;
    }
    if (!target) {
      if (e.altKey) {
        target = { x: p.x, y: p.y }; // free end
      } else {
        // dropped on empty canvas: create a new connected note there
        newNode = MM.createNode('text', p.x, p.y);
        S.doc.nodes[newNode.id] = newNode;
        target = { node: newNode.id, anchor: 'auto' };
      }
    }
    const edge = MM.createEdge(drag.source, target);
    S.doc.edges[edge.id] = edge;
    MM.select([newNode ? newNode.id : edge.id]);
    MM.commit();
    if (newNode) MM.edit.start(newNode.id, 'text');
  }

  // ---- Double click / wheel ----------------------------------------------------

  function onDoubleClick(e) {
    // With pointer capture the event is reported on the viewport, so look up
    // what is really under the mouse.
    const t = document.elementFromPoint(e.clientX, e.clientY) || e.target;
    if (!vp.contains(t)) return;
    if (MM.editing || t.classList.contains('label-editor')) return;
    if (/todo-check|todo-add|outline-toggle|outline-bullet/.test(t.className)) return;
    if (t.closest('[class*="handle"]') || t.classList.contains('anchor-dot')) return;

    const nodeEl = t.closest('.node');
    if (nodeEl) {
      const id = nodeEl.dataset.id;
      const target = MM.node(id);
      // the file icon already opened the file on pointerdown - do not open it twice
      if (target && target.type === 'file' && t.closest('.file-icon')) return;
      const item = t.closest('li[data-item]'), block = t.closest('li[data-block]');
      if (item) MM.edit.start(id, 'item', item.dataset.item);
      else if (block) MM.edit.start(id, 'block', block.dataset.block, { caret: 'end' });
      else MM.edit.start(id, 'text');
      return;
    }
    const edgeEl = t.closest('.edge') || t.closest('.edge-label');
    if (edgeEl) {
      MM.select([edgeEl.dataset.id]);
      MM.refresh();
      MM.edit.editLabel(edgeEl.dataset.id);
    }
    // empty canvas: nothing (new notes come from the right-click menu)
  }

  function onContextMenu(e) {
    const t = e.target;
    // keep the browser's own menu (copy/paste text) inside text being edited
    if ((MM.editing && MM.editing.el.contains(t)) || t.classList.contains('label-editor')) return;
    e.preventDefault();
    if (S.drag) return;
    MM.menu.openFor(e);
  }

  function onWheel(e) {
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * scale, dy = e.deltaY * scale;
    if (e.ctrlKey || (S.settings.wheel === 'zoom' && !e.shiftKey)) {
      const r = vp.getBoundingClientRect();
      MM.zoomAt(S.doc.view.zoom * Math.exp(-dy * 0.0015), e.clientX - r.left, e.clientY - r.top);
    } else {
      S.doc.view.x -= e.shiftKey && !dx ? dy : dx;
      S.doc.view.y -= e.shiftKey && !dx ? 0 : dy;
      MM.render.applyView();
    }
  }

  // ---- Keyboard ----------------------------------------------------------------

  function isTyping(e) {
    const t = e.target;
    return MM.editing || MM.edit.isLabelEditing() ||
      (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
  }

  /**
   * Open the emoji picker for the note being edited (or the selection).
   * anchorRect: where it pops up (default: top centre of the canvas).
   */
  I.openEmojiPicker = function (anchorRect) {
    const ed = MM.editing;
    const node = (ed && MM.node(ed.nodeId)) || MM.selectedNodes()[0] || null;
    const r = document.getElementById('viewport').getBoundingClientRect();
    MM.emoji.pick({
      target: node,
      at: MM.viewCenter(),
      mode: node ? 'text' : 'note',
      anchorRect: anchorRect || { left: r.left + r.width / 2 - 160, top: r.top + 80, bottom: r.top + 80 },
    });
  };

  /** Ctrl+. or Ctrl+Shift+E (Cmd on a Mac) */
  I.isEmojiKey = (e) => (e.ctrlKey || e.metaKey) && (e.key === '.' || (e.shiftKey && e.key.toLowerCase() === 'e'));

  function onKeyDown(e) {
    // the emoji picker shortcut works while editing a note text as well
    if (I.isEmojiKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      I.openEmojiPicker();
      return;
    }
    if (isTyping(e)) return;
    const A = MM.actions;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const step = e.shiftKey ? 10 : 1;
    let handled = true;

    if (ctrl && key === 'z' && !e.shiftKey) A.undo();
    else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) A.redo();
    else if (ctrl && key === 's') e.shiftKey ? A.saveAs() : A.save();
    else if (ctrl && key === 'o') A.open();
    else if (ctrl && key === 'a') A.selectAll();
    else if (ctrl && key === 'c') A.copy();
    else if (ctrl && key === 'x') A.cut();
    else if (ctrl && key === 'v') handled = false; // handled by the 'paste' event (images or notes)
    else if (ctrl && key === 'd') A.duplicate();
    // anchor / detach drawings - feels like grouping in Inkscape
    else if (ctrl && key === 'g') e.shiftKey ? A.drawDetach() : A.drawAnchor();
    else if (ctrl) handled = false;
    else if (key === 'Delete' || key === 'Backspace') A.deleteSelection();
    else if (key === 'Escape' && S.tool) MM.draw.setTool(null);
    else if (key === 'Escape') A.deselect();
    else if (key === 'Enter' || key === 'F2') A.editSelected();
    else if (key === 'Tab') A.addChild();
    else if (key === 'ArrowLeft') A.nudge(-step, 0);
    else if (key === 'ArrowRight') A.nudge(step, 0);
    else if (key === 'ArrowUp') A.nudge(0, -step);
    else if (key === 'ArrowDown') A.nudge(0, step);
    else if (key === '+' || key === '=') A.zoomIn();
    else if (key === '-') A.zoomOut();
    else if (key === '!' || (key === '1' && e.shiftKey)) A.fit();
    else if (key === ' ') {
      spaceDown = true;
      vp.classList.add('space-pan');
    } else handled = false;

    if (handled) e.preventDefault();
  }

  function onKeyUp(e) {
    if (e.key === ' ') {
      spaceDown = false;
      vp.classList.remove('space-pan');
    }
  }
})(window.MM);
