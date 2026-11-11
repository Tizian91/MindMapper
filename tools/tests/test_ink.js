// Freehand (js/ink.js): outline of a stroke, fewer points, box and fractions, strokes joined
// into one drawing or not, anchoring, erasing, saving (normalizeDoc).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
const check = (label, cond, extra) => out.push(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra !== undefined ? ' (' + extra + ')' : ''}`);
try {
  const w = { MM: {} };
  const ctx = vm.createContext({ window: w, console, document: {}, navigator: { language: 'en' }, setTimeout, clearTimeout, Intl });
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8'), ctx, { filename: 'state.js' });
  const MM = w.MM;
  MM.actions = {};
  MM.tr = (s) => s;
  for (const f of ['draw.js', 'ink.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
  const S = MM.state, K = MM.ink, D = MM.draw;
  S.doc = MM.emptyDoc();
  const line = (x0, y0, x1, y1, n, p) => {
    const a = [];
    for (let i = 0; i <= n; i++) a.push(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, p === undefined ? 1 : p);
    return a;
  };

  // ---- outline ----
  const o = K.outline([0, 0, 1, 100, 0, 1], 10, false);
  check('outline: closed path with round ends', /^M/.test(o) && /Z$/.test(o) && (o.match(/A5,5/g) || []).length === 2, o);
  check('outline: left side at +5 (full pressure, width 10)', o.startsWith('M0,5'), o.slice(0, 12));
  const light = K.outline([0, 0, 0.1, 100, 0, 0.1], 10, false);
  check('outline: light pressure is thinner', /A[0-9.]+/.exec(light)[0] !== 'A5' && parseFloat(/A([0-9.]+)/.exec(light)[1]) < 3, /A([0-9.]+)/.exec(light)[1]);
  const even = K.outline([0, 0, 0.1, 100, 0, 0.1], 10, true);
  check('outline: marker has an even width (pressure ignored)', /A5,5/.test(even));
  const dot = K.outline([5, 5, 1], 4, false);
  check('outline: a single point is a dot', /^M3,5a2,2/.test(dot), dot);
  check('outline: empty stroke', K.outline([], 4, false) === '');

  // ---- fewer points ----
  const straight = line(0, 0, 200, 0, 100, 0.5);
  check('simplify: a straight line keeps its two ends', K.simplify(straight, 0.4).length === 6, K.simplify(straight, 0.4).length / 3);
  const zig = [0, 0, 1, 10, 10, 1, 20, 0, 1, 30, 10, 1, 40, 0, 1];
  check('simplify: corners stay', K.simplify(zig, 0.4).length === zig.length);
  const press = line(0, 0, 100, 0, 20, 0.2).map((v, i) => (i % 3 === 2 ? (i < 30 ? 0.2 : 0.9) : v));
  check('simplify: a change of pressure stays', K.simplify(press, 0.4).length > 6, K.simplify(press, 0.4).length / 3);

  // ---- box and fractions ----
  const pen = { tool: 'pen', color: '#1f2937', width: 4 };
  const s1 = line(100, 100, 180, 140, 10);
  K.last = null;
  const n1 = K.add(s1, pen);
  check('new drawing: type draw / ink, colour and width', n1.type === 'draw' && n1.draw === 'ink' && n1.style.stroke === '#1f2937' && n1.style.strokeWidth === 4 && !n1.marker && !('line' in n1));
  check('box around the stroke (+ half the width + 1)', n1.x === 97 && n1.y === 97 && n1.w === 86 && n1.h === 46, [n1.x, n1.y, n1.w, n1.h].join(','));
  const back = K.strokes(n1)[0];
  check('fractions -> world: the same points', Math.abs(back[0] - 100) < 0.05 && Math.abs(back[back.length - 2] - 140) < 0.05, back.slice(-3).join(','));
  check('fractions between 0 and 1', n1.ink[0].every((v, i) => i % 3 === 2 || (v >= 0 && v <= 1)));
  check('D.path uses the outlines', D.path(n1) === K.path(n1) && /Z$/.test(D.path(n1)));
  // a flat stroke: box at least 10 high
  const flat = K.add(line(1000, 1000, 1100, 1000, 5), Object.assign({}, pen, { width: 1 }));
  check('flat stroke: box at least 10', flat.h === 10 && Math.abs(K.strokes(flat)[0][1] - 1000) < 0.01, flat.h);

  // ---- joined or not ----
  K.last = n1.id;
  const n2 = K.add(line(190, 100, 230, 140, 6), pen);
  check('close by, same pen: joins the drawing', n2 === n1 && n1.ink.length === 2 && Object.keys(S.doc.nodes).filter((k) => S.doc.nodes[k].draw === 'ink').length === 2);
  check('joined: box grows, old stroke stays in place', Math.abs(K.strokes(n1)[0][0] - 100) < 0.05 && n1.x + n1.w >= 230);
  const far = K.add(line(600, 600, 650, 650, 5), pen);
  check('far away: a new drawing', far !== n1 && far.ink.length === 1);
  K.last = n1.id;
  const red = K.add(line(200, 120, 220, 130, 4), Object.assign({}, pen, { color: '#dc2626' }));
  check('other colour: a new drawing', red !== n1);
  K.last = n1.id;
  const mk = K.add(line(200, 120, 260, 120, 4), { tool: 'marker', color: '#facc15', width: 20 });
  check('marker: a new drawing, see-through', mk !== n1 && mk.marker === true && mk.style.opacity === 0.4);

  // anchored to the note it starts on
  const note = MM.createNode('text', 2000, 2000);
  S.doc.nodes[note.id] = note;
  K.last = null;
  const on = K.add(line(1990, 1995, 2010, 2005, 4), Object.assign({}, pen, { under: note }));
  check('on a note: anchored to it', on.anchor && on.anchor.node === note.id);
  const on2 = K.add(line(2012, 1995, 2030, 2005, 4), Object.assign({}, pen, { under: note }));
  check('next stroke on the same note: joins', on2 === on && on.ink.length === 2);
  const other = MM.createNode('text', 2060, 2000);
  S.doc.nodes[other.id] = other;
  const on3 = K.add(line(2050, 1995, 2070, 2005, 4), Object.assign({}, pen, { under: other }));
  check('stroke on another note: new drawing anchored there', on3 !== on && on3.anchor.node === other.id);
  // anchored drawing follows its note (draw.js), strokes scale with the box
  const before = K.strokes(on)[0].slice(0, 2);
  note.x += 100;
  note.w *= 2;
  D.follow(S.doc);
  const after = K.strokes(on)[0].slice(0, 2);
  check('note moved / wider: the strokes follow', after[0] > before[0] + 90, before[0].toFixed(1) + ' -> ' + after[0].toFixed(1));

  // ---- erasing ----
  const count = () => Object.values(S.doc.nodes).filter((x) => x.draw === 'ink').length;
  const c0 = count();
  check('eraser away from strokes: nothing', K.eraseAt({ x: 5000, y: 5000 }, 10) === false && count() === c0);
  const firstStroke = K.strokes(n1)[0];
  check('eraser on one stroke: only that one goes', K.eraseAt({ x: firstStroke[0], y: firstStroke[1] }, 5) === true && n1.ink.length === 1 && S.doc.nodes[n1.id]);
  const rest = K.strokes(n1)[0];
  K.eraseAt({ x: rest[0], y: rest[1] }, 5);
  check('last stroke erased: the drawing goes', !S.doc.nodes[n1.id] && count() === c0 - 1);
  const mid = K.strokes(far)[0];
  check('eraser hits a segment between points', K.eraseAt({ x: (mid[0] + mid[3]) / 2 + 1, y: (mid[1] + mid[4]) / 2 - 1 }, 3) && !S.doc.nodes[far.id]);

  // ---- saving: normalizeDoc ----
  const raw = JSON.parse(JSON.stringify(S.doc));
  raw.nodes[on.id].ink.push([0.1, 0.2, 0.5, 0.3]); // broken: not a multiple of 3
  raw.nodes[on.id].ink.push('x');
  const rect = MM.createNode('draw', 0, 0, { draw: 'rect', ink: [[0, 0, 1]], marker: true });
  raw.nodes[rect.id] = JSON.parse(JSON.stringify(rect));
  const doc = MM.normalizeDoc(raw);
  const nn = doc.nodes[on.id];
  check('saved: ink and anchor kept', nn.draw === 'ink' && nn.ink.length === 3 && nn.anchor && nn.anchor.node === note.id, nn.ink.length);
  check('saved: broken stroke trimmed to whole points', nn.ink[2].length === 3);
  check('saved: marker flag', doc.nodes[mk.id].marker === true && nn.marker === false);
  check('saved: a shape has no ink', doc.nodes[rect.id].draw === 'rect' && !('ink' in doc.nodes[rect.id]) && !('marker' in doc.nodes[rect.id]));
  check('saved: same path after loading', K.path(nn).length > 0 && K.path(doc.nodes[mk.id]) === K.path(mk));
  check('file size: about 3 numbers per point', JSON.stringify(nn.ink).length < 400, JSON.stringify(nn.ink).length);

  // ---- shape recognition (K.recognize) ----
  const along = (corners, per) => { // a stroke along the corners, a little shaky
    const a = [];
    for (let c = 0; c + 1 < corners.length; c++) {
      const [x0, y0] = corners[c], [x1, y1] = corners[c + 1];
      for (let i = 0; i < per; i++) a.push(x0 + ((x1 - x0) * i) / per + Math.sin(a.length) * 1.5, y0 + ((y1 - y0) * i) / per + Math.cos(a.length) * 1.5, 1);
    }
    const [lx, ly] = corners[corners.length - 1];
    a.push(lx, ly, 1);
    return a;
  };
  const circle = [];
  for (let i = 0; i <= 60; i++) circle.push(200 + 100 * Math.cos((i / 60) * 2 * Math.PI) + Math.sin(i) * 2, 200 + 60 * Math.sin((i / 60) * 2 * Math.PI), 1);
  const rec = (pts) => (K.recognize(pts, 40) || { kind: null }).kind;
  check('recognise: a straight stroke is a line', rec(along([[0, 0], [300, 10]], 30)) === 'line');
  const lv = K.recognize(along([[0, 0], [300, 10]], 30), 40);
  check('recognise: a nearly level line becomes level', lv && Math.abs(lv.b.y - lv.a.y) < 0.5, lv && lv.b.y);
  check('recognise: rectangle', rec(along([[0, 0], [300, 0], [300, 200], [0, 200], [2, 4]], 20)) === 'rect');
  check('recognise: rectangle started in the middle of a side', rec(along([[150, 0], [300, 0], [300, 200], [0, 200], [0, 0], [140, 2]], 20)) === 'rect');
  check('recognise: ellipse', rec(circle) === 'ellipse');
  check('recognise: triangle', rec(along([[150, 0], [300, 250], [0, 250], [148, 6]], 25)) === 'triangle');
  check('recognise: diamond', rec(along([[150, 0], [300, 150], [150, 300], [0, 150], [146, 4]], 25)) === 'diamond');
  check('recognise: a scribble is nothing', rec(along([[0, 0], [100, 80], [20, 160], [160, 30], [60, 220]], 15)) === null);
  check('recognise: small strokes (letters) are nothing', rec(along([[0, 0], [20, 0], [20, 15], [0, 15], [0, 1]], 5)) === null);
  check('recognise: a hook (open, bent) is nothing', rec(along([[0, 0], [200, 0], [200, 150]], 20)) === null);
  const box = K.recognize(along([[10, 20], [310, 20], [310, 220], [10, 220], [12, 24]], 20), 40);
  check('recognise: box of a shape', box && Math.abs(box.a.x - 10) < 4 && Math.abs(box.b.y - 220) < 4, box && JSON.stringify(box.a));

  // ---- lasso: inside a loop ----
  const loop = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  check('inside: point in the loop', K.inside({ x: 50, y: 50 }, loop) && !K.inside({ x: 150, y: 50 }, loop));

  // ---- new shapes: paths and outlines ----
  for (const kind of ['round', 'triangle', 'diamond', 'arrow2']) {
    const s = D.create(kind, { x: 0, y: 0 }, { x: 100, y: 60 }, false);
    check('shape ' + kind + ': path and outline', /^M/.test(D.path(s)) && D.outline(s).length >= 2);
  }
  const tri = D.create('triangle', { x: 1000, y: 1000 }, { x: 1100, y: 1100 }, false);
  check('eraser takes a shape on its line', K.eraseAt({ x: 1000, y: 1099 }, 3) && !S.doc.nodes[tri.id]);
  const box2 = D.create('rect', { x: 2000, y: 2000 }, { x: 2200, y: 2200 }, false);
  check('eraser in the middle of a rectangle leaves it', !K.eraseAt({ x: 2100, y: 2100 }, 3) && S.doc.nodes[box2.id]);
  check('saved: new shape kinds stay', MM.normalizeDoc({ nodes: { a: { id: 'a', type: 'draw', draw: 'diamond' } } }).nodes.a.draw === 'diamond');

  // ---- settings of older versions: the line tool became "Shapes" ----
  S.settings.pen = { tool: 'line', line: { color: '#dc2626', width: 6 } };
  const cfg = K.cfg();
  check('old line tool: Shapes with a line, colour and width kept', cfg.tool === 'shape' && cfg.shape.kind === 'line' && cfg.shape.color === '#dc2626' && cfg.shape.width === 6);
  check('recognise shapes is on by default', cfg.recognize === true);
} catch (e) {
  out.push('ERROR ' + (e && e.stack || e));
}
fs.writeFileSync(process.argv[3], out.join('\n') + '\n');
