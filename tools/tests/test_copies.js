const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const w = { MM: {} };
    const ctx = vm.createContext({ window: w, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl });
    for (const f of ['state.js', 'fsys.js', 'project.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = w.MM, P = MM.project;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    // which names are conflict copies (of which file)
    for (const [name, loose] of [
      ['2026-W43.mindmap [conflicted].json'], ['Üben U16.mindmap [conflicted 8].json'],
      ['Üben U16 (Konflikt 2026-10-25 1228).mindmap.json'], ['W43 (conflict 2026-10-25 1228 2).mindmap.json'],
      ["W43 (Tizian's conflicted copy 2026-10-25).mindmap.json"], ['W43 (1).mindmap.json'], ['W43 (1).mindmap.json', true],
      ['Üben U16.mindmap.json'], ['Plan (Entwurf).mindmap.json', true],
    ]) out.push('copyOf ' + JSON.stringify(name) + (loose ? ' loose' : '') + ' -> ' + P.copyOf(name, loose));
    out.push('(expected: W43 / U16 / U16 / W43 / W43 / null / W43 (loose) / null / null)');
    // copies of copies: pCloud conflicted a copy again, or a MindMapper copy
    for (const name of ['R.mindmap [conflicted] [conflicted 2].json', 'R (Konflikt 2026-10-26 1012).mindmap [conflicted].json', 'R.mindmap.json']) {
      out.push('originsOf ' + JSON.stringify(name) + ' -> ' + JSON.stringify(P.originsOf(name, true)));
    }
    out.push('(expected: [R.mindmap [conflicted].json, R.mindmap.json] / [R (Konflikt …).mindmap.json, R.mindmap.json] / [])');

    // the sidebar tree: copies hang at their map, a copy without its map stays a map
    MM.storage = { PROJECT_SETTINGS_FILE: 'mindmapper.settings.json' };
    MM.diary = { loadIndex() {} };
    MM.load = { scheduleRefresh() {} };
    const tree = {
      '': ['mindmapper.settings.json', 'mindmapper.settings [conflicted].json', 'mindmapper.settings [conflicted] [conflicted].json',
        'Weeks/', 'Allein [conflicted].json', 'Allein [conflicted] [conflicted].json', 'Routinen/'],
      // "keep this version" removed "Routinen.mindmap [conflicted].json" - its copies stay copies
      Routinen: ['Routinen.mindmap.json', 'Routinen.mindmap [conflicted] [conflicted].json', 'Routinen.mindmap [conflicted] [conflicted 2].json',
        'Routinen (Konflikt 2026-10-26 1012).mindmap [conflicted].json', 'Routinen.mindmap [conflicted 2].json', 'Routinen.mindmap [conflicted 2] [conflicted].json'],
      Weeks: ['2026-W43.mindmap.json', '2026-W43.mindmap [conflicted].json', '2026-W43.mindmap [conflicted 2].json',
        'Üben U16.mindmap.json', 'Üben U16 (Konflikt 2026-10-25 1228).mindmap.json', 'Üben U16 (1).mindmap.json'],
    };
    P.backend = {
      async list(folder) {
        return (tree[folder.replace(/\/$/, '')] || []).map((n) => (n.endsWith('/') ? { kind: 'dir', name: n.slice(0, -1) } : { kind: 'file', name: n }));
      },
    };
    P.render = () => {};
    await P.scan();
    const show = (es) => es.map((e) => (e.kind === 'dir' ? e.name + '/[' + show(e.children) + ']' : e.name + (e.copies ? ' ⚠' + e.copies.length : ''))).join(', ');
    out.push('tree   ' + show(P.entries));
    out.push('(expected: Routinen/[Routinen.mindmap.json ⚠5], Weeks/[2026-W43.mindmap.json ⚠2, Üben U16.mindmap.json ⚠2], Allein [conflicted].json ⚠1)');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
