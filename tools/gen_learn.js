/* learn/ 配下の静的単語帳ページ + sitemap.xml を生成する
   実行: node tools/gen_learn.js （リポジトリルートで）
   データ源: words-beginner.js / words-middle.js / index.html内のWORDS（中級ROOM01） */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SITE = "https://k-tango.com";

/* ---------- データ読み込み ---------- */
function loadArray(file, constName) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const m = src.match(new RegExp("const " + constName + "=(\\[[\\s\\S]*?\\n\\]);"));
  if (!m) throw new Error(constName + " not found in " + file);
  return eval(m[1]);
}
const BEGINNER = loadArray("words-beginner.js", "BEGINNER_WORDS");
const MIDDLE = loadArray("words-middle.js", "MIDDLE_WORDS");
const LEGACY = loadArray("index.html", "WORDS"); // 中級ROOM01の100語

/* ---------- ハングル→カナ（発音の目安） ---------- */
const INI = ["k","kk","n","t","tt","r","m","p","pp","s","ss","","ch","jj","ch2","k","t","p","h"];
// 頭子音の行: [ア段,イ段,ウ段,エ段,オ段]
const ROW = {
  k:  ["カ","キ","ク","ケ","コ"],  g:  ["ガ","ギ","グ","ゲ","ゴ"],
  n:  ["ナ","ニ","ヌ","ネ","ノ"],
  t:  ["タ","ティ","トゥ","テ","ト"], d: ["ダ","ディ","ドゥ","デ","ド"],
  r:  ["ラ","リ","ル","レ","ロ"],
  m:  ["マ","ミ","ム","メ","モ"],
  p:  ["パ","ピ","プ","ペ","ポ"], b: ["バ","ビ","ブ","ベ","ボ"],
  s:  ["サ","シ","ス","セ","ソ"],
  ch: ["チャ","チ","チュ","チェ","チョ"], j: ["ジャ","ジ","ジュ","ジェ","ジョ"],
  h:  ["ハ","ヒ","フ","ヘ","ホ"],
  "": ["ア","イ","ウ","エ","オ"]
};
// 母音21種: [段(0-4) or 特殊処理キー]
const VOW = ["a","e2","ya","ye","o2","e2","yo2","ye","o","wa","we","we","yo","u","wo","we","wi","yu","u2","wi","i"];
// 終声0..27: なし ㄱ ㄲ ㄳ ㄴ ㄵ ㄶ ㄷ ㄹ ㄺ ㄻ ㄼ ㄽ ㄾ ㄿ ㅀ ㅁ ㅂ ㅄ ㅅ ㅆ ㅇ ㅈ ㅊ ㅋ ㅌ ㅍ ㅎ
const FIN = ["","ク","ク","ク","ン","ン","ン","ッ","ル","ク","ム","ル","ル","ル","プ","ル","ム","プ","プ","ッ","ッ","ン","ッ","ッ","ク","ッ","プ","ッ"];
function kanaSyllable(iniIdx, vowIdx, voiced) {
  let c = INI[iniIdx];
  if (c === "kk") c = "k"; else if (c === "tt") c = "t"; else if (c === "pp") c = "p";
  else if (c === "ss") c = "s"; else if (c === "jj" || c === "ch2") c = "ch";
  if (voiced) { if (c === "k") c = "g"; else if (c === "t") c = "d"; else if (c === "p") c = "b"; else if (c === "ch") c = "j"; }
  const row = ROW[c] || ROW[""];
  const v = VOW[vowIdx];
  const deg = { a: 0, i: 1, u: 2, e: 3, o: 4 };
  if (deg[v] !== undefined) return row[deg[v]];
  if (v === "e2") return row[3];          // ㅐ/ㅔ
  if (v === "o2") return row[4];          // ㅓ
  if (v === "u2") return row[2];          // ㅡ
  if (v === "ya") return c === "" ? "ヤ" : (c === "ch" || c === "j") ? row[0] : row[1] + "ャ";
  if (v === "yu") return c === "" ? "ユ" : (c === "ch" || c === "j") ? row[2] : row[1] + "ュ";
  if (v === "yo" || v === "yo2") return c === "" ? "ヨ" : (c === "ch" || c === "j") ? row[4] : row[1] + "ョ";
  if (v === "ye") return c === "" ? "イェ" : row[1] + "ェ";
  if (v === "wa") return c === "" ? "ワ" : row[2] + "ァ";
  if (v === "wo") return c === "" ? "ウォ" : row[2] + "ォ";
  if (v === "we") return c === "" ? "ウェ" : row[2] + "ェ";
  if (v === "wi") return c === "" ? "ウィ" : row[2] + "ィ";
  return row[0];
}
function toKana(ko) {
  let out = "", prevFin = -1;
  for (const ch of ko) {
    const code = ch.codePointAt(0);
    if (code < 0xac00 || code > 0xd7a3) { out += ch; prevFin = -1; continue; }
    const s = code - 0xac00;
    const ini = Math.floor(s / 588), vow = Math.floor((s % 588) / 28), fin = s % 28;
    const plain = ini === 0 || ini === 3 || ini === 7 || ini === 12; // ㄱㄷㅂㅈ
    // 直前音節が母音終わり・ㄴㄹㅁㅇ終わりなら平音は濁って聞こえる（発音の目安）
    const voiced = plain && prevFin >= 0 && (prevFin === 0 || [4, 8, 16, 21].includes(prevFin));
    out += kanaSyllable(ini, vow, voiced) + FIN[fin];
    prevFin = fin;
  }
  return out;
}

