"""Build HANDBUCH.html from HANDBUCH.md (readable page with table of contents, light / dark).

Run after every change of HANDBUCH.md:  python tools/make_handbook_html.py .

Only the Markdown the handbook uses: headings, paragraphs, > quotes, ---, tables,
nested - / 1. lists, **bold**, *italic*, `code`, [links](url). No external library.
"""
import html
import re
import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'
src = open(root + '/HANDBUCH.md', encoding='utf-8').read().replace('\r\n', '\n')


def inline(text):
    """Inline Markdown of one line / paragraph -> HTML (escaped first)."""
    keep = []

    def stash(s):
        keep.append(s)
        return '\x00%d\x00' % (len(keep) - 1)

    t = re.sub(r'`([^`]+)`', lambda m: stash('<code>%s</code>' % html.escape(m.group(1))), text)
    t = html.escape(t, quote=False)
    t = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)',
               lambda m: stash('<a href="%s">%s</a>' % (html.escape(m.group(2)), m.group(1))), t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', t)
    return re.sub('\x00(\\d+)\x00', lambda m: keep[int(m.group(1))], t)


def slug(title, used):
    m = re.match(r'(\d+)\.', title)
    base = 'kapitel-' + m.group(1) if m else re.sub(r'[^a-z0-9äöüß]+', '-', title.lower()).strip('-') or 'abschnitt'
    s, i = base, 2
    while s in used:
        s, i = '%s-%d' % (base, i), i + 1
    used.add(s)
    return s


ITEM = re.compile(r'^(\s*)([-*]|\d+\.)\s+(.*)$')
lines = src.split('\n')
out, toc, used = [], [], set()
title = 'MindMapper – Handbuch'
i = 0


def special(line):
    return (line.startswith('#') or line.strip() == '---' or line.startswith('>') or line.startswith('|')
            or ITEM.match(line))


while i < len(lines):
    line = lines[i]
    if not line.strip():
        i += 1
        continue
    m = re.match(r'^(#{1,4})\s+(.*)$', line)
    if m:
        level, text = len(m.group(1)), m.group(2).strip()
        if level == 1:
            title = text
            out.append('<h1>%s</h1>' % inline(text))
        else:
            sid = slug(text, used)
            if level == 2:
                toc.append((sid, text))
            out.append('<h%d id="%s">%s<a class="anchor" href="#%s" aria-hidden="true">#</a></h%d>'
                       % (level, sid, inline(text), sid, level))
        i += 1
    elif line.strip() == '---':
        out.append('<hr>')
        i += 1
    elif line.startswith('>'):
        quote = []
        while i < len(lines) and lines[i].startswith('>'):
            quote.append(lines[i].lstrip('>').strip())
            i += 1
        out.append('<blockquote><p>%s</p></blockquote>' % inline(' '.join(quote)))
    elif line.startswith('|'):
        rows = []
        while i < len(lines) and lines[i].startswith('|'):
            cells = re.split(r'(?<!\\)\|', lines[i].strip()[1:-1])
            rows.append([c.strip().replace('\\|', '|') for c in cells])
            i += 1
        head, body = rows[0], [r for r in rows[1:] if not all(re.match(r'^:?-+:?$', c) for c in r)]
        t = '<div class="table"><table><thead><tr>%s</tr></thead><tbody>' % ''.join('<th>%s</th>' % inline(c) for c in head)
        t += ''.join('<tr>%s</tr>' % ''.join('<td>%s</td>' % inline(c) for c in r) for r in body)
        out.append(t + '</tbody></table></div>')
    elif ITEM.match(line):
        # nested lists by indentation; continuation lines are indented text without a marker
        stack = []  # [indent, tag]
        buf = []
        while i < len(lines):
            ln = lines[i]
            mm = ITEM.match(ln)
            if mm:
                ind, tag = len(mm.group(1)), 'ol' if mm.group(2)[0].isdigit() else 'ul'
                while stack and ind < stack[-1][0]:
                    buf.append('</li></%s>' % stack.pop()[1])
                if not stack or ind > stack[-1][0]:
                    buf.append('<%s>' % tag)
                    stack.append([ind, tag])
                else:
                    buf.append('</li>')
                    if stack[-1][1] != tag:
                        buf.append('</%s><%s>' % (stack[-1][1], tag))
                        stack[-1][1] = tag
                buf.append('<li>' + inline(mm.group(3)))
                i += 1
            elif ln.strip() and ln.startswith(' ') and stack:
                buf.append(' ' + inline(ln.strip()))
                i += 1
            elif not ln.strip() and i + 1 < len(lines) and (ITEM.match(lines[i + 1]) and lines[i + 1].startswith(' ')):
                i += 1  # blank line inside a nested list
            else:
                break
        while stack:
            buf.append('</li></%s>' % stack.pop()[1])
        out.append(''.join(buf))
    else:
        para = []
        while i < len(lines) and lines[i].strip() and not special(lines[i]):
            para.append(lines[i].strip())
            i += 1
        out.append('<p>%s</p>' % inline(' '.join(para)))

