'use strict';
/*
 * Test page for a direct Dropbox connection (dropbox-test.html) - not part of the app.
 *
 * Sign-in: OAuth 2 with PKCE (no app secret anywhere), token_access_type=offline gives a
 * refresh token, so the short-lived access tokens (4 h) are renewed without a new sign-in.
 * The app has "App folder" access: it sees /Apps/<app folder>/ only, paths here are
 * relative to that folder ("/mindmapper-test.json").
 *
 * The test: write, read, update with the right revision, update with a stale revision
 * (Dropbox must refuse it: that is the conflict protection the app will rely on instead of
 * a sync program), file names with umlauts, list the folder, delete the test files.
 */
(function () {
  const APP_KEY = '7jq9c5gqw28z8n3';
  const API = 'https://api.dropboxapi.com';
  const CONTENT = 'https://content.dropboxapi.com';
  const AUTHORIZE = 'https://www.dropbox.com/oauth2/authorize';
  const STORE = 'mm-dropbox-test'; // localStorage: { refresh, access, expires }
  const PENDING = 'mm-dropbox-test-pkce'; // sessionStorage: { verifier, state }
  const redirectUri = location.origin + location.pathname;

  const $ = (id) => document.getElementById(id);

  function log(text, kind) {
    const li = document.createElement('li');
    li.textContent = text;
    if (kind) li.className = kind;
    $('log').appendChild(li);
  }

  // ---- storage (may be blocked: private window, site data off) ----
  function load(store, key) {
    try { return JSON.parse(store.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function save(store, key, value) {
    try {
      if (value === null) store.removeItem(key);
      else store.setItem(key, JSON.stringify(value));
    } catch (e) { /* not kept - the sign-in lasts for this page only */ }
  }
  let auth = load(localStorage, STORE);

  // ---- PKCE ----
  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const randomString = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

  async function connect() {
    const verifier = randomString(48);
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const state = randomString(16);
    save(sessionStorage, PENDING, { verifier, state });
    const q = new URLSearchParams({
      client_id: APP_KEY,
      response_type: 'code',
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      token_access_type: 'offline',
      state,
    });
    location.assign(AUTHORIZE + '?' + q);
  }

  /** Back from Dropbox with ?code=… (or ?error=…): trade the code for tokens. */
  async function handleReturn() {
    const q = new URLSearchParams(location.search);
    if (!q.has('code') && !q.has('error')) return;
    history.replaceState(null, '', redirectUri); // the code must not stay in the address bar
    if (q.has('error')) {
      log('Anmeldung abgebrochen: ' + (q.get('error_description') || q.get('error')), 'bad');
      return;
    }
    const pending = load(sessionStorage, PENDING);
    save(sessionStorage, PENDING, null);
    if (!pending || pending.state !== q.get('state')) {
      log('Anmeldung verworfen: Rückmeldung passt nicht zur Anfrage (state). Bitte neu verbinden.', 'bad');
      return;
    }
    const t0 = performance.now();
    const r = await tokenRequest({
      grant_type: 'authorization_code',
      code: q.get('code'),
      code_verifier: pending.verifier,
      redirect_uri: redirectUri,
    });
    setTokens(r);
    log(`Angemeldet, Token erhalten (${ms(t0)})`, 'ok');
  }

  async function tokenRequest(fields) {
    const res = await fetch(API + '/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(Object.assign({ client_id: APP_KEY }, fields)),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error('Token: ' + (body.error_description || body.error || res.status));
    return body;
  }

  function setTokens(r) {
    auth = {
      refresh: r.refresh_token || (auth && auth.refresh),
      access: r.access_token,
      expires: Date.now() + (r.expires_in || 14400) * 1000,
    };
    save(localStorage, STORE, auth);
  }

  /** A valid access token - renewed with the refresh token when (nearly) expired. */
  async function accessToken(force) {
    if (!auth || !auth.refresh) throw new Error('nicht verbunden');
    if (!force && auth.access && auth.expires - Date.now() > 60000) return auth.access;
    try {
      setTokens(await tokenRequest({ grant_type: 'refresh_token', refresh_token: auth.refresh }));
    } catch (err) {
      auth = null;
      save(localStorage, STORE, null);
      update();
      throw new Error('Anmeldung abgelaufen oder widerrufen – bitte neu verbinden (' + err.message + ')');
    }
    log('Zugangs-Token erneuert', 'info');
    return auth.access;
  }

  // ---- API calls ----

  /** Dropbox-API-Arg is an HTTP header: characters outside ASCII must be escaped. */
  const headerArg = (obj) => JSON.stringify(obj).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

  /** fetch with the token; a 401 renews it once. Errors carry status and Dropbox's error_summary. */
  async function call(url, init) {
    for (let attempt = 0; ; attempt++) {
      const token = await accessToken(attempt > 0);
      const res = await fetch(url, Object.assign({}, init, {
        headers: Object.assign({ Authorization: 'Bearer ' + token }, init.headers),
      }));
      if (res.status === 401 && attempt === 0) continue;
      if (res.ok) return res;
      const text = await res.text();
      let summary = text;
      try { summary = JSON.parse(text).error_summary || text; } catch (e) { /* plain text error */ }
      const err = new Error(`${res.status} ${summary}`.trim());
      err.status = res.status;
      err.summary = summary;
      throw err;
    }
  }

  const rpc = async (path, args) => (await call(API + '/2/' + path, {
    method: 'POST',
    headers: args === null ? {} : { 'Content-Type': 'application/json' },
    body: args === null ? undefined : JSON.stringify(args),
  })).json();

  /** mode: 'add' | 'overwrite' | { '.tag': 'update', update: rev } */
  const upload = async (path, text, mode) => (await call(CONTENT + '/2/files/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': headerArg({ path, mode, autorename: false, mute: true, strict_conflict: true }),
    },
    body: new Blob([text], { type: 'application/octet-stream' }),
  })).json();

  async function download(path) {
    const res = await call(CONTENT + '/2/files/download', {
      method: 'POST',
      headers: { 'Dropbox-API-Arg': headerArg({ path }) },
    });
    let meta = null;
    try { meta = JSON.parse(res.headers.get('Dropbox-API-Result')); } catch (e) { /* header not readable */ }
    return { text: await res.text(), meta };
  }

  // ---- the test ----

  const ms = (t0) => Math.round(performance.now() - t0) + ' ms';

  async function step(title, fn) {
    const t0 = performance.now();
    try {
      const note = await fn();
      log(`${title} (${ms(t0)})${note ? ' – ' + note : ''}`, 'ok');
      return true;
    } catch (err) {
      log(`${title}: ${err.message} (${ms(t0)})`, 'bad');
      return false;
    }
  }

  function sample(n) {
    return JSON.stringify({ test: n, at: new Date().toISOString(), text: 'Prüfung äöü ß – ✓', device: navigator.userAgent }, null, 2);
  }

  async function runTest() {
    $('run').disabled = true;
    $('log').textContent = '';
    const path = '/mindmapper-test.json';
    const umlautPath = '/Ordner äöü/Woche ß – Test.mindmap.json';
    let rev1 = null, text2 = null, ok = true;
    const tAll = performance.now();
    try {
      ok = await step('Konto lesen', async () => {
        const a = await rpc('users/get_current_account', null);
        return `${a.name.display_name} (${a.email})`;
      }) && ok;

      const text1 = sample(1);
      ok = await step('Datei schreiben', async () => {
        rev1 = (await upload(path, text1, 'overwrite')).rev;
        return 'Revision ' + rev1;
      }) && ok;

      ok = await step('Datei lesen', async () => {
        const r = await download(path);
        if (r.text !== text1) throw new Error('Inhalt weicht ab');
        return 'Inhalt stimmt' + (r.meta ? ', Revision ' + r.meta.rev : ' (Revision im Kopf nicht lesbar)');
      }) && ok;

      ok = await step('Ändern mit aktueller Revision', async () => {
        text2 = sample(2);
        const m = await upload(path, text2, { '.tag': 'update', update: rev1 });
        return 'neue Revision ' + m.rev;
      }) && ok;

      ok = await step('Ändern mit veralteter Revision muss abgelehnt werden', async () => {
        try {
          await upload(path, sample(3), { '.tag': 'update', update: rev1 });
        } catch (err) {
          if (err.status === 409 && /conflict/.test(err.summary)) return 'abgelehnt wie erwartet (' + err.summary + ')';
          throw err;
        }
        throw new Error('NICHT abgelehnt – der veraltete Stand wurde geschrieben');
      }) && ok;

      ok = await step('Datei hat noch den richtigen Stand', async () => {
        const r = await download(path);
        if (r.text !== text2) throw new Error('Inhalt weicht ab');
        return 'Inhalt stimmt';
      }) && ok;

      ok = await step('Ordner und Datei mit Umlauten', async () => {
        const t = sample(4);
        await upload(umlautPath, t, 'overwrite');
        const r = await download(umlautPath);
        if (r.text !== t) throw new Error('Inhalt weicht ab');
        return umlautPath;
      }) && ok;

      ok = await step('App-Ordner auflisten', async () => {
        const r = await rpc('files/list_folder', { path: '', recursive: false });
        const names = r.entries.map((e) => (e['.tag'] === 'folder' ? '📁 ' : '') + e.name);
        return `${names.length} Einträge: ${names.slice(0, 15).join(', ')}${names.length > 15 ? ' …' : ''}`;
      }) && ok;
    } finally {
      await step('Testdateien löschen', async () => {
        for (const p of [path, '/Ordner äöü']) {
          try {
            await rpc('files/delete_v2', { path: p });
          } catch (err) {
            if (!/not_found/.test(err.summary || '')) throw err;
          }
        }
      });
      log(ok ? `Alles in Ordnung – gesamt ${ms(tAll)}` : `Mindestens ein Schritt ist fehlgeschlagen – gesamt ${ms(tAll)}`, ok ? 'ok' : 'bad');
      $('run').disabled = !auth;
    }
  }

  async function disconnect() {
    try {
      await rpc('auth/token/revoke', null);
      log('Bei Dropbox abgemeldet', 'ok');
    } catch (err) {
      log('Abmelden bei Dropbox: ' + err.message, 'bad');
    }
    auth = null;
    save(localStorage, STORE, null);
    update();
  }

  // ---- page ----

  function update() {
    const on = !!(auth && auth.refresh);
    $('status').textContent = on ? 'Verbunden.' : 'Nicht verbunden.';
    $('connect').disabled = on;
    $('run').disabled = !on;
    $('disconnect').disabled = !on;
  }

  const guard = (fn) => () => fn().catch((err) => { log(err.message || String(err), 'bad'); update(); });
  $('connect').addEventListener('click', guard(connect));
  $('run').addEventListener('click', guard(runTest));
  $('disconnect').addEventListener('click', guard(disconnect));

  if (!window.isSecureContext || !crypto.subtle) {
    $('status').textContent = 'Diese Seite muss über https oder http://localhost geöffnet werden.';
    $('connect').disabled = true;
    return;
  }
  log('Rückkehr-Adresse: ' + redirectUri, 'info');
  update();
  guard(handleReturn)().then(update);
})();
