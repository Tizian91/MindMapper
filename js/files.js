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
    await F.restoreTrashed(); // deleted with its note, the note came back (Ctrl+Z)
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
    showBlob(blob, file.name);
  };

  /** Show a file in a new tab (types the browser can show) or download it. */
  function showBlob(blob, name) {
    const file = { name };
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
  }

  // ---- Deleting assets -------------------------------------------------------
  // Deleting a note never deletes its file on its own. Audio notes ask (F.askDelete);
  // "Clean up Assets…" (F.showOrphans) lists files no note of the project uses any more.
  // A deleted file stays in memory for this session: when its note comes back (Ctrl+Z),
  // the file is written back (F.restoreTrashed).

  const trash = new Map(); // path -> Blob

  /** Delete a file of Assets/ (kept in memory for Ctrl+Z). */
  F.removeAsset = async function (path) {
    const B = MM.project.backend;
    let blob = null;
    try { blob = await B.readBlob(path); } catch (e) { /* gone already */ }
    if (blob) trash.set(path, blob);
    await B.remove(path);
  };

  /** Notes of the open map point to deleted files again (undo / redo): write those back. */
  F.restoreTrashed = async function () {
    if (!trash.size || !MM.project.backend) return;
    const want = new Set();
    for (const n of Object.values(S.doc.nodes)) if (n.file && trash.has(n.file.path)) want.add(n.file.path);
    for (const path of want) {
      const blob = trash.get(path);
      trash.delete(path);
      try {
        await MM.project.writeBlob(path, blob);
      } catch (err) {
        trash.set(path, blob);
        MM.ui.flash(MM.tr('Could not bring back {path}', { path }));
      }
    }
    if (want.size) MM.project.scan();
  };

  /** The paths of all entries (maps and their conflict copies) below `entries`. */
  function mapFiles(entries, out = []) {
    for (const e of entries || []) {
      if (e.kind === 'file') {
        out.push({ path: e.path });
        for (const c of e.copies || []) out.push({ path: c.path, raw: true });
      } else mapFiles(e.children, out);
    }
    return out;
  }

  /**
   * Everything of the project that can point to a file of Assets/: the open map (from
   * memory), every map (with changes not written yet), conflict copies and diaries.
   * Resolves with { uses(path, skipOpen), unread: [paths that could not be read] }.
   * skipOpen: leave the open map out (it was searched on its own).
   */
  F.references = async function (onStep) {
    const P = MM.project;
    const texts = [], unread = [];
    const files = mapFiles(P.entries).filter((f) => f.path !== S.file.path);
    for (const d of P.diaries || []) {
      files.push({ path: d.path, raw: true });
      for (const c of d.copies || []) files.push({ path: c.path, raw: true });
    }
    let i = 0;
    for (const f of files) {
      if (onStep) onStep(++i, files.length);
      try {
        if (f.raw) {
          const r = await P.backend.read(f.path);
          if (r) texts.push(r.text.toLowerCase());
        } else {
          const doc = await P.readMap(f.path); // with changes not written yet (P.later)
          if (doc) texts.push(JSON.stringify(doc.nodes).toLowerCase());
          else unread.push(f.path);
        }
      } catch (err) {
        unread.push(f.path);
      }
    }
    const key = (path) => JSON.stringify(String(path).toLowerCase()).slice(1, -1);
    const open = () => JSON.stringify(S.doc.nodes).toLowerCase(); // the open map, also one outside the folder
    return {
      uses: (path, skipOpen) => (!skipOpen && open().includes(key(path))) || texts.some((t) => t.includes(key(path))),
      unread,
    };
  };

  /**
   * Del / Cut on notes: audio notes ask whether their recordings go as well.
   * Resolves with 'cancel', 'note' (only the notes) or 'both'; 'note' when nothing to ask.
   */
  const audioOf = (nodes) => nodes.filter((n) => n && n.type === 'file' && MM.audio && MM.audio.isAudio(n.file));

  /** Would deleting `nodes` ask about recordings? (audio notes, a project folder) */
  F.asksOnDelete = (nodes) => !!(MM.project && MM.project.backend && audioOf(nodes).length);

  F.askDelete = function (nodes) {
    const audio = audioOf(nodes);
    if (!audio.length || !MM.project.backend) return Promise.resolve('note');
    const esc = MM.render.esc, tr = MM.tr;
    return new Promise((resolve) => {
      let answer = 'cancel';
      const d = document.createElement('dialog');
      const what = audio.length === 1 ? tr('the recording "{name}"', { name: audio[0].file.name }) : tr('{n} recordings', { n: audio.length });
      d.innerHTML = `
        <form method="dialog" class="dlg">
          <h3>${esc(tr(audio.length === 1 ? 'Delete audio note' : 'Delete audio notes'))}</h3>
          <p>${esc(tr('Delete {what} from Assets/ as well?', { what }))}</p>
          <p class="hint">${esc(tr('Ctrl+Z brings both back while MindMapper stays open. A recording that another note still uses is kept.'))}</p>
          <div class="dlg-buttons">
            <button type="button" data-del="cancel">${esc(tr('Cancel'))}</button>
            <span style="flex:1"></span>
            <button type="button" data-del="note">${esc(tr('Only the note'))}</button>
            <button type="submit" class="primary danger" data-del="both">${esc(tr('Note and recording'))}</button>
          </div>
        </form>`;
      document.body.appendChild(d);
      d.addEventListener('click', (e) => {
        const b = e.target.closest('[data-del]');
        if (!b) return;
        e.preventDefault();
        answer = b.dataset.del;
        d.close();
      });
      d.addEventListener('keydown', (e) => e.stopPropagation());
      d.addEventListener('close', () => {
        d.remove();
        resolve(answer);
      });
      d.showModal();
      d.querySelector('[data-del="note"]').focus(); // Enter: the safe choice
    });
  };

  /**
   * The notes `gone` were deleted with "Note and recording": delete their files, unless
   * another note (this map or another one) still uses them.
   */
  F.deleteFilesOf = async function (gone) {
    const paths = [...new Set(gone.map((n) => n.file && n.file.path).filter(Boolean))];
    if (!paths.length || !(await MM.project.ensureWriteAccess())) return;
    const stillHere = (p) => Object.values(S.doc.nodes).some((n) => n.file && n.file.path === p);
    let refs = null;
    let removed = 0, kept = 0;
    for (const p of paths) {
      if (stillHere(p)) { kept++; continue; }
      if (!refs) refs = await F.references();
      if (refs.uses(p, true) || refs.unread.length) { kept++; continue; } // unsure: rather keep it
      try {
        await F.removeAsset(p);
        removed++;
      } catch (err) {
        kept++;
        console.warn('MindMapper: could not delete ' + p, err);
      }
    }
    MM.project.scan();
    if (kept) MM.ui.flash(MM.tr('{n} recording(s) deleted, {k} kept - still used by another note (or a map could not be read)', { n: removed, k: kept }));
    else MM.ui.flash(MM.tr('{n} recording(s) deleted', { n: removed }));
  };

  // ---- Clean up Assets/ (files no note uses) ---------------------------------------

  let orphanDialog = null;

  /** Dialog: the files of Assets/ that no note of the project uses; delete the chosen ones. */
  F.showOrphans = async function () {
    const P = MM.project, esc = MM.render.esc, tr = MM.tr;
    if (P.status !== 'ready' && !(await P.ensureWriteAccess())) {
      alert(tr('Open a folder in the "Project" sidebar first.'));
      return;
    }
    if (orphanDialog) orphanDialog.remove();
    const d = (orphanDialog = document.createElement('dialog'));
    d.className = 'assets-dialog';
    const box = (body, buttons) => {
      d.innerHTML = `<div class="dlg"><h3>${esc(tr('Clean up Assets/'))}</h3>${body}
        <div class="dlg-buttons">${buttons || ''}<span style="flex:1"></span><button type="button" data-as="close">${esc(tr('Close'))}</button></div></div>`;
    };
    box(`<p class="hint" data-as-step>${esc(tr('Searching all maps…'))}</p>`);
    d.addEventListener('keydown', (e) => e.stopPropagation());
    d.addEventListener('close', () => { d.remove(); if (orphanDialog === d) orphanDialog = null; });
    document.body.appendChild(d);
    d.showModal();

    let list = [], unread = [];
    const search = async () => {
      await P.scan(); // the newest list of maps
      await F.restoreTrashed();
      const names = (await P.backend.list(ASSET_FOLDER)).filter((e) => e.kind === 'file' && !e.name.startsWith('.')).map((e) => e.name);
      const refs = await F.references((i, n) => {
        const s = d.querySelector('[data-as-step]');
        if (s) s.textContent = tr('Searching all maps… ({i} of {n})', { i, n });
      });
      unread = refs.unread;
      list = [];
      for (const name of names) {
        const path = ASSET_FOLDER + '/' + name;
        if (refs.uses(path)) continue;
        let st = null;
        try { st = await P.backend.stat(path); } catch (e) { /* no details */ }
        list.push({ path, name, size: st && st.size, modified: st && st.modified });
      }
      list.sort((a, b) => (b.modified || 0) - (a.modified || 0));
      return names.length;
    };

    const show = (total) => {
      if (!d.open) return;
      const sum = list.reduce((s, f) => s + (f.size || 0), 0);
      const warn = unread.length
        ? `<p class="hint warn">${esc(tr('{n} map(s) could not be read - a file listed here may still be used there. Nothing is ticked.', { n: unread.length }))}<br>${unread.map(esc).join('<br>')}</p>` : '';
      const date = (t) => (t ? new Date(t).toLocaleDateString(MM.getLang() === 'de' ? 'de-DE' : undefined) : '');
      const rows = list.map((f, i) => `<label class="as-row"><input type="checkbox" data-as-pick="${i}"${unread.length ? '' : ' checked'}>
          ${MM.files.icon(f.name)}<span class="as-name" title="${esc(f.path)}">${esc(f.name)}</span>
          <span class="as-meta">${esc([f.size ? F.humanSize(f.size) : '', date(f.modified)].filter(Boolean).join(' · '))}</span>
          <button type="button" data-as-open="${i}" title="${esc(tr('Open the file'))}">↗</button></label>`).join('');
      box(`<p class="hint">${esc(list.length
        ? tr('{n} of {t} file(s) in Assets/ are used by no note of any map, conflict copy or diary ({size}).', { n: list.length, t: total, size: F.humanSize(sum) })
        : tr('All {t} file(s) in Assets/ are used by notes.', { t: total }))}</p>${warn}
        ${rows ? `<div class="as-list">${rows}</div>` : ''}`,
      list.length ? `<button type="button" class="danger" data-as="delete">${esc(tr('Delete the chosen files…'))}</button>` : '');
    };

    d.addEventListener('click', async (e) => {
      const t = e.target;
      if (t === d || t.closest('[data-as="close"]')) return d.close();
      const open = t.closest('[data-as-open]');
      if (open) {
        e.preventDefault();
        const f = list[+open.dataset.asOpen];
        let blob = null;
        try { blob = await P.backend.readBlob(f.path); } catch (err) { /* below */ }
        if (blob) showBlob(blob, f.name);
        else alert(tr('File not found:\n{path}', { path: f.path }));
        return;
      }
      if (t.closest('[data-as="delete"]')) {
        const chosen = [...d.querySelectorAll('[data-as-pick]:checked')].map((c) => list[+c.dataset.asPick]);
        if (!chosen.length) return;
        if (!confirm(tr('Delete {n} file(s) from Assets/?', { n: chosen.length }))) return;
        let failed = 0;
        for (const f of chosen) {
          try { await F.removeAsset(f.path); } catch (err) { failed++; }
        }
        MM.ui.flash(failed ? tr('{n} file(s) could not be deleted', { n: failed }) : tr('{n} file(s) deleted', { n: chosen.length }));
        box(`<p class="hint" data-as-step>${esc(tr('Searching all maps…'))}</p>`);
        show(await search());
      }
    });

    try {
      show(await search());
    } catch (err) {
      box(`<p class="hint warn">${esc(tr('Could not search: {err}', { err: describeError(err) }))}</p>`);
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
