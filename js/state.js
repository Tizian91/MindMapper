'use strict';
/*
 * Global namespace, document model, app state and undo/redo history.
 *
 * Document layout (this is also the saved JSON format):
 *   {
 *     app: 'MindMapper', version: 1,
 *     nodes: { <id>: Node },   // insertion order = drawing order (last = on top)
 *     edges: { <id>: Edge },
 *     view:  { x, y, zoom }    // pan/zoom, not part of undo history
 *   }
 *
 * Node: { id, type, shape, x, y, w, h, text, items, tags, parent, style }
 * Edge: { id, source: End, target: End, label, style }
 * End:  { node, anchor }  -> attached ('auto' anchor = picks the side facing the other end)
 *       { x, y }          -> free end
 */
window.MM = window.MM || {};

(function (MM) {
  MM.uid = function (prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };

  MM.clone = (obj) => JSON.parse(JSON.stringify(obj));

  // ---- Catalogs (id -> label) -------------------------------------------

  MM.NODE_TYPES = {
    text: 'Note', heading: 'Heading', todo: 'To-Do', outline: 'Outline', task: 'Task',
    link: 'Link', code: 'Code', group: 'Group', image: 'Image', file: 'File', draw: 'Drawing',
    diary: 'Diary entry',
  };

  /** Types that can be created from an empty note (images and files need a file, drawings are drawn). */
  MM.TEXT_TYPES = Object.keys(MM.NODE_TYPES).filter((t) => t !== 'image' && t !== 'file' && t !== 'draw');

  /** Shapes of drawings (see draw.js). */
  MM.DRAW_KINDS = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow' };

  /** Outline and task notes share the nested bullet list. */
  MM.hasBlocks = (n) => n.type === 'outline' || n.type === 'task';

  MM.PRIORITIES = {
    none: { label: 'None', color: '#a0aec0' },
    low: { label: 'Low', color: '#38a169' },
    medium: { label: 'Medium', color: '#d69e2e' },
    high: { label: 'High', color: '#dd6b20' },
    urgent: { label: 'Urgent', color: '#e53e3e' },
  };

  /**
   * Eisenhower quadrants: the alternative to the priority levels, chosen per
   * project folder (settings.prioSystem). Stored in meta.quadrant next to
   * meta.priority, so switching the system never loses a value.
   * The names only describe the state, they do not prescribe an action.
   */
  MM.QUADRANTS = {
    none: { label: 'Not classified', color: '#a0aec0' },
    both: { label: 'Important + urgent', color: '#e53e3e', important: true, urgent: true },
    important: { label: 'Important only', color: '#3182ce', important: true, urgent: false },
    urgent: { label: 'Urgent only', color: '#d69e2e', important: false, urgent: true },
    neither: { label: 'Neither', color: '#718096', important: false, urgent: false },
  };
  /** Keys of the first version (named after actions). */
  const QUAD_LEGACY = { do: 'both', plan: 'important', delegate: 'urgent', drop: 'neither' };

  /** Active priority system: its meta field, catalog, labels and sort rank. */
  MM.prioKey = () => (MM.state.settings.prioSystem === 'eisenhower' ? 'quadrant' : 'priority');
  MM.prioCatalog = () => (MM.prioKey() === 'quadrant' ? MM.QUADRANTS : MM.PRIORITIES);
  MM.prioLabel = (k) => (MM.prioKey() === 'quadrant'
    ? MM.t('quad_' + k, (MM.QUADRANTS[k] || MM.QUADRANTS.none).label)
    : MM.t('prio_' + k, (MM.PRIORITIES[k] || MM.PRIORITIES.none).label));
  const PRIO_RANK = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
  const QUAD_RANK = { both: 0, important: 1, urgent: 2, neither: 3, none: 4 };
  MM.prioRank = (m) => (MM.prioKey() === 'quadrant' ? QUAD_RANK[m.quadrant] : PRIO_RANK[m.priority]) ?? 4;
  /** Value of the active system in a meta block ('none' if not set). */
  MM.prioOf = (m) => (m && m[MM.prioKey()]) || 'none';

  /** Switch the priority system; save: also write it into the project folder. */
  MM.setPrioSystem = function (sys, save) {
    const S = MM.state;
    const next = sys === 'eisenhower' ? 'eisenhower' : 'levels';
    if (S.settings.prioSystem === next) return;
    S.settings.prioSystem = next;
    S.filter.priorities = []; // values of the other system
    MM.saveSettings();
    if (save) MM.storage.saveProjectSettings();
    if (MM.filterbar && MM.filterbar.rebuild) MM.filterbar.rebuild();
    if (MM.overview && MM.overview.rebuild) MM.overview.rebuild();
    if (MM.panel) MM.panel.update(true);
    MM.refresh();
  };

  MM.STATUSES = {
    none: { label: 'No status', color: '#a0aec0' },
    open: { label: 'Open', color: '#3182ce' },
    progress: { label: 'In progress', color: '#d69e2e' },
    blocked: { label: 'Blocked', color: '#e53e3e' },
    done: { label: 'Done', color: '#38a169' },
  };

  MM.SHAPES = {
    rect: 'Rectangle', rounded: 'Rounded', pill: 'Pill', ellipse: 'Ellipse',
    diamond: 'Diamond', hexagon: 'Hexagon', parallelogram: 'Parallelogram', none: 'No border',
  };

  MM.ROUTES = { straight: 'Straight', elbow: 'Elbow', rounded: 'Rounded elbow', curved: 'Curve' };

  MM.LINE_STYLES = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted', dashdot: 'Dash-dot' };

  MM.ARROWS = {
    none: 'None', arrow: 'Arrow', triangle: 'Triangle', circle: 'Circle', diamond: 'Diamond', bar: 'Bar',
  };

  // ---- Defaults and factories --------------------------------------------

  MM.DEFAULT_NODE_STYLE = {
    fill: '#ffffff', stroke: '#4a5568', strokeWidth: 1.5, strokeStyle: 'solid',
    textColor: '#1a202c', fontSize: 14, bold: false, align: 'center',
  };

  MM.DEFAULT_EDGE_STYLE = {
    route: 'curved', lineStyle: 'solid', width: 2, color: '#4a5568',
    startArrow: 'none', endArrow: 'triangle',
  };

  const NODE_PRESETS = {
    text: { w: 160, h: 64, shape: 'rounded', text: '', style: {} },
    file: {
      w: 240, h: 68, shape: 'rounded', text: '',
      style: { align: 'left', fill: '#f8fafc', stroke: '#64748b' },
    },
    heading: {
      w: 240, h: 64, shape: 'pill', text: 'Heading',
      style: { fontSize: 22, bold: true, fill: '#ebf4ff', stroke: '#3c6fd1', strokeWidth: 2 },
    },
    todo: { w: 220, h: 120, shape: 'rect', text: 'To-Do', style: { align: 'left', fill: '#fffbea', stroke: '#b7791f' } },
    outline: { w: 280, h: 120, shape: 'rounded', text: 'Title', style: { align: 'left', stroke: '#718096' } },
    task: { w: 300, h: 140, shape: 'rounded', text: 'Task', style: { align: 'left', fill: '#f7f8ff', stroke: '#5a67d8' } },
    image: { w: 240, h: 160, shape: 'none', text: '', style: { strokeWidth: 2, fit: 'cover', opacity: 1 } },
    link: { w: 200, h: 48, shape: 'pill', text: 'Link', style: { fill: '#f0f7ff', stroke: '#3c6fd1' } },
    code: {
      w: 320, h: 120, shape: 'rect', text: '',
      style: { fill: '#1e293b', stroke: '#0f172a', textColor: '#e2e8f0', fontSize: 13, align: 'left' },
    },
    draw: { w: 120, h: 80, shape: 'none', text: '', style: { stroke: '#e53e3e', strokeWidth: 3, fill: 'none', opacity: 1 } },
    // diary entry (diary.js): head like a to-do list, warm paper colour
    diary: { w: 320, h: 220, shape: 'rect', text: '', style: { align: 'left', fill: '#fdf8ec', stroke: '#b7791f' } },
    group: {
      w: 440, h: 300, shape: 'rounded', text: 'Group',
      style: { fill: '#f1f5f9', stroke: '#94a3b8', strokeStyle: 'dashed', align: 'left', bold: true },
    },
  };

  /**
   * Recurring notes (see routines.js). node.repeat = null or
   *   { kind, every (weeks), days [weekdays, 0 = Sunday], day (of month), nth (1..5, -1 = last),
   *     weekday, time 'HH:MM', from / until 'YYYY-MM-DD' }
   * The duration of one occurrence (or the weekly budget) is meta.estimate.
   */
  MM.REPEAT_KINDS = {
    weekly: 'Weekly / every n weeks', 'monthly-day': 'Monthly (day of month)',
    'monthly-nth': 'Monthly (n-th weekday)', budget: 'Time budget per week',
    off: 'Day(s) off / vacation', // from..until; estimate = hours off per day (empty = whole day)
  };

  MM.normalizeRepeat = function (r) {
    if (!r || typeof r !== 'object' || !Object.hasOwn(MM.REPEAT_KINDS, r.kind)) return null;
    const int = (v, lo, hi, d) => {
      const x = Math.round(Number(v));
      return isFinite(x) && x >= lo && x <= hi ? x : d;
    };
    const date = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '');
    const nth = int(r.nth, -1, 5, 1);
    return {
      kind: r.kind,
      every: int(r.every, 1, 52, 1),
      days: [...new Set((Array.isArray(r.days) ? r.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(),
      day: int(r.day, 1, 31, 1),
      nth: nth === 0 ? 1 : nth,
      weekday: int(r.weekday, 0, 6, 1),
      time: /^\d{2}:\d{2}$/.test(r.time) ? r.time : '',
      from: date(r.from),
      until: date(r.until),
    };
  };

  /**
   * Empty metadata block of a note. estimate is in minutes, progress in percent.
   * scheduled ('YYYY-MM-DD') + scheduledTime ('HH:MM') = appointment: the note takes
   * place on that day. A note has either a deadline or a scheduled date, never both.
   */
  MM.emptyMeta = () => ({ deadline: '', scheduled: '', scheduledTime: '', estimate: null, priority: 'none', quadrant: 'none', status: 'none', progress: null });

  /** Create a node of the given type centered on (cx, cy). */
  MM.createNode = function (type, cx, cy, overrides) {
    const p = NODE_PRESETS[type] || NODE_PRESETS.text;
    const node = {
      id: MM.uid('n'),
      type: NODE_PRESETS[type] ? type : 'text',
      shape: p.shape,
      x: Math.round(cx - p.w / 2),
      y: Math.round(cy - p.h / 2),
      w: p.w,
      h: p.h,
      text: p.text,
      items: [],  // to-do entries
      blocks: [], // outline entries (flat list, nesting via `level`)
      tags: [],
      meta: MM.emptyMeta(),
      link: '',   // other map of the project ("Weeks/2026-W43.mindmap.json") or a web address
      parent: null,
      derivedMap: '', // map created from this note (see actions.deriveMap)
      movedTo: null,  // set when the note was carried over into another map
      movedFrom: null, // set on the copy that landed in the other map
      movedCopyId: null, // id of that copy, so "undo move" can remove it again
      repeat: null,   // recurring note (meeting, weekly time budget, ...), see routines.js
      style: Object.assign({}, MM.DEFAULT_NODE_STYLE, p.style),
    };
    if (node.type === 'todo') node.items = [MM.createTodoItem('First task')];
    if (MM.hasBlocks(node)) node.blocks = [MM.createBlock('', 0)];
    if (node.type === 'image') Object.assign(node, { imageId: null, overlay: false });
    if (node.type === 'file') Object.assign(node, { file: { path: '', name: '', size: 0, mime: '' } });
    if (node.type === 'draw') Object.assign(node, { draw: 'rect', line: { x1: 0, y1: 0, x2: 1, y2: 1 }, anchor: null });
    if (node.type === 'diary') node.diary = MM.newDiaryMeta();
    return Object.assign(node, overrides || {});
  };

  /**
   * Diary data of a new entry: { book, date 'YYYY-MM-DD', time 'HH:MM' } - now,
   * in the diary used last.
   */
  MM.newDiaryMeta = function () {
    const d = new Date(), p = (v) => String(v).padStart(2, '0');
    return {
      book: (MM.state && MM.state.settings && MM.state.settings.lastDiary) || '',
      date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
      time: `${p(d.getHours())}:${p(d.getMinutes())}`,
    };
  };

  /** Asset ids a note uses: its image, and images in the text of a diary entry. */
  MM.assetRefs = function (n) {
    const ids = n.imageId ? [n.imageId] : [];
    if (n.type === 'diary' && MM.md) ids.push(...MM.md.assetIds(n.text));
    return ids;
  };

  /** A note that only shows one big character (emoji, symbol, letter). */
  MM.createSymbolNode = function (char, cx, cy, w, h) {
    const n = MM.createNode('text', cx, cy, {
      text: char,
      shape: 'none',
      w: w || 72,
      h: h || 72,
    });
    n.style.fontSize = 40;
    n.style.strokeWidth = 0;
    n.style.bold = false;
    return n;
  };

  MM.createTodoItem = (text) => ({ id: MM.uid('i'), text: text || '', done: false });

  /** Outline entry. `level` 0 = top level; `collapsed` hides its children. */
  MM.createBlock = (text, level) => ({ id: MM.uid('b'), text: text || '', level: level || 0, collapsed: false });

  /** Change a note's type, carrying list content over where it makes sense. */
  MM.setNodeType = function (n, type) {
    if (n.type === type || !MM.NODE_TYPES[type]) return;
    if (type === 'image' || n.type === 'image' || type === 'file' || n.type === 'file') return;
    if (type === 'draw' || n.type === 'draw') return;
    if (type === 'diary' && !n.diary) n.diary = MM.newDiaryMeta();
    if (type === 'todo' && !n.items.length) {
      n.items = n.blocks.length
        ? n.blocks.filter((b) => b.text).map((b) => MM.createTodoItem(b.text))
        : [MM.createTodoItem('First task')];
    }
    if ((type === 'outline' || type === 'task') && !n.blocks.length) {
      n.blocks = n.items.length ? n.items.map((i) => MM.createBlock(i.text, 0)) : [MM.createBlock('', 0)];
    }
    n.type = type;
  };

  MM.createEdge = function (source, target, style) {
    return {
      id: MM.uid('e'),
      source,
      target,
      label: '',
      style: Object.assign({}, MM.state.edgeStyle, style || {}),
    };
  };

  // ---- Outline helpers ---------------------------------------------------
  // Blocks are stored flat; a block's children are the following blocks with
  // a higher level (like an indented text file).

  MM.outline = {
    /** Index after the last descendant of blocks[idx]. */
    subtreeEnd(blocks, idx) {
      let j = idx + 1;
      while (j < blocks.length && blocks[j].level > blocks[idx].level) j++;
      return j;
    },

    hasChildren: (blocks, idx) => idx + 1 < blocks.length && blocks[idx + 1].level > blocks[idx].level,

    /** Indices of blocks not hidden by a collapsed ancestor. */
    visible(blocks) {
      const out = [];
      let hideLevel = Infinity;
      blocks.forEach((b, i) => {
        if (b.level > hideLevel) return;
        hideLevel = Infinity;
        out.push(i);
        if (b.collapsed && MM.outline.hasChildren(blocks, i)) hideLevel = b.level;
      });
      return out;
    },

    /** Indent a block together with its children (max. one level deeper than the block above). */
    indent(blocks, idx) {
      if (idx === 0 || blocks[idx].level > blocks[idx - 1].level) return false;
      const end = MM.outline.subtreeEnd(blocks, idx);
      for (let k = idx; k < end; k++) blocks[k].level++;
      // make sure the new parent is expanded, so the block stays visible
      for (let k = idx - 1; k >= 0; k--) {
        if (blocks[k].level < blocks[idx].level) {
          blocks[k].collapsed = false;
          break;
        }
      }
      return true;
    },

    outdent(blocks, idx) {
      if (blocks[idx].level === 0) return false;
      const end = MM.outline.subtreeEnd(blocks, idx);
      for (let k = idx; k < end; k++) blocks[k].level--;
      return true;
    },

    /** Remove one block; its children move up one level. */
    remove(blocks, idx) {
      const end = MM.outline.subtreeEnd(blocks, idx);
      for (let k = idx + 1; k < end; k++) blocks[k].level--;
      blocks.splice(idx, 1);
    },
  };

  // assets: { <id>: dataURL } - images, referenced by image notes via imageId.
  // Kept out of the undo snapshots because they can be large.
  // carriedOver: the unfinished work of the previous day / week / month was taken over
  // (or the user declined). Plans created ahead of time stay false until their period starts.
  MM.emptyDoc = () => ({
    app: 'MindMapper', version: 1, nodes: {}, edges: {}, assets: {}, view: { x: 0, y: 0, zoom: 1 }, carriedOver: false,
  });

  // Values from a file are untrusted: several of them end up in HTML / SVG
  // markup, so numbers must really be numbers and ids must come from the catalogs.
  const num = (v, fallback) => {
    const x = Number(v);
    return v !== null && v !== '' && isFinite(x) ? x : fallback;
  };
  const str = (v) => (v === null || v === undefined ? '' : String(v));
  const oneOf = (v, catalog, fallback) => (typeof v === 'string' && Object.hasOwn(catalog, v) ? v : fallback);

  /** Fill in missing fields so older or hand-edited files still load. */
  MM.normalizeDoc = function (raw) {
    const doc = MM.emptyDoc();
    if (!raw || typeof raw !== 'object') return doc;
    // older files have no flag: they were created with the old "always carry over" rule
    doc.carriedOver = raw.carriedOver === undefined ? true : !!raw.carriedOver;
    if (raw.view && typeof raw.view === 'object') {
      doc.view = { x: num(raw.view.x, 0), y: num(raw.view.y, 0), zoom: num(raw.view.zoom, 1) || 1 };
    }
    if (raw.assets && typeof raw.assets === 'object') {
      for (const [id, url] of Object.entries(raw.assets)) {
        if (typeof url === 'string' && url.startsWith('data:image/')) doc.assets[id] = url;
      }
    }
    for (const n of Object.values(raw.nodes || {})) {
      if (!n || typeof n !== 'object' || !n.id) continue;
      const type = oneOf(n.type, MM.NODE_TYPES, 'text');
      const base = MM.createNode(type, 0, 0); // defaults, stays untouched
      const node = Object.assign(MM.createNode(type, 0, 0), n);
      node.id = str(n.id);
      node.type = type;
      node.shape = oneOf(n.shape, MM.SHAPES, base.shape);
      node.x = num(n.x, 0);
      node.y = num(n.y, 0);
      node.w = Math.max(10, num(n.w, base.w));
      node.h = Math.max(10, num(n.h, base.h));
      node.text = str(n.text);
      node.style = Object.assign({}, base.style, n.style && typeof n.style === 'object' ? n.style : {});
      for (const k of ['strokeWidth', 'fontSize']) node.style[k] = num(node.style[k], base.style[k] || MM.DEFAULT_NODE_STYLE[k]);
      if (node.style.opacity !== undefined) node.style.opacity = num(node.style.opacity, 1);
      for (const k of ['fill', 'stroke', 'textColor', 'strokeStyle', 'align', 'fit']) {
        if (node.style[k] !== undefined) node.style[k] = str(node.style[k]);
      }
      node.items = (Array.isArray(n.items) ? n.items : []).filter((i) => i && typeof i === 'object')
        .map((i) => Object.assign(i, { id: str(i.id) || MM.uid('i'), text: str(i.text), done: !!i.done }));
      node.blocks = (Array.isArray(n.blocks) ? n.blocks : []).filter((b) => b && typeof b === 'object')
        .map((b) => Object.assign(b, { id: str(b.id) || MM.uid('b'), text: str(b.text), level: Math.max(0, num(b.level, 0)) }));
      node.tags = (Array.isArray(n.tags) ? n.tags : []).map(str).filter(Boolean);
      node.link = str(n.link);
      const m = Object.assign(MM.emptyMeta(), n.meta && typeof n.meta === 'object' ? n.meta : {});
      m.deadline = /^\d{4}-\d{2}-\d{2}$/.test(m.deadline) ? m.deadline : '';
      m.scheduled = /^\d{4}-\d{2}-\d{2}$/.test(m.scheduled) ? m.scheduled : '';
      m.scheduledTime = m.scheduled && /^\d{2}:\d{2}$/.test(m.scheduledTime) ? m.scheduledTime : '';
      if (m.scheduled) m.deadline = ''; // either / or – the appointment wins
      m.estimate = num(m.estimate, null);
      m.priority = oneOf(m.priority, MM.PRIORITIES, 'none');
      m.quadrant = oneOf(QUAD_LEGACY[m.quadrant] || m.quadrant, MM.QUADRANTS, 'none');
      m.status = oneOf(m.status, MM.STATUSES, 'none');
      m.progress = m.progress === null || m.progress === undefined ? null : num(m.progress, null);
      if (m.progress !== null) m.progress = Math.max(0, Math.min(100, m.progress));
      node.meta = m;
      node.derivedMap = str(node.derivedMap);
      node.movedTo = node.movedTo ? str(node.movedTo) : null;
      node.movedFrom = node.movedFrom ? str(node.movedFrom) : null;
      node.movedCopyId = node.movedCopyId ? str(node.movedCopyId) : null;
      node.movedBatch = node.movedBatch ? str(node.movedBatch) : null; // notes moved together
      if (type === 'draw') {
        // drawing: shape, line end points (fractions of the box) and anchor note (see draw.js)
        const frac = (v, d) => Math.max(0, Math.min(1, num(v, d)));
        const l = n.line && typeof n.line === 'object' ? n.line : {};
        node.draw = oneOf(n.draw, MM.DRAW_KINDS, 'rect');
        node.line = { x1: frac(l.x1, 0), y1: frac(l.y1, 0), x2: frac(l.x2, 1), y2: frac(l.y2, 1) };
        const a = n.anchor && typeof n.anchor === 'object' && n.anchor.node ? n.anchor : null;
        const b = (a && a.box && typeof a.box === 'object') ? a.box : {};
        node.anchor = a ? { node: str(a.node), box: { x: num(b.x, 0), y: num(b.y, 0), w: num(b.w, 0), h: num(b.h, 0) } } : null;
      } else {
        delete node.draw;
        delete node.line;
        delete node.anchor;
      }
      if (type === 'diary') {
        // diary entry: which diary, day and time (see diary.js)
        const dm = n.diary && typeof n.diary === 'object' ? n.diary : {};
        const def = MM.newDiaryMeta();
        node.diary = {
          book: str(dm.book).slice(0, 120),
          date: /^\d{4}-\d{2}-\d{2}$/.test(dm.date) ? dm.date : def.date,
          time: /^\d{2}:\d{2}$/.test(dm.time) ? dm.time : '',
        };
      } else {
        delete node.diary;
      }
      node.repeat = MM.normalizeRepeat(n.repeat);
      for (const it of node.items) if (it.routine !== undefined) it.routine = str(it.routine); // entry created from a routine
      if (node.type === 'file') {
        const f = Object.assign({ path: '', name: '', size: 0, mime: '' }, n.file && typeof n.file === 'object' ? n.file : {});
        node.file = { path: str(f.path), name: str(f.name), size: num(f.size, 0), mime: str(f.mime) };
      } else if (node.file) {
        delete node.file;
      }
      doc.nodes[node.id] = node;
    }
    // a drawing anchored to a note that is not there is free (it would be deleted with its note otherwise)
    for (const n of Object.values(doc.nodes)) {
      if (n.anchor && (!doc.nodes[n.anchor.node] || doc.nodes[n.anchor.node].type === 'draw')) n.anchor = null;
    }
    // a connection end is either attached to a note or a free point
    const end = (x) => (typeof x.node === 'string'
      ? { node: x.node, anchor: str(x.anchor) || 'auto' }
      : { x: num(x.x, 0), y: num(x.y, 0) });
    for (const e of Object.values(raw.edges || {})) {
      if (!e || !e.id || !e.source || !e.target || typeof e.source !== 'object' || typeof e.target !== 'object') continue;
      const st = Object.assign({}, MM.DEFAULT_EDGE_STYLE, e.style && typeof e.style === 'object' ? e.style : {});
      const D = MM.DEFAULT_EDGE_STYLE;
      doc.edges[e.id] = {
        id: str(e.id),
        source: end(e.source),
        target: end(e.target),
        label: str(e.label),
        style: Object.assign(st, {
          route: oneOf(st.route, MM.ROUTES, D.route),
          lineStyle: oneOf(st.lineStyle, MM.LINE_STYLES, D.lineStyle),
          startArrow: oneOf(st.startArrow, MM.ARROWS, D.startArrow),
          endArrow: oneOf(st.endArrow, MM.ARROWS, D.endArrow),
          width: num(st.width, D.width),
          color: str(st.color),
        }),
      };
    }
    return doc;
  };

  // ---- App state ---------------------------------------------------------

  MM.state = {
    doc: MM.emptyDoc(),
    selection: new Set(), // node and edge ids
    hover: null,          // id of the node under the pointer (shows anchors)
    drag: null,           // current pointer interaction, see interaction.js
    guides: [],           // smart guide lines to draw
    settings: {
      smartGuides: true, grid: false, gridSize: 20, wheel: 'zoom', showMeta: true,
      showProject: true,   // project sidebar visible
      showPanel: true,     // properties panel visible
      panelWidth: 270,     // properties panel width in px
      overviewRect: null,  // position / size of the overview window { x, y, w, h } (null = centered default)
      theme: 'auto',       // 'auto' | 'light' | 'dark'
      lang: 'en',          // 'en' | 'de'
      autoSaveFile: true,  // maps of a project folder are saved into their file automatically
      emojiRecent: [],     // last used emoji / symbols
      hoursPerDay: 8,      // workload capacity for work days (see workload.js)
      hoursPerWeekendDay: 0, // capacity for non-work days
      workDays: [1, 2, 3, 4, 5], // 0 = Sunday
      lastDiary: '',       // diary of the last diary entry (new entries go there)
      prioSystem: 'levels', // 'levels' | 'eisenhower' (per project folder, see storage.js)
    },
    // view filter (not saved, not part of undo); see meta.js
    filter: {
      open: false, text: '', tags: [], tagMode: 'any', priorities: [], statuses: [],
      deadline: 'any', type: 'any', mode: 'dim', keepChildren: false,
    },
    // bump on every change of doc.nodes/dispatch; invalidates derived caches (see meta.visibleSet)
    rev: 0,
    edgeStyle: MM.clone(MM.DEFAULT_EDGE_STYLE), // style for new connections (last used)
    file: { handle: null, backend: null, name: 'Untitled.mindmap.json', path: null }, // path: location inside the project folder (backend), handle: a single file outside it
    dirty: false,
  };

  MM.node = (id) => MM.state.doc.nodes[id];
  MM.edge = (id) => MM.state.doc.edges[id];
  MM.selectedNodes = () => [...MM.state.selection].map(MM.node).filter(Boolean);
  MM.selectedEdges = () => [...MM.state.selection].map(MM.edge).filter(Boolean);

  MM.select = function (ids) {
    MM.state.selection = new Set(ids);
  };

  /** Remove selection entries whose objects no longer exist. */
  MM.pruneSelection = function () {
    for (const id of [...MM.state.selection]) {
      if (!MM.node(id) && !MM.edge(id)) MM.state.selection.delete(id);
    }
  };

  // ---- Undo / redo -------------------------------------------------------
  // Snapshot based: after every finished user operation call MM.commit().
  // If the document changed since the last snapshot, the old snapshot goes
  // onto the undo stack.

  const snapshot = () => JSON.stringify({ nodes: MM.state.doc.nodes, edges: MM.state.doc.edges });

  MM.history = {
    undoStack: [],
    redoStack: [],
    last: null,
    limit: 300,

    reset() {
      this.undoStack = [];
      this.redoStack = [];
      this.last = snapshot();
      if (MM.routines) MM.routines.track('reset');
    },

    commit() {
      const s = snapshot();
      if (s === this.last) return false;
      this.undoStack.push(this.last);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack = [];
      this.last = s;
      return true;
    },

    restore(s) {
      const data = JSON.parse(s);
      MM.state.doc.nodes = data.nodes;
      MM.state.doc.edges = data.edges;
      this.last = s;
      MM.pruneSelection();
      MM.state.rev++;
      // undo / redo of a checked-off meeting or appointment: the other plans follow (routines.js)
      if (MM.routines) MM.routines.track('restore');
    },

    undo() {
      if (!this.undoStack.length) return false;
      this.redoStack.push(this.last);
      this.restore(this.undoStack.pop());
      return true;
    },

    redo() {
      if (!this.redoStack.length) return false;
      this.undoStack.push(this.last);
      this.restore(this.redoStack.pop());
      return true;
    },
  };

  /** Finish a user operation: record undo step, autosave, redraw. */
  MM.commit = function () {
    // sub-tasks are due by their main task's deadline (see tasks.js)
    const limited = MM.tasks ? MM.tasks.enforceDeadlines(MM.state.doc) : 0;
    if (limited && MM.ui) MM.ui.flash(MM.tr('Sub-task deadline moved back to the main task\'s deadline ({n})', { n: limited }));
    // a meeting / appointment checked off here is checked off in the other plans as well
    if (MM.routines) MM.routines.track('commit');
    // anchored drawings follow their note (draw.js)
    if (MM.draw) MM.draw.sync();
    MM.state.rev++;
    if (MM.history.commit()) {
      MM.state.dirty = true;
      if (MM.storage) MM.storage.scheduleAutosave();
    }
    MM.refresh();
  };

  /** Redraw everything (defined fully in main.js once all modules are loaded). */
  MM.refresh = function () {};
})(window.MM);
