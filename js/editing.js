'use strict';
/*
 * In-place text editing of notes, list entries and connection labels.
 *
 *   all fields:     Enter = finish, Shift+Enter = new line, Escape = finish
 *   to-do items:    Enter = next item, Backspace on empty item = delete it
 *   outline blocks: Enter = new block (splits at the caret), Tab / Shift+Tab =
 *                   indent / outdent, Backspace at start = merge with block above,
 *                   Arrow up/down at start/end = previous/next block
 */
(function (MM) {
  const ED = (MM.edit = {});
  MM.editing = null; // { nodeId, field: 'text'|'item'|'block', itemId, el }

  // list fields: which array of the node, and how the DOM marks an entry
  const LISTS = {
    item: { key: 'items', attr: 'item', textSel: '.todo-text' },
    block: { key: 'blocks', attr: 'block', textSel: '.outline-text' },
  };

  // ---- Caret helpers -------------------------------------------------------

  /** Place the caret: 'end', 'all' (select everything) or a character offset. */
  function setCaret(el, caret) {
    const range = document.createRange();
    range.selectNodeContents(el);
    if (caret === 'end') range.collapse(false);
    else if (typeof caret === 'number') {
      let rest = caret, placed = false;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (rest <= t.length) {
          range.setStart(t, rest);
          range.collapse(true);
          placed = true;
          break;
        }
        rest -= t.length;
      }
      if (!placed) range.collapse(caret === 0);
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function caretOffset(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const r = sel.getRangeAt(0);
    const pre = r.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().length;
  }

  const readText = (el) => el.innerText.replace(/\n+$/, '');

  // ---- Start / finish ------------------------------------------------------

  /**
   * Start editing a field of a node.
   * field: 'text', 'item' or 'block' (the last two need itemId).
   * opts.caret: 'all' (default), 'end' or a character offset.
   */
  ED.start = function (nodeId, field, itemId, opts) {
    ED.finish();
    MM.refresh(); // make sure the DOM is current
    const div = MM.render.nodeEls.get(nodeId);
    if (!div) return;
    const L = LISTS[field];
    const target = L
      ? div.querySelector(`li[data-${L.attr}="${CSS.escape(itemId)}"] ${L.textSel}`)
      : div.querySelector('[data-field="text"]');
    if (!target) return;
    // a diary entry / Markdown note shows rendered Markdown - it is edited as the plain Markdown text
    const node = MM.node(nodeId);
    const markdown = field === 'text' && MM.isMarkdown(node);
    if (markdown) target.textContent = node.text;

    MM.editing = { nodeId, field, itemId, el: target };
    target.contentEditable = 'plaintext-only';
    if (target.contentEditable !== 'plaintext-only') target.contentEditable = 'true';
    target.classList.add('editing');
    div.classList.add('editing');
    target.focus({ preventScroll: true }); // the canvas must never scroll (interaction.js)
    // a long entry is continued at its end, not selected (typing would replace it)
    setCaret(target, (opts && opts.caret !== undefined) ? opts.caret : markdown ? 'end' : 'all');

    target.addEventListener('keydown', onKey);
    target.addEventListener('input', onInput);
    target.addEventListener('blur', onBlur);
    target.addEventListener('paste', onPaste);
    target.addEventListener('drop', onPaste);
    MM.render.overlay();
  };

  /** Store `text` into the edited field. Empty list entries are dropped if dropEmpty. */
  function writeText(ed, n, text, dropEmpty) {
    const L = LISTS[ed.field];
    if (!L) {
      n.text = text;
      return;
    }
    const list = n[L.key];
    const idx = list.findIndex((i) => i.id === ed.itemId);
    if (idx < 0) return;
    if (dropEmpty && text.trim() === '') {
      if (ed.field === 'block') MM.outline.remove(list, idx);
      else list.splice(idx, 1);
    } else {
      list[idx].text = text;
    }
  }

  /**
   * Stop editing, write the text back and record an undo step.
   * opts.noWrite: the caller already updated the model.
   */
  ED.finish = function (opts) {
    const ed = MM.editing;
    if (!ed) return;
    opts = opts || {};
    MM.editing = null;
    const target = ed.el;
    // read while it is still shown as edited (white-space: pre-wrap): afterwards the
    // browser folds line breaks into spaces - a diary entry lost its lines and tables
    const text = readText(target);
    target.removeEventListener('keydown', onKey);
    target.removeEventListener('input', onInput);
    target.removeEventListener('blur', onBlur);
    target.removeEventListener('paste', onPaste);
    target.removeEventListener('drop', onPaste);
    target.contentEditable = 'false';
    target.classList.remove('editing');

    const n = MM.node(ed.nodeId);
    if (n && !opts.noWrite) writeText(ed, n, text, true);

    const div = MM.render.nodeEls.get(ed.nodeId);
    if (div) {
      div.classList.remove('editing');
      div._contentKey = null; // force rebuild from model
    }
    window.getSelection().removeAllRanges();
    MM.commit();
  };

  /** Jump to another field of the same node (model already updated). */
  function jump(nodeId, field, itemId, caret) {
    ED.finish({ noWrite: true });
    ED.start(nodeId, field, itemId, { caret });
  }

  // ---- Events --------------------------------------------------------------

  function onInput() {
    const ed = MM.editing;
    if (!ed) return;
    const n = MM.node(ed.nodeId), div = MM.render.nodeEls.get(ed.nodeId);
    if (n && div && MM.render.autoGrow(div, n)) MM.render.edges();
  }

  function onBlur() {
    ED.finish();
  }

  /**
   * Images pasted or dropped into a diary entry: stored in the map (doc.assets)
   * and inserted at the caret as ![image](asset:<id>). Text is pasted as usual.
   */
  async function onPaste(e) {
    const ed = MM.editing;
    const n = ed && MM.node(ed.nodeId);
    if (!MM.isMarkdown(n) || ed.field !== 'text') return;
    const dt = e.clipboardData || e.dataTransfer;
    const files = MM.images.filesFrom(dt);
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    const sel = window.getSelection();
    // dropped: insert where the mouse is
    const at = e.type === 'drop' && document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (at && ed.el.contains(at.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(at);
    }
    const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    let md = '';
    for (const f of files) {
      try {
        const img = await MM.images.prepare(f);
        md += `\n![${(f.name || 'image').replace(/[[\]()]/g, '')}](asset:${MM.images.addAsset(img.url)})\n`;
      } catch (err) {
        MM.ui.flash(MM.tr('Could not read the image'));
      }
    }
    if (!md || MM.editing !== ed) return;
    ed.el.focus({ preventScroll: true });
    if (range) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand('insertText', false, md);
  }

  function onKey(e) {
    const ed = MM.editing;
    if (!ed) return;
    e.stopPropagation();
    const n = MM.node(ed.nodeId);
    if (!n) return;

    // Ctrl+. / Ctrl+Shift+E opens the emoji picker; the picker restores the caret afterwards
    if (MM.interaction.isEmojiKey(e)) {
      e.preventDefault();
      const div = MM.render.nodeEls.get(n.id);
      const r = div ? div.getBoundingClientRect() : null;
      MM.emoji.pick({ target: n, mode: 'text', anchorRect: r });
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      ED.finish();
      return;
    }
    if (ed.field === 'block') {
      if (blockKey(e, ed, n)) e.preventDefault();
      return;
    }
    // code, diary entries and Markdown notes: Enter = new line, Tab = indent, Ctrl+Enter = finish
    if (n.type === 'code' || (MM.isMarkdown(n) && ed.field === 'text')) {
      if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        ED.finish();
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = readText(ed.el);
      if (ed.field === 'item' && text.trim()) {
        writeText(ed, n, text, false);
        const idx = n.items.findIndex((i) => i.id === ed.itemId);
        const item = MM.createTodoItem('');
        n.items.splice(idx + 1, 0, item);
        jump(n.id, 'item', item.id, 'end');
      } else if (ed.field === 'text' && MM.hasBlocks(n)) {
        n.text = text;
        if (!n.blocks.length) n.blocks.push(MM.createBlock('', 0));
        jump(n.id, 'block', n.blocks[0].id, 'end');
      } else {
        ED.finish();
      }
      return;
    }
    if (e.key === 'Backspace' && ed.field === 'item' && readText(ed.el) === '') {
      e.preventDefault();
      const idx = n.items.findIndex((i) => i.id === ed.itemId);
      n.items.splice(idx, 1);
      const prev = n.items[Math.max(0, idx - 1)];
      if (prev) jump(n.id, 'item', prev.id, 'end');
      else ED.finish({ noWrite: true });
    }
  }

  /** Keyboard handling inside an outline block. Returns true if handled. */
  function blockKey(e, ed, n) {
    const blocks = n.blocks, O = MM.outline;
    const idx = blocks.findIndex((b) => b.id === ed.itemId);
    if (idx < 0) return false;
    const b = blocks[idx];
    const text = readText(ed.el);
    const off = caretOffset(ed.el);
    const collapsedSel = window.getSelection().isCollapsed;
    const vis = O.visible(blocks);
    const vpos = vis.indexOf(idx);

    switch (e.key) {
      case 'Enter': {
        if (e.shiftKey) return false;
        if (text === '' && b.level > 0) {
          b.text = '';
          O.outdent(blocks, idx);
          jump(n.id, 'block', b.id, 0);
          return true;
        }
        b.text = text.slice(0, off);
        const nb = MM.createBlock(text.slice(off), b.level);
        if (O.hasChildren(blocks, idx) && !b.collapsed) {
          nb.level = b.level + 1; // becomes first child
          blocks.splice(idx + 1, 0, nb);
        } else {
          blocks.splice(O.subtreeEnd(blocks, idx), 0, nb);
        }
        jump(n.id, 'block', nb.id, 0);
        return true;
      }
      case 'Tab': {
        b.text = text;
        if (e.shiftKey) O.outdent(blocks, idx);
        else O.indent(blocks, idx);
        jump(n.id, 'block', b.id, off);
        return true;
      }
      case 'Backspace': {
        if (!collapsedSel || off !== 0) return false;
        if (vpos > 0) {
          const prev = blocks[vis[vpos - 1]];
          const caret = prev.text.length;
          prev.text += text;
          blocks.splice(idx, 1);
          jump(n.id, 'block', prev.id, caret);
          return true;
        }
        if (text === '') {
          O.remove(blocks, idx);
          jump(n.id, 'text', null, 'end');
          return true;
        }
        return false;
      }
      case 'ArrowUp': {
        if (!collapsedSel || off !== 0) return false;
        b.text = text;
        if (vpos > 0) jump(n.id, 'block', blocks[vis[vpos - 1]].id, 'end');
        else jump(n.id, 'text', null, 'end');
        return true;
      }
      case 'ArrowDown': {
        if (!collapsedSel || off !== text.length || vpos >= vis.length - 1) return false;
        b.text = text;
        jump(n.id, 'block', blocks[vis[vpos + 1]].id, 0);
        return true;
      }
    }
    return false;
  }

  // ---- Connection labels --------------------------------------------------

  let labelInput = null;

  ED.editLabel = function (edgeId) {
    ED.finish();
    ED.finishLabel();
    const e = MM.edge(edgeId);
    const g = MM.render.edgeGeo.get(edgeId);
    if (!e || !g) return;
    const input = document.createElement('input');
    input.className = 'label-editor';
    input.value = e.label || '';
    input.placeholder = MM.tr('Label');
    input.style.left = g.mid.x + 'px';
    input.style.top = g.mid.y + 'px';
    input.dataset.edge = edgeId;
    document.getElementById('ui-layer').appendChild(input);
    labelInput = input;
    input.focus({ preventScroll: true });
    input.select();
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') ED.finishLabel();
      if (ev.key === 'Escape') ED.finishLabel(true);
    });
    input.addEventListener('blur', () => ED.finishLabel());
  };

  ED.finishLabel = function (cancel) {
    const input = labelInput;
    if (!input) return;
    labelInput = null;
    const e = MM.edge(input.dataset.edge);
    if (e && !cancel) e.label = input.value.trim();
    input.remove();
    MM.commit();
  };

  ED.isLabelEditing = () => !!labelInput;
})(window.MM);
