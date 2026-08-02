/* k-tango 2026-08-01 00:52 のメール指示ぶんのスモークテスト
 * 「最近学んだ単語の表示は黄色カードに重ねていいので、縦幅マックスになる感じ」
 * 使い方: node smoke.mail0801b.test.js
 * 検証:
 *  ① 黄色カードが帯の高さいっぱい（縦幅マックス）になっている
 *  ② 見出し「最近学んだ単語」はカードに重なり、かつカードより前面にある（読める）
 *  ③ カードは帯からはみ出さず、縦長・黄色グラデーションのまま（既存の見た目は維持）
 *  ④ 学習履歴ゼロの初回は「おすすめの単語」見出しでも同じ縦幅
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond, note) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${note ? ' (' + note + ')' : ''}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 602, height: 1178 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kwt_coach_v1', '1');
    localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now()));
    localStorage.setItem('kwt_firstdone_v1', '1');
  });
  await page.reload();
  await page.waitForTimeout(1500);

  // ================= ④ 学習履歴ゼロ（おすすめの単語）でも縦幅マックス =================
  const reco = await page.evaluate(() => {
    const b = document.getElementById('today-band');
    const card = b.querySelector('.tb-card');
    const br = b.getBoundingClientRect(), r = card.getBoundingClientRect();
    return { label: b.querySelector('.tb-label').textContent, ratio: r.height / br.height };
  });
  check(`初回は「おすすめの単語」見出し (${reco.label})`, reco.label === 'おすすめの単語');
  check(`初回のカードも縦幅マックス (帯の${Math.round(reco.ratio * 100)}%)`, reco.ratio >= 0.95);

  // ================= 最近学んだ単語を12語つくる =================
  await page.evaluate(() => {
    const ids = LEVEL_SECTIONS.beginner[curSection].slice(0, 12), s = {}, c = {};
    ids.forEach((id, i) => {
      s[id] = { hasSeen: true, hasEverCorrect: true, memoryScore: 60, stabilityHours: 20, wordDifficulty: 1,
                reviewCount: 2, lastAnsweredAt: new Date(Date.now() - i * 60000).toISOString(), firstCorrectAt: new Date().toISOString() };
      c[id] = 3;
    });
    localStorage.setItem('kwt_stats_v1', JSON.stringify(s));
    localStorage.setItem('kwt_cards_v1', JSON.stringify(c));
    buildTodayBand();
  });
  await page.waitForTimeout(900);

  const band = await page.evaluate(() => {
    const b = document.getElementById('today-band');
    const clip = b.querySelector('.tb-clip'), card = b.querySelector('.tb-card'), lab = b.querySelector('.tb-label');
    const br = b.getBoundingClientRect(), cr = clip.getBoundingClientRect();
    const r = card.getBoundingClientRect(), lr = lab.getBoundingClientRect();
    const img = card.querySelector('.tb-img'), ir = img ? img.getBoundingClientRect() : null;
    // 見出しの真ん中の点に何があるか＝カードより前面に出ているか
    // （見出しは pointer-events:none なので、判定の間だけ拾えるようにして重ね順だけを見る）
    const pe = lab.style.pointerEvents; lab.style.pointerEvents = 'auto';
    const hit = document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2);
    lab.style.pointerEvents = pe;
    return {
      label: lab.textContent,
      bandH: br.height, clipH: cr.height, cardW: r.width, cardH: r.height,
      clipTop: cr.top - br.top, cardTop: r.top - br.top, cardBottom: br.bottom - r.bottom,
      overlapsLabel: r.top < lr.bottom - 1,
      labelInFront: !!hit && (hit === lab || lab.contains(hit)),
      labelBg: getComputedStyle(lab).backgroundColor,
      labelZ: getComputedStyle(lab).zIndex,
      popsOutTop: r.top < br.top - 1, popsOutBottom: r.bottom > br.bottom + 1,
      imgPopsOut: ir ? (ir.top < r.top - 1 || ir.bottom > r.bottom + 1) : false,
      bg: getComputedStyle(card).backgroundImage,
      clipOverflow: getComputedStyle(clip).overflow
    };
  });

  // ① 縦幅マックス
  check(`見出しは「最近学んだ単語」 (${band.label})`, band.label === '最近学んだ単語');
  check(`カードの器が帯の高さいっぱい (帯${Math.round(band.bandH)}px / 器${Math.round(band.clipH)}px)`,
    Math.abs(band.clipH - band.bandH) <= 1);
  check(`器が帯の最上部から始まる (上端から${Math.round(band.clipTop)}px)`, Math.abs(band.clipTop) <= 1);
  check(`カードが帯の高さの95%以上 (${Math.round(band.cardH)}px / ${Math.round(band.bandH)}px)`,
    band.cardH / band.bandH >= 0.95);
  check(`以前の136pxより明確に高い (${Math.round(band.cardH)}px)`, band.cardH >= 160);
  check(`カードの上端が帯の上端付近まで来ている (${Math.round(band.cardTop)}px)`, band.cardTop <= 5);

  // ② 見出しをカードに重ねる
  check('カードが見出しに重なっている（重ねてよい仕様）', band.overlapsLabel);
  check('見出しはカードより前面にある（隠れていない）', band.labelInFront);
  check(`見出しに読みやすさ用の座布団がある (${band.labelBg})`, /rgba?\(255, 255, 255/.test(band.labelBg));
  check(`見出しの重ね順が指定されている (z-index:${band.labelZ})`, parseInt(band.labelZ, 10) >= 1);

  // ③ 既存の見た目は維持
  check(`カードは縦長のまま (${Math.round(band.cardW)}×${Math.round(band.cardH)})`, band.cardH > band.cardW);
  check('カードが帯から上下にはみ出していない', !band.popsOutTop && !band.popsOutBottom);
  check('絵がカードから飛び出していない', !band.imgPopsOut);
  check('黄色いグラデーションのまま', band.bg === 'linear-gradient(160deg, rgb(255, 255, 255), rgb(255, 233, 194))');
  check(`器で切り抜いている (${band.clipOverflow})`, band.clipOverflow === 'hidden');

  // 流れても高さは変わらない（アニメーション中の実測）
  await page.waitForTimeout(1200);
  const moving = await page.evaluate(() => {
    const b = document.getElementById('today-band');
    const cards = [...b.querySelectorAll('.tb-card')].slice(0, 6).map(c => c.getBoundingClientRect());
    const br = b.getBoundingClientRect();
    return { same: cards.every(r => Math.abs(r.height - cards[0].height) < 1),
             inside: cards.every(r => r.top >= br.top - 1 && r.bottom <= br.bottom + 1),
             h: cards[0].height };
  });
  check(`流れているカードもすべて同じ高さ (${Math.round(moving.h)}px)`, moving.same);
  check('流れているカードも帯の中に収まっている', moving.inside);

  // タップして単語詳細が開く（重ね順を変えても操作は生きている）
  await page.evaluate(() => { document.querySelectorAll('.pbub,.stepnote,.cardget,.lvup,.streak-cel,.fcust').forEach(o => o.remove()); });
  await page.evaluate(() => { document.querySelector('#today-band .tb-card').click(); });
  await page.waitForTimeout(700);
  // 単語詳細はホームの真ん中に入る方式になった（メール指示 2026-08-02）
  const opened = await page.evaluate(() => !!document.getElementById('wd-center') && document.getElementById('s-home').classList.contains('on'));
  check('カードをタップすると単語詳細が開く（重ねても押せる）', opened);

  check(`コンソールエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log('FAILED: ' + failed.map(r => r.name).join(' / ')); process.exit(1); }
})();
