const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
try {
  const w = { MM: {} };
  const c = vm.createContext({ window: w, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, Intl });
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8'), c, { filename: 'state.js' });
  const MM = w.MM;
  const s = MM.createSymbolNode('🥁', 0, 0);
  const old = { id: 'o', type: 'text', shape: 'none', text: '👍🏽', x: 0, y: 0, w: 72, h: 72, style: { fontSize: 40 }, rotate: 30 };
  const family = { id: 'f', type: 'text', shape: 'none', text: '👨‍👩‍👧', x: 0, y: 0, w: 72, h: 72, style: { fontSize: 40 } };
  const plain = { id: 'p', type: 'text', shape: 'rect', text: 'A', x: 0, y: 0, w: 72, h: 72, style: { fontSize: 14 }, rotate: 30 };
  const grown = Object.assign(MM.clone(s), { id: 'g', text: 'Drum practice tomorrow', rotate: 45 });
  const doc = MM.normalizeDoc({ nodes: { [s.id]: Object.assign(MM.clone(s), { rotate: 90 }), o: old, f: family, p: plain, g: grown } });
  const d = (id) => `${doc.nodes[id].symbol ? 'symbol' : 'text'} rotate=${doc.nodes[id].rotate}`;
  out.push('new emoji  | ' + d(s.id) + '  (symbol 90)');
  out.push('old emoji  | ' + d('o') + '  (symbol 30, skin tone = one character)');
  out.push('family     | ' + d('f') + '  (symbol, joined emoji = one character)');
  out.push('plain note | ' + d('p') + '  (text undefined)');
  out.push('long text  | ' + d('g') + '  (text undefined)');
  out.push('canRotate  | image=' + MM.canRotate({ type: 'image' }) + ' symbol=' + MM.canRotate(doc.nodes[s.id]) + ' text=' + MM.canRotate(doc.nodes.p));
} catch (e) { out.push('ERROR ' + e.stack); }
fs.writeFileSync(process.argv[3], out.join('\n'));
