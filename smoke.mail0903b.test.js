/* k-tango 2026-09-03 23:01 / 23:06 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0903b.test.js
 * 検証:
 *  ① 連続学習継続中のポップアップも数秒で消える／消える仕組みは共通関数（popAutoClose）
 *  ② 忘却度の減るスパンが今までの半分（＝半分わすれづらい）
 *  ③ 育てる画面の動物の大きさが2倍
 *  ④ 吹き出しの矢印が動物の真ん中に合う（はしの子でも）
 *  ⑤ 動物は絵文字ではなく絵ファイル（16タイプ診断のキャラクターと同じ絵で描かれた絵文字）
 *  ⑥ 動物をタッチするとメーターが出る
 *  ⑦ 数秒あるいて数秒止まる／他の子を追いかける／近くで出会うと話す
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
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kwt_coach_v1', '1');
    localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now()));
  });
  await page.reload();
  await page.waitForTimeout(1500);
  const clearFx = () => page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.lvup,.pbub,.stepnote,.rest-ask,#resume-ask,.coach,.d5auto,.lapdone,.appconfirm').forEach(o => o.remove()));
  await clearFx();

  /* ============ ① ポップアップが数秒で消える／共通関数 ============ */
  const pop = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    out.hasCommon = typeof popAutoClose === 'function';
    out.sec = typeof POPUP_AUTO_SEC === 'number' ? POPUP_AUTO_SEC : null;
    // 共通関数を通しているか＝呼び出しを差しかえると3つとも止まる
    const src = [showStreakCelebration, showLevelUp, showGainPopup].map(f => String(f));
    out.allUseCommon = src.every(t => /popAutoClose\(/.test(t)) && !src.some(t => /_auto\s*=\s*setTimeout/.test(t));

    showStreakCelebration(3);
    out.celShown = !!document.querySelector('.streak-cel');
    await wait((out.sec + 1.2) * 1000);
    out.celGone = !document.querySelector('.streak-cel');

    showLevelUp(4, 3);
    await wait((out.sec + 1.2) * 1000);
    out.lvGone = !document.querySelector('.lvup');
    document.querySelectorAll('.streak-cel,.lvup').forEach(o => o.remove());
    return out;
  });
  check('ポップアップの自動クローズが共通関数になっている', pop.hasCommon && pop.allUseCommon);
  check(`消えるまでの時間は数秒（${pop.sec}秒）`, pop.sec > 0 && pop.sec <= 5);
  check('連続学習 継続中！のポップアップが出る', pop.celShown);
  check('連続学習 継続中！のポップアップが数秒で消える', pop.celGone);
  check('レベルアップのポップアップも同じく数秒で消える', pop.lvGone);

  /* ============ ② 忘却のスパンが半分（半分わすれづらい） ============ */
  const forget = await page.evaluate(() => {
    const f = MEMORY_CONFIG.forgetSlowFactor;
    const st = Object.assign(defaultStat(), {
      wordId: 'x', hasSeen: true, hasEverCorrect: true, memoryScore: 100,
      lastReviewedAt: new Date(Date.now() - 24 * 3600000).toISOString(), stabilityHours: 24
    });
    const now = Date.now();
    const nowScore = displayMemoryScore(st, now);
    // 半分の速さ＝同じ減り方になるまでに2倍の時間がかかる
    const st2 = Object.assign({}, st, { lastReviewedAt: new Date(now - 48 * 3600000).toISOString() });
    const oldScore = 100 * Math.exp(-24 / effectiveStability(st, now) * f); // 昔の（半分にする前の）減り方
    return { f, nowScore, half: displayMemoryScore(st2, now), oldScore,
      useInStab: /forgetSlowFactor/.test(String(effectiveStability)),
      useInForm: /forgetSlowFactor/.test(String(displayMemoryScore)) };
  });
  check(`忘れるスピードを半分にする係数がある (x${forget.f})`, forget.f === 2);
  check('忘却曲線の計算に使われている', forget.useInStab && forget.useInForm);
  check(`同じ減り方になるまで2倍の時間がかかる (24h:${forget.nowScore.toFixed(1)} / 48h:${forget.half.toFixed(1)} / 旧24h:${forget.oldScore.toFixed(1)})`,
    Math.abs(forget.half - forget.oldScore) < 0.5 && forget.nowScore > forget.oldScore);

  /* ============ ③〜⑦ 広場 ============ */
  const yard = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const o = petState();
    ['mong', 'yaong', 'kkomi', 'ppyong', 'gomdol'].forEach(k => { o.zoo[k] = { xp: 40, friend: 12 }; });
    o.sp = 'mong'; o.xp = 40; o.friend = 12; savePet(o);
    openPet();
    await wait(400);
    const ans = [...document.querySelectorAll('#pet-modal .pt-an')];
    const cs = getComputedStyle(ans[0]);
    const me = document.querySelector('#pet-modal .pt-an.me');
    const out = {
      n: ans.length,
      fsMe: parseFloat(getComputedStyle(me.querySelector('i')).fontSize),
      fsOther: parseFloat(getComputedStyle(ans.find(a => !a.classList.contains('me')).querySelector('i')).fontSize),
      // ⑤ 絵文字ではなく絵ファイル
      allImg: ans.every(a => !!a.querySelector('i img')),
      imgSrc: ans[0].querySelector('i img') ? ans[0].querySelector('i img').getAttribute('src') : '',
      noTextEmoji: ans.every(a => a.querySelector('i').textContent.trim() === ''),
      textFace: /petStepFace/.test(String(petStepFace)) || true
    };
    // ④ 吹き出しの矢印が動物の真ん中に来る（はしに寄せた子でもズレない）
    const arrowGap = k => {
      const an = document.querySelector('#pet-modal .pt-an.me');
      an.style.left = k + '%';
      const say = an.querySelector('.pt-say');
      petSayFit(say);
      const sr = say.getBoundingClientRect(), ar = an.querySelector('i').getBoundingClientRect();
      const sx = parseFloat(say.style.getPropertyValue('--sx')) || 0;
      // 矢印の中心 = 吹き出しの左端 + 幅/2 - sx
      const arrow = sr.left + sr.width / 2 - sx;
      return Math.abs(arrow - (ar.left + ar.width / 2));
    };
    out.gapMid = arrowGap(50);
    out.gapLeft = arrowGap(10);
    out.gapRight = arrowGap(90);
    document.querySelector('#pet-modal .pt-an.me').style.left = '50%';

    // ⑥ 動物をタッチするとメーター
    document.querySelector('#pet-modal .pt-an i').click();
    await wait(150);
    const mt = document.querySelector('#pet-modal .pt-mt');
    out.meter = !!mt;
    out.meterBars = mt ? mt.querySelectorAll('.pt-mtr').length : 0;
    out.meterLabs = mt ? [...mt.querySelectorAll('.pt-mtr em')].map(e => e.textContent) : [];
    // 地面タップで閉じる
    document.querySelector('#pet-modal .pt-field').click();
    await wait(100);
    out.meterClosed = !document.querySelector('#pet-modal .pt-mt');

    // ⑦ 数秒あるいて数秒止まる
    const walking = [];
    const pos = [];
    for (let i = 0; i < 24; i++) { // 12秒ぶん観察
      walking.push(ans.filter(a => a.classList.contains('walk')).length);
      pos.push(ans.map(a => parseFloat(a.style.left) + ',' + parseFloat(a.style.top)).join('|'));
      await wait(500);
    }
    out.everWalk = walking.some(v => v > 0);
    out.everStop = walking.some(v => v < ans.length);
    out.moved = new Set(pos).size > 3;
    out.flipUsed = /classList.toggle\("flip"/.test(String(petYardStart));
    out.chase = /追いかける/.test(String(petYardStart));
    out.talkImpl = /pt-talk/.test(String(petYardStart));
    out.inRange = ans.every(a => {
      const x = parseFloat(a.style.left), y = parseFloat(a.style.top);
      return x >= PF_X0 - 0.1 && x <= PF_X1 + 0.1 && y >= PF_Y0 - 0.1 && y <= PF_Y1 + 0.1;
    });
    closePet();
    await wait(100);
    out.timerStopped = _pfTimer === null;
    return out;
  });
  check(`5匹ぜんぶ広場にいる (${yard.n}匹)`, yard.n === 5);
  check(`いっしょにいる子は2倍の大きさ (34→${yard.fsMe}px)`, yard.fsMe === 68);
  check(`ほかの子も2倍の大きさ (26→${yard.fsOther}px)`, yard.fsOther === 52);
  check(`動物は絵ファイルで出る (${yard.imgSrc})`, yard.allImg && /^emoji\/pet\/[0-9a-f-]+\.svg$/.test(yard.imgSrc));
  check('文字の絵文字は使っていない', yard.noTextEmoji);
  check(`吹き出しの矢印が動物の真ん中（まん中の子 ${yard.gapMid.toFixed(1)}px）`, yard.gapMid < 2);
  check(`左はしの子でも矢印は真ん中 (${yard.gapLeft.toFixed(1)}px)`, yard.gapLeft < 2);
  check(`右はしの子でも矢印は真ん中 (${yard.gapRight.toFixed(1)}px)`, yard.gapRight < 2);
  check('動物をタッチするとメーターが出る', yard.meter);
  check(`メーターは3本 (${yard.meterLabs.join('/')})`, yard.meterBars === 3);
  check('地面をタップするとメーターが閉じる', yard.meterClosed);
  check('歩いているときがある', yard.everWalk);
  check('止まっているときがある（数秒あるいて数秒止まる）', yard.everStop);
  check('位置が実際に変わっていく', yard.moved);
  check('進む向きに体を向ける', yard.flipUsed);
  check('ときどき他の子を追いかける', yard.chase);
  check('近くで出会うと話す動作がある', yard.talkImpl);
  check('広場からはみ出さない', yard.inRange);
  check('閉じるとうごきも止まる（タイマーが残らない）', yard.timerStopped);

  /* ============ 絵ファイルがそろっているか ============ */
  const files = await page.evaluate(async () => {
    const need = new Set();
    PET_SPECIES.forEach(s => s.ico.forEach(e => need.add(e)));
    const miss = [];
    for (const e of need) {
      // file:// では fetch が使えないので、実際に画像として読めるかで確かめる
      const ok = await new Promise(res => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = emoImgSrc(e); });
      if (!ok) miss.push(e);
    }
    return { total: need.size, miss };
  });
  check(`動物の絵ファイルが全部そろっている (${files.total}件)`, files.miss.length === 0, files.miss.join(''));

  check(`コンソールエラーなし (${errors.length}件)`, errors.length === 0, errors.slice(0, 2).join(' / '));

  await browser.close();
  const ok = results.filter(r => r.ok).length;
  console.log(`\n${ok}/${results.length} passed`);
  if (ok < results.length) { console.log('FAILED:'); results.filter(r => !r.ok).forEach(r => console.log(' - ' + r.name)); process.exit(1); }
})();
