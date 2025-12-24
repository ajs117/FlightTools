/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */
// Custom service worker used with `vite-plugin-pwa` (injectManifest)
// This file will be processed and the precache manifest injected as `__WB_MANIFEST`.

import { precacheAndRoute } from 'workbox-precaching';

// Precache assets injected at build time. `vite-plugin-pwa` (workbox) will replace
// the literal `self.__WB_MANIFEST` in this file with the generated manifest.
declare const self: ServiceWorkerGlobalScope & typeof globalThis & { __WB_MANIFEST?: any[] };

// Precache assets injected at build time
precacheAndRoute((self as any).__WB_MANIFEST || []);

const CACHE_NAME = 'flight-tools-cache-vp2';
const TILES_CACHE = 'flight-tools-tiles-vp2';

const scopeUrl = (path: string) => new URL(path, self.registration.scope).toString();

const OFFLINE_URLS = [
  scopeUrl('./'),
  scopeUrl('./index.html'),
  scopeUrl('./manifest.json'),
];

const ALLOWED_CROSS_ORIGIN_HOSTS = new Set([
  'basemaps.cartocdn.com',
  'tile.openstreetmap.org',
  'a.basemaps.cartocdn.com',
  'b.basemaps.cartocdn.com',
  'c.basemaps.cartocdn.com',
  'd.basemaps.cartocdn.com',
  'basemap.nationalmap.gov',
  'cdn.jsdelivr.net',
  'unpkg.com',
]);

const MAX_TILE_ENTRIES = 500;

async function trimCache(cacheName: string, maxEntries: number) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    const remove = keys.slice(0, keys.length - maxEntries);
    await Promise.all(remove.map(r => cache.delete(r)));
  }
}

function fetchWithTimeout(request: Request, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

// On install, ensure basic offline shell is present (precacheAndRoute handled other assets)
self.addEventListener('install', (evt: ExtendableEvent) => {
  evt.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(OFFLINE_URLS).catch(() => {});
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name !== CACHE_NAME && name !== TILES_CACHE)
        .map((name) => caches.delete(name))
    );
  })());
  self.clients.claim();
});

self.addEventListener('fetch', (event: FetchEvent) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isNavigation = event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html');
  const isAllowedCrossOrigin = ALLOWED_CROSS_ORIGIN_HOSTS.has(requestUrl.hostname);

  // Navigation: network-first, fallback to precached index
  if (isNavigation && isSameOrigin) {
    const shellUrl = scopeUrl('./index.html');
    event.respondWith((async () => {
      try {
        const net = await fetchWithTimeout(event.request, 1500);
        if (net && net.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, net.clone()).catch(() => {});
        }
        return net;
      } catch (e) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        const shellCached = await caches.match(shellUrl);
        if (shellCached) return shellCached;
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Same-origin assets: stale-while-revalidate but prefer cache first to ensure startup
  if (isSameOrigin) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      try {
        const net = await fetch(event.request);
        if (net && net.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, net.clone()).catch(() => {});
        }
        return net;
      } catch (e) {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Cross-origin tiles / CDNs - cache with limits
  if (isAllowedCrossOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(TILES_CACHE);
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) return cachedResponse;
      try {
        const net = await fetchWithTimeout(event.request, 3000);
        try { await cache.put(event.request, net.clone()); } catch (e) { /* ignore */ }
        trimCache(TILES_CACHE, MAX_TILE_ENTRIES).catch(() => {});
        return net;
      } catch (e) {
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      }
    })());
    return;
  }

  // Default: network, fallback to 504
});
