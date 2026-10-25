const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const window = { MM: {} };
    const ctx = vm.createContext({ window, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl, Date });
    for (const f of ['state.js', 'markdown.js', 'tasks.js', 'meta.js', 'templates.js', 'routines.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = window.MM, R = MM.routines, T = MM.templates;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    MM.render = { esc: (s) => String(s) };
    const pad = (n) => String(n).padStart(2, '0');
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const mon0 = T.mondayOf(new Date());
    const add = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const weekPath = (mon) => 'Weeks/' + T.weekValue(mon) + '.mindmap.json';
    const docs = new Map();
    // a fixed-day routine "M" (Tue) and a 3x routine "X" on week plans of the last weeks
    const plan = (weeksAgo, mDone, xTicks, xBoxes = 3) => {
      const mon = add(mon0, -7 * weeksAgo);
      const doc = MM.emptyDoc();
      const col = MM.createNode('todo', 0, 0, { text: 'Tue' });
      col.meta = Object.assign(MM.emptyMeta(), { deadline: iso(add(mon, 1)) });
      col.items = mDone === null ? [] : [Object.assign(MM.createTodoItem('🔁 M'), { routine: 'M', done: mDone })];
      const list = MM.createNode('todo', 0, 0, { text: 'Band' });
      list.routineList = 'cBand';
      list.items = Array.from({ length: xBoxes }, (_, i) => Object.assign(MM.createTodoItem('🔁 X'), { routine: 'X', done: i < xTicks }));
      doc.nodes[col.id] = col;
      doc.nodes[list.id] = list;
      docs.set(weekPath(mon), doc);
    };
    plan(0, false, 1);         // this week: open
    plan(1, true, 3);          // done / done
    plan(2, true, 2, 2);       // M done, X: one box deleted ("cancelled"), both left ticked -> done
    // 3 weeks ago: no plan
    plan(4, false, 3);         // M missed, X done
    plan(5, true, 0);          // M done, X missed
    plan(6, null, 0, 0);       // M cancelled (entry deleted), X no boxes -> none
    plan(7, true, 3);
    // day plan of 1 week ago with the same M entry (synced) - counted once
    const dmon = add(mon0, -7);
    const day = MM.emptyDoc();
    const dc = MM.createNode('todo', 0, 0, { text: 'Morning' });
    dc.meta = Object.assign(MM.emptyMeta(), { deadline: iso(add(dmon, 1)) });
    dc.items = [Object.assign(MM.createTodoItem('🔁 M'), { routine: 'M', done: true })];
    day.nodes[dc.id] = dc;
    docs.set('Days/' + iso(add(dmon, 1)) + '.mindmap.json', day);
    const idx = R.historyIndex(docs);
    const show = (id) => { const h = R.history(id, idx); return h.weeks.map((w) => ({ done: '▣', missed: '□', open: '◌', none: '·' })[w.state]).join('') + ' streak=' + h.streak; };
    out.push('M (fixed day) | ' + show('M') + '   expected ▣·▣□·▣▣◌ streak=2');
    out.push('X (3x/week)   | ' + show('X') + '   expected ▣·□▣·▣▣◌ streak=2');
    // this week fulfilled -> counts
    for (const n of Object.values(docs.get(weekPath(mon0)).nodes)) for (const it of n.items) it.done = true;
    const idx2 = R.historyIndex(docs);
    out.push('this week done| M streak=' + R.history('M', idx2).streak + ' (3)  X streak=' + R.history('X', idx2).streak + ' (3)');
    out.push('unknown       | any=' + R.history('nope', idx2).any + ' html="' + R.historyHTML('nope', idx2) + '"');
    out.push('html          | ' + R.historyHTML('X', idx2).replace(/title="[^"]*"/g, '').slice(0, 120) + '…');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
