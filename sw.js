const CACHE_NAME = 'trees-pinyin-v22-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './icon.png',
  'https://cdn.jsdelivr.net/npm/pinyin-pro@3.19.6/dist/index.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
];

// 安装阶段：预缓存核心静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 激活阶段：清理旧缓存
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

// 拦截请求：优先从缓存读取，确保离线也能秒开；AI 与翻譯等动态 API 走网络直连
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // 对于外部 API、AI 接口或翻译请求，直接走网络，绝不缓存，确保 V22 实时速度
  if (url.origin !== location.origin || url.pathname.includes('/openai') || url.pathname.includes('translate') || url.pathname.includes('googleapis')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 本地静态资源采用 Cache-First 策略
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).then((fetchResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, fetchResponse.clone());
          return fetchResponse;
        });
      });
    }).catch(() => {
      // 离线兜底
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});
