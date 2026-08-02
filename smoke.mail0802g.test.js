/* k-tango 2026-08-02 16:54 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0802g.test.js
 * 指示（ホーム画面）:
 *  ・「PWRが◯◯減るまで」のカウントは廃止
 *  ・ルーム番号のページャーは、ルームメニューの下の位置に
 *  ・ステータスと、ルームメニュー＋ページャーのあいだのマージンを少しに
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

  // 602基準の設計座標にそろえて測る（画面幅で縮小されているため）
  const design = () => page.evaluate(() => {
    const hw = document.getElementById('homewrap'), hr = hw.getBoundingClientRect(), k = hr.width / 602;
    const g = sel => { const e = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!e) return null;
      const r = e.getBoundingClientRect(); if (r.width <= 0 && r.height <= 0) return null;
      return { t: +((r.top - hr.top) / k).toFixed(1), b: +((r.bottom - hr.top) / k).toFixed(1),
               l: +((r.left - hr.left) / k).toFixed(1), r: +((r.right - hr.left) / k).toFixed(1) }; };
    return {
      status: g('.status-panel'), avatar: g('.avatar-circle'),
      menu: g(`.room-slide[data-n="${curSection}"] .rmenu-bg`),
      no: g(`.room-slide[data-n="${curSection}"] .hv-roomno`),
      board: g(`.room-slide[data-n="${curSection}"] .sg-wrap`),
      pager: g('#room-pager'), hint: g('#room-hint'),
      prev: g('#rm-prev'), rail: g('.sg-gift'), d5: g('.sg-d5'), gift: g('.sg-gift'),
      sghome: g(`.room-slide[data-n="${curSection}"] .sg-home`)
    };
  });

  // ================= ① 「PWRが◯◯減るまで」のカウントは廃止 =================
  const pwr = await page.evaluate(() => {
    const now = Date.now(), s = {};
    BEGINNER_WORDS.slice(0, 20).forEach(w => s[w.id] = { hasSeen: true, hasEverCorrect: true, memoryScore: 80, stabilityHours: 24, wordDifficulty: 1,
      lastReviewedAt: new Date(now - 3600000).toISOString(), reviewCount: 3, correctCount: 3 });
    _lsSetJSON(LS_STATS, s);
    calibratePwr(); updatePwrFine();
    return {
      el: !!document.getElementById('hv-pwrdown'),
      text: document.getElementById('s-home').textContent,
      val: (document.getElementById('hv-pwrval') || {}).textContent,
      barW: parseFloat(document.getElementById('hv-pwrfill').style.width),
      exact: pwrOverallExact(), step: pwrStepSec()
    };
  });
  check('「PWRが減るまで」のカウント欄(#hv-pwrdown)が無い', pwr.el === false);
  check('ホームのどこにも「減るまで」の文言が出ない', !/減るまで/.test(pwr.text));
  check(`PWRの数字はこれまでどおり出る (${pwr.val})`, /^\d+\.\d\d%$/.test(pwr.val || ''));
  check(`PWRバーの長さも実PWRのまま (${pwr.barW}% / 実測${pwr.exact.toFixed(2)}%)`, Math.abs(pwr.barW - pwr.exact) < 0.5);
  check(`0.01%減るまでの秒数の計算そのものは残っている (${pwr.step ? pwr.step.toFixed(1) + '秒' : 'null'})`, pwr.step > 0);

  // ================= ② ページャーはルームメニューの下 =================
  const shown = await page.evaluate(async () => { showRoomPager(); await new Promise(r => setTimeout(r, 450));
    return { on: document.getElementById('room-pager').classList.contains('on'),
             op: +getComputedStyle(document.getElementById('room-pager')).opacity,
             dots: document.querySelectorAll('#room-pager .rp-dot').length }; });
  check(`ルーム切替中はページャーが出る (${shown.dots}個)`, shown.on && shown.op > 0.9 && shown.dots > 1);
  const a = await design();
  check(`ページャーがルームメニューより下にある (メニュー下端${a.menu.b} → ページャー上端${a.pager.t})`, a.pager.t >= a.menu.b);
  check(`ページャーとルームメニューが重なっていない (すき間${(a.pager.t - a.menu.b).toFixed(1)}px)`, a.pager.t - a.menu.b >= 0 && a.pager.t - a.menu.b <= 20);
  check(`ページャーはステータスバーの下ではなくなった (ステータス下端${a.status.b} / ページャー上端${a.pager.t})`, a.pager.t > a.status.b + 100);
  // 左のアイコン列は廃止。プレゼント・ガチャの丸は左下へ移した（メール指示 2026-08-02 20:47）
  check(`ページャーは左の丸アイコンに重ならない (ページャー下端${a.pager.b} ≦ アイコン上端${a.rail.t})`, a.pager.b <= a.rail.t + 1);
  const cur = await page.evaluate(() => { const d = document.querySelector('#room-pager .rp-dot.cur'); return d ? d.dataset.sec : null; });
  check(`いま見ているROOMがページャーで大きく出る (${cur})`, cur != null);

  // ================= ③ ステータスとルームメニュー＋ページャーのマージンを少しに =================
  await page.evaluate(() => { hideRoomPager();
    document.querySelectorAll('.sg-home').forEach(b => b.classList.add('on')); // 隠れている間は縮小の transform が掛かるので、出した状態で測る
    document.querySelectorAll('.sg-gift').forEach(b => b.classList.remove('bob')); }); // 上下に動く演出は止めて、置き場所そのものを測る
  await page.waitForTimeout(400);
  const b = await design();
  const gapStatus = b.menu.t - b.status.b, gapAvatar = b.menu.t - b.avatar.b;
  check(`ステータスバーとルームメニューのすき間が少し (${gapStatus.toFixed(1)}px ＜ 以前の66px)`, gapStatus > 0 && gapStatus <= 32);
  check(`左上のアイコン丸とも重なっていない (${gapAvatar.toFixed(1)}px)`, gapAvatar > 0);
  check(`ルームメニューの中身（ROOM番号）も一緒に上がっている (${b.no.t})`, b.no.t > b.status.b && b.no.t < b.menu.b);
  check(`左右の矢印はルームメニューの高さの中にある (矢印${b.prev.t}〜${b.prev.b} / メニュー${b.menu.t}〜${b.menu.b})`,
        b.prev.t >= b.menu.t && b.prev.b <= b.menu.b);
  check(`すごろくもルームメニューのすぐ下のまま (メニュー下端${b.menu.b} / 盤上端${b.board.t})`, Math.abs(b.board.t - b.menu.b) <= 2);
  check(`下のボタン類（今日の5問）は動かしていない (${b.d5 ? b.d5.b : 'なし'})`, !b.d5 || b.d5.b > 880);
  check(`現在地ボタンも今までどおり今日の5問と同じ行 (${b.sghome ? b.sghome.b : 'なし'})`, !b.d5 || !b.sghome || Math.abs(b.sghome.b - b.d5.b) <= 2);
  // プレゼント・ガチャの丸は左下＝今日の5問の縮まった丸の上へ移した（メール指示 2026-08-02 20:47）
  check(`プレゼント・ガチャの丸は左下にある (左端${b.rail.l} / 上端${b.rail.t})`, b.rail.l === 14 && b.rail.t > 602);

  // ================= ④ スワイプの案内・使い方ガイドが壊れていない =================
  const hint = await page.evaluate(async () => {
    localStorage.removeItem('kwt_roomhint_v1'); initRoomHint();
    await new Promise(r => setTimeout(r, 300));
    const h = document.getElementById('room-hint'), m = document.querySelector(`.room-slide[data-n="${curSection}"] .rmenu-bg`);
    const hb = h.getBoundingClientRect(), mb = m.getBoundingClientRect();
    const pv = document.getElementById('rm-prev').getBoundingClientRect(), hl = h.querySelector('.rh-l').getBoundingClientRect();
    return { shown: h.style.display !== 'none' && !h.classList.contains('off'), below: hb.top >= mb.bottom - 1,
             sameX: Math.abs((hl.left + hl.width / 2) - (pv.left + pv.width / 2)) < 1.5 };
  });
  check('スワイプの案内は今までどおり出る', hint.shown);
  check('案内はルームメニューの下（ページャーと同じ帯）に出る', hint.below);
  check('案内の三角は今までどおり左右の矢印と同じ位置', hint.sameX);
  await page.evaluate(() => { const h = document.getElementById('room-hint'); if (h) h.style.display = 'none'; });

  const coach = await page.evaluate(async () => {
    showCoach(); await new Promise(r => setTimeout(r, 500));
    const hole = document.getElementById('cm-hole').getBoundingClientRect();
    const p = document.getElementById('room-pager').getBoundingClientRect();
    const ok = hole.width > 4 && hole.height > 4 && Math.abs((hole.top + hole.height / 2) - (p.top + p.height / 2)) < 24;
    const txt = document.getElementById('cm-h').textContent;
    closeCoach();
    return { ok, txt, held: _pagerHold };
  });
  check(`使い方ガイドの1つめは移動後のページャーを囲む (${coach.txt})`, coach.ok);
  check('ガイドを閉じたら出しっぱなしも解除される', coach.held === false);

  await page.waitForTimeout(400);
  check(`JSコンソールエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) errors.forEach(e => console.log('  ! ' + e));

  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n==== ${results.length - ng.length} / ${results.length} PASS ====`);
  if (ng.length) { ng.forEach(r => console.log('FAIL: ' + r.name)); process.exit(1); }
})();
