const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
try {
  const w = { MM: {} };
  const ctx = vm.createContext({ window: w, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl });
  for (const f of ['state.js', 'meta.js', 'transfer.js', 'templates.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
  const MM = w.MM, T = MM.templates;
  MM.tr = (s) => s;
  const doc = MM.emptyDoc();
  const add = (type, text, meta) => {
    const n = MM.createNode(type, 0, 0, { text });
    n.meta = Object.assign(MM.emptyMeta(), meta);
    doc.nodes[n.id] = n;
    return n;
  };
  add('task', 'Bericht', { deadline: '2026-11-06', estimate: 120, status: 'open' });
  add('task', 'Zahnarzt', { scheduled: '2026-12-01', scheduledTime: '10:00', estimate: 60, status: 'open' });
  add('task', 'Erledigt', { deadline: '2026-11-06', status: 'done' });
  const list = add('todo', 'Termine', { scheduled: '2026-11-20', estimate: 30 });
  list.items = [MM.createTodoItem('Unterlagen')];
  const tasks = add('todo', 'Aufgaben', { deadline: '2026-11-06', estimate: 30 });
  tasks.items = [MM.createTodoItem('Folie 3')];
  const c = T.collectUnfinished(doc);
  out.push('moving notes | [' + c.notes.map((n) => n.text).sort().join(', ') + '] ([] - notes stay; the next plan lists them, tasklists.js)');
  out.push('open items   | ' + c.items.map((i) => i.text).join(', ') + ' (Folie 3 - not the entries of the appointment list)');
  out.push('count        | ' + (c.items.length + c.open) + ' (1 - only the loose entry)');
} catch (e) { out.push('ERROR ' + e.stack); }
fs.writeFileSync(process.argv[3], out.join('\n'));
