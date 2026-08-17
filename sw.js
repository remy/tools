// Offline support for every tool in this collection.
//
// A request is answered from the first of these that can produce something:
//
//   1. A copy cached for THIS deploy — served immediately, refreshed behind the
//      scenes so the next load stays current.
//   2. The network — reached only on the first request for a given deploy.
//   3. The previous deploy's copy — if the network is slow, unreachable, or the
//      device is offline.
//
// The point of (3) is that (2) must never be able to hang the page. A captive
// portal, a dead VPN or a cell signal that never resolves leaves a socket open
// for tens of seconds; rather than wait it out, the network gets
// NETWORK_TIMEOUT_MS to answer and the previous deploy's copy is served if it
// doesn't. The in-flight request is still allowed to finish and fill the cache,
// so the next load is current.

// Stamped with the deploy's commit SHA by .github/workflows/update_index.yml,
// so every deploy gets its own cache and is fetched fresh rather than being
// served from the previous deploy's entries.
const VERSION = '__GIT_SHA__';
const CACHE_NAME = `tools-${VERSION}`;

// One generation of history, kept so the first load after a deploy — which has
// nothing in the new cache yet — still has something to fall back on.
const PREVIOUS_CACHE = 'tools-previous';

// Long enough not to give up on a merely slow connection, short enough that a
// dead one is not something you sit and watch.
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(retireSupersededCaches().then(() => self.clients.claim()));
});

// Move everything from superseded deploy caches into the fallback cache, then
// drop them. Without this a deploy would leave the new cache empty and nothing
// to fall back on, which is exactly when a bad network hurts most.
async function retireSupersededCaches() {
  const names = await caches.keys();
  const superseded = names.filter(
    (n) => n.startsWith('tools-') && n !== CACHE_NAME && n !== PREVIOUS_CACHE,
  );
  if (!superseded.length) return;

  const fallback = await caches.open(PREVIOUS_CACHE);
  for (const name of superseded) {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (response) await fallback.put(request, response);
    }
    await caches.delete(name);
  }
}

async function matchIn(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  // A link that carries state in its query string (e.g. /todo/?list=<id>) is
  // the same document as the cached page, so match it ignoring the query.
  // Navigations only — for a subresource the query usually identifies a
  // different thing entirely.
  if (request.mode === 'navigate') return cache.match(request, { ignoreSearch: true });
  return null;
}

// Fetch and store under this deploy's cache. Resolves null rather than
// rejecting, so callers can treat "no answer" uniformly. `cache: 'no-cache'`
// forces a conditional request instead of letting the browser's own HTTP cache
// answer — without it an entry can be "refreshed" with an equally stale copy
// and never actually update.
function fetchAndCache(request) {
  return fetch(request, { cache: 'no-cache' })
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
}

function afterTimeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

async function respond(event) {
  const { request } = event;

  // 1. Already have it for this deploy.
  const current = await matchIn(CACHE_NAME, request);
  if (current) {
    event.waitUntil(fetchAndCache(request));
    return current;
  }

  // 2/3. First request for this deploy — go to the network, but only wait on it
  // for as long as there is no alternative.
  const network = fetchAndCache(request);
  const previous = await matchIn(PREVIOUS_CACHE, request);
  if (!previous) return (await network) || Response.error();

  const winner = await Promise.race([network, afterTimeout(NETWORK_TIMEOUT_MS)]);
  if (winner) return winner;

  // Slow or unreachable: serve the previous deploy's copy and let the request
  // finish in the background so the next load is current.
  event.waitUntil(network);
  return previous;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== location.origin) return;
  event.respondWith(respond(event));
});
