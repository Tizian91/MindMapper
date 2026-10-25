const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const window = { MM: {} };
    const ctx = vm.createContext({ window, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl, Date });
    for (const f of ['state.js', 'markdown.js', 'tasks.js', 'meta.js', 'templates.js', 'routines.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = window.MM;
    MM.tr = (t) => t; MM.t = (t) => t;
    const rdoc = MM.emptyDoc();
    const meet = MM.createNode('note', 0, 0, { text: 'Group meeting' });
    meet.repeat = MM.normalizeRepeat({ kind: 'weekly', every: 1, days: [2], time: '10:00' });
    meet.meta = Object.assign(meet.meta || {}, { estimate: 60 });
    const budget = MM.createNode('note', 0, 0, { text: 'Students' });
    budget.repeat = MM.normalizeRepeat({ kind: 'budget', every: 1, days: [3] });
    budget.meta = Object.assign(budget.meta || {}, { estimate: 180 });
    const appt = MM.createNode('task', 0, 0, { text: 'Dentist' });
    appt.meta = Object.assign(appt.meta || {}, { scheduled: '2026-11-02', scheduledTime: '14:00', estimate: 30 });
    const appt2 = MM.createNode('task', 0, 0, { text: 'Doctor' });
    appt2.meta = Object.assign(appt2.meta || {}, { scheduled: '2026-11-05', estimate: 30 });
    for (const n of [meet, budget, appt, appt2]) rdoc.nodes[n.id] = n;
    let docs = new Map([['Routinen.mindmap.json', rdoc]]), complete = true;
    MM.load = { loaded: () => true, refresh: async () => {}, docs: () => docs, complete: () => complete };
    const fill = async (doc, p) => JSON.stringify(await MM.routines.addToPlan(doc, p, { fill: true }));

    const entries = (doc) => Object.values(doc.nodes).filter((n) => n.type === 'todo')
      .map((n) => `${n.text}[${n.items.filter((i) => i.routine).map((i) => (i.done ? '✓' : '') + i.text.split(' ').slice(0, 2).join(' ')).join('; ')}]`).filter((s) => !s.endsWith('[]')).join(' ');

    const wpath = 'Weeks/2026-W45.mindmap.json';
    const w = MM.templates.forPath(wpath).result.doc;
    out.push('created    | n=' + (await MM.routines.addToPlan(w, wpath)) + ' ' + entries(w));
    out.push('fill again | ' + (await fill(w, wpath)));
    // check off Doctor, then delete both appointment notes
    for (const n of Object.values(w.nodes)) for (const i of n.items || []) if (i.routine === appt2.id) i.done = true;
    delete rdoc.nodes[appt.id];
    delete rdoc.nodes[appt2.id];
    out.push('incomplete | ' + ((complete = false), await fill(w, wpath)) + ' ' + entries(w));
    complete = true;
    out.push('deleted    | ' + (await fill(w, wpath)) + ' ' + entries(w));
    // appointment comes back on Wed (restored note), meeting moves to Thu
    rdoc.nodes[appt.id] = appt;
    appt.meta.scheduled = '2026-11-04';
    meet.repeat = MM.normalizeRepeat({ kind: 'weekly', every: 1, days: [4], time: '10:00' });
    out.push('moved      | ' + (await fill(w, wpath)) + ' ' + entries(w));
    // back to Mon: the Mon entry comes again (its key was released)
    appt.meta.scheduled = '2026-11-02';
    out.push('back       | ' + (await fill(w, wpath)) + ' ' + entries(w));
    // budget ends: its open entry goes
    delete rdoc.nodes[budget.id];
    out.push('budget gone| ' + (await fill(w, wpath)) + ' ' + entries(w));
    // day plan
    const dpath = 'Days/2026-11-02.mindmap.json';
    const d = MM.templates.forPath(dpath).result.doc;
    await MM.routines.addToPlan(d, dpath);
    out.push('day        | ' + entries(d));
    appt.meta.scheduled = '2026-11-03';
    out.push('day moved  | ' + (await fill(d, dpath)) + ' ' + entries(d));
    // past days stay: this week, entries on Tue 20 Oct (past) and Sat 24 Oct
    meet.repeat = MM.normalizeRepeat({ kind: 'weekly', every: 1, days: [2, 6], time: '10:00' });
    const ppath = 'Weeks/2026-W43.mindmap.json';
    const p = MM.templates.forPath(ppath).result.doc;
    await MM.routines.addToPlan(p, ppath);
    delete rdoc.nodes[meet.id];
    out.push('past       | ' + (await fill(p, ppath)) + ' ' + entries(p));
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
