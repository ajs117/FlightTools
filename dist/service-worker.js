const CACHE_NAME = 'flight-tools-cache-v1';
const TILES_CACHE = 'flight-tools-tiles-v1';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png'
];

const ALLOWED_CROSS_ORIGIN_HOSTS = new Set([
  'basemaps.cartocdn.com',
  'tile.openstreetmap.org',
  'a.basemaps.cartocdn.com',
  'b.basemaps.cartocdn.com',
  'c.basemaps.cartocdn.com',
  'd.basemaps.cartocdn.com',
  'cdn.jsdelivr.net',
  'unpkg.com'
]);

const MAX_TILE_ENTRIES = 500; // limit tile cache growth

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    const remove = keys.slice(0, keys.length - maxEntries);
    await Promise.all(remove.map(r => cache.delete(r)));
  }
}

// Install - cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

// Activate - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== TILES_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch - handle navigation, same-origin assets, and allowed cross-origin tiles
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html');
  const isAllowedCrossOrigin = ALLOWED_CROSS_ORIGIN_HOSTS.has(requestUrl.hostname);

  // Serve app shell for navigation requests
  if (isNavigation && isSameOrigin) {
    event.respondWith(
      caches.match('/index.html').then((cached) => cached || fetch(event.request).catch(() => caches.match('/index.html')))
    );
    return;
  }

  // Handle same-origin assets (stale-while-revalidate)
  if (isSameOrigin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
          }
          return networkResponse;
        }).catch(() => null);
        return cached || networkFetch;
      })
    );
    return;
  }

  // Cross-origin tiles / CDNs - cache with limits
  if (isAllowedCrossOrigin) {
    event.respondWith(
      caches.open(TILES_CACHE).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(event.request).then((networkResponse) => {
            // store opaque responses too
            try { cache.put(event.request, networkResponse.clone()); } catch (e) { /* ignore cache failures */ }
            trimCache(TILES_CACHE, MAX_TILE_ENTRIES).catch(() => {});
            return networkResponse;
          }).catch(() => new Response('', { status: 503, statusText: 'Service Unavailable' }));
        });
      })
    );
    return;
  }

  // Default: fall back to network
});