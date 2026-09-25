// 最小限のService Worker。静的アセットのみキャッシュし、
// ダッシュボード等の動的ページは常にネットワークから取得する（進捗の古い表示を防ぐ）。
const CACHE = 'ai-bijika-static-v2';
const STATIC_ASSETS = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
  }
  // それ以外（ログイン・ダッシュボード・APIなど）はキャッシュせず、通常通りネットワークへ。
});
