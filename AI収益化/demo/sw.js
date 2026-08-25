// いまから何する等 6サービス共通の Service Worker
// 1ファイル完結のHTMLをキャッシュし、オフラインでも動くようにする
const CACHE = 'sq-apps-v1';
const ASSETS = [
  './買う前チェック.html',
  './買わなくていい物レーダー.html',
  './いまから何する.html',
  './今日だけ安い.html',
  './ソロマップ.html',
  './無料品レーダー.html',
  './index.html',
  '../legal.html'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
