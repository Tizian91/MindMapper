const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
try {
  const w = { MM: {} };
  const ctx = vm.createContext({ window: w, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl });
  for (const f of ['state.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
  const MM = w.MM, O = MM.outline;

  // a task: two bullet points, two check boxes (one ticked), one empty check box
  const task = MM.createNode('task', 0, 0, { text: 'Poster' });
  task.blocks = [MM.createBlock('Notiz', 0), MM.createBlock('Abbildungen', 0), MM.createBlock('Texte', 1), MM.createBlock('Druck', 0), MM.createBlock('', 0)];
  O.setCheck(task.blocks[1], true);
  task.blocks[1].check = true;
  O.setCheck(task.blocks[2], true);
  O.setCheck(task.blocks[4], true);
  const c = O.checks(task.blocks);
  out.push('checks       | ' + c.done + '/' + c.total + ' (1/2 - bullets and empty lines do not count)');
  out.push('is check     | ' + task.blocks.map(O.isCheck).join(', ') + ' (false, true, true, false, true)');

  // saved and read again: bullets stay without the field, check boxes keep their state
  const doc = MM.emptyDoc();
  doc.nodes[task.id] = task;
  const again = MM.normalizeDoc(JSON.parse(JSON.stringify(doc)));
  const bl = again.nodes[task.id].blocks;
  out.push('read again   | ' + bl.map((b) => (b.check === undefined ? '-' : b.check)).join(', ') + ' (-, true, false, -, false)');
  const legacy = MM.normalizeDoc({ nodes: { a: { id: 'a', type: 'task', blocks: [{ id: 'b', text: 'x', level: 0, check: null }] } }, edges: {} });
  out.push('old file     | check in block: ' + ('check' in legacy.nodes.a.blocks[0]) + ' (false - null is a bullet point)');

  // turning back into a bullet point
  O.setCheck(task.blocks[3], true);
  O.setCheck(task.blocks[3], false);
  out.push('back         | ' + ('check' in task.blocks[3]) + ' (false)');

  // Markdown export: check boxes as [ ] / [x]
  out.push('markdown     | ' + MM.toMarkdown(task).split('\n').slice(2).join(' / '));
  out.push('             | (- Notiz / - [x] Abbildungen /   - [ ] Texte / - Druck)');

  // task -> to-do: ticked lines stay ticked; to-do -> task: entries become check boxes
  const t2 = MM.clone(task);
  t2.items = [];
  MM.setNodeType(t2, 'todo');
  out.push('to to-do     | ' + t2.items.map((i) => (i.done ? '✓' : '') + i.text).join(', ') + ' (Notiz, ✓Abbildungen, Texte, Druck)');
  const todo = MM.createNode('todo', 0, 0, { text: 'Liste' });
  todo.items = [Object.assign(MM.createTodoItem('A'), { done: true }), MM.createTodoItem('B')];
  todo.blocks = [];
  MM.setNodeType(todo, 'task');
  out.push('to task      | ' + todo.blocks.map((b) => (b.check ? '✓' : '☐') + b.text).join(', ') + ' (✓A, ☐B)');
} catch (e) { out.push('ERROR ' + e.stack); }
fs.writeFileSync(process.argv[3], out.join('\n'));
