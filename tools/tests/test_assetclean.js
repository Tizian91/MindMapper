// Deleting recordings and cleaning up Assets/ (files.js): which files count as used
// (open map, other maps with changes not written yet, conflict copies, diaries), that a
// recording still used elsewhere is kept, and that Ctrl+Z writes a deleted file back.
// Expected values in brackets.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
(async () => {
  try {
    const w = { MM: { state: {} } };
    const ctx = vm.createContext({ window: w, console, document: { createElement: () => ({}) }, Blob, Uint8Array, Promise, Map, Set, JSON });
    vm.runInContext(fs.readFileSync(path.join(root, 'js', 'files.js'), 'utf8'), ctx, { filename: 'files.js' });
    const MM = w.MM, F = MM.files, S = MM.state;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    const flashes = [];
    MM.ui = { flash: (m) => flashes.push(m) };
    MM.audio = { isAudio: (f) => !!(f && /\.(webm|mp3)$/i.test(f.path || '')) };

    // the project folder: path -> content
    const disk = new Map();
    const put = (p, text) => disk.set(p, new Blob([text]));
    for (const n of ['A.webm', 'B.pdf', 'C.mp3', 'D.png', 'E.webm', 'X.webm', 'Y.webm']) put('Assets/' + n, 'data ' + n);
    const fileNote = (id, p) => ({ id, type: 'file', file: { path: p, name: p.split('/').pop() } });
    const maps = {
      'Weeks/W46.mindmap.json': { nodes: { b: fileNote('b', 'assets/b.PDF'), x: fileNote('x', 'Assets/X.webm') } }, // other case: Dropbox
      'Broken.mindmap.json': null,
    };
    put('Diaries/Tagebuch.diary.json', JSON.stringify({ pages: { '2026-11-12': { notes: [{ file: { path: 'Assets/C.mp3' } }] } } }));
    put('Weeks/W46.mindmap [conflicted].json', JSON.stringify({ nodes: { d: { link: 'Assets/D.png' } } }));
    MM.project = {
      status: 'ready',
      entries: [
        { kind: 'dir', name: 'Weeks', path: 'Weeks', children: [
          { kind: 'file', name: 'W46.mindmap.json', path: 'Weeks/W46.mindmap.json', copies: [{ name: 'W46.mindmap [conflicted].json', path: 'Weeks/W46.mindmap [conflicted].json' }] },
        ] },
        { kind: 'file', name: 'Heute.mindmap.json', path: 'Heute.mindmap.json' },
      ],
      diaries: [{ name: 'Tagebuch', path: 'Diaries/Tagebuch.diary.json' }],
      readMap: async (p) => (p in maps ? maps[p] : null),
      ensureWriteAccess: async () => true,
      writeBlob: async (p, b) => { disk.set(p, b); },
      scan: () => {},
      backend: {
        read: async (p) => (disk.has(p) ? { text: await disk.get(p).text() } : null),
        readBlob: async (p) => disk.get(p) || null,
        remove: async (p) => { disk.delete(p); },
      },
    };
    S.file = { path: 'Heute.mindmap.json' };
    S.doc = { nodes: { a: fileNote('a', 'Assets/A.webm'), y: fileNote('y', 'Assets/Y.webm'), x2: fileNote('x2', 'Assets/X.webm') } };

    // ---- what counts as used ----
    let refs = await F.references();
    const used = ['A.webm', 'B.pdf', 'C.mp3', 'D.png', 'E.webm'].map((n) => n + ' ' + refs.uses('Assets/' + n)).join(', ');
    out.push('used             | ' + used + ' (A true, B true, C true, D true, E false)');
    out.push('unreadable maps  | ' + refs.unread.join(',') + ' (Heute is open: not read; none - "Broken" is not in the list)');
    out.push('skip open map    | A ' + refs.uses('Assets/A.webm', true) + ' (false - only the open map has it)');

    // ---- asking on delete ----
    out.push('asks for audio   | ' + F.asksOnDelete([S.doc.nodes.a]) + ' ' + F.asksOnDelete([fileNote('p', 'Assets/B.pdf')]) + ' (true false)');

    // ---- "Note and recording": Y only here -> deleted; X also in W46 -> kept ----
    const gone = [S.doc.nodes.y, S.doc.nodes.x2];
    delete S.doc.nodes.y;
    delete S.doc.nodes.x2;
    await F.deleteFilesOf(gone);
    out.push('delete Y and X   | Y on disk ' + disk.has('Assets/Y.webm') + ', X on disk ' + disk.has('Assets/X.webm') + ' (false, true)');
    out.push('message          | ' + flashes.pop() + ' (1 deleted, 1 kept)');

    // ---- Ctrl+Z: the note is back, so is its file ----
    S.doc.nodes.y = gone[0];
    await F.restoreTrashed();
    out.push('undo             | Y on disk ' + disk.has('Assets/Y.webm') + ' content "' + (await disk.get('Assets/Y.webm').text()) + '" (true, "data Y.webm")');

    // ---- a map that cannot be read: rather keep the file ----
    MM.project.entries.push({ kind: 'file', name: 'Broken.mindmap.json', path: 'Broken.mindmap.json' });
    const a = S.doc.nodes.a;
    delete S.doc.nodes.a;
    await F.deleteFilesOf([a]);
    out.push('unreadable map   | A on disk ' + disk.has('Assets/A.webm') + ' (true - kept, a map could not be read)');
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
