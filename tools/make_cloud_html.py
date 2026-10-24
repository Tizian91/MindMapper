"""Build cloud.html from index.html: own Content-Security-Policy + the pCloud script.

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
    '    Cloud version (served at the Cloudflare address, "/" leads here - see _redirects).',
    '    Generated from index.html: keep everything except this block and the pCloud',
    '    script line the same as there (change index.html, then build this file again).',
    '    Connections only to this site and to pCloud\'s API / download servers.',
    '  -->',
    '  <meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; '
    'style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; media-src \'self\' data: blob:; '
    'font-src \'self\' data:; connect-src \'self\' https://*.pcloud.com; worker-src \'self\'; manifest-src \'self\'; '
    'object-src \'none\'; frame-src \'none\'; base-uri \'none\'; form-action \'none\'">',
    '  ',
])
out = src[:start] + head + src[end:]
out = out.replace('<title>MindMapper</title>', '<title>MindMapper ☁</title>', 1)
line = '  <script src="js/fsys.js"></script>' + nl
assert line in out
out = out.replace(line, line + '  <script src="js/cloud-pcloud.js"></script>' + nl, 1)
open(root + '/cloud.html', 'w', encoding='utf-8', newline='').write(out)
print('ok', len(out))
