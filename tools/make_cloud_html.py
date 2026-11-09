"""Build cloud.html (the version with Dropbox) from index.html.

Same page, but: its own Content-Security-Policy (connections to Dropbox's API only),
its own title and manifest (installable as an app of its own) and the Dropbox script.
index.html itself never loads any cloud code.

Run after every change of index.html:  python tools/make_cloud_html.py .
"""
import sys

root = sys.argv[1]
src = open(root + '/index.html', encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in src else '\n'

start = src.index('  <!--' + nl + '    Local-only version')
end = src.index('<title>MindMapper</title>')
head = nl.join([
    '  <!--',
    '    Version with Dropbox - GENERATED from index.html by tools/make_cloud_html.py',
    '    (change index.html, then build this file again). Connections only to this site',
    '    and to Dropbox\'s API; the sign-in page of Dropbox is opened as a page of its own.',
    '    The maps live in the app folder of the user\'s own Dropbox, the sign-in stays in',
    '    this browser.',
    '  -->',
    '  <meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; '
    'style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; media-src \'self\' data: blob:; '
    'font-src \'self\' data:; connect-src \'self\' https://api.dropboxapi.com https://content.dropboxapi.com; '
    'worker-src \'self\'; manifest-src \'self\'; object-src \'none\'; frame-src \'none\'; base-uri \'none\'; form-action \'none\'">',
    '  <meta name="referrer" content="no-referrer">',
    '  ',
])
out = src[:start] + head + src[end:]


def replace_once(text, old, new):
    assert old in text, old
    return text.replace(old, new, 1)


out = replace_once(out, '<title>MindMapper</title>', '<title>MindMapper ☁ Dropbox</title>')
out = replace_once(out, '<link rel="manifest" href="manifest.webmanifest">', '<link rel="manifest" href="manifest-cloud.webmanifest">')
line = '  <script src="js/fsys.js"></script>' + nl
out = replace_once(out, line, line + '  <script src="js/cloud-dropbox.js"></script>' + nl)
open(root + '/cloud.html', 'w', encoding='utf-8', newline='').write(out)
print('ok', len(out))
