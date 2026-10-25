'use strict';
/*
 * Storage backends of a project folder. project.js and storage.js never touch
 * file or folder handles directly, they go through a backend:
 *
 *   kind, name                      'local' (later 'pcloud', ...), name for the sidebar
 *   list(folder)                    direct children: [{ kind: 'dir'|'file', name }]
 *   read(path)                      { text, version } or null if missing
 *   readBlob(path)                  Blob or null if missing
 *   stat(path)                      { version, modified } or null if missing
 *   write(path, text, { expect, expectHash })
 *                                   { version } - parent folders are created; with expect (the
 *                                   version read before) a file changed or deleted since is not
 *                                   overwritten: ConflictError (FS.isConflict). expectHash (FS.hash of
 *                                   the text read / written before): another version but the same
 *                                   content is no conflict (some file systems, e.g. on Android, set
 *                                   the time of a write a little later or round it)
 *   writeBlob(path, data)           File, Blob or ArrayBuffer; errors are thrown, not swallowed
 *   mkdir(folder), remove(path), rename(from, to), exists(path)
 *   access(ask)                     'granted' | 'prompt' | 'denied' (ask: request it if needed)
 *
 * Paths are relative to the project folder ("Weeks/2026-W43.mindmap.json").
 * version: lastModified for local files (later the hash for pCloud).
 */
(function (MM) {
  const FS = (MM.fsys = {});
  const DIR_KEY = 'projectDir';

  const split = (path) => String(path || '').split('/').map((s) => s.trim()).filter(Boolean);

  /** The file was changed (or deleted) elsewhere since it was read. */
  FS.conflict = function (path) {
    const err = new Error('changed elsewhere: ' + path);
    err.name = 'ConflictError';
    return err;
  };
  FS.isConflict = (err) => !!err && err.name === 'ConflictError';

  /** Short fingerprint of a text (FNV-1a, 32 bit) - to tell "same content" without keeping the text. */
  FS.hash = function (text) {
    let h = 0x811c9dc5;
    const s = String(text);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36) + ':' + s.length;
  };

  // ---- Local folder (File System Access API, Edge / Chrome) ------------------------

  const local = (FS.local = {});
  local.supported = !!window.showDirectoryPicker;

  /** Ask the user for a folder and remember it. Throws AbortError when cancelled. */
  local.pick = async function () {
    const h = await window.showDirectoryPicker({ id: 'mindmapper', mode: 'readwrite' });
    await MM.storage.idb.set(DIR_KEY, h);
    return local.from(h);
  };

  /** The folder of the last session (permission may still be needed), or null. */
  local.restore = async function () {
    try {
      const h = await MM.storage.idb.get(DIR_KEY);
      return h ? local.from(h) : null;
    } catch (e) {
      return null;
    }
  };

  /** Backend for a directory handle (also used by the tests). */
  local.from = function (root) {
    async function dirOf(parts, create) {
      let dir = root;
      for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: !!create });
      return dir;
    }
    async function fileHandle(path, create) {
      const parts = split(path);
      const name = parts.pop();
      if (!name) throw new Error('invalid path: ' + path);
      return (await dirOf(parts, create)).getFileHandle(name, { create: !!create });
    }
    async function fileOrNull(path) {
      try {
        return await (await fileHandle(path, false)).getFile();
      } catch (e) {
        return null;
      }
    }

    const B = { kind: 'local', name: root.name, dir: root };

    B.list = async function (folder) {
      const out = [];
      let dir;
      try {
        dir = await dirOf(split(folder), false);
      } catch (e) {
        return out;
      }
      for await (const [name, h] of dir.entries()) {
        out.push({ kind: h.kind === 'directory' ? 'dir' : 'file', name });
      }
      return out;
    };

    B.read = async function (path) {
      const f = await fileOrNull(path);
      return f ? { text: await f.text(), version: f.lastModified } : null;
    };

    // getFile() already returns a Blob/File - no .blob() call needed
    B.readBlob = (path) => fileOrNull(path);

    B.stat = async function (path) {
      const f = await fileOrNull(path);
      return f ? { version: f.lastModified, modified: f.lastModified } : null;
    };

    B.exists = async (path) => !!(await fileOrNull(path));

    B.write = async function (path, text, opts) {
      const expect = opts && opts.expect;
      if (expect !== undefined && expect !== null) {
        const f = await fileOrNull(path);
        if (!f) throw FS.conflict(path); // deleted elsewhere
        // another time stamp: still ours if the content is what was read / written here
        if (f.lastModified !== expect && !(opts.expectHash && FS.hash(await f.text()) === opts.expectHash)) throw FS.conflict(path);
      }
      const fh = await fileHandle(path, true);
      const w = await fh.createWritable();
      await w.write(text);
      await w.close();
      return { version: (await fh.getFile()).lastModified };
    };

    B.writeBlob = async function (path, data) {
      const fh = await fileHandle(path, true);
      let w = await fh.createWritable();
      try {
        // Blobs / Files are supported directly, but a few Chromium builds only
        // accept them reliably as a buffer - retry that way when it fails.
        try {
          await w.write(data);
        } catch (err) {
          try { await w.abort(); } catch (e) { /* stream already closed */ }
          w = await fh.createWritable();
          const buf = data instanceof Blob ? await data.arrayBuffer() : data;
          await w.write(buf);
        }
        await w.close();
      } catch (err) {
        try { await w.abort(); } catch (e) { /* stream already closed */ }
        throw err;
      }
    };

    B.mkdir = async function (folder) {
      await dirOf(split(folder), true);
    };

    B.remove = async function (path) {
      const parts = split(path);
      const name = parts.pop();
      try {
        await (await dirOf(parts, false)).removeEntry(name);
      } catch (err) {
        // Android, folder of another app (pCloud, Drive …): the handles keep the state they
        // read, the app changed the folder since - "InvalidStateError". Read it again, retry.
        if (err.name !== 'InvalidStateError') throw err;
        const dir = await dirOf(parts, false);
        for await (const n of dir.keys()) if (n === name) break;
        try {
          await dir.removeEntry(name);
        } catch (err2) {
          const fh = await dir.getFileHandle(name).catch(() => null);
          if (!fh) return; // gone after all
          if (typeof fh.remove !== 'function') throw err2;
          await fh.remove();
        }
      }
    };

    /** Copy + delete (the API has no reliable move for files). */
    B.rename = async function (from, to) {
      const f = await fileOrNull(from);
      if (!f) throw new Error('not found: ' + from);
      await B.writeBlob(to, f);
      await B.remove(from);
    };

    B.access = async function (ask) {
      if (typeof root.queryPermission !== 'function') return 'granted';
      let perm = await root.queryPermission({ mode: 'readwrite' });
      if (perm === 'prompt' && ask && typeof root.requestPermission === 'function') {
        perm = await root.requestPermission({ mode: 'readwrite' });
      }
      return perm;
    };

    /** Path of a file handle inside this folder (from "Open" / "Save as"), or null. */
    B.resolve = async function (handle) {
      try {
        const parts = await root.resolve(handle);
        return parts ? parts.join('/') : null;
      } catch (e) {
        return null;
      }
    };

    return B;
  };
})(window.MM);
