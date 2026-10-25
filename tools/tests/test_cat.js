const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const window = { MM: {} };
    const ctx = vm.createContext({ window, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl, Date, prompt: () => null });
    for (const f of ['state.js', 'markdown.js', 'tasks.js', 'meta.js', 'templates.js', 'routines.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = window.MM, R = MM.routines;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m)); MM.t = (t) => t;
    MM.saveSettings = () => {}; MM.weekdayNames = () => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; MM.storage = { saveProjectSettings: () => {} };
    MM.state.settings.routineCategories = MM.normalizeCategories([
      { id: 'cBand', name: 'Band', emoji: '🥁', leisure: true }, { id: 'cWork', name: 'Work', emoji: '', leisure: false },
      { id: 'bad id!', name: '' }, 'junk',
    ]);
    out.push('categories  | ' + JSON.stringify(MM.state.settings.routineCategories.map((c) => [c.id.length > 3 ? (c.id.startsWith('c') ? c.id : 'gen') : c.id, c.name, c.leisure])));
    const rdoc = MM.emptyDoc();
    const mk = (text, repeat, est) => { const n = MM.createNode('note', 0, 0, { text }); n.repeat = MM.normalizeRepeat(repeat); n.meta = Object.assign(n.meta || {}, { estimate: est }); rdoc.nodes[n.id] = n; return n; };
    const rhythm = mk('Rhythm', { kind: 'times', times: 3, category: 'cBand' }, 30);
    const meet = mk('Meeting', { kind: 'weekly', every: 1, days: [2], time: '10:00', category: 'cWork' }, 60);
    const budget = mk('Students', { kind: 'budget', category: 'cWork' }, 180);
    const plain = mk('Admin', { kind: 'budget' }, 60);
    const vac = mk('Off', { kind: 'off', from: '2026-11-06', category: 'cBand' }, null);
    out.push('normalize   | times=' + rhythm.repeat.times + ' cat=' + rhythm.repeat.category + ' offCat="' + vac.repeat.category + '" bad=' + JSON.stringify(MM.normalizeRepeat({ kind: 'times', times: 99, category: '<x>' })));
    const list = R.collect(new Map([['R', rdoc]]));
    out.push('leisure     | ' + list.map((r) => r.title + ':' + r.leisure).join(' '));
    const tue = new Date(2026, 10, 3);
    out.push('minutesOn   | Tue(5 workdays)=' + R.minutesOn(list, tue, 5) + ' (meeting 60 + students 180/5 + admin 60/5 = 108; rhythm leisure 0)');
    out.push('label/week  | ' + R.label(rhythm.repeat, 30) + ' / perWeek=' + R.perWeek(rhythm.repeat, 30));
    MM.state.settings.routineCategories[0].leisure = false;
    out.push('not leisure | Tue=' + R.minutesOn(R.collect(new Map([['R', rdoc]])), tue, 5) + ' (+90/5=18 -> 126)');
    MM.state.settings.routineCategories[0].leisure = true;

    let docs = new Map([['R', rdoc]]), complete = true;
    MM.load = { loaded: () => true, refresh: async () => {}, docs: () => docs, complete: () => complete };
    const lists = (doc) => Object.values(doc.nodes).filter((n) => n.routineList !== undefined)
      .map((n) => `${n.text}[${n.items.map((i) => (i.done ? '✓' : '') + i.text.split(' ')[1]).join(',')}]`).join(' ');
    const wpath = 'Weeks/2026-W45.mindmap.json';
    const w = MM.templates.forPath(wpath).result.doc;
    out.push('created     | n=' + (await R.addToPlan(w, wpath)) + ' ' + lists(w));
    out.push('fill again  | ' + JSON.stringify(await R.addToPlan(w, wpath, { fill: true })));
    // tick one rhythm box, delete another: stays deleted
    const band = Object.values(w.nodes).find((n) => n.routineList === 'cBand');
    band.items[0].done = true;
    band.items.splice(1, 1);
    out.push('del 1 box   | ' + JSON.stringify(await R.addToPlan(w, wpath, { fill: true })) + ' ' + lists(w));
    // 3 -> 4 times: one box more
    rhythm.repeat.times = 4;
    out.push('times 3->4  | ' + JSON.stringify(await R.addToPlan(w, wpath, { fill: true })) + ' ' + lists(w));
    // 4 -> 1: open boxes go, the ticked one stays
    rhythm.repeat.times = 1;
    out.push('times ->1   | ' + JSON.stringify(await R.addToPlan(w, wpath, { fill: true })) + ' ' + lists(w));
    // category renamed + new emoji: list title follows
    MM.state.settings.routineCategories[0].name = 'Drums'; MM.state.settings.routineCategories[0].emoji = '🎵';
    rhythm.repeat.times = 2;
    out.push('renamed     | ' + JSON.stringify(await R.addToPlan(w, wpath, { fill: true })) + ' ' + lists(w));
    // routine moved to category "Work": leaves the Drums list, joins Work
    rhythm.repeat.category = 'cWork';
    out.push('recategory  | ' + JSON.stringify(await R.addToPlan(w, wpath, { fill: true })) + ' ' + lists(w));
    // category deleted: its routines go to "Routines this week"
    MM.state.settings.routineCategories = MM.state.settings.routineCategories.filter((c) => c.id !== 'cWork');
    out.push('cat deleted | ' + JSON.stringify(await R.addToPlan(w, wpath, { fill: true })) + ' ' + lists(w));
    // old week plan with "Routines this week" (no routineList): adopted, not doubled
    const old = MM.templates.forPath(wpath).result.doc;
    const box = MM.createNode('todo', 0, 0, { text: 'Routines this week' });
    box.items = [Object.assign(MM.createTodoItem('🔁 Admin (1h)'), { routine: plain.id })];
    old.nodes[box.id] = box;
    out.push('old plan    | ' + JSON.stringify(await R.addToPlan(old, wpath, { fill: true })) + ' ' + lists(old));
    // day plan: n-times routines never appear there
    const dpath = 'Days/2026-11-03.mindmap.json';
    const d = MM.templates.forPath(dpath).result.doc;
    await R.addToPlan(d, dpath);
    out.push('day plan    | ' + Object.values(d.nodes).filter((n) => n.type === 'todo').map((n) => n.text + '[' + n.items.filter((i) => i.routine).map((i) => i.text).join(',') + ']').filter((s) => !s.endsWith('[]')).join(' '));
    // renamed routine: open entries follow, checked ones keep their text
    const w3 = MM.templates.forPath(wpath).result.doc;
    MM.state.settings.routineCategories.push({ id: 'cX', name: 'X', emoji: '', leisure: false });
    rhythm.repeat.category = 'cX'; rhythm.repeat.times = 2;
    await R.addToPlan(w3, wpath);
    const lx = Object.values(w3.nodes).find((n) => n.routineList === 'cX');
    lx.items[0].done = true;
    rhythm.text = 'Grooves'; rhythm.meta.estimate = 45;
    out.push('rename note | ' + JSON.stringify(await R.addToPlan(w3, wpath, { fill: true })) + ' ' + lx.items.map((i) => (i.done ? '✓' : '') + i.text).join(' | '));
    // roundtrip keeps routineList and times/category
    const back = MM.normalizeDoc(JSON.parse(JSON.stringify(w)));
    out.push('roundtrip   | ' + Object.values(back.nodes).filter((n) => n.routineList !== undefined).map((n) => JSON.stringify(n.routineList)).join(','));
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