nav = '<nav class="toc"><div class="toc-head">Inhalt</div><ol>%s</ol></nav>' % ''.join(
    '<li><a href="#%s">%s</a></li>' % (sid, inline(re.sub(r'^\d+\.\s*', '', text))) for sid, text in toc)

CSS = """
:root { --bg: #f7f8fa; --paper: #fff; --text: #1f2933; --muted: #5f6b7a; --line: #dfe3ea; --accent: #2b6cde;
  --code: #eef1f6; --th: #f0f3f8; --quote: #eef4ff; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #15181d; --paper: #1d2128; --text: #e3e7ee; --muted: #9aa5b4; --line: #343a45; --accent: #79a7ff;
    --code: #2a303a; --th: #252a33; --quote: #1f2a3d; }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 16px; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 16px/1.65 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap { display: grid; grid-template-columns: 250px minmax(0, 860px); gap: 32px; justify-content: center; padding: 24px 16px 64px; }
.toc { position: sticky; top: 16px; align-self: start; max-height: calc(100vh - 32px); overflow: auto;
  background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; font-size: 14px; }
.toc-head { font-weight: 700; margin-bottom: 6px; }
.toc ol { margin: 0; padding-left: 22px; }
.toc li { margin: 3px 0; }
.toc a { color: var(--text); text-decoration: none; }
.toc a:hover { color: var(--accent); }
main { background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 28px 40px 40px; }
h1 { font-size: 2em; margin: 0 0 12px; }
h2 { font-size: 1.45em; margin: 2.2em 0 0.6em; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
h3 { font-size: 1.15em; margin: 1.8em 0 0.5em; }
h2 .anchor, h3 .anchor { margin-left: 8px; color: var(--muted); text-decoration: none; opacity: 0; font-weight: 400; }
h2:hover .anchor, h3:hover .anchor { opacity: 1; }
p { margin: 0.7em 0; }
a { color: var(--accent); }
ul, ol { padding-left: 1.5em; margin: 0.5em 0; }
li { margin: 0.25em 0; }
li > ul, li > ol { margin: 0.2em 0; }
code { background: var(--code); padding: 1px 5px; border-radius: 4px; font-size: 0.9em;
  font-family: ui-monospace, Consolas, "Cascadia Mono", monospace; }
blockquote { margin: 1em 0; padding: 8px 16px; background: var(--quote); border-left: 4px solid var(--accent); border-radius: 6px; }
blockquote p { margin: 0.3em 0; }
hr { border: 0; border-top: 1px solid var(--line); margin: 1.6em 0; }
.table { overflow-x: auto; margin: 1em 0; }
table { border-collapse: collapse; width: 100%; font-size: 0.94em; }
th, td { border: 1px solid var(--line); padding: 7px 10px; text-align: left; vertical-align: top; }
th { background: var(--th); }
@media (max-width: 900px) {
  .wrap { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .toc { position: static; max-height: none; }
  main { padding: 20px 18px 32px; }
}
@media print {
  body { background: #fff; color: #000; }
  .toc { display: none; }
  .wrap { display: block; padding: 0; }
  main { border: 0; padding: 0; }
  h2 { break-after: avoid; }
}
"""

page = """<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- generated from HANDBUCH.md by tools/make_handbook_html.py - edit the .md, then build again -->
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:">
<meta name="color-scheme" content="light dark">
<title>%s</title>
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<style>%s</style>
</head>
<body>
<div class="wrap">
%s
<main>
%s
</main>
</div>
</body>
</html>
""" % (html.escape(title), CSS, nav, '\n'.join(out))

open(root + '/HANDBUCH.html', 'w', encoding='utf-8', newline='\n').write(page)
print('ok', len(toc), 'chapters')
