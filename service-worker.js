// IMPORTANT:
// This service worker must be scope-aware (GitHub Pages uses a subpath)
// and must not permanently serve a cached index.html, otherwise new builds
// (and fixes like Cesium changes) will never load.
const CACHE_NAME = 'flight-tools-cache-v2';
const TILES_CACHE = 'flight-tools-tiles-v2';

const scopeUrl = (path) => new URL(path, self.registration.scope).toString();

// Cache the app shell relative to the SW scope.
const OFFLINE_URLS = [
  scopeUrl('./'),
  scopeUrl('./index.html'),
  scopeUrl('./manifest.json'),
  scopeUrl('./favicon.ico'),
  scopeUrl('./logo192.png'),
  scopeUrl('./logo512.png')
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

async function precacheAssetsFromHtml(htmlText) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const matches = [...htmlText.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(m => m[1]);
    const assetUrls = matches
      .filter(u => typeof u === 'string')
      .filter(u => u.includes('/assets/') && (u.endsWith('.js') || u.endsWith('.css')))
      .map(u => new URL(u, self.location.origin).toString());
    await Promise.all(assetUrls.map(u => cache.add(u).catch(() => {})));
  } catch (_) {
    // ignore
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

  // Navigation requests: network-first, fallback to cached shell.
  // This prevents "stuck" deployments where index.html never updates.
  if (isNavigation && isSameOrigin) {
    const shellUrl = scopeUrl('./index.html');
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            // Cache the navigation response (usually index.html under the scope)
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
            // Also cache referenced hashed assets so offline reload works after first online visit
            networkResponse.clone().text().then(precacheAssetsFromHtml).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match(shellUrl))
        )
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
        return cached || networkFetch || new Response('', { status: 504, statusText: 'Offline' });
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