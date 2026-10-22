'use strict';
/*
 * Filter bar below the toolbar: search text, tags, priority, deadline and type.
 * Notes that don't match are dimmed or hidden (MM.state.filter.mode).
 * The filter only changes the view, never the document.
 */
(function (MM) {
  const S = MM.state;
  const FB = (MM.filterbar = {});
  const esc = (s) => MM.render.esc(s);
  const t = (k, fb) => MM.t(k, fb);
  let bar, dyn, search;
  let lastKey = '';

  const DEADLINE_KEYS = ['any', 'overdue', 'today', 'week', 'has', 'none'];

  /** Static part of the bar (search, clear, close); rebuilt on a language change. */
  function build() {
    bar.innerHTML = `
      <div class="fb-group"><input type="search" class="fb-search" placeholder="${esc(t('filterSearchPlaceholder'))}"></div>
      <div class="fb-dyn"></div>
      <div class="fb-group fb-end">
        <span class="fb-count"></span>
        <button data-f-clear title="${esc(t('filterClearTitle'))}">${esc(t('filterClear'))}</button>
        <button data-f-close title="${esc(t('filterCloseTitle'))}">✕</button>
      </div>`;
    dyn = bar.querySelector('.fb-dyn');
    search = bar.querySelector('.fb-search');
    search.value = S.filter.text || '';
    search.addEventListener('input', () => {
      S.filter.text = search.value;
      MM.refresh();
    });
    search.addEventListener('keydown', (e) => e.stopPropagation());
    lastKey = '';
  }

  FB.init = function () {
    bar = document.getElementById('filterbar');
    build();
    bar.addEventListener('click', onClick);
    bar.addEventListener('change', onChange);
  };

  FB.rebuild = function () {
    if (!bar) return;
    build();
    FB.update();
  };

  function onClick(e) {
    const f = S.filter;
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.fTag !== undefined) toggle(f.tags, b.dataset.fTag);
    else if (b.dataset.fPrio !== undefined) toggle(f.priorities, b.dataset.fPrio);
    else if (b.dataset.fStatus !== undefined) toggle(f.statuses, b.dataset.fStatus);
    else if (b.dataset.fMode) f.mode = b.dataset.fMode;
    else if (b.dataset.fTagmode) f.tagMode = b.dataset.fTagmode;
    else if (b.dataset.fKeep !== undefined) f.keepChildren = !f.keepChildren;
    else if (b.dataset.fClear !== undefined) {
      Object.assign(f, {
        text: '', tags: [], priorities: [], statuses: [], deadline: 'any', type: 'any', keepChildren: false,
      });
      search.value = '';
    } else if (b.dataset.fClose !== undefined) f.open = false;
    else return;
    MM.refresh();
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.f) {
      S.filter[t.dataset.f] = t.value;
      MM.refresh();
    }
  }

  function toggle(list, v) {
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
    else list.push(v);
  }

  FB.update = function () {
    const f = S.filter;
    bar.hidden = !f.open;
    const btn = document.querySelector('[data-action="toggleFilter"]');
    if (btn) {
      btn.classList.toggle('active', f.open);
      btn.classList.toggle('has-filter', MM.meta.filterActive());
    }
    if (!f.open) return;

    const tags = MM.meta.allTags();
    const key = JSON.stringify([tags, f.tags, f.tagMode, f.priorities, f.statuses, f.deadline, f.type, f.mode, f.keepChildren, MM.prioKey()]);
    if (key !== lastKey) {
      lastKey = key;
      const tagChips = tags.length
        ? tags.map(({ tag, count }) => {
          const on = f.tags.includes(tag);
          return `<button class="chip chip-tag fb-chip${on ? ' on' : ''}" style="--h:${MM.meta.tagHue(tag)}" data-f-tag="${esc(tag)}"` +
            ` title="${esc(MM.tf('fb_tagCount', { n: count }))}">#${esc(tag)}</button>`;
        }).join('')
        : `<span class="muted">${t('fb_noTags')}</span>`;
      const prioChips = Object.entries(MM.prioCatalog()).map(([k, v]) =>
        `<button class="chip fb-chip fb-prio${f.priorities.includes(k) ? ' on' : ''}" style="--c:${v.color}" data-f-prio="${k}">` +
        `<span class="prio-dot"></span>${esc(MM.prioLabel(k))}</button>`).join('');
      const statusChips = Object.entries(MM.STATUSES).map(([k, v]) =>
        `<button class="chip fb-chip fb-prio${f.statuses.includes(k) ? ' on' : ''}" style="--c:${v.color}" data-f-status="${k}">` +
        `<span class="status-ico">${MM.meta.icon(k)}</span>${esc(t('status_' + k, v.label))}</button>`).join('');
      const opt = (map, cur) => Object.entries(map).map(([k, l]) =>
        `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
      const deadlines = {};
      DEADLINE_KEYS.forEach((k) => (deadlines[k] = t('fb_dl_' + k)));
      const types = { any: t('fb_allTypes') };
      for (const [k, v] of Object.entries(MM.NODE_TYPES)) types[k] = t('node_' + k, v);
      dyn.innerHTML = `
        <div class="fb-group"><span class="fb-label">${t('tags')}</span>${tagChips}
          ${f.tags.length > 1 ? `<span class="seg seg-mini">
            <button data-f-tagmode="any" class="${f.tagMode === 'any' ? 'active' : ''}" title="${esc(t('fb_anyTitle'))}">${t('fb_any')}</button>
            <button data-f-tagmode="all" class="${f.tagMode === 'all' ? 'active' : ''}" title="${esc(t('fb_allTitle'))}">${t('fb_all')}</button></span>` : ''}
        </div>
        <div class="fb-group"><span class="fb-label">${t('status')}</span>${statusChips}</div>
        <div class="fb-group"><span class="fb-label">${t('priority')}</span>${prioChips}</div>
        <div class="fb-group"><select data-f="deadline">${opt(deadlines, f.deadline)}</select>
          <select data-f="type">${opt(types, f.type)}</select></div>
        <div class="fb-group"><span class="seg seg-mini">
          <button data-f-mode="dim" class="${f.mode === 'dim' ? 'active' : ''}" title="${esc(t('fb_dimTitle'))}">${t('fb_dim')}</button>
          <button data-f-mode="hide" class="${f.mode === 'hide' ? 'active' : ''}" title="${esc(t('fb_hideTitle'))}">${t('fb_hide')}</button></span></div>
        <div class="fb-group"><button class="chip fb-chip fb-keep${f.keepChildren ? ' on' : ''}" data-f-keep="1"
          title="${esc(t('fb_keepTitle'))}">${t('fb_keep')}</button></div>`;
    }
    const all = Object.values(S.doc.nodes);
    const matched = MM.meta.filterActive() ? all.filter(MM.meta.matches).length : all.length;
    const shown = MM.meta.visibleCount ? MM.meta.visibleCount() : matched;
    bar.querySelector('.fb-count').textContent = MM.meta.filterActive()
      ? (shown > matched
        ? MM.tf('fb_countSub', { m: matched, s: shown - matched, n: all.length })
        : MM.tf('fb_count', { m: matched, n: all.length }))
      : '';
  };
})(window.MM);
