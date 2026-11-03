const CACHE_NAME = 'trees-pinyin-v22-commercial-v4';
const ASSETS_TO_CACHE = [
  './',
  './app.html',
  './index.html',
  './icon.png',
  'https://cdn.jsdelivr.net/npm/pinyin-pro@3.19.6/dist/index.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(ASSETS_TO_CACHE.map(url => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // POST 請求（如 Cloudflare Worker AI 網關、Pollinations、OCR）直接走網路，絕不攔截或快取
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // 外部動態 API（翻譯、AI 網關、Google API）直接走網路直連
  if (
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('pollinations.ai') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('mymemory.translated.net') ||
    url.hostname.includes('ocr.space')
  ) {
    return;
  }

  // HTML 頁面採用 Network-First（優先拿最新版，離線時才讀快取，確保您更新 GitHub 後用戶立刻生效）
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((networkRes) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkRes.clone());
            return networkRes;
          });
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 靜態資源（icon.png、pinyin-pro、html2canvas）採用 Cache-First 極速秒開
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).then((fetchResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, fetchResponse.clone());
          return fetchResponse;
        });
      });
    })
  );
});
