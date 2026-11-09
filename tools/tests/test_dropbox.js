// Dropbox backend (js/cloud-dropbox.js) against a fake Dropbox: sign-in (PKCE), files,
// conflicts by revision, copies of texts read, token renewal, umlauts, errors.
const fs = require('fs'), vm = require('vm'), path = require('path'), nodeCrypto = require('crypto');
const root = process.argv[2], out = [];
const check = (label, cond, extra) => out.push(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra !== undefined ? ' (' + extra + ')' : ''}`);

// ---- fake Dropbox: lower-case path -> { name, folder } | { name, data, rev } ----
const files = new Map();
let revN = 0, access = 'A0', refreshToken = 'R1', calls = [], fail429 = 0;
const lowerOf = (p) => p.toLowerCase();
const parentOf = (p) => p.slice(0, p.lastIndexOf('/'));
const nameOf = (p) => p.slice(p.lastIndexOf('/') + 1);
const newRev = () => 'r' + String(++revN).padStart(9, '0');
function ensureParents(p) {
  for (let q = parentOf(p); q; q = parentOf(q)) if (!files.has(lowerOf(q))) files.set(lowerOf(q), { name: nameOf(q), folder: true });
}
const putFile = (p, data) => { ensureParents(p); const e = { name: nameOf(p), data, rev: newRev(), modified: new Date(Date.now()).toISOString() }; files.set(lowerOf(p), e); return e; };
const meta = (key) => {
  const e = files.get(key);
  return e.folder ? { '.tag': 'folder', name: e.name, path_lower: key, path_display: key }
    : { '.tag': 'file', name: e.name, path_lower: key, path_display: key, rev: e.rev, server_modified: e.modified, size: e.data.length };
};
let pkce = null; // { challenge } from the authorize URL
const res = (status, body, headers) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: (k) => (headers || {})[k] || null },
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  blob: async () => new Blob([typeof body === 'string' ? body : JSON.stringify(body)], { type: 'application/octet-stream' }),
});
const err409 = (summary) => res(409, { error_summary: summary, error: {} });
let pages = 3; // list_folder answers in small pages: tests "continue"
const cursors = new Map();

async function fakeFetch(url, init) {
  const u = new URL(url);
  const ep = u.pathname;
  calls.push(ep);
  if (ep === '/oauth2/token') {
    const f = new URLSearchParams(init.body.toString());
    if (f.get('client_id') !== '7jq9c5gqw28z8n3') return res(400, { error: 'invalid_client' });
    if (f.get('grant_type') === 'authorization_code') {
      const ch = nodeCrypto.createHash('sha256').update(f.get('code_verifier')).digest('base64url');
      if (f.get('code') !== 'CODE' || !pkce || ch !== pkce.challenge) return res(400, { error: 'invalid_grant' });
      access = 'A1';
      return res(200, { access_token: access, expires_in: 14400, refresh_token: refreshToken, token_type: 'bearer' });
    }
    if (f.get('grant_type') === 'refresh_token') {
      if (f.get('refresh_token') !== refreshToken) return res(400, { error: 'invalid_grant', error_description: 'refresh token is invalid or revoked' });
      access = 'A' + (Number(access.slice(1)) + 1);
      return res(200, { access_token: access, expires_in: 14400, token_type: 'bearer' });
    }
  }
  if ((init.headers || {}).Authorization !== 'Bearer ' + access) return res(401, { error_summary: 'expired_access_token/' });
  if (fail429 > 0) { fail429--; return res(429, { error_summary: 'too_many_requests/' }, { 'Retry-After': '1' }); }
  const argHeader = (init.headers || {})['Dropbox-API-Arg'];
  if (argHeader && /[^\x20-\x7e]/.test(argHeader)) return res(400, 'Error in call: header must be ASCII');
  const arg = argHeader ? JSON.parse(argHeader) : init.body ? JSON.parse(init.body) : null;
  switch (ep) {
    case '/2/files/list_folder': {
      const base = lowerOf(arg.path);
      if (base && !(files.get(base) || {}).folder) return err409('path/not_found/..');
      const keys = [...files.keys()].filter((k) => (arg.recursive ? k.startsWith(base + '/') || k === base : parentOf(k) === base)).filter((k) => k);
      const all = keys.map(meta);
      const id = 'c' + cursors.size;
      cursors.set(id, all.slice(pages));
      return res(200, { entries: all.slice(0, pages), cursor: id, has_more: all.length > pages });
    }
    case '/2/files/list_folder/continue': {
      const rest = cursors.get(arg.cursor);
      const id = 'c' + cursors.size;
      cursors.set(id, rest.slice(pages));
      return res(200, { entries: rest.slice(0, pages), cursor: id, has_more: rest.length > pages });
    }
    case '/2/files/download': {
      const e = files.get(lowerOf(arg.path));
      if (!e || e.folder) return err409('path/not_found/');
      return res(200, e.data, { 'Dropbox-API-Result': JSON.stringify(meta(lowerOf(arg.path))) });
    }
    case '/2/files/upload': {
      const key = lowerOf(arg.path), e = files.get(key);
      const data = await init.body.text();
      if (arg.mode && arg.mode['.tag'] === 'update' && (!e || e.rev !== arg.mode.update)) return err409('path/conflict/file/..');
      putFile(arg.path, data);
      return res(200, meta(key));
    }
    case '/2/files/create_folder_v2':
      if (files.has(lowerOf(arg.path))) return err409('path/conflict/folder/');
      ensureParents(arg.path + '/x');
      return res(200, { metadata: meta(lowerOf(arg.path)) });
    case '/2/files/delete_v2': {
      const key = lowerOf(arg.path);
      if (!files.has(key)) return err409('path_lookup/not_found/');
      for (const k of [...files.keys()]) if (k === key || k.startsWith(key + '/')) files.delete(k);
      return res(200, { metadata: {} });
    }
    case '/2/files/move_v2': {
      const from = lowerOf(arg.from_path), to = lowerOf(arg.to_path);
      if (!files.has(from)) return err409('from_lookup/not_found/');
      if (files.has(to)) return err409('to/conflict/file/');
      const e = files.get(from);
      files.delete(from);
      ensureParents(arg.to_path);
      files.set(to, Object.assign({}, e, { name: nameOf(arg.to_path), rev: newRev() }));
      return res(200, { metadata: meta(to) });
    }
    case '/2/auth/token/revoke':
      refreshToken = 'REVOKED';
      return res(200, null);
  }
  return res(400, 'unknown endpoint ' + ep);
}

// ---- page environment ----
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const localStorage = mem(), sessionStorage = mem();
const idbData = new Map();
let clock = 0; // ms added to the real time (the listing stays fresh for 5 s)
class FakeDate extends Date { static now() { return Date.now() + clock; } }
let assigned = null;

function page(search) {
  const ctx = {
    console, URL, URLSearchParams, Blob, TextEncoder, btoa, setTimeout, clearTimeout, Promise, JSON, Math, Object, Array, Map, Set, String, Number, Error,
    Date: FakeDate, crypto: globalThis.crypto, isSecureContext: true, indexedDB: {},
    fetch: fakeFetch, localStorage, sessionStorage,
    location: { origin: 'https://tizian91.github.io', pathname: '/MindMapper/cloud.html', search: search || '', hash: '', assign: (u) => { assigned = u; } },
    history: { replaceState: () => {} },
  };
  ctx.window = ctx;
  ctx.MM = {
    tr: (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)),
    storage: { idb: { get: async (k) => idbData.get(k), set: async (k, v) => { idbData.set(k, v); } } },
  };
  vm.createContext(ctx);
  for (const f of ['fsys.js', 'cloud-dropbox.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), ctx, { filename: f });
  return ctx;
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const count = (ep) => calls.filter((c) => c === ep).length;

(async () => {
  try {
    // ---- sign-in ----
    let w = page();
    let DB = w.MM.fsys.dropbox;
    check('allowed on an https page', DB.allowed === true);
    check('not signed in at first', !DB.signedIn() && DB.folder() === null && DB.restore() === null);
    await DB.login();
    const q = new URL(assigned).searchParams;
    pkce = { challenge: q.get('code_challenge') };
    check('authorize: PKCE S256, offline, redirect = the page', q.get('code_challenge_method') === 'S256' && q.get('token_access_type') === 'offline' &&
      q.get('redirect_uri') === 'https://tizian91.github.io/MindMapper/cloud.html' && q.get('response_type') === 'code' && !!q.get('state'));
    w = page('?code=WRONG&state=' + q.get('state'));
    await w.MM.fsys.dropbox.ready;
    check('a wrong code is reported, not signed in', !!w.MM.fsys.dropbox.loginError && !w.MM.fsys.dropbox.signedIn(), w.MM.fsys.dropbox.loginError);
    await DB.login();
    const q2 = new URL(assigned).searchParams;
    pkce = { challenge: q2.get('code_challenge') };
    w = page('?code=CODE&state=bogus');
    await w.MM.fsys.dropbox.ready;
    check('an answer with another state is refused', !!w.MM.fsys.dropbox.loginError && !w.MM.fsys.dropbox.signedIn());
    await DB.login();
    const q3 = new URL(assigned).searchParams;
    pkce = { challenge: q3.get('code_challenge') };
    w = page('?code=CODE&state=' + q3.get('state'));
    DB = w.MM.fsys.dropbox;
    await DB.ready;
    check('signed in with code + verifier', DB.signedIn() && DB.justLoggedIn && !DB.loginError, DB.loginError);
    check('folder not chosen yet', DB.folder() === null && DB.restore() === null);
    check('no app secret / token in the page address', !/secret/i.test(assigned));

    // ---- files ----
    DB.setFolder('/Planung');
    const FS = w.MM.fsys;
    let B = DB.restore();
    check('backend name', B.kind === 'dropbox' && B.name === 'Dropbox · Planung', B.name);
    check('empty folder that does not exist yet', JSON.stringify(await B.list('')) === '[]');
    const t1 = JSON.stringify({ nodes: { a: 1 } });
    const w1 = await B.write('Weeks/2026-W46.mindmap.json', t1);
    check('write: version = rev', /^r\d+$/.test(w1.version), w1.version);
    for (let i = 0; i < 4; i++) await B.write(`Weeks/x${i}.mindmap.json`, 'x' + i);
    await B.write('Plan.mindmap.json', 'plan');
    const rootList = (await B.list('')).map((e) => e.kind + ':' + e.name).sort().join(',');
    check('list root (pages of 3 joined)', rootList === 'dir:Weeks,file:Plan.mindmap.json', rootList);
    check('list sub folder', (await B.list('Weeks')).length === 5);
    const st = await B.stat('Weeks/2026-W46.mindmap.json');
    check('stat', st && st.version === w1.version && st.modified > 0);
    check('stat of a missing file', (await B.stat('nope.json')) === null && !(await B.exists('nope.json')));

    calls = [];
    let r = await B.read('Weeks/2026-W46.mindmap.json');
    check('read: own write comes from the copy, no download', r.text === t1 && r.version === w1.version && count('/2/files/download') === 0, count('/2/files/download'));
    check('read of a missing file', (await B.read('Weeks/none.json')) === null);

    // changed elsewhere (other device)
    const t2 = JSON.stringify({ nodes: { a: 2 } });
    const other = putFile('/planung/weeks/2026-w46.mindmap.json', t2);
    calls = [];
    r = await B.read('Weeks/2026-W46.mindmap.json');
    check('within 5 s the listing stands (old rev, copy)', r.text === t1 && count('/2/files/list_folder') === 0);
    clock += 6000;
    r = await B.read('Weeks/2026-W46.mindmap.json');
    check('after 5 s: new listing, the changed file is downloaded', r.text === t2 && r.version === other.rev && count('/2/files/download') === 1);
    calls = [];
    await B.read('Weeks/2026-W46.mindmap.json');
    check('read again: from the copy', count('/2/files/download') === 0);

    // conflicts
    let err = null;
    try { await B.write('Weeks/2026-W46.mindmap.json', 'mine', { expect: w1.version, expectHash: FS.hash(t1) }); } catch (e) { err = e; }
    check('stale rev, other content: ConflictError', FS.isConflict(err), err && err.message);
    check('... and the file keeps the other version', files.get('/planung/weeks/2026-w46.mindmap.json').data === t2);
    const ok1 = await B.write('Weeks/2026-W46.mindmap.json', 'mine', { expect: other.rev, expectHash: FS.hash(t2) });
    check('current rev: written', files.get('/planung/weeks/2026-w46.mindmap.json').data === 'mine' && ok1.version !== other.rev);
    // an answer lost on the way: Dropbox has our content with a rev we never saw
    putFile('/planung/weeks/2026-w46.mindmap.json', 'mine');
    const ok2 = await B.write('Weeks/2026-W46.mindmap.json', 'mine 2', { expect: ok1.version, expectHash: FS.hash('mine') });
    check('other rev but our content: no conflict', files.get('/planung/weeks/2026-w46.mindmap.json').data === 'mine 2' && !!ok2.version);
    files.delete('/planung/weeks/2026-w46.mindmap.json');
    err = null;
    try { await B.write('Weeks/2026-W46.mindmap.json', 'x', { expect: ok2.version, expectHash: FS.hash('mine 2') }); } catch (e) { err = e; }
    check('deleted elsewhere: ConflictError', FS.isConflict(err));
    check('... and not created again', !files.has('/planung/weeks/2026-w46.mindmap.json'));

    // umlauts: the header must be ASCII (Dropbox refuses others)
    const uml = 'Tagebücher/Größe – äöü ß.diary.json';
    await B.write(uml, 'Grüße ✓');
    clock += 6000;
    r = await B.read(uml);
    check('umlauts in path and text', r && r.text === 'Grüße ✓', r && r.text);
    check('listed with umlauts', (await B.list('Tagebücher')).some((e) => e.name === 'Größe – äöü ß.diary.json'));

    // blobs, folders, delete, rename
    await B.writeBlob('Assets/Bild.PNG', new Blob([new Uint8Array([1, 2, 3])]));
    const blob = await B.readBlob('Assets/Bild.PNG');
    check('readBlob: type from the name', blob && blob.type === 'image/png' && blob.size === 3, blob && blob.type);
    check('readBlob of a missing file', (await B.readBlob('Assets/none.png')) === null);
    await B.mkdir('Months');
    await B.mkdir('Months'); // exists: no error
    check('mkdir (twice)', (await B.list('')).some((e) => e.kind === 'dir' && e.name === 'Months'));
    await B.remove('Plan.mindmap.json');
    await B.remove('Plan.mindmap.json'); // gone: no error
    check('remove (twice)', !(await B.exists('Plan.mindmap.json')));
    await B.write('a.json', 'A');
    await B.write('b.json', 'B');
    await B.rename('a.json', 'b.json');
    clock += 6000;
    check('rename onto an existing file replaces it', (await B.read('b.json')).text === 'A' && !(await B.exists('a.json')));
    await B.removeDir('Months');
    clock += 6000;
    check('removeDir', !(await B.list('')).some((e) => e.name === 'Months'));

    // too many requests: waits and tries again
    fail429 = 1;
    calls = [];
    await B.write('c.json', 'C');
    check('429: tried again', files.get('/planung/c.json').data === 'C' && count('/2/files/upload') === 2);

    // token: expired access token (401) -> renewed once, call repeated
    access = 'A50';
    calls = [];
    await B.write('d.json', 'D');
    check('401: token renewed, write done', files.get('/planung/d.json').data === 'D' && count('/oauth2/token') === 1);
    // several calls with an expired token: one renewal
    clock += 5 * 3600 * 1000;
    calls = [];
    await Promise.all([B.write('e1.json', '1'), B.write('e2.json', '2'), B.write('e3.json', '3')]);
    check('expired: one renewal for three calls', count('/oauth2/token') === 1, count('/oauth2/token'));
    check('access is granted', (await B.access(false)) === 'granted');

    // copies survive a restart (IndexedDB)
    await pause(2300);
    const saved = idbData.get('dropboxCache');
    check('copies kept in IndexedDB', saved && Object.keys(saved).some((k) => k.endsWith('/c.json')));
    w = page();
    DB = w.MM.fsys.dropbox;
    B = DB.restore();
    check('after a restart: still signed in, same folder', DB.signedIn() && B && B.name === 'Dropbox · Planung');
    calls = [];
    r = await B.read('c.json');
    check('after a restart: unchanged file from the copy', r.text === 'C' && count('/2/files/download') === 0 && count('/2/files/list_folder') === 1);

    // revoked in Dropbox: signed out, the folder stays
    refreshToken = 'GONE';
    access = 'A999';
    err = null;
    try { await B.read('b.json'); clock += 6000; await B.write('f.json', 'F'); } catch (e) { err = e; }
    check('revoked: error "signed out"', err && err.auth, err && err.message);
    check('revoked: not signed in, folder kept', !DB.signedIn() && DB.folder() === '/Planung');
    check('revoked: access asks for a sign-in', (await B.access(false)) === 'prompt');

    // local folder chosen in the cloud version: Dropbox inactive, restore() null
    refreshToken = 'R1';
    DB.setActive(false);
    check('inactive: no backend at start', DB.restore() === null);
    DB.setActive(true);

    // disconnect: token revoked at Dropbox, everything forgotten here
    w = page();
    DB = w.MM.fsys.dropbox;
    localStorage.setItem('mindmapper.dropbox', JSON.stringify({ refresh: 'R1', access, expires: FakeDate.now() + 3600e3, folder: '/Planung', active: true }));
    w = page();
    DB = w.MM.fsys.dropbox;
    await DB.disconnect();
    check('disconnect: revoked + forgotten', refreshToken === 'REVOKED' && !DB.signedIn() && DB.folder() === null && localStorage.getItem('mindmapper.dropbox') === '{}');
    check('disconnect: copies removed', idbData.get('dropboxCache') === undefined);
  } catch (e) {
    out.push('ERROR ' + (e && e.stack || e));
  }
  fs.writeFileSync(process.argv[3], out.join('\n') + '\n');
})();
