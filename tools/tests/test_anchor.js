const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
try {
  const window = { MM: {} };
  const ctx = vm.createContext({ window, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl, Date });
  const MM = window.MM;
  MM.actions = {};
  for (const f of ['state.js', 'meta.js', 'draw.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
  const S = MM.state, D = MM.draw, A = MM.actions;
  MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
  MM.ui = { flash: (s) => out.push('  flash: ' + s) };
  MM.commit = () => {};
  // topmost note containing the point (drawings never count), as in interaction.js
  MM.interaction = {
    nodeAt: (p) => Object.values(S.doc.nodes).reverse().find((n) => n.type !== 'draw' && p.x >= n.x && p.x <= n.x + n.w && p.y >= n.y && p.y <= n.y + n.h) || null,
  };
  S.doc = MM.emptyDoc();
  const note = (x, y, w, h, text) => {
    const n = MM.createNode('text', x, y, { text });
    Object.assign(n, { x, y, w, h });
    S.doc.nodes[n.id] = n;
    return n;
  };
  const draw = (x, y, w, h, kind = 'arrow') => {
    const n = MM.createNode('draw', x, y, { draw: kind, anchor: null });
    Object.assign(n, { x, y, w, h });
    S.doc.nodes[n.id] = n;
    return n;
  };
  const N = note(0, 0, 200, 100, 'Bild');
  const M = note(400, 0, 200, 100, 'Andere');
  // an arrow from outside onto the note: its centre lies beside it
  const arrow = draw(150, -120, 40, 160);
  const box = draw(20, 20, 50, 30, 'rect');
  const far = draw(1000, 1000, 20, 20, 'rect');
  out.push('below (arrow)    | ' + ((D.noteBelow(arrow) || {}).text || '-') + ' (Bild - overlaps most)');
  out.push('below (far)      | ' + ((D.noteBelow(far) || {}).text || '-') + ' (-)');

  // Ctrl+G with only the note selected: the free drawings lying on it
  S.selection = new Set([N.id]);
  A.drawAnchor();
  const on = (d) => (d.anchor ? S.doc.nodes[d.anchor.node].text : '-');
  out.push('Ctrl+G on note   | arrow=' + on(arrow) + ' box=' + on(box) + ' far=' + on(far) + ' (Bild, Bild, -)');
  S.selection = new Set([M.id]);
  A.drawAnchor();
  // Ctrl+G with a drawing and another note: to that note
  S.selection = new Set([box.id, M.id]);
  A.drawAnchor();
  out.push('drawing + note   | box=' + on(box) + ' (Andere)');
  out.push('anchoredTo       | ' + D.anchoredTo(new Set([N.id])).map((id) => S.doc.nodes[id].draw).join(',') + ' (arrow)');
  // Ctrl+Shift+G with the note: its drawings come off
  S.selection = new Set([N.id]);
  A.drawDetach();
  out.push('Ctrl+Shift+G     | arrow=' + on(arrow) + ' box=' + on(box) + ' (-, Andere)');
} catch (e) { out.push('ERROR ' + e.stack); }
fs.writeFileSync(process.argv[3], out.join('\n'));
