'use strict';
/*
 * Saving and loading.
 *  - Files: JSON. In Chrome/Edge the File System Access API is used, so
 *    "Save" writes back into the same file. Other browsers fall back to
 *    download / file upload.
 *  - Autosave: the current map is kept in localStorage and restored on start.
 */
(function (MM) {
  const S = MM.state;
  const ST = (MM.storage = {});
  const AUTOSAVE_KEY = 'mindmapper.autosave';
  const SETTINGS_KEY = 'mindmapper.settings';
  const FILE_TYPES = [{ description: 'MindMapper map', accept: { 'application/json': ['.json'] } }];

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      /* storage unavailable (private mode etc.) */
    }
  }

  // ---- Settings ------------------------------------------------------------

  MM.saveSettings = function () {
    safeSet(SETTINGS_KEY, JSON.stringify({ settings: S.settings, edgeStyle: S.edgeStyle }));
  };

  ST.loadSettings = function () {
    try {
      const data = JSON.parse(safeGet(SETTINGS_KEY) || 'null');
      if (data) {
        Object.assign(S.settings, data.settings || {});
        Object.assign(S.edgeStyle, data.edgeStyle || {});
        S.settings.routineCategories = MM.normalizeCategories(S.settings.routineCategories);
      }
    } catch (e) {
      /* ignore corrupt settings */
    }
  };

  // ---- Per-folder capacity and priority system (mindmapper.settings.json in the project folder) ----

  ST.PROJECT_SETTINGS_FILE = 'mindmapper.settings.json';
  ST.CAPACITY_KEYS = ['hoursPerDay', 'hoursPerWeekendDay', 'workDays'];
  const projectReady = () => !!(MM.project && MM.project.status === 'ready' && MM.project.backend);

  /** Where the capacity is stored (for hints in the UI). */
  ST.capacityLocation = () => (projectReady()
    ? `in the folder "${MM.project.backend.name}" (${ST.PROJECT_SETTINGS_FILE})`
    : 'in this browser');

  /**
   * Read the capacity of the open project folder and apply it.
   * No file yet: create it from the current values (first use of the folder).
   */
  ST.loadProjectSettings = async function () {
    if (!projectReady()) return;
    let f = null;
    try {
      f = await MM.project.backend.read(ST.PROJECT_SETTINGS_FILE);
    } catch (e) { /* treated like a missing file */ }
    if (!f) {
      S.settings.syncedFolder = false; // not taken over from the folder before
      await ST.saveProjectSettings();
      return;
    }
    try {
      const data = JSON.parse(f.text);
      const c = (data && data.capacity) || {};
      for (const k of ST.CAPACITY_KEYS) if (c[k] !== undefined) S.settings[k] = c[k];
      // routine categories belong to the folder: none in the file = none here (not those of another folder)
      S.settings.routineCategories = MM.normalizeCategories(data && data.routineCategories);
      // a folder of a sync program: write its maps after a longer pause (see scheduleAutosave)
      S.settings.syncedFolder = !!(data && data.synced);
      MM.saveSettings();
      MM.setPrioSystem(data && data.prioSystem, false);
    } catch (e) {
      console.warn('MindMapper: unreadable ' + ST.PROJECT_SETTINGS_FILE, e);
    }
  };

  /** Write the capacity into the project folder (no-op without folder). */
  ST.saveProjectSettings = async function () {
    if (!projectReady()) return;
    const capacity = {};
    for (const k of ST.CAPACITY_KEYS) capacity[k] = S.settings[k];
    try {
      await MM.project.writeText(ST.PROJECT_SETTINGS_FILE, JSON.stringify({
        version: 1, capacity, prioSystem: S.settings.prioSystem, routineCategories: S.settings.routineCategories || [],
        synced: !!S.settings.syncedFolder,
      }, null, 2));
    } catch (e) {
      console.warn('MindMapper: could not write ' + ST.PROJECT_SETTINGS_FILE, e);
    }
  };

  // ---- Document in/out -------------------------------------------------------

  /** The document without images that no note uses any more. */
  ST.prunedDoc = function () {
    const used = new Set(Object.values(S.doc.nodes).flatMap(MM.assetRefs)); // image notes, images in diary text
    const assets = {};
    for (const id of used) if (S.doc.assets[id]) assets[id] = S.doc.assets[id];
    return Object.assign({}, S.doc, { assets });
  };

  ST.serialize = () => JSON.stringify(ST.prunedDoc(), null, 2);

  // ---- IndexedDB (autosave; much more room than localStorage, needed for images) ----

  const idb = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('mindmapper', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve((this.db = req.result));
        req.onerror = () => reject(req.error);
      });
    },
    async get(key) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const req = db.transaction('kv').objectStore('kv').get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async set(key, value) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };

  /** Replace the current document. */
  ST.load = function (raw, name) {
    S.doc = MM.normalizeDoc(raw);
    S.selection = new Set();
    S.file.name = name || S.file.name;
    MM.history.reset();
    MM.refresh();
  };

  ST.idb = idb;

  let autosaveTimer = null, fileTimer = null;
  let edits = 0; // counts the changes, so a write only marks "saved" what it really wrote
  // A folder kept by a sync program (pCloud, OneDrive …): write only after a pause of
  // typing. The app uploads each write - a new one during the upload makes it take the
  // file for changed on two devices and keep a "[conflicted]" copy. Leaving the app or
  // the map writes at once (initLifecycle, confirmLeave).
  ST.SYNC_DELAY = 15000;
  ST.scheduleAutosave = function () {
    if (S.dirty) edits++;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(ST.autosave, 800);
    // maps of a project folder are written straight back into their file
    if (inProject() && S.settings.autoSaveFile) {
      clearTimeout(fileTimer);
      fileTimer = setTimeout(() => ST.writeFile(), S.settings.syncedFolder ? ST.SYNC_DELAY : 1200);
    }
  };

  /** The open map belongs to the project folder (S.file.backend + path). */
  const inProject = () => !!(S.file.backend && S.file.path);

  /** The open map has a file to write to: a map of the project folder or a single file handle. */
  ST.hasFile = () => inProject() || !!S.file.handle;

  /**
   * Write the current map into its file (writes are queued, never overlap).
   * A map of the project folder is only written if its file is still the
   * version read here (S.file.version) - otherwise the user decides (askConflict).
   * Without a change (S.dirty) a map of the project folder is not written: panning
   * or zooming alone would otherwise rewrite the file again and again, and a sync
   * program (pCloud, OneDrive …) on two devices takes that for edits on both.
   */
  let writeQueue = Promise.resolve();

  // Contents the open map's file had here (path -> FS.hash, oldest first). The file back at
  // one of them is no change from elsewhere but a sync program setting it back - pCloud
  // then keeps the newer version as a conflict copy, and every next write as well.
  const seen = new Map();
  ST.remember = function (path, hash) {
    if (!path || !hash) return;
    const list = (seen.get(path) || []).filter((h) => h !== hash);
    list.push(hash);
    seen.set(path, list.slice(-30));
  };
  const wasHere = (path, hash) => (seen.get(path) || []).includes(hash);

  ST.writeFile = function () {
    clearTimeout(fileTimer);
    if (!ST.hasFile()) return writeQueue;
    if (inProject() && !S.dirty) return writeQueue;
    const { backend, path, handle } = S.file;
    const name = path ? path.split('/').pop() : handle.name;
    const doc = S.doc;
    const json = ST.serialize();
    const gen = edits;
    writeQueue = writeQueue.then(async () => {
      // the map was reloaded / replaced meanwhile (e.g. "Reload" in the conflict dialog)
      if (S.doc !== doc || S.file.path !== path || S.file.backend !== backend) return;
      try {
        if (backend && path && MM.fsys.hash(json) === S.file.hash) {
          // the file has this content already (as read / written here): no write. Leaving the
          // app sends "hidden" and "pagehide" - a second write of the same text while the sync
          // program still uploads the first one is what makes pCloud keep a conflict copy
        } else if (backend && path) {
          try {
            const r = await backend.write(path, json, { expect: S.file.version, expectHash: S.file.hash });
            S.file.version = r.version;
            S.file.hash = MM.fsys.hash(json);
            MM.project.setVersion(path, r.version, S.file.hash);
            ST.remember(path, S.file.hash);
          } catch (err) {
            if (!MM.fsys.isConflict(err)) throw err;
            await resolveConflict(backend, path, json);
            return;
          }
        } else {
          const w = await handle.createWritable();
          await w.write(json);
          await w.close();
        }
        // still dirty if it was changed again while writing (that change has its own write)
        if (S.file.backend === backend && S.file.path === path && S.file.handle === handle && edits === gen) S.dirty = false;
        ST.autosave();
        MM.ui.update();
      } catch (err) {
        MM.ui.flash(MM.tr('Could not save {name}: {err}', { name, err: err.message }));
      }
    });
    return writeQueue;
  };

  // ---- Conflict: the file was changed elsewhere since it was read ----------------

  /** Let the user decide what happens with the own version (json) of the map at `path`. */
  async function resolveConflict(backend, path, json) {
    const f = await backend.read(path).catch(() => null);
    const choice = await askConflict(path, !!f && wasHere(path, MM.fsys.hash(f.text)));
    if (choice === 'reload') {
      await ST.openPath(path);
      MM.ui.flash(MM.tr('Reloaded {name} - your changes were discarded', { name: S.file.name }));
      return;
    }
    let target = path;
    if (choice === 'copy') {
      const d = new Date(), p = (n) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`;
      const base = path.replace(/\.mindmap\.json$/i, '').replace(/\.json$/i, '');
      for (let i = 1; ; i++) {
        target = `${base} (${MM.tr('conflict')} ${stamp}${i > 1 ? ' ' + i : ''}).mindmap.json`;
        if (!(await backend.exists(target))) break;
      }
    }
    const r = await backend.write(target, json); // overwrite: on purpose, without a check
    S.file.path = target;
    S.file.name = target.split('/').pop();
    S.file.version = r.version;
    S.file.hash = MM.fsys.hash(json);
    MM.project.setVersion(target, r.version, S.file.hash);
    ST.remember(target, S.file.hash);
    S.dirty = false;
    ST.autosave();
    if (choice === 'copy') {
      await MM.project.scan();
      MM.ui.flash(MM.tr('Your version was saved as {name}; the original stays as it is', { name: S.file.name }));
    }
    MM.refresh();
  }

  /**
   * Dialog: 'reload' | 'overwrite' | 'copy' (built in the current language each time).
   * reverted: the file is back at a version it had here before (see seen).
   */
  function askConflict(path, reverted) {
    return new Promise((resolve) => {
      const tr = MM.tr, esc = MM.render.esc;
      const d = document.createElement('dialog');
      d.className = 'conflict-dialog';
      const btn = (cf, label, hint, cls) => `<button type="button" data-cf="${cf}"${cls ? ` class="${cls}"` : ''}>` +
        `<b>${esc(tr(label))}</b><small>${esc(tr(hint))}</small></button>`;
      const name = MM.project.mapName(path);
      const head = reverted ? `
          <h3>${esc(tr('"{name}" was set back to an older version', { name }))}</h3>
          <p>${esc(tr('Its file has a version again that it already had here before - your newer changes are not in it. Usually a sync program (e.g. pCloud) did that and kept your version as a conflict copy (⚠ next to the map).'))}</p>
          <p>${esc(tr('Choose a version, then wait until the sync program is done and clean up the copies before you go on - otherwise every next save may become another copy.'))}</p>` : `
          <h3>${esc(tr('"{name}" was changed elsewhere', { name }))}</h3>
          <p>${esc(tr('Since you opened this map here, its file was changed elsewhere (another computer, another tab or a sync program). There are two versions now: yours here and the other one in the file. Which one do you want to keep?'))}</p>`;
      d.innerHTML = `
        <form method="dialog" class="dlg">${head}
          <div class="conflict-buttons">
            ${reverted ? btn('reload', 'Load the older version', 'Discard my newer changes here') : btn('reload', 'Keep the other version', 'Load the file, discard my changes')}
            ${btn('copy', 'Keep both', 'Save mine as a copy next to it', 'primary')}
            ${btn('overwrite', 'Keep my version', 'Overwrite the file, the other changes are lost')}
          </div>
        </form>`;
      document.body.appendChild(d);
      d.addEventListener('keydown', (e) => e.stopPropagation());
      d.addEventListener('cancel', (e) => e.preventDefault()); // Esc: a decision is needed
      d.querySelectorAll('[data-cf]').forEach((b) => b.addEventListener('click', () => {
        d.close();
        d.remove();
        resolve(b.dataset.cf);
      }));
      d.showModal();
    });
  }

  ST.autosave = function () {
    const json = JSON.stringify({
      time: Date.now(), name: S.file.name, path: S.file.path || null, folder: ST.folderKey(S.file.backend), dirty: S.dirty, doc: ST.prunedDoc(),
    });
    // Small maps also go to localStorage: it is synchronous, so it survives closing the tab.
    const small = json.length < 2e6;
    if (small) safeSet(AUTOSAVE_KEY, json);
    if (window.indexedDB) {
      idb.set(AUTOSAVE_KEY, json).catch(() => {
        if (!small) MM.ui.flash(MM.tr('Autosave failed – please save the map to a file'));
      });
    }
  };

  /** Which project folder a map belongs to ("local:Planung"), or null. */
  ST.folderKey = (backend) => (backend ? `${backend.kind}:${backend.name}` : null);

  /** Restore the newest autosave. Resolves to false if there was nothing to restore. */
  ST.restoreAutosave = async function () {
    const found = [];
    try {
      const ls = JSON.parse(safeGet(AUTOSAVE_KEY) || 'null');
      if (ls && ls.doc) found.push(ls);
    } catch (e) { /* ignore */ }
    try {
      const raw = window.indexedDB ? await idb.get(AUTOSAVE_KEY) : null;
      const db = raw ? JSON.parse(raw) : null;
      if (db && db.doc) found.push(db);
    } catch (e) { /* ignore */ }
    if (!found.length) return false;
    found.sort((a, b) => (b.time || 0) - (a.time || 0));
    ST.load(found[0].doc, found[0].name);
    S.dirty = !!found[0].dirty;
    ST.restoredPath = found[0].path || null; // re-linked to its project file once the folder is reconnected
    ST.restoredFolder = found[0].folder || null; // ... but only in the same folder (older autosaves: any)
    ST.restoredTime = found[0].time || 0;    // the file wins if it was changed after this (other PC, sync)
    return true;
  };

  // ---- File operations -------------------------------------------------------

  /** Before replacing the current map: save it if it belongs to a file, otherwise ask. */
  ST.confirmLeave = async function (what) {
    MM.edit.finish();
    if (!S.dirty) return true;
    if (inProject()) {
      await ST.writeFile();
      if (!S.dirty) return true; // saved - otherwise (no permission, conflict …) ask below
    }
    // the map belongs to no file (or could not be saved): its changes would be lost - say so plainly
    return confirm(MM.tr('The open map "{name}" has changes that are not saved in any file.\n\nOK: discard them and {what}.\nCancel: keep them - save them with File → Save as… (or Ctrl+S).', {
      name: S.file.path ? MM.project.mapName(S.file.path) : S.file.name.replace(/\.mindmap\.json$|\.json$/i, ''), what: MM.tr(what),
    }));
  };

  /**
   * Link the open map to a file handle from "Open" / "Save as": a file inside
   * the project folder is used through the folder's backend (path), any other
   * file through its handle.
   */
  async function linkHandle(handle) {
    const b = MM.project && MM.project.backend;
    const path = b && b.resolve ? await b.resolve(handle) : null;
    S.file.handle = path ? null : handle;
    S.file.backend = path ? b : null;
    S.file.path = path;
    const st = path ? await b.stat(path) : null;
    S.file.version = st ? st.version : null;
    S.file.hash = null;
  }

  /** Directory to start the file pickers in (the local project folder). */
  const startIn = () => MM.project && MM.project.backend && MM.project.backend.dir;

  ST.newDoc = async function () {
    if (!(await ST.confirmLeave('start a new map'))) return;
    S.file = { handle: null, backend: null, name: 'Untitled.mindmap.json', path: null };
    ST.load(MM.emptyDoc());
    S.dirty = false;
    MM.actions.fit();
    ST.autosave();
  };

  ST.save = async function (saveAs) {
    MM.edit.finish();
    if (!saveAs && inProject()) {
      await ST.writeFile(); // with the conflict check; reports errors itself
      if (!S.dirty) MM.ui.flash(MM.tr('Saved {name}', { name: S.file.name }));
      MM.refresh();
      return;
    }
    const json = ST.serialize();
    try {
      if (window.showSaveFilePicker) {
        let handle = S.file.handle;
        if (!handle || saveAs) {
          const opts = { suggestedName: S.file.name, types: FILE_TYPES };
          if (startIn()) opts.startIn = startIn();
          handle = await window.showSaveFilePicker(opts);
        }
        const w = await handle.createWritable();
        await w.write(json);
        await w.close();
        S.file.name = handle.name;
        await linkHandle(handle);
        if (MM.project && MM.project.backend) MM.project.scan();
      } else {
        const name = saveAs || !S.file.saved ? prompt(MM.tr('File name'), S.file.name) : S.file.name;
        if (!name) return;
        S.file.name = name.endsWith('.json') ? name : name + '.json';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        a.download = S.file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        S.file.saved = true;
      }
      S.dirty = false;
      ST.autosave();
      MM.ui.flash(MM.tr('Saved {name}', { name: S.file.name }));
      MM.refresh();
    } catch (err) {
      if (err.name !== 'AbortError') alert(MM.tr('Saving failed: {err}', { err: err.message }));
    }
  };

  ST.open = async function () {
    if (!(await ST.confirmLeave('open another map'))) return;
    try {
      if (window.showOpenFilePicker) {
        const opts = { types: FILE_TYPES };
        if (startIn()) opts.startIn = startIn();
        const [handle] = await window.showOpenFilePicker(opts);
        await ST.openHandle(handle);
      } else {
        const input = document.getElementById('file-input');
        input.value = '';
        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return;
          try {
            ST.load(JSON.parse(await file.text()), file.name);
            S.file.handle = null;
            S.file.backend = null;
            S.file.path = null;
            afterOpen();
          } catch (err) {
            alert(MM.tr('Could not open file: {err}', { err: err.message }));
          }
        };
        input.click();
      }
    } catch (err) {
      if (err.name !== 'AbortError') alert(MM.tr('Could not open file: {err}', { err: err.message }));
    }
  };

  /** Load a map from a file handle (used by Open). */
  ST.openHandle = async function (handle) {
    const file = await handle.getFile();
    const text = await file.text();
    ST.load(text.trim() ? JSON.parse(text) : MM.emptyDoc(), file.name);
    await linkHandle(handle);
    afterOpen();
  };

  /** Load a map of the project folder (used by the project sidebar). */
  ST.openPath = async function (path) {
    const backend = MM.project.backend;
    const f = await MM.project.readDoc(path); // an empty file is no empty map (see there)
    if (!f) throw new Error('not found: ' + path);
    ST.load(f.doc, path.split('/').pop());
    S.file.handle = null;
    S.file.backend = backend;
    S.file.path = path;
    S.file.version = f.version;
    S.file.hash = MM.fsys.hash(f.text);
    MM.project.setVersion(path, f.version, S.file.hash);
    ST.remember(path, S.file.hash);
    afterOpen();
  };

  // ---- Leaving / coming back (phone: other app; PC: other window) --------------------
  // Leaving: write pending changes now, so a sync program can take them along.
  // Coming back: was the open map changed elsewhere meanwhile? Then load it before
  // it is edited here - instead of a conflict on the next save.

  let checking = null, lastCheck = 0, lastScan = 0;

  /** The open map's file changed elsewhere and nothing here is unsaved: load it (keeps the view). */
  ST.checkFile = function () {
    if (checking || !inProject() || Date.now() - lastCheck < 3000) return checking || Promise.resolve();
    lastCheck = Date.now();
    checking = (async () => {
      await writeQueue;
      if (S.dirty) {
        await ST.writeFile(); // asks if the file was changed elsewhere as well
        return;
      }
      const editing = () => !!(MM.editing || MM.edit.isLabelEditing());
      if (editing()) { lastCheck = 0; return; } // a text is being typed: check again later
      const { backend, path, version } = S.file;
      const st = await backend.stat(path);
      if (!st || st.version === version) return; // deleted: the next save asks
      const f = await MM.project.readDoc(path); // empty / cut off: throws, the map stays as it is
      if (!f || S.dirty || editing() || S.file.path !== path || S.file.backend !== backend) return;
      const hash = MM.fsys.hash(f.text);
      if (hash !== S.file.hash && wasHere(path, hash)) {
        // set back to an older version (sync program): do not load it silently - ask
        const json = ST.serialize();
        writeQueue = writeQueue.then(() => resolveConflict(backend, path, json))
          .catch((err) => MM.ui.flash(MM.tr('Could not save {name}: {err}', { name: S.file.name, err: err.message })));
        await writeQueue;
        return;
      }
      if (hash !== S.file.hash) {
        const view = S.doc.view;
        ST.load(f.doc, path.split('/').pop());
        if (view) S.doc.view = view;
        MM.refresh();
        MM.ui.flash(MM.tr('{name} was changed elsewhere - loaded the new version', { name: MM.project.mapName(path) }));
        MM.tasks.refreshExternal();
      }
      S.file.version = f.version;
      S.file.hash = hash;
      MM.project.setVersion(path, f.version, hash);
      ST.remember(path, hash);
      S.dirty = false;
      ST.autosave();
    })().catch((err) => console.warn('MindMapper: file check failed', err)).finally(() => { checking = null; });
    return checking;
  };

  ST.initLifecycle = function () {
    const leave = () => {
      ST.autosave();
      if (MM.diary) MM.diary.flush();
      if (S.dirty && inProject()) ST.writeFile();
    };
    const back = () => {
      if (document.visibilityState !== 'visible' || !MM.project.backend) return;
      ST.checkFile();
      if (Date.now() - lastScan > 30000) { // new maps (or copies) from the other device
        lastScan = Date.now();
        MM.project.scan().then(() => MM.project.adoptOpenMap()).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? leave() : back()));
    window.addEventListener('pagehide', leave);
    window.addEventListener('focus', back); // PC: back from another window (the tab stayed visible)
  };

  function afterOpen() {
    S.dirty = false;
    MM.actions.fit();
    ST.autosave();
    MM.ui.flash(MM.tr('Opened {name}', { name: S.file.name }));
    MM.tasks.refreshExternal(); // progress of tasks with derived maps (read in the background)
    MM.load.scheduleRefresh();  // the map we came from is one of the "other" maps now
  }
})(window.MM);
