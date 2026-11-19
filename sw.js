const CACHE_NAME = 'hasib-nafsak-offline-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('hasib-nafsak-') && key !== CACHE_NAME)
            .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache Supabase API/auth traffic: it must remain live and private.
  if (url.hostname.endsWith('supabase.co')) return;

  // App shell: serve cached files offline, refresh from network when available.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      try {
        const response = await fetch(request);
        if (response && response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        if (cached) return cached;
        if (request.mode === 'navigate') {
          return (await cache.match('./index.html')) || Response.error();
        }
        return Response.error();
      }
    })());
    return;
  }

  // Cache static libraries, images and Quran text after they have been fetched once.
  const cacheableHost =
    url.hostname === 'cdn.jsdelivr.net' ||
    url.hostname === 'images.unsplash.com' ||
    url.hostname.includes('quran') ||
    url.hostname.includes('alquran');

  if (cacheableHost) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      try {
        const response = await fetch(request);
        if (response && response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        return cached || Response.error();
      }
    })());
  }
});
