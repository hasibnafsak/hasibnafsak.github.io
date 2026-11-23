const CACHE_NAME = 'hasib-nafsak-pwa-v6';
const CORE_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './adhan.m4a'
];
const CDN_FILES = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache each core file independently so an optional path/redirect
    // cannot abort installation of the whole service worker.
    for (const file of CORE_FILES) {
      try {
        const response = await fetch(file, { cache: 'reload' });
        if (response && response.ok) await cache.put(file, response);
      } catch (e) {}
    }
    // Supabase is optional for offline reading/local activity, but cache its
    // browser library while online so it can be available offline as well.
    for (const file of CDN_FILES) {
      try {
        const response = await fetch(file, { mode: 'cors' });
        if (response && response.ok) await cache.put(file, response);
      } catch (e) {}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('hasib-nafsak-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});



// Web Push: receives server-sent reminders even when the app is not open.
self.addEventListener('push', event => {
  let data = { title: 'حاسب نفسك', body: 'تذكير لطيف بعمل صالح 🌿', url: './' };
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; }
    catch (_) { data.body = event.data.text(); }
  }
  event.waitUntil(self.registration.showNotification(data.title || 'حاسب نفسك', {
    body: data.body || 'تذكير بذكر الله',
    icon: './icon.svg', badge: './icon.svg',
    data: { url: data.url || './' },
    dir: 'rtl', lang: 'ar',
    // Best-effort: let iOS/browser use its normal notification alert behavior.
    // The Web Notifications API does not expose a custom audio-file option.
    silent: false,
    vibrate: [250, 150, 250],
    requireInteraction: true,
    tag: data.tag || 'hasib-nafsak-reminder'
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        if ('navigate' in client) await client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow(target);
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache authenticated requests, database data, or user-specific API traffic.
  if (url.hostname.endsWith('supabase.co')) return;

  // Cache-first for the app itself. This makes the saved app open immediately offline.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) {
        // Refresh the cached copy quietly when online.
        fetch(request).then(response => {
          if (response && response.ok) cache.put(request, response.clone());
        }).catch(() => {});
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response && response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        if (request.mode === 'navigate') {
          return (await cache.match('./index.html')) || new Response(
            '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>حاسب نفسك</title><body style="font-family:Arial;text-align:center;padding:30px"><h2>حاسب نفسك</h2><p>افتح الموقع مرة واحدة بالإنترنت حتى يتم حفظه للعمل دون اتصال.</p></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
        return Response.error();
      }
    })());
    return;
  }

  // Cache static CDN libraries and decorative images after successful online fetch.
  const isSupabaseLibrary = url.hostname === 'cdn.jsdelivr.net';
  const isDecorativeImage = url.hostname === 'images.unsplash.com';
  if (isSupabaseLibrary || isDecorativeImage) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        return cached || Response.error();
      }
    })());
  }
});