/* ---------- ページ定義 ---------- */
const rooms = [];
for (let s = 1; s <= 17; s++) {
  rooms.push({ level: "初級", lv: "beginner", n: s, words: BEGINNER.filter(w => w.sec === s) });
}
rooms.push({ level: "中級", lv: "middle", n: 1, words: LEGACY });
for (let s = 2; s <= 27; s++) {
  rooms.push({ level: "中級", lv: "middle", n: s, words: MIDDLE.filter(w => w.sec === s) });
}
const nn = n => String(n).padStart(2, "0");
// Cloudflare Pagesは .html を除去したURLへ308リダイレクトするため、リンク/canonicalは拡張子なしで統一
rooms.forEach(r => { r.file = `${r.lv}-${nn(r.n)}.html`; r.slug = `${r.lv}-${nn(r.n)}`; r.title = `${r.level}ROOM${nn(r.n)}`; });

function stats(words) {
  const suru = words.filter(w => w.ko.endsWith("하다")).length;
  const yougen = words.filter(w => w.ko.endsWith("다") && !w.ko.endsWith("하다")).length;
  return { total: words.length, suru, yougen, other: words.length - suru - yougen };
}
const HINTS = [
  "まずは一覧をざっと眺めて「見たことがある単語」と「初めて見る単語」を分けるところから始めましょう。知らない単語だけに絞って覚えると効率が上がります。",
  "韓国語の単語は「漢字語」が多く、日本語の音読みと似た響きを持つものがたくさんあります。読みガイドを声に出して読み、日本語との音の対応を探してみてください。",
  "「〜하다」で終わる単語は名詞に하다（する）が付いた動詞です。하다を外した名詞部分とセットで覚えると、1語で2語分の語彙になります。",
  "一度にすべて覚える必要はありません。10語ずつ区切って「読む→隠して思い出す→答え合わせ」を繰り返すと定着しやすくなります。",
  "覚えたと思った単語も、翌日・3日後・1週間後に見直すと記憶が長持ちします。k-tangoアプリの忘却曲線機能なら、この復習タイミングを自動で提案します。"
];

const css = `
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;background:#E3A38D;color:#1f1a17;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;line-height:1.85;-webkit-text-size-adjust:100%}
  .wrap{max-width:820px;margin:0 auto;padding:28px 18px 64px}
  header.site{display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}
  header.site a{color:#fff;font-weight:800;text-decoration:none;font-size:15px}
  header.site span{color:#fff;opacity:.7;font-size:13px}
  .card{background:#fff;border-radius:16px;padding:26px 22px;box-shadow:0 6px 20px rgba(0,0,0,.12)}
  h1{font-size:24px;margin:0 0 6px;line-height:1.4}
  .lead{color:#6b5f58;font-size:15px;margin-bottom:16px}
  h2{font-size:19px;margin:30px 0 10px;padding-left:11px;border-left:5px solid #E0831A}
  p,li{font-size:15px}
  table{border-collapse:collapse;width:100%;font-size:15px}
  th,td{border-bottom:1px solid #eee2d8;padding:8px 8px;text-align:left;vertical-align:top}
  th{background:#FFF4E6;font-size:13.5px;white-space:nowrap}
  td.ko{font-weight:800;font-size:16.5px;white-space:nowrap}
  td.kana{color:#a3541b;font-size:13px;white-space:nowrap}
  td.num{color:#b9a99d;font-size:12.5px}
  .note{background:#FFF4E6;border:1px solid #F2D9B3;border-radius:12px;padding:12px 14px;font-size:13.5px;color:#6b5f58;margin:14px 0}
  .cta{display:inline-block;margin:10px 0 4px;background:#1f1a17;color:#fff;text-decoration:none;font-weight:800;font-size:16px;padding:13px 24px;border-radius:999px}
  a{color:#C25A00}
  nav.pn{display:flex;justify-content:space-between;gap:10px;margin-top:26px;font-weight:700;font-size:14.5px}
  footer.nav{margin-top:28px;text-align:center;font-size:14px;line-height:2.2}
  footer.nav a{color:#fff;font-weight:700;margin:0 10px;text-decoration:none}
  .roomlist{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0;list-style:none;margin:8px 0}
  .roomlist li{background:#FFF4E6;border:1px solid #F2D9B3;border-radius:12px}
  .roomlist a{display:block;padding:11px 13px;text-decoration:none;font-weight:700;font-size:14.5px}
  .roomlist span{display:block;font-weight:400;font-size:12.5px;color:#6b5f58}
  @media(max-width:560px){.roomlist{grid-template-columns:1fr}.wrap{padding:20px 10px 56px}.card{padding:20px 12px}}
`;
const footerNav = `<footer class="nav">
  <a href="../">アプリトップ</a><a href="./">単語帳一覧</a><a href="../about.html">このアプリについて</a><a href="../privacy.html">プライバシーポリシー</a>
</footer>`;

