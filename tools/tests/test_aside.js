const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const window = { MM: {} };
    const ctx = vm.createContext({ window, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl, Date });
    for (const f of ['state.js', 'meta.js', 'tasks.js', 'templates.js', 'overview.js', 'tasklists.js', 'workload.js']) {
      vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    }
    const MM = window.MM, S = MM.state, TL = MM.taskLists;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    MM.t = (k, d) => d || k;
    MM.ui = { flash: (s) => out.push('  flash: ' + s), update() {} };
    MM.render = { esc: (s) => String(s) };
    MM.routines = { collect: () => [], minutesOn: () => 0, offOn: () => null, isOff: () => false, track() {} };
    const wait = () => new Promise((r) => setTimeout(r, 20));
    const p2 = (v) => String(v).padStart(2, '0');
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
    const task = (doc, text, meta) => {
      const n = MM.createNode('task', 0, 0, { text });
      n.meta = Object.assign(MM.emptyMeta(), meta);
      doc.nodes[n.id] = n;
      return n;
    };
    const arrow = (doc, a, b) => {
      const e = MM.createEdge({ node: a.id, anchor: 'auto' }, { node: b.id, anchor: 'auto' });
      doc.edges[e.id] = e;
    };
    const set = (n, k, v) => {
      MM.meta.setValue([n], k, v);
      MM.commit();
    };
    const st = (...ns) => ns.map((n) => `${n.text}=${n.meta.status}${n.meta.deadline ? '/' + n.meta.deadline.slice(5) : ''}`).join(' ');

    // ---- in one map: main task A with sub-tasks B (open), C (done), D (dropped by hand)
    S.file.path = 'Projekte/A.mindmap.json';
    S.doc = MM.emptyDoc();
    const doc = S.doc;
    const A = task(doc, 'A', { deadline: day(10), estimate: 600, status: 'open' });
    const B = task(doc, 'B', { deadline: day(5), estimate: 120, status: 'progress', progress: 40 });
    const C = task(doc, 'C', { deadline: day(4), estimate: 60, status: 'done', progress: 100 });
    const D = task(doc, 'D', { deadline: day(6), estimate: 240, status: 'dropped' });
    arrow(doc, A, B);
    arrow(doc, A, C);
    arrow(doc, A, D);
    const T = task(doc, 'T', { deadline: day(8), estimate: 60, status: 'open' }); // derived map below
    T.derivedMap = 'Projekte/T.mindmap.json';
    MM.history.reset();
    out.push('dropped sub    | split=' + MM.tasks.compute(doc).info.get(A.id).split + ' count=' + MM.tasks.compute(doc).info.get(A.id).count + ' (180, 2 - D left out)');

    set(A, 'status', 'deferred');
    out.push('A deferred     | ' + st(A, B, C, D) + ' (A, B deferred without deadline; C done, D dropped stay)');
    set(A, 'deadline', day(12));
    out.push('A gets a date  | ' + st(A, B) + ' (A open again; B open again, no deadline back -> follows A: ' + day(12).slice(5) + ')');
    set(A, 'status', 'dropped');
    out.push('A dropped      | ' + st(A, B, C) + ' (A, B dropped, deadlines kept; C done)');
    set(A, 'status', 'open');
    out.push('A open again   | ' + st(A, B, D) + ' (A, B open; D stays dropped - dropped by hand before)');
    set(B, 'status', 'deferred');
    out.push('B alone        | ' + st(A, B) + ' (only B deferred)');
    set(B, 'status', 'open');

    // ---- workload and plan lists leave them out
    MM.load.capacity = () => ({ hours: 8, weekendHours: 0, days: [1, 2, 3, 4, 5] });
    const docs = new Map([[S.file.path, doc]]);
    const titles = () => MM.load.items(docs).map((i) => i.title.split(' (')[0]).sort().join(',');
    out.push('workload       | ' + titles() + ' (A, B, T - D dropped, C done)');
    // the derived map of T: its top level tasks are T's sub-tasks
    const files = new Map(), sub = MM.emptyDoc();
    const X = task(sub, 'X', { deadline: day(7), status: 'open' }), Y = task(sub, 'Y', { deadline: day(3), status: 'done' });
    files.set(T.derivedMap, JSON.stringify(sub));
    let writes = 0;
    MM.project = {
      status: 'ready', find: (p) => files.has(p), mapPaths: () => [], ensureWriteAccess: async () => true,
      readMap: async (p) => MM.normalizeDoc(JSON.parse(files.get(p))),
      writeMap: async (p, d) => { writes++; files.set(p, JSON.stringify(d)); },
    };
    const inSub = () => { const d = JSON.parse(files.get(T.derivedMap)); return st(d.nodes[X.id], d.nodes[Y.id]); };
    set(T, 'status', 'deferred');
    await wait();
    out.push('T deferred     | ' + inSub() + ', writes ' + writes + ' (X deferred without deadline, Y done/' + day(3).slice(5) + ', 1)');
    out.push('workload T def | ' + titles() + ' (A, B)');
    const lists = TL.collect(docs);
    out.push('plan lists     | ' + lists.open.concat(lists.overdue).map((i) => i.title).join(',') + ' (A - T deferred is not listed)');
    set(T, 'priority', 'high');
    await wait();
    out.push('other change   | writes ' + writes + ' (1 - nothing for the derived map)');
    set(T, 'status', 'open');
    await wait();
    out.push('T open again   | ' + inSub() + ', writes ' + writes + ' (X open, Y done, 2)');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
