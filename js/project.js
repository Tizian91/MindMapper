'use strict';
/*
 * Project folder: several maps in one folder (with sub folders, e.g. Weeks/, Months/).
 * All file access goes through a storage backend (fsys.js); the local folder
 * uses the File System Access API (Edge / Chrome). After a restart the browser
 * asks once for permission ("Reconnect").
 * Maps opened from the project are saved back into their file automatically.
 */
(function (MM) {
  const S = MM.state;
  const P = (MM.project = {});
  const esc = (s) => MM.render.esc(s);
  const tr = (s, v) => MM.tr(s, v);

  P.supported = MM.fsys.local.supported;
  P.backend = null;        // storage backend of the project folder (see fsys.js)
  P.entries = [];          // tree: { kind: 'dir'|'file', name, path, children? }
  P.status = 'none';       // none | ready | needs-permission | unsupported
  const collapsed = new Set();
  let root, dialog;

  const displayName = (name) => name.replace(/\.mindmap\.json$/i, '').replace(/\.json$/i, '');

  // ---- Folder handling ----------------------------------------------------------

  P.init = async function () {
    root = document.getElementById('sidebar');
    root.addEventListener('click', onClick);
    root.addEventListener('contextmenu', onContextMenu);
    buildDialog();
    if (!P.supported) {
      P.status = 'unsupported';
      P.render();
      return;
    }
    try {
      const b = await MM.fsys.local.restore();
      if (b) {
        P.backend = b;
        if ((await b.access(false)) === 'granted') await connected();
        else P.status = 'needs-permission';
      }
    } catch (e) { /* no stored folder */ }
    P.render();
  };

  P.choose = async function () {
    try {
      const b = await MM.fsys.local.pick();
      const before = S.file.path;
      if (!(await leaveFolder())) return;
      P.backend = b;
      S.settings.showProject = true;
      MM.saveSettings();
      await connected();
      // the same folder chosen again (or one with that map): the map opens from there again
      if (before && !S.file.path && P.find(before)) {
        try { await MM.storage.openPath(before); } catch (err) { /* stays as it is */ }
        P.render();
      }
      MM.refresh();
    } catch (err) {
      if (err.name !== 'AbortError') alert(tr('Could not open folder: {err}', { err: err.message }));
    }
  };

  P.reconnect = async function () {
    if (!P.backend) return;
    if ((await P.backend.access(true)) === 'granted') await connected();
    P.render();
  };

  /**
   * Before another project folder is opened: save the open map into its file,
   * then let go of it - it stays on screen, but no longer belongs to a folder
   * (otherwise it would keep writing into the old folder).
   */
  async function leaveFolder() {
    if (S.file.backend && S.file.path) await MM.storage.writeFile();
    // it could not be saved (e.g. no permission, changed elsewhere): ask, do not let go silently
    if (S.file.backend && S.file.path && S.dirty &&
      !confirm(tr('"{name}" could not be saved into its folder.\n\nOK: open the other folder anyway - the map stays on screen with its changes, but belongs to no folder (keep them with File → Save as…).\nCancel: stay in this folder.', { name: P.mapName(S.file.path) }))) return false;
    if (S.file.backend) {
      S.file.backend = null;
      S.file.path = null;
      S.file.version = null;
      S.file.hash = null;
    }
    P.history = [];
    return true;
  }

  /** Use a folder handle directly (also used by the tests). */
  P.useFolder = async function (handle) {
    P.backend = MM.fsys.local.from(handle);
    await connected();
  };

  async function connected() {
    P.status = 'ready';
    versions.clear();
    await MM.storage.loadProjectSettings(); // capacity of this folder (leisure / work instance)
    await P.scan();
    // the last session's map came from this folder -> link it to its file again
    const path = MM.storage.restoredPath;
    const folder = MM.storage.restoredFolder;
    MM.storage.restoredPath = null;
    // the same path in another folder is another file
    const same = !folder || folder === MM.storage.folderKey(P.backend);
    if (path && same && !S.file.path && P.find(path)) {
      await relinkRestored(path);
      if (S.file.path) await P.fillPlan(); // the plan of the last session gets what is new as well
    }
    P.render();
    MM.ui.update();
    if (MM.panel) MM.panel.update(true); // capacity hint now names the folder
    MM.tasks.refreshExternal();
  }

  /**
   * Link the map restored from the browser's autosave to its file again.
   * If the file changed after that autosave (edited on another PC, synced
   * folder), the file is loaded instead - otherwise the next autosave would
   * overwrite the newer file with the old copy.
   */
  async function relinkRestored(path) {
    let modified = 0, version = null;
    try {
      const st = await P.backend.stat(path);
      if (st) ({ modified, version } = st);
    } catch (err) { /* unreadable: keep the local copy */ }
    const newer = modified > (MM.storage.restoredTime || 0) + 2000;
    if (newer && (!S.dirty || confirm(tr('"{path}" was changed on disk after your last session here (e.g. on another computer).\n\nOK: load the file (recommended).\nCancel: keep the local copy - it will overwrite the file.', { path })))) {
      try {
        await MM.storage.openPath(path);
        return;
      } catch (err) {
        alert(tr('Could not load {path}: {err}', { path, err: err.message }));
        return; // keep the local copy, but don't link it to the file it could not read
      }
    }
    S.file.handle = null;
    S.file.backend = P.backend;
    S.file.path = path;
    S.file.version = version; // the local copy may replace this state of the file (checked above)
    S.file.hash = null;
  }

  P.scan = async function () {
    if (!P.backend) return;
    P.entries = await list('', 0);
    P.diaries = await listDiaries();
    MM.diary.loadIndex(); // 🔒 marks of diary notes on closed pages (background)
    P.render();
    MM.load.scheduleRefresh(); // workload of all maps (read in the background)
  };

  async function list(prefix, depth) {
    const out = [];
    for (const { kind, name } of await P.backend.list(prefix)) {
      if (name.startsWith('.')) continue;
      // per-folder capacity settings, not a map (also copies like "mindmapper.settings (1).json")
      if (depth === 0 && kind === 'file' && (name === MM.storage.PROJECT_SETTINGS_FILE || /^mindmapper\.settings \(\d+\)\.json$/i.test(name))) continue;
      if (depth === 0 && kind === 'file' && P.copyOf(name) === MM.storage.PROJECT_SETTINGS_FILE) continue; // its sync copies too
      // Assets/ holds the files of data notes - never list it as maps
      if (depth === 0 && kind === 'dir' && MM.files && name === MM.files.ASSET_FOLDER) continue;
      // Diaries/ holds the diaries (own sidebar section), and a diary file is no map anywhere
      if (depth === 0 && kind === 'dir' && name === P.DIARY_FOLDER) continue;
      if (kind === 'file' && DIARY_EXT.test(name)) continue;
      if (kind === 'dir' && depth < 4) {
        out.push({ kind: 'dir', name, path: prefix + name, children: await list(prefix + name + '/', depth + 1) });
      } else if (kind === 'file' && /\.json$/i.test(name)) {
        out.push({ kind: 'file', name, path: prefix + name });
      }
    }
    // conflict copies hang at their map (sidebar: ⚠ n) - no maps of their own, so they are
    // not counted twice in the overview / workload; a copy without its map stays a map
    const byName = new Map(out.filter((e) => e.kind === 'file').map((e) => [e.name, e]));
    const maps = out.filter((e) => {
      const orig = e.kind === 'file' && byName.get(P.copyOf(e.name, true));
      if (!orig || orig === e) return true;
      (orig.copies = orig.copies || []).push({ name: e.name, path: e.path });
      return false;
    });
    const coll = new Intl.Collator(undefined, { numeric: true });
    for (const e of maps) if (e.copies) e.copies.sort((a, b) => coll.compare(a.name, b.name));
    return maps.sort((a, b) => (a.kind === b.kind ? coll.compare(a.name, b.name) : a.kind === 'dir' ? -1 : 1));
  }

  /**
   * File name of the original if `name` is a conflict copy, else null:
   *   "W43.mindmap [conflicted 2].json"                      pCloud sync
   *   "W43 (Konflikt 2026-10-25 1228).mindmap.json"          MindMapper ("Keep both")
   *   "W43 (Name's conflicted copy 2026-10-25).mindmap.json" Dropbox
   *   "W43 (1).mindmap.json"                                 downloads, some sync apps - only
   *                                                          with loose (a map may be called so)
   */
  P.copyOf = function (name, loose) {
    let m = /^(.+?) \[conflicted(?: \d+)?\](\.[^.\s]+)?$/i.exec(name);
    if (m) return m[1] + (m[2] || '');
    m = /^(.+?) \((?:conflict|konflikt) \d{4}-\d\d-\d\d \d{4}(?: \d+)?\)(\.mindmap\.json|\.json)$/i.exec(name) ||
      /^(.+?) \([^()]*conflicted copy[^()]*\)(\.mindmap\.json|\.json)$/i.exec(name) ||
      (loose && /^(.+?) \(\d{1,2}\)(\.mindmap\.json|\.json)$/i.exec(name));
    return m ? m[1] + m[2] : null;
  };

  // ---- Diaries (see diary.js) --------------------------------------------------
  // One file per diary: Diaries/<name>.diary.json with its look, page overlays and
  // closed pages. The entries themselves are diary notes in the maps.

  P.DIARY_FOLDER = 'Diaries';
  const DIARY_EXT = /\.diary\.json$/i;
  P.diaries = []; // [{ name, path }]

  async function listDiaries() {
    const out = [];
    try {
      for (const { kind, name } of await P.backend.list(P.DIARY_FOLDER)) {
        if (kind === 'file' && DIARY_EXT.test(name)) {
          out.push({ name: name.replace(DIARY_EXT, ''), path: P.DIARY_FOLDER + '/' + name });
        }
      }
    } catch (e) { /* no diaries yet */ }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  P.diaryPath = (name) => `${P.DIARY_FOLDER}/${P.sanitizeName(name)}.diary.json`;

  /**
   * A diary file (normalized), or a fresh one if it does not exist yet.
   * opts.edit: read for the diary view, which writes it back - its version is checked then;
   * a file that stays empty / cut off throws then (a fresh diary would be saved over it).
   */
  P.readDiary = async function (name, opts) {
    const edit = !!(opts && opts.edit);
    let f = null;
    try {
      f = await P.readDoc(P.diaryPath(name));
    } catch (err) {
      if (edit) throw err;
    }
    if (f && edit) versions.set(P.diaryPath(name), { v: f.version, h: MM.fsys.hash(f.text) });
    return MM.diary.normalize(f && f.doc, name);
  };

  P.writeDiary = async function (data) {
    if (!(await P.ensureWriteAccess())) throw new Error(tr('no write access to the project folder'));
    await P.writeText(P.diaryPath(data.name), JSON.stringify(data, null, 2));
  };

  /** Ask for a name and create a new diary. Returns its name or null. */
  P.newDiary = async function () {
    if (P.status !== 'ready') {
      alert(tr('Diaries live in a project folder.\nOpen a folder in the "Project" sidebar first.'));
      return null;
    }
    const raw = prompt(tr('Name of the new diary (e.g. "Lab book" or "Journal"):'), '');
    const name = P.sanitizeName(raw || '');
    if (!name) return null;
    if (P.diaries.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
      alert(tr('A diary "{name}" exists already.', { name }));
      return null;
    }
    await P.writeDiary(MM.diary.normalize(null, name));
    P.diaries = await listDiaries();
    lastKey = '';
    P.render();
    return name;
  };

  // ---- Low level file helpers (used by rename, transfer, files, derive-map) ----

  /** True if a file with that path exists in the folder. */
  P.exists = async function (path) {
    return !!P.backend && !!path && (await P.backend.exists(path));
  };

  /**
   * Version of each file as last read or written here (path -> version). Writing
   * checks it, so a map changed elsewhere meanwhile (other computer, other tab,
   * sync program) is not overwritten. The open map keeps its own in S.file.version.
   * Entries: { v: version, h: FS.hash of the content } - the same content is no conflict.
   */
  const versions = new Map();
  P.setVersion = (path, version, hash) => versions.set(path, { v: version, h: hash || null });

  /**
   * Write a document (or any text) to a path of the project folder (folders are created).
   * opts.fresh: a new file (checked with P.exists before) - no version to compare.
   */
  P.writeText = function (path, text, opts) {
    // one write per file at a time: a second write must wait for the first, else it
    // starts from the old version and takes the first one for a change from elsewhere
    // (slow storage, big files - e.g. a diary with images on a phone)
    const run = (writing.get(path) || Promise.resolve()).catch(() => {}).then(() => writeNow(path, text, opts));
    writing.set(path, run);
    run.catch(() => {}).then(() => { if (writing.get(path) === run) writing.delete(path); });
    return run;
  };
  const writing = new Map(); // path -> the write in progress

  async function writeNow(path, text, opts) {
    try {
      const known = opts && opts.fresh ? null : versions.get(path);
      const r = await P.backend.write(path, text, { expect: known ? known.v : undefined, expectHash: known && known.h });
      const h = MM.fsys.hash(text);
      versions.set(path, { v: r.version, h });
      if (path === S.file.path) Object.assign(S.file, { version: r.version, hash: h }); // our own write is no conflict
      return r;
    } catch (err) {
      if (!MM.fsys.isConflict(err)) throw err;
      // the old version stays: further writes fail as well until the file is read again
      throw new Error(tr('"{path}" was changed elsewhere in the meantime (other computer, other tab). It was not overwritten - open it again and repeat the step.', { path }));
    }
  }

  /**
   * Make sure the project folder may be written. Asks for the permission when
   * the browser only "prompts" (e.g. after a restart), so writing an asset does
   * not fail silently. Returns true when writing is allowed.
   */
  P.ensureWriteAccess = async function () {
    if (!P.backend) return false;
    try {
      if ((await P.backend.access(true)) !== 'granted') return false;
      if (P.status !== 'ready') await connected();
      return P.status === 'ready';
    } catch (e) {
      return P.status === 'ready';
    }
  };

  /**
   * Write binary data (File, Blob or ArrayBuffer) into the project folder.
   * Does NOT swallow the error, so the caller can tell the user what actually
   * went wrong (NotAllowedError, quota, ...).
   */
  P.writeBlob = async function (path, data) {
    if (!P.backend) throw new Error('no project folder is open');
    await P.backend.writeBlob(path, data);
  };

  /**
   * Save a map that is not the open one. The open map is changed in place so
   * undo history and autosave keep working.
   */
  P.writeMap = async function (path, doc) {
    if (path === S.file.path) {
      S.doc.nodes = doc.nodes;
      S.doc.edges = doc.edges;
      S.doc.assets = Object.assign({}, doc.assets || S.doc.assets);
      MM.commit();
      await MM.storage.writeFile();
      return;
    }
    await P.writeText(path, JSON.stringify(doc, null, 2));
  };

  /** Path -> name without the map extension. */
  P.mapName = (path) => displayName(String(path || '').split('/').pop());

  /**
   * Make sure the map at `path` exists, creating it from the matching template
   * (blank / day / week / month) when needed. The map is NOT opened.
   * Returns the path.
   */
  P.ensureMap = async function (path) {
    if (await P.exists(path)) return path;
    const t = MM.templates.forPath(path);
    const doc = t.result.doc;
    // a plan ahead of time gets the unfinished work only once its period starts (see offerCarry)
    const started = MM.templates.hasStarted(path);
    doc.carriedOver = started;
    await MM.routines.addToPlan(doc, path); // meetings etc. of that day / week
    let carry = null;
    if (t.prevName && started) {
      carry = await P.carryFrom(P.folderOf(path), t.prevName);
      if (carry) MM.templates.addCarryOver(doc, carry.data, carry.name, path);
    }
    await P.writeText(path, JSON.stringify(doc, null, 2), { fresh: true });
    if (carry) await markMoved(carry, path);
    await P.scan();
    return path;
  };

  P.find = function (path, entries = P.entries) {
    for (const e of entries) {
      if (e.path === path) return e;
      if (e.children) {
        const r = P.find(path, e.children);
        if (r) return r;
      }
    }
    return null;
  };

  /** Path of the map whose conflict copy `path` is (see list), or null. */
  P.originalOf = function (path, entries = P.entries) {
    for (const e of entries) {
      if (e.copies && e.copies.some((c) => c.path === path)) return e.path;
      const r = e.children && P.originalOf(path, e.children);
      if (r) return r;
    }
    return null;
  };

  function paths(entries, out = []) {
    for (const e of entries) {
      out.push(e.path);
      if (e.copies) out.push(e.copies.length); // the sidebar shows their number
      if (e.children) paths(e.children, out);
    }
    return out;
  }

  function allFolders(entries = P.entries, out = []) {
    for (const e of entries) {
      if (e.kind === 'dir') {
        out.push(e.path);
        allFolders(e.children, out);
      }
    }
    return out;
  }

  /** All map paths of the project (for link suggestions and the overview). */
  P.mapPaths = function (entries = P.entries, out = []) {
    for (const e of entries) {
      if (e.kind === 'file') out.push(e.path);
      else P.mapPaths(e.children, out);
    }
    return out;
  };

  /**
   * Read and parse a map of the project (the open map comes from memory, it is newer).
   * Always normalized: other maps are untrusted input just like an opened file.
   */
  P.readMap = async function (path) {
    if (path === S.file.path) return S.doc;
    if (!P.find(path)) return null;
    try {
      const f = await P.readDoc(path);
      if (!f) return null;
      versions.set(path, { v: f.version, h: MM.fsys.hash(f.text) });
      return MM.normalizeDoc(f.doc);
    } catch (err) {
      return null;
    }
  };

  /**
   * Read a map file: { doc, text, version }, or null if it is missing. MindMapper never
   * writes an empty map file - an empty or cut-off one is still being written by someone
   * else (Android: the folder of a sync app hands out a file during its upload). It is
   * read again a few times; if it stays so, this throws - it is never taken for an empty
   * map, which the next save would write over the real content.
   */
  P.readDoc = async function (path) {
    for (let i = 0; ; i++) {
      const f = await P.backend.read(path);
      if (!f) return null;
      try {
        if (f.text.trim()) return { doc: JSON.parse(f.text), text: f.text, version: f.version };
      } catch (err) { /* incomplete: read again */ }
      if (i >= 3) throw new Error(tr('"{name}" is empty or incomplete right now - a sync program may still be writing or downloading it. Try again later.', { name: P.mapName(path) }));
      await new Promise((r) => setTimeout(r, P.READ_RETRY_MS * (i + 1)));
    }
  };
  P.READ_RETRY_MS = 400;

  // ---- Maps ------------------------------------------------------------------------

  P.history = []; // previously opened maps, for "Back"

  /** Open a map. Returns true if it is open afterwards. */
  P.openMap = async function (path, opts) {
    const orig = P.originalOf(path);
    const e = P.find(path) || (orig && { name: path.split('/').pop() });
    if (!e) return false;
    if (S.file.path === path) return true;
    const from = S.file.path;
    if (!(await MM.storage.confirmLeave('open another map'))) return false;
    try {
      await MM.storage.openPath(path);
    } catch (err) {
      alert(tr('Could not open {name}: {err}', { name: e.name, err: err.message }));
      return false;
    }
    if (from && !(opts && opts.noHistory)) P.history.push(from);
    P.render();
    if (orig) { // a conflict copy: only to look at / compare - no carry-over, no routines
      MM.ui.flash(tr('This is a conflict copy of "{map}" - keep or delete it with ⚠ next to the map', { map: P.mapName(orig) }));
      return true;
    }
    await P.offerCarry();
    await P.fillPlan();
    return true;
  };

  /**
   * The open map is a day / week plan: add the routines and appointments that
   * were set up after it was created (today and later, see routines.js addToPlan).
   */
  P.fillPlan = async function () {
    const path = S.file.path;
    const kind = path && MM.templates.parsePath(path).kind;
    if (kind !== 'day' && kind !== 'week') return;
    const doc = S.doc;
    const before = JSON.stringify(doc.planned || []);
    await MM.load.refresh(); // fresh from disk: the cache may still hold the map we came from as it was
    const r = await MM.routines.addToPlan(doc, path, { fill: true });
    if (doc !== S.doc) return; // another map was opened meanwhile
    if (!r.added && !r.removed && !r.updated && JSON.stringify(doc.planned || []) === before) return;
    MM.commit();
    await MM.storage.writeFile();
    if (r.added || r.removed) {
      MM.ui.flash([r.added ? tr('Added {n} routine / appointment entries', { n: r.added }) : '',
        r.removed ? tr('Removed {n} entries of deleted or moved appointments / routines', { n: r.removed }) : ''].filter(Boolean).join(' · '));
    }
    MM.refresh();
  };

  /**
   * The open map is a day / week / month plan that was created ahead of time
   * and its period has begun now: offer the unfinished work of the previous
   * one (once - declining counts as answered).
   */
  P.offerCarry = async function () {
    const path = S.file.path;
    if (!path || S.doc.carriedOver !== false || !MM.templates.hasStarted(path)) return;
    const t = MM.templates.forPath(path);
    const carry = t.prevName ? await P.carryFrom(P.folderOf(path), t.prevName) : null;
    S.doc.carriedOver = true;
    if (carry) {
      const count = carry.data.items.length + carry.data.open; // unfinished entries (sub-tasks & groups come along)
      if (confirm(tr('"{map}" has started.\n\nCarry over {n} unfinished entries from {from}?', { map: P.mapName(path), n: count, from: carry.name }))) {
        MM.templates.addCarryOver(S.doc, carry.data, carry.name, path);
        MM.commit();
        await markMoved(carry, path);
        MM.ui.flash(tr('Carried over {n} from {from}', { n: count, from: carry.name }));
      }
    }
    await MM.storage.writeFile(); // also stores the answered flag
    MM.refresh();
  };

  P.back = async function () {
    while (P.history.length) {
      const path = P.history.pop();
      if (P.find(path)) {
        await P.openMap(path, { noHistory: true });
        break;
      }
    }
    P.render();
  };

  /** Follow a link to a map of the project; offer to create it if it doesn't exist yet. */
  P.openLinked = async function (path) {
    if (P.status !== 'ready') {
      alert(tr('This link points to the map "{path}".\nOpen the project folder first (sidebar "Project").', { path }));
      return;
    }
    if (P.find(path)) {
      await P.openMap(path);
      return;
    }
    const t = MM.templates.forPath(path);
    const what = tr(t.kind === 'blank' ? 'an empty map' : `a ${t.kind} plan`);
    if (!confirm(tr('"{path}" does not exist yet.\nCreate it as {what}?', { path, what }))) return;
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const name = path.split('/').pop();
    const started = MM.templates.hasStarted(path);
    t.result.doc.carriedOver = started;
    await MM.routines.addToPlan(t.result.doc, path);
    const carry = t.prevName && started ? await P.carryFrom(folder, t.prevName) : null;
    if (carry) MM.templates.addCarryOver(t.result.doc, carry.data, carry.name, path);
    await P.createMap({ folder, name, doc: t.result.doc, carry });
  };

  /** After carrying over: mark the moved work in the previous map and save it. */
  async function markMoved(carry, newPath) {
    const newName = MM.links.label(newPath);
    if (carry.path === S.file.path) {
      MM.templates.markMoved(S.doc, carry.data, newPath, newName);
      MM.commit();
      await MM.storage.writeFile();
      return;
    }
    const doc = await P.readMap(carry.path);
    if (!doc) return;
    MM.templates.markMoved(doc, carry.data, newPath, newName);
    await P.writeText(carry.path, JSON.stringify(doc, null, 2));
  }

  /** Unfinished work of the map `<folder>/<name>.mindmap.json`, or null if there is none. */
  P.carryFrom = async function (folder, name) {
    const path = (folder ? folder + '/' : '') + name + '.mindmap.json';
    const doc = P.find(path) && (await P.readMap(path));
    if (!doc) return null;
    const data = MM.templates.collectUnfinished(doc);
    return data.items.length || data.notes.length ? { name, path, data } : null;
  };

  /**
   * Create a map file in the project (folder is created if needed).
   * Opens it unless opts.open === false. Returns the path (or null if cancelled).
   */
  P.createMap = async function ({ folder, name, doc, carry, open = true }) {
    await P.backend.mkdir(folder);
    const fname = /\.json$/i.test(name) ? name : name + '.mindmap.json';
    const path = (folder ? folder.replace(/\/+$/, '') + '/' : '') + fname;
    if (await P.exists(path)) {
      if (!confirm(tr('"{name}" already exists. Open it instead?', { name: fname }))) return null;
    } else {
      await P.writeText(path, JSON.stringify(doc, null, 2), { fresh: true });
      if (carry) await markMoved(carry, path);
    }
    await P.scan();
    if (open) await P.openMap(path);
    return path;
  };

  /** Sanitize user input into a map file name (without extension). */
  P.sanitizeName = (s) => String(s || '').trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);

  /** Sanitize a folder path ("Weeks/2026-Q4"): every part on its own, sub folders stay. */
  P.sanitizeFolder = (s) => String(s || '').split(/[\\/]+/).map(P.sanitizeName)
    .filter((p) => p && !/^\.+$/.test(p)).join('/');

  // ---- Rename / move maps ---------------------------------------------------

  /**
   * Rename or move a map inside the project folder and rewrite every link that
   * points at it (link, movedTo, movedFrom, derivedMap) in all maps.
   */
  P.renameMap = async function (oldPath, newPath) {
    if (!P.backend || !oldPath || !newPath) return false;
    if (oldPath === newPath) return true;
    const oldEntry = P.find(oldPath);
    if (!oldEntry) return false;
    if (await P.exists(newPath)) {
      alert(tr('"{path}" already exists.', { path: newPath }));
      return false;
    }

    let doc = null;
    if (oldPath === S.file.path) {
      await MM.storage.writeFile();
      doc = ST_doc();
    } else {
      doc = await P.readMap(oldPath);
    }
    if (!doc) {
      alert(tr('Could not read {path}', { path: oldPath }));
      return false;
    }

    let written;
    try {
      written = await P.writeText(newPath, JSON.stringify(doc, null, 2), { fresh: true });
      await P.backend.remove(oldPath);
      versions.delete(oldPath);
    } catch (err) {
      alert(tr('Could not rename the map: {err}', { err: err.message }));
      return false;
    }

    // the open map keeps pointing at its (moved) file
    const wasOpen = oldPath === S.file.path;
    if (wasOpen) {
      S.file.path = newPath;
      S.file.name = newPath.split('/').pop();
      S.file.version = written.version;
      S.file.hash = (versions.get(newPath) || {}).h || null;
    }
    P.history = P.history.map((p) => (p === oldPath ? newPath : p));

    await P.rewriteLinks(oldPath, newPath);
    await P.scan();

    const oldLabel = P.mapName(oldPath);
    const newLabel = P.mapName(newPath);
    if (wasOpen) {
      MM.storage.scheduleAutosave();
      MM.ui.flash(tr('Renamed to {name}', { name: newLabel }));
      MM.refresh();
    } else {
      MM.ui.flash(tr('Renamed {a} to {b}', { a: oldLabel, b: newLabel }));
    }
    return true;
  };

  /** Replace references to `oldPath` with `newPath` in every map of the project. */
  P.rewriteLinks = async function (oldPath, newPath) {
    const oldLabel = P.mapName(oldPath);
    const newLabel = P.mapName(newPath);
    const fix = (doc) => {
      let changed = false;
      for (const n of Object.values(doc.nodes || {})) {
        for (const key of ['link', 'movedTo', 'movedFrom', 'derivedMap']) {
          if (n[key] === oldPath) {
            n[key] = newPath;
            changed = true;
          }
        }
        for (const it of n.items || []) {
          if (it.moved === oldLabel) {
            it.moved = newLabel;
            changed = true;
          }
        }
      }
      return changed;
    };
    fix(S.doc); // open map: keep it in the undo history
    MM.commit();
    for (const path of P.mapPaths()) {
      if (path === newPath || path === S.file.path) continue;
      const doc = await P.readMap(path);
      if (!doc) continue;
      if (fix(doc)) await P.writeText(path, JSON.stringify(doc, null, 2));
    }
  };

  /** The open document as a plain object (used when renaming the open map). */
  function ST_doc() {
    return MM.clone({
      nodes: S.doc.nodes, edges: S.doc.edges, assets: S.doc.assets, view: S.doc.view, carriedOver: S.doc.carriedOver, planned: S.doc.planned,
    });
  }

  /** Folder of a map path ("" for the top level). */
  P.folderOf = (path) => {
    const s = String(path || '');
    return s.includes('/') ? s.slice(0, s.lastIndexOf('/')) : '';
  };

  /** All folder paths of the project (top level first), for dialogs. */
  P.folders = () => allFolders();

  // ---- Rename / move dialog --------------------------------------------------

  function buildRenameDialog() {
    const d = document.createElement('dialog');
    d.id = 'rename-map-dialog';
    d.innerHTML = `
      <form method="dialog" class="dlg">
        <h3>${tr('Rename or move map')}</h3>
        <label class="row"><span>${tr('Name')}</span><input type="text" name="name" required></label>
        <label class="row"><span>${tr('Folder')}</span><input type="text" name="folder" list="rename-folders" placeholder="${esc(tr('(top level)'))}"></label>
        <datalist id="rename-folders"></datalist>
        <p class="hint">${tr('Links to this map in other maps are updated automatically. Leaving the <code>YYYY-Www</code> / <code>YYYY-MM</code> / <code>YYYY-MM-DD</code> naming stops the automatic week/month/day wiring.')}</p>
        <div class="dlg-buttons">
          <button type="button" data-dlg="cancel">${tr('Cancel')}</button>
          <button type="submit" class="primary">${tr('Apply')}</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    const f = d.querySelector('form');
    d.addEventListener('keydown', (e) => e.stopPropagation());
    d.querySelector('[data-dlg="cancel"]').addEventListener('click', () => d.close());
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const oldPath = d.dataset.path;
      const name = P.sanitizeName(f.name.value).replace(/\.mindmap\.json$/i, '');
      if (!name || !oldPath) return;
      const folder = P.sanitizeFolder(f.folder.value);
      const newPath = (folder ? folder + '/' : '') + name + '.mindmap.json';
      d.close();
      await P.renameMap(oldPath, newPath);
    });
    return d;
  }

  let renameDialog = null;

  /** Open the rename / move dialog for a map path. */
  P.showRenameDialog = function (path) {
    if (P.status !== 'ready' || !path) return;
    if (!renameDialog) renameDialog = buildRenameDialog();
    const f = renameDialog.querySelector('form');
    renameDialog.dataset.path = path;
    f.name.value = displayName(path.split('/').pop());
    f.folder.value = P.folderOf(path);
    renameDialog.querySelector('#rename-folders').innerHTML =
      P.folders().map((p) => `<option value="${esc(p)}">`).join('');
    renameDialog.showModal();
  };

  // ---- Sidebar ---------------------------------------------------------------------

  function tree(entries, depth) {
    let h = '';
    for (const e of entries) {
      if (e.kind === 'dir') {
        const closed = collapsed.has(e.path);
        h += `<div class="sb-dir${closed ? ' closed' : ''}" data-dir="${esc(e.path)}" style="--d:${depth}">` +
          `<span class="sb-caret"></span>${esc(e.name)}</div>`;
        if (!closed) h += tree(e.children, depth + 1);
      } else {
        const active = S.file.path === e.path ? ' active' : '';
        const copies = e.copies ? `<button class="sb-copies" data-copies title="${esc(tr('{n} conflict copies of this map (e.g. from a sync program) - compare, keep one, clean up', { n: e.copies.length }))}">⚠ ${e.copies.length}</button>` : '';
        h += `<div class="sb-file${active}" data-file="${esc(e.path)}" style="--d:${depth}" title="${esc(e.path)}">` +
          `<span class="sb-file-name">${esc(displayName(e.name))}</span>${copies}` +
          `<button class="sb-more" data-more title="${esc(tr('Rename, move, delete…'))}">⋯</button></div>`;
      }
    }
    return h;
  }

  let lastKey = '';
  P.render = function () {
    if (!root) return;
    document.getElementById('main').classList.toggle('with-sidebar', !!S.settings.showProject);
    // rebuild only when something visible changed (keeps clicks from getting lost)
    const key = JSON.stringify([P.status, P.backend && P.backend.name, paths(P.entries), S.file.path, S.file.name, [...collapsed], P.history, MM.getLang(), P.diaries.map((d) => d.name)]);
    if (key === lastKey) return;
    lastKey = key;
    const back = P.history.length ? P.history[P.history.length - 1] : null;
    let h = `<div class="sb-head"><span>${tr('Project')}</span>
      ${P.status === 'ready' ? `<button data-p="overview" title="${esc(tr('Tasks of all maps'))}">${tr('Overview')}</button>` : ''}
      ${P.status === 'ready' ? `<button data-p="scan" title="${esc(tr('Reload folder'))}">⟳</button>` : ''}
      <button data-p="hide" title="${esc(tr('Hide sidebar'))}">✕</button></div>`;
    if (P.status === 'unsupported') {
      h += `<p class="hint">${tr('Project folders need Edge or Chrome. You can still open and save single maps.')}</p>`;
    } else if (P.status === 'none') {
      h += `<p class="hint">${tr('Keep several maps together in one folder – e.g. weekly and monthly plans.')}</p>
        <button class="sb-wide" data-p="choose">${tr('Open folder…')}</button>`;
    } else if (P.status === 'needs-permission') {
      h += `<p class="hint">${tr('The browser needs your OK to use the folder <b>{name}</b> again.', { name: esc(P.backend.name) })}</p>
        <button class="sb-wide primary" data-p="reconnect">${tr('Reconnect "{name}"', { name: esc(P.backend.name) })}</button>
        <button class="sb-wide" data-p="choose">${tr('Other folder…')}</button>`;
    } else {
      h += `<div class="sb-folder" title="${esc(tr('Project folder'))}"><span class="sb-folder-name">${esc(P.backend.name)}</span>
          <button data-p="choose" title="${esc(tr('Open another folder'))}">…</button></div>
        <button class="sb-wide primary" data-p="new">${tr('+ New map')}</button>
        ${back ? `<button class="sb-wide sb-back" data-p="back" title="${esc(back)}">${tr('← Back to {name}', { name: esc(displayName(back.split('/').pop())) })}</button>` : ''}
        <div class="sb-tree">${tree(P.entries, 0) || `<p class="hint">${tr('No maps yet.')}</p>`}</div>
        <div class="sb-diaries">
          <div class="sb-subhead"><span>${tr('Diaries')}</span>
            <button data-p="newDiary" title="${esc(tr('New diary…'))}">+</button></div>
          ${P.diaries.map((d) => `<div class="sb-diary" data-diary="${esc(d.name)}" title="${esc(tr('Open the diary'))}">📖 ${esc(d.name)}</div>`).join('') ||
            `<p class="hint">${tr('No diary yet. Diary entries are notes of the type "Diary entry".')}</p>`}
        </div>`;
      if (!S.file.path) {
        h += `<p class="hint sb-outside">${tr('The open map ({name}) is not part of this folder. Use <b>Save as</b> to store it here.', { name: esc(displayName(S.file.name)) })}</p>`;
      }
    }
    root.innerHTML = h;
  };

  /** Language change: sidebar and dialogs are built again in the new language. */
  P.rebuild = function () {
    lastKey = '';
    if (renameDialog) { renameDialog.remove(); renameDialog = null; }
    if (dialog) { dialog.remove(); buildDialog(); }
    P.render();
  };

  /** Right click on a map in the sidebar: open, rename, move, delete. */
  function onContextMenu(e) {
    const file = e.target.closest('[data-file]');
    if (!file) return;
    e.preventDefault();
    fileMenu(file.dataset.file, e.clientX, e.clientY);
  }

  /** Menu of a map in the sidebar (right click or its ⋯ button). */
  function fileMenu(path, x, y) {
    const folders = [{ label: tr('(top level)'), action: () => moveTo(path, '') }]
      .concat(P.folders().map((f) => ({ label: f, action: () => moveTo(path, f) })),
        [{ label: 'New folder…', action: () => moveToNewFolder(path) }]);
    MM.menu.open([
      { label: 'Open', action: () => P.openMap(path) },
      '-',
      { label: 'Rename or move…', action: () => P.showRenameDialog(path) },
      { label: 'Move to folder', submenu: folders },
      '-',
      { label: 'Delete map…', action: () => deleteMap(path) },
    ], x, y);
  }

  // ---- Conflict copies (see list / P.copyOf) ----------------------------------------

  /** Menu of the ⚠ n button: each copy (time, same content?) with open / keep / delete. */
  async function copiesMenu(path, x, y) {
    const e = P.find(path);
    if (!e || !e.copies) return;
    const read = async (p) => { try { return await P.backend.read(p); } catch (err) { return null; } };
    const orig = await read(path);
    const hash = orig && MM.fsys.hash(orig.text);
    const when = (v) => (v ? new Date(v).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '?');
    const ext = /\.mindmap\.json$|\.json$/i;
    const items = [{ label: tr('This map: {when}', { when: when(orig && orig.version) }), action: () => P.openMap(path) }, '-'];
    const dups = [];
    for (const c of e.copies) {
      const f = await read(c.path);
      const dup = !!(f && hash && MM.fsys.hash(f.text) === hash);
      if (dup) dups.push(c.path);
      // what tells the copy apart: "[conflicted 2]", "(Konflikt 2026-10-25 1228)"
      const tag = c.name.replace(ext, '').slice(P.copyOf(c.name, true).replace(ext, '').length).trim() || c.name;
      items.push({
        label: `${tag} · ${when(f && f.version)}${dup ? ' · ' + tr('same content') : ''}`,
        submenu: [
          { label: 'Open the copy', action: () => P.openMap(c.path) },
          { label: 'Keep this version…', disabled: dup, action: () => keepCopy(path, c.path) },
          '-',
          { label: 'Delete the copy…', action: () => deleteCopies(path, [c.path]) },
        ],
      });
    }
    items.push('-');
    if (dups.length) items.push({ label: tr('Delete the {n} copies with the same content', { n: dups.length }), action: () => deleteCopies(path, dups, true) });
    items.push({ label: tr('Delete all {n} copies…', { n: e.copies.length }), action: () => deleteCopies(path, e.copies.map((c) => c.path)) });
    MM.menu.open(items, x, y);
  }

  /** The copy becomes the map (its content replaces the file), the copy is removed. */
  async function keepCopy(path, copy) {
    if (!confirm(tr('Replace "{map}" with this copy?\n\nThe current content of "{map}" is lost, the copy is removed.', { map: P.mapName(path) }))) return;
    const open = S.file.path === path || S.file.path === copy;
    if (open && !(await MM.storage.confirmLeave('replace the map'))) return;
    try {
      const f = await P.backend.read(copy);
      if (!f) throw new Error('not found: ' + copy);
      const r = await P.backend.write(path, f.text); // on purpose, without a check
      versions.set(path, { v: r.version, h: MM.fsys.hash(f.text) });
      await P.backend.remove(copy);
      versions.delete(copy);
      await P.scan();
      if (open) {
        await MM.storage.openPath(path);
        await P.fillPlan(); // a plan: routines / appointments the replaced version had added
      }
      MM.ui.flash(tr('"{map}" now has the content of the copy', { map: P.mapName(path) }));
    } catch (err) {
      alert(tr('Could not replace the map: {err}', { err: err.message }));
    }
  }

  /** Remove conflict copies (quiet: copies with the map's content - nothing is lost). */
  async function deleteCopies(path, list, quiet) {
    if (!list.length) return;
    if (!quiet && !confirm(tr('Delete {n} conflict copies of "{map}"?\n\nThe map itself stays.', { n: list.length, map: P.mapName(path) }))) return;
    try {
      if (list.includes(S.file.path)) {
        if (!(await MM.storage.confirmLeave('delete the copy'))) return;
        await MM.storage.openPath(path);
      }
      const failed = [];
      for (const p of list) {
        try {
          await P.backend.remove(p);
          versions.delete(p);
        } catch (err) {
          failed.push(err.message);
        }
      }
      if (failed.length) alert(tr('{n} of {all} copies could not be deleted: {err}\n\nTry again after "Reload folder" (⟳), or delete them on another device (e.g. the PC).', { n: failed.length, all: list.length, err: failed[0] }));
      else MM.ui.flash(tr('Deleted {n} copies', { n: list.length }));
    } catch (err) {
      alert(tr('Could not delete the map: {err}', { err: err.message }));
    }
    await P.scan();
  }

  async function moveTo(path, folder) {
    const name = displayName(path.split('/').pop());
    const newPath = (folder ? folder + '/' : '') + name + '.mindmap.json';
    if (newPath === path) return;
    await P.renameMap(path, newPath);
  }

  async function moveToNewFolder(path) {
    const folder = P.sanitizeFolder(prompt(tr('Folder for this map:'), tr('Archive')));
    if (!folder) return;
    await moveTo(path, folder);
  }

  async function deleteMap(path) {
    if (!confirm(tr('Delete "{path}"?\n\nThe file is removed from the project folder.', { path }))) return;
    const label = P.mapName(path);
    try {
      if (path === S.file.path) {
        S.file = { handle: null, backend: null, name: 'Untitled.mindmap.json', path: null };
        MM.storage.load(MM.emptyDoc(), S.file.name);
        S.dirty = false;
      }
      await P.backend.remove(path);
      versions.delete(path);
      P.history = P.history.filter((p) => p !== path);
      await P.scan();
      MM.storage.autosave();
      MM.ui.flash(tr('Deleted {name}', { name: label }));
      MM.refresh();
    } catch (err) {
      alert(tr('Could not delete the map: {err}', { err: err.message }));
    }
  }

  function onClick(e) {
    const t = e.target;
    const btn = t.closest('[data-p]');
    if (btn) {
      const a = btn.dataset.p;
      if (a === 'choose') P.choose();
      else if (a === 'reconnect') P.reconnect();
      else if (a === 'scan') P.scan();
      else if (a === 'new') P.showNewDialog();
      else if (a === 'back') P.back();
      else if (a === 'overview') MM.overview.open();
      else if (a === 'hide') MM.actions.toggleProject();
      else if (a === 'newDiary') P.newDiary().then((name) => name && MM.diary.open(name));
      return;
    }
    const diary = t.closest('[data-diary]');
    if (diary) {
      MM.diary.open(diary.dataset.diary);
      return;
    }
    const dir = t.closest('[data-dir]');
    if (dir) {
      const p = dir.dataset.dir;
      if (collapsed.has(p)) collapsed.delete(p);
      else collapsed.add(p);
      P.render();
      return;
    }
    const file = t.closest('[data-file]');
    if (file && t.closest('[data-copies]')) {
      const r = t.closest('[data-copies]').getBoundingClientRect();
      copiesMenu(file.dataset.file, r.left, r.bottom);
    } else if (file && t.closest('[data-more]')) {
      const r = t.closest('[data-more]').getBoundingClientRect();
      fileMenu(file.dataset.file, r.left, r.bottom);
    } else if (file) {
      // phone: the sidebar lies over the map - out of the way once a map is chosen
      P.openMap(file.dataset.file).then((ok) => {
        if (ok && S.settings.showProject && window.matchMedia('(max-width: 600px)').matches) MM.actions.toggleProject();
      });
    }
  }

  // ---- "New map" dialog ----------------------------------------------------------

  function buildDialog() {
    dialog = document.createElement('dialog');
    dialog.id = 'new-map-dialog';
    dialog.innerHTML = `
      <form method="dialog" class="dlg">
        <h3>${tr('New map')}</h3>
        <div class="pick dlg-templates">
          <button type="button" class="pick-chip" data-tpl="blank">${tr('Blank')}</button>
          <button type="button" class="pick-chip" data-tpl="day">${tr('Day plan')}</button>
          <button type="button" class="pick-chip" data-tpl="week">${tr('Week plan')}</button>
          <button type="button" class="pick-chip" data-tpl="month">${tr('Month plan')}</button>
        </div>
        <label class="row" data-for="day"><span>${tr('Day')}</span><input type="date" name="day"></label>
        <label class="row" data-for="week"><span>${tr('Week')}</span><input type="week" name="week"></label>
        <label class="row" data-for="month"><span>${tr('Month')}</span><input type="month" name="month"></label>
        <label class="row"><span>${tr('Name')}</span><input type="text" name="name" required></label>
        <label class="row"><span>${tr('Folder')}</span><input type="text" name="folder" list="project-folders" placeholder="${esc(tr('(top level)'))}"></label>
        <datalist id="project-folders"></datalist>
        <label class="check dlg-carry" hidden><input type="checkbox" name="carry" checked> <span></span></label>
        <div class="dlg-buttons">
          <button type="button" data-dlg="cancel">${tr('Cancel')}</button>
          <button type="submit" class="primary">${tr('Create')}</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    const f = dialog.querySelector('form');
    let tpl = 'week', nameTouched = false;

    const suggestion = () => {
      if (tpl === 'day') return MM.templates.day(MM.templates.parseDay(f.day.value) || new Date());
      if (tpl === 'week') return MM.templates.week(MM.templates.parseWeek(f.week.value) || new Date());
      if (tpl === 'month') {
        const [y, m] = (f.month.value || MM.templates.monthValue(new Date())).split('-').map(Number);
        return MM.templates.month(new Date(y, m - 1, 1));
      }
      return MM.templates.blank(f.name.value.trim() || 'New map');
    };
    const sync = () => {
      dialog.querySelectorAll('[data-tpl]').forEach((b) => b.classList.toggle('active', b.dataset.tpl === tpl));
      dialog.querySelector('[data-for="day"]').hidden = tpl !== 'day';
      dialog.querySelector('[data-for="week"]').hidden = tpl !== 'week';
      dialog.querySelector('[data-for="month"]').hidden = tpl !== 'month';
      if (!nameTouched && tpl !== 'blank') {
        const s = suggestion();
        f.name.value = s.name;
        f.folder.value = s.folder;
      }
      updateCarry();
    };
    // offer to carry over unfinished work if the previous week / month exists
    const carryRow = dialog.querySelector('.dlg-carry');
    const prevPath = () => {
      if (tpl === 'blank') return null;
      const prev = MM.templates.forPath(f.name.value.trim()).prevName;
      if (!prev) return null;
      const folder = f.folder.value.trim().replace(/\/+$/, '');
      return { folder, name: prev, path: (folder ? folder + '/' : '') + prev + '.mindmap.json' };
    };
    const updateCarry = () => {
      const p = prevPath();
      carryRow.hidden = !(p && P.find(p.path));
      if (!p) return;
      // a plan ahead of time: the work is offered when its day / week / month starts
      const started = MM.templates.hasStarted(f.name.value.trim());
      if (f.carry.disabled && started) f.carry.checked = true;
      if (!started) f.carry.checked = false;
      f.carry.disabled = !started;
      carryRow.querySelector('span').textContent = started
        ? tr('Carry over unfinished work from {name}', { name: p.name })
        : tr('Unfinished work from {name} is offered when this ' + tpl + ' starts', { name: p.name });
    };
    f.name.addEventListener('input', updateCarry);
    f.folder.addEventListener('input', updateCarry);
    P._dialogReset = () => {
      tpl = 'week';
      nameTouched = false;
      f.day.value = MM.templates.dayValue(new Date());
      f.week.value = MM.templates.weekValue(new Date());
      f.month.value = MM.templates.monthValue(new Date());
      f.name.value = '';
      f.folder.value = '';
      dialog.querySelector('#project-folders').innerHTML = allFolders().map((p) => `<option value="${esc(p)}">`).join('');
      sync();
    };

    dialog.addEventListener('keydown', (e) => e.stopPropagation());
    dialog.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => {
      tpl = b.dataset.tpl;
      if (tpl === 'blank' && !nameTouched) {
        f.name.value = 'New map';
        f.folder.value = '';
      }
      sync();
    }));
    f.day.addEventListener('change', sync);
    f.week.addEventListener('change', sync);
    f.month.addEventListener('change', sync);
    f.name.addEventListener('input', () => (nameTouched = true));
    dialog.querySelector('[data-dlg="cancel"]').addEventListener('click', () => dialog.close());
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = f.name.value.trim().replace(/[\\/:*?"<>|]/g, '-');
      if (!name) return;
      const s = suggestion();
      if (tpl === 'blank') s.doc = MM.templates.blank(name).doc;
      const p = prevPath();
      const wantCarry = !carryRow.hidden && f.carry.checked && !f.carry.disabled && p;
      // started: the question is settled now (carried or unticked); ahead of time: ask later
      s.doc.carriedOver = MM.templates.hasStarted(name);
      dialog.close();
      try {
        const folder = P.sanitizeFolder(f.folder.value);
        if (tpl !== 'blank') await MM.routines.addToPlan(s.doc, (folder ? folder + '/' : '') + name);
        const carry = wantCarry ? await P.carryFrom(p.folder, p.name) : null;
        if (carry) MM.templates.addCarryOver(s.doc, carry.data, carry.name, name);
        await P.createMap({ folder: P.sanitizeFolder(f.folder.value), name, doc: s.doc, carry });
      } catch (err) {
        alert(tr('Could not create map: {err}', { err: err.message }));
      }
    });
  }

  P.showNewDialog = function () {
    if (P.status !== 'ready') return;
    P._dialogReset();
    dialog.showModal();
  };
})(window.MM);
