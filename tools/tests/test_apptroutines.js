const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    // just enough DOM for the overview window: every selector gives the same element again
    const el = () => {
      const e = {
        innerHTML: '', value: '', hidden: false, dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {}, closest: () => null, showModal() {}, close() {}, remove() {},
        querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      };
      const kids = new Map();
      e.querySelector = (s) => kids.get(s) || kids.set(s, el()).get(s);
      return e;
    };
    let dialog = null;
    const document = { getElementById: () => null, documentElement: {}, body: { appendChild() {} }, createElement: () => (dialog = el()) };
    const w = { MM: {}, addEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 1200, innerHeight: 800 };
    const ctx = vm.createContext({ window: w, console, document, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl });
    for (const f of ['state.js', 'meta.js', 'tasks.js', 'templates.js', 'routines.js', 'overview.js']) {
      vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    }
    const MM = w.MM, S = MM.state;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    MM.t = (k, d) => ({ rl_every: 'Every {days}', rl_budget: '{d} per week' }[k] || d || k);
    MM.weekdayNames = () => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    MM.locale = () => 'en';
    MM.render = { esc: (s) => String(s) };
    MM.links = { label: (p) => p };
    MM.saveSettings = () => {};
    S.settings.routineCategories = [{ id: 'band', name: 'Band', emoji: '', leisure: true }];

    const today = new Date(), wd = today.getDay(), p2 = (v) => String(v).padStart(2, '0');
    const day = (n) => { const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
    const doc = MM.emptyDoc();
    const add = (text, meta, repeat) => {
      const n = MM.createNode('note', 0, 0, { text });
      n.meta = Object.assign(MM.emptyMeta(), meta);
      if (repeat) n.repeat = MM.normalizeRepeat(repeat);
      doc.nodes[n.id] = n;
    };
    add('Meeting', { estimate: 60 }, { kind: 'weekly', days: [wd], time: '10:00' });           // today and in 7 days
    add('Band', { estimate: 120 }, { kind: 'weekly', days: [(wd + 2) % 7], time: '19:00', category: 'band' }); // nice to have
    add('Ohne Zeit', { estimate: 30 }, { kind: 'weekly', days: [(wd + 1) % 7] });            // no time: not listed
    add('Budget', { estimate: 180 }, { kind: 'budget', time: '08:00' });                      // no fixed day: not listed
    add('Zahnarzt', { scheduled: day(1), scheduledTime: '09:00', estimate: 60, status: 'open' }); // a real appointment

    const P = 'Routinen/Routinen.mindmap.json';
    MM.project = { status: 'ready', backend: { name: 'Planung' }, async scan() {}, mapPaths: () => [P], readMap: async () => doc, find: () => null };
    MM.load = { refresh: async () => {}, docs: () => new Map([[P, doc]]), overviewHTML: () => '' };

    // the groups of the view: head (with its sum) and the rows in it
    const show = () => dialog.querySelector('.ov-list').innerHTML.split('<div class="ov-group ov-').slice(1).map((g) => {
      const head = /ov-group-head">(.*?)<span[^>]*>(.*?)<\/span>/.exec(g);
      const rows = [...g.matchAll(/<div class="ov-row([^"]*)"[\s\S]*?ov-title-text">([^<]*)(?:<span class="ov-detail">([^<]*))?/g)]
        .map((m) => m[2] + (m[1].includes('leisure') ? ' (blass)' : '') + (m[3] ? ' [' + m[3] + ']' : ''));
      return `${head[1]} – ${head[2]}: ${rows.join(' | ')}`;
    });
    await MM.overview.open('appts');
    out.push(...show());
    out.push('(expected: Today – 1 appointment · 1h blocked: 🔁 Meeting [Every <wd> 10:00 · 1h]');
    out.push(' Tomorrow – 1 appointment · 1h blocked: Zahnarzt');
    out.push(' Next 7 days – 2 appointments · 1h blocked: 🔁 Band (blass), 🔁 Meeting - Band does not count; no "Ohne Zeit", no "Budget")');

    // the other views keep routines out, as before
    MM.overview.open('deadline');
    await new Promise((r) => setTimeout(r, 20));
    out.push('By deadline has a 🔁: ' + dialog.querySelector('.ov-list').innerHTML.includes('🔁') + ' (false)');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
