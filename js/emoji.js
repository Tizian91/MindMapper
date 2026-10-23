'use strict';
/*
 * Emoji / symbol picker.
 *
 * Emoji are plain Unicode characters, so they need no document changes: they
 * either go into a note's text (at the caret, or appended when the note is not
 * being edited) or become a note of their own (a large character, no border).
 *
 * Entry points:
 *   contextmenu on a note  -> "Emoji…" with an Into text / As note switch
 *   Ctrl+. while editing   -> inserts at the caret
 *   contextmenu on canvas  -> "Insert > Emoji…" creates an emoji note
 */
(function (MM) {
  const S = MM.state;
  const E = (MM.emoji = {});

  // ---- Catalog ---------------------------------------------------------------
  // Compact on purpose: enough to cover planning notes, without shipping a
  // 2000-entry database. Keywords are English, matching the rest of the UI.

  const RAW = {
    smileys: '😀 grin|😄 happy|😁 beam|😂 laugh|🙂 smile|😉 wink|😊 blush|😍 love|😘 kiss|🤔 think|😐 neutral|' +
      '😴 sleep|😎 cool|🤯 mindblown|😅 sweat|😢 sad|😭 cry|😡 angry|🤢 sick|🤒 ill|🥳 party|🤩 star-struck|' +
      '🙃 upside|😶 silent|🤫 quiet|😬 awkward|🫡 salute|🥲 touched',
    gestures: '👍 thumbs up yes like|👎 thumbs down no|👏 clap|🙌 hands|🙏 thanks please|🤝 deal agree|' +
      '✌️ peace|👌 ok|🤞 luck|💪 strong|👀 look watch|🖐️ hand|👋 hello bye|🫶 heart hands',
    symbols: '✅ check done ok|❌ cross no|⚠️ warning attention|❗ exclamation important|❓ question|' +
      '⭐ star favorite|🔥 fire hot urgent|💡 idea tip|📌 pin|🎯 goal target|🚧 construction wip|' +
      '🛑 stop|⏳ waiting|🔄 repeat|♻️ recycle|✔️ done|✖️ remove|➕ add|➖ remove|❇️ new|🔴 red|🟡 yellow|' +
      '🟢 green|🔵 blue|⚫ black|⚪ white|💯 hundred|‼️ important|⁉️ question',
    objects: '📁 folder|📂 open folder|📄 page document|📃 file|📊 chart data|📈 growth up|📉 down|' +
      '🗓️ calendar|📅 date|📆 calendar|📝 note write|📋 clipboard list|🔗 link|💻 laptop computer|' +
      '🖥️ desktop|⌨️ keyboard|🖱️ mouse|🖨️ printer|🔧 tool fix|🔨 hammer|⚙️ settings gear|🗂️ archive|' +
      '📎 attach|✂️ cut|🖊️ pen|✏️ pencil edit|🔒 lock|🔓 unlock|🔑 key|📦 box package|🗃️ box archive|' +
      '📥 inbox|📤 outbox|🧾 receipt invoice|💰 money|💳 card|📞 phone call|✉️ mail email|📧 email',
    activity: '🏃 run|🚶 walk|🧘 meditate|🏋️ gym|⚽ ball|🎾 tennis|🏊 swim|🚴 bike|🎨 art paint|' +
      '🎵 music|🎮 game|🎬 film|📚 books read|🎓 study|🏆 trophy win|🥇 first|🎉 celebrate|🎁 gift',
    food: '☕ coffee|🍵 tea|🍎 apple|🍌 banana|🥗 salad|🍕 pizza|🍔 burger|🍰 cake|🍫 chocolate|🍺 beer|' +
      '🥤 drink|🍽️ meal eat',
    travel: '✈️ plane travel|🚗 car|🚕 taxi|🚆 train|🚌 bus|🚲 bike|🏠 home|🏢 office|🏥 hospital|' +
      '🏫 school|🗺️ map|📍 location|🧭 compass|🏖️ beach|⛰️ mountain',
    animals: '🐶 dog|🐱 cat|🐭 mouse|🐰 rabbit|🦊 fox|🐻 bear|🐼 panda|🦁 lion|🐮 cow|🐷 pig|🐔 chicken|' +
      '🦅 eagle|🦉 owl|🐝 bee|🦋 butterfly|🌳 tree|🌱 seedling|🌸 flower|🌻 sunflower|🍀 luck clover',
    flags: '💬 comment|🏳️ flag|🏁 finish|🚩 flag red|🎌 flags|🏴 black flag|⭐ star',
  };

  const CATEGORY_LABELS = {
    smileys: 'Smileys', gestures: 'Gestures', symbols: 'Symbols', objects: 'Objects',
    activity: 'Activity', food: 'Food', travel: 'Travel', animals: 'Nature', flags: 'Other',
  };

  const entries = [];
  for (const [category, raw] of Object.entries(RAW)) {
    for (const chunk of raw.split('|')) {
      const s = chunk.trim();
      if (!s) continue;
      const sp = s.indexOf(' ');
      const char = sp < 0 ? s : s.slice(0, sp);
      const keywords = sp < 0 ? '' : s.slice(sp + 1);
      entries.push({ char, keywords, category });
    }
  }
  E.entries = entries;
  E.categories = CATEGORY_LABELS;

  // ---- Inserting -------------------------------------------------------------

  function addRecent(char) {
    const list = Array.isArray(S.settings.emojiRecent) ? S.settings.emojiRecent.slice() : [];
    const next = [char].concat(list.filter((c) => c !== char)).slice(0, 20);
    S.settings.emojiRecent = next;
    MM.saveSettings();
  }

  /**
   * Insert at the caret of the active edit field. Returns false if not editing.
   * `range` restores the caret saved when the picker opened (focus moved to the
   * picker's search box meanwhile).
   */
  E.insertText = function (char, range) {
    const ed = MM.editing;
    if (!ed || !ed.el) return false;
    ed.el.focus();
    if (range && ed.el.contains(range.startContainer)) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    let ok = false;
    try {
      ok = document.execCommand('insertText', false, char);
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      // fallback: append at the end of the field
      ed.el.textContent = (ed.el.textContent || '') + char;
      ok = true;
    }
    if (ok) addRecent(char);
    return ok;
  };

  /** Append a character to a note's text and commit. */
  E.appendTo = function (node, char) {
    if (!node) return false;
    const sep = node.text && !/\s$/.test(node.text) ? ' ' : '';
    node.text = (node.text || '') + sep + char;
    addRecent(char);
    MM.commit();
    return true;
  };

  /** Create a stand-alone emoji note at world point `at`. */
  E.insertNote = function (char, at) {
    const p = at || MM.viewCenter();
    const n = MM.createSymbolNode(char, p.x, p.y);
    S.doc.nodes[n.id] = n;
    MM.select([n.id]);
    addRecent(char);
    MM.commit();
    return n;
  };

  // ---- Picker popover ---------------------------------------------------------

  let pop = null;
  let resolvePick = null;
  let state = { category: 'smileys', search: '', mode: 'text', target: null, at: null };
  let outsideHandler = null;
  let keyHandler = null;
  let savedRange = null;

  const esc = (s) => MM.render.esc(s);

  function build() {
    pop = document.createElement('div');
    pop.className = 'emoji-pop';
    pop.hidden = true;
    pop.innerHTML = `
      <div class="emoji-head">
        <input type="search" class="emoji-search" placeholder="Search emoji…">
        <button type="button" class="emoji-close" title="Close (Esc)">✕</button>
      </div>
      <div class="emoji-modes seg seg-mini"></div>
      <div class="emoji-tabs"></div>
      <div class="emoji-grid"></div>`;
    document.body.appendChild(pop);

    // keep the caret in the note text: clicking buttons must not take the focus
    pop.addEventListener('mousedown', (e) => {
      if (!e.target.closest('input')) e.preventDefault();
    });
    pop.querySelector('.emoji-search').addEventListener('input', (e) => {
      state.search = e.target.value;
      renderGrid();
    });
    pop.querySelector('.emoji-search').addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter') {
        const first = pop.querySelector('.emoji-cell');
        if (first) choose(first.dataset.char);
      }
    });
    pop.querySelector('.emoji-close').addEventListener('click', () => close(null));
    pop.querySelector('.emoji-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      state.category = b.dataset.cat;
      state.search = '';
      pop.querySelector('.emoji-search').value = '';
      renderTabs();
      renderGrid();
    });
    pop.querySelector('.emoji-modes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      state.mode = b.dataset.mode;
      renderModes();
    });
    pop.querySelector('.emoji-grid').addEventListener('click', (e) => {
      const cell = e.target.closest('.emoji-cell');
      if (cell) choose(cell.dataset.char);
    });
  }

  function renderModes() {
    const box = pop.querySelector('.emoji-modes');
    // "Into text" only makes sense when there is a target note
    if (!state.target) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = ['text', 'note'].map((m) =>
      `<button type="button" data-mode="${m}" class="${state.mode === m ? 'active' : ''}">` +
      `${MM.tr(m === 'text' ? 'Into text' : 'As note')}</button>`).join('');
  }

  function renderTabs() {
    const recent = Array.isArray(S.settings.emojiRecent) ? S.settings.emojiRecent : [];
    const cats = (recent.length ? [['recent', 'Recent']] : []).concat(Object.entries(CATEGORY_LABELS));
    pop.querySelector('.emoji-tabs').innerHTML = cats.map(([k, label]) =>
      `<button type="button" data-cat="${k}" class="${state.category === k ? 'active' : ''}" title="${esc(MM.tr(label))}">` +
      (k === 'recent' ? '🕘' : esc(MM.tr(label))) + '</button>').join('');
  }

  function currentList() {
    const recent = Array.isArray(S.settings.emojiRecent) ? S.settings.emojiRecent : [];
    const text = state.search.trim().toLowerCase();
    if (text) {
      return entries.filter((e) => e.char.includes(state.search.trim()) || e.keywords.includes(text));
    }
    if (state.category === 'recent') return recent.map((char) => ({ char, keywords: '', category: 'recent' }));
    return entries.filter((e) => e.category === state.category);
  }

  function renderGrid() {
    const list = currentList();
    pop.querySelector('.emoji-grid').innerHTML = list.length
      ? list.map((e) => `<button type="button" class="emoji-cell" data-char="${esc(e.char)}" title="${esc(e.keywords)}">${esc(e.char)}</button>`).join('')
      : `<p class="hint">${MM.tr('No match.')}</p>`;
  }

  function position(anchorRect) {
    const r = pop.getBoundingClientRect();
    let x = anchorRect ? anchorRect.left : (window.innerWidth - r.width) / 2;
    let y = anchorRect ? anchorRect.bottom + 6 : (window.innerHeight - r.height) / 2;
    x = Math.max(6, Math.min(x, window.innerWidth - r.width - 6));
    if (y + r.height > window.innerHeight - 6) y = Math.max(6, (anchorRect ? anchorRect.top : window.innerHeight) - r.height - 6);
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
  }

  function close(value) {
    if (pop && !pop.hidden) pop.hidden = true;
    if (outsideHandler) {
      document.removeEventListener('pointerdown', outsideHandler, true);
      outsideHandler = null;
    }
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler, true);
      keyHandler = null;
    }
    savedRange = null;
    const r = resolvePick;
    resolvePick = null;
    if (r) r(value || null);
  }

  function choose(char) {
    if (!char) return close(null);
    const mode = state.mode;
    const target = state.target;
    const at = state.at;
    const range = savedRange;
    close(char);
    if (mode === 'pick') return; // the caller only wanted the character (diary stickers)
    // apply outside the promise so the caller can stay simple
    if (mode === 'note' || !target) {
      if (mode === 'note' || !MM.editing) E.insertNote(char, at);
      else E.insertText(char, range);
    } else if (MM.editing && MM.editing.nodeId === target.id) {
      E.insertText(char, range);
    } else {
      E.appendTo(target, char);
    }
  }

  /**
   * Open the picker.
   * opts.mode:        'text' (append / caret), 'note', or 'pick' (insert nothing, only resolve)
   * opts.target:      node to insert into (enables the Into text / As note switch)
   * opts.at:          world point for a new emoji note
   * opts.anchorRect:  screen rect the popover should stick to
   * opts.container:   element to show the picker in (a modal dialog), default body
   * Resolves with the chosen character (the insertion already happened) or null.
   */
  E.pick = function (opts) {
    if (!pop) build();
    if (!pop.hidden) close(null); // a second Ctrl+. just re-targets the open picker
    const o = opts || {};
    // inside a modal dialog (the diary) the picker must live in that dialog, or it cannot be used
    const host = o.container || document.body;
    if (pop.parentNode !== host) host.appendChild(pop);
    savedRange = null;
    if (MM.editing) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && MM.editing.el && MM.editing.el.contains(sel.anchorNode)) {
        savedRange = sel.getRangeAt(0).cloneRange();
      }
    }
    state = {
      category: (Array.isArray(S.settings.emojiRecent) && S.settings.emojiRecent.length) ? 'recent' : 'smileys',
      search: '',
      mode: o.mode || (o.target ? 'text' : 'note'),
      target: o.target || null,
      at: o.at || null,
    };
    pop.querySelector('.emoji-search').value = '';
    pop.querySelector('.emoji-search').placeholder = MM.tr('Search emoji…');
    pop.querySelector('.emoji-close').title = MM.tr('Close (Esc)');
    renderModes();
    renderTabs();
    renderGrid();
    pop.hidden = false;
    position(o.anchorRect);
    // while a note is being edited the focus must stay there, otherwise the
    // edit session would end and the caret position would be lost
    if (!savedRange) pop.querySelector('.emoji-search').focus();

    if (outsideHandler) document.removeEventListener('pointerdown', outsideHandler, true);
    outsideHandler = (ev) => {
      if (!pop.contains(ev.target)) close(null);
    };
    // defer so the click that opened the picker does not close it at once
    setTimeout(() => document.addEventListener('pointerdown', outsideHandler, true), 0);

    // Esc closes the picker even while the caret sits in the note being edited
    if (keyHandler) document.removeEventListener('keydown', keyHandler, true);
    keyHandler = (ev) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      close(null);
    };
    document.addEventListener('keydown', keyHandler, true);

    return new Promise((resolve) => (resolvePick = resolve));
  };

  E.isOpen = () => !!(pop && !pop.hidden);
  E.close = () => close(null);
})(window.MM);
