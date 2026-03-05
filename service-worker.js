const cacheName = 'tetris-pwa-v3';
const filesToCache = [
    '/tetris-webapp/',
    '/tetris-webapp/index.html',
    '/tetris-webapp/style.css',
    '/tetris-webapp/script.js',
    '/tetris-webapp/manifest.json',
    '/tetris-webapp/icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(cacheName).then((cache) => cache.addAll(filesToCache))
    );
    self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
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