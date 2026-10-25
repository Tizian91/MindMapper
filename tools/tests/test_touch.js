const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const handlers = {};
    const vp = {
      addEventListener: (t, f, cap) => { (handlers[t] = handlers[t] || []).push({ f, cap }); },
      setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    };
    const el = (cls, nodeId) => ({
      classList: { contains: (c) => cls.split(' ').includes(c) },
      closest: (sel) => (sel === '.node' && nodeId ? { dataset: { id: nodeId } } : sel.includes('.handle-resize') && cls.includes('handle-resize') ? {} : null),
    });
    const canvas = el('canvas'), note = el('content', 'N1'), handle = el('handle-resize');
    const document = { getElementById: () => vp, elementFromPoint: () => note };
    const window = { MM: {} };
    const ctx = vm.createContext({ window, document, navigator: {}, setTimeout, clearTimeout, console, Date });
    const MM = window.MM;
    const calls = [];
    MM.state = { doc: { view: { x: 0, y: 0, zoom: 1 } }, selection: new Set(), drag: null, tool: null };
    MM.interaction = {
      pointerDown: (e) => calls.push('down@' + e.clientX), pointerMove: (e) => calls.push('move@' + e.clientX),
      pointerUp: (e) => calls.push('up@' + e.clientX), doubleClick: (e) => calls.push('dbl@' + e.clientX),
    };
    MM.menu = { openFor: (e) => calls.push('menu@' + e.clientX) };
    MM.render = { applyView: () => {} };
    MM.refresh = () => {};
    MM.select = (ids) => calls.push('select ' + ids);
    MM.storage = { scheduleAutosave: () => calls.push('autosave') };
    MM.geo = { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) };
    vm.runInContext(fs.readFileSync(path.join(root, 'js', 'touch.js'), 'utf8'), ctx, { filename: 'touch.js' });
    MM.touch.init();
    // fire through the capture handler, then (unless stopped) the "interaction" bubble handler
    const fire = (type, id, x, y, target, kind = 'touch') => {
      let stopped = false;
      const e = { type, pointerId: id, pointerType: kind, clientX: x, clientY: y, target, button: 0,
        stopImmediatePropagation() { stopped = true; }, preventDefault() {} };
      for (const h of handlers[type] || []) h.f(e);
      if (!stopped) calls.push('mouse-' + type + '@' + x); // reached interaction.js
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const run = async (name, fn) => { calls.length = 0; await fn(); out.push(name.padEnd(14) + '| ' + calls.join(' ')); };
    const v = MM.state.doc.view;

    await run('tap note', async () => { fire('pointerdown', 1, 10, 10, note); fire('pointerup', 1, 11, 10, note); });
    await sleep(400);
    await run('pan', async () => { fire('pointerdown', 1, 10, 10, note); fire('pointermove', 1, 40, 60, note); fire('pointermove', 1, 50, 70, note); fire('pointerup', 1, 50, 70, note); });
    out.push('  view        | x=' + v.x + ' y=' + v.y + ' (40, 60)');
    await run('hold -> menu', async () => { fire('pointerdown', 1, 100, 100, note); await sleep(500); fire('pointerup', 1, 100, 100, note); });
    await run('quiet native', async () => { fire('contextmenu', 0, 100, 100, note, undefined); });
    await sleep(800);
    await run('hold + drag', async () => { fire('pointerdown', 1, 100, 100, note); await sleep(500); fire('pointermove', 1, 130, 100, note); fire('pointermove', 1, 160, 100, note); fire('pointerup', 1, 160, 100, note); });
    await sleep(400);
    await run('double tap', async () => { fire('pointerdown', 1, 20, 20, note); fire('pointerup', 1, 20, 20, note); fire('pointerdown', 1, 22, 21, note); fire('pointerup', 1, 22, 21, note); });
    await sleep(400);
    await run('handle', async () => { fire('pointerdown', 1, 5, 5, handle); fire('pointermove', 1, 25, 5, handle); fire('pointerup', 1, 25, 5, handle); });
    v.x = 0; v.y = 0; v.zoom = 1;
    await run('pinch', async () => {
      fire('pointerdown', 1, 100, 100, canvas); fire('pointerdown', 2, 200, 100, canvas);
      fire('pointermove', 2, 300, 100, canvas); // distance 100 -> 200: zoom 2 around the middle
      fire('pointerup', 2, 300, 100, canvas); fire('pointermove', 1, 50, 50, canvas); fire('pointerup', 1, 50, 50, canvas);
    });
    out.push('  view        | zoom=' + v.zoom + ' x=' + v.x + ' y=' + v.y + ' (zoom 2, world 150,100 under the middle 200,100 -> x=-100 y=-100)');
    await run('mouse', async () => { fire('pointerdown', 9, 1, 1, note, 'mouse'); fire('pointerup', 9, 1, 1, note, 'mouse'); });
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