function pageHTML({ title, desc, url, body, breadcrumbs }) {
  const bc = JSON.stringify({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b[0], item: SITE + b[1] }))
  });
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/ogp.png">
<link rel="canonical" href="${url}">
<script type="application/ld+json">${bc}</script>
<style>${css}</style>
</head>
<body>
<div class="wrap">
${body}
${footerNav}
</div>
</body>
</html>`;
}

/* ---------- 各ROOMページ ---------- */
const outDir = path.join(ROOT, "learn");
fs.mkdirSync(outDir, { recursive: true });

rooms.forEach((r, i) => {
  const st = stats(r.words);
  const sample = [r.words[0], r.words[Math.floor(r.words.length / 3)], r.words[Math.floor(r.words.length * 2 / 3)]].filter(Boolean);
  const sampleTxt = sample.map(w => `「${w.ko}（${w.ja.split("、")[0]}）」`).join("、");
  const levelDesc = r.level === "初級"
    ? "TOPIK（韓国語能力試験）I（1〜2級）レベルで出題される基礎語彙"
    : "TOPIK（韓国語能力試験）II（3〜4級）レベルで頻出する中級語彙";
  const title = `韓国語${r.level}単語一覧 ${r.title}（全${st.total}語・カナ読み付き）| k-tango単語帳`;
  const desc = `${levelDesc}のうち${r.title}に収録された${st.total}語を、カナ読みガイド・日本語訳付きで一覧掲載。${sampleTxt.replace(/「|」/g, "").slice(0, 60)}などを収録。無料の単語テストアプリk-tangoと連動。`;
  const url = `${SITE}/learn/${r.slug}`;
  const prev = rooms[i - 1], next = rooms[i + 1];
  const rows = r.words.map((w, j) =>
    `<tr><td class="num">${j + 1}</td><td class="ko" lang="ko">${w.ko}</td><td class="kana">${toKana(w.ko)}</td><td>${w.ja}</td></tr>`).join("\n");
  const body = `
<header class="site"><a href="../">k-tango</a><span>›</span><a href="./">単語帳一覧</a><span>›</span><span>${r.title}</span></header>
<div class="card">
  <h1>韓国語${r.level}単語一覧 ${r.title}<br><small style="font-size:15px;color:#6b5f58;font-weight:400">全${st.total}語・カナ読みガイド付き</small></h1>
  <p class="lead">${levelDesc}から、${r.title}に収録されている${st.total}語をまとめました。${sampleTxt}など、日常会話や試験対策に役立つ単語が並びます。</p>
  <p>内訳は、〜하다型の動詞が${st.suru}語、その他の動詞・形容詞（用言）が${st.yougen}語、名詞・副詞などが${st.other}語です。表の「読みガイド」はカタカナによる発音の目安で、実際の発音は連音化などで変わる場合があります。</p>
  <h2>学習のヒント</h2>
  <p>${HINTS[i % HINTS.length]}</p>
  <p><a class="cta" href="../">▶ この単語をアプリでテストする（無料）</a></p>
  <h2>${r.title} 単語リスト（${st.total}語）</h2>
  <table>
    <thead><tr><th>#</th><th>韓国語</th><th>読みガイド</th><th>意味（日本語）</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <div class="note">読みガイドはカタカナによる目安です。パッチム（終声）や連音化により、実際の発音とは異なる場合があります。正確な発音は音声付き辞書もあわせてご確認ください。</div>
  <nav class="pn">
    <span>${prev ? `<a href="${prev.slug}">← ${prev.title}</a>` : ""}</span>
    <span>${next ? `<a href="${next.slug}">${next.title} →</a>` : ""}</span>
  </nav>
