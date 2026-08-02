/* k-tango 2026-08-02 22:36 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0802k.test.js
 * 指示:
 *  「マスの表示は最下部まで。まえに最近の単語があったところが非表示なのをなおして」
 *   → すごろくの器(.sg-wrap)を画面のいちばん下(1178px)まで伸ばし、
 *      「最近学んだ単語」の帯があった場所（962〜1132px）にもマスが出るようにする
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
  await page.waitForTimeout(1600);
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

  /* ============ 1. 器がいちばん下まで伸びた ============ */
  const sg = await box('.room-slide .sg-wrap');
  check('1-1 すごろくの器が出ている', sg && sg.vis);
  check(`1-2 器の下端がホームのいちばん下(1178px)まで届いた（旧925px → いま${sg.b.toFixed(0)}px）`, Math.abs(sg.b - 1178) < 1.5);
  check(`1-3 器の上端はこれまでどおり289px (いま${sg.y.toFixed(0)}px)`, Math.abs(sg.y - 289) < 1.5);
  check(`1-4 器の高さ889px・左右はそのまま (h=${sg.h.toFixed(0)} / x=${sg.x.toFixed(0)} / r=${sg.r.toFixed(0)})`,
    Math.abs(sg.h - 889) < 1.5 && Math.abs(sg.x - 24) < 1 && Math.abs(sg.r - 578) < 1);
  check('1-5 器がホームからはみ出していない', sg.b <= 1178.5 && sg.y >= 0 && sg.x >= 0 && sg.r <= 602);
  check('1-6 中のスクロール面も器いっぱい', await page.evaluate(() => {
    const w = document.querySelector('.room-slide .sg-wrap'), sc = w.querySelector('.sg-scroll');
    return Math.abs(sc.clientHeight - w.clientHeight) < 1.5;
  }));

  /* ============ 2. 帯の跡地（962〜1132px）にマスが出る ============ */
  const tiles = await page.evaluate(() => {
    const h = document.getElementById('homewrap').getBoundingClientRect(), k = h.width / 602;
    const out = [];
    document.querySelectorAll('.room-slide[data-n="' + curSection + '"] .sg-tile').forEach(t => {
      const r = t.getBoundingClientRect(); if (!r.width) return;
      const im = t.querySelector('.sg-img,.sg-noimg');
      const ir = im ? im.getBoundingClientRect() : r;
      out.push({ label: t.getAttribute('aria-label'),
        y: (r.top - h.top) / k, b: (r.bottom - h.top) / k,
        iy: (ir.top - h.top) / k, ib: (ir.bottom - h.top) / k });
    });
    return out.sort((a, b) => b.b - a.b);
  });
  const low = tiles[0];
  check(`2-1 いちばん下のマスは「マス1」(いま${low && low.label})`, low && low.label === 'マス1');
  check(`2-2 いちばん下のマスが帯の跡地(962px以下)まで下りてきた (下端${low.b.toFixed(0)}px)`, low.b > 962);
  check(`2-3 マスの絵も帯の跡地に掛かっている (絵の下端${low.ib.toFixed(0)}px)`, low.ib > 962);
  check(`2-4 マスは器からはみ出さない (下端${low.b.toFixed(0)} ≦ 1178)`, low.b <= 1178.5);
  check(`2-5 器が広がったぶん、見えるマスが増えた (${tiles.filter(t => t.b > 289 && t.y < 1178).length}マス)`,
    tiles.filter(t => t.b > 289 && t.y < 1178).length >= 4);
  check('2-6 帯(#today-band)は廃止のまま（復活していない）', await page.evaluate(() => !document.getElementById('today-band')));

  /* ============ 3. 盤の下端まで道が続いている（下に余白のスクロールが残っていない） ============ */
  check('3-1 いちばん下までスクロールしきっている', await page.evaluate(() => {
    const sc = document.querySelector('.room-slide[data-n="' + curSection + '"] .sg-scroll');
    return Math.abs(sc.scrollTop + sc.clientHeight - sc.scrollHeight) < 2;
  }));
  check('3-2 現在地ボタンは出ていない（＝いまここが見えている）', await page.evaluate(() => {
    const b = document.querySelector('.room-slide[data-n="' + curSection + '"] .sg-home');
    return !!b && !b.classList.contains('on');
  }));
  check('3-3 スタートの吹き出しが画面の中に収まっている', await (async () => {
    const s = await box('.sg-here');
    return s && s.vis && s.y > 289 && s.b < 1178;
  })());

  /* ============ 4. ボタン類は前回の位置のまま・盤の前面に浮く ============ */
  const d5 = await box('.sg-d5'), gift = await box('.sg-gift'), right = await box('.home-side-btn.hsb-right'), ver = await box('.hv-ver');
  check(`4-1 今日の5問の下端は1132pxのまま (${d5.b.toFixed(0)})`, Math.abs(d5.b - 1132) < 1.5);
  check(`4-2 単語帳ボタンと下端がそろったまま (${d5.b.toFixed(0)} / ${right.b.toFixed(0)})`, Math.abs(d5.b - right.b) < 1.5);
  check('4-3 プレゼントの丸も今までどおり', gift && gift.vis && Math.abs(gift.x - 14) < 1 && gift.b < d5.y + 0.5);
  check('4-4 ボタンは盤より前面（重なっても隠れない）', await page.evaluate(() => {
    const z = s => +getComputedStyle(document.querySelector(s)).zIndex || 0;
    const sgz = +getComputedStyle(document.querySelector('.room-slide .sg-wrap')).zIndex || 0;
    return z('.sg-d5') > sgz && z('.sg-gift') > sgz && z('.home-head') > sgz;
  }));
  check('4-5 いちばん上に居るのがボタン（真ん中を指しても盤に取られない）', await page.evaluate(() => {
    const hit = e => { const r = e.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el && (el === e || e.contains(el)); };
    return hit(document.querySelector('.sg-d5')) && hit(document.querySelector('.sg-gift')) && hit(document.querySelector('.home-side-btn.hsb-right'));
  }));
  check('4-6 版数の文字にマスが被さって読めなくなっていない（版数が前面）', ver && ver.vis && await page.evaluate(() => {
    const z = e => +getComputedStyle(e).zIndex || 0;
    return z(document.querySelector('.hv-ver')) > (+getComputedStyle(document.querySelector('.room-slide .sg-wrap')).zIndex || 0);
  }));
  check('4-7 今日の5問を押すと開く', await (async () => {
    await page.evaluate(() => document.querySelector('.sg-d5').click());
    await page.waitForTimeout(600);
    const on = await page.evaluate(() => document.getElementById('d5-modal').classList.contains('on'));
    await page.evaluate(() => { closeDaily5(); });
    await page.waitForTimeout(400);
    return on;
  })());

  /* ============ 5. マスを押す・スクロールする動きは今までどおり ============ */
  await clearFx(); await stopBob();
  check('5-1 帯の跡地に下りたマスをタップするとプレビューが開く', await (async () => {
    await page.evaluate(() => {
      const t = [...document.querySelectorAll('.room-slide[data-n="' + curSection + '"] .sg-tile')]
        .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
      t.click();
    });
    await page.waitForTimeout(700);
    const on = await page.evaluate(() => !!document.querySelector('.tp-card,#tile-prev,.sg-prev') || _counting === true || !!document.querySelector('.home-countdown,.cdnum'));
    await page.evaluate(() => { if (typeof cancelHomeCountdown === 'function') cancelHomeCountdown(); document.querySelectorAll('.tp-card,#tile-prev,.sg-prev').forEach(e => e.remove()); });
    await page.waitForTimeout(400);
    return on;
  })());
  await clearFx(); await stopBob();
  check('5-2 上へスクロールすると現在地ボタンが出て、押すと戻る', await (async () => {
    await page.evaluate(() => { const sc = document.querySelector('.room-slide[data-n="' + curSection + '"] .sg-scroll'); sc.scrollTop = Math.max(0, sc.scrollTop - 600); sc.dispatchEvent(new Event('scroll')); });
    await page.waitForTimeout(500);
    const on = await page.evaluate(() => document.querySelector('.room-slide[data-n="' + curSection + '"] .sg-home').classList.contains('on'));
    await page.evaluate(() => sgScrollToCurrent(curSection));
    await page.waitForTimeout(700);
    const back = await page.evaluate(() => {
      const sc = document.querySelector('.room-slide[data-n="' + curSection + '"] .sg-scroll');
      return Math.abs(sc.scrollTop + sc.clientHeight - sc.scrollHeight) < 3;
    });
    return on && back;
  })());
  check('5-3 ホーム全体は縦にスクロールしない（器の中だけ動く）', await page.evaluate(() => document.getElementById('s-home').scrollTop === 0 && Math.abs(window.scrollY) < 2));

  /* ============ 回帰 ============ */
  check('R-1 ROOMを切り替えても盤の下端は1178pxのまま', await (async () => {
    await page.evaluate(() => { curSection = Math.min(2, Object.keys(LEVEL_SECTIONS[curLevel]).filter(x => +x > 0).length); renderHome(); });
    await page.waitForTimeout(1200);
    await clearFx();
    const s = await box('.room-slide[data-n="' + (await page.evaluate(() => curSection)) + '"] .sg-wrap');
    return s && Math.abs(s.b - 1178) < 1.5;
  })());
  check('R-2 単語帳ページでは盤が消え、一覧が出る', await (async () => {
    await page.evaluate(() => { if (typeof enterListMode === 'function') enterListMode(); else toggleWordbook(); });
    await page.waitForTimeout(800);
    const w = await box('.room-slide .sg-wrap'), l = await box('.slide-list');
    return (!w || !w.vis) && l && l.vis;
  })());
  check('R-3 ホームに戻ると盤も戻る', await (async () => {
    await page.evaluate(() => { wbResetPanel(); if (typeof exitListMode === 'function') exitListMode(); });
    await page.waitForTimeout(900);
    await clearFx();
    const w = await box('.room-slide .sg-wrap');
    return w && w.vis && Math.abs(w.b - 1178) < 1.5;
  })());
  check('R-4 ステータス（下スワイプ）では盤が消える', await (async () => {
    await page.evaluate(() => { if (typeof openStatus === 'function') openStatus(); else document.getElementById('homewrap').classList.add('status'); });
    await page.waitForTimeout(800);
    const w = await box('.room-slide .sg-wrap');
    await page.evaluate(() => { if (typeof closeStatus === 'function') closeStatus(); else document.getElementById('homewrap').classList.remove('status'); });
    await page.waitForTimeout(800);
    return !w || !w.vis;
  })());
  await clearFx();
  check('R-5 ルームメニュー・ページャーは今までどおり', await (async () => {
    const p = await box('#room-pager'), r = await box('.rmenu-bg');
    return p && Math.abs(p.y - 292) < 1.5 && r && r.vis;
  })());
  check('R-6 版数が上がっている', await page.evaluate(() => { const m = /^v6\.(\d+)/.exec(APP_VERSION); return !!m && +m[1] >= 5; }));
  check('R-7 JSコンソールエラーが無い', errors.length === 0);
  if (errors.length) console.log(errors);

  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length} / ${results.length} PASS`);
  if (ng.length) { console.log('FAILED:'); ng.forEach(r => console.log(' - ' + r.name)); }
  await browser.close();
  process.exit(ng.length ? 1 : 0);
})();
