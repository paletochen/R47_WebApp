const CACHE_NAME = 'r47-calc-v1';
const ASSETS = [
    '/R47_WebApp/',
    '/R47_WebApp/index.html',
    '/R47_WebApp/style.css',
    '/R47_WebApp/app.js',
    '/R47_WebApp/favicon.png',
    '/R47_WebApp/wasm/r47.js',
    '/R47_WebApp/wasm/r47.wasm',
    '/R47_WebApp/fonts/C47__StandardFont.ttf',
    '/R47_WebApp/fonts/C47__NumericFont.ttf',
    '/R47_WebApp/fonts/C47__TinyFont.ttf'
];

// Install Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching Assets');
                return cache.addAll(ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('Service Worker: Clearing Old Cache');
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});

// Fetch Events
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});
