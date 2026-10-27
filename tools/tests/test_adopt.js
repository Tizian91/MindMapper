const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    let answer = true, asked = 0;
    const w = { MM: {} };
    const ctx = vm.createContext({
      window: w, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' },
      localStorage: null, setTimeout, clearTimeout, Intl, confirm: () => { asked++; return answer; },
    });
    for (const f of ['state.js', 'fsys.js', 'project.js', 'storage.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = w.MM, S = MM.state, ST = MM.storage, P = MM.project, FS = MM.fsys;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    const flashes = [];
    MM.ui = { flash: (m) => flashes.push(m), update() {} };
    MM.render = { esc: (s) => String(s) };
    MM.diary = { loadIndex() {} };
    MM.load = { scheduleRefresh() {} };
    P.render = () => {};
    P.fillPlan = async () => {};

    // the folder: Weeks/2026-W44.mindmap.json, and a map of the same name elsewhere
    const W = 'Weeks/2026-W44.mindmap.json';
    const files = new Map();
    const writes = [];
    P.backend = {
      kind: 'local', name: 'Planung',
      async list(folder) {
        const f = folder.replace(/\/$/, '');
        if (!f) return [{ kind: 'dir', name: 'Weeks' }, { kind: 'dir', name: 'Archiv' }];
        return [...files.keys()].filter((p) => p.startsWith(f + '/')).map((p) => ({ kind: 'file', name: p.slice(f.length + 1) }));
      },
      async read(p) { return files.has(p) ? { text: files.get(p), version: 7 } : null; },
      async write(p, text) { writes.push(p); files.set(p, text); return { version: 8 }; },
    };
    P.status = 'ready';
    let opened = null;
    ST.openPath = async (p) => { opened = p; S.file.path = p; };
    ST.autosave = () => {};
    let mine = '';
    ST.serialize = () => mine;

    const docOf = (ids) => ({ nodes: Object.fromEntries(ids.map((id) => [id, { id, type: 'diary', text: id }])), edges: {} });
    const text = (ids) => JSON.stringify(docOf(ids), null, 2);
    const run = async (label, setup, expected) => {
      opened = null; asked = 0; writes.length = 0; flashes.length = 0;
      setup();
      await P.scan();
      await P.adoptOpenMap();
      out.push(`${label} | linked: ${S.file.path || '-'} | loaded file: ${opened ? 'yes' : 'no'} | asked: ${asked} | written: ${writes.join(',') || '-'}`);
      out.push('  (expected: ' + expected + ')');
    };
    // the open map: a loose copy (no path), as restored from the browser's autosave
    const loose = (ids, dirty) => {
      S.doc = docOf(ids);
      S.file = { handle: null, backend: null, name: '2026-W44.mindmap.json', path: null };
      S.dirty = dirty;
      mine = text(ids);
    };

    await run('same content         ', () => { files.clear(); files.set(W, text(['a', 'b'])); loose(['a', 'b'], false); },
      'linked Weeks/2026-W44, loaded no, asked 0, written -');
    await run('file newer, no edits ', () => { files.clear(); files.set(W, text(['a', 'b', 'c'])); loose(['a', 'b'], false); },
      'linked, loaded yes, asked 0');
    answer = true;
    await run('edits here, load file', () => { files.clear(); files.set(W, text(['a', 'b', 'c'])); loose(['a', 'x'], true); },
      'linked, loaded yes, asked 1');
    answer = false;
    await run('edits here, keep mine', () => { files.clear(); files.set(W, text(['a', 'b', 'c'])); loose(['a', 'x'], true); },
      'linked, loaded no, asked 1, written Weeks/2026-W44');
    await run('another map, same nm ', () => { files.clear(); files.set(W, text(['p', 'q'])); loose(['a', 'b'], false); },
      'linked -, nothing');
    await run('two maps of that name', () => { files.clear(); files.set(W, text(['a'])); files.set('Archiv/2026-W44.mindmap.json', text(['a'])); loose(['a'], false); },
      'linked -, nothing (which one?)');
    await run('already linked       ', () => { files.clear(); files.set(W, text(['a'])); loose(['a'], false); S.file.path = 'Days/x.mindmap.json'; },
      'linked Days/x (unchanged), nothing');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
