// sw.js — Service Worker
// Handles offline tile caching and PWA install.
// Cache strategy: OPFS-first for tiles, cache-first for app shell, network-first for config.

const APP_CACHE = 'local-maps-app-v36';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.css',
  '/js/config.js',
  '/js/map.js',
  '/js/gps.js',
  '/js/compass.js',
  '/js/offline.js',
  '/js/ui.js',
  '/assets/logo.webp',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/map-thumb-default.png',
];

const OPFS_SUPPORTED = !!(
  typeof navigator !== 'undefined' &&
  navigator.storage &&
  typeof navigator.storage.getDirectory === 'function'
);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(APP_CACHE).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== APP_CACHE && !k.startsWith('map-'))
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Tile serving ─────────────────────────────────────────────────────────────

// Serve a tile: OPFS first (durable), Cache Storage second (legacy), network fallback.
// Tile URL pattern: /file/local-maps/{uuid}/tiles/{z}/{x}/{y}{ext}
async function serveTile(request, uuid, z, x, y, ext) {
  const filename = `${z}-${x}-${y}${ext}`;

  // 1. OPFS — durable across cache clears
  if (OPFS_SUPPORTED) {
    try {
      const root = await navigator.storage.getDirectory();
      const dir  = await root.getDirectoryHandle(`map-${uuid}`);
      const fh   = await dir.getFileHandle(filename);
      const file = await fh.getFile();
      return new Response(file, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    } catch { /* not in OPFS */ }
  }

  // 2. Cache Storage — legacy fallback for pre-OPFS saves
  const cached = await caches.match(request);
  if (cached) return cached;

  // 3. Network
  return fetch(request);
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Tile requests — match /file/local-maps/{uuid}/tiles/{z}/{x}/{y}{ext}
  const tileMatch = url.pathname.match(
    /\/file\/local-maps\/([^/]+)\/tiles\/(\d+)\/(\d+)\/(\d+)(\.\w+)?/
  );
  if (tileMatch) {
    const [, uuid, z, x, y, ext = '.png'] = tileMatch;
    e.respondWith(serveTile(e.request, uuid, z, x, y, ext));
    return;
  }

  // Config — network-first (may be updated)
  if (url.pathname.endsWith('config.json')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(APP_CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // App shell — cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
