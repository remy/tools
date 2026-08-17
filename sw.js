// Offline support for every tool in this collection.
//
// Strategy: stale-while-revalidate. A cached response is served immediately and
// refreshed in the background, so the network is never on the critical path for
// anything already seen. The previous network-first strategy meant every
// request waited for the network before the cache was consulted — fine on a
// clean connection, but a captive portal, a dead VPN or a cell signal that
// never resolves leaves the socket open for tens of seconds, and the page hangs
// with a perfectly good copy sitting in the cache.
//
// The trade-off is that a change is served one load late: the load that fetches
// it still shows the old copy, and the one after is current. That is the right
// way round for a set of tools that mostly want to open instantly.

// Bump by hand to throw away every cached entry at once — a reset lever for the
// rare change that makes old entries actively wrong, not a per-deploy stamp.
// Individual entries keep themselves current by revalidating (see below), so
// wiping the cache on every deploy would only guarantee that the first load
// after one has nothing to fall back on, which is exactly when a bad network
// hurts most.
const VERSION = '1';
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

function cachePut(request, response) {
  if (!response || !response.ok) return Promise.resolve();
  const clone = response.clone();
  return caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
}

// Fetch and update the cached copy. Never rejects: a failed revalidation just
// leaves the cached copy in place until the next attempt. `cache: 'no-cache'`
// forces a conditional request rather than letting the browser's own HTTP cache
// answer — without it a stale entry can be refreshed with an equally stale copy
// and never actually update.
function revalidate(request) {
  return fetch(request, { cache: 'no-cache' })
    .then((response) => cachePut(request, response).then(() => response))
    .catch(() => null);
}

function cachedResponse(request) {
  return caches.match(request).then((hit) => {
    if (hit) return hit;
    // A link that carries state in its query string (e.g. /todo/?list=<id>) is
    // the same document as the cached page, so match it ignoring the query.
    // Navigations only — for a subresource the query usually identifies a
    // different thing entirely.
    if (request.mode === 'navigate') {
      return caches.match(request, { ignoreSearch: true });
    }
    return null;
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== location.origin) return;

  event.respondWith(
    cachedResponse(request).then((hit) => {
      if (hit) {
        // Serve now, refresh for next time. waitUntil keeps the worker alive
        // for the background fetch without holding up the response.
        event.waitUntil(revalidate(request));
        return hit;
      }
      // Nothing cached, so the network is the only option — no timeout here,
      // because failing fast on a miss just produces a broken page sooner.
      return revalidate(request).then((response) => response || Response.error());
    })
  );
});
