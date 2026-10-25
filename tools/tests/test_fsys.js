const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
// in-memory directory handle (just what fsys.js uses)
let clock = 1000;
function dir(name) {
  const kids = new Map();
  return {
    kind: 'directory', name, kids,
    async getDirectoryHandle(n, o) {
      if (!kids.has(n)) { if (!(o && o.create)) throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' }); kids.set(n, dir(n)); }
      return kids.get(n);
    },
    async getFileHandle(n, o) {
      if (!kids.has(n)) { if (!(o && o.create)) throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' }); kids.set(n, file(n)); }
      return kids.get(n);
    },
    async removeEntry(n) { kids.delete(n); },
    async *entries() { for (const [n, h] of kids) yield [n, h]; },
  };
}
function file(name) {
  const h = { kind: 'file', name, data: '', mod: ++clock };
  h.getFile = async () => ({ lastModified: h.mod, text: async () => String(h.data), arrayBuffer: async () => h.data });
  h.createWritable = async () => { let buf = ''; return { write: async (d) => { buf += typeof d === 'string' ? d : await d.text(); }, close: async () => { h.data = buf; h.mod = ++clock; }, abort: async () => {} }; };
  return h;
}
(async () => {
  try {
    const window = { MM: {} };
    const ctx = vm.createContext({ window, console, Blob: class {} });
    vm.runInContext(fs.readFileSync(path.join(root, 'js', 'fsys.js'), 'utf8'), ctx, { filename: 'fsys.js' });
    const FS = window.MM.fsys;
    const rootDir = dir('Projects');
    const B = FS.local.from(rootDir);
    const w1 = await B.write('Weeks/2026-W44.mindmap.json', 'A');
    const r1 = await B.read('Weeks/2026-W44.mindmap.json');
    out.push('write/read   | ' + r1.text + ' same version: ' + (r1.version === w1.version));
    const w2 = await B.write('Weeks/2026-W44.mindmap.json', 'B', { expect: r1.version });
    out.push('expect ok    | ' + (await B.read('Weeks/2026-W44.mindmap.json')).text);
    // someone else writes (other PC / tab)
    const fh = await (await rootDir.getDirectoryHandle('Weeks')).getFileHandle('2026-W44.mindmap.json');
    fh.data = 'OTHER'; fh.mod = ++clock;
    try { await B.write('Weeks/2026-W44.mindmap.json', 'C', { expect: w2.version }); out.push('conflict     | NOT detected'); }
    catch (e) { out.push('conflict     | ' + FS.isConflict(e) + ', file still: ' + (await B.read('Weeks/2026-W44.mindmap.json')).text); }
    // deleted elsewhere: conflict, and no empty file left behind
    await B.remove('Weeks/2026-W44.mindmap.json');
    try { await B.write('Weeks/2026-W44.mindmap.json', 'D', { expect: w2.version }); out.push('deleted      | NOT detected'); }
    catch (e) { out.push('deleted      | ' + FS.isConflict(e) + ', exists: ' + (await B.exists('Weeks/2026-W44.mindmap.json'))); }
    // no expect: plain write
    await B.write('Weeks/2026-W44.mindmap.json', 'E');
    out.push('no expect    | ' + (await B.read('Weeks/2026-W44.mindmap.json')).text);
    // Android-like: the time stamp of our own write changes later, the content does not
    const w5 = await B.write('Days/x.mindmap.json', 'MINE');
    const fx = await (await rootDir.getDirectoryHandle('Days')).getFileHandle('x.mindmap.json');
    fx.mod = ++clock; // the file system sets the time again
    try { await B.write('Days/x.mindmap.json', 'MINE2', { expect: w5.version, expectHash: FS.hash('MINE') }); out.push('late stamp   | saved, no false alarm: ' + (await B.read('Days/x.mindmap.json')).text); }
    catch (e) { out.push('late stamp   | FALSE ALARM'); }
    fx.data = 'PHONE'; fx.mod = ++clock; // really changed elsewhere
    try { await B.write('Days/x.mindmap.json', 'MINE3', { expect: w5.version, expectHash: FS.hash('MINE2') }); out.push('real change  | NOT detected'); }
    catch (e) { out.push('real change  | conflict ' + FS.isConflict(e) + ', file: ' + (await B.read('Days/x.mindmap.json')).text); }
    out.push('hash         | ' + FS.hash('abc') + ' ' + FS.hash('abd') + ' ' + FS.hash('🥁'));
    out.push('list         | ' + JSON.stringify(await B.list('')) + ' ' + JSON.stringify(await B.list('Weeks')));
    out.push('missing      | read=' + (await B.read('x.json')) + ' stat=' + (await B.stat('x.json')) + ' list=' + JSON.stringify(await B.list('Nope')));
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
