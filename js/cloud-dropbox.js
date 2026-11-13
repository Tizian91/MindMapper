'use strict';
/*
 * Dropbox as storage of the project folder - cloud version only (loaded by cloud.html,
 * never by index.html). Same functions as the local backend in fsys.js; paths are
 * relative to the chosen folder.
 *
 * The Dropbox app has "App folder" access: it sees /Apps/<app folder>/ of the signed-in
 * account and nothing else. Every user signs in with their own Dropbox - the token stays
 * in this browser (localStorage of this site), there is no server in between.
 *
 * Sign-in: OAuth 2 with PKCE (no app secret anywhere); token_access_type=offline gives a
 * refresh token, so the short-lived access tokens (4 h) are renewed without a new sign-in.
 *
 * Conflicts: version = Dropbox's "rev" of a file. A write with an expected version is an
 * upload in "update" mode with that rev - Dropbox itself refuses it when the file was
 * changed or deleted since (one step, nothing in between). No sync program is involved,
 * so there are no conflict copies of our own writes.
 *
 * Reading: one recursive listing (fresh for a few seconds) gives the rev of every file;
 * texts already read with that rev come from a copy in this browser (IndexedDB), only
 * changed files are downloaded again.
 * API: https://www.dropbox.com/developers/documentation/http/documentation
 */
