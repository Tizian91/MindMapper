'use strict';
/*
 * Service worker: makes MindMapper installable ("Install app" in Chrome / Edge)
 * and usable offline once it was opened online.
 *
 * Network first: online you always get the current files from the server
 * (updates arrive without anything to do), the cache is only the offline copy.
 * Only the program files are cached – the maps live in the project folder.
 *
 * New file in index.html? Add it to FILES, so it is there offline from the start.
 */
const CACHE = 'mindmapper-v1';
const FILES = [
  './',
  'index.html',
  'cloud.html',
  'css/app.css',
  'HANDBUCH.md',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/state.js',
  'js/i18n.js',
  'js/i18n-de.js',
  'js/i18n-de2.js',
  'js/markdown.js',
  'js/geometry.js',
  'js/snapping.js',
  'js/render.js',
  'js/meta.js',
  'js/tasks.js',
  'js/links.js',
  'js/images.js',
  'js/files.js',
  'js/editing.js',
  'js/actions.js',
  'js/interaction.js',
  'js/draw.js',
  'js/panel.js',
  'js/contextmenu.js',
  'js/filterbar.js',
  'js/emoji.js',
  'js/fsys.js',
  'js/cloud-pcloud.js',
  'js/storage.js',
  'js/templates.js',
  'js/project.js',
  'js/transfer.js',
  'js/overview.js',
  'js/views.js',
  'js/workload.js',
  'js/routines.js',
  'js/diary.js',
  'js/main.js',
];

self.addEventListener('install', (e) => {
  // one by one: a file the server does not have must not stop the installation
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => console.warn('MindMapper offline copy: missing ' + f)))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // drop caches of older versions
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })
    .catch(() => caches.match(req, { ignoreSearch: true })
      .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
