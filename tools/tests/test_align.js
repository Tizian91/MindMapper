const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
try {
  const window = { MM: {} };
  const ctx = vm.createContext({ window, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl, Date });
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8'), ctx, { filename: 'state.js' });
  const MM = window.MM;
  // converting: the new type's alignment, unless it was changed by hand
  const conv = (from, align, to) => {
    const n = MM.createNode(from, 0, 0);
    if (align) n.style.align = align;
    MM.setNodeType(n, to);
    return n.style.align;
  };
  out.push('note -> task         | ' + conv('text', '', 'task') + ' (left)');
  out.push('note right -> task   | ' + conv('text', 'right', 'task') + ' (right - set by hand)');
  out.push('task -> note         | ' + conv('task', '', 'text') + ' (center)');
  out.push('todo justify -> task | ' + conv('todo', 'justify', 'task') + ' (justify)');
  out.push('todo -> outline      | ' + conv('todo', '', 'outline') + ' (left)');
  // older files: a centered list looked left-aligned and stays so; new files keep it
  const doc = (version) => MM.normalizeDoc({
    version, nodes: {
      a: { id: 'a', type: 'task', style: { align: 'center' } },
      b: { id: 'b', type: 'text', style: { align: 'center' } },
      c: { id: 'c', type: 'todo', style: { align: 'right' } },
    }, edges: {},
  });
  const show = (d) => ['a', 'b', 'c'].map((k) => `${d.nodes[k].type}=${d.nodes[k].style.align}`).join(' ') + ' v' + d.version;
  out.push('old file             | ' + show(doc(1)) + ' (task=left text=center todo=right v2)');
  out.push('new file             | ' + show(doc(2)) + ' (task=center text=center todo=right v2)');
} catch (e) { out.push('ERROR ' + e.stack); }
fs.writeFileSync(process.argv[3], out.join('\n'));
