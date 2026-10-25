const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const w = { MM: {} };
    const ctx = vm.createContext({ window: w, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl });
    for (const f of ['state.js', 'fsys.js', 'project.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = w.MM, P = MM.project;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    P.READ_RETRY_MS = 5;
    // a sync app hands out the file empty / cut off a few times, then complete
    const full = JSON.stringify({ nodes: { a: {} } });
    const run = async (answers) => {
      let i = 0;
      P.backend = { async read() { const t = answers[Math.min(i++, answers.length - 1)]; return t === null ? null : { text: t, version: i }; } };
      try {
        const f = await P.readDoc('Weeks/2026-W46.mindmap.json');
        return (f ? 'doc ' + Object.keys(f.doc.nodes).join(',') : 'null') + ' after ' + i + ' reads';
      } catch (err) {
        return 'error after ' + i + ' reads';
      }
    };
    out.push('complete      | ' + (await run([full])) + ' (doc a after 1 reads)');
    out.push('empty, then ok| ' + (await run(['', '  ', full])) + ' (doc a after 3 reads)');
    out.push('cut off, ok   | ' + (await run([full.slice(0, 9), full])) + ' (doc a after 2 reads)');
    out.push('stays empty   | ' + (await run([''])) + ' (error after 4 reads - never an empty map)');
    out.push('missing       | ' + (await run([null])) + ' (null after 1 reads)');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
