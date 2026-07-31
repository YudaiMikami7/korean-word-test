/* k-tango 2026-08-01 00:49 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0801.test.js
 * 検証:
 *  ① ゲームクリアの演出は、そのマスを器の真ん中に置いた状態で出る
 *  ② 次へ進むときは、次のマスが真ん中に来る位置までスクロールしてから玉が飛ぶ
 *  ③ 画面上部の帯：正解でも不正解でもカードを獲得する
 *  ④ 地面は緑の市松ではなく白い線
 *  ⑤ 帯の背景はナシ／カードは黄色座布団＋白枠＋黒影
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
  const normalRoom = await page.evaluate(() => { const sp = specialRooms().beginner; let n = 1; while ([sp.blue, sp.red, sp.green].includes(n)) n++; return n; });

  // ================= ③④⑤ 出題画面の帯 =================
  await page.evaluate(n => {
    curLevel = 'beginner'; curSection = n; _boardTile = null;
    startTest(); clearInterval(timer); renderQuestion();
  }, normalRoom);
  await page.waitForTimeout(300);

  const bar = await page.evaluate(() => {
    const p = document.querySelector('.pbar'), g = document.querySelector('.rn-ground');
    const cs = getComputedStyle(p), cg = getComputedStyle(g);
    return { pbg: cs.backgroundColor, pimg: cs.backgroundImage,
             gimg: cg.backgroundImage, gh: parseFloat(cg.height), gpos: cg.backgroundPositionX };
  });
  check(`帯の背景はナシ (${bar.pbg} / ${bar.pimg})`,
    /rgba\(0, 0, 0, 0\)|transparent/.test(bar.pbg) && bar.pimg === 'none');
  check(`地面に緑の市松は残っていない (${bar.gimg.slice(0, 60)})`, !/127, 181, 107|110, 164, 91/.test(bar.gimg));
  check(`地面は白い線 (高さ${bar.gh}px)`, /255, 255, 255/.test(bar.gimg) && bar.gh <= 4 && bar.gh > 0);

  const slot = await page.evaluate(() => {
    const s = document.querySelector('#rn-rail .rn-slot'), cs = getComputedStyle(s);
    const r = s.getBoundingClientRect();
    return { bg: cs.backgroundColor, bw: cs.borderTopWidth, bc: cs.borderTopColor, sh: cs.boxShadow,
             w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
  });
  check(`札は黄色い座布団 (${slot.bg})`, slot.bg === 'rgb(245, 197, 24)');
  check(`札に白い枠がある (${slot.bw} ${slot.bc})`, parseFloat(slot.bw) >= 2 && slot.bc === 'rgb(255, 255, 255)');
  check(`札に黒い影が付く (${slot.sh})`, /rgba?\(0, 0, 0/.test(slot.sh));
  check(`枠を付けても札の大きさは変わらない (${slot.w}x${slot.h})`, slot.h > slot.w);

  const cards = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const rail = document.getElementById('rn-rail');
    runnerBuild(12);
    const slots = [...rail.querySelectorAll('.rn-slot')];
    runnerStep(true);  const ok = { got: slots[0].classList.contains('got'), pop: slots[0].classList.contains('pop'), fly: slots[0].style.getPropertyValue('--fly') };
    await wait(60);
    runnerStep(false); const ng = { got: slots[1].classList.contains('got'), pop: slots[1].classList.contains('pop'), fly: slots[1].style.getPropertyValue('--fly') };
    const anim = getComputedStyle(slots[1]).animationName;
    return { ok, ng, anim, popCss: !!document.querySelector('.rn-slot.pop') };
  });
  check(`正解でカードを獲得する (${cards.ok.fly})`, cards.ok.got && !cards.ok.pop);
  check(`不正解でもカードを獲得する (${cards.ng.fly})`, cards.ng.got && !cards.ng.pop);
  check(`不正解の札もキャラのほうへ飛ぶ (${cards.anim})`, /rnCardGot/.test(cards.anim));
  check('はじけて消える札はもう出ない', !cards.popCss);

  const restore = await page.evaluate(() => {
    state.idx = 3; state.results = [{ isCorrect: true }, { isCorrect: false }, { isCorrect: true }];
    runnerBuild(12); runnerRestore();
    const slots = [...document.querySelectorAll('#rn-rail .rn-slot')].slice(0, 3);
    return { got: slots.filter(s => s.classList.contains('got')).length, pop: slots.filter(s => s.classList.contains('pop')).length };
  });
  check(`途中復帰でも解いたぶんは全部獲得済み (got${restore.got}/pop${restore.pop})`, restore.got === 3 && restore.pop === 0);
  await page.evaluate(() => { quitTest(); document.querySelectorAll('.overlay').forEach(o => o.remove()); });
  await page.waitForTimeout(300);

  // ================= ①② すごろく：クリア演出は真ん中／次のマスへスクロール =================
  await page.evaluate(n => {
    document.querySelectorAll('.pbub,.stepnote,.sg-clear,.sg-adv,.sg-pirin,.overlay').forEach(o => o.remove());
    // 5マス消化済み＝次は6マス目。クリアすると7マス目がいまのマスになる
    const key = 'beginner-' + String(n).padStart(2, '0');
    const t = {}; for (let i = 1; i <= 5; i++) t[i] = { rank: 'B', score: 70, at: new Date().toISOString() };
    localStorage.setItem('kwt_board_v1', JSON.stringify({ [key]: { cleared: 5, tiles: t } }));
    show('s-home'); buildRoomSlides();
    curLevel = 'beginner'; curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 6 };
    startTest();
    const N = state.questions.length;
    for (let i = 0; i < N; i++) {
      const q = state.questions[state.idx]; if (!q) break;
      if (q.type === 'sg' || q.type === 'sg4') { shootAdvance(); continue; }
      answered = false; clearInterval(timer); startTimer();
      submit('correct', q.type === 'w' ? q.word.ko : q.correct);
      document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer();
    }
  }, normalRoom);
  await page.waitForTimeout(3800);

  // 演出を出す前に、わざと現在地から離れた位置までスクロールしておく
  const start = await page.evaluate(() => {
    document.querySelectorAll('.stepnote,.sg-adv,.sg-pirin,.sg-clear').forEach(e => e.remove());
    show('s-home');
    const bt = _lastBoardTile;
    const sc = document.querySelector('.room-slide[data-n="' + bt.sec + '"] .sg-scroll');
    sc.scrollTop = 0;
    const sl = document.querySelector('.room-slide[data-n="' + bt.sec + '"]');
    const from = sl.querySelector('.sg-tile[aria-label="マス' + bt.gidx + '"]');
    const scR = sc.getBoundingClientRect(), fr = from.getBoundingClientRect();
    return { gidx: bt.gidx, off: Math.abs((fr.top + fr.height / 2) - (scR.top + scR.height / 2)) };
  });
  check(`演出前はクリアしたマスが真ん中にない (中心から${Math.round(start.off)}px)`, start.off > 60);

  const clear = await page.evaluate(() => {
    showStepAdvance();
    const bt = _lastBoardTile;
    const sl = document.querySelector('.room-slide[data-n="' + bt.sec + '"]');
    const sc = sl.querySelector('.sg-scroll');
    const from = sl.querySelector('.sg-tile[aria-label="マス' + bt.gidx + '"]');
    const el = document.querySelector('.sg-clear');
    const scR = sc.getBoundingClientRect(), fr = from.getBoundingClientRect();
    const homeBtn = sl.querySelector('.sg-home');
    return {
      shown: !!el, text: el ? el.querySelector('.sgc-t').textContent : '',
      dy: (fr.top + fr.height / 2) - (scR.top + scR.height / 2),
      fxDy: el ? parseFloat(el.style.top) - (scR.top + scR.height / 2) : 999,
      homeOn: homeBtn ? homeBtn.classList.contains('on') : false
    };
  });
  check(`CLEARの演出が出る (${clear.text})`, clear.shown && clear.text === 'CLEAR');
  check(`クリアしたマスが器の真ん中にある (中心から${Math.round(clear.dy)}px)`, Math.abs(clear.dy) <= 12);
  check(`CLEARの文字も真ん中に出る (中心から${Math.round(clear.fxDy)}px)`, Math.abs(clear.fxDy) <= 12);
  check('演出中に現在地ボタンは出ない', !clear.homeOn);

  // CLEAR(1180ms)が終わると、次のマスが真ん中に来るまでスクロールする
  await page.waitForTimeout(1180 + 520);
  const scrolled = await page.evaluate(() => {
    const bt = _lastBoardTile;
    const sl = document.querySelector('.room-slide[data-n="' + bt.sec + '"]');
    const sc = sl.querySelector('.sg-scroll');
    const to = sl.querySelector('.sg-tile[aria-label="マス' + (bt.gidx + 1) + '"]');
    const scR = sc.getBoundingClientRect(), tr = to.getBoundingClientRect();
    return { dy: (tr.top + tr.height / 2) - (scR.top + scR.height / 2), now: to.classList.contains('now'),
             flying: !!document.querySelector('.sg-adv'), top: Math.round(sc.scrollTop) };
  });
  check('進んだ先がいまのマスになっている', scrolled.now);
  check(`次のマスが真ん中まで移動する (中心から${Math.round(scrolled.dy)}px)`, Math.abs(scrolled.dy) <= 12);
  check('真ん中へ寄せたあとに光の玉が飛ぶ', scrolled.flying);

  await page.waitForTimeout(900); // 玉が着く(760ms)
  const landed = await page.evaluate(() => {
    const bt = _lastBoardTile;
    const sl = document.querySelector('.room-slide[data-n="' + bt.sec + '"]');
    const sc = sl.querySelector('.sg-scroll');
    const to = sl.querySelector('.sg-tile[aria-label="マス' + (bt.gidx + 1) + '"]');
    const pi = document.querySelector('.sg-pirin');
    const scR = sc.getBoundingClientRect(), tr = to.getBoundingClientRect();
    return { recolor: to.querySelector('.sg-img').classList.contains('recolor'),
             pirinDy: pi ? parseFloat(pi.style.top) - (scR.top + scR.height / 2) : 999,
             dy: (tr.top + tr.height / 2) - (scR.top + scR.height / 2),
             homeOn: sl.querySelector('.sg-home').classList.contains('on') };
  });
  check('着いたらカラーに戻る（既存の演出は健在）', landed.recolor);
  check(`「ピラン」も真ん中で光る (中心から${Math.round(landed.pirinDy)}px)`, Math.abs(landed.pirinDy) <= 12);
  check(`演出後もいまのマスは真ん中のまま (中心から${Math.round(landed.dy)}px)`, Math.abs(landed.dy) <= 12);
  check('演出後に現在地ボタンは出ていない', !landed.homeOn);

  await page.waitForTimeout(1400);
  const note = await page.evaluate(() => { const e = document.querySelector('.stepnote'); return e ? e.textContent.trim() : ''; });
  check(`最後に「進みました」が出る (${note})`, /進みました/.test(note));

  check(`コンソールエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log('FAILED: ' + failed.map(r => r.name).join(' / ')); process.exit(1); }
})();
