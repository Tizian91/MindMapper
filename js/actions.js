'use strict';
/*
 * Named commands. Toolbar buttons, panel buttons (data-action="name") and
 * keyboard shortcuts all call into MM.actions.
 */
(function (MM) {
  const S = MM.state;
  const A = (MM.actions = {});

  // ---- View --------------------------------------------------------------

  /** Visible center of the viewport in world coordinates. */
  MM.viewCenter = function () {
    const vp = document.getElementById('viewport').getBoundingClientRect();
    const v = S.doc.view;
    return { x: (vp.width / 2 - v.x) / v.zoom, y: (vp.height / 2 - v.y) / v.zoom };
  };

  /** Zoom to `zoom`, keeping screen point (sx, sy) fixed. */
  MM.zoomAt = function (zoom, sx, sy) {
    const v = S.doc.view;
    const z = MM.geo.clamp(zoom, 0.1, 4);
    v.x = sx - (sx - v.x) * (z / v.zoom);
    v.y = sy - (sy - v.y) * (z / v.zoom);
    v.zoom = z;
    MM.refresh();
  };

  function zoomCenter(factor) {
    const vp = document.getElementById('viewport').getBoundingClientRect();
    MM.zoomAt(S.doc.view.zoom * factor, vp.width / 2, vp.height / 2);
  }

  A.zoomIn = () => zoomCenter(1.25);
  A.zoomOut = () => zoomCenter(1 / 1.25);
  A.zoomReset = () => {
    const vp = document.getElementById('viewport').getBoundingClientRect();
    MM.zoomAt(1, vp.width / 2, vp.height / 2);
  };

  A.fit = function () {
    const nodes = Object.values(S.doc.nodes);
    const vp = document.getElementById('viewport').getBoundingClientRect();
    const v = S.doc.view;
    if (!nodes.length) {
      Object.assign(v, { x: vp.width / 2, y: vp.height / 2, zoom: 1 });
      MM.refresh();
      return;
    }
    const b = MM.geo.bbox(nodes), pad = 60;
    const z = MM.geo.clamp(Math.min((vp.width - 2 * pad) / b.w, (vp.height - 2 * pad) / b.h, 1.5), 0.1, 4);
    v.zoom = z;
    v.x = vp.width / 2 - (b.x + b.w / 2) * z;
    v.y = vp.height / 2 - (b.y + b.h / 2) * z;
    MM.refresh();
  };

  // ---- Settings toggles ----------------------------------------------------

  A.toggleGuides = () => {
    S.settings.smartGuides = !S.settings.smartGuides;
    MM.saveSettings();
    MM.refresh();
  };
  A.toggleGrid = () => {
    S.settings.grid = !S.settings.grid;
    MM.saveSettings();
    MM.refresh();
  };

  // ---- Creating ----------------------------------------------------------

  /** Add a node of `type` at world point `at` (default: view center) and edit it. */
  A.addNode = function (type, at) {
    const p = at || MM.viewCenter();
    const n = MM.createNode(type, p.x, p.y);
    if (S.settings.grid) {
      const g = S.settings.gridSize;
      n.x = Math.round(n.x / g) * g;
      n.y = Math.round(n.y / g) * g;
    }
    S.doc.nodes[n.id] = n;
    MM.select([n.id]);
    MM.commit();
    MM.edit.start(n.id, 'text');
    return n;
  };
  /** Menu entries "insert <type>" for every note type. */
  /**
   * Menu entries "insert <type>" for every text note type.
   * at: world point for images, files and emoji; omit to leave those out.
   */
  MM.insertItems = function (fn, at) {
    const items = MM.TEXT_TYPES.map((type) => ({ label: MM.NODE_TYPES[type], action: () => fn(type) }));
    if (at) {
      items.push('-',
        { label: 'Image…', action: () => A.insertImage(at, false) },
        { label: 'Image overlay…', action: () => A.insertImage(at, true) },
        { label: 'File…', action: () => MM.files.pick(at) },
        { label: 'Emoji…', action: () => A.insertEmojiNote(at) });
    }
    return items;
  };

  /** Insert an emoji / symbol as its own note at `at` (the picker inserts it). */
  A.insertEmojiNote = function (at) {
    return MM.emoji.pick({ mode: 'note', at: at || MM.viewCenter() });
  };

  /** Pick image file(s) and insert them at world point `at`. */
  A.insertImage = async function (at, overlay) {
    const files = await MM.images.pick(true);
    await MM.images.insertFiles(files, at || MM.viewCenter(), { overlay });
  };

  A.replaceImage = async function () {
    const n = MM.selectedNodes().find((x) => x.type === 'image');
    if (!n) return;
    const [file] = await MM.images.pick(false);
    if (file) await MM.images.replace(n, file);
  };

  /** Switch selected images between note and overlay. */
  A.toggleOverlay = function () {
    const imgs = MM.selectedNodes().filter((n) => n.type === 'image');
    const on = !imgs.every((n) => n.overlay);
    imgs.forEach((n) => (n.overlay = on));
    MM.commit();
  };

  A.openLink = function () {
    const n = MM.selectedNodes().find((x) => x.link);
    if (n) MM.links.open(n.link);
  };

  /** Select a note and bring it into view. */
  A.focusNode = function (id) {
    const n = MM.node(id);
    if (!n) return;
    MM.select([id]);
    const vp = document.getElementById('viewport').getBoundingClientRect();
    const v = S.doc.view;
    v.zoom = Math.max(v.zoom, 0.8);
    v.x = vp.width / 2 - (n.x + n.w / 2) * v.zoom;
    v.y = vp.height / 2 - (n.y + n.h / 2) * v.zoom;
    MM.refresh();
  };

  A.overview = () => MM.overview.open();

  /** Views dialog (tree, radial, bubble, treemap); starts at the selected note if there is one. */
  A.views = () => MM.views.open();

  /** Open the map that was derived from a note (if it still exists). */
  A.openDerivedMap = async function (node) {
    const n = node || MM.selectedNodes()[0];
    if (!n || !n.derivedMap) return;
    if (!MM.project.find(n.derivedMap)) {
      const ok = confirm(MM.tr('"{map}" does not exist any more.\nCreate it now?', { map: n.derivedMap }));
      if (!ok) return;
      await MM.project.ensureMap(n.derivedMap);
    }
    await MM.project.openMap(n.derivedMap);
  };

  /**
   * Create a new map from a note: the note's title becomes the map title and
   * list content is copied in as a starting point. The note remembers the map
   * in `derivedMap` and links to it.
   */
  A.deriveMap = async function (node) {
    const n = node || MM.selectedNodes()[0];
    if (!n) return;
    if (MM.project.status !== 'ready') {
      alert(MM.tr('Maps live in a project folder.\nOpen a folder in the "Project" sidebar first.'));
      return;
    }
    if (n.derivedMap) return A.openDerivedMap(n);
    const title = MM.project.sanitizeName((n.text || '').split('\n')[0]) || 'New map';
    const folder = MM.project.folderOf(S.file.path);
    const answer = prompt(MM.tr('Name of the new map:'), title);
    if (answer === null) return;
    const name = MM.project.sanitizeName(answer);
    if (!name) return;

    const t = MM.templates.blank(name);
    const doc = t.doc;
    const head = Object.values(doc.nodes)[0];
    if (head) head.link = S.file.path || ''; // way back to the map this came from
    // starting material from the note itself
    const ox = head ? head.x : 0, oy = head ? head.y + (head.h || 64) + 80 : 0;
    if (MM.hasBlocks(n) && n.blocks.some((b) => b.text.trim())) {
      const copy = MM.createNode('outline', ox, oy, { text: n.text, w: 320 });
      copy.blocks = MM.clone(n.blocks);
      copy.blocks.forEach((b) => (b.id = MM.uid('b')));
      copy.tags = (n.tags || []).slice();
      doc.nodes[copy.id] = copy;
      const e = MM.createEdge({ node: head.id, anchor: 'auto' }, { node: copy.id, anchor: 'auto' });
      doc.edges[e.id] = e;
    } else if (n.type === 'todo' && (n.items || []).some((i) => i.text.trim())) {
      const copy = MM.createNode('todo', ox, oy, { text: n.text, w: 280 });
      copy.items = MM.clone(n.items);
      copy.items.forEach((i) => (i.id = MM.uid('i')));
      doc.nodes[copy.id] = copy;
      const e = MM.createEdge({ node: head.id, anchor: 'auto' }, { node: copy.id, anchor: 'auto' });
      doc.edges[e.id] = e;
    }

    const path = await MM.project.createMap({ folder, name, doc, open: false });
    if (!path) return;
    n.derivedMap = path;
    if (!n.link) n.link = path;
    MM.commit();
    if (MM.storage.hasFile()) await MM.storage.writeFile();
    MM.project.scan();
    await MM.project.openMap(path);
  };

  /** Create a map from the selected note (context menu entry). */
  A.deriveMapFromSelection = () => A.deriveMap(MM.selectedNodes()[0]);

  /** Open the attached file of a file note. */
  A.openFile = function () {
    const n = MM.selectedNodes().find((x) => x.type === 'file');
    if (n) MM.files.open(n);
  };

  /** Replace the file of the selected file note. */
  A.replaceFile = function () {
    const n = MM.selectedNodes().find((x) => x.type === 'file');
    if (n) MM.files.pickReplace(n);
  };

  /** Flash the relative path of an attached file. */
  A.revealFile = function () {
    const n = MM.selectedNodes().find((x) => x.type === 'file');
    if (n) MM.files.reveal(n);
  };

  /** Set the status of all selected notes (keeps progress in sync, like the panel). */
  A.setStatus = function (status) {
    MM.meta.setValue(MM.selectedNodes(), 'status', status);
    MM.commit();
  };

  A.toggleMeta = () => {
    S.settings.showMeta = !S.settings.showMeta;
    MM.saveSettings();
    MM.refresh();
  };

  A.toggleProject = () => {
    S.settings.showProject = !S.settings.showProject;
    MM.saveSettings();
    MM.refresh();
  };

  A.togglePanel = (source) => {
    S.settings.showPanel = !S.settings.showPanel;
    MM.saveSettings();
    if (MM.panel && MM.panel.applyLayout) MM.panel.applyLayout();
    MM.refresh();

    if (source === 'expandBtn' && S.settings.showPanel) {
      const closeBtn = document.querySelector('#panel .panel-close-btn');
      if (closeBtn) closeBtn.focus();
    } else if (source === 'closeBtn' && !S.settings.showPanel) {
      const expandBtn = document.getElementById('panel-expand-btn');
      if (expandBtn) expandBtn.focus();
    }
  };

  A.toggleTheme = () => {
    const order = ['auto', 'dark', 'light'];
    const cur = S.settings.theme || 'auto';
    S.settings.theme = order[(order.indexOf(cur) + 1) % order.length];
    MM.saveSettings();
    MM.applyTheme();
    MM.refresh();
  };

  A.toggleLang = () => {
    MM.setLang(S.settings.lang === 'de' ? 'en' : 'de');
  };

  A.toggleFilter = () => {
    S.filter.open = !S.filter.open;
    MM.refresh();
  };

  /** Toolbar "+ Insert" button: drop-down with all note types. */
  A.insertMenu = function () {
    if (MM.menu.isOpen()) return MM.menu.close();
    const r = document.getElementById('insert-btn').getBoundingClientRect();
    MM.menu.open(MM.insertItems((type) => A.addNode(type), MM.viewCenter()), r.left, r.bottom + 2);
  };

  /** Toolbar ☺: emoji picker below the button (into the edited / selected note, else as a note). */
  A.emoji = function () {
    MM.interaction.openEmojiPicker(document.getElementById('emoji-btn').getBoundingClientRect());
  };

  /** Change the type of all selected notes. */
  A.setType = function (type) {
    for (const n of MM.selectedNodes()) MM.setNodeType(n, type);
    MM.commit();
  };

  /** Tab: create a connected child note to the right of the selected note. */
  A.addChild = function (type) {
    const sel = MM.selectedNodes();
    if (sel.length !== 1) return;
    const parent = sel[0];
    const child = MM.createNode(type || 'text', 0, 0);
    child.x = parent.x + parent.w + 80;
    child.y = parent.y + parent.h / 2 - child.h / 2;
    const overlaps = () =>
      Object.values(S.doc.nodes).some((o) =>
        o.x < child.x + child.w + 10 && o.x + o.w + 10 > child.x && o.y < child.y + child.h + 10 && o.y + o.h + 10 > child.y);
    for (let i = 0; i < 50 && overlaps(); i++) child.y += child.h + 20;
    S.doc.nodes[child.id] = child;
    const e = MM.createEdge({ node: parent.id, anchor: 'auto' }, { node: child.id, anchor: 'auto' });
    S.doc.edges[e.id] = e;
    MM.select([child.id]);
    MM.commit();
    MM.edit.start(child.id, 'text');
  };

  A.editSelected = function () {
    const sel = MM.selectedNodes();
    if (sel.length === 1) MM.edit.start(sel[0].id, 'text');
    else {
      const edges = MM.selectedEdges();
      if (edges.length === 1) MM.edit.editLabel(edges[0].id);
    }
  };

  // ---- Selection / deleting ------------------------------------------------

  A.selectAll = () => {
    MM.select([...Object.keys(S.doc.nodes), ...Object.keys(S.doc.edges)]);
    MM.refresh();
  };

  A.deselect = () => {
    MM.select([]);
    MM.refresh();
  };

  A.deleteSelection = function () {
    const doc = S.doc;
    for (const id of S.selection) {
      if (doc.nodes[id]) delete doc.nodes[id];
      if (doc.edges[id]) delete doc.edges[id];
    }
    // remove connections whose notes are gone
    for (const e of Object.values(doc.edges)) {
      if ((e.source.node && !doc.nodes[e.source.node]) || (e.target.node && !doc.nodes[e.target.node])) {
        delete doc.edges[e.id];
      }
    }
    MM.select([]);
    MM.commit();
  };

  // ---- Clipboard -----------------------------------------------------------

  let clipboard = null;
  let pasteCount = 0;

  A.copy = function () {
    const nodes = MM.selectedNodes();
    if (!nodes.length) return;
    const ids = new Set(nodes.map((n) => n.id));
    const edges = Object.values(S.doc.edges).filter((e) => {
      const inSel = (end) => (end.node ? ids.has(end.node) : false);
      return inSel(e.source) && inSel(e.target);
    });
    // image data travels along, so pasting into another map works too
    const assets = {};
    for (const n of nodes) for (const id of MM.assetRefs(n)) if (S.doc.assets[id]) assets[id] = S.doc.assets[id];
    clipboard = Object.assign(MM.clone({ nodes, edges }), { assets });
    pasteCount = 0;
  };

  A.cut = function () {
    A.copy();
    A.deleteSelection();
  };

  A.hasClipboard = () => !!clipboard;

  A.paste = function () {
    if (!clipboard) return;
    pasteCount++;
    pasteWithOffset(24 * pasteCount, 24 * pasteCount);
  };

  /** Paste so that the copied notes are centered on world point p. */
  A.pasteAt = function (p) {
    if (!clipboard) return;
    const b = MM.geo.bbox(clipboard.nodes);
    pasteWithOffset(Math.round(p.x - (b.x + b.w / 2)), Math.round(p.y - (b.y + b.h / 2)));
  };

  function pasteWithOffset(dx, dy) {
    const map = {};
    const newIds = [];
    for (const [id, url] of Object.entries(clipboard.assets || {})) {
      if (!S.doc.assets[id]) S.doc.assets[id] = url;
    }
    for (const src of clipboard.nodes) {
      const n = MM.clone(src);
      n.id = MM.uid('n');
      n.x += dx;
      n.y += dy;
      if (n.items) n.items.forEach((i) => (i.id = MM.uid('i')));
      if (n.blocks) n.blocks.forEach((b) => (b.id = MM.uid('b')));
      map[src.id] = n.id;
      S.doc.nodes[n.id] = n;
      newIds.push(n.id);
    }
    for (const src of clipboard.edges) {
      const e = MM.clone(src);
      e.id = MM.uid('e');
      e.source.node = map[e.source.node];
      e.target.node = map[e.target.node];
      S.doc.edges[e.id] = e;
      newIds.push(e.id);
    }
    for (const n of Object.values(S.doc.nodes)) {
      if (n.parent && map[n.parent] && newIds.includes(n.id)) n.parent = map[n.parent];
    }
    // a pasted drawing stays anchored only if its note was copied too
    for (const id of newIds) {
      const n = S.doc.nodes[id];
      if (!n || !n.anchor) continue;
      const a = S.doc.nodes[map[n.anchor.node]];
      n.anchor = a ? { node: a.id, box: { x: a.x, y: a.y, w: a.w, h: a.h } } : null;
    }
    MM.select(newIds);
    MM.commit();
  }

  A.duplicate = function () {
    A.copy();
    A.paste();
  };

  // ---- Moving / arranging ----------------------------------------------------

  A.nudge = function (dx, dy) {
    const nodes = MM.selectedNodes();
    if (!nodes.length) return;
    nodes.forEach((n) => {
      n.x += dx;
      n.y += dy;
    });
    MM.commit();
  };

  /** Align selected notes: left | hcenter | right | top | vcenter | bottom */
  A.align = function (how) {
    const nodes = MM.selectedNodes();
    if (nodes.length < 2) return;
    const b = MM.geo.bbox(nodes);
    for (const n of nodes) {
      if (how === 'left') n.x = b.x;
      if (how === 'hcenter') n.x = Math.round(b.x + b.w / 2 - n.w / 2);
      if (how === 'right') n.x = b.x + b.w - n.w;
      if (how === 'top') n.y = b.y;
      if (how === 'vcenter') n.y = Math.round(b.y + b.h / 2 - n.h / 2);
      if (how === 'bottom') n.y = b.y + b.h - n.h;
    }
    MM.commit();
  };

  /** Equal gaps between selected notes along axis 'x' or 'y'. */
  A.distribute = function (axis) {
    const nodes = MM.selectedNodes();
    if (nodes.length < 3) return;
    const pos = axis === 'x' ? 'x' : 'y', size = axis === 'x' ? 'w' : 'h';
    nodes.sort((a, b) => a[pos] + a[size] / 2 - (b[pos] + b[size] / 2));
    const b = MM.geo.bbox(nodes);
    const total = nodes.reduce((s, n) => s + n[size], 0);
    const gap = ((axis === 'x' ? b.w : b.h) - total) / (nodes.length - 1);
    let cur = axis === 'x' ? b.x : b.y;
    for (const n of nodes) {
      n[pos] = Math.round(cur);
      cur += n[size] + gap;
    }
    MM.commit();
  };

  function reorder(toFront) {
    const sel = S.selection;
    const all = Object.values(S.doc.nodes);
    const picked = all.filter((n) => sel.has(n.id)), rest = all.filter((n) => !sel.has(n.id));
    const ordered = toFront ? rest.concat(picked) : picked.concat(rest);
    S.doc.nodes = {};
    for (const n of ordered) S.doc.nodes[n.id] = n;
    MM.commit();
  }
  A.toFront = () => reorder(true);
  A.toBack = () => reorder(false);

  /** Set a style value on the selected connections (and remember it for new ones). */
  A.setEdgeStyle = function (key, value) {
    for (const e of MM.selectedEdges()) e.style[key] = value;
    S.edgeStyle[key] = value;
    MM.saveSettings();
    MM.commit();
  };

  /** Swap the direction of the selected connections. */
  A.reverseEdges = function () {
    for (const e of MM.selectedEdges()) {
      [e.source, e.target] = [e.target, e.source];
    }
    MM.commit();
  };

  // ---- History / files -------------------------------------------------------

  A.undo = () => {
    MM.edit.finish();
    if (MM.history.undo()) {
      S.dirty = true;
      MM.storage.scheduleAutosave();
    }
    MM.refresh();
  };
  A.redo = () => {
    MM.edit.finish();
    if (MM.history.redo()) {
      S.dirty = true;
      MM.storage.scheduleAutosave();
    }
    MM.refresh();
  };

  A.newDoc = () => MM.storage.newDoc();
  A.open = () => MM.storage.open();
  A.save = () => MM.storage.save(false);
  A.saveAs = () => MM.storage.save(true);
  A.exportPdf = () => MM.mapPrint.open();
})(window.MM);
