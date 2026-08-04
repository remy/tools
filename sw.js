const VERSION = '306c09ace8b670d19c1683414bee8bc21be27e80';
const CACHE_NAME = `tools-${VERSION}`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      // Offline: fall back to the cache. Retry ignoring the query string so
      // links that carry state in it (e.g. /todo/?list=<id>) still resolve to
      // the cached page rather than failing on an exact-URL miss.
      .catch(() => caches.match(event.request)
        .then((hit) => hit || caches.match(event.request, { ignoreSearch: true })))
  );
});
