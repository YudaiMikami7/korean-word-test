/* k-tango Service Worker
 * 画像（webp/png/svg）＝キャッシュ優先＋裏で更新(stale-while-revalidate)
 *   …従来はキャッシュ優先のみで、一度掴んだ画像が永久に更新されず、
 *     単語画像を作り直しても端末側に古い画像が残り続けていた
 * HTML/JSなど＝ネットワーク優先・失敗時キャッシュ（更新の即時反映を最優先）
 * ※ 画像を差し替えたら CACHE の版を上げること（古いキャッシュがactivateで破棄される）
 */
const CACHE = "ktango-v5";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 通知タップでアプリを前面に（既存タブがあれば再利用）
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    if (clients.openWindow) return clients.openWindow("/");
  }));
});
// 配信サーバからのWeb Pushを受け取る受け皿（VAPID+cronのバックエンドを足せば有効化）
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || "k-tango", {
    body: d.body || "復習どきの単語があります📚", icon: "images-thumb/0773.webp", data: d
  }));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const isImage = /\.(webp|png|svg|jpg|ico)$/.test(url.pathname);
  if (isImage) {
    // キャッシュがあれば即返し（表示は速いまま）、裏で取り直して次回から新しい画像になるようにする
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => {
          if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
          return res;
        }).catch(() => hit);
        if (hit) e.waitUntil(net); // 裏の更新が終わるまでSWを生かす
        return hit || net;
      })
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
