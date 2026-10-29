const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const document = { getElementById: () => null, documentElement: {}, body: { appendChild() {} }, createElement: () => ({ addEventListener() {} }) };
    const w = { MM: {} };
    const ctx = vm.createContext({ window: w, console, document, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl });
    for (const f of ['state.js', 'fsys.js', 'project.js', 'storage.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = w.MM, S = MM.state, P = MM.project;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    MM.ui = { flash: (m) => out.push('  flash: ' + m), update() {} };
    MM.render = { esc: (s) => String(s) };
    MM.refresh = () => {};

    // two plans in the project folder; every write is counted
    const files = new Map(), writes = [];
    const doc = (ids) => JSON.stringify({ nodes: Object.fromEntries(ids.map((id) => [id, { id, type: 'task', text: id, meta: { status: 'open' } }])), edges: {} });
    files.set('Weeks/W44.mindmap.json', { text: doc(['a', 'b', 'c']), version: 1 });
    files.set('Days/D.mindmap.json', { text: doc(['x']), version: 1 });
    P.backend = {
      kind: 'local', name: 'Planung',
      async access() { return 'granted'; },
      async read(p) { const f = files.get(p); return f ? { text: f.text, version: f.version } : null; },
      async write(p, text) { const f = files.get(p); f.text = text; f.version++; writes.push(p); return { version: f.version }; },
    };
    P.status = 'ready';
    P.entries = [...files.keys()].map((p) => ({ kind: 'file', name: p.split('/').pop(), path: p }));
    S.file = { path: 'Other.mindmap.json' };
    const status = (p, id) => JSON.parse(files.get(p).text).nodes[id].meta.status;
    const check = (id) => (d) => { d.nodes[id].meta.status = 'done'; };

    // three checks in a row: nothing written yet, but reading shows them
    const W = 'Weeks/W44.mindmap.json';
    P.later(W, check('a'));
    P.later(W, check('b'));
    P.later('Days/D.mindmap.json', check('x'));
    P.later(W, check('c'));
    const seen = await P.readMap(W);
    out.push('collected      | writes ' + writes.length + ', read shows ' + ['a', 'b', 'c'].map((id) => seen.nodes[id].meta.status).join(',') +
      ', file has ' + status(W, 'a') + ' (0, done,done,done, open)');
    // before a map is opened, its changes are written - only that map
    await P.flushLater(W);
    out.push('flush one      | writes ' + writes.join(',') + ', ' + ['a', 'b', 'c'].map((id) => status(W, id)).join(',') + ' (W44 once, done,done,done)');
    // leaving the app: the rest
    await P.flushLater();
    out.push('flush all      | writes ' + writes.join(',') + ' (W44, D)');
    // a change that is in the file already: nothing to write
    P.later(W, check('a'));
    await P.flushLater();
    out.push('no change      | writes ' + writes.length + ' (2 - not written again)');
    // a pause (no flush by hand): written once by the timer
    P.later(W, (d) => { d.nodes.a.meta.status = 'open'; });
    P.later(W, (d) => { d.nodes.b.meta.status = 'open'; });
    await new Promise((r) => setTimeout(r, 1400));
    out.push('after a pause  | writes ' + writes.length + ', ' + status(W, 'a') + ',' + status(W, 'b') + ' (3, open,open)');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
