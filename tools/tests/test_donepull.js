const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const window = { MM: {} };
    const ctx = vm.createContext({ window, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl, Date });
    for (const f of ['state.js', 'markdown.js', 'tasks.js', 'meta.js', 'templates.js', 'routines.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = window.MM;
    MM.tr = (t) => t; MM.t = (t) => t;
    // a plan made or opened after something was checked off elsewhere takes it over
    const rdoc = MM.emptyDoc();
    const meet = MM.createNode('note', 0, 0, { text: 'Group meeting' });
    meet.repeat = MM.normalizeRepeat({ kind: 'weekly', every: 1, days: [2], time: '09:00' });
    meet.meta = Object.assign(meet.meta || {}, { estimate: 60 });
    const appt = MM.createNode('task', 0, 0, { text: 'Dentist' });
    appt.meta = Object.assign(appt.meta || {}, { scheduled: '2026-11-02', scheduledTime: '14:00', estimate: 30 });
    for (const n of [meet, appt]) rdoc.nodes[n.id] = n;
    const wpath = 'Weeks/2026-W45.mindmap.json';
    const w = MM.templates.forPath(wpath).result.doc;
    const docs = new Map([['Routinen.mindmap.json', rdoc], [wpath, w]]);
    MM.load = { loaded: () => true, refresh: async () => {}, docs: () => docs, complete: () => true };

    const entries = (doc) => Object.values(doc.nodes).filter((n) => n.type === 'todo')
      .map((n) => `${n.text}[${n.items.filter((i) => i.routine).map((i) => (i.done ? '✓' : '') + i.text.split(' ').slice(0, 2).join(' ')).join('; ')}]`).filter((s) => !s.endsWith('[]')).join(' ');
    const check = (doc, id) => { for (const n of Object.values(doc.nodes)) for (const i of n.items || []) if (i.routine === id) i.done = true; };

    await MM.routines.addToPlan(w, wpath);
    out.push('week          | ' + entries(w));
    // a plan made before: checked off in the week while it was closed
    const d3path = 'Days/2026-11-03.mindmap.json';
    const d3 = MM.templates.forPath(d3path).result.doc;
    await MM.routines.addToPlan(d3, d3path);
    check(w, meet.id);
    out.push('opened again  | ' + JSON.stringify(await MM.routines.addToPlan(d3, d3path, { fill: true })) + ' ' + entries(d3) + ' (updated 1, ✓Group)');
    // a plan made after: the entry comes checked
    const d3b = MM.templates.forPath(d3path).result.doc;
    await MM.routines.addToPlan(d3b, d3path);
    out.push('made later    | ' + entries(d3b) + ' (✓Group)');
    // a done appointment is listed - checked (it was missing before)
    appt.meta.status = 'done';
    const d2path = 'Days/2026-11-02.mindmap.json';
    const d2 = MM.templates.forPath(d2path).result.doc;
    await MM.routines.addToPlan(d2, d2path);
    out.push('done appt     | ' + entries(d2) + ' (✓📌 Dentist)');
    // the week keeps its (open) entry of the done appointment and checks it
    out.push('week fill     | ' + JSON.stringify(await MM.routines.addToPlan(w, wpath, { fill: true })) + ' ' + entries(w) + ' (✓📌 Dentist, ✓Group)');
    // other weeks / days are not touched
    const d4path = 'Days/2026-11-10.mindmap.json';
    const d4 = MM.templates.forPath(d4path).result.doc;
    await MM.routines.addToPlan(d4, d4path);
    out.push('next Tuesday  | ' + entries(d4) + ' (open Group)');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
