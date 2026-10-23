'use strict';
/*
 * Small Markdown renderer for diary entries (no library: works offline, and
 * nothing from a file can run as code - every piece of text is escaped).
 *
 *   # Heading .. ###### Heading     paragraphs (a line break stays a line break)
 *   - / * / + lists, 1. lists, nested by indenting, - [ ] / - [x] check boxes
 *   > quote, --- rule, ``` code block ```, | tables | with a |---| row
 *   **bold**, *italic* / _italic_, ~~struck~~, `code`, [link](https://…)
 *   ![description](asset:<id>)  image stored in the map (doc.assets), or https://…
 *
 * MM.md.render(text, assetUrl) -> HTML; assetUrl(id) returns the data URL of an asset.
 */
(function (MM) {
  const MD = (MM.md = {});

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /** Asset ids referenced by a Markdown text ("![x](asset:a123)"). */
  MD.assetIds = (text) => [...String(text || '').matchAll(/\]\(asset:([\w-]+)\)/g)].map((m) => m[1]);

  // ---- Inline -----------------------------------------------------------------

  /** Allowed link / image targets; everything else is dropped. */
  function safeUrl(url, image, assetUrl) {
    const u = url.trim();
    if (image && u.startsWith('asset:')) {
      const data = assetUrl ? assetUrl(u.slice(6)) : null;
      return typeof data === 'string' && data.startsWith('data:image/') ? data : '';
    }
    if (/^https?:\/\//i.test(u) || (!image && /^mailto:/i.test(u))) return u;
    return '';
  }

  function inline(src, assetUrl) {
    const keep = []; // finished HTML pieces, protected from the later rules
    const stash = (html) => `\u0000${keep.push(html) - 1}\u0000`;
    let s = String(src);
    s = s.replace(/`([^`]+)`/g, (_, c) => stash(`<code>${esc(c)}</code>`));
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
      const u = safeUrl(url, true, assetUrl);
      return stash(u ? `<img src="${esc(u)}" alt="${esc(alt)}" title="${esc(alt)}">` : `<span class="md-missing">[${esc(alt || 'image')}]</span>`);
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      const u = safeUrl(url, false);
      // the label stays in the text, so bold / italic / a stashed image in it still work
      return u ? stash(`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">`) + label + stash('</a>') : label;
    });
    s = esc(s);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
  }

  // ---- Blocks -----------------------------------------------------------------

  const isTableSep = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
  const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const listItem = (line) => /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);

  function table(lines, i, assetUrl) {
    const head = cells(lines[i]);
    const align = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : ''));
    const cell = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c, assetUrl)}</${tag}>`;
    let h = '<table><thead><tr>' + head.map((c, k) => cell('th', c, k)).join('') + '</tr></thead><tbody>';
    let j = i + 2;
    for (; j < lines.length && lines[j].includes('|') && lines[j].trim(); j++) {
      const row = cells(lines[j]);
      h += '<tr>' + head.map((_, k) => cell('td', row[k] || '', k)).join('') + '</tr>';
    }
    return { html: h + '</tbody></table>', next: j };
  }

  /** Lists, nested by indentation (2 spaces or a tab per level, loosely). */
  function list(lines, i, assetUrl) {
    let h = '';
    const stack = []; // { indent, tag }
    let j = i;
    for (; j < lines.length; j++) {
      const m = listItem(lines[j]);
      if (!m) {
        // a continuation line (indented, not empty) belongs to the item above
        if (lines[j].trim() && /^\s+/.test(lines[j]) && stack.length) {
          h = h.replace(/<\/li>$/, '') + '<br>' + inline(lines[j].trim(), assetUrl) + '</li>';
          continue;
        }
        break;
      }
      const indent = m[1].replace(/\t/g, '  ').length;
      const tag = /\d/.test(m[2]) ? 'ol' : 'ul';
      while (stack.length && indent < stack[stack.length - 1].indent) h += `</${stack.pop().tag}></li>`;
      const top = stack[stack.length - 1];
      if (top && indent === top.indent && tag !== top.tag) {
        // "1." right after "-" (or the other way round): a new list on the same level
        h += `</${top.tag}><${tag}>`;
        top.tag = tag;
      } else if (!top || indent > top.indent) {
        if (top) h = h.replace(/<\/li>$/, '');
        stack.push({ indent, tag });
        h += `<${tag}>`;
      }
      let text = m[3], box = '';
      const task = /^\[([ xX])\]\s+(.*)$/.exec(text);
      if (task) {
        box = `<input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> `;
        text = task[2];
      }
      h += `<li${task ? ' class="md-task"' : ''}>${box}${inline(text, assetUrl)}</li>`;
    }
    while (stack.length) {
      h += `</${stack.pop().tag}>`;
      if (stack.length) h += '</li>';
    }
    return { html: h, next: j };
  }

  MD.render = function (text, assetUrl) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    let h = '';
    let para = [];
    const flush = () => {
      if (para.length) h += `<p>${para.map((l) => inline(l, assetUrl)).join('<br>')}</p>`;
      para = [];
    };
    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      if (!line.trim()) {
        flush();
        i++;
        continue;
      }
      // ``` code block ```
      if (/^\s*```/.test(line)) {
        flush();
        let j = i + 1;
        const code = [];
        for (; j < lines.length && !/^\s*```/.test(lines[j]); j++) code.push(lines[j]);
        h += `<pre><code>${esc(code.join('\n'))}</code></pre>`;
        i = j + 1;
        continue;
      }
      const head = /^(#{1,6})\s+(.*)$/.exec(line);
      if (head) {
        flush();
        h += `<h${head[1].length}>${inline(head[2], assetUrl)}</h${head[1].length}>`;
        i++;
        continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
        flush();
        h += '<hr>';
        i++;
        continue;
      }
      if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        flush();
        const t = table(lines, i, assetUrl);
        h += t.html;
        i = t.next;
        continue;
      }
      if (listItem(line)) {
        flush();
        const l = list(lines, i, assetUrl);
        h += l.html;
        i = l.next;
        continue;
      }
      if (/^\s*>/.test(line)) {
        flush();
        const quote = [];
        for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s*>\s?/, ''));
        h += `<blockquote>${MD.render(quote.join('\n'), assetUrl)}</blockquote>`;
        continue;
      }
      para.push(line);
      i++;
    }
    flush();
    return h;
  };
})(window.MM);
