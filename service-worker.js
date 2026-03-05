const cacheName = 'tetris-pwa-v5';

// Cacha SOLO l'icona (non cambia mai)
const filesToCache = [
    '/tetris-webapp/icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(cacheName).then((cache) => cache.addAll(filesToCache))
    );
    self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Per HTML, CSS, JS: sempre rete (mai cache)
    if (url.pathname.endsWith('.html') ||
        url.pathname.endsWith('.css')  ||
        url.pathname.endsWith('.js')   ||
        url.pathname.endsWith('.json')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Per tutto il resto (icona, ecc): cache first
    event.respondWith(
        caches.match(event.request).then((response) => response || fetch(event.request))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== cacheName).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});