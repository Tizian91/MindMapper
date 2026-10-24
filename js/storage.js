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
      await ST.saveProjectSettings();
      return;
    }
    try {
      const data = JSON.parse(f.text);
      const c = (data && data.capacity) || {};
      for (const k of ST.CAPACITY_KEYS) if (c[k] !== undefined) S.settings[k] = c[k];
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
      await MM.project.writeText(ST.PROJECT_SETTINGS_FILE, JSON.stringify({ version: 1, capacity, prioSystem: S.settings.prioSystem }, null, 2));
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
  ST.scheduleAutosave = function () {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(ST.autosave, 800);
    // maps of a project folder are written straight back into their file
    if (inProject() && S.settings.autoSaveFile) {
      clearTimeout(fileTimer);
      fileTimer = setTimeout(() => ST.writeFile(), 1200);
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
   */
  let writeQueue = Promise.resolve();
  ST.writeFile = function () {
    clearTimeout(fileTimer);
    if (!ST.hasFile()) return writeQueue;
    const { backend, path, handle } = S.file;
    const name = path ? path.split('/').pop() : handle.name;
    const doc = S.doc;
    const json = ST.serialize();
    writeQueue = writeQueue.then(async () => {
      // the map was reloaded / replaced meanwhile (e.g. "Reload" in the conflict dialog)
      if (S.doc !== doc || S.file.path !== path || S.file.backend !== backend) return;
      try {
        if (backend && path) {
          try {
            const r = await backend.write(path, json, { expect: S.file.version });
            S.file.version = r.version;
            MM.project.setVersion(path, r.version);
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
        if (S.file.backend === backend && S.file.path === path && S.file.handle === handle) S.dirty = false;
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
    const choice = await askConflict(path);
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
    MM.project.setVersion(target, r.version);
    S.dirty = false;
    ST.autosave();
    if (choice === 'copy') {
      await MM.project.scan();
      MM.ui.flash(MM.tr('Your version was saved as {name}; the original stays as it is', { name: S.file.name }));
    }
    MM.refresh();
  }

  /** Dialog: 'reload' | 'overwrite' | 'copy' (built in the current language each time). */
  function askConflict(path) {
    return new Promise((resolve) => {
      const tr = MM.tr, esc = MM.render.esc;
      const d = document.createElement('dialog');
      d.className = 'conflict-dialog';
      const btn = (cf, label, hint, cls) => `<button type="button" data-cf="${cf}"${cls ? ` class="${cls}"` : ''}>` +
        `<b>${esc(tr(label))}</b><small>${esc(tr(hint))}</small></button>`;
      d.innerHTML = `
        <form method="dialog" class="dlg">
          <h3>${esc(tr('"{name}" was changed elsewhere', { name: MM.project.mapName(path) }))}</h3>
          <p>${esc(tr('Since you opened this map here, its file was changed elsewhere (another computer, another tab or a sync program). There are two versions now: yours here and the other one in the file. Which one do you want to keep?'))}</p>
          <div class="conflict-buttons">
            ${btn('reload', 'Keep the other version', 'Load the file, discard my changes')}
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
      time: Date.now(), name: S.file.name, path: S.file.path || null, dirty: S.dirty, doc: ST.prunedDoc(),
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
      return true;
    }
    return confirm(MM.tr('Discard unsaved changes and {what}?', { what: MM.tr(what) }));
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
    const f = await backend.read(path);
    if (!f) throw new Error('not found: ' + path);
    ST.load(f.text.trim() ? JSON.parse(f.text) : MM.emptyDoc(), path.split('/').pop());
    S.file.handle = null;
    S.file.backend = backend;
    S.file.path = path;
    S.file.version = f.version;
    MM.project.setVersion(path, f.version);
    afterOpen();
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
