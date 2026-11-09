/* Minimal app-shell cache. Firebase, Cloudinary and remote content are never cached. */
const CACHE_NAME = 'astore-shell-v3';
const SHELL = ['./', './index.html', './css/app.css', './js/config.js', './js/backend.js', './js/app.js', './manifest.webmanifest', './assets/icon-192.png', './assets/icon-512.png', './assets/splash-screen.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('astore-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/__/') || /firebase|googleapis|cloudinary/.test(url.hostname)) return;
  event.respondWith(fetch(request).then(response => {
    if (response && response.ok && request.destination !== 'document') {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => undefined);
    }
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html'))));
});
