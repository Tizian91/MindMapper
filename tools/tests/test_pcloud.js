const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
// ---- fake pCloud: path -> { folder } or { data, hash, modified } ----
const store = new Map([['/', { folder: true }]]);
let tick = 0, calls = [], validToken = 'TOK';
const parent = (p) => p.slice(0, p.lastIndexOf('/')) || '/';
const meta = (p) => {
  const e = store.get(p), name = p.split('/').pop();
  if (e.folder) return { isfolder: true, name, path: p };
  return { isfolder: false, name, path: p, hash: e.hash, modified: e.modified };
};
const tree = (p, rec, nofiles) => {
  const m = meta(p);
  m.contents = [...store.keys()].filter((k) => k !== p && parent(k) === p && (!nofiles || store.get(k).folder))
    .map((k) => (rec && store.get(k).folder ? tree(k, true, nofiles) : meta(k)));
  return m;
};
const putFile = (p, data) => store.set(p, { data, hash: String(9403476549337371523n + BigInt(++tick)), modified: 'Sat, 24 Oct 2026 10:00:' + String(tick).padStart(2, '0') + ' +0000' });
const json = (o) => ({ ok: true, status: 200, json: async () => o });
async function fakeFetch(u, opts) {
  const url = new URL(String(u));
  // real pCloud: a download from a web page (with its address as referer) is refused
  const fromPage = !opts || opts.referrerPolicy !== 'no-referrer';
  if (url.host === 'c1.pcloud.com') {
    if (fromPage) return { ok: false, status: 403, text: async () => '', blob: async () => new Blob([]) };
    const e = store.get(decodeURIComponent(url.pathname));
    return { ok: !!e, status: e ? 200 : 404, text: async () => String(e.data), blob: async () => new Blob([e.data], { type: 'application/octet-stream' }) };
  }
  const m = url.pathname.slice(1), q = Object.fromEntries(url.searchParams);
  calls.push(m);
  if (q.access_token !== validToken) return json({ result: 2094, error: 'Invalid access_token' });
  const p = q.path;
  const nf = (code) => json({ result: code, error: 'not found' });
  switch (m) {
    case 'listfolder': return store.get(p) && store.get(p).folder ? json({ result: 0, metadata: tree(p, !!q.recursive, !!q.nofiles) }) : nf(2005);
    // real pCloud: an undocumented code, recognised by its text
    case 'stat': return store.get(p) ? json({ result: 0, metadata: meta(p) }) : json({ result: 2055, error: 'File or folder not found.' });
    // real pCloud refused links from a web page with 7010; pCloud's SDK asks for download links
    case 'getfilelink': if (fromPage || q.forcedownload !== '1') return json({ result: 7010, error: 'Invalid link referer.' });
      return store.get(p) ? json({ result: 0, hosts: ['c1.pcloud.com'], path: encodeURI(p) }) : nf(2009);
    case 'createfolderifnotexists':
      if (!store.get(parent(p))) return nf(2002);
      if (!store.get(p)) store.set(p, { folder: true });
      return json({ result: 0 });
    case 'uploadfile': {
      if (!store.get(p)) return nf(2005);
      const f = opts.body.get('file');
      const target = (p === '/' ? '' : p) + '/' + q.filename;
      putFile(target, await f.text());
      return json({ result: 0, metadata: [meta(target)] });
    }
    case 'deletefile': if (!store.get(p)) return nf(2009); store.delete(p); return json({ result: 0 });
    case 'renamefile': { const e = store.get(p); if (!e) return nf(2009); store.delete(p); store.set(q.topath, e); return json({ result: 0, metadata: meta(q.topath) }); }
  }
  return json({ result: 9999, error: 'unknown ' + m });
}
(async () => {
  try {
    const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
    const sessionStorage = mem(), localStorage = mem();
    sessionStorage.setItem('mindmapper.pcloud.state', 'abc');
    const location = { origin: 'https://mindmapper.tizian-arold.workers.dev', pathname: '/cloud.html', search: '', hash: '#access_token=TOK&token_type=bearer&uid=1&state=abc&locationid=2&hostname=eapi.pcloud.com' };
    const history = { replaceState: () => { location.hash = ''; } };
    const window = { MM: {} };
    const ctx = vm.createContext({ window, console, location, history, localStorage, sessionStorage, crypto: globalThis.crypto, fetch: fakeFetch, FormData, Blob, URL, URLSearchParams, alert: (m) => out.push('ALERT ' + m) });
    for (const f of ['fsys.js', 'cloud-pcloud.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
    const MM = window.MM;
    MM.tr = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? v[k] : m));
    const PC = MM.fsys.pcloud;
    out.push('login        | token=' + PC.hasToken() + ' justLoggedIn=' + PC.justLoggedIn + ' hash cleared=' + (location.hash === '') + ' local supported=' + MM.fsys.local.supported);
    out.push('no folder    | restore=' + PC.restore());
    PC.setFolder('/MindMapper');
    const B = PC.restore();
    out.push('backend      | ' + B.kind + ' "' + B.name + '"');
    out.push('empty list   | ' + JSON.stringify(await B.list('')));
    const w1 = await B.write('Weeks/2026-W44.mindmap.json', '{"a":1}');
    out.push('write        | folders: ' + [...store.keys()].filter((k) => store.get(k).folder).join(', '));
    calls = [];
    out.push('list         | ' + JSON.stringify(await B.list('')) + ' ' + JSON.stringify(await B.list('Weeks')) + ' calls=' + calls.join(','));
    const r = await B.read('Weeks/2026-W44.mindmap.json');
    out.push('read         | ' + r.text + ' version same as write: ' + (r.version === w1.version));
    calls = [];
    const w2 = await B.write('Weeks/2026-W44.mindmap.json', '{"a":2}', { expect: r.version });
    out.push('expect ok    | ' + (await B.read('Weeks/2026-W44.mindmap.json')).text + ' (2nd write calls: ' + calls.join(',') + ')');
    putFile('/MindMapper/Weeks/2026-W44.mindmap.json', '{"other":true}'); // changed on the phone
    try { await B.write('Weeks/2026-W44.mindmap.json', '{"a":3}', { expect: w2.version }); out.push('conflict     | NOT detected'); }
    catch (e) { out.push('conflict     | ' + MM.fsys.isConflict(e) + ', file: ' + (await B.read('Weeks/2026-W44.mindmap.json')).text); }
    out.push('missing      | read=' + (await B.read('x.json')) + ' stat=' + (await B.stat('x.json')) + ' blob=' + (await B.readBlob('Assets/x.png')) + ' exists=' + (await B.exists('Weeks/2026-W44.mindmap.json')));
    await B.writeBlob('Assets/pic.png', new Blob(['PNG']));
    const pic = await B.readBlob('Assets/pic.png');
    out.push('blob         | ' + (await pic.text()) + ' ' + pic.type + ' (PNG image/png - a download comes as octet-stream)');
    await B.rename('Weeks/2026-W44.mindmap.json', 'Archive/Old/2026-W44.mindmap.json');
    out.push('rename       | ' + JSON.stringify(await B.list('Archive/Old')) + ' weeks=' + JSON.stringify(await B.list('Weeks')));
    await B.remove('Archive/Old/2026-W44.mindmap.json');
    out.push('remove       | ' + JSON.stringify(await B.list('Archive/Old')));
    // folder deleted in pCloud meanwhile: upload creates it again
    for (const k of [...store.keys()]) if (k.startsWith('/MindMapper/Days')) store.delete(k);
    await B.write('Days/2026-10-24.mindmap.json', 'x');
    store.delete('/MindMapper/Days/2026-10-24.mindmap.json'); store.delete('/MindMapper/Days');
    await B.write('Days/2026-10-24.mindmap.json', 'y');
    out.push('folder gone  | ' + (await B.read('Days/2026-10-24.mindmap.json')).text);
    // token revoked
    validToken = 'NEW';
    try { await B.read('Days/2026-10-24.mindmap.json'); } catch (e) { out.push('revoked      | "' + e.message + '" token kept=' + PC.hasToken() + ' folder kept=' + PC.folder()); }
    // login again keeps the folder
    sessionStorage.setItem('mindmapper.pcloud.state', 'xyz');
    location.hash = '#access_token=NEW&state=xyz&hostname=eapi.pcloud.com';
    vm.runInContext(fs.readFileSync(path.join(root, 'js', 'cloud-pcloud.js'), 'utf8'), ctx, { filename: 'cloud-pcloud.js' });
    out.push('relogin      | folder=' + MM.fsys.pcloud.folder() + ' restore=' + !!MM.fsys.pcloud.restore());
    // forged return: wrong state or foreign host -> rejected
    sessionStorage.setItem('mindmapper.pcloud.state', 'good');
    location.hash = '#access_token=EVIL&state=good&hostname=evil.example.com';
    localStorage.setItem('mindmapper.pcloud', '{}');
    vm.runInContext(fs.readFileSync(path.join(root, 'js', 'cloud-pcloud.js'), 'utf8'), ctx, { filename: 'cloud-pcloud.js' });
    out.push('foreign host | token=' + MM.fsys.pcloud.hasToken() + ' failed=' + MM.fsys.pcloud.loginFailed);
    // other origin (e.g. GitHub Pages): disabled
    location.origin = 'https://tizian91.github.io';
    vm.runInContext(fs.readFileSync(path.join(root, 'js', 'cloud-pcloud.js'), 'utf8'), ctx, { filename: 'cloud-pcloud.js' });
    out.push('other origin | allowed=' + MM.fsys.pcloud.allowed + ' restore=' + MM.fsys.pcloud.restore());
  } catch (e) { out.push('ERROR ' + e.stack); }
  fs.writeFileSync(process.argv[3], out.join('\n'));
})();
