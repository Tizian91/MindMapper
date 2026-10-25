'use strict';
/*
 * pCloud as storage of the project folder - cloud version only (loaded by
 * cloud.html, never by index.html). Same functions as the local backend in
 * fsys.js; paths are relative to the chosen pCloud folder.
 *
 * Login: OAuth "token flow" for browser apps (no server, no secret): pCloud
 * sends the user back to the registered address with access_token and the API
 * host (api / eapi.pcloud.com) in the URL fragment. Both are kept in
 * localStorage of this site only; the token can be revoked in pCloud.
 * API: https://docs.pcloud.com (listfolder, stat, getfilelink, uploadfile, ...).
 */
(function (MM) {
  const FS = MM.fsys;
  const PC = (FS.pcloud = {});
  const KEY = 'mindmapper.pcloud';
  const tr = (s, v) => MM.tr(s, v);

  /** Client ID of the app registered at pCloud ("My applications") - public by design of the token flow. */
  PC.CLIENT_ID = 'H3ub5RB367h';
  /** Addresses the cloud version runs at (= registered redirect URI without the "/"). */
  PC.ORIGINS = ['https://mindmapper.tizian-arold.workers.dev'];

  PC.allowed = PC.ORIGINS.includes(location.origin);
  // local folders work here as well (one of the two is open at a time); a work
  // folder that must never get near a cloud belongs to the local version (index.html)

  // ---- Settings (token, API host, folder) ------------------------------------------

  function load() {
    try {
      const c = JSON.parse(localStorage.getItem(KEY) || '{}');
      return c && typeof c === 'object' ? c : {};
    } catch (e) {
      return {};
    }
  }
  function save(c) {
    try {
      localStorage.setItem(KEY, JSON.stringify(c));
    } catch (e) { /* storage unavailable: login only lasts for this page */ }
    cfg = c;
  }
  let cfg = PC.allowed ? load() : {};

  PC.hasToken = () => !!cfg.token;
  PC.folder = () => cfg.folder || '';

  /** Go to pCloud's login / approval page; it sends the user back with the token. */
  PC.login = function () {
    if (!PC.allowed) return;
    if (!PC.CLIENT_ID) {
      alert(tr('pCloud is not set up yet (the app has no pCloud client ID).'));
      return;
    }
    const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    try { sessionStorage.setItem(KEY + '.state', state); } catch (e) { /* checked below */ }
    const q = new URLSearchParams({
      client_id: PC.CLIENT_ID, response_type: 'token', redirect_uri: location.origin + '/', state,
    });
    location.href = 'https://my.pcloud.com/oauth2/authorize?' + q;
  };

  // back from pCloud: take the token out of the address before anything else runs
  (function takeToken() {
    if (!PC.allowed || !/access_token=/.test(location.hash)) return;
    const p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    let expected = null;
    try { expected = sessionStorage.getItem(KEY + '.state'); sessionStorage.removeItem(KEY + '.state'); } catch (e) { /* none */ }
    const host = p.get('hostname') || '';
    // the token only ever goes to pCloud's own API hosts
    if (!expected || p.get('state') !== expected || !/^e?api\.pcloud\.com$/.test(host) || !p.get('access_token')) {
      PC.loginFailed = true;
      return;
    }
    // logged in again after the token expired: the folder chosen before stays
    save({ token: p.get('access_token'), host, folder: load().folder || '', active: true });
    PC.justLoggedIn = true;
  })();

  // active: pCloud is the open project folder (false while a local folder is open)
  PC.setFolder = (folder) => save(Object.assign({}, cfg, { folder, active: true }));
  PC.setActive = (active) => save(Object.assign({}, cfg, { active }));
  PC.disconnect = () => save({});

  // ---- API -------------------------------------------------------------------------

  // parent folder / folder / file does not exist. pCloud does not document every code
  // ("stat" answers "File or folder not found." with one of its own), so the text counts too
  const NOT_FOUND = [2002, 2005, 2009, 2055];
  const NOT_FOUND_TEXT = /not found|does not exist/i;
  const AUTH = [1000, 2000, 2094, 2095]; // login required / failed, invalid token

  // pCloud refuses downloads (getfilelink) that come with the address of a web page
  // ("Invalid link referer", 7010) - programs on a PC send none. The requests to pCloud
  // go without it; pCloud also learns less about where they come from.
  const NO_REFERRER = 'no-referrer';

  async function api(method, params, body) {
    if (!cfg.token) throw new Error(tr('not connected to pCloud'));
    const url = new URL(`https://${cfg.host}/${method}`);
    for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
    url.searchParams.set('access_token', cfg.token);
    const res = await fetch(url, Object.assign({ referrerPolicy: NO_REFERRER }, body ? { method: 'POST', body } : {}));
    const data = await res.json();
    if (data.result !== 0) {
      // token no longer valid: forget it, "Connect pCloud…" logs in again (the folder stays)
      if (AUTH.includes(data.result)) save(Object.assign({}, cfg, { token: '' }));
      const err = new Error(AUTH.includes(data.result)
        ? tr('pCloud login expired – please connect again')
        : `pCloud: ${data.error || 'error'} (${data.result})`);
      err.code = data.result;
      err.notFound = NOT_FOUND.includes(data.result) || NOT_FOUND_TEXT.test(data.error || '');
      throw err;
    }
    return data;
  }
  const notFound = (err) => !!(err && err.notFound);

  /** Download a file's content (getfilelink: pCloud hands out a short-lived link). */
  async function download(full) {
    const link = await api('getfilelink', { path: full });
    const res = await fetch('https://' + link.hosts[0] + link.path, { referrerPolicy: NO_REFERRER });
    if (!res.ok) throw new Error('pCloud download: ' + res.status);
    return res;
  }

  // ---- Backend ---------------------------------------------------------------------

  const split = (path) => String(path || '').split('/').map((s) => s.trim()).filter(Boolean);
  // version: content hash + time (the hash alone is a 64-bit number, beyond JavaScript's exact range)
  const versionOf = (m) => `${m.hash}:${m.modified}`;

  /** Backend for the chosen folder, or null while not logged in / no folder chosen / a local folder is in use. */
  PC.restore = () => (PC.allowed && cfg.token && cfg.folder && cfg.active !== false ? PC.from(cfg.folder) : null);

  PC.from = function (folder) {
    const root = split(folder);
    const full = (path) => '/' + root.concat(split(path)).join('/');
    const parentOf = (path) => split(path).slice(0, -1).join('/');
    const nameOf = (path) => split(path).pop();

    const B = { kind: 'pcloud', name: 'pCloud' + (root.length ? ' · ' + root[root.length - 1] : '') };

    // one recursive listing serves all list() calls of a scan
    let tree = null, treeTime = 0;
    const known = new Set(); // full paths of folders that exist, so writes need no extra calls
    const changed = () => { tree = null; };

    async function loadTree() {
      if (tree && Date.now() - treeTime < 3000) return tree;
      try {
        tree = (await api('listfolder', { path: full(''), recursive: 1 })).metadata;
      } catch (err) {
        if (!notFound(err)) throw err;
        tree = { contents: [] };
      }
      treeTime = Date.now();
      return tree;
    }

    B.list = async function (folder) {
      let node = await loadTree();
      for (const part of split(folder)) {
        node = (node.contents || []).find((c) => c.isfolder && c.name === part);
        if (!node) return [];
      }
      return (node.contents || []).map((c) => ({ kind: c.isfolder ? 'dir' : 'file', name: c.name }));
    };

    B.stat = async function (path) {
      try {
        const m = (await api('stat', { path: full(path) })).metadata;
        return m.isfolder ? null : { version: versionOf(m), modified: Date.parse(m.modified) || 0 };
      } catch (err) {
        if (notFound(err)) return null;
        throw err;
      }
    };

    B.exists = async (path) => !!(await B.stat(path));

    B.read = async function (path) {
      const st = await B.stat(path);
      if (!st) return null;
      return { text: await (await download(full(path))).text(), version: st.version };
    };

    B.readBlob = async function (path) {
      if (!(await B.stat(path))) return null;
      return (await download(full(path))).blob();
    };

    /** Create the folder (and the project folder itself) where needed. */
    B.mkdir = async function (folder) {
      const parts = root.concat(split(folder));
      for (let i = 1; i <= parts.length; i++) {
        const p = '/' + parts.slice(0, i).join('/');
        if (known.has(p)) continue;
        await api('createfolderifnotexists', { path: p });
        known.add(p);
        changed();
      }
    };

    async function upload(path, blob) {
      const dir = parentOf(path);
      await B.mkdir(dir);
      const form = new FormData();
      form.append('file', blob, nameOf(path));
      // overwrites a file of the same name (pCloud keeps the old one as a revision)
      const send = () => api('uploadfile', { path: full(dir), filename: nameOf(path), nopartial: 1 }, form);
      let data;
      try {
        data = await send();
      } catch (err) {
        if (!notFound(err)) throw err;
        known.clear(); // a folder was deleted elsewhere meanwhile: create it again
        await B.mkdir(dir);
        data = await send();
      }
      changed();
      return { version: versionOf(data.metadata[0]) };
    }

    B.write = async function (path, text, opts) {
      const expect = opts && opts.expect;
      if (expect !== undefined && expect !== null) {
        const st = await B.stat(path);
        if (!st) throw FS.conflict(path); // deleted elsewhere
        if (st.version !== expect &&
          !(opts.expectHash && FS.hash(await (await download(full(path))).text()) === opts.expectHash)) throw FS.conflict(path);
      }
      return upload(path, new Blob([text], { type: 'application/json' }));
    };

    B.writeBlob = async function (path, data) {
      await upload(path, data instanceof Blob ? data : new Blob([data]));
    };

    B.remove = async function (path) {
      await api('deletefile', { path: full(path) });
      changed();
    };

    B.rename = async function (from, to) {
      await B.mkdir(parentOf(to));
      await api('renamefile', { path: full(from), topath: full(to) });
      changed();
    };

    B.access = async () => (cfg.token ? 'granted' : 'denied');

    return B;
  };

  // ---- Choosing the folder ---------------------------------------------------------

  /** Small folder browser on pCloud. Resolves to the chosen path ("/MindMapper") or null. */
  PC.chooseFolder = function () {
    return new Promise((resolve) => {
      const esc = MM.render.esc;
      let cur = cfg.folder || '/';
      const d = document.createElement('dialog');
      d.className = 'pcloud-dialog';
      d.innerHTML = `
        <form method="dialog" class="dlg">
          <h3>${esc(tr('Choose the pCloud folder for your maps'))}</h3>
          <p class="hint">${esc(tr('Pick a folder (or create one). All maps, the Diaries and Assets folders and the settings of this project live in it.'))}</p>
          <div class="pc-path"></div>
          <div class="pc-list"></div>
          <div class="dlg-buttons">
            <button type="button" data-pc="new">${esc(tr('New folder…'))}</button>
            <span style="flex:1"></span>
            <button type="button" data-pc="cancel">${esc(tr('Cancel'))}</button>
            <button type="button" data-pc="use" class="primary">${esc(tr('Use this folder'))}</button>
          </div>
        </form>`;
      document.body.appendChild(d);
      const list = d.querySelector('.pc-list');
      const done = (v) => {
        d.close();
        d.remove();
        resolve(v);
      };
      const show = async (path) => {
        cur = path;
        d.querySelector('.pc-path').textContent = '☁ ' + path;
        list.innerHTML = `<p class="hint">${esc(tr('Reading…'))}</p>`;
        try {
          const m = (await api('listfolder', { path, nofiles: 1 })).metadata;
          const dirs = (m.contents || []).filter((c) => c.isfolder).map((c) => c.name).sort((a, b) => a.localeCompare(b));
          list.innerHTML = (path !== '/' ? `<button type="button" class="pc-dir" data-up>↑ ..</button>` : '') +
            dirs.map((n) => `<button type="button" class="pc-dir" data-dir="${esc(n)}">📁 ${esc(n)}</button>`).join('') +
            (dirs.length ? '' : `<p class="hint">${esc(tr('No sub folders.'))}</p>`);
        } catch (err) {
          list.innerHTML = `<p class="hint">${esc(err.message)}</p>`;
        }
      };
      const join = (a, b) => (a === '/' ? '' : a) + '/' + b;
      list.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-up')) show(cur.slice(0, cur.lastIndexOf('/')) || '/');
        else show(join(cur, b.dataset.dir));
      });
      d.addEventListener('keydown', (e) => e.stopPropagation());
      d.addEventListener('cancel', (e) => {
        e.preventDefault();
        done(null);
      });
      d.querySelector('[data-pc="cancel"]').addEventListener('click', () => done(null));
      d.querySelector('[data-pc="use"]').addEventListener('click', () => done(cur));
      d.querySelector('[data-pc="new"]').addEventListener('click', async () => {
        const name = MM.project.sanitizeName(prompt(tr('Name of the new folder:'), 'MindMapper') || '');
        if (!name) return;
        try {
          await api('createfolderifnotexists', { path: join(cur, name) });
          show(join(cur, name));
        } catch (err) {
          alert(err.message);
        }
      });
      d.showModal();
      show(cur);
    });
  };
})(window.MM);
