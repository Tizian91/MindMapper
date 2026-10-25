const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const w = { MM: {} };
    const ctx = vm.createContext({ window: w, console, document: { createElement: () => ({}) }, Blob, Uint8Array, Promise });
    vm.runInContext(fs.readFileSync(path.join(root, 'js', 'files.js'), 'utf8'), ctx, { filename: 'files.js' });
    const MM = w.MM, F = MM.files;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    // fake project folder: path -> Blob
    const files = new Map();
    let writes = 0;
    MM.project = {
      exists: async (p) => files.has(p),
      writeBlob: async (p, b) => { files.set(p, b); writes++; },
      backend: { readBlob: async (p) => files.get(p) || null },
    };
    const file = (name, text) => Object.assign(new Blob([text]), { name });
    const a = await F.store(file('Folie.pdf', 'PDF-1'));
    out.push('first        | ' + a.path + ' name ' + a.name + ' writes ' + writes + ' (Assets/Folie.pdf, 1)');
    // chosen again from Assets/ (or inserted twice): the same file is used, no copy
    const b = await F.store(file('Folie.pdf', 'PDF-1'));
    out.push('same again   | ' + b.path + ' writes ' + writes + ' (Assets/Folie.pdf, still 1)');
    // another file with the same name: a copy "(2)", and the note shows that name
    const c = await F.store(file('Folie.pdf', 'PDF-2 changed'));
    out.push('other file   | ' + c.path + ' name ' + c.name + ' writes ' + writes + ' (Assets/Folie (2).pdf, name Folie (2).pdf, 2)');
    const d = await F.store(file('Folie.pdf', 'PDF-3'));
    out.push('same size    | ' + d.path + ' (Assets/Folie (3).pdf - same size as PDF-1, other bytes)');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
