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
  const projectReady = () => !!(MM.project && MM.project.status === 'ready' && MM.project.dir);

  /** Where the capacity is stored (for hints in the UI). */
  ST.capacityLocation = () => (projectReady()
    ? `in the folder "${MM.project.dir.name}" (${ST.PROJECT_SETTINGS_FILE})`
    : 'in this browser');

  /**
   * Read the capacity of the open project folder and apply it.
   * No file yet: create it from the current values (first use of the folder).
   */
  ST.loadProjectSettings = async function () {
    if (!projectReady()) return;
    const fh = await MM.project.getHandle(ST.PROJECT_SETTINGS_FILE);
    if (!fh) {
      await ST.saveProjectSettings();
      return;
    }
    try {
      const data = JSON.parse(await (await fh.getFile()).text());
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
    if (S.file.handle && S.file.path && S.settings.autoSaveFile) {
      clearTimeout(fileTimer);
      fileTimer = setTimeout(() => ST.writeFile(), 1200);
    }
  };

  /** Write the current map into its file handle (writes are queued, never overlap). */
  let writeQueue = Promise.resolve();
  ST.writeFile = function () {
    clearTimeout(fileTimer);
    const handle = S.file.handle;
    if (!handle) return writeQueue;
    const json = ST.serialize();
    writeQueue = writeQueue.then(async () => {
      try {
        const w = await handle.createWritable();
        await w.write(json);
        await w.close();
        if (S.file.handle === handle) S.dirty = false;
        ST.autosave();
        MM.ui.update();
      } catch (err) {
        MM.ui.flash(MM.tr('Could not save {name}: {err}', { name: handle.name, err: err.message }));
      }
    });
    return writeQueue;
  };

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
    if (S.file.handle && S.file.path) {
      await ST.writeFile();
      return true;
    }
    return confirm(MM.tr('Discard unsaved changes and {what}?', { what: MM.tr(what) }));
  };

  /** Path of a file handle inside the project folder (e.g. "Weeks/2026-W43.mindmap.json") or null. */
  async function projectPath(handle) {
    const dir = MM.project && MM.project.dir;
    if (!dir || !handle) return null;
    try {
      const parts = await dir.resolve(handle);
      return parts ? parts.join('/') : null;
    } catch (e) {
      return null;
    }
  }

  ST.newDoc = async function () {
    if (!(await ST.confirmLeave('start a new map'))) return;
    S.file = { handle: null, name: 'Untitled.mindmap.json', path: null };
    ST.load(MM.emptyDoc());
    S.dirty = false;
    MM.actions.fit();
    ST.autosave();
  };

  ST.save = async function (saveAs) {
    MM.edit.finish();
    const json = ST.serialize();
    try {
      if (window.showSaveFilePicker) {
        if (!S.file.handle || saveAs) {
          const opts = { suggestedName: S.file.name, types: FILE_TYPES };
          if (MM.project && MM.project.dir) opts.startIn = MM.project.dir;
          S.file.handle = await window.showSaveFilePicker(opts);
        }
        const w = await S.file.handle.createWritable();
        await w.write(json);
        await w.close();
        S.file.name = S.file.handle.name;
        S.file.path = await projectPath(S.file.handle);
        if (MM.project && MM.project.dir) MM.project.scan();
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
        if (MM.project && MM.project.dir) opts.startIn = MM.project.dir;
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

  /** Load a map from a file handle (used by Open and the project sidebar). */
  ST.openHandle = async function (handle) {
    const file = await handle.getFile();
    const text = await file.text();
    ST.load(text.trim() ? JSON.parse(text) : MM.emptyDoc(), file.name);
    S.file.handle = handle;
    S.file.path = await projectPath(handle);
    afterOpen();
    MM.tasks.refreshExternal(); // progress of tasks with derived maps (read in the background)
    MM.load.scheduleRefresh();  // the map we came from is one of the "other" maps now
  };

  function afterOpen() {
    S.dirty = false;
    MM.actions.fit();
    ST.autosave();
    MM.ui.flash(MM.tr('Opened {name}', { name: S.file.name }));
  }
})(window.MM);
