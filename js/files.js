'use strict';
/*
 * Data notes ("file" type): any file (Excel, Word, PDF, CSV, ZIP, ...) that is
 * dropped onto the canvas or pasted. The file is copied into the project
 * folder (Assets/), the note keeps only the relative path - like a Logseq
 * asset reference. Clicking the note opens the file in a new tab (or, for
 * types the browser cannot display, downloads it).
 *
 * The file itself is never deleted when the note is deleted.
 */
(function (MM) {
  const S = MM.state;
  const F = (MM.files = {});
  const ASSET_FOLDER = 'Assets';
  F.ASSET_FOLDER = ASSET_FOLDER; // project.js skips this folder when listing maps
  const MAX_NAME = 80;

  // ---- Helpers ---------------------------------------------------------------

  const ext = (name) => {
    const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  };

  F.humanSize = function (bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB';
    if (b < 1024 * 1024 * 1024) return (b / 1048576).toFixed(1) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
  };

  /** Subtitle of a file note: "report.xlsx · 42 KB". */
  F.describe = function (file) {
    if (!file || !file.name) return 'no file attached';
    return file.name + (file.size ? ' · ' + F.humanSize(file.size) : '');
  };

  const BADGE = {
    xls: 'XLS', xlsx: 'XLS', xlsm: 'XLS', csv: 'CSV', ods: 'ODS',
    doc: 'DOC', docx: 'DOC', odt: 'ODT', rtf: 'RTF',
    ppt: 'PPT', pptx: 'PPT', odp: 'ODP',
    pdf: 'PDF', txt: 'TXT', md: 'MD', json: 'JSON', xml: 'XML',
    zip: 'ZIP', rar: 'RAR', '7z': '7Z', gz: 'GZ',
    png: 'IMG', jpg: 'IMG', jpeg: 'IMG', gif: 'IMG', webp: 'IMG', svg: 'SVG',
    mp3: 'AUD', wav: 'AUD', mp4: 'VID', mov: 'VID', webm: 'VID',
    html: 'HTML', htm: 'HTML', py: 'PY', js: 'JS', css: 'CSS',
  };

  /** Small icon (extension badge) for a file name. */
  F.icon = function (name) {
    const e = ext(name);
    const label = BADGE[e] || (e ? e.slice(0, 4).toUpperCase() : 'FILE');
    const hue = label.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
    return `<span class="file-badge" style="--h:${hue}">${MM.render.esc(label)}</span>`;
  };

  /**
   * Types the browser can show inline. Everything else is downloaded.
   * Never HTML, SVG or XML: a blob: URL runs with the app's origin, so scripts
   * inside such a file could reach the stored project folder handle.
   */
  const INLINE = /^(pdf|txt|csv|md|json|log|png|jpe?g|gif|webp|bmp|avif|mp3|wav|ogg|m4a|mp4|webm|ogv)$/i;

  // ---- Paths -----------------------------------------------------------------

  /** A file name that is allowed in a folder (no \ / : * ? " < > |, no leading dots). */
  const safeName = (name) => String(name || 'file')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/^\.+/, '')
    .slice(-MAX_NAME) || 'file';

  /**
   * Pick a free path in Assets/ for a file name: "report.xlsx",
   * "report (2).xlsx", ... Never overwrites an existing asset.
   */
  async function freeAssetPath(name) {
    const safe = safeName(name);
    const dot = safe.lastIndexOf('.');
    const base = dot > 0 ? safe.slice(0, dot) : safe;
    const suffix = dot > 0 ? safe.slice(dot) : '';
    for (let i = 1; i < 1000; i++) {
      const candidate = ASSET_FOLDER + '/' + base + (i === 1 ? '' : ' (' + i + ')') + suffix;
      if (!(await MM.project.exists(candidate))) return candidate;
    }
    return ASSET_FOLDER + '/' + Date.now() + '-' + safe;
  }

  // ---- Inserting -------------------------------------------------------------

  /** True for File objects that should become file notes (not images). */
  F.isDataFile = (f) => !!(f && f.name && !(f.type && f.type.startsWith('image/')));

  /**
   * Copy one file into Assets/. Returns the node data ({ path, name, size, mime }).
   * Throws a readable error when the file cannot be written.
   */
  F.store = async function (file) {
    // the file already is in Assets/ (chosen from there, or inserted twice): use it, no copy "(2)"
    const own = ASSET_FOLDER + '/' + safeName(file.name);
    let path = (await sameContent(own, file)) ? own : null;
    if (!path) {
      path = await freeAssetPath(file.name || 'file');
      try {
        await MM.project.writeBlob(path, file);
      } catch (err) {
        // the browser usually names the real reason; add the path for context
        throw new Error(path + ': ' + describeError(err));
      }
    }
    // the name of the file in Assets/ ("report (2).pdf"), so the note shows which file it is
    return { path, name: path.split('/').pop(), size: file.size || 0, mime: file.type || '' };
  };

  /** Is the asset at `path` the same file (same size and bytes)? false if it is missing or unreadable. */
  async function sameContent(path, file) {
    try {
      const have = await MM.project.backend.readBlob(path);
      if (!have || have.size !== file.size) return false;
      const [a, b] = await Promise.all([have.arrayBuffer(), file.arrayBuffer()]);
      const x = new Uint8Array(a), y = new Uint8Array(b);
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
      return true;
    } catch (err) {
      return false;
    }
  }

  /** Readable message for File System Access API failures. */
  function describeError(err) {
    const name = err && err.name;
    if (name === 'NotAllowedError') return 'the browser blocked writing to the project folder (permission denied)';
    if (name === 'QuotaExceededError') return 'not enough free disk space';
    if (name === 'NoModificationAllowedError') return 'the file is locked by another program';
    if (name === 'NotFoundError') return 'the folder no longer exists';
    return (err && err.message) || String(err);
  }

  /**
   * Copy files into Assets/ and create one note per file, centered around
   * the world point `at`. Existing image files are ignored here (see images.js).
   */
  F.insertFiles = async function (files, at) {
    const list = [...files].filter(F.isDataFile);
    if (!list.length) return [];
    if (MM.project.status !== 'ready' && !(await MM.project.ensureWriteAccess())) {
      alert(MM.tr('Data notes keep the file inside your project folder.\n') +
        MM.tr(MM.project.status === 'unsupported'
          ? 'Project folders need Edge or Chrome, opened from disk (not file://).'
          : 'Open a folder in the "Project" sidebar first.'));
      return [];
    }
    const point = at || MM.viewCenter();
    const ids = [];
    let off = 0;
    for (const file of list) {
      try {
        const data = await F.store(file);
        const n = MM.createNode('file', point.x + off, point.y + off);
        n.text = file.name.replace(/\.[^.]+$/, '');
        n.file = data;
        S.doc.nodes[n.id] = n;
        ids.push(n.id);
        off += 30;
      } catch (err) {
        alert(MM.tr('Could not attach {name}:\n{err}', { name: file.name || MM.tr('file'), err: describeError(err) }));
      }
    }
    if (ids.length) {
      MM.select(ids);
      MM.commit();
      MM.project.scan();
      MM.ui.flash(ids.length === 1 ? MM.tr('File attached') : MM.tr('{n} files attached', { n: ids.length }));
    }
    return ids;
  };

  /** File picker -> file notes. */
  F.pick = function (at) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.onchange = async () => {
        await F.insertFiles([...input.files], at);
        resolve();
      };
      input.oncancel = () => resolve();
      input.click();
    });
  };

  /** Replace the file of an existing note (keeps the note, swaps the asset). */
  F.replace = async function (node, file) {
    if (!node || !file) return;
    if (MM.project.status !== 'ready' && !(await MM.project.ensureWriteAccess())) {
      throw new Error('open the project folder first');
    }
    node.file = await F.store(file);
    MM.commit();
    MM.project.scan();
  };

  /** Pick a replacement file for the selected file note. */
  F.pickReplace = function (node) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = async () => {
        const [file] = input.files;
        if (file) {
          try {
            await F.replace(node, file);
          } catch (err) {
            alert(MM.tr('Could not replace the file: {err}', { err: err.message }));
          }
        }
        resolve();
      };
      input.click();
    });
  };

  // ---- Opening ---------------------------------------------------------------

  /** Open the attached file: inline in a new tab when possible, else download. */
  F.open = async function (node) {
    const file = node && node.file;
    if (!file || !file.path) return;
    if (!MM.project.backend) {
      alert(MM.tr('This note points to "{path}".\nOpen the project folder first (sidebar "Project").', { path: file.path }));
      return;
    }
    // after a restart the browser may only "prompt" for permission - ask now
    if (!(await MM.project.ensureWriteAccess())) {
      alert(MM.tr('This note points to "{path}".\nAllow access to the project folder first (sidebar "Project").', { path: file.path }));
      return;
    }
    let blob = null;
    try {
      blob = await MM.project.backend.readBlob(file.path);
    } catch (err) { /* treated like a missing file */ }
    if (!blob) {
      // the asset may never have been copied (older bug) - offer to pick it again
      if (confirm(MM.tr('File not found:\n{path}\n\nPick the file from disk and copy it into Assets/ now?', { path: file.path }))) {
        await F.pickReplace(node);
      }
      return;
    }
    try {
      const url = URL.createObjectURL(blob);
      if (INLINE.test(ext(file.name))) {
        // Note: with the "noopener" window feature window.open() always returns
        // null, which must not be mistaken for a blocked popup (it opened twice).
        const win = window.open(url, '_blank');
        if (win) {
          win.opener = null; // same protection as noopener, but keeps the reference
          // the URL stays alive for the lifetime of the page: revoking it would
          // break seeking / replaying in the opened tab
        } else {
          // really blocked: fall back to a temporary link
          const a = document.createElement('a');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name || 'file';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (err) {
      alert(MM.tr('Could not open {name}: {err}', { name: file.name, err: describeError(err) }));
    }
  };

  /** Show the relative asset path (helps finding the file on disk). */
  F.reveal = function (node) {
    const p = node && node.file && node.file.path;
    if (p) MM.ui.flash(MM.tr('Stored as {path}', { path: (MM.project.backend ? MM.project.backend.name + '/' : '') + p }));
  };

  /** Files contained in a clipboard / drag-and-drop DataTransfer (non-image). */
  F.filesFrom = function (dt) {
    if (!dt) return [];
    const out = [...(dt.files || [])].filter(F.isDataFile);
    if (out.length) return out;
    return [...(dt.items || [])]
      .filter((i) => i.kind === 'file')
      .map((i) => i.getAsFile())
      .filter((f) => F.isDataFile(f));
  };
})(window.MM);
