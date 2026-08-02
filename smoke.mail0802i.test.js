/* k-tango 2026-08-02 20:46 / 20:47 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0802i.test.js
 * 指示:
 *  1. ステータスバーの黒カプセルが文字より短くなってしまっている
 *  2. プレゼントアイコンは、左下に移動（今日の5問の縮まった丸アイコンの上の位置に）
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').split(path.sep).join('/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kwt_coach_v1', '1');
    localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now()));
    localStorage.setItem('kwt_firstdone_v1', '1');
    localStorage.setItem('kwt_roomhint_v1', '1');
  });
  await page.reload();
  await page.waitForTimeout(1500);
  const clearFx = () => page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.lvup,.fcust,.pbub,.stepnote,.tapavatar,.rest-ask,#resume-ask,.coach,.d5auto').forEach(o => o.remove()));
  await clearFx();
  // 上下に動く演出(bob)が入っていると座標がぶれるので、置き場所そのものを測るあいだは止める
  const stopBob = () => page.evaluate(() => document.querySelectorAll('.sg-gift').forEach(b => b.classList.remove('bob')));

  // 602px基準（デザイン座標）に戻して測る
  const box = sel => page.evaluate(s => {
    const e = document.querySelector(s); if (!e) return null;
    const r = e.getBoundingClientRect(), h = document.getElementById('homewrap').getBoundingClientRect();
    const k = h.width / 602;
    const cs = getComputedStyle(e);
    return { x: (r.left - h.left) / k, y: (r.top - h.top) / k, w: r.width / k, h: r.height / k,
             r: (r.right - h.left) / k, b: (r.bottom - h.top) / k,
             vis: cs.opacity !== '0' && cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 };
  }, sel);
  // 実際に描かれている文字の幅（Range計測＝要素の箱ではなく字面そのもの）
  const textBox = sel => page.evaluate(s => {
    const e = document.querySelector(s); if (!e) return null;
    const rg = document.createRange(); rg.selectNodeContents(e);
    const r = rg.getBoundingClientRect(), h = document.getElementById('homewrap').getBoundingClientRect();
    const k = h.width / 602;
    return { x: (r.left - h.left) / k, r: (r.right - h.left) / k, y: (r.top - h.top) / k, b: (r.bottom - h.top) / k };
  }, sel);
  const setVals = (xp, pwr) => page.evaluate(([a, b]) => {
    document.getElementById('hv-xpval').textContent = a;
    document.getElementById('hv-pwrval').textContent = b;
  }, [xp, pwr]);

  /* ============ 1. ステータスバーの黒カプセルが文字より短い ============ */
  const panel = await box('.status-panel');
  check('1-1 黒カプセル(.status-panel)が出ている', panel && panel.vis);
  check(`1-2 右端が460pxより伸びた (右端${panel && panel.r.toFixed(0)}px)`, panel && panel.r > 460);
  check(`1-3 左端・高さ・角丸は今までどおり (左${panel && panel.x.toFixed(0)} / 高${panel && panel.h.toFixed(0)})`,
    panel && Math.abs(panel.x - 140) < 1 && Math.abs(panel.h - 64) < 1);
  check('1-4 カプセル型の角丸のまま', await page.evaluate(() => {
    const e = document.querySelector('.status-panel');
    return parseFloat(getComputedStyle(e).borderTopLeftRadius) >= e.offsetHeight / 2 - 1;
  }));

  // いろいろな桁数で「字面がカプセルの内側に収まっているか」を確かめる
  const CASES = [
    ['0/100', '0.00%'],            // 初期値
    ['85/300', '12.34%'],          // ふつう
    ['1999/2000', '99.99%'],       // 4桁
    ['9999/10000', '100.00%']      // 想定しうる最大（Lv.100）
  ];
  for (const [xp, pwr] of CASES) {
    await setVals(xp, pwr);
    const tx = await textBox('#hv-xpval'), tp = await textBox('#hv-pwrval');
    const p = await box('.status-panel');
    check(`1-5 XP「${xp}」の字面がカプセルの中に収まる (字面右端${tx.r.toFixed(1)} ≦ カプセル右端${p.r.toFixed(0)})`,
      tx.r <= p.r - 8 && tx.x >= p.x);
    check(`1-6 PWR「${pwr}」の字面がカプセルの中に収まる (字面右端${tp.r.toFixed(1)} ≦ カプセル右端${p.r.toFixed(0)})`,
      tp.r <= p.r - 8 && tp.x >= p.x);
    check(`1-7 XP「${xp}」の字面がゲージに掛からない`, tx.x >= 375);
    check(`1-8 PWR「${pwr}」の字面がゲージに掛からない`, tp.x >= 375);
    check(`1-9 XP「${xp}」の字面が上下ともカプセルの中`, tx.y >= p.y && tx.b <= p.b);
  }
  // 2行の数値は右端がそろう（右揃え）
  await setVals('85/300', '100.00%');
  const tx2 = await textBox('#hv-xpval'), tp2 = await textBox('#hv-pwrval');
  check(`1-10 XPとPWRの数値は右端がそろう (${tx2.r.toFixed(1)} / ${tp2.r.toFixed(1)})`, Math.abs(tx2.r - tp2.r) < 1);

  // ヘッダーの他の部品と当たっていない
  const bSet = await box('#hd-set'), bMenu = await box('#hd-menu'), code = await box('#hv-code'), lv = await box('.hv-level');
  const p0 = await box('.status-panel');
  check(`1-11 設定ボタンに掛からない (カプセル右端${p0.r.toFixed(0)} < ボタン左端${bSet.x.toFixed(0)})`, p0.r < bSet.x - 1);
  check('1-12 メニューボタンにも掛からない', p0.r < bMenu.x - 1);
  check(`1-13 連続ログインもカプセルの右端にそろう (${code.r.toFixed(0)} / ${p0.r.toFixed(0)})`, Math.abs(code.r - p0.r) < 1.5);
  check('1-14 連続ログインが設定ボタンと重ならない', code.r <= bSet.x + 0.5);
  check('1-15 Lv.表示とXP/PWRのラベルは動かしていない',
    Math.abs(lv.x - 150) < 1 && Math.abs((await box('.hv-xplabel')).x - 149) < 1);
  check('1-16 XP/PWRのゲージは今までどおりの幅(138px)',
    Math.abs((await box('.hv-xpg')).w - 138) < 1 && Math.abs((await box('.hv-pwrg')).w - 138) < 1);
  check(`1-17 次回復習の案内もカプセルの幅にそろう`, await page.evaluate(() =>
    Math.abs(parseFloat(getComputedStyle(document.getElementById('hv-nextrev')).width)
      - parseFloat(getComputedStyle(document.querySelector('.status-panel')).width)) < 1));
  await page.evaluate(() => updateHomeStats());

  /* ============ 2. プレゼントアイコンは左下（今日の5問の縮まった丸の上）へ ============ */
  await stopBob();
  const gift = await box('.sg-gift');
  check('2-1 プレゼント・ガチャの丸が出ている', gift && gift.vis);
  check(`2-2 丸のまま（68px・border-radius 50%） (${gift.w.toFixed(0)}x${gift.h.toFixed(0)})`,
    Math.abs(gift.w - 68) < 1 && Math.abs(gift.h - 68) < 1
    && await page.evaluate(() => getComputedStyle(document.querySelector('.sg-gift')).borderRadius === '50%'));
  check(`2-3 左端は14px（左寄せのまま） (${gift.x.toFixed(0)})`, Math.abs(gift.x - 14) < 1);
  check(`2-4 画面の下半分にある＝左下へ移った (上端${gift.y.toFixed(0)}px)`, gift.y > 1178 / 2);
  check('2-5 ヘッダー側（旧位置 top:340px）にはもう居ない', Math.abs(gift.y - 340) > 100);
  // 今日の5問を消化して丸に縮めた状態で、そのすぐ上に居ることを確かめる
  await page.evaluate(() => { const all = loadD5(); all[d5Key(Date.now())] = { done: true }; saveD5(all); updateD5Btn(); });
  await page.waitForTimeout(500);
  await clearFx(); await stopBob();
  const d5off = await page.evaluate(() => !!document.querySelector('.sg-d5.d5-off'));
  check('2-6 今日の5問が縮んだ丸になっている', d5off);
  const g2 = await box('.sg-gift'), d5 = await box('.sg-d5');
  check(`2-7 縮まった丸と横位置がそろう (プレゼント${g2.x.toFixed(0)} / 5問${d5.x.toFixed(0)})`, Math.abs(g2.x - d5.x) < 1);
  check(`2-8 縮まった丸と同じ大きさ (${g2.w.toFixed(0)} / ${d5.w.toFixed(0)})`, Math.abs(g2.w - d5.w) < 1);
  check(`2-9 縮まった丸の「上」にある (プレゼント下端${g2.b.toFixed(0)} ≦ 5問上端${d5.y.toFixed(0)})`, g2.b <= d5.y + 0.5);
  check(`2-10 くっつきすぎず離れすぎない（すき間${(d5.y - g2.b).toFixed(1)}px）`, d5.y - g2.b > 3 && d5.y - g2.b < 20);
  check('2-11 画面の中に収まっている', g2.y > 0 && g2.b < 1178);
  // 上下に動く演出は「上へ浮く」向き（下の5問の丸にぶつからない）
  const bob = await page.evaluate(() => {
    const g = document.getElementById('sg-gift'); g.classList.add('bob');
    const ks = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch (e) { return []; } })
      .filter(r => r.type === CSSRule.KEYFRAMES_RULE && r.name === 'giftbob');
    const mid = ks[0] && [...ks[0].cssRules].find(r => r.keyText === '50%');
    return { anim: getComputedStyle(g).animationName, mid: mid ? mid.style.transform : null };
  });
  check(`2-12 受け取り待ちがあると上下に動く (${bob.anim})`, bob.anim === 'giftbob');
  check(`2-13 動く向きは上（下の5問の丸にぶつからない） (${bob.mid})`, /translateY\(-\d/.test(bob.mid || ''));
  await stopBob();
  // 押すと吹き出しが開き、左下でも画面内に収まる
  await page.evaluate(() => document.querySelector('.sg-gift').click());
  await page.waitForTimeout(450);
  check('2-14 押すとプレゼント／ガチャの吹き出しが開く', await page.evaluate(() => document.getElementById('gift-modal').classList.contains('on')));
  check('2-15 吹き出しが画面内に収まっている', await page.evaluate(() => {
    const r = document.querySelector('#gift-modal .gf-card').getBoundingClientRect();
    return r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
  }));
  check('2-16 吹き出しはプレゼントの丸から出ている', await page.evaluate(() => {
    const b = document.querySelector('.sg-gift').getBoundingClientRect();
    const c = document.querySelector('#gift-modal .gf-card').getBoundingClientRect();
    return Math.abs((c.left + c.right) / 2 - (b.left + b.right) / 2) < 160;
  }));
  check('2-17 プレゼント画面へ行ける', await page.evaluate(() => {
    document.getElementById('rr-daily').click();
    return !document.getElementById('gift-modal').classList.contains('on')
      && document.getElementById('present-modal').classList.contains('on');
  }));
  await page.evaluate(() => { closePresent(); }); await page.waitForTimeout(300);

  /* ---------- 左下の他の部品と当たっていないか ---------- */
  const home = await box('.sg-home'), trend = await box('.sg-trend'), band = await box('#today-band');
  const g3 = await box('.sg-gift');
  const hit = (a, b) => a && b && !(a.r <= b.x || b.r <= a.x || a.b <= b.y || b.b <= a.y);
  check('2-18 現在地ボタンと重ならない', !hit(g3, home));
  check('2-19 トレンド／ミッションの中央カプセルと重ならない', !hit(g3, trend));
  check('2-20 「最近学んだ単語」の帯と重ならない', !band || !band.vis || !hit(g3, band));
  check('2-21 スタートボタンと重ならない', await (async () => { const s = await box('.start-button'); return !s || !s.vis || !hit(g3, s); })());

  /* ---------- 回帰：見え隠れのルールは今までどおり ---------- */
  await page.evaluate(() => { if (typeof enterListMode === 'function') enterListMode(); else toggleWordbook(); });
  await page.waitForTimeout(700);
  check('R-1 単語帳ページではプレゼントの丸は出さない（従来どおり）',
    await page.evaluate(() => { const g = document.querySelector('.sg-gift'); return !g || g.getBoundingClientRect().width === 0; }));
  check('R-2 単語帳ページでも設定・メニューは出たまま', await (async () => {
    const s = await box('#hd-set'), m = await box('#hd-menu'); return s && s.vis && m && m.vis;
  })());
  check('R-3 単語帳ページでもステータスバーは出たまま', await (async () => { const p = await box('.status-panel'); return p && p.vis; })());
  await page.evaluate(() => { if (typeof exitListMode === 'function') exitListMode(); });
  await page.waitForTimeout(700);
  await clearFx();
  check('R-4 ホームに戻るとプレゼントの丸も戻る', await (async () => { const g = await box('.sg-gift'); return g && g.vis; })());
  check('R-5 ステータスバー・ルームメニュー・今日の5問が残っている', await (async () => {
    const a = await box('.status-panel'), b = await box('.rmenu-bg'), c = await box('.sg-d5');
    return a && a.vis && b && b.vis && c && c.vis;
  })());
  check('R-6 ルーム番号ページャーはルームメニューの下のまま',
    await (async () => { const p = await box('#room-pager'); return p && Math.abs(p.y - 292) < 1.5; })());
  check('R-7 版数が上がっている', await page.evaluate(() => { const m = /^v6\.(\d+)/.exec(APP_VERSION); return !!m && +m[1] >= 3; }));
  check('R-8 JSコンソールエラーが無い', errors.length === 0);
  if (errors.length) console.log(errors);

  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length} / ${results.length} PASS`);
  if (ng.length) { console.log('FAILED:'); ng.forEach(r => console.log(' - ' + r.name)); }
  await browser.close();
  process.exit(ng.length ? 1 : 0);
})();
