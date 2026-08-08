// sw.js — offline, because a dog does not wait for a signal.
//
// The whole tool is four files and none of them talk to a server, so caching them is the entire
// story: install once and it works in a field, a car park, a vet's waiting room with no bars.
const CACHE = 'doggyap-v1';
const FILES = ['./', './index.html', './doggyap.mjs', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  // drop older versions rather than letting a stale kernel serve alongside a new page
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
