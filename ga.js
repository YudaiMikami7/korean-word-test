/* GA4 計測ローダー（全ページ共通）
 * GA_ID に測定ID (G-XXXXXXXXXX) を設定すると計測が始まる。空なら何もしない。
 * イベント送信は window.track(name, params) を使う（未設定時は無害なno-op）。 */
window.GA_ID = "G-5BG06XSKB4";
(function () {
  if (!window.GA_ID) return;
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + window.GA_ID;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag("js", new Date());
  gtag("config", window.GA_ID);
})();
window.track = function (name, params) {
  try { if (window.GA_ID && window.gtag) gtag("event", name, params || {}); } catch (e) {}
};
