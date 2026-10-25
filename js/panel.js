'use strict';
/*
 * Right-hand properties panel. Content depends on the selection:
 *   notes selected       -> type, shape, colors, text, align/distribute
 *   connections selected -> route, line style, arrows, label
 *   nothing selected     -> canvas settings, default connection style, shortcuts
 *
 * Controls carry data attributes and are handled by event delegation:
 *   data-action="name"            -> MM.actions[name](data-value)
 *   data-node-prop="type|shape"   -> set property on selected notes
 *   data-node-style="fill|..."    -> set style value on selected notes
 *   data-edge-style="route|..."   -> set style on selected connections (or defaults)
 *   data-edge-prop="label"        -> set property on selected connections
 *   data-setting="grid|..."       -> app setting
 */
(function (MM) {
  const S = MM.state;
  const P = (MM.panel = {});
  const esc = (s) => MM.render.esc(s);
  const t = (k, fb) => (MM.t ? MM.t(k, fb) : (fb !== undefined ? fb : k));
  const closeBtn = () =>
    `<button type="button" class="panel-close-btn" data-action="togglePanel" title="${t('closePanel')}" aria-label="${t('closePanel')}">✕</button>`;
  const head = (title) => `<div class="panel-head-row"><h3>${title}</h3>${closeBtn()}</div>`;
  let root;
  let lastKey = '';

  // ---- Small icons -------------------------------------------------------

  function shapeIcon(shape) {
    const d = shape === 'none' ? 'M2,2H30V20H2Z' : MM.geo.shapePath(shape, 32, 22, 2);
    const dash = shape === 'none' ? ' stroke-dasharray="3 3"' : '';
    return `<svg viewBox="0 0 32 22" width="32" height="22"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6"${dash}/></svg>`;
  }

  function routeIcon(route) {
    const d = {
      straight: 'M3,19L29,3',
      elbow: 'M3,19H16V3H29',
      rounded: 'M3,19H11Q16,19 16,14V8Q16,3 21,3H29',
      curved: 'M3,19C18,19 14,3 29,3',
    }[route];
    return `<svg viewBox="0 0 32 22" width="32" height="22"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
  }

  function lineIcon(style) {
    const dash = MM.geo.dashArray(style, 2);
    return `<svg viewBox="0 0 32 22" width="32" height="22"><path d="M3,11H29" stroke="currentColor" stroke-width="2"` +
      (dash ? ` stroke-dasharray="${dash}"` : '') + ` stroke-linecap="${style === 'dotted' ? 'round' : 'butt'}"/></svg>`;
  }

  const ALIGN_ICONS = {
    left: 'M3,2V20M6,5H22M6,13H16', hcenter: 'M16,2V20M8,5H24M11,13H21', right: 'M29,2V20M10,5H26M16,13H26',
    top: 'M2,3H30M6,6V20M14,6V14', vcenter: 'M2,11H30M6,4V18M14,7V15', bottom: 'M2,19H30M6,2V16M14,8V16',
  };
  const alignIcon = (k) =>
    `<svg viewBox="0 0 32 22" width="28" height="20"><path d="${ALIGN_ICONS[k]}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

  // ---- HTML builders -------------------------------------------------------

  function seg(attr, current, options, iconFn) {
    return '<div class="seg">' + Object.entries(options).map(([value, label]) =>
      `<button ${attr}="${value}" class="${value === current ? 'active' : ''}" title="${esc(label)}">` +
      (iconFn ? iconFn(value) : esc(label)) + '</button>').join('') + '</div>';
  }

  function select(attr, current, options) {
    return `<select ${attr}>` + Object.entries(options).map(([v, l]) =>
      `<option value="${v}"${v === current ? ' selected' : ''}>${esc(l)}</option>`).join('') + '</select>';
  }

  /** Small icon of a drawing shape. */
  function drawIcon(kind) {
    const d = { rect: 'M4,4H28V18H4Z', ellipse: 'M4,11A12,7 0 1,0 28,11A12,7 0 1,0 4,11Z', line: 'M4,18L28,4', arrow: 'M4,18L28,4M20,4H28V10' }[kind];
    return `<svg viewBox="0 0 32 22" width="32" height="22"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
  }

  /** Panel of selected drawings (draw.js): shape, anchor, line and fill. */
  function drawPanel(nodes) {
    const n = nodes[0], st = n.style;
    const count = nodes.length > 1 ? ` <span class="muted">(${nodes.length})</span>` : '';
    const kinds = {};
    Object.entries(MM.DRAW_KINDS).forEach(([k, label]) => (kinds[k] = MM.tr(label)));
    const line = n.draw === 'line' || n.draw === 'arrow';
    const filled = st.fill && st.fill !== 'none';
    const label = MM.draw.anchorLabel(n);
    const op = st.opacity === undefined ? 1 : st.opacity;
    return `<section>${head(esc(MM.tr('Drawing')) + count)}
      <div class="row"><label>${esc(MM.tr('Shape'))}</label>${seg('data-node-prop="draw" data-value', n.draw, kinds, drawIcon)}</div>
      <div class="row"><label>${esc(MM.tr('Anchor'))}</label><span class="file-sub">${label
        ? esc(MM.tr('Anchored to "{note}" – moves and scales with it', { note: label }))
        : esc(MM.tr('Not anchored – moves only when selected'))}</span></div>
      <div class="btn-row">
        <button data-action="drawAnchor" title="Ctrl+G">${esc(MM.tr('Anchor to the note below'))}</button>
        ${n.anchor ? `<button data-action="drawDetach" title="Ctrl+Shift+G">${esc(MM.tr('Detach'))}</button>` : ''}
      </div>
    </section>
    <section><h3>${t('style')}</h3>
      <div class="row"><label>${esc(MM.tr('Line'))}</label><input type="color" data-node-style="stroke" value="${esc(st.stroke)}">
        <input type="number" data-node-style="strokeWidth" value="${esc(st.strokeWidth)}" min="0.5" max="24" step="0.5" title="${t('borderWidth')}"></div>
      <div class="row"><label>${t('borderLine')}</label>${seg('data-node-style="strokeStyle" data-value', st.strokeStyle,
        { solid: t('solid'), dashed: t('dashed'), dotted: t('dotted') }, lineIcon)}</div>` +
      (line ? '' : `
      <div class="row"><label>${t('fill')}</label><input type="color" data-node-style="fill" value="${esc(filled ? st.fill : '#ffffff')}">
        <button data-node-style="fill" data-value="none" class="${filled ? '' : 'active'}">${esc(MM.tr('No fill'))}</button></div>`) + `
      <div class="row"><label>${t('opacity')}</label><input type="range" data-node-style="opacity" min="0.1" max="1" step="0.05" value="${esc(op)}"></div>
    </section>
    <section><h3>${t('arrange')}</h3>
      <div class="btn-row">
        <button data-action="toFront">${t('toFront')}</button>
        <button data-action="toBack">${t('toBack')}</button>
        <button data-action="duplicate">${t('duplicate')}</button>
        <button data-action="deleteSelection" class="danger">${t('delete')}</button>
      </div>
    </section>`;
  }

  /** Diary entry (diary.js): which diary, day and time, open the page. */
  function diarySection(nodes) {
    const d = nodes[0].diary || {};
    const books = MM.project.diaries.map((x) => x.name);
    if (d.book && !books.includes(d.book)) books.unshift(d.book);
    const opts = [`<option value=""${d.book ? '' : ' selected'}>${esc(MM.tr('– choose –'))}</option>`]
      .concat(books.map((b) => `<option value="${esc(b)}"${b === d.book ? ' selected' : ''}>${esc(b)}</option>`),
        [`<option value="__new">${esc(MM.tr('New diary…'))}</option>`]);
    return `<section><h3>${esc(MM.tr('Diary'))}</h3>
      <div class="row"><label>${esc(MM.tr('Diary'))}</label><select data-diary-field="book">${opts.join('')}</select></div>
      <div class="row"><label>${esc(MM.tr('Day'))}</label><input type="date" data-diary-field="date" value="${esc(d.date || '')}">
        <input type="time" data-diary-field="time" value="${esc(d.time || '')}"></div>
      <div class="btn-row"><button data-action="openDiary" ${d.book ? '' : 'disabled'}>📖 ${esc(MM.tr('Open in diary'))}</button></div>
      <p class="hint">${esc(MM.tr('Markdown: # heading, **bold**, *italic*, - list, | table |. Paste or drop images while writing. Arrows pointing at the entry show their note in its head.'))}</p>
    </section>`;
  }

  function nodePanel(nodes) {
    if (nodes.every((x) => x.type === 'draw')) return drawPanel(nodes);
    const n = nodes[0], st = n.style;
    const count = nodes.length > 1 ? ` <span class="muted">(${nodes.length})</span>` : '';
    const allImages = nodes.every((x) => x.type === 'image');
    const anyImage = nodes.some((x) => x.type === 'image');
    const fileNode = nodes.find((x) => x.type === 'file');
    const anyFile = !!fileNode;
    const textTypes = {};
    MM.TEXT_TYPES.forEach((ty) => (textTypes[ty] = t('node_' + ty, MM.NODE_TYPES[ty])));

    let h = `<section>${head((allImages ? t('image') : anyFile ? t('file') : t('note')) + count)}` +
      (anyImage || anyFile ? '' : `<div class="row"><label>${t('type')}</label>${select('data-node-prop="type"', n.type, textTypes)}</div>`) +
      (anyFile ? `<div class="row"><label>${t('file')}</label><span class="file-sub">${esc(MM.files.describe(fileNode.file))}</span></div>
      <div class="btn-row"><button data-action="openFile">${t('openFile')}</button>
        <button data-action="replaceFile">${t('replaceFile')}</button>
        <button data-action="revealFile" title="${t('pathTitle')}">${t('path')}</button></div>` : '');
    if (anyImage) {
      const op = st.opacity === undefined ? 1 : st.opacity;
      h += `
      <div class="row"><label>${t('showAs')}</label>${seg('data-node-prop="overlay" data-value', String(!!n.overlay),
        { false: t('note'), true: t('overlay') })}</div>
      <div class="row"><label>${t('fit')}</label>${seg('data-node-style="fit" data-value', st.fit || 'cover',
        { cover: t('fitCover'), contain: t('fitContain') })}</div>
      <div class="row"><label>${t('opacity')}</label><input type="range" data-node-style="opacity" min="0.1" max="1" step="0.05" value="${esc(op)}"></div>
      <div class="btn-row"><button data-action="replaceImage">${t('replaceImage')}</button></div>
      <p class="hint">${t('imageHint')}</p>`;
    }
    h += '</section>';
    // diary entries have their own section instead of deadline / status / estimate
    if (nodes.every((x) => x.type === 'diary')) h += diarySection(nodes);
    else h += detailsSection(nodes);
    h += `<section><h3>${t('shape')}</h3>
      <div class="shape-grid">` + Object.keys(MM.SHAPES).map((s) => {
        const label = esc(t('shape_' + s, MM.SHAPES[s]));
        return `<button data-node-prop="shape" data-value="${s}" class="${s === n.shape ? 'active' : ''}" title="${label}" aria-label="${label}">${shapeIcon(s)}</button>`;
      }).join('') +
      `</div>
    </section>
    <section><h3>${t('style')}</h3>` +
      (anyImage ? '' : `<div class="row"><label>${t('fill')}</label><input type="color" data-node-style="fill" value="${esc(st.fill)}"></div>`) + `
      <div class="row"><label>${t('border')}</label><input type="color" data-node-style="stroke" value="${esc(st.stroke)}">
        <input type="number" data-node-style="strokeWidth" value="${esc(st.strokeWidth)}" min="0" max="12" step="0.5" title="${t('borderWidth')}"></div>
      <div class="row"><label>${t('borderLine')}</label>${seg('data-node-style="strokeStyle" data-value', st.strokeStyle,
        { solid: t('solid'), dashed: t('dashed'), dotted: t('dotted') }, lineIcon)}</div>` +
      (anyImage ? '' : `
      <div class="row"><label>${t('text')}</label><input type="color" data-node-style="textColor" value="${esc(st.textColor)}">
        <input type="number" data-node-style="fontSize" value="${esc(st.fontSize)}" min="8" max="96" step="1" title="${t('fontSize')}"></div>
      <div class="row"><label></label>
        <button data-node-style="bold" data-value="${!st.bold}" class="${st.bold ? 'active' : ''}" title="${t('bold')}"><b>B</b></button>
        ${seg('data-node-style="align" data-value', st.align, { left: t('alignLeft'), center: t('alignCenter'), right: t('alignRight') },
          (a) => ({ left: '⇤', center: '↔', right: '⇥' })[a])}
      </div>`) + `
    </section>`;
    if (nodes.length > 1) {
      h += `<section><h3>${esc(t('alignDistribute'))}</h3>
        <div class="btn-row">` + ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'].map((k) =>
          `<button data-action="align" data-value="${k}" title="${t('align_' + k)}">${alignIcon(k)}</button>`).join('') +
        `</div>
        <div class="btn-row">
          <button data-action="distribute" data-value="x" ${nodes.length < 3 ? 'disabled' : ''}>${t('distributeH')}</button>
          <button data-action="distribute" data-value="y" ${nodes.length < 3 ? 'disabled' : ''}>${t('distributeV')}</button>
        </div>
      </section>`;
    }
    h += `<section><h3>${t('arrange')}</h3>
      <div class="btn-row">
        <button data-action="toFront">${t('toFront')}</button>
        <button data-action="toBack">${t('toBack')}</button>
        <button data-action="duplicate">${t('duplicate')}</button>
        <button data-action="deleteSelection" class="danger">${t('delete')}</button>
      </div>
    </section>`;
    return h;
  }

  /** Deadline, estimate, priority and tags of the selected notes. */
  function detailsSection(nodes) {
    const m = nodes[0].meta || MM.emptyMeta();
    const prioIcon = () => '<span class="prio-dot"></span>';
    const prioLabels = {};
    for (const k of Object.keys(MM.prioCatalog())) prioLabels[k] = MM.prioLabel(k);
    const pKey = MM.prioKey();
    const statusLabels = {};
    for (const [k, v] of Object.entries(MM.STATUSES)) statusLabels[k] = t('status_' + k, k === 'none' ? 'None' : v.label);
    const statusIcon = (s) => `<span class="status-ico">${MM.meta.icon(s)}</span>`;
    // wrapping row of colored choice chips
    const pick = (key, current, labels, iconFn, catalog) => '<div class="pick">' + Object.entries(labels).map(([v, label]) =>
      `<button class="pick-chip${v === current ? ' active' : ''}" data-meta="${key}" data-value="${v}" style="--c:${catalog[v].color}">` +
      `${iconFn(v)}${esc(label)}</button>`).join('') + '</div>';
    // tags shared by all selected notes
    const tags = (nodes[0].tags || []).filter((t) => nodes.every((n) => (n.tags || []).includes(t)));
    const known = MM.meta.allTags().map((x) => x.tag).filter((t) => !tags.includes(t));
    const chips = tags.map((tg) => MM.meta.tagChip(tg, '').replace('</span>',
      `<button class="chip-x" data-remove-tag="${esc(tg)}" title="${t('removeTag')}">×</button></span>`)).join('');
    const tasks = nodes.every((n) => n.type === 'task');
    const prog = MM.meta.hasProgress(m) ? m.progress : 0;
    // tasks with sub-tasks get their progress from them (read only here)
    const calc = nodes.length === 1 ? MM.tasks.info(nodes[0]) : null;
    const anyCalc = nodes.some((n) => MM.tasks.info(n));
    const calcRow = calc
      ? `<div class="row"><label>${t('progress')}</label><span class="ov-progress">${MM.meta.progressBar(calc.progress)}<b>${calc.progress} % ∑</b></span></div>
        <p class="hint">${t(calc.count === 1 ? 'calcFromOne' : 'calcFromMany').replace('{n}', calc.count)}</p>`
      : `<p class="hint">${t('calcSome')}</p>`;
    return `<section><h3>${t('details')}</h3>
      <div class="row"><label>${t('deadline')}</label><input type="date" data-meta="deadline" value="${esc(m.deadline || '')}"
          title="${esc(t('deadlineTitle'))}">
        <button class="icon-btn" data-clear-meta="deadline" title="${t('clearDeadline')}">×</button></div>
      <div class="row"><label>${t('scheduled')}</label><input type="date" data-meta="scheduled" value="${esc(m.scheduled || '')}"
          title="${esc(t('scheduledTitle'))}">
        <input type="time" data-meta="scheduledTime" value="${esc(m.scheduledTime || '')}" title="${esc(t('scheduledTimeTitle'))}">
        <button class="icon-btn" data-clear-meta="scheduled" title="${t('clearScheduled')}">×</button></div>
      <div class="row"><label>${t('estimate')}</label><input type="text" data-meta="estimate" placeholder="${t('estimatePlaceholder')}"
        value="${esc(MM.meta.formatDuration(m.estimate))}"></div>
      ${tasks && anyCalc ? calcRow : ''}
      ${tasks && !anyCalc ? `<div class="row"><label>${t('progress')}</label>
        <input type="range" data-meta="progress" min="0" max="100" step="5" value="${prog}">
        <input type="number" data-meta="progress" min="0" max="100" step="5" value="${MM.meta.hasProgress(m) ? prog : ''}"
          placeholder="%" title="${t('progressPercent')}">
        <button class="icon-btn" data-clear-meta="progress" title="${t('clearProgress')}">×</button></div>` : ''}
      <div class="row col"><label>${t('workload')}</label>${MM.load.previewHTML(nodes)}</div>
      ${nodes.length === 1 && nodes[0].type !== 'image' && nodes[0].type !== 'file' ? repeatRow(nodes[0]) : ''}
      <div class="row col"><label>${t('status')}</label>${pick('status', m.status || 'none', statusLabels, statusIcon, MM.STATUSES)}</div>
      <div class="row col"><label>${t(pKey === 'quadrant' ? 'eisenhower' : 'priority')}</label>${pick(pKey, MM.prioOf(m), prioLabels, prioIcon, MM.prioCatalog())}</div>
      <div class="row col"><label>${t('tags')}</label>
        <div class="tag-editor">${chips}<input type="text" data-tag-input list="tag-suggestions" placeholder="${t('addTagPlaceholder')}"></div>
        <datalist id="tag-suggestions">${known.map((tg) => `<option value="${esc(tg)}">`).join('')}</datalist>
      </div>
      <div class="row col"><label>${t('link')}</label>
        <div class="link-row"><input type="text" data-link-input list="link-suggestions" value="${esc(nodes[0].link || '')}"
          placeholder="${esc(t('linkPlaceholder'))}" title="${esc(t('linkInputTitle'))}">
          <button data-action="openLink" title="${t('openLinkTitle')}" ${nodes[0].link ? '' : 'disabled'}>↗</button></div>
        <datalist id="link-suggestions">${MM.project.mapPaths().map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
      </div>
    </section>`;
  }

  /** "Repeat" rule of a note (routines.js): kind, days / day of month, time, start / end. */
  function repeatRow(n) {
    const r = n.repeat;
    const R = MM.routines;
    const kinds = { none: t('repeatNone') };
    for (const [k, v] of Object.entries(MM.REPEAT_KINDS)) kinds[k] = t('repeatKind_' + k, v);
    const weekdays = MM.weekdayNames();
    let h = `<div class="row col"><label>${t('repeat')}</label>${select('data-repeat="kind"', r ? r.kind : 'none', kinds)}`;
    if (r) {
      const time = `<label class="rp-inline">${t('atTime')} <input type="time" data-repeat="time" value="${esc(r.time)}"></label>`;
      if (r.kind === 'weekly') {
        h += `<div class="rp-line">${t('every')} <input type="number" data-repeat="every" min="1" max="52" value="${r.every}"> ${t('weeksOn')}</div>
          <div class="workdays">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="check"><input type="checkbox" data-repeat-day="${d}"` +
          ` ${r.days.includes(d) ? 'checked' : ''}>${weekdays[d]}</label>`).join('')}</div>${time}`;
      } else if (r.kind === 'monthly-day') {
        h += `<div class="rp-line">${t('onDay')} <input type="number" data-repeat="day" min="1" max="31" value="${r.day}"> ${time}</div>`;
      } else if (r.kind === 'monthly-nth') {
        const nth = {};
        for (const k of Object.keys(R.NTH)) nth[k] = t('nth_' + k, R.NTH[k]);
        const wd = {};
        weekdays.forEach((v, i) => (wd[i] = v));
        h += `<div class="rp-line">${t('onThe')} ${select('data-repeat="nth"', String(r.nth), nth)} ${select('data-repeat="weekday"', String(r.weekday), wd)} ${time}</div>`;
      } else if (r.kind === 'times') {
        h += `<div class="rp-line"><input type="number" data-repeat="times" min="1" max="7" value="${r.times}"> ${esc(MM.tr('× per week (a check box each on the week plan)'))}</div>`;
      }
      if (r.kind !== 'off') {
        // category: groups the routine on the week plan; a leisure category takes no capacity
        const cats = { '': MM.tr('(none)') };
        for (const c of R.categories()) cats[c.id] = R.categoryTitle(c) + (c.leisure ? ' · ' + MM.tr('leisure') : '');
        cats.__new = MM.tr('New category…');
        h += `<div class="rp-line"><label class="rp-inline">${esc(MM.tr('Category'))} ${select('data-repeat="category"', R.category(r.category) ? r.category : '', cats)}</label></div>`;
      }
      h += `<div class="rp-line"><label class="rp-inline">${t('from')} <input type="date" data-repeat="from" value="${esc(r.from)}"></label>
        <label class="rp-inline">${t('until')} <input type="date" data-repeat="until" value="${esc(r.until)}"></label></div>
        <p class="hint">${esc(R.label(r, n.meta.estimate))}. ${r.kind === 'off'
    ? t('repeatOffHint')
    : R.isLeisure(r)
      ? esc(MM.tr('Leisure: shown and checked off on the plans, but takes no time off the capacity.'))
      : r.kind === 'times'
        ? esc(MM.tr('Duration of each time = Estimate above. Takes its time off the capacity; week plans get a check box per time.'))
        : t(r.kind === 'budget' ? 'repeatBudgetHint' : 'repeatDurationHint')}</p>`;
      // how often it was done lately (from the plans; see routines.js history)
      const hist = r.kind !== 'off' && MM.load.loaded() ? R.historyHTML(n.id, R.historyIndex(MM.load.docs())) : '';
      if (hist) h += `<div class="rp-line rp-history">${hist}</div>`;
    }
    return h + '</div>';
  }

  /** Focus a metadata field (used when a chip in a task note is clicked). */
  P.focusField = function (key) {
    const elx = root.querySelector(key === 'repeat' ? '[data-repeat="kind"]' : `[data-meta="${key}"]`);
    if (!elx) return;
    elx.scrollIntoView({ block: 'nearest' });
    const target = elx.tagName === 'INPUT' ? elx : elx.closest('.row');
    if (elx.tagName === 'INPUT') {
      elx.focus();
      if (elx.type === 'date' && elx.showPicker) {
        try { elx.showPicker(); } catch (err) { /* needs user activation */ }
      }
    }
    target.classList.remove('flash');
    void target.offsetWidth; // restart the animation
    target.classList.add('flash');
  };

  function edgeStyleControls(st) {
    const routes = {}, lines = {}, arrows = {};
    for (const [k, v] of Object.entries(MM.ROUTES)) routes[k] = t('route_' + k, v);
    for (const [k, v] of Object.entries(MM.LINE_STYLES)) lines[k] = t('line_' + k, v);
    for (const [k, v] of Object.entries(MM.ARROWS)) arrows[k] = t('arrow_' + k, v);
    return `
      <div class="row col"><label>${t('route')}</label>${seg('data-edge-style="route" data-value', st.route, routes, routeIcon)}</div>
      <div class="row col"><label>${t('line')}</label>${seg('data-edge-style="lineStyle" data-value', st.lineStyle, lines, lineIcon)}</div>
      <div class="row"><label>${t('color')}</label><input type="color" data-edge-style="color" value="${esc(st.color)}">
        <input type="number" data-edge-style="width" value="${st.width}" min="0.5" max="12" step="0.5" title="${t('lineWidth')}"></div>
      <div class="row"><label>${t('start')}</label>${select('data-edge-style="startArrow"', st.startArrow, arrows)}</div>
      <div class="row"><label>${t('end')}</label>${select('data-edge-style="endArrow"', st.endArrow, arrows)}</div>`;
  }

  function edgePanel(edges) {
    const e = edges[0];
    const count = edges.length > 1 ? ` <span class="muted">(${edges.length})</span>` : '';
    return `<section>${head(t('connection') + count)}
      ${edgeStyleControls(e.style)}
      <div class="row"><label>${t('label')}</label><input type="text" data-edge-prop="label" value="${esc(e.label || '')}" placeholder="${t('optional')}"></div>
      <div class="btn-row">
        <button data-action="reverseEdges" title="${t('reverseTitle')}">${t('reverse')}</button>
        <button data-action="deleteSelection" class="danger">${t('delete')}</button>
      </div>
      <p class="hint">${t('edgeHint')}</p>
    </section>`;
  }

  const SHORTCUTS = [
    ['key_rightClick', 'sc_rightClick'], ['key_ctrlV', 'sc_ctrlV'], ['key_ctrlClick', 'sc_ctrlClick'],
    ['key_codeNote', 'sc_codeNote'], ['key_group', 'sc_group'], ['key_dblClick', 'sc_dblClick'],
    ['key_dragAnchor', 'sc_dragAnchor'], ['Tab', 'sc_tab'], ['Enter / F2', 'sc_enterF2'],
    ['key_shiftEnter', 'sc_shiftEnter'], ['key_outline', 'sc_outline'], ['key_spaceDrag', 'sc_spaceDrag'],
    ['key_altDrag', 'sc_altDrag'], ['key_ctrlDrag', 'sc_ctrlDrag'], ['key_shiftResize', 'sc_shiftResize'], ['key_undoRedo', 'sc_undoRedo'],
    ['key_clipboard', 'sc_clipboard'], ['key_arrows', 'sc_arrows'], ['key_fit', 'sc_fit'], ['key_pdf', 'sc_pdf'],
  ];

  function canvasPanel() {
    const set = S.settings;
    const weekdays = MM.weekdayNames();
    return `<section>${head(t('canvas'))}
      <label class="check"><input type="checkbox" data-setting="smartGuides" ${set.smartGuides ? 'checked' : ''}> ${t('smartGuidesCheck')}</label>
      <label class="check"><input type="checkbox" data-setting="grid" ${set.grid ? 'checked' : ''}> ${t('snapGridCheck')}</label>
      <div class="row"><label>${t('gridSize')}</label><input type="number" data-setting="gridSize" value="${set.gridSize}" min="4" max="200" step="1"></div>
      <label class="check"><input type="checkbox" data-setting="autoSaveFile" ${set.autoSaveFile ? 'checked' : ''}> ${t('autoSaveCheck')}</label>
      ${MM.project && MM.project.status === 'ready' && MM.project.backend.kind === 'local' ? `<label class="check"><input type="checkbox" data-setting="syncedFolder" ${set.syncedFolder ? 'checked' : ''}> ${esc(MM.tr('Folder is synced (pCloud, OneDrive …)'))}</label>
      <p class="hint">${esc(MM.tr('Saves 15 s after the last change (and at once when you leave the map or the app), so the sync program does not keep conflict copies. Stored {where}.', { where: MM.storage.capacityLocation() }))}</p>` : ''}
      <div class="row"><label>${t('mouseWheel')}</label>${select('data-setting="wheel"', set.wheel, { zoom: t('wheelZoom'), scroll: t('wheelScroll') })}</div>
    </section>
    <section><h3>${t('appearance')}</h3>
      <div class="row"><label>${t('theme')}</label>${select('data-setting="theme"', set.theme || 'auto', { auto: t('themeAuto'), light: t('themeLight'), dark: t('themeDark') })}</div>
      <div class="row"><label>${t('language')}</label>${select('data-setting="lang"', MM.getLang(), { en: 'English', de: 'Deutsch' })}</div>
    </section>
    <section><h3>${t('planningCapacity')}</h3>
      <div class="row"><label>${t('hoursWorkDay')}</label><input type="number" data-setting="hoursPerDay" value="${esc(MM.load.capacity().hours)}" min="0.5" max="24" step="0.5"></div>
      <div class="row"><label>${t('hoursWeekendDay')}</label><input type="number" data-setting="hoursPerWeekendDay" value="${esc(MM.load.capacity().weekendHours)}" min="0" max="24" step="0.5"></div>
      <div class="row col"><label>${t('workDays')}</label><div class="workdays">${[1, 2, 3, 4, 5, 6, 0].map((d) =>
        `<label class="check"><input type="checkbox" data-workday="${d}" ${MM.load.capacity().days.includes(d) ? 'checked' : ''}>` +
        `${weekdays[d]}</label>`).join('')}</div></div>
      <p class="hint">${t('capacityHint').replace('{where}', esc(MM.storage.capacityLocation()))}</p>
      <div class="row"><label>${t('prioSystem')}</label>${select('data-setting="prioSystem"', set.prioSystem, { levels: t('prioLevels'), eisenhower: t('eisenhower') })}</div>
      <p class="hint">${t('prioSystemHint').replace('{where}', esc(MM.storage.capacityLocation()))}</p>
    </section>
    ${categoriesSection()}
    <section><h3>${t('newConnections')}</h3>
      ${edgeStyleControls(S.edgeStyle)}
    </section>
    <section><h3>${t('shortcuts')}</h3>
      <dl class="keys">
        ${SHORTCUTS.map(([k, d]) => `<dt>${esc(t(k, k))}</dt><dd>${esc(t(d))}</dd>`).join('\n        ')}
      </dl>
    </section>`;
  }

  /** Settings: routine categories of this folder (name, emoji, leisure), see routines.js. */
  function categoriesSection() {
    const tr = MM.tr;
    const rows = MM.routines.categories().map((c) => `<div class="cat-row">
        <button class="cat-emoji" data-cat-emoji-pick="${esc(c.id)}" title="${esc(tr('Choose an emoji (right-click: remove it)'))}">${esc(c.emoji || '☺')}</button>
        <input type="text" data-cat-name="${esc(c.id)}" value="${esc(c.name)}" maxlength="40">
        <label class="check" title="${esc(tr('Leisure: its routines take no time off the capacity'))}"><input type="checkbox" data-cat-leisure="${esc(c.id)}" ${c.leisure ? 'checked' : ''}> ${esc(tr('leisure'))}</label>
        <button class="icon-btn" data-cat-delete="${esc(c.id)}" title="${esc(tr('Delete category'))}">×</button>
      </div>`).join('');
    return `<section><h3>${esc(tr('Routine categories'))}</h3>
      ${rows || `<p class="hint">${esc(tr('No categories yet.'))}</p>`}
      <button data-cat-add>${esc(tr('+ Category'))}</button>
      <p class="hint">${esc(tr('Routines of a category share a list on the week plan. Leisure: shown and checked off, but no time off the capacity. Stored {where}.', { where: MM.storage.capacityLocation() }))}</p>
    </section>`;
  }

  // ---- Update / binding ------------------------------------------------------

  const PANEL_MIN = 180, PANEL_MAX = 800, PANEL_DEFAULT = 270;

  /** Show / hide the panel and apply its width (settings.showPanel, settings.panelWidth). */
  P.applyLayout = function () {
    const main = document.getElementById('main');
    if (!main) return;
    const show = S.settings.showPanel !== false;
    const w = Math.max(PANEL_MIN, Math.min(PANEL_MAX, S.settings.panelWidth || PANEL_DEFAULT));
    main.classList.toggle('with-panel', show);
    main.style.setProperty('--panel-w', `${w}px`);
    const resizer = document.getElementById('panel-resizer');
    if (resizer) resizer.setAttribute('aria-valuenow', String(w));
    const expandBtn = document.getElementById('panel-expand-btn');
    if (expandBtn) expandBtn.setAttribute('aria-expanded', String(show));
    const tbPanelBtn = document.querySelector('#toolbar button[data-action="togglePanel"]');
    if (tbPanelBtn) tbPanelBtn.setAttribute('aria-expanded', String(show));
    if (MM.render && MM.render.applyView) MM.render.applyView();
  };

  /** Drag handle between canvas and panel: mouse, double-click (default width) and arrow keys. */
  function initResizer() {
    const resizer = document.getElementById('panel-resizer');
    const main = document.getElementById('main');
    if (!resizer || !main) return;
    resizer.setAttribute('role', 'separator');
    resizer.setAttribute('aria-orientation', 'vertical');
    resizer.setAttribute('tabindex', '0');
    resizer.setAttribute('aria-valuemin', String(PANEL_MIN));
    resizer.setAttribute('aria-valuemax', String(PANEL_MAX));

    let startX = 0, startW = PANEL_DEFAULT, dragging = false;
    const setWidth = (w) => {
      S.settings.panelWidth = w;
      main.style.setProperty('--panel-w', `${w}px`);
      resizer.setAttribute('aria-valuenow', String(w));
      if (MM.render && MM.render.applyView) MM.render.applyView();
    };

    resizer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      resizer.setPointerCapture(e.pointerId);
      resizer.classList.add('dragging');
      document.body.style.cursor = 'ew-resize';
      startX = e.clientX;
      startW = S.settings.panelWidth || PANEL_DEFAULT;
    });
    resizer.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const maxW = Math.min(PANEL_MAX, Math.max(260, window.innerWidth - 300));
      setWidth(Math.round(Math.max(PANEL_MIN, Math.min(maxW, startW + startX - e.clientX))));
    });
    const stopDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      try { resizer.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
      MM.saveSettings();
    };
    resizer.addEventListener('pointerup', stopDrag);
    resizer.addEventListener('pointercancel', stopDrag);
    resizer.addEventListener('dblclick', () => {
      setWidth(PANEL_DEFAULT);
      MM.saveSettings();
    });
    resizer.addEventListener('keydown', (e) => {
      const cur = S.settings.panelWidth || PANEL_DEFAULT;
      let next = null;
      if (e.key === 'ArrowLeft') next = Math.min(PANEL_MAX, cur + 15);
      else if (e.key === 'ArrowRight') next = Math.max(PANEL_MIN, cur - 15);
      else if (e.key === 'Home') next = PANEL_MIN;
      else if (e.key === 'End') next = PANEL_DEFAULT;
      if (next === null) return;
      e.preventDefault();
      setWidth(next);
      MM.saveSettings();
    });
  }

  P.init = function () {
    root = document.getElementById('panel');
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    // right-click on the emoji of a routine category removes it
    root.addEventListener('contextmenu', (e) => {
      const b = e.target.closest('[data-cat-emoji-pick]');
      if (!b) return;
      e.preventDefault();
      MM.routines.editCategories((list) => {
        const c = list.find((x) => x.id === b.dataset.catEmojiPick);
        if (c) c.emoji = '';
      });
      MM.refresh();
      P.update(true);
    });
    initResizer();
    const expandBtn = document.getElementById('panel-expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        MM.actions.togglePanel('expandBtn');
      });
    }
    P.applyLayout();
  };

  /** Force a rebuild (e.g. after a language change). */
  P.rebuild = function () {
    lastKey = '';
    P.update(true);
  };

  P.update = function (force) {
    const nodes = MM.selectedNodes(), edges = MM.selectedEdges();
    // Rebuild only if the relevant data changed, so focused inputs survive.
    const key = JSON.stringify([
      nodes.map((n) => [n.id, n.type, n.shape, n.style, n.meta, n.tags, n.overlay, n.imageId, n.link, n.file, MM.tasks.info(n), n.repeat, n.draw, n.anchor && n.anchor.node, n.diary]),
      nodes.length ? MM.load.previewHTML(nodes) : null,
      edges.map((e) => [e.id, e.style, e.label]),
      nodes.length || edges.length ? null : [S.settings, S.edgeStyle],
      nodes.length ? MM.meta.allTags() : null,
    ]);
    if (!force && key === lastKey) return;
    if (!force && root.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' &&
      document.activeElement.type !== 'checkbox' && lastKey !== '' && sameSelection(key, lastKey)) {
      return; // user is typing in the panel
    }
    lastKey = key;
    if (nodes.length) root.innerHTML = nodePanel(nodes);
    else if (edges.length) root.innerHTML = edgePanel(edges);
    else root.innerHTML = canvasPanel();
  };

  function sameSelection(a, b) {
    const ids = (k) => JSON.stringify(JSON.parse(k).slice(0, 2).map((list) => list.map((x) => x[0])));
    try {
      return ids(a) === ids(b);
    } catch (err) {
      return false;
    }
  }

  function parseValue(el, raw) {
    if (el.type === 'number' || el.type === 'range') return parseFloat(raw);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return raw;
  }

  /** Apply a control's value to the model. Returns true if something changed. */
  function apply(el, raw) {
    const ds = el.dataset;
    const value = parseValue(el, raw);
    if (el.type === 'number' && !isFinite(value)) return false;

    if (ds.nodeProp) {
      for (const n of MM.selectedNodes()) {
        if (ds.nodeProp === 'type') MM.setNodeType(n, value);
        else n[ds.nodeProp] = value;
      }
      return true;
    }
    if (ds.diaryField) {
      const entries = MM.selectedNodes().filter((n) => n.type === 'diary');
      if (ds.diaryField === 'book' && raw === '__new') {
        // create the diary first, then choose it
        MM.project.newDiary().then((name) => {
          if (name) {
            entries.forEach((n) => (n.diary.book = name));
            S.settings.lastDiary = name;
            MM.saveSettings();
            MM.commit();
          }
          P.update(true);
        });
        return false;
      }
      if (ds.diaryField === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
      if (ds.diaryField === 'time' && raw && !/^\d{2}:\d{2}$/.test(raw)) return false;
      entries.forEach((n) => (n.diary[ds.diaryField] = raw));
      if (ds.diaryField === 'book' && raw) {
        S.settings.lastDiary = raw; // new entries go to the same diary
        MM.saveSettings();
      }
      return true;
    }
    if (ds.nodeStyle) {
      for (const n of MM.selectedNodes()) n.style[ds.nodeStyle] = value;
      // the next drawing gets the same line / fill (until the page is reloaded)
      if (MM.selectedNodes().some((n) => n.type === 'draw')) S.drawStyle = Object.assign({}, S.drawStyle, { [ds.nodeStyle]: value });
      return true;
    }
    if (ds.edgeStyle) {
      const edges = MM.selectedEdges();
      for (const e of edges) e.style[ds.edgeStyle] = value;
      S.edgeStyle[ds.edgeStyle] = value; // remember for new connections
      MM.saveSettings();
      return true;
    }
    if (ds.edgeProp) {
      for (const e of MM.selectedEdges()) e[ds.edgeProp] = value;
      return true;
    }
    if (ds.repeat !== undefined || ds.repeatDay !== undefined) {
      const n = MM.selectedNodes()[0];
      if (!n) return false;
      if (ds.repeat === 'category' && raw === '__new') {
        raw = MM.routines.newCategory();
        if (!raw) {
          P.update(true); // cancelled: show the old choice again
          return false;
        }
      }
      if (ds.repeat === 'kind') {
        n.repeat = raw === 'none' ? null : MM.normalizeRepeat(Object.assign(MM.routines.defaults(raw), n.repeat || {}, { kind: raw }));
        return true;
      }
      if (!n.repeat) return false;
      const r = Object.assign({}, n.repeat);
      if (ds.repeatDay !== undefined) {
        const days = new Set(r.days);
        if (el.checked) days.add(Number(ds.repeatDay));
        else days.delete(Number(ds.repeatDay));
        r.days = [...days];
      } else {
        r[ds.repeat] = raw;
      }
      n.repeat = MM.normalizeRepeat(r);
      return true;
    }
    if (ds.catName !== undefined || ds.catLeisure !== undefined) {
      // settings, not the map: stored at once, no undo step
      const id = ds.catName || ds.catLeisure;
      MM.routines.editCategories((list) => {
        const c = list.find((x) => x.id === id);
        if (!c) return;
        if (ds.catName !== undefined && raw.trim()) c.name = raw.trim();
        if (ds.catLeisure !== undefined) c.leisure = el.checked;
      });
      MM.refresh();
      return false;
    }
    if (ds.workday !== undefined) {
      const days = new Set(MM.load.capacity().days);
      if (el.checked) days.add(Number(ds.workday));
      else days.delete(Number(ds.workday));
      S.settings.workDays = [...days].sort((a, b) => a - b);
      MM.saveSettings();
      MM.storage.saveProjectSettings();
      return true;
    }
    if (ds.setting) {
      if (ds.setting === 'lang') {
        MM.setLang(raw);
        return false; // setLang saves and refreshes itself
      }
      if (ds.setting === 'prioSystem') {
        MM.setPrioSystem(raw, true);
        return false; // saves and refreshes itself
      }
      S.settings[ds.setting] = el.type === 'checkbox' ? el.checked : value;
      MM.saveSettings();
      if (ds.setting === 'theme') MM.applyTheme();
      if (MM.storage.CAPACITY_KEYS.includes(ds.setting) || ds.setting === 'syncedFolder') MM.storage.saveProjectSettings();
      return true;
    }
    if (ds.meta) {
      let v = raw;
      if (ds.meta === 'estimate') {
        v = MM.meta.parseDuration(raw);
        if (v === undefined) {
          el.classList.add('invalid');
          return false;
        }
        el.classList.remove('invalid');
      } else if (ds.meta === 'progress') {
        v = MM.meta.progressValue(raw);
        if (v === null && raw !== '' && raw !== null) {
          el.classList.add('invalid');
          return false;
        }
        el.classList.remove('invalid');
      }
      // status and progress are kept in sync there
      MM.meta.setValue(MM.selectedNodes(), ds.meta, v);
      return true;
    }
    if (ds.linkInput !== undefined) {
      const link = MM.links.normalize(raw);
      for (const n of MM.selectedNodes()) n.link = link;
      return true;
    }
    if (ds.tagInput !== undefined) {
      const tag = MM.meta.normalizeTag(raw);
      if (!tag) return false;
      for (const n of MM.selectedNodes()) {
        if (!n.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) n.tags.push(tag);
      }
      return true;
    }
    return false;
  }

  function onClick(e) {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.classList.contains('panel-close-btn')) {
      MM.actions.togglePanel('closeBtn');
      return;
    }
    if (btn.dataset.action) {
      MM.actions[btn.dataset.action](btn.dataset.value);
      return;
    }
    if (btn.dataset.catEmojiPick) {
      const id = btn.dataset.catEmojiPick;
      MM.emoji.pick({ mode: 'pick', anchorRect: btn.getBoundingClientRect() }).then((ch) => {
        if (!ch) return;
        MM.routines.editCategories((list) => {
          const c = list.find((x) => x.id === id);
          if (c) c.emoji = ch;
        });
        MM.refresh();
        P.update(true);
      });
      return;
    }
    if (btn.dataset.catAdd !== undefined) {
      if (MM.routines.newCategory()) P.update(true);
      return;
    }
    if (btn.dataset.catDelete) {
      const c = MM.routines.category(btn.dataset.catDelete);
      if (!c || !confirm(MM.tr('Delete the category "{name}"?\n\nIts routines stay and get no category.', { name: c.name }))) return;
      MM.routines.editCategories((list) => list.splice(list.findIndex((x) => x.id === c.id), 1));
      MM.refresh();
      P.update(true);
      return;
    }
    if (btn.dataset.removeTag !== undefined) {
      for (const n of MM.selectedNodes()) n.tags = n.tags.filter((t) => t !== btn.dataset.removeTag);
      MM.commit();
      return;
    }
    if (btn.dataset.clearMeta) {
      // via setValue: clearing the appointment clears its time as well
      MM.meta.setValue(MM.selectedNodes(), btn.dataset.clearMeta, MM.emptyMeta()[btn.dataset.clearMeta]);
      MM.commit();
      return;
    }
    if (btn.dataset.value !== undefined && apply(btn, btn.dataset.value)) MM.commit();
  }

  // live preview while dragging color pickers / typing
  function onInput(e) {
    const el = e.target;
    if (el.type === 'checkbox' || el.tagName === 'SELECT') return;
    if (['estimate', 'deadline', 'scheduled', 'scheduledTime'].includes(el.dataset.meta) ||
      el.dataset.tagInput !== undefined || el.dataset.linkInput !== undefined ||
      el.dataset.diaryField !== undefined || el.dataset.catName !== undefined) return; // applied on change (deadline / appointment exclude each other)
    if (apply(el, el.value)) {
      MM.render.all();
    }
  }

  function onChange(e) {
    const el = e.target;
    if (apply(el, el.value)) {
      const wasTagInput = el.dataset.tagInput !== undefined;
      MM.commit();
      P.update(true);
      if (wasTagInput) root.querySelector('[data-tag-input]').focus(); // add several tags in a row
    }
  }
})(window.MM);
