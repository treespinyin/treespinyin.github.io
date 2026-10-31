const CACHE_NAME = 'treespinyin-app-v3';
const ASSETS = [
  './app',
  './app.html',
  'https://cdn.jsdelivr.net/npm/pinyin-pro@3.19.6/dist/index.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
