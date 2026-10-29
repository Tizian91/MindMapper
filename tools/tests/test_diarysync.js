const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const document = { getElementById: () => null, documentElement: {}, body: { appendChild() {} }, createElement: () => ({ addEventListener() {} }) };
    const w = { MM: { actions: {} }, addEventListener() {} };
    const ctx = vm.createContext({ window: w, console, document, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl });
    for (const f of ['state.js', 'fsys.js', 'markdown.js', 'project.js', 'diary.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = w.MM, P = MM.project;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    MM.render = { esc: (s) => String(s) };
    MM.load = { scheduleRefresh() {} };
    MM.diary.loadIndex = () => {};
    P.render = () => {};

    // names of conflict copies of a diary file
    out.push('copyOf         | ' + ['Arbeit.diary [conflicted].json', 'Arbeit (Konflikt 2026-10-25 1228).diary.json', "Arbeit (Tizian's conflicted copy 2026-10-29).diary.json", 'Arbeit (1).diary.json']
      .map((n) => P.copyOf(n, true)).join(' | ') + ' (Arbeit.diary.json four times)');

    // the Diaries folder as the sync program leaves it
    const diaries = ['Arbeit.diary.json', 'Arbeit.diary [conflicted].json', 'Arbeit.diary [conflicted 2].json', 'Notizen (2).diary.json', 'Test.diary.json'];
    P.backend = { name: 'Planung', async list(prefix) { return prefix === 'Diaries' ? diaries.map((name) => ({ kind: 'file', name })) : []; } };
    await P.scan();
    out.push('diaries        | ' + P.diaries.map((d) => d.name + (d.copies ? ' ⚠' + d.copies.length : '')).join(', ') + ' (Arbeit ⚠2, Notizen (2), Test - "Notizen (2)" has no original: a diary of its own)');

    // the diary file changed on the other device while it was open here: both changes stay
    const base = { name: 'Arbeit', style: { font: 'Georgia' }, pages: { '2026-10-27': { overlays: [] }, '2026-10-28': { overlays: [] } }, assets: { a: 1 } };
    const ours = JSON.parse(JSON.stringify(base));
    ours.pages['2026-10-28'].overlays.push({ id: 'o1', kind: 'sticker', char: '⭐' }); // sticker added here
    const theirs = JSON.parse(JSON.stringify(base));
    theirs.pages['2026-10-27'].closed = { at: 'x', entries: [] };                     // page closed on the phone
    theirs.style.font = 'Arial';                                                          // look changed on the phone
    theirs.assets.b = 2;
    const m = MM.diary.mergeDiary(base, ours, theirs);
    out.push('merge          | 27 closed ' + !!m.pages['2026-10-27'].closed + ', 28 stickers ' + m.pages['2026-10-28'].overlays.length + ', font ' + m.style.font +
      ', assets ' + Object.keys(m.assets).join(',') + ' (true, 1, Arial, a,b)');
    ours.style = { font: 'Garamond' };
    out.push('merge style    | font ' + MM.diary.mergeDiary(base, ours, theirs).style.font + ' (Garamond - changed here wins)');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