</div>`;
  fs.writeFileSync(path.join(outDir, r.file), pageHTML({
    title, desc, url, body,
    breadcrumbs: [["k-tango", "/"], ["単語帳一覧", "/learn/"], [r.title, "/learn/" + r.slug]]
  }));
});

/* ---------- 一覧ページ ---------- */
const totalWords = rooms.reduce((a, r) => a + r.words.length, 0);
const begTotal = rooms.filter(r => r.lv === "beginner").reduce((a, r) => a + r.words.length, 0);
const midTotal = totalWords - begTotal;
function roomLi(r) {
  const st = stats(r.words);
  const ex = r.words.slice(0, 2).map(w => w.ko).join("・");
  return `<li><a href="${r.slug}">${r.title}（${st.total}語）<span>${ex} など</span></a></li>`;
}
const idxBody = `
<header class="site"><a href="../">k-tango</a><span>›</span><span>単語帳一覧</span></header>
<div class="card">
  <h1>韓国語単語帳一覧<br><small style="font-size:15px;color:#6b5f58;font-weight:400">TOPIK初級・中級 全${totalWords}語をカナ読み付きで無料公開</small></h1>
  <p class="lead">k-tangoに収録されている韓国語単語 全${totalWords}語（初級${begTotal}語・中級${midTotal}語）を、ROOMごとの一覧ページで公開しています。すべてのページにカタカナの読みガイドと日本語訳付き。ブックマークして単語帳としてご利用ください。</p>
  <p>収録語彙はTOPIK（韓国語能力試験）の公開語彙リストをもとにしています。初級はTOPIK I（1〜2級）、中級はTOPIK II（3〜4級）レベルに対応し、各ROOMは約100語ずつに区切られています。一覧で予習したあと、<a href="../">無料の単語テストアプリ</a>で四択・書き取りテストに挑戦すると効率よく定着します。</p>
  <h2>初級（TOPIK I）全${begTotal}語 — ROOM01〜17</h2>
  <p>あいさつ・数字・食べ物・家族など、韓国語学習の土台になる基礎語彙です。初めて韓国語を学ぶ方はROOM01から順に進めるのがおすすめです。</p>
  <ul class="roomlist">
${rooms.filter(r => r.lv === "beginner").map(roomLi).join("\n")}
  </ul>
  <h2>中級（TOPIK II）全${midTotal}語 — ROOM01〜27</h2>
  <p>ニュース・ビジネス・抽象的な話題にも対応できる中級語彙です。漢字語の割合が増えるため、日本語の音読みとの対応を意識すると覚えやすくなります。</p>
  <ul class="roomlist">
${rooms.filter(r => r.lv === "middle").map(roomLi).join("\n")}
  </ul>
  <h2>この単語帳の使い方</h2>
  <ol>
    <li><strong>一覧で予習</strong>：学びたいROOMのページを開き、単語と読みガイドをひととおり確認します。</li>
    <li><strong>アプリでテスト</strong>：<a href="../">k-tangoアプリ</a>で同じROOMを選び、12問テストに挑戦します。</li>
    <li><strong>忘却曲線で復習</strong>：アプリが記憶の定着度を推定し、忘れかけた単語の復習タイミングを自動で提案します。</li>
  </ol>
  <p><a class="cta" href="../">▶ 無料で単語テストを始める</a></p>
</div>`;
fs.writeFileSync(path.join(outDir, "index.html"), pageHTML({
  title: `韓国語単語帳一覧｜TOPIK初級・中級 全${totalWords}語（カナ読み付き・無料）| k-tango`,
  desc: `TOPIK初級${begTotal}語・中級${midTotal}語の韓国語単語を、カナ読みガイドと日本語訳付きで全ページ無料公開。ROOMごとの一覧で予習し、無料アプリk-tangoの四択・書き取りテストで定着させる韓国語学習サイトです。`,
  url: SITE + "/learn/",
  body: idxBody,
  breadcrumbs: [["k-tango", "/"], ["単語帳一覧", "/learn/"]]
}));

/* ---------- sitemap.xml ---------- */
const today = new Date().toISOString().slice(0, 10);
const urls = [
  ["/", "1.0"], ["/about", "0.7"], ["/privacy", "0.3"], ["/learn/", "0.9"],
  ...rooms.map(r => ["/learn/" + r.slug, "0.8"])
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, p]) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><priority>${p}</priority></url>`).join("\n")}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap);

console.log(`OK: ${rooms.length} room pages + learn/index.html + sitemap.xml (${totalWords} words)`);
