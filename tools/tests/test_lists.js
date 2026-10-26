const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
try {
  const w = { MM: {} };
  const ctx = vm.createContext({ window: w, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl });
  for (const f of ['state.js', 'meta.js', 'tasks.js', 'templates.js', 'overview.js', 'tasklists.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
  }
  const MM = w.MM, T = MM.templates, TL = MM.taskLists;
  MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
  MM.t = (k, d) => d || k;
  const p2 = (v) => String(v).padStart(2, '0');
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };

  // a project: the plan of this week, and a map with the tasks
  const weekPath = 'Weeks/' + T.weekValue(new Date()) + '.mindmap.json';
  const plan = T.forPath(weekPath).result.doc;
  const work = MM.emptyDoc();
  const add = (doc, type, text, meta) => {
    const n = MM.createNode(type, 0, 0, { text });
    n.meta = Object.assign(MM.emptyMeta(), meta);
    doc.nodes[n.id] = n;
    return n;
  };
  const link = (doc, a, b) => { const e = MM.createEdge({ node: a.id, anchor: 'auto' }, { node: b.id, anchor: 'auto' }); doc.edges[e.id] = e; };
  const poster = add(work, 'task', 'Poster', { deadline: day(3), estimate: 600, status: 'progress' });
  const s1 = add(work, 'task', 'Abbildungen', { deadline: day(2), estimate: 240, status: 'done', progress: 100 });
  const s2 = add(work, 'task', 'Texte', { deadline: day(3), estimate: 120, status: 'open' });
  link(work, poster, s1);
  link(work, poster, s2);
  const antrag = add(work, 'task', 'Antrag', { deadline: day(-1), estimate: 60, status: 'open' });
  const merch = add(work, 'task', 'Merch', { status: 'open' });
  add(work, 'task', 'Fern', { deadline: day(60), estimate: 60, status: 'open' });
  add(work, 'task', 'Zahnarzt', { scheduled: day(2), estimate: 60, status: 'open' });
  add(work, 'task', 'Fertig', { deadline: day(1), status: 'done' });
  const docs = () => new Map([[weekPath, plan], ['Projekte/Work.mindmap.json', work]]);
  const show = () => {
    const lists = Object.values(plan.nodes).filter((n) => n.taskList);
    const of = (k) => lists.find((n) => n.taskList === k);
    return 'overdue [' + of('overdue').items.map((i) => (i.done ? '✓' : '') + i.text.split(' · ')[0]).join(', ') +
      '] open "' + of('open').text + '" [' + of('open').items.map((i) => (i.done ? '✓' : '') + i.text.split(' · ')[0]).join(', ') + ']';
  };

  out.push('running      | this week ' + TL.running(weekPath) + ', last year ' + TL.running('Weeks/2025-W44.mindmap.json') + ' (true, false)');
  out.push('first fill   | changed ' + TL.fill(plan, weekPath, docs()) + ' | ' + show());
  out.push('             | (overdue [Antrag], open "Open tasks (+1 later)" [Poster, Merch] - no sub-task, no appointment, no done, no plan column)');
  const posterItem = Object.values(plan.nodes).find((n) => n.taskList === 'open').items[0];
  out.push('entry text   | ' + posterItem.text + ' (Poster · 📅 dd.mm. · ☑ 1/2 · % - ref ' + (posterItem.ref.id === poster.id) + ')');
  out.push('again        | changed ' + TL.fill(plan, weekPath, docs()) + ' (false - nothing to write)');
  // done elsewhere, overdue now, deleted
  antrag.meta.status = 'done';
  poster.meta.deadline = day(-2);
  delete work.nodes[merch.id];
  out.push('changes      | changed ' + TL.fill(plan, weekPath, docs()) + ' | ' + show());
  out.push('             | (overdue [Poster, ✓Antrag], open [] - Merch gone)');
  // a plan of last year: nothing
  const old = T.forPath('Weeks/2025-W44.mindmap.json').result.doc;
  out.push('past plan    | changed ' + TL.fill(old, 'Weeks/2025-W44.mindmap.json', docs()) + ', lists ' + Object.values(old.nodes).filter((n) => n.taskList).length + ' (false, 0)');
} catch (e) { out.push('ERROR ' + e.stack); }
fs.writeFileSync(process.argv[3], out.join('\n'));
