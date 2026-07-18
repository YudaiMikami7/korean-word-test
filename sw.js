/* k-tango Service Worker
 * 画像（webp/png/svg）＝キャッシュ優先（オフライン学習・帯スクロールの読み込み遅延解消）
 * HTML/JSなど＝ネットワーク優先・失敗時キャッシュ（更新の即時反映を最優先）
 */
const CACHE = "ktango-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const isImage = /\.(webp|png|svg|jpg|ico)$/.test(url.pathname);
  if (isImage) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
        return res;
      }))
    );
  } else {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
