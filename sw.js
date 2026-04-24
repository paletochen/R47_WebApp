// R47 Web service worker — offline-first caching of the static bundle.
// The bundle gets rebuilt on every deploy; cache key is version-stamped.
//
// Two strategies:
//
//   1. Main calc assets (CORE, /, /index.html, /shell.js, c47-web.*,
//      fonts, skin) — CACHE-FIRST.  These are stable across deploys
//      within the same VERSION and we want fast boot + offline.
//
//   2. Explorer assets (/r47_calculator_explorer/**) — NETWORK-FIRST
//      with cache fallback.  They change frequently during dev and we
//      want fresh edits to land immediately when online, but still
//      work offline via the last-seen cache.  The rejig.wasm bundle
//      (9+ MB) and the editor.bundle.js (350 KB) land in the cache
//      after the first successful fetch, so the second offline load
//      has them.
//
// VERSION is stamped by tools/assemble-web.sh from WEB_VERSION in shell.js
// (e.g. WEB_VERSION '1.82' → VERSION 'r47-v182'). The value below is only
// used when serving source directly without a build step (local dev).
const VERSION = 'r47-dev';

// Pre-cached on install.  Fonts + main-calc shell.
const CORE = [
  './',
  'index.html',
  'main.css',
  'shell.js',
  'wasm/c47-web-r47.js',
  'wasm/c47-web-r47.wasm',
  'wasm/c47-web-r47.data',
  'manifest.webmanifest',
  'static/skin/R47.png',
  'static/fonts/C47__StandardFont.ttf',
  'static/fonts/C47__NumericFont.ttf',
];

// Explorer assets that are small + critical (pre-cached on install
// so the Explorer loads fast offline).  Large WASM modules are
// cache-on-fetch (see below) to keep the install step cheap.
const EXPLORER_PRECACHE = [];

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const reload = (list) => list.map(u => new Request(u, { cache: 'reload' }));
    await Promise.all([
      cache.addAll(reload(CORE)).catch(e => console.warn('CORE precache miss:', e)),
    ]);
  })());
  self.skipWaiting();
});


self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== VERSION).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function cacheFirst(req, url) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh.ok && url.origin === self.location.origin) {
      const cache = await caches.open(VERSION);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (e) {
    return cached || Response.error();
  }
}

async function networkFirst(req, url) {
  try {
    const fresh = await fetch(req);
    if (fresh.ok && url.origin === self.location.origin) {
      const cache = await caches.open(VERSION);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (e) {
    const cached = await caches.match(req);
    return cached || Response.error();
  }
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin && url.pathname.startsWith('/r47_calculator_explorer/')) {
    ev.respondWith(networkFirst(req, url));
    return;
  }

  ev.respondWith(cacheFirst(req, url));
});
