const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const w = { MM: {} };
    const ctx = vm.createContext({ window: w, console, document: { getElementById: () => null, documentElement: {} }, navigator: { language: 'en' }, localStorage: null, setTimeout, clearTimeout, Intl });
    for (const f of ['state.js', 'fsys.js', 'project.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = w.MM, P = MM.project, FS = MM.fsys;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    // slow storage with version check (like a big diary on a phone)
    const file = { text: 'v0', version: 1 };
    let writes = 0;
    P.backend = {
      async write(p, text, o) {
        await new Promise((r) => setTimeout(r, 50));
        if (o && o.expect !== undefined && o.expect !== null && file.version !== o.expect && !(o.expectHash && FS.hash(file.text) === o.expectHash)) throw FS.conflict(p);
        file.text = text; file.version++; writes++;
        return { version: file.version };
      },
    };
    P.setVersion('Diaries/T.diary.json', 1, FS.hash('v0'));
    const results = await Promise.allSettled([P.writeText('Diaries/T.diary.json', 'v1'), P.writeText('Diaries/T.diary.json', 'v2'), P.writeText('Diaries/T.diary.json', 'v3')]);
    out.push('3 quick saves | ' + results.map((r) => r.status).join(',') + ' writes=' + writes + ' file=' + file.text + ' (fulfilled x3, v3)');
    // a real change from elsewhere is still detected
    file.text = 'OTHER'; file.version = 99;
    const r2 = await Promise.allSettled([P.writeText('Diaries/T.diary.json', 'v4')]);
    out.push('real change   | ' + r2[0].status + ' file=' + file.text + ' (rejected, OTHER)');
    // after a failed write the queue goes on (next write still checked)
    const r3 = await Promise.allSettled([P.writeText('Diaries/T.diary.json', 'v5')]);
    out.push('after failure | ' + r3[0].status + ' (rejected: still the old version until read again)');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
