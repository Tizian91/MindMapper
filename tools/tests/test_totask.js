const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
try {
  const window = { MM: {} };
  let answer = true, asked = 0;
  const ctx = vm.createContext({ window, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, confirm: () => { asked++; return answer; } });
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'state.js'), 'utf8'), ctx, { filename: 'state.js' });
  const MM = window.MM;
  MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
  MM.ui = { flash: (m) => out.push('  flash: ' + m) };
  let commits = 0;
  MM.commit = () => commits++;
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'actions.js'), 'utf8'), ctx, { filename: 'actions.js' });
  const S = MM.state, A = MM.actions;
  const doc = MM.emptyDoc();
  const mk = (name, type) => { const n = MM.createNode(type, 0, 0, { text: name }); n.id = name; doc.nodes[name] = n; return n; };
  const link = (a, b) => { const e = MM.createEdge({ node: a }, { node: b }); doc.edges[e.id] = e; };
  // A(note) -> B(note) -> C(image) -> D(note);  A -> E(task) -> F(outline);  B -> A (cycle);  A -> G(group) -> H(note);  X(note) alone
  ['A', 'B', 'D', 'H', 'X'].forEach((n) => mk(n, 'text'));
  mk('C', 'image'); mk('E', 'task'); mk('F', 'outline'); mk('G', 'group');
  link('A', 'B'); link('B', 'C'); link('C', 'D'); link('A', 'E'); link('E', 'F'); link('B', 'A'); link('A', 'G'); link('G', 'H');
  S.doc = doc;
  const types = () => Object.values(doc.nodes).map((n) => n.id + ':' + n.type).sort().join(' ');
  MM.selectedNodes = () => [...S.selection].map((id) => doc.nodes[id]);
  S.selection = new Set(['A']);
  out.push('below A       | ' + A.subNotesToConvert([doc.nodes.A]).map((n) => n.id).join(','));
  out.push('below image C | ' + A.subNotesToConvert([doc.nodes.C]).map((n) => n.id).join(',') + '(empty)');
  answer = false;
  A.setType('task');
  out.push('A->task, no   | asked=' + asked + ' ' + types());
  doc.nodes.A.type = 'text';
  answer = true;
  A.setType('task');
  out.push('A->task, yes  | asked=' + asked + ' ' + types() + ' commits=' + commits);
  // nothing below: no question
  S.selection = new Set(['X']);
  A.setType('task');
  out.push('X->task       | asked=' + asked + ' (unchanged 2)');
  // menu action from a fresh note with a sub-tree
  doc.nodes.X.type = 'text'; doc.nodes.D.type = 'text';
  link('X', 'D');
  out.push('menu shows    | ' + (A.subNotesToConvert([doc.nodes.X]).length > 0));
  A.makeTasksWithSubNotes();
  out.push('menu action   | X:' + doc.nodes.X.type + ' D:' + doc.nodes.D.type);
} catch (e) { out.push('ERROR ' + e.stack); }
fs.writeFileSync(process.argv[3], out.join('\n'));
