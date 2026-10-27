const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    // elements by id, and the dialogs the app creates (with their buttons)
    const el = () => {
      const e = {
        innerHTML: '', textContent: '', hidden: false, className: '', dataset: {}, style: {}, open: false, listeners: {},
        classList: { toggle() {}, add() {}, remove() {} },
        addEventListener(t, fn) { (e.listeners[t] = e.listeners[t] || []).push(fn); },
        showModal() { e.open = true; }, close() { e.open = false; }, remove() { e.removed = true; },
      };
      const kids = new Map();
      e.querySelector = (s) => kids.get(s) || kids.set(s, el()).get(s);
      e.querySelectorAll = () => [];
      // form fields and the like (the new-map dialog): any other property is an element too
      return new Proxy(e, { get: (t, k) => (k in t || typeof k !== 'string' || k === 'then' ? t[k] : (t[k] = el())) });
    };
    const byId = { sidebar: el(), 'offline-bar': el(), main: el() };
    const dialogs = [];
    const document = {
      getElementById: (id) => byId[id] || null, documentElement: {}, body: { appendChild() {} },
      createElement: () => { const d = el(); dialogs.push(d); return d; },
    };
    const w = { MM: {}, showDirectoryPicker() {} };
    const ctx = vm.createContext({ window: w, console, document, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl, alert: (m) => out.push('  alert: ' + m) });
    for (const f of ['state.js', 'fsys.js', 'project.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = w.MM, S = MM.state, P = MM.project;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    MM.getLang = () => 'en';
    MM.render = { esc: (s) => String(s) };
    MM.ui = { flash: (m) => out.push('  flash: ' + m), update() {} };
    MM.diary = { loadIndex() {} };
    MM.load = { scheduleRefresh() {} };
    MM.tasks = { refreshExternal() {} };
    MM.storage = { loadProjectSettings: async () => {}, folderKey: () => 'local:Planung', PROJECT_SETTINGS_FILE: 'mindmapper.settings.json' };

    // the stored folder needs the OK again; answers of the browser, one per call of access(true)
    let answers = [];
    const backend = {
      kind: 'local', name: 'Planung',
      async access(ask) { return ask ? answers.shift() || 'prompt' : this.granted ? 'granted' : 'prompt'; },
      async list() { return []; },
    };
    MM.fsys.local.restore = async () => backend;

    const lock = () => dialogs.find((d) => d.className === 'lock-dialog');
    const click = async (d, key) => {
      const btn = d.querySelector(`[data-lock="${key}"]`);
      for (const fn of btn.listeners.click || []) await fn();
    };
    const state = (label) => out.push(`${label} | status ${P.status} | lock ${lock() ? (lock().open ? 'open' : 'closed') : '-'} | bar ${byId['offline-bar'].hidden ? 'hidden' : 'shown'}`);

    await P.init();
    state('start, needs OK      ');
    out.push('  (expected: needs-permission, lock open, bar shown)');
    out.push('  lock text: ' + /<h3>(.*?)<\/h3>/.exec(lock().innerHTML)[1] + ' / ' + /data-lock="offline"><b>(.*?)<\/b><small>(.*?)<\/small>/.exec(lock().innerHTML).slice(1).join(' – '));
    out.push('  bar text: ' + /<span>(.*?)<\/span>/.exec(byId['offline-bar'].innerHTML)[1]);

    // "Connect": the browser says "prompt" first, the OK is noted a moment later
    answers = ['prompt'];
    backend.granted = true;
    await click(lock(), 'connect');
    state('connect (late OK)    ');
    out.push('  (expected: ready, lock closed, bar hidden)');

    // the next start: not allowed - the lock stays and says so
    dialogs.length = 0; backend.granted = false; P.status = 'none';
    await P.init();
    answers = ['denied'];
    await click(lock(), 'connect');
    state('connect, denied      ');
    out.push('  lock message: ' + lock().querySelector('.lock-msg').textContent);
    out.push('  (expected: needs-permission, lock open, bar shown, message "Not connected yet")');
    await click(lock(), 'offline');
    state('work without folder  ');
    out.push('  (expected: needs-permission, lock closed, bar shown)');

    // "Choose another folder…": the picker, cancelled - then a folder chosen
    dialogs.length = 0; backend.granted = false; P.status = 'none';
    await P.init();
    MM.saveSettings = () => {};
    MM.refresh = () => {};
    MM.fsys.local.pick = async () => { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; };
    await click(lock(), 'choose');
    state('other folder, cancel ');
    out.push('  (expected: needs-permission, lock open, bar shown)');
    MM.fsys.local.pick = async () => ({ kind: 'local', name: 'Privat', access: async () => 'granted', list: async () => [] });
    await click(lock(), 'choose');
    state('other folder chosen  ');
    out.push(`  folder: ${P.backend.name} (expected: ready, lock closed, bar hidden, folder Privat)`);

    // the OK is kept by the browser: no lock at all
    dialogs.length = 0; backend.granted = true; P.status = 'none';
    await P.init();
    state('start, OK kept       ');
    out.push('  (expected: ready, lock -, bar hidden)');

    // no folder stored (first start): "Choose a project folder"
    dialogs.length = 0; P.status = 'none'; P.backend = null;
    MM.fsys.local.restore = async () => null;
    await P.init();
    state('first start          ');
    out.push('  lock: ' + /<h3>(.*?)<\/h3>/.exec(lock().innerHTML)[1] + ' | buttons: ' + [...lock().innerHTML.matchAll(/data-lock="(\w+)"/g)].map((m) => m[1]).join(', '));
    out.push('  bar: ' + /<span>(.*?)<\/span>/.exec(byId['offline-bar'].innerHTML)[1] + ' | ' + /data-bar="(\w+)"/.exec(byId['offline-bar'].innerHTML)[1]);
    out.push('  (expected: none, lock open "Choose a project folder" with choose, offline; bar "No project folder" with choose)');
    await click(lock(), 'offline');
    state('try without folder   ');
    out.push('  (expected: none, lock closed, bar shown)');
    // a map opened as a single file is saved into that file: no bar
    S.file = { handle: {}, backend: null, name: 'Liste.mindmap.json', path: null };
    P.render();
    state('single file open     ');
    out.push('  (expected: none, lock closed, bar hidden)');
    S.file = { handle: null, backend: null, name: 'Untitled.mindmap.json', path: null };
    dialogs.length = 0; P.status = 'none'; P.backend = null;
    await P.init();
    await click(lock(), 'choose');
    state('first start, chosen  ');
    out.push('  (expected: ready, lock closed, bar hidden)');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
