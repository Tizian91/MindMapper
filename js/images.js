'use strict';
/*
 * Images: picking files, downscaling very large pictures, cropping, and creating
 * image notes. Image data lives in doc.assets (data URLs) so a saved map is one
 * self-contained file; notes only store the asset id.
 *
 * Cropping (IMG.askCrop): a dialog with a frame over the picture. Used when
 * pictures are picked from disk / the camera (before they are inserted) and from
 * the context menu of an image note. A crop makes a new, smaller picture - the
 * original is not kept (Ctrl+Z brings it back).
 */
(function (MM) {
  const S = MM.state;
  const IMG = (MM.images = {});
  const MAX_SIDE = 2000;   // larger pictures are scaled down when inserted
  const DEFAULT_W = 320;   // initial width of a new image note
  const tr = (s, v) => MM.tr(s, v);

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Not a readable image'));
      img.src = url;
    });
  }

  /**
   * Read an image file (or Blob) -> { url, w, h }, downscaled if huge.
   * opts.max: longest side (default 2000), opts.quality: of a JPEG (default 0.9),
   * opts.rect: { x, y, w, h } in pixels of the picture - only this part is kept.
   */
  IMG.prepare = async function (file, opts) {
    const o = opts || {};
    const max = o.max || MAX_SIDE;
    const url = await readAsDataURL(file);
    const img = await loadImage(url);
    const W = img.naturalWidth || 300, H = img.naturalHeight || 200;
    const type = file.type || '';
    const keep = !o.rect && (type === 'image/svg+xml' || type === 'image/gif' || Math.max(W, H) <= max);
    if (keep) return { url, w: W, h: H };
    const r = o.rect || { x: 0, y: 0, w: W, h: H };
    const s = Math.min(1, max / Math.max(r.w, r.h));
    const w = Math.max(1, Math.round(r.w * s)), h = Math.max(1, Math.round(r.h * s));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, r.x, r.y, r.w, r.h, 0, 0, w, h);
    // transparency stays (PNG); photos become JPEG
    const png = /^image\/(png|webp|gif|svg\+xml)$/.test(type);
    return { url: canvas.toDataURL(png ? 'image/png' : 'image/jpeg', o.quality || 0.9), w, h };
  };

  /** Store image data as an asset, returns its id. */
  IMG.addAsset = function (url) {
    const id = MM.uid('a');
    S.doc.assets[id] = url;
    return id;
  };

  /** Give an image note a new picture: a file of the block, or embedded in the map. */
  async function setPicture(node, url, block) {
    const stored = block ? await MM.notebook.storeImage(url) : '';
    if (stored) {
      node.imageFile = stored;
      delete node.imageId;
    } else {
      node.imageId = IMG.addAsset(url);
      delete node.imageFile;
    }
  }

  /**
   * Insert image files as notes centered around world point `at`.
   * opts.overlay: insert as overlay instead of a note.
   * opts.width: width of the new notes (default: 320, smaller pictures keep their size).
   * opts.crop: offer the crop dialog for every picture first.
   * In a block (notebook.js) the pictures become files of the block, smaller than elsewhere.
   * Resolves with the ids of the new notes.
   */
  IMG.insertFiles = async function (files, at, opts) {
    const list = [...files].filter((f) => f && f.type && f.type.startsWith('image/'));
    if (!list.length) return [];
    const block = MM.notebook && MM.notebook.storesFiles();
    const ids = [];
    let off = 0;
    let ask = !!(opts && opts.crop);
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      try {
        let rect = null;
        if (ask) {
          const res = await IMG.askCrop(file, { index: i, count: list.length });
          if (!res) continue; // skipped / cancelled: this picture is not inserted
          rect = res.rect;
          if (res.rest) ask = false;
        }
        const { url, w, h } = await IMG.prepare(file, Object.assign({}, block ? MM.notebook.IMAGE_SIZE : null, { rect }));
        const n = MM.createNode('image', at.x + off, at.y + off);
        await setPicture(n, url, block);
        n.overlay = !!(opts && opts.overlay);
        n.w = Math.min((opts && opts.width) || DEFAULT_W, w);
        n.h = Math.max(20, Math.round(n.w * (h / w)));
        n.x = Math.round(at.x + off - n.w / 2);
        n.y = Math.round(at.y + off - (opts && opts.top ? 0 : n.h / 2)); // opts.top: `at` is the top edge
        S.doc.nodes[n.id] = n;
        ids.push(n.id);
        off += 30;
      } catch (err) {
        alert(MM.tr('Could not insert {name}: {err}', { name: file.name || MM.tr('image'), err: err.message }));
      }
    }
    if (ids.length) {
      MM.select(ids);
      MM.commit();
    }
    return ids;
  };

  /** Replace the picture of an existing image note. */
  IMG.replace = async function (node, file) {
    const block = MM.notebook && MM.notebook.storesFiles();
    const { url, w, h } = await IMG.prepare(file, block ? MM.notebook.IMAGE_SIZE : null);
    await setPicture(node, url, block);
    node.h = Math.max(20, Math.round(node.w * (h / w))); // keep width, adopt new aspect ratio
    MM.commit();
  };

  /**
   * Crop the picture of an image note. The part that stays keeps its size and place on
   * the map - the note shrinks around it.
   */
  IMG.cropNode = async function (node) {
    if (!node || node.type !== 'image') return;
    let blob = null;
    try { blob = MM.notebook ? await MM.notebook.imageBlob(node) : null; } catch (e) { /* below */ }
    if (!blob) {
      MM.ui.flash(tr('The picture could not be loaded'));
      return;
    }
    const res = await IMG.askCrop(blob, { edit: true });
    if (!res || !res.rect || !S.doc.nodes[node.id]) return;
    const block = MM.notebook && MM.notebook.storesFiles();
    let pic;
    try {
      pic = await IMG.prepare(blob, Object.assign({}, block ? MM.notebook.IMAGE_SIZE : null, { rect: res.rect }));
    } catch (err) {
      MM.ui.flash(tr('The picture could not be loaded'));
      return;
    }
    await setPicture(node, pic.url, block);
    Object.assign(node, IMG.croppedFrame(node, res.rect, res.W, res.H));
    MM.commit();
    MM.ui.flash(tr('Image cropped'));
  };

  /**
   * New { x, y, w, h } of an image note after its picture (W x H pixels) was cut to `rect`:
   * same scale as before, the kept part stays where it was (also when the note is rotated).
   */
  IMG.croppedFrame = function (n, rect, W, H) {
    const s = n.w / (W || 1); // world units per pixel of the picture
    const w = Math.max(20, Math.round(rect.w * s));
    const h = Math.max(20, Math.round(rect.h * s));
    // centre of the kept part, relative to the centre of the picture, turned like the note
    const ox = (rect.x + rect.w / 2 - W / 2) * s;
    const oy = (rect.y + rect.h / 2 - H / 2) * s;
    const a = ((n.rotate || 0) * Math.PI) / 180;
    const cx = n.x + n.w / 2 + ox * Math.cos(a) - oy * Math.sin(a);
    const cy = n.y + n.h / 2 + ox * Math.sin(a) + oy * Math.cos(a);
    return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h };
  };

  // ---- Crop dialog -------------------------------------------------------------

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /** Box { l, t, r, b } with aspect ratio w/h = `ratio`, anchored at the side opposite `dir`. */
  function withRatio(box, dir, W, H, ratio) {
    let w = box.r - box.l, h = box.b - box.t;
    if (!w && !h) return box;
    const horiz = /[ew]/.test(dir), vert = /[ns]/.test(dir);
    if (horiz && !vert) h = w / ratio;
    else if (vert && !horiz) w = h * ratio;
    else if (w / h > ratio) h = w / ratio;
    else w = h * ratio;
    const ax = dir.includes('w') ? box.r : dir.includes('e') ? box.l : (box.l + box.r) / 2;
    const ay = dir.includes('n') ? box.b : dir.includes('s') ? box.t : (box.t + box.b) / 2;
    const maxW = dir.includes('w') ? ax : dir.includes('e') ? W - ax : 2 * Math.min(ax, W - ax);
    const maxH = dir.includes('n') ? ay : dir.includes('s') ? H - ay : 2 * Math.min(ay, H - ay);
    const k = Math.min(1, maxW / w, maxH / h);
    w *= k;
    h *= k;
    const l = dir.includes('w') ? ax - w : dir.includes('e') ? ax : ax - w / 2;
    const t = dir.includes('n') ? ay - h : dir.includes('s') ? ay : ay - h / 2;
    return { l, t, r: l + w, b: t + h };
  }

  /**
   * The crop frame after a drag by (dx, dy) picture pixels. r0: the frame when the drag
   * began ({ x, y, w, h }; for mode 'new' the point where it began). mode: 'move', 'new' or
   * a handle 'n', 'ne', 'e', ... W x H: the picture. ratio: w/h or 0 (free). min: smallest side.
   */
  IMG.cropBox = function (r0, mode, dx, dy, W, H, ratio, min) {
    if (mode === 'move') {
      return { x: clamp(r0.x + dx, 0, W - r0.w), y: clamp(r0.y + dy, 0, H - r0.h), w: r0.w, h: r0.h };
    }
    let l = r0.x, t = r0.y, r = r0.x + r0.w, b = r0.y + r0.h, dir = mode;
    if (mode === 'new') {
      const px = clamp(r0.x + dx, 0, W), py = clamp(r0.y + dy, 0, H);
      dir = (py < r0.y ? 'n' : 's') + (px < r0.x ? 'w' : 'e');
      l = Math.min(r0.x, px); r = Math.max(r0.x, px);
      t = Math.min(r0.y, py); b = Math.max(r0.y, py);
    } else {
      if (dir.includes('w')) l = clamp(l + dx, 0, r - min);
      if (dir.includes('e')) r = clamp(r + dx, l + min, W);
      if (dir.includes('n')) t = clamp(t + dy, 0, b - min);
      if (dir.includes('s')) b = clamp(b + dy, t + min, H);
    }
    if (ratio) ({ l, t, r, b } = withRatio({ l, t, r, b }, dir, W, H, ratio));
    return { x: l, y: t, w: r - l, h: b - t };
  };

  /** Largest frame with aspect `ratio` around the centre of `cur`, inside the picture. */
  IMG.ratioFrame = function (cur, W, H, ratio) {
    if (!ratio) return { x: 0, y: 0, w: W, h: H };
    let w = W, h = W / ratio;
    if (h > H) { h = H; w = H * ratio; }
    const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
    return { x: clamp(cx - w / 2, 0, W - w), y: clamp(cy - h / 2, 0, H - h), w, h };
  };

  const RATIOS = [['free', 0], ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9]];
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /**
   * The crop dialog for an image file / Blob. opts.edit: cropping a note (button "Crop"),
   * else inserting (button "Insert"); opts.index / opts.count: picture i of n being inserted.
   * Resolves with null (cancelled / skipped) or { rect, rest, W, H } - rect is null when
   * the whole picture stays, rest: insert the remaining pictures without asking.
   */
  IMG.askCrop = function (file, opts) {
    const o = opts || {};
    const many = (o.count || 1) > 1;
    const lastOne = !many || o.index === o.count - 1;
    return new Promise((resolve) => {
      const src = URL.createObjectURL(file);
      let result = null;
      let W = 0, H = 0, k = 1, ratio = 0, r = null, drag = null;
      const d = document.createElement('dialog');
      d.className = 'crop-dialog';
      const title = many ? tr('Crop image ({i} of {n})', { i: o.index + 1, n: o.count }) : tr('Crop image');
      d.innerHTML = `
        <form method="dialog" class="dlg crop-dlg">
          <h3>${esc(title)}</h3>
          <div class="crop-wrap"><div class="crop-stage">
            <img alt="" draggable="false">
            <div class="crop-frame" hidden>${HANDLES.map((h) => `<i class="crop-h" data-h="${h}"></i>`).join('')}</div>
          </div></div>
          <div class="crop-ratios">
            ${RATIOS.map(([l, v], i) => `<button type="button" data-ratio="${v}"${i ? '' : ' class="active"'}>${esc(l === 'free' ? tr('Free') : l)}</button>`).join('')}
            <span style="flex:1"></span>
            <button type="button" data-crop="all">${esc(tr('Whole image'))}</button>
          </div>
          <p class="hint">${esc(tr('Drag the corners or edges of the frame, or the frame itself. Dragging on the picture draws a new frame.'))}</p>
          <div class="dlg-buttons">
            <button type="button" data-crop="cancel">${esc(tr(o.edit || !many ? 'Cancel' : 'Skip'))}</button>
            <span style="flex:1"></span>
            ${!o.edit && !lastOne ? `<button type="button" data-crop="rest">${esc(tr('Insert the rest uncropped'))}</button>` : ''}
            <button type="submit" class="primary">${esc(tr(o.edit ? 'Crop' : 'Insert'))}</button>
          </div>
        </form>`;
      document.body.appendChild(d);
      const form = d.querySelector('form');
      const stage = d.querySelector('.crop-stage');
      const img = d.querySelector('img');
      const frame = d.querySelector('.crop-frame');

      const draw = () => {
        if (!r) return;
        k = img.clientWidth / W || 1;
        frame.hidden = false;
        frame.style.left = img.offsetLeft + r.x * k + 'px';
        frame.style.top = img.offsetTop + r.y * k + 'px';
        frame.style.width = r.w * k + 'px';
        frame.style.height = r.h * k + 'px';
      };
      const ro = window.ResizeObserver ? new ResizeObserver(draw) : null;

      img.onload = () => {
        W = img.naturalWidth || 300;
        H = img.naturalHeight || 200;
        r = { x: 0, y: 0, w: W, h: H };
        if (ro) ro.observe(img);
        draw();
      };
      img.onerror = () => {
        MM.ui.flash(tr('The picture could not be loaded'));
        d.close();
      };
      img.src = src;

      // ---- dragging (mouse, pen and finger alike) ----
      const toPic = (e) => {
        const b = img.getBoundingClientRect();
        return { x: (e.clientX - b.left) / k, y: (e.clientY - b.top) / k };
      };
      stage.addEventListener('pointerdown', (e) => {
        if (!r || e.button > 0) return;
        e.preventDefault();
        const p = toPic(e);
        const h = e.target.closest('.crop-h');
        const mode = h ? h.dataset.h : e.target === frame ? 'move' : 'new';
        const start = mode === 'new' ? { x: clamp(p.x, 0, W), y: clamp(p.y, 0, H), w: 0, h: 0 } : Object.assign({}, r);
        drag = { mode, start, before: Object.assign({}, r), p, id: e.pointerId };
        stage.setPointerCapture(e.pointerId);
      });
      stage.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const p = toPic(e);
        const min = Math.max(4, 24 / k);
        r = IMG.cropBox(drag.start, drag.mode, p.x - drag.p.x, p.y - drag.p.y, W, H, ratio, min);
        draw();
      });
      const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        // a click on the picture (no frame drawn): keep the frame there was
        if (drag.mode === 'new' && (r.w < Math.max(4, 12 / k) || r.h < Math.max(4, 12 / k))) r = drag.before;
        drag = null;
        draw();
      };
      stage.addEventListener('pointerup', end);
      stage.addEventListener('pointercancel', end);

      // ---- buttons ----
      for (const b of d.querySelectorAll('[data-ratio]')) {
        b.addEventListener('click', () => {
          ratio = +b.dataset.ratio;
          for (const x of d.querySelectorAll('[data-ratio]')) x.classList.toggle('active', x === b);
          if (r) r = ratio ? IMG.ratioFrame(r, W, H, ratio) : r;
          draw();
        });
      }
      d.querySelector('[data-crop="all"]').addEventListener('click', () => {
        ratio = 0;
        for (const x of d.querySelectorAll('[data-ratio]')) x.classList.toggle('active', x.dataset.ratio === '0');
        if (W) r = { x: 0, y: 0, w: W, h: H };
        draw();
      });
      d.querySelector('[data-crop="cancel"]').addEventListener('click', () => d.close());
      const finish = (rest) => {
        if (!r) return;
        const x = Math.round(r.x), y = Math.round(r.y);
        const rect = { x, y, w: Math.min(W - x, Math.round(r.w)), h: Math.min(H - y, Math.round(r.h)) };
        const whole = rect.x <= 0 && rect.y <= 0 && rect.w >= W - 1 && rect.h >= H - 1;
        result = { rect: whole ? null : rect, rest: !!rest, W, H };
        d.close();
      };
      const rest = d.querySelector('[data-crop="rest"]');
      if (rest) rest.addEventListener('click', () => finish(true));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        finish(false);
      });
      d.addEventListener('keydown', (e) => {
        e.stopPropagation(); // not the shortcuts of the map behind
        if (e.key === 'Enter' && !e.target.closest('button')) {
          e.preventDefault();
          finish(false);
        }
      });
      d.addEventListener('close', () => {
        if (ro) ro.disconnect();
        URL.revokeObjectURL(src);
        d.remove();
        resolve(result);
      });
      d.showModal();
      form.querySelector('.primary').focus();
    });
  };

  /** Open a file picker for images. Resolves with the chosen files (never on cancel). */
  IMG.pick = function (multiple, camera) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = !!multiple;
      if (camera) input.capture = 'environment'; // phones / tablets: straight to the (back) camera
      input.onchange = () => resolve([...input.files]);
      input.click();
    });
  };

  /** Image files contained in a clipboard / drag-and-drop DataTransfer. */
  IMG.filesFrom = function (dt) {
    if (!dt) return [];
    const files = [...(dt.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) return files;
    return [...(dt.items || [])]
      .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter(Boolean);
  };
})(window.MM);
