/* k-tango 2026-07-31 21:12 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0731.test.js
 * 検証:
 *  ・結果画面の下段は「応援する / シェアする / その形式ごとの一手 / ホーム」の4ボタンで統一
 *    （通常テスト・今日の5問・今日のトレンド・スペシャル問題）
 *  ・今日の5問の結果は 出題→その下に答え。まちがえた行だけ自分の回答が出る（「あなた：〜／正解：〜」は廃止）
 *  ・結果画面のメーター2本は、ホームのステータスバーと同じ太さ・同じ行送り
 *  ・テストから帰ると、クリアしたマスから次のマスへ光の玉が飛び、着いた先がモノクロ→カラーに戻る（効果音つき）
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const LABS = ['応援する', 'シェアする', null, 'ホーム']; // 3番目だけ形式ごとに変わる

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 602, height: 1178 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); });
  await page.reload();
  await page.waitForTimeout(1500);
  const normalRoom = await page.evaluate(() => { const sp = specialRooms().beginner; let n = 1; while ([sp.blue, sp.red, sp.green].includes(n)) n++; return n; });
  // ホームのステータスバー（XP／PWR）の実寸。結果画面のメーターはこれと同じでなければならない
  const homeBar = await page.evaluate(() => {
    const x = e => e.getBoundingClientRect();
    const g1 = document.querySelector('.hv-xpg'), g2 = document.querySelector('.hv-pwrg');
    return { h: x(g1).height, pitch: x(g2).top - x(g1).top,
             lab: parseFloat(getComputedStyle(document.querySelector('.hv-xplabel')).fontSize) * x(g1).height / 19 };
  });

  // ---------- 今日の5問の結果画面 ----------
  await page.evaluate(() => {
    startDaily5();
    for (let i = 0; i < 5; i++) {
      const q = state.questions[state.idx]; if (!q) break;
      answered = false; clearInterval(timer); startTimer();
      const wrong = (i === 1 || i === 3);                       // 2問目・4問目だけわざと間違える
      submit(wrong ? 'incorrect' : 'correct', wrong ? 'ちがう' : q.correct);
      if (_d5.on) { document.querySelectorAll('.d5-ack').forEach(o => o.remove()); afterAnswer(); }
    }
  });
  await page.waitForTimeout(8000); // 5問ぶんの判定アニメが終わるまで
  const d5 = await page.evaluate(() => {
    const labs = [...document.querySelectorAll('#s-d5result .res-btns .rb-lab')].map(e => e.textContent.trim());
    const rows = [...document.querySelectorAll('#s-d5result .d5r-row')].map(r => ({
      q: r.querySelector('.d5r-q').textContent.trim(),
      a: r.querySelector('.d5r-a') ? r.querySelector('.d5r-a').textContent.trim() : '',
      your: r.querySelector('.d5r-your') ? r.querySelector('.d5r-your').textContent.trim() : '',
      ok: r.querySelector('.d5r-mk').classList.contains('o'),
      belowQ: r.querySelector('.d5r-a').getBoundingClientRect().top >= r.querySelector('.d5r-q').getBoundingClientRect().bottom - 1
    }));
    const items = d5Rec().items;
    return { labs, rows, correct: items.map(it => it.correct) };
  });
  check(`今日の5問の結果は4ボタン (${d5.labs.join(' / ')})`, d5.labs.length === 4);
  check('①応援する ②シェアする ④ホーム', d5.labs[0] === LABS[0] && d5.labs[1] === LABS[1] && d5.labs[3] === LABS[3]);
  check(`③は「次までの時間」(${d5.labs[2]})`, d5.labs[2] === '次までの時間');
  check('「あなた：〜／正解：〜」の表記は無くなった', d5.rows.every(r => !/正解：/.test(r.a) && !/^あなた/.test(r.a)));
  check('答えは出題の下に出る', d5.rows.every(r => r.belowQ));
  check('答えの中身は正解そのもの', d5.rows.every((r, i) => r.a === d5.correct[i]));
  check('正解した行に自分の回答は出さない', d5.rows.filter(r => r.ok).every(r => r.your === ''));
  check('まちがえた行だけ自分の回答が出る', d5.rows.filter(r => !r.ok).length === 2 && d5.rows.filter(r => !r.ok).every(r => /^あなた：/.test(r.your)));

  // ---------- 今日のトレンド問題の結果画面 ----------
  const tr = await page.evaluate(() => {
    const rec = { slot: 'trend', finished: new Date().toISOString(), correct: 3, total: 5,
      items: [1, 2, 3, 4, 5].map(n => ({ n, type: 'kj', q: '사과', your: 'りんご', correct: 'りんご', status: n <= 3 ? 'correct' : 'incorrect', ok: n <= 3, ko: '사과', ja: 'りんご' })) };
    d5RenderResult(rec, false, true);
    return [...document.querySelectorAll('#s-d5result .res-btns .rb-lab')].map(e => e.textContent.trim());
  });
  check(`トレンドの結果も4ボタン (${tr.join(' / ')})`, tr.length === 4 && tr[0] === LABS[0] && tr[1] === LABS[1] && tr[3] === LABS[3]);
  check(`トレンドの③は「トレンド単語」(${tr[2]})`, tr[2] === 'トレンド単語');

  // ---------- スペシャル問題（ゲーム）の結果画面 ----------
  const sp = await page.evaluate(() => {
    _spResult('🧠', '神経衰弱', '<b>6</b>組', 'よくできました', () => {}, 10, []);
    const labs = [...document.querySelectorAll('#spov .res-btns .rb-lab')].map(e => e.textContent.trim());
    const menu = !!document.querySelector('#spov .sp-tolist');
    spExitGame();
    return { labs, menu };
  });
  check(`スペシャル問題の結果も4ボタン (${sp.labs.join(' / ')})`, sp.labs.length === 4 && sp.labs[0] === LABS[0] && sp.labs[1] === LABS[1] && sp.labs[3] === LABS[3]);
  check(`スペシャルの③は「もう一度」(${sp.labs[2]})`, sp.labs[2] === 'もう一度');
  check('「スペシャル選択へ」は残っている', sp.menu);

  // ---------- 通常テストの結果画面（4ボタン・メーターの寸法） ----------
  await page.evaluate(n => {
    show('s-home');
    curLevel = 'beginner'; curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 1 };
    startTest();
    const N = state.questions.length;
    for (let i = 0; i < N; i++) {
      const q = state.questions[state.idx]; if (!q) break;
      if (q.type === 'sg' || q.type === 'sg4') { shootAdvance(); continue; }
      answered = false; clearInterval(timer); startTimer();
      submit(i % 4 === 3 ? 'incorrect' : 'correct', q.type === 'w' ? (i % 4 === 3 ? '' : q.word.ko) : (i % 4 === 3 ? 'ちがう' : q.correct));
      document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer();
    }
  }, normalRoom);
  await page.waitForTimeout(3800);
  const res = await page.evaluate(() => {
    const labs = [...document.querySelectorAll('#s-result .res-btns .rb-lab')].map(e => e.textContent.trim());
    const x = e => e.getBoundingClientRect();
    const mg = [...document.querySelectorAll('#s-result .res-meters .res-mg')];
    const rows = [...document.querySelectorAll('#s-result .res-mrow')];
    return {
      labs,
      gh: x(mg[0]).height, gh2: x(mg[1]).height,
      pitch: x(rows[1]).top - x(rows[0]).top,
      lab: parseFloat(getComputedStyle(document.querySelector('#s-result .res-mlab')).fontSize),
      headIn: x(document.querySelector('#s-result .res-head')).bottom <= x(document.querySelector('#s-result .res-listwrap')).top + 1,
      fits: x(document.querySelector('#s-result .res-btns')).bottom <= window.innerHeight + 1
    };
  });
  check(`通常の結果も同じ4ボタン (${res.labs.join(' / ')})`, res.labs.length === 4 && res.labs[0] === LABS[0] && res.labs[1] === LABS[1] && res.labs[3] === LABS[3]);
  check(`通常の③は「もう一度」(${res.labs[2]})`, res.labs[2] === 'もう一度');
  check(`メーターの太さがホームのステータスバーと同じ (${res.gh.toFixed(1)} / ${homeBar.h.toFixed(1)})`, near(res.gh, homeBar.h, 1) && near(res.gh2, homeBar.h, 1));
  check(`2本の行送りもホームと同じ (${res.pitch.toFixed(1)} / ${homeBar.pitch.toFixed(1)})`, near(res.pitch, homeBar.pitch, 1.5));
  check(`ラベルの字もホームと同じ大きさ (${res.lab.toFixed(1)} / ${homeBar.lab.toFixed(1)})`, near(res.lab, homeBar.lab, 0.6));
  check('上のステータスエリアが単語一覧に重ならない', res.headIn);
  check('ボタンまで画面内に収まる', res.fits);

  // ---------- ホームへ戻ると1マス進む演出 ----------
  // ※2026-07-31の追加指示で、進む演出の前に「CLEAR」＋ランクバッジが入る（smoke.mail0731b.test.js で検証）
  const step = await page.evaluate(() => {
    const sfx = []; const orig = window.sfxStepUp;
    window.sfxStepUp = function () { sfx.push(1); return orig.apply(this, arguments); };
    show('s-home');
    document.querySelectorAll('.stepnote,.sg-adv,.sg-pirin,.sg-clear').forEach(e => e.remove());
    showStepAdvance();
    const bt = _lastBoardTile;
    const sl = document.querySelector('.room-slide[data-n="' + bt.sec + '"]');
    const to = sl.querySelector('.sg-tile[aria-label="マス' + (bt.gidx + 1) + '"]');
    return { sec: bt.sec, gidx: bt.gidx, now: to.classList.contains('now'), sfx };
  });
  await page.waitForTimeout(1250); // 「CLEAR」の演出が終わってから、次のマスへ飛ぶ
  const hop = await page.evaluate(() => {
    const bt = _lastBoardTile;
    const sl = document.querySelector('.room-slide[data-n="' + bt.sec + '"]');
    const to = sl.querySelector('.sg-tile[aria-label="マス' + (bt.gidx + 1) + '"]');
    return { gidx: bt.gidx, now: to.classList.contains('now'),
             flying: !!document.querySelector('.sg-adv'),
             gray: to.querySelector('.sg-img').classList.contains('preadv') };
  });
  check(`クリアした次のマスが現在地になっている (マス${step.gidx}→${step.gidx + 1})`, step.now && hop.now);
  check('光の玉が次のマスへ飛ぶ', hop.flying);
  check('着くまで進む先はモノクロで待つ', hop.gray);
  await page.waitForTimeout(1000);
  const land = await page.evaluate(() => {
    const bt = _lastBoardTile;
    const sl = document.querySelector('.room-slide[data-n="' + bt.sec + '"]');
    const im = sl.querySelector('.sg-tile[aria-label="マス' + (bt.gidx + 1) + '"] .sg-img');
    const cs = getComputedStyle(im);
    return { recolor: im.classList.contains('recolor'), gray: im.classList.contains('preadv'),
             anim: cs.animationName, pirin: !!document.querySelector('.sg-pirin'),
             rays: document.querySelectorAll('.sg-pirin .sgp-ray').length };
  });
  check('着いたらモノクロ→カラーに戻る', land.recolor && !land.gray);
  check(`いまのマスの常時アニメより優先される (${land.anim})`, /sgRecolor/.test(land.anim));
  check(`光が「ピラン」とはじける (放射${land.rays}本)`, land.pirin && land.rays === 8);
  await page.waitForTimeout(1200);
  const note = await page.evaluate(() => {
    const el = document.querySelector('.stepnote');
    return { shown: !!el, text: el ? el.textContent.trim() : '' };
  });
  check(`演出のあとに「進みました」が出る (${note.text})`, note.shown && /進みました/.test(note.text));

  check(`コンソールエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} ${failed.length ? 'passed（FAILあり）' : 'PASS'}`);
  process.exit(failed.length ? 1 : 0);
})();
