'use strict';
/*
 * Images: picking files, downscaling very large pictures, and creating image
 * notes. Image data lives in doc.assets (data URLs) so a saved map is one
 * self-contained file; notes only store the asset id.
 */
(function (MM) {
  const S = MM.state;
  const IMG = (MM.images = {});
  const MAX_SIDE = 2000;   // larger pictures are scaled down when inserted
  const DEFAULT_W = 320;   // initial width of a new image note

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

  /** Read an image file -> { url, w, h }, downscaled if huge. */
  IMG.prepare = async function (file) {
    const url = await readAsDataURL(file);
    const img = await loadImage(url);
    let w = img.naturalWidth || 300, h = img.naturalHeight || 200;
    const keep = file.type === 'image/svg+xml' || file.type === 'image/gif' || Math.max(w, h) <= MAX_SIDE;
    if (keep) return { url, w, h };
    const s = MAX_SIDE / Math.max(w, h);
    w = Math.round(w * s);
    h = Math.round(h * s);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const type = file.type === 'image/png' || file.type === 'image/webp' ? 'image/png' : 'image/jpeg';
    return { url: canvas.toDataURL(type, 0.9), w, h };
  };

  /** Store image data as an asset, returns its id. */
  IMG.addAsset = function (url) {
    const id = MM.uid('a');
    S.doc.assets[id] = url;
    return id;
  };

  /**
   * Insert image files as notes centered around world point `at`.
   * opts.overlay: insert as overlay instead of a note.
   */
  IMG.insertFiles = async function (files, at, opts) {
    const list = [...files].filter((f) => f && f.type && f.type.startsWith('image/'));
    if (!list.length) return;
    const ids = [];
    let off = 0;
    for (const file of list) {
      try {
        const { url, w, h } = await IMG.prepare(file);
        const n = MM.createNode('image', at.x + off, at.y + off);
        n.imageId = IMG.addAsset(url);
        n.overlay = !!(opts && opts.overlay);
        n.w = Math.min(DEFAULT_W, w);
        n.h = Math.max(20, Math.round(n.w * (h / w)));
        n.x = Math.round(at.x + off - n.w / 2);
        n.y = Math.round(at.y + off - n.h / 2);
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
  };

  /** Replace the picture of an existing image note. */
  IMG.replace = async function (node, file) {
    const { url, w, h } = await IMG.prepare(file);
    node.imageId = IMG.addAsset(url);
    node.h = Math.max(20, Math.round(node.w * (h / w))); // keep width, adopt new aspect ratio
    MM.commit();
  };

  /** Open a file picker for images. Resolves with the chosen files (never on cancel). */
  IMG.pick = function (multiple) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = !!multiple;
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
