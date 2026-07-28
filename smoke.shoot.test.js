/* k-tango スペシャル問題（シューティング）スモークテスト
 * 使い方: node smoke.shoot.test.js
 * 検証: 毎日1ROOMずつのスペシャル選出・スタートボタンの見た目と吹き出し・5〜11問目への差し込み・
 *       砲台の操作（スワイプで傾く／タップで発射）・5発で割れる／誤爆でふえる・採点に混ざらないこと
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 602, height: 1178 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/'));
  await page.waitForTimeout(900);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(1400);

  const sp = await page.evaluate(() => ({ b: specialSection('beginner'), m: specialSection('middle'),
    bn: Object.keys(LEVEL_SECTIONS.beginner).length, mn: Object.keys(LEVEL_SECTIONS.middle).length }));
  console.log('  今日のスペシャル: 初級ROOM' + sp.b + ' / 中級ROOM' + sp.m);
  check('初級で1ROOMだけ選ばれる', sp.b >= 1 && sp.b <= sp.bn);
  check('中級で1ROOMだけ選ばれる', sp.m >= 1 && sp.m <= sp.mn);
  check('同じ日は同じROOM（安定）', await page.evaluate(() => specialSection('beginner') === specialSection('beginner')));

  // --- ホーム: スペシャルROOMのスタートボタン ---
  await page.evaluate(async n => { curLevel = 'beginner'; curSection = n; saveLastRoom(); }, sp.b);
  await page.reload();
  await page.waitForTimeout(1600);
  const home = await page.evaluate(n => {
    const sl = document.querySelector(`.room-slide[data-n="${n}"]`);
    const here = sl && sl.querySelector('.sg-tile.now .sg-here');
    const bub = sl && sl.querySelector('.sg-tile.now .sg-spbub');
    const cs = here && getComputedStyle(here);
    const other = document.querySelector(`.room-slide[data-n="${n === 1 ? 2 : 1}"] .sg-tile.now .sg-spbub`);
    return { sp: !!(here && here.classList.contains('sp')), bg: cs && cs.backgroundColor, col: cs && cs.color, sh: cs && cs.boxShadow,
      bub: bub && bub.textContent, other: !!other };
  }, sp.b);
  check(`スタートが白座布団・青文字 (${home.bg} / ${home.col})`, home.sp && home.bg === 'rgb(255, 255, 255)' && home.col === 'rgb(24, 104, 255)');
  check('青枠が付く', /rgb\(24, 104, 255\)/.test(home.sh || ''));
  check(`吹き出しが「スペシャル問題発生中！」(${home.bub})`, home.bub === 'スペシャル問題発生中！');
  check('スペシャルでないROOMには出ない', !home.other);

  // --- テスト: 5〜11問目にシューティングが1問 ---
  const q = await page.evaluate(n => {
    curLevel = 'beginner'; curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 1 };
    startTest(); clearInterval(timer); renderQuestion();
    const idx = state.questions.findIndex(x => x.type === 'sg');
    return { len: state.questions.length, idx, cnt: state.questions.filter(x => x.type === 'sg').length,
      words: state.questions[idx] ? state.questions[idx].shoot.map(w => w.ko + '/' + w.ja) : [] };
  }, sp.b);
  check(`13問になる (${q.len}問)`, q.len === 13);
  check(`シューティングは1問だけ (${q.cnt}問)`, q.cnt === 1);
  check(`5問目〜11問目に入る (${q.idx + 1}問目)`, q.idx >= 4 && q.idx <= 10);

  // --- 通常ROOMには入らない ---
  const normal = await page.evaluate(n => {
    const other = n === 1 ? 2 : 1;
    curSection = other; _boardTile = { level: 'beginner', sec: other, gidx: 1 };
    startTest(); clearInterval(timer); renderQuestion();
    return { len: state.questions.length, sg: state.questions.some(x => x.type === 'sg') };
  }, sp.b);
  check(`通常ROOMは12問のまま (${normal.len}問)`, normal.len === 12 && !normal.sg);

  // --- シューティング画面へ ---
  const view = await page.evaluate(n => {
    curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 1 };
    startTest(); clearInterval(timer);
    state.idx = state.questions.findIndex(x => x.type === 'sg');
    renderQuestion();
    return { bal: document.querySelectorAll('.shg-bal').length, cn: document.querySelectorAll('.shg-cn').length,
      img: document.querySelectorAll('.shg-circ img').length, ja: [...document.querySelectorAll('.shg-ja')].map(e => e.textContent),
      ko: [...document.querySelectorAll('.shg-ko')].map(e => e.textContent),
      need: [...document.querySelectorAll('.shg-need')].map(e => e.textContent), prog: document.getElementById('prog').textContent };
  }, sp.b);
  await page.waitForTimeout(600);
  check(`風船3つ・大砲3つ (${view.bal}/${view.cn})`, view.bal === 3 && view.cn === 3);
  check(`大砲に画像が乗る (${view.img}/3)`, view.img === 3);
  check(`大砲は日本語 (${view.ja.join(',')})`, view.ja.length === 3 && view.ja.every(t => t));
  check(`風船は韓国語 (${view.ko.join(',')})`, view.ko.length === 3 && view.ko.every(t => /[가-힣]/.test(t)));
  check(`必要弾数は5 (${view.need.join(',')})`, view.need.every(t => t === '残り5'));
  check(`出題番号が13問表示 (${view.prog})`, /\/ 13/.test(view.prog));

  // --- 砲台の向きをスワイプで変える（右から左に払う＝右へ傾く） ---
  const dial = await page.evaluate(async () => {
    const el = document.querySelectorAll('.shg-cn')[1], r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + 20;
    const ev = (t, x) => el.dispatchEvent(new PointerEvent(t, { pointerId: 1, clientX: x, clientY: cy, bubbles: true }));
    const before = _shg.cannons[1].ang;
    ev('pointerdown', cx); ev('pointermove', cx - 60); ev('pointerup', cx - 60);
    const after = _shg.cannons[1].ang;
    return { before, after, tf: document.querySelectorAll('.shg-piv')[1].style.transform, bullets: _shg.bullets.length };
  });
  check(`右から左へ払うと右に傾く (${dial.before}° → ${dial.after.toFixed(1)}°)`, dial.after > 20 && /rotate/.test(dial.tf));
  check('スワイプでは発射しない', dial.bullets === 0);

  // --- タップで発射 ---
  const tap = await page.evaluate(async () => {
    const el = document.querySelectorAll('.shg-cn')[0], r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + 20;
    const ev = t => el.dispatchEvent(new PointerEvent(t, { pointerId: 2, clientX: x, clientY: y, bubbles: true }));
    _shg.cannons[0].ang = 0; _shg.cannons[0].last = 0;
    ev('pointerdown'); ev('pointerup');
    return _shg.bullets.length;
  });
  check('タップで1発出る', tap === 1);

  // --- 正しい大砲で必要数当てると割れる／まちがえると必要数がふえる ---
  const play = await page.evaluate(async () => {
    const aim = (ci, bi) => { const c = _shg.cannons[ci], b = _shg.balloons[bi];
      c.ang = Math.atan2(b.x - c.x, c.y - b.y) * 180 / Math.PI; c.last = 0; shgFire(c); };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40 && _shg.bullets.length; i++) await wait(120); // 前の検証で撃った弾を片づける
    const base = _shg.balloons[0].remain;
    // 風船0に、わざと違う大砲から2発
    const wrongCi = _shg.cannons.find(c => c.i !== _shg.balloons[0].wi).i;
    aim(wrongCi, 0); await wait(400); aim(wrongCi, 0);
    for (let i = 0; i < 40 && _shg.balloons[0].remain < base + 2; i++) await wait(100); // 弾が着くまで待つ
    const afterWrong = _shg.balloons[0].remain;
    // 正しい大砲から、ふえたぶんだけ当てる
    const okCi = _shg.balloons[0].wi;
    for (let i = 0; i < afterWrong; i++) { aim(okCi, 0); await wait(330); }
    for (let i = 0; i < 40 && _shg.balloons[0].alive; i++) await wait(100); // 弾が着くまで待つ
    return { base, afterWrong, alive: _shg.balloons[0].alive, done: _shg.cannons.find(c => c.i === okCi).done,
      cls: _shg.cannons.find(c => c.i === okCi).el.className };
  });
  check(`まちがえると必要数がふえる (${play.base}→${play.afterWrong})`, play.afterWrong === play.base + 2);
  check('正しい弾を必要数当てると割れる', !play.alive);
  check('割れた大砲は使用済みになる', play.done && /done/.test(play.cls));

  // --- 3つ割ると次の問題へ ---
  const fin = await page.evaluate(async () => {
    const idx = state.idx, res0 = state.results.length;
    const aim = (ci, bi) => { const c = _shg.cannons[ci], b = _shg.balloons[bi];
      c.ang = Math.atan2(b.x - c.x, c.y - b.y) * 180 / Math.PI; c.last = 0; shgFire(c); };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (const bi of [1, 2]) {
      for (let i = 0; i < 5; i++) { aim(_shg.balloons[bi].wi, bi); await wait(330); }
      for (let i = 0; i < 40 && _shg && _shg.balloons[bi].alive; i++) await wait(100); // 弾が着くまで待つ
    }
    await wait(2200); // CLEAR!演出→次の問題へ
    return { idx, now: state.idx, quiz: document.getElementById('s-quiz').classList.contains('on'),
      shg: !!document.getElementById('shg'), running: !!_shg, res0, results: state.results.length };
  });
  check(`3つ割ると次の問題へ進む (${fin.idx + 1}問目 → ${fin.now + 1}問目)`, fin.now === fin.idx + 1 && fin.quiz && !fin.shg);
  check('ゲームのループが止まる', !fin.running);
  check(`採点には入らない (回答${fin.res0}件→${fin.results}件)`, fin.results === fin.res0);

  // --- 完走できる（1問目からスペシャル入りで通す） ---
  const done = await page.evaluate(async n => {
    curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 1 };
    startTest(); clearInterval(timer); renderQuestion();
    for (let i = 0; i < 20 && !document.getElementById('s-result').classList.contains('on'); i++) {
      const q = state.questions[state.idx];
      if (q.type === 'sg') { shootAdvance(); continue; }
      answered = false; clearInterval(timer); startTimer();
      submit('correct', q.type === 'w' ? q.word.ko : q.correct);
      document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer();
    }
    await new Promise(r => setTimeout(r, 700));
    return { res: document.getElementById('s-result').classList.contains('on'),
      cards: document.querySelectorAll('#s-result .rc-card').length,
      counts: document.querySelector('#s-result .res-counts').textContent.replace(/\s+/g, ' ').trim() };
  }, sp.b);
  check('スペシャル入りでも完走→結果画面', done.res);
  check(`結果は12語のまま (${done.cards}枚 / ${done.counts})`, done.cards === 12);

  check('コンソールエラー無し', errors.length === 0);
  if (errors.length) console.log('  errors:', errors);
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
