const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    // the conflict dialog: remembers its text and clicks the button `answer`
    let answer = 'overwrite', shown = null;
    const document = {
      getElementById: () => null, documentElement: {}, body: { appendChild() {} },
      createElement() {
        const d = {
          innerHTML: '', addEventListener() {}, close() {}, remove() {},
          querySelectorAll() {
            return [...d.innerHTML.matchAll(/data-cf="(\w+)"/g)].map((m) => {
              const b = { dataset: { cf: m[1] }, addEventListener: (t, fn) => { b.click = fn; } };
              return b;
            });
          },
          showModal() {
            shown = /<h3>(.*?)<\/h3>/.exec(d.innerHTML)[1];
            this.buttons.find((b) => b.dataset.cf === answer).click();
          },
        };
        const qsa = d.querySelectorAll;
        d.querySelectorAll = () => (d.buttons = qsa());
        return d;
      },
    };
    const w = { MM: {} };
    const ctx = vm.createContext({ window: w, console, document, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl });
    for (const f of ['state.js', 'fsys.js', 'project.js', 'storage.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    let now = 1e6;
    vm.runInContext('Date.now = () => globalThis.__now()', Object.assign(ctx, { __now: () => now }));
    const MM = w.MM, S = MM.state, ST = MM.storage, FS = MM.fsys;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    MM.ui = { flash: (m) => out.push('  flash: ' + m), update() {} };
    MM.render = { esc: (s) => String(s) };
    MM.edit = { isLabelEditing: () => false };
    MM.refresh = () => {};
    MM.tasks = { refreshExternal() {} };

    // the map file in the project folder, as the sync program leaves it
    const file = { text: '', version: 0 };
    const writes = [];
    const backend = {
      kind: 'local', name: 'Planung',
      async read() { return { text: file.text, version: file.version }; },
      async stat() { return { version: file.version, modified: file.version }; },
      async write(p, text, opts) {
        if (opts && opts.expect != null && opts.expect !== file.version && !(opts.expectHash && FS.hash(file.text) === opts.expectHash)) throw FS.conflict(p);
        writes.push(text); file.text = text; file.version++; return { version: file.version }; },
    };
    MM.project.backend = backend;
    let loaded = null;
    ST.load = (doc) => { loaded = doc; };
    ST.autosave = () => {};
    ST.openPath = async () => { loaded = 'reloaded'; };
    ST.serialize = () => mine;
    const P = 'Routinen/Routinen.mindmap.json';
    const A = JSON.stringify({ nodes: { a: {} } }), B = JSON.stringify({ nodes: { a: {}, b: {} } }), C = JSON.stringify({ nodes: { c: {} } });
    let mine = B;

    // opened at A, then saved B here
    const at = (text) => {
      file.text = text;
      file.version++;
      S.file = { backend, path: P, name: 'Routinen.mindmap.json', version: file.version, hash: FS.hash(text) };
      ST.remember(P, FS.hash(text));
    };
    const check = async (label) => {
      now += 5000;
      shown = null; loaded = null; writes.length = 0;
      S.dirty = false;
      await ST.checkFile();
      out.push(`${label} | dialog: ${shown || '-'} | loaded: ${loaded ? (loaded === 'reloaded' ? 'reloaded' : Object.keys(loaded.nodes).join(',')) : '-'} | written: ${writes.length ? Object.keys(JSON.parse(writes[0]).nodes).join(',') : '-'}`);
    };

    at(A); at(B);
    file.text = A; file.version++; // pCloud set the file back to A
    answer = 'overwrite';
    await check('back to A, keep mine ');
    out.push('  (expected: dialog "Routinen" was set back to an older version, nothing loaded, written a,b)');

    at(A); at(B);
    file.text = A; file.version++;
    answer = 'reload';
    await check('back to A, load older');
    out.push('  (expected: dialog set back, reloaded, nothing written)');

    at(A); at(B);
    file.text = C; file.version++; // a real change from the other device
    await check('changed to C         ');
    out.push('  (expected: no dialog, loaded c, nothing written - as before)');

    at(B);
    file.version++; // only the time stamp changed
    await check('same content         ');
    out.push('  (expected: no dialog, nothing loaded, nothing written)');

    // unsaved changes here (C) while the file was set back: the save asks
    at(A); at(B);
    file.text = A; file.version++;
    mine = C; S.dirty = true; S.doc = {}; shown = null; writes.length = 0;
    answer = 'overwrite';
    await ST.writeFile();
    out.push(`save, set back       | dialog: ${shown || '-'} | written: ${writes.length ? Object.keys(JSON.parse(writes[0]).nodes).join(',') : '-'}`);
    out.push('  (expected: dialog set back, written c)');
    at(B);
    file.text = JSON.stringify({ nodes: { d: {} } }); file.version++; // changed elsewhere to something new (C was written here above)
    mine = A; S.dirty = true; shown = null; writes.length = 0;
    await ST.writeFile();
    out.push(`save, changed        | dialog: ${shown || '-'} | written: ${writes.length ? Object.keys(JSON.parse(writes[0]).nodes).join(',') : '-'}`);
    out.push('  (expected: dialog "Routinen" was changed elsewhere, written a)');

    // closing the app: "hidden" and "pagehide" both save, the second while the first still writes
    at(A);
    mine = B; S.dirty = true; shown = null; writes.length = 0;
    ST.writeFile();
    await ST.writeFile();
    out.push(`close app (2 saves)  | writes: ${writes.length} | dirty after: ${S.dirty}`);
    out.push('  (expected: writes 1, dirty false)');
    // a change marked, but the map is as in the file (e.g. changed and changed back)
    mine = B; S.dirty = true; writes.length = 0;
    await ST.writeFile();
    out.push(`same as the file     | writes: ${writes.length} | dirty after: ${S.dirty}`);
    out.push('  (expected: writes 0, dirty false)');

    // other maps / the diary (project.js writeText): the same text again is not written
    const P2 = 'Diaries/Arbeit.diary.json';
    MM.project.setVersion(P2, file.version, FS.hash(C));
    writes.length = 0;
    await MM.project.writeText(P2, C);
    await MM.project.writeText(P2, JSON.stringify({ nodes: { e: {} } }));
    out.push(`writeText same, new  | writes: ${writes.length}`);
    out.push('  (expected: writes 1 - only the new text)');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
