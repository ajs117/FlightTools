const CACHE_NAME = 'flight-tools-cache-v1';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/static/js/main.chunk.js',
  '/static/css/main.chunk.css',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png'
];

// Install event - cache all offline URLs
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_URLS);
    })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );
  // Claim any clients that might be controlled by other service workers
  self.clients.claim();
});

// Fetch event - implement offline-first strategy with cross-origin tile and Cesium asset caching
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  const ALLOWED_CROSS_ORIGIN_HOSTS = [
    'basemaps.cartocdn.com',
    'tile.openstreetmap.org',
    'a.basemaps.cartocdn.com',
    'b.basemaps.cartocdn.com',
    'c.basemaps.cartocdn.com',
    'd.basemaps.cartocdn.com',
    // Cesium CDN
    'cdn.jsdelivr.net',
    'unpkg.com'
  ];

  const isSameOrigin = url.origin === self.location.origin;
  const isAllowedCrossOrigin = ALLOWED_CROSS_ORIGIN_HOSTS.includes(url.hostname);

  if (!isSameOrigin && !isAllowedCrossOrigin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          // Cache the network response (including opaque responses)
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => {
          if (isSameOrigin) {
            if (url.pathname === '/' || url.pathname.includes('inflight')) {
              return caches.match('/index.html');
            }
          }
          return new Response('Offline content not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
    })
  );
});