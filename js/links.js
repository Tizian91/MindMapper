'use strict';
/*
 * Links of notes: a web address, another map of the project folder
 * (path relative to the folder, e.g. "Weeks/2026-W43.mindmap.json"), or a
 * folder / file on the PC ("C:\Projects\Billing", "\\server\share\Team").
 *
 * A browser page may not start programs, so a local folder cannot be opened
 * in Windows Explorer directly. It opens as a file list in a new tab instead
 * (works while MindMapper itself runs from file://), and its path is copied to
 * the clipboard for Explorer (Win+E, Ctrl+L, Ctrl+V).
 */
(function (MM) {
  const L = (MM.links = {});

  L.isUrl = (s) => /^(https?:|mailto:|file:|www\.)/i.test(String(s || '').trim());

  /** Windows path: drive letter ("C:\…", "C:/…") or network share ("\\server\share"). */
  L.isPath = (s) => /^([a-z]:[\\/]|\\\\[^\\])/i.test(String(s || '').trim());

  /** Short text for a link: host of a URL, folder name of a path, or the map name. */
  L.label = function (link) {
    const s = String(link || '').trim();
    if (!s) return '';
    if (L.isPath(s)) {
      const parts = s.split(/[\\/]+/).filter(Boolean);
      const last = parts.length ? parts[parts.length - 1] : s;
      return (/\.[a-z0-9]{1,6}$/i.test(last) ? '📄 ' : '📁 ') + last;
    }
    if (L.isUrl(s)) {
      try {
        return new URL(s.startsWith('www.') ? 'https://' + s : s).host || s;
      } catch (e) {
        return s;
      }
    }
    const { path, page } = L.split(s);
    const name = path.split('/').pop().replace(/\.mindmap\.json$/i, '').replace(/\.json$/i, '');
    // a block (notebook.js), maybe one of its pages: "📓 FIB-Training · p. 3"
    if (!path.startsWith(MM.notebook.FOLDER + '/')) return name;
    return '📓 ' + name + (page ? ' · ' + MM.tr('p. {n}', { n: page }) : '');
  };

  /**
   * A link to a map, maybe to a page of a block: "Blocks/FIB.mindmap.json#3" ->
   * { path: "Blocks/FIB.mindmap.json", page: 3 } (page 0: the map itself).
   */
  L.split = function (link) {
    const s = String(link || '').trim();
    const m = /^(.+\.json)#(\d{1,4})$/i.exec(s);
    return m ? { path: m[1], page: Number(m[2]) } : { path: s, page: 0 };
  };

  /** A map link as Markdown links write it ("Blocks/FIB.mindmap.json#3"): no address, no ".." */
  L.isMapLink = (s) => /^[^:\\/][^:\\]*\.json(#\d{1,4})?$/i.test(String(s || '')) && !/(^|\/)\.\.(\/|$)/.test(s);

  /** Turn user input into a stored link: URLs and PC paths stay, map names get a file extension. */
  L.normalize = function (input) {
    // Explorer's "Copy as path" puts the path in quotes
    let s = String(input || '').trim().replace(/^"(.*)"$/, '$1').trim();
    // a Markdown link ("Copy link to this page" of a block): its target
    const md = /^\[[^\]]*\]\(([^)\s]+)\)$/.exec(s);
    if (md) s = md[1];
    if (!s || L.isUrl(s)) return s;
    if (L.isPath(s)) return s.replace(/[\\/]+$/, '') || s;
    if (/\.json#\d{1,4}$/i.test(s)) return s.replace(/^\/+/, ''); // a page of a block
    return /\.json$/i.test(s) ? s.replace(/^\/+/, '') : s.replace(/^\/+/, '') + '.mindmap.json';
  };

  /** file:// address of a Windows path (folders end with a slash, so the browser lists them). */
  L.fileUrl = function (path) {
    const s = String(path || '').trim();
    const unc = s.startsWith('\\\\');
    const parts = s.replace(/^\\\\/, '').split(/[\\/]+/).filter(Boolean);
    const enc = parts.map((p, i) => (!unc && i === 0 ? p : encodeURIComponent(p))).join('/');
    const isFile = /\.[a-z0-9]{1,6}$/i.test(parts[parts.length - 1] || '');
    return (unc ? 'file://' : 'file:///') + enc + (isFile ? '' : '/');
  };

  /** Copy text to the clipboard (resolves to true on success). */
  L.copy = copy; // also for "Copy link to this page" (notebook.js)
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // older API as fallback (needs a selected text field)
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { /* not allowed */ }
      ta.remove();
      return ok;
    }
  }

  /** Open a folder / file on the PC: file list in a new tab + path in the clipboard. */
  L.openPath = async function (path) {
    const copied = await copy(path);
    const win = window.open(L.fileUrl(path), '_blank');
    if (win) win.opener = null;
    MM.ui.flash((win ? 'Opened in a new tab' : 'The browser blocked the folder view') +
      (copied ? ' · path copied – for Explorer: Win+E, Ctrl+L, Ctrl+V' : ' · ' + path));
  };

  L.open = function (link) {
    const s = String(link || '').trim();
    if (!s) return;
    if (L.isPath(s)) L.openPath(s);
    else if (L.isUrl(s)) window.open(s.startsWith('www.') ? 'https://' + s : s, '_blank', 'noopener');
    else {
      const { path, page } = L.split(s);
      MM.project.openLinked(path, page);
    }
  };

  // Map links in Markdown (diary entries, Markdown notes): markdown.js renders them as
  // <a data-maplink="…">. A click opens the map (a block on its page); the diary reader
  // closes for it.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-maplink]');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    const reader = document.querySelector('#diary-dialog[open]');
    if (reader) reader.close();
    L.open(a.dataset.maplink);
  }, true);

  L.icon = '<svg viewBox="0 0 16 16"><path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5"/></svg>';
})(window.MM);