(function (MM) {
  const FS = MM.fsys;
  const DB = (FS.dropbox = {});
  const KEY = 'mindmapper.dropbox'; // localStorage: { refresh, access, expires, folder, active }
  const PKCE = 'mindmapper.dropbox.pkce'; // sessionStorage, during the sign-in: { verifier, state }
  const tr = (s, v) => MM.tr(s, v);

  /** App key of the app registered at Dropbox - public by design of PKCE (no secret). */
  DB.APP_KEY = '7jq9c5gqw28z8n3';
  const API = 'https://api.dropboxapi.com';
  const CONTENT = 'https://content.dropboxapi.com';
  const AUTHORIZE = 'https://www.dropbox.com/oauth2/authorize';
  // the page itself is the redirect URI registered at Dropbox (GitHub Pages / localhost:8000)
  const redirectUri = () => location.origin + location.pathname;

  /** Sign-in needs a secure page (https or localhost) and the browser's crypto. */
  DB.allowed = !!(window.isSecureContext && window.crypto && crypto.subtle);

  // ---- Settings (tokens, folder) ---------------------------------------------------

  function load(store, key) {
    try {
      const v = JSON.parse(store.getItem(key) || 'null');
      return v && typeof v === 'object' ? v : null;
    } catch (e) {
      return null;
    }
  }
  function store(storage, key, value) {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage unavailable: the sign-in only lasts for this page */ }
  }
  let cfg = (DB.allowed && load(localStorage, KEY)) || {};
  const save = (c) => {
    cfg = c;
    store(localStorage, KEY, c);
  };

  DB.signedIn = () => !!cfg.refresh;
  /** The chosen folder ("" = the app folder itself, "/Planung" = a folder in it) or null. */
  DB.folder = () => (typeof cfg.folder === 'string' ? cfg.folder : null);
  // active: Dropbox is the open project folder (false while a local folder is open)
  DB.setFolder = (folder) => save(Object.assign({}, cfg, { folder, active: true }));
  DB.setActive = (active) => save(Object.assign({}, cfg, { active }));

  // ---- Sign-in ---------------------------------------------------------------------

  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const random = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

  /** Go to Dropbox's sign-in / approval page; it sends the user back with a code. */
  DB.login = async function () {
    if (!DB.allowed) return;
    const verifier = random(48);
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const state = random(16);
    store(sessionStorage, PKCE, { verifier, state });
    location.assign(AUTHORIZE + '?' + new URLSearchParams({
      client_id: DB.APP_KEY,
      response_type: 'code',
      redirect_uri: redirectUri(),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      token_access_type: 'offline',
      state,
    }));
  };

  async function tokenRequest(fields) {
    let res;
    try {
      res = await fetch(API + '/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(Object.assign({ client_id: DB.APP_KEY }, fields)),
      });
    } catch (e) {
      throw offline();
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error_description || body.error || 'HTTP ' + res.status);
      err.auth = res.status === 400 || res.status === 401; // code / refresh token no longer valid
      throw err;
    }
    return body;
  }

  const withAccess = (r) => ({ access: r.access_token, expires: Date.now() + (r.expires_in || 14400) * 1000 });

  /**
   * Back from Dropbox: ?code=… (or ?error=…) in the address - trade the code for the tokens.
   * Runs at once when this file loads; project.js waits for DB.ready.
   */
  DB.ready = (async function takeCode() {
    if (!DB.allowed) return;
    const q = new URLSearchParams(location.search);
    if (!q.has('code') && !q.has('error')) return;
    history.replaceState(null, '', redirectUri() + location.hash); // the code must not stay in the address
    const pending = load(sessionStorage, PKCE);
    store(sessionStorage, PKCE, null);
    if (q.has('error')) {
      // "access_denied": the user said no - nothing to report
      if (q.get('error') !== 'access_denied') DB.loginError = q.get('error_description') || q.get('error');
      return;
    }
    if (!pending || pending.state !== q.get('state')) {
      DB.loginError = tr('the answer does not belong to this sign-in');
      return;
    }
    try {
      const r = await tokenRequest({
        grant_type: 'authorization_code', code: q.get('code'), code_verifier: pending.verifier, redirect_uri: redirectUri(),
      });
      // signed in again after the access was revoked: the folder chosen before stays
      save(Object.assign({}, cfg, { refresh: r.refresh_token, active: true }, withAccess(r)));
      DB.justLoggedIn = true;
    } catch (err) {
      DB.loginError = err.message;
    }
  })();

  /** Sign out: Dropbox forgets the token, this browser the sign-in, the folder and its copies. */
  DB.disconnect = async function () {
    if (cfg.refresh) {
      try {
        await rpc('auth/token/revoke', null);
      } catch (e) { /* offline or already revoked: forget it here anyway */ }
    }
    save({});
    cache.clear();
    try { await MM.storage.idb.set(CACHE_KEY, undefined); } catch (e) { /* no IndexedDB */ }
  };

  // ---- API -------------------------------------------------------------------------

  function offline() {
    const err = new Error(tr('Dropbox cannot be reached (offline?)'));
    err.offline = true;
    return err;
  }
  function signedOut() {
    const err = new Error(tr('Dropbox: signed out - please connect again'));
    err.auth = true;
    return err;
  }

  let refreshing = null;
  /** A valid access token - renewed with the refresh token when (nearly) expired. */
  async function token(force) {
    if (!cfg.refresh) throw signedOut();
    if (!force && cfg.access && cfg.expires - Date.now() > 60000) return cfg.access;
    if (!refreshing) {
      refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: cfg.refresh })
        .then((r) => save(Object.assign({}, cfg, withAccess(r))))
        .catch((err) => {
          // revoked (in Dropbox: Settings → Connected apps) or expired: sign in again, the folder stays
          if (err.auth) save(Object.assign({}, cfg, { refresh: null, access: null }));
          throw err.auth ? signedOut() : err;
        })
        .finally(() => { refreshing = null; });
    }
    await refreshing;
    return cfg.access;
  }

  /** Dropbox-API-Arg is an HTTP header: characters outside ASCII must be escaped. */
  const headerArg = (obj) => JSON.stringify(obj).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * fetch with the token. A 401 renews the token once, "too many requests" waits and tries
   * again. Errors carry Dropbox's error_summary ("path/not_found/..", "path/conflict/file/..").
   */
  async function call(url, init) {
    let renewed = false;
    for (let attempt = 0; ; attempt++) {
      const auth = await token(renewed && attempt > 0);
      let res;
      try {
        res = await fetch(url, Object.assign({ cache: 'no-store', referrerPolicy: 'no-referrer' }, init, {
          headers: Object.assign({ Authorization: 'Bearer ' + auth }, init.headers),
        }));
      } catch (e) {
        throw offline();
      }
      if (res.ok) return res;
      if (res.status === 401 && !renewed) {
        renewed = true;
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        const wait = Number(res.headers.get('Retry-After'));
        await pause(wait > 0 ? Math.min(wait, 30) * 1000 : 800 * 2 ** attempt);
        continue;
      }
      const text = await res.text().catch(() => '');
      let summary = text;
      try { summary = JSON.parse(text).error_summary || text; } catch (e) { /* plain text error */ }
      if (res.status === 401) {
        save(Object.assign({}, cfg, { refresh: null, access: null }));
        throw signedOut();
      }
      const err = new Error('Dropbox: ' + (summary || 'HTTP ' + res.status).trim());
      err.status = res.status;
      err.summary = String(summary || '');
      err.notFound = /not_found/.test(err.summary);
      err.conflict = res.status === 409 && /conflict/.test(err.summary);
      throw err;
    }
  }

  const rpc = async (endpoint, args) => (await call(API + '/2/' + endpoint, {
    method: 'POST',
    headers: args === null ? {} : { 'Content-Type': 'application/json' },
    body: args === null ? undefined : JSON.stringify(args),
  })).json();

  /** mode: 'overwrite' | { '.tag': 'update', update: rev }. Missing parent folders are created by Dropbox. */
  const upload = async (full, body, mode) => (await call(CONTENT + '/2/files/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': headerArg({ path: full, mode, autorename: false, mute: true, strict_conflict: true }),
    },
    body,
  })).json();

  /** { res, rev } of a file's content. */
  async function download(full) {
    const res = await call(CONTENT + '/2/files/download', { method: 'POST', headers: { 'Dropbox-API-Arg': headerArg({ path: full }) } });
    let rev = null;
    try { rev = JSON.parse(res.headers.get('Dropbox-API-Result')).rev; } catch (e) { /* header not readable */ }
    return { res, rev };
  }

  /** All entries of a folder (also below it with recursive) - Dropbox answers in pages. */
  async function listAll(full, recursive) {
    let r = await rpc('files/list_folder', { path: full, recursive: !!recursive, include_deleted: false, limit: 2000 });
    const entries = r.entries.slice();
    while (r.has_more) {
      r = await rpc('files/list_folder/continue', { cursor: r.cursor });
      entries.push(...r.entries);
    }
    return entries;
  }

  // ---- Copies of the texts read (IndexedDB) ----------------------------------------
  // full path (lower case) -> { rev, text }. Only a text with the rev Dropbox names now is used.

  const CACHE_KEY = 'dropboxCache';
  const cache = new Map();
  let cacheLoaded = null, cacheTimer = null;
  const idb = () => MM.storage && MM.storage.idb;

  function loadCache() {
    if (!cacheLoaded) {
      cacheLoaded = (async () => {
        try {
          const saved = window.indexedDB && idb() ? await idb().get(CACHE_KEY) : null;
          if (saved && typeof saved === 'object') for (const [k, v] of Object.entries(saved)) if (!cache.has(k)) cache.set(k, v);
        } catch (e) { /* no copies: everything is downloaded */ }
      })();
    }
    return cacheLoaded;
  }
  function keepCopy(full, rev, text) {
    if (!rev) return;
    cache.set(full.toLowerCase(), { rev, text });
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => {
      try {
        if (window.indexedDB && idb()) idb().set(CACHE_KEY, Object.fromEntries(cache)).catch(() => {});
      } catch (e) { /* not kept: downloaded again next time */ }
    }, 2000);
  }

  // ---- Backend ---------------------------------------------------------------------

  const split = (path) => String(path || '').split('/').map((s) => s.trim()).filter(Boolean);
  const TYPES = {
    pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', json: 'application/json', log: 'text/plain',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
    svg: 'image/svg+xml', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg',
  };
  const TREE_FRESH = 5000; // ms a listing stands for the folder (one listing serves a whole scan)

  /** Backend for the chosen folder, or null (not chosen yet / a local folder is in use). */
  DB.restore = () => (DB.allowed && DB.folder() !== null && cfg.active !== false ? DB.from(DB.folder()) : null);

  DB.from = function (folder) {
    const root = split(folder);
    const full = (path) => {
      const parts = root.concat(split(path));
      return parts.length ? '/' + parts.join('/') : ''; // "" = the app folder itself
    };
    const lower = (path) => full(path).toLowerCase();
    const parentKey = (key) => key.slice(0, key.lastIndexOf('/'));

    const B = { kind: 'dropbox', name: 'Dropbox' + (root.length ? ' · ' + root[root.length - 1] : '') };

    // the listing: files (lower-case full path -> { rev, modified }), folders (-> children)
    let tree = null, treeTime = 0, treeLoading = null;

    async function loadTree() {
      if (tree && Date.now() - treeTime < TREE_FRESH) return tree;
      if (!treeLoading) {
        treeLoading = (async () => {
          let entries = [];
          try {
            entries = await listAll(full(''), true);
          } catch (err) {
            if (!err.notFound) throw err; // the folder does not exist (yet): empty
          }
          const t = { files: new Map(), dirs: new Map([[lower(''), []]]) };
          for (const e of entries) {
            const key = e.path_lower;
            if (key === lower('')) continue;
            if (e['.tag'] === 'folder' && !t.dirs.has(key)) t.dirs.set(key, []);
            if (e['.tag'] === 'file') t.files.set(key, { rev: e.rev, modified: Date.parse(e.server_modified) || 0, size: e.size || 0 });
          }
          for (const e of entries) {
            if (e.path_lower === lower('') || e['.tag'] === 'deleted') continue;
            const list = t.dirs.get(parentKey(e.path_lower));
            if (list) list.push({ kind: e['.tag'] === 'folder' ? 'dir' : 'file', name: e.name });
          }
          tree = t;
          treeTime = Date.now();
          return t;
        })().finally(() => { treeLoading = null; });
      }
      return treeLoading;
    }

    /** Note a file written / removed here in the listing, so it stays usable without a new one. */
    function noteFile(path, meta) {
      if (!tree) return;
      const key = lower(path);
      if (!meta) {
        tree.files.delete(key);
        const list = tree.dirs.get(parentKey(key));
        if (list) {
          const name = split(path).pop().toLowerCase();
          const i = list.findIndex((c) => c.name.toLowerCase() === name);
          if (i >= 0) list.splice(i, 1);
        }
        return;
      }
      const known = tree.files.has(key);
      tree.files.set(key, { rev: meta.rev, modified: Date.parse(meta.server_modified) || Date.now(), size: meta.size || 0 });
      if (known) return;
      // a new file (maybe in new folders): simplest to list again next time
      tree = null;
    }

    B.list = async function (folder) {
      const t = await loadTree();
      return (t.dirs.get(lower(folder)) || []).slice();
    };

    B.stat = async function (path) {
      const f = (await loadTree()).files.get(lower(path));
      return f ? { version: f.rev, modified: f.modified, size: f.size } : null;
    };

    B.exists = async (path) => !!(await B.stat(path));

    B.read = async function (path) {
      await loadCache();
      const f = (await loadTree()).files.get(lower(path));
      if (!f) return null;
      const copy = cache.get(lower(path));
      if (copy && copy.rev === f.rev) return { text: copy.text, version: f.rev };
      let d;
      try {
        d = await download(full(path));
      } catch (err) {
        if (err.notFound) { // deleted meanwhile
          noteFile(path, null);
          return null;
        }
        throw err;
      }
      const text = await d.res.text();
      const rev = d.rev || f.rev;
      keepCopy(full(path), rev, text);
      return { text, version: rev };
    };

    const blobs = new Map(); // lower-case full path -> { rev, blob } (images: this session only)
    B.readBlob = async function (path) {
      const f = (await loadTree()).files.get(lower(path));
      if (!f) return null;
      const copy = blobs.get(lower(path));
      if (copy && copy.rev === f.rev) return copy.blob;
      let d;
      try {
        d = await download(full(path));
      } catch (err) {
        if (err.notFound) return null;
        throw err;
      }
      // a download comes as application/octet-stream: the type from the name, as for a local
      // file (an image, a PDF or a video is shown in the browser instead of being saved)
      const raw = await d.res.blob();
      const ext = ((split(path).pop() || '').match(/\.([^.]+)$/) || [])[1];
      const type = TYPES[String(ext || '').toLowerCase()] || raw.type;
      const blob = type === raw.type ? raw : new Blob([raw], { type });
      blobs.set(lower(path), { rev: d.rev || f.rev, blob });
      return blob;
    };

    B.write = async function (path, text, opts) {
      const expect = opts && opts.expect;
      const body = new Blob([text], { type: 'application/octet-stream' });
      let meta;
      if (expect === undefined || expect === null) {
        meta = await upload(full(path), body, 'overwrite');
      } else {
        try {
          meta = await upload(full(path), body, { '.tag': 'update', update: String(expect) });
        } catch (err) {
          if (!err.conflict) throw err;
          // another revision: still ours if it has the content read / written here (e.g. our own
          // write whose answer was lost on the way) - otherwise changed elsewhere
          let cur = null;
          if (opts.expectHash) {
            try {
              const d = await download(full(path));
              cur = { text: await d.res.text(), rev: d.rev };
            } catch (e) {
              if (!e.notFound) throw e;
            }
          }
          if (!cur || !cur.rev || FS.hash(cur.text) !== opts.expectHash) throw FS.conflict(path);
          try {
            meta = await upload(full(path), body, { '.tag': 'update', update: cur.rev });
          } catch (e) {
            throw e.conflict ? FS.conflict(path) : e;
          }
        }
      }
      noteFile(path, meta);
      keepCopy(full(path), meta.rev, text);
      return { version: meta.rev };
    };

    B.writeBlob = async function (path, data) {
      const meta = await upload(full(path), data instanceof Blob ? data : new Blob([data]), 'overwrite');
      noteFile(path, meta);
    };

    B.mkdir = async function (folder) {
      if (!full(folder)) return; // the app folder always exists
      try {
        await rpc('files/create_folder_v2', { path: full(folder), autorename: false });
      } catch (err) {
        if (!/path\/conflict/.test(err.summary || '')) throw err; // already there
      }
      tree = null;
    };

    async function remove(path) {
      try {
        await rpc('files/delete_v2', { path: full(path) });
      } catch (err) {
        if (!err.notFound) throw err; // gone already
      }
    }
    B.remove = async function (path) {
      await remove(path);
      noteFile(path, null);
    };
    B.removeDir = async function (folder) {
      if (!full(folder)) throw new Error('invalid folder: ' + folder);
      await remove(folder);
      tree = null;
    };

    /** Move a file; a file at the target is replaced (as with the local folder). */
    B.rename = async function (from, to) {
      const move = () => rpc('files/move_v2', { from_path: full(from), to_path: full(to), autorename: false });
      try {
        await move();
      } catch (err) {
        if (!/to\/conflict/.test(err.summary || '')) throw err;
        await remove(to);
        await move();
      }
      tree = null;
    };

    /** 'granted' while signed in; ask: go to Dropbox's sign-in (leaves the page). */
    B.access = async function (ask) {
      if (cfg.refresh) return 'granted';
      if (ask) await DB.login();
      return 'prompt';
    };

    return B;
  };

  // ---- Choosing the folder ---------------------------------------------------------

  /** Small folder browser inside the app folder. Resolves to the chosen path ("" / "/Planung") or null. */
  DB.chooseFolder = function () {
    return new Promise((resolve) => {
      const esc = MM.render.esc;
      let cur = DB.folder() || '';
      const d = document.createElement('dialog');
      d.className = 'cloud-dialog';
      d.innerHTML = `
        <form method="dialog" class="dlg">
          <h3>${esc(tr('Choose the Dropbox folder for your maps'))}</h3>
          <p class="hint">${esc(tr('MindMapper only sees its own folder in your Dropbox (in "Apps"). Pick a folder in it or create one - all maps, diaries, assets and the settings of this project live there.'))}</p>
          <div class="cd-path"></div>
          <div class="cd-list"></div>
          <div class="dlg-buttons">
            <button type="button" data-cd="new">${esc(tr('New folder…'))}</button>
            <span style="flex:1"></span>
            <button type="button" data-cd="cancel">${esc(tr('Cancel'))}</button>
            <button type="button" data-cd="use" class="primary">${esc(tr('Use this folder'))}</button>
          </div>
        </form>`;
      document.body.appendChild(d);
      const list = d.querySelector('.cd-list');
      const done = (v) => {
        d.close();
        d.remove();
        resolve(v);
      };
      const show = async (path) => {
        cur = path;
        d.querySelector('.cd-path').textContent = '☁ ' + tr('App folder') + (path || '');
        list.innerHTML = `<p class="hint">${esc(tr('Reading…'))}</p>`;
        try {
          const dirs = (await listAll(path, false)).filter((e) => e['.tag'] === 'folder').map((e) => e.name)
            .sort((a, b) => a.localeCompare(b));
          list.innerHTML = (path ? `<button type="button" class="cd-dir" data-up>↑ ..</button>` : '') +
            dirs.map((n) => `<button type="button" class="cd-dir" data-dir="${esc(n)}">📁 ${esc(n)}</button>`).join('') +
            (dirs.length ? '' : `<p class="hint">${esc(tr('No sub folders.'))}</p>`);
        } catch (err) {
          list.innerHTML = `<p class="hint">${esc(err.message)}</p>`;
        }
      };
      list.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-up')) show(cur.slice(0, cur.lastIndexOf('/')));
        else show(cur + '/' + b.dataset.dir);
      });
      d.addEventListener('keydown', (e) => e.stopPropagation());
      d.addEventListener('cancel', (e) => {
        e.preventDefault();
        done(null);
      });
      d.querySelector('[data-cd="cancel"]').addEventListener('click', () => done(null));
      d.querySelector('[data-cd="use"]').addEventListener('click', () => done(cur));
      d.querySelector('[data-cd="new"]').addEventListener('click', async () => {
        const name = MM.project.sanitizeName(prompt(tr('Name of the new folder:'), 'Planung') || '');
        if (!name) return;
        try {
          await rpc('files/create_folder_v2', { path: cur + '/' + name, autorename: false });
        } catch (err) {
          if (!/path\/conflict/.test(err.summary || '')) {
            alert(err.message);
            return;
          }
        }
        show(cur + '/' + name);
      });
      d.showModal();
      show(cur);
    });
  };
})(window.MM);
