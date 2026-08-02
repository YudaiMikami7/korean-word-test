/* k-tango 2026-08-02 21:09 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0802j.test.js
 * 指示:
 *  「最近学んだ単語をなくして、その分、今日の五問やミッション、プレゼントアイコンなどの位置を下げよ」
 *   → ホーム下部の帯(#today-band)を廃止し、空いた場所へ 今日の5問／ミッション／プレゼント を下ろす
 *      （下端は右下の単語帳ボタンと同じ1132pxにそろえる）
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
  const clearFx = () => page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.lvup,.fcust,.pbub,.stepnote,.tapavatar,.rest-ask,#resume-ask,.coach,.d5auto,.sp-ribbon').forEach(o => o.remove()));
  const stopBob = () => page.evaluate(() => document.querySelectorAll('.sg-gift').forEach(b => b.classList.remove('bob')));
  await clearFx(); await stopBob();

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
  const hit = (a, b) => a && b && !(a.r <= b.x || b.r <= a.x || a.b <= b.y || b.b <= a.y);

  /* ============ 1. 「最近学んだ単語」の帯が無くなった ============ */
  check('1-1 帯(#today-band)がホームから無くなった', await page.evaluate(() => !document.getElementById('today-band')));
  check('1-2 帯の中のカード(.tb-card)もどこにも無い', await page.evaluate(() => document.querySelectorAll('.tb-card,.tb-label,.tb-clip,.tb-track').length === 0));
  check('1-3 「最近学んだ単語」「おすすめの単語」の文字が画面に出ていない', await page.evaluate(() => {
    const t = document.getElementById('s-home').innerText || '';
    return t.indexOf('最近学んだ単語') < 0 && t.indexOf('おすすめの単語') < 0;
  }));
  check('1-4 帯を作っていた関数も撤去されている', await page.evaluate(() => typeof buildTodayBand === 'undefined' && typeof recommendWords === 'undefined'));

  /* ============ 2. 今日の5問／プレゼントが下がった ============ */
  const d5 = await box('.sg-d5'), gift = await box('.sg-gift'), right = await box('.home-side-btn.hsb-right');
  check('2-1 今日の5問が出ている', d5 && d5.vis);
  check(`2-2 今日の5問が前より下がった（旧下端899px → いま${d5.b.toFixed(0)}px）`, d5.b > 899 + 100);
  check(`2-3 下端が右下の単語帳ボタンとそろう (5問${d5.b.toFixed(0)} / 単語帳${right.b.toFixed(0)})`, Math.abs(d5.b - right.b) < 1.5);
  check(`2-4 帯があった場所（962〜1132px）に入っている (上端${d5.y.toFixed(0)})`, d5.y >= 962 - 1);
  check('2-5 プレゼントの丸も一緒に下がった', gift && gift.vis && gift.b > 823 + 100);
  check(`2-6 プレゼントは今日の5問の上・左端14pxのまま (左${gift.x.toFixed(0)} / 下端${gift.b.toFixed(0)})`,
    Math.abs(gift.x - 14) < 1 && gift.b < d5.y + 0.5);
  check('2-7 画面の中に収まっている（はみ出していない）', d5.b <= 1178 && gift.y > 0 && d5.r <= 602 && gift.r <= 602);
  check('2-8 単語帳ボタンと重ならない', !hit(d5, right) && !hit(gift, right));
  check('2-9 バージョン表記に掛からない', await (async () => { const v = await box('.hv-ver'); return d5.b <= v.y + 0.5; })());
  check('2-10 すごろくの盤面と重ならない', await (async () => { const sg = await box('.sg-wrap'); return !hit(d5, sg) && !hit(gift, sg); })());
  check('2-11 押すと今日の5問が始まる', await (async () => {
    await page.evaluate(() => document.querySelector('.sg-d5').click());
    await page.waitForTimeout(600);
    const on = await page.evaluate(() => document.getElementById('d5-modal').classList.contains('on'));
    await page.evaluate(() => { closeDaily5(); });
    await page.waitForTimeout(300);
    return on;
  })());

  /* ============ 3. ミッションも同じ高さに下がった ============ */
  await page.evaluate(() => { const all = loadD5(); all[d5Key(Date.now())] = { done: true }; saveD5(all); updateD5Btn(); });
  await page.waitForTimeout(600);
  await clearFx(); await stopBob();
  const ms = await box('.sg-mission'), d5o = await box('.sg-d5'), g2 = await box('.sg-gift');
  check('3-1 5問を消化するとミッションの黄色カプセルが出る', ms && ms.vis);
  check(`3-2 ミッションの下端も単語帳ボタンとそろう (${ms.b.toFixed(0)} / ${right.b.toFixed(0)})`, Math.abs(ms.b - right.b) < 1.5);
  check('3-3 ミッションが単語帳ボタン・プレゼントと重ならない', !hit(ms, right) && !hit(ms, g2));
  check(`3-4 縮まった5問の丸も同じ下端 (${d5o.b.toFixed(0)})`, Math.abs(d5o.b - right.b) < 1.5);
  check(`3-5 プレゼントは縮まった丸のすぐ上（すき間${(d5o.y - g2.b).toFixed(1)}px）`, d5o.y - g2.b > 3 && d5o.y - g2.b < 20);
  check(`3-6 プレゼントと縮まった丸は横位置がそろう (${g2.x.toFixed(0)} / ${d5o.x.toFixed(0)})`, Math.abs(g2.x - d5o.x) < 1);
  check('3-7 ミッションを押すと吹き出しが開き、画面内に収まる', await (async () => {
    await page.evaluate(() => document.querySelector('.sg-mission').click());
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const m = document.getElementById('mission-modal') || document.querySelector('.ms-card') && document.querySelector('.ms-card').closest('.d5-modal,.gf-modal,[id$="-modal"]');
      const c = document.querySelector('.ms-card');
      if (!c) return null;
      const b = c.getBoundingClientRect();
      return { on: !!m && m.classList.contains('on'), fit: b.left >= -0.5 && b.top >= -0.5 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1 };
    });
    return r && r.fit;
  })());
  await page.evaluate(() => { document.querySelectorAll('[id$="-modal"].on').forEach(m => m.classList.remove('on')); });
  await page.waitForTimeout(300);

  /* ============ 回帰 ============ */
  await page.evaluate(() => { if (typeof enterListMode === 'function') enterListMode(); else toggleWordbook(); });
  await page.waitForTimeout(700);
  check('R-1 単語帳ページでは今日の5問・プレゼントは出ない（従来どおり）', await page.evaluate(() =>
    ['.sg-d5', '.sg-gift'].every(s => { const e = document.querySelector(s); return !e || e.getBoundingClientRect().width === 0; })));
  check('R-2 単語帳ページでも設定・メニュー・ステータスバーは出たまま', await (async () => {
    const s = await box('#hd-set'), m = await box('#hd-menu'), p = await box('.status-panel');
    return s && s.vis && m && m.vis && p && p.vis;
  })());
  check('R-3 単語帳の検索欄が使える（候補が出る）', await (async () => {
    await page.evaluate(() => { const q = document.querySelector('.wb-qin'); q.focus(); q.value = '작'; wbSearch2('작'); });
    await page.waitForTimeout(400);
    return page.evaluate(() => document.querySelectorAll('#wb-hits2 .wbh-row').length > 0);
  })());
  await page.evaluate(() => { wbResetPanel(); if (typeof exitListMode === 'function') exitListMode(); });
  await page.waitForTimeout(700);
  await clearFx(); await stopBob();
  check('R-4 ホームに戻ると今日の5問・プレゼントが戻る', await (async () => {
    const a = await box('.sg-d5'), b = await box('.sg-gift'); return a && a.vis && b && b.vis;
  })());
  check('R-5 ステータス（下スワイプ）へ移るとフロートは消える', await (async () => {
    await page.evaluate(() => { if (typeof openStatus === 'function') openStatus(); else document.getElementById('homewrap').classList.add('status'); });
    await page.waitForTimeout(700);
    const a = await box('.sg-d5'), b = await box('.sg-gift');
    await page.evaluate(() => { if (typeof closeStatus === 'function') closeStatus(); else document.getElementById('homewrap').classList.remove('status'); });
    await page.waitForTimeout(700);
    return (!a || !a.vis) && (!b || !b.vis);
  })());
  await clearFx();
  check('R-6 ルームメニュー・ページャー・すごろくは今までどおり', await (async () => {
    const p = await box('#room-pager'), r = await box('.rmenu-bg'), s = await box('.sg-wrap');
    return p && Math.abs(p.y - 292) < 1.5 && r && r.vis && s && s.vis;
  })());
  check('R-7 版数が上がっている', await page.evaluate(() => { const m = /^v6\.(\d+)/.exec(APP_VERSION); return !!m && +m[1] >= 4; }));
  check('R-8 JSコンソールエラーが無い', errors.length === 0);
  if (errors.length) console.log(errors);

  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length} / ${results.length} PASS`);
  if (ng.length) { console.log('FAILED:'); ng.forEach(r => console.log(' - ' + r.name)); }
  await browser.close();
  process.exit(ng.length ? 1 : 0);
})();
