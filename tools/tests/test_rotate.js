const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
try {
  // ---- snapping and the model ----
  const w1 = { MM: {} };
  const c1 = vm.createContext({ window: w1, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null });
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8'), c1, { filename: 'state.js' });
  const M = w1.MM;
  out.push('snap        | ' + [3, 88, 93, 181, 268, 357, 362, -90, 47].map((a) => a + '→' + M.snapAngle(a)).join(' ') + ' | shift 47→' + M.snapAngle(47, true) + ' 353→' + M.snapAngle(353, true));
  const doc = M.normalizeDoc({ nodes: {
    i: { id: 'i', type: 'image', x: 0, y: 0, w: 100, h: 50, rotate: 450 },
    j: { id: 'j', type: 'image', x: 0, y: 0, w: 100, h: 50, rotate: 'x' },
    t: { id: 't', type: 'text', x: 0, y: 0, w: 100, h: 50, rotate: 30 },
  } });
  out.push('normalize   | image 450→' + doc.nodes.i.rotate + ', bad→' + doc.nodes.j.rotate + ', text→' + doc.nodes.t.rotate);

  // ---- two fingers on the selected image (touch.js) ----
  const handlers = {};
  const vp = { addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); }, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const img = { id: 'IMG', type: 'image', x: 100, y: 100, w: 200, h: 100 };
  const target = { classList: { contains: () => false }, closest: (sel) => (sel === '.node' ? { dataset: { id: 'IMG' } } : null) };
  const w2 = { MM: {} };
  const c2 = vm.createContext({ window: w2, document: { getElementById: () => vp, elementFromPoint: () => target }, navigator: {}, setTimeout, clearTimeout, console, Date });
  const MM = w2.MM;
  let commits = 0;
  MM.state = { doc: { view: { x: 0, y: 0, zoom: 1 } }, selection: new Set(['IMG']), drag: null, tool: null };
  MM.node = (id) => (id === 'IMG' ? img : null);
  MM.snapAngle = M.snapAngle;
  MM.canRotate = M.canRotate; // images and emoji notes (state.js)
  MM.render = { applyView() {}, nodes() {}, edges() {}, overlay() {} };
  MM.commit = () => commits++; MM.refresh = () => {}; MM.storage = { scheduleAutosave() {} };
  MM.geo = { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) };
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'touch.js'), 'utf8'), c2, { filename: 'touch.js' });
  MM.touch.init();
  const fire = (type, id, x, y) => { for (const f of handlers[type] || []) f({ type, pointerId: id, pointerType: 'touch', clientX: x, clientY: y, target, button: 0, stopImmediatePropagation() {}, preventDefault() {} }); };
  fire('pointerdown', 1, 150, 150); fire('pointerdown', 2, 250, 150);   // horizontal, 100 apart
  fire('pointermove', 2, 150, 300);                                      // now vertical below: +90°, distance 150
  out.push('twist       | rotate=' + img.rotate + ' (90) size=' + img.w + 'x' + img.h + ' (300x150) pos=' + img.x + ',' + img.y + ' (50,75)');
  fire('pointerup', 2, 150, 300); fire('pointerup', 1, 150, 150);
  out.push('commit      | ' + commits + ' (1)');
  MM.state.selection = new Set();                                        // not selected: two fingers zoom the map
  fire('pointerdown', 1, 100, 100); fire('pointerdown', 2, 200, 100); fire('pointermove', 2, 300, 100);
  fire('pointerup', 2, 300, 100); fire('pointerup', 1, 100, 100);
  out.push('not selected| map zoom=' + MM.state.doc.view.zoom + ' (2), image rotate still ' + img.rotate);
} catch (e) { out.push('ERROR ' + e.stack); }
fs.writeFileSync(process.argv[3], out.join('\n'));
