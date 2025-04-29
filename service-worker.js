const cacheName = 'pomodoro-v1';
const staticAssets = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json',
    '/images/icon-192x192.png', // Ensure you have these icons
    '/images/icon-512x512.png'  // in an 'images' folder
];

self.addEventListener('install', async event => {
    const cache = await caches.open(cacheName);
    await cache.addAll(staticAssets);
});

self.addEventListener('fetch', event => {
    event.respondWith(caches.match(event.request)
        .then(response => {
            return response || fetch(event.request);
        })
    );
});

self.addEventListener('activate', async () => {
    const cachesKeys = await caches.keys();
    const cacheCheck = cachesKeys.map(key => {
        if (key !== cacheName) {
            return caches.delete(key);
        }
    });
    await Promise.all(cacheCheck);
});