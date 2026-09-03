/* k-tango スモークテスト（メール指示 2026-08-29 22:45 ぶん）
 * 使い方: node smoke.mail0829c.test.js
 *  1) 結果画面にも「あと10秒でホーム画面にもどります」のカウントダウン（中止つき）
 *  2) ホームの10秒カウントダウンは WORLD ページャーのすぐ下に出る
 *  3) ホーム復帰の演出順：CLEAR（クリアエフェクト）→ プレゼントが届きました。吹き出しは画面内に収まる
 *  4) 戻ってきた時点で「さっきまでやっていたマス」がすでに中央にある
 *  5) ガチャの「もう1回まわす」が効く（きせかえが出ても止まらない）
 *  6) そだてるの詳細（図鑑）：たべたことば・アルバム・ガチャ/イベントのタブなし。動物タップで きせかえへ
 *  7) 育てる基本画面：草むらに動物とたまご／3つのパラメータなし／わすれかけの呼びかけなし／
 *     ひとことは動物からの吹き出し／PWRで元気が変わる
 */
const { chromium } = require('playwright');
const path = require('path');

const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 602, height: 1178 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => { localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_a2hs_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); });
  await page.reload();
  await page.waitForTimeout(1200);

  // ---- 1) 結果画面の10秒カウントダウン ----
  await page.evaluate(() => { document.getElementById('s-result').innerHTML = '<div class="res"></div>'; show('s-result'); });
  await page.waitForTimeout(900);
  check('結果画面にカウントダウンが出る', await page.evaluate(() => { const e = document.getElementById('rhcd'); return !!e && e.textContent.includes('ホーム画面'); }));
  check('「あと◯秒」が10秒から', await page.evaluate(() => { const e = document.getElementById('rh-sec'); return !!e && +e.textContent >= RH_SEC - 2; }));
  check('カウントダウンが画面内に収まる', await page.evaluate(() => { const r = document.getElementById('rhcd').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
  check('中止ボタンがある', await page.evaluate(() => !!document.querySelector('#rhcd button')));
  await page.evaluate(() => rhCancel());
  await page.waitForTimeout(150);
  check('中止で消える', await page.evaluate(() => !document.getElementById('rhcd')));
  // 0秒でホームへ戻る
  await page.evaluate(() => { show('s-result'); });
  await page.waitForTimeout(900);
  await page.evaluate(async () => { _rhLeft = 1; await new Promise(r => setTimeout(r, 1500)); });
  await page.waitForTimeout(600);
  check('0秒でホーム画面にもどる', await page.evaluate(() => document.getElementById('s-home').classList.contains('on')));
  check('ホームに戻ると結果のカウントダウンは消えている', await page.evaluate(() => !document.getElementById('rhcd')));

  // ---- 2) ホームのカウントダウンはページャーのすぐ下 ----
  await page.evaluate(() => { show('s-home'); nqArm(); });
  await page.waitForTimeout(900);
  const pos = await page.evaluate(() => {
    const e = document.getElementById('nqcd'); if (!e) return null;
    const p = document.getElementById('room-pager');
    return { inHome: e.parentElement && e.parentElement.id === 'homewrap', atPager: e.classList.contains('at-pager'), top: e.offsetTop, pagerBottom: p.offsetTop + p.offsetHeight, r: e.getBoundingClientRect() };
  });
  check('カウントダウンはホームの中に置かれる', pos && pos.inHome && pos.atPager);
  check('位置はページャーのすぐ下', pos && pos.top >= pos.pagerBottom && pos.top - pos.pagerBottom < 40);
  check('ホームのカウントダウンも画面内', pos && pos.r.left >= 0 && pos.r.right <= 602 && pos.r.bottom <= 1178);
  await page.evaluate(() => nqCancel());

  // ---- 3)(4) ホーム復帰の演出順とマスの位置 ----
  const seq = await page.evaluate(async () => {
    // 直前にクリアしたマスを仕込んでホームに戻る
    _lastBoardTile = { level: curLevel, sec: curSection, gidx: 1, idx: 0 };
    _preCenterPend = true;
    _homeNotice = { type: 'present' };
    const order = [];
    const oClear = window.sgClearFx, oBub = window.showPresentBubble;
    window.sgClearFx = function (t) { order.push('clear'); return oClear.apply(this, arguments); };
    window.showPresentBubble = function (d) { order.push('present'); return oBub.apply(this, arguments); };
    // 復帰時点のスクロール位置（ホームを描いた直後）
    show('s-home');
    const sl = document.querySelector('.room-slide[data-n="' + curSection + '"] .sg-scroll');
    const at = sl ? sl.scrollTop : -1;
    const tile = document.querySelector('.room-slide[data-n="' + curSection + '"] .sg-tile[aria-label="マス1"]');
    const want = tile ? sgCenterTile(tile) : -2;
    showHomeNotice({ type: 'present' });
    await new Promise(r => setTimeout(r, 5200)); // CLEAR(1.2秒)→「新しいステップ」(2.4秒)のあとに吹き出しが出る
    const res = { order: order.slice(), at, want, bub: null };
    const b = document.querySelector('.pbub');
    if (b) { const r = b.getBoundingClientRect(); res.bub = { l: r.left, r: r.right, t: r.top, b: r.bottom }; }
    window.sgClearFx = oClear; window.showPresentBubble = oBub;
    return res;
  });
  check('CLEARエフェクトのほうが先', seq.order[0] === 'clear');
  check('プレゼントの吹き出しはそのあと', seq.order.indexOf('present') > seq.order.indexOf('clear'));
  check('戻った時点でさっきのマスが中央にある', Math.abs(seq.at - seq.want) <= 2);
  check('プレゼントの吹き出しが画面内に収まる', !!seq.bub && seq.bub.l >= 0 && seq.bub.r <= 602 && seq.bub.t >= 0 && seq.bub.b <= 1178);
  await page.waitForTimeout(2200);

  // ---- 5) ガチャの「もう1回まわす」 ----
  const gacha = await page.evaluate(async () => {
    const o = gachaState(); o.q = [{ xp: 0 }, { xp: 0 }, { xp: 0 }]; saveGacha(o);
    openGacha();
    const before = gachaSpins();
    spinGacha();
    await new Promise(r => setTimeout(r, 1500));
    const again = !!document.querySelector('#gacha-modal .gc-go');
    const mid = gachaSpins();
    if (again) document.querySelector('#gacha-modal .gc-go').click();
    await new Promise(r => setTimeout(r, 1500));
    const after = gachaSpins();
    return { before, mid, after, again, busy: _gachaBusy };
  });
  check('まわすと途中で止まらない', gacha.mid === gacha.before - 1);
  check('「もう1回まわす」ボタンが出る', gacha.again);
  check('「もう1回まわす」が効く', gacha.after === gacha.mid - 1);
  check('回したあとも操作できる状態', gacha.busy === false);
  await page.evaluate(() => closeGacha());

  // ---- 6) 図鑑は廃止し、広場だけになった（メール指示 2026-08-31） ----
  await page.evaluate(() => { const o = petState(); o.ate = ['사랑', '하늘']; savePet(o); openPetZoo(); });
  await page.waitForTimeout(300);
  const zoo = await page.evaluate(() => {
    const m = document.getElementById('pet-modal');
    return { ate: m.textContent.includes('たべたことば'), alb: m.textContent.includes('思い出アルバム'),
      tabs: !!m.querySelector('.pt-tabs'), zooList: !!m.querySelector('.pt-zoo'),
      field: !!m.querySelector('.pt-field') };
  });
  check('詳細に「たべたことば」は無い', !zoo.ate);
  check('詳細に「思い出アルバム」は無い', !zoo.alb);
  check('ガチャ・イベント・きせかえのタブは無い', !zoo.tabs);
  check('図鑑は廃止された', !zoo.zooList);
  check('図鑑を開こうとしても広場になる', zoo.field);

  // ---- 7) 育てる基本画面 ----
  await page.evaluate(() => openPet());
  await page.waitForTimeout(300);
  const pet = await page.evaluate(() => {
    const m = document.getElementById('pet-modal'), f = m.querySelector('.pt-field');
    return {
      field: !!f,
      animals: m.querySelectorAll('.pt-field .pt-an').length,
      // うごきはCSSアニメ(ptDrift)からJSの歩き(petYardStart)に変わった（メール指示 2026-09-03）
      moving: !!f && _pfTimer !== null && getComputedStyle(m.querySelector('.pt-field .pt-an')).transitionProperty.indexOf('left') >= 0,
      say: !!m.querySelector('.pt-field .pt-say#pt-line'),
      rings: !!m.querySelector('.pm-st'),
      worry: !!m.querySelector('.pt-worry'),
      wear: !!m.querySelector('.pm-feed'),
      inCard: !!f && f.getBoundingClientRect().width > 0
    };
  });
  check('基本画面は草むらの広場', pet.field && pet.inCard);
  check('動物が置かれている', pet.animals >= 1);
  check('動物が自由に動いている', pet.moving);
  check('ひとことは動物からの吹き出し', pet.say);
  check('3つのパラメータは無い', !pet.rings);
  check('わすれかけの呼びかけは無い', !pet.worry);
  // きせかえ機能は廃止（メール指示 2026-09-03）
  check('きせかえのボタンは出ない', !pet.wear);
  // たまごも草むらに置かれる
  await page.evaluate(() => { petGrantEgg(); openPet(); });
  await page.waitForTimeout(200);
  check('たまごも草むらに置いてある', await page.evaluate(() => document.querySelectorAll('#pet-modal .pt-field .pt-egg').length >= 1));
  // PWR で元気が変わる
  const en = await page.evaluate(() => {
    const cls = () => document.querySelector('#pet-modal .pt-field').className;
    const pw = window.petPower;
    window.petPower = () => 0; openPet(); const low = cls();
    window.petPower = () => 999; openPet(); const high = cls();
    window.petPower = pw;
    const hop = k => { const f = document.querySelector('#pet-modal .pt-field'); f.className = k; return getComputedStyle(f).getPropertyValue('--hop').trim(); };
    return { low, high, hopLow: hop('pt-field e0'), hopHigh: hop('pt-field e3') };
  });
  check('PWRが低いと ねむそう', en.low.includes('e0'));
  check('PWRが高いと 元気いっぱい', en.high.includes('e3'));
  check('元気で跳ねかたが変わる', parseFloat(en.hopHigh) > parseFloat(en.hopLow));
  await page.evaluate(() => closePet());

  await page.waitForTimeout(300);
  check('コンソールエラー無し', errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length}/${results.length} passed`);
  process.exit(ng.length ? 1 : 0);
})();
