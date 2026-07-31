/* k-tango 2026-07-31 22:54 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0731b.test.js
 * 検証:
 *  ① 通常テスト後にホームへ戻ると、次のマスへ進む演出の前に、
 *     いまやったマスで「CLEAR」がはじけ、ランクバッジがアニメーションで付く
 *  ② 「最近学んだ単語」の帯と単語帳の黄色いカードは、絵がはみ出さない縦長カード（結果画面と同じ作り）
 *  ③ 単語帳を開いたら「今日のトレンド」ボタンが消える
 *  ④ ルームメニューのランクは直近1つだけ。空いた場所に「n周目 x/12」が出る
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
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); });
  await page.reload();
  await page.waitForTimeout(1500);
  const normalRoom = await page.evaluate(() => { const sp = specialRooms().beginner; let n = 1; while ([sp.blue, sp.red, sp.green].includes(n)) n++; return n; });

  // ================= ④ ルームメニュー：直近ランク1つ＋周回表示 =================
  const menu = await page.evaluate(n => {
    // 1周目を5マスぶん消化した状態にして描き直す
    const key = 'beginner-' + String(n).padStart(2, '0');
    const t = {}; for (let i = 1; i <= 5; i++) t[i] = { rank: 'B', score: 70, at: new Date().toISOString() };
    localStorage.setItem('kwt_board_v1', JSON.stringify({ [key]: { cleared: 5, tiles: t } }));
    const sec = {}; sec[key] = { recentRanks: ['D', 'C', 'B', 'A', 'S'], bestRank: 'S' }; // ランク履歴は5件ある
    localStorage.setItem('kwt_sections_v1', JSON.stringify(sec));
    curLevel = 'beginner'; curSection = n; buildRoomSlides();
    const sl = document.querySelector(`.room-slide[data-n="${n}"]`);
    const lap = sl.querySelector('.hv-lap');
    const big = sl.querySelector('.rank-b');
    return {
      smalls: sl.querySelectorAll('.rank-s').length,
      big: big && big.textContent.trim(),
      lapTxt: lap && lap.textContent.replace(/\s+/g, ''),
      lapSize: boardLapSize('beginner', n),
      chipGone: !document.querySelector('.sg-prog'),
      inMenu: !!(lap && lap.closest('.rmenu-clip')),
      outsideBoard: !!(lap && !(sl.querySelector('.sg-wrap') || document.body).contains(lap)),
      overlap: (() => { // 直近ランクの円と重ならない
        if (!lap || !big) return true;
        const a = lap.getBoundingClientRect(), b = big.getBoundingClientRect();
        return a.right <= b.left + 1;
      })()
    };
  }, normalRoom);
  check('ルームメニューの小さいランク円（1つ前・2つ前）は無くなった', menu.smalls === 0);
  check(`直近のランクだけ残っている (${menu.big})`, menu.big === 'S');
  check(`空いた場所に「n周目 x/12」が出る (${menu.lapTxt})`, menu.lapTxt === `1周目5/${menu.lapSize}`);
  check('周回表示はルームメニューの中にある', menu.inMenu);
  check('すごろく側の進捗チップは無くなった（重複表示なし）', menu.chipGone);
  check('周回表示はすごろくの器の外にある', menu.outsideBoard);
  check('周回表示が直近ランクの円と重ならない', menu.overlap);

  // ================= ② 黄色いカードは縦長・絵はカードの中 =================
  await page.evaluate(() => { // 帯に出す語をつくる（最近学んだ単語）
    const ids = LEVEL_SECTIONS.beginner[curSection].slice(0, 12), s = {}, c = {};
    ids.forEach((id, i) => {
      s[id] = { hasSeen: true, hasEverCorrect: true, memoryScore: 60, stabilityHours: 20, wordDifficulty: 1,
                reviewCount: 2, lastAnsweredAt: new Date(Date.now() - i * 60000).toISOString(), firstCorrectAt: new Date().toISOString() };
      c[id] = 3;
    });
    localStorage.setItem('kwt_stats_v2', JSON.stringify(s));
    localStorage.setItem('kwt_cards_v1', JSON.stringify(c));
    renderHome();
  });
  await page.waitForTimeout(900);
  const band = await page.evaluate(() => {
    const card = document.querySelector('#today-band .tb-card');
    const img = card.querySelector('.tb-img');
    const r = card.getBoundingClientRect(), ir = img.getBoundingClientRect();
    const lab = document.querySelector('#today-band .tb-label').getBoundingClientRect();
    return { w: r.width, h: r.height, popsOut: ir.top < r.top - 1 || ir.bottom > r.bottom + 1,
             imgPos: getComputedStyle(img).position, hasWrap: !!card.querySelector('.tb-imgw'),
             clearsLabel: r.top >= lab.bottom - 1,
             bg: getComputedStyle(card).backgroundImage };
  });
  check(`最近学んだ単語のカードが縦長 (${Math.round(band.w)}×${Math.round(band.h)})`, band.h > band.w);
  check('絵がカードから飛び出していない', !band.popsOut && band.imgPos === 'static' && band.hasWrap);
  check('カードが見出し「最近学んだ単語」に重ならない', band.clearsLabel);
  check('黄色いグラデーションのままである', band.bg === 'linear-gradient(160deg, rgb(255, 255, 255), rgb(255, 233, 194))');

  await page.evaluate(() => { document.querySelectorAll('.pbub,.stepnote,.cardget,.lvup,.streak-cel,.fcust').forEach(o => o.remove()); enterListMode(); });
  await page.waitForTimeout(1200);
  const wb = await page.evaluate(() => {
    const img = document.querySelector('.wb-card .wb-img'); // 絵のあるカードで確かめる
    const card = img.closest('.wb-card');
    const r = card.getBoundingClientRect(), ir = img.getBoundingClientRect();
    const cards = [...document.querySelectorAll('.wb-card')].slice(0, 6).map(c => c.getBoundingClientRect());
    return { w: r.width, h: r.height, popsOut: ir.top < r.top - 1 || ir.bottom > r.bottom + 1,
             imgPos: getComputedStyle(img).position, hasWrap: !!card.querySelector('.wb-imgw'),
             bg: getComputedStyle(card).backgroundImage,
             noOverlap: cards.every((a, i) => cards.every((b, j) => i === j || a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1)),
             rc: (() => { const s = getComputedStyle(document.createElement('div')); return s && null; })() };
  });
  check(`単語帳のカードも縦長 (${Math.round(wb.w)}×${Math.round(wb.h)})`, wb.h > wb.w);
  check('単語帳の絵もカードの中に収まる', !wb.popsOut && wb.imgPos === 'static' && wb.hasWrap);
  check('単語帳のカードが重ならずに並ぶ', wb.noOverlap);
  check('単語帳も黄色いグラデーションのまま', wb.bg === 'linear-gradient(160deg, rgb(255, 255, 255), rgb(255, 233, 194))');

  // ================= ③ 単語帳では「今日のトレンド」ボタンが消える =================
  await page.evaluate(() => exitListMode());
  await page.waitForTimeout(800);
  const trend = await page.evaluate(() => {
    // 今日の5問を消化済みにしてトレンドボタンを出し、登場演出も再生する
    const rec = {}; ['#am', '#pm'].forEach(sl => rec[dayKey(Date.now()) + sl] = { done: true, correct: 5, total: 5, finished: new Date().toISOString() });
    localStorage.setItem('kwt_daily5_v1', JSON.stringify(rec));
    renderHome(); _sgFly.d5 = true; playHomeBtnFly();
    return { avail: trendAvailable(), on: document.querySelector('.sg-trend').classList.contains('on') };
  });
  check('5問を消化したらトレンドボタンが出る', trend.avail && trend.on);
  await page.waitForTimeout(1400); // 登場演出(tr-pop)が終わるまで
  const popped = await page.evaluate(() => {
    const t = document.querySelector('.sg-trend');
    return { vis: getComputedStyle(t).visibility, op: +getComputedStyle(t).opacity, pop: t.classList.contains('tr-pop') };
  });
  check('登場演出のあと、演出クラス(tr-pop)は外れている', !popped.pop);
  check(`ホームではトレンドボタンが見えている (${popped.vis} / ${popped.op})`, popped.vis === 'visible' && popped.op > 0.9);
  await page.evaluate(() => enterListMode());
  await page.waitForTimeout(1300);
  const hidden = await page.evaluate(() => {
    const t = document.querySelector('.sg-trend'), d = document.querySelector('.sg-d5');
    const g = e => { const s = getComputedStyle(e); return { vis: s.visibility, op: +s.opacity, pe: s.pointerEvents }; };
    return { tr: g(t), d5: g(d), list: _listMode };
  });
  check('単語帳を開いたらトレンドボタンは消える', hidden.list && hidden.tr.vis === 'hidden' && hidden.tr.op === 0 && hidden.tr.pe === 'none');
  check('今日の5問ボタンも消えたまま', hidden.d5.vis === 'hidden' && hidden.d5.op === 0);
  await page.evaluate(() => exitListMode());
  await page.waitForTimeout(900);
  const back = await page.evaluate(() => {
    const t = document.querySelector('.sg-trend'), s = getComputedStyle(t);
    return { vis: s.visibility, op: +s.opacity };
  });
  check('ホームに戻ればトレンドボタンは戻る', back.vis === 'visible' && back.op > 0.9);

  // ================= ① CLEAR演出＋ランクバッジ =================
  await page.evaluate(n => {
    document.querySelectorAll('.pbub,.stepnote,.cardget,.lvup,.streak-cel,.fcust,.sg-clear').forEach(o => o.remove());
    show('s-home');
    curLevel = 'beginner'; curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 6 }; // 5マス消化済み＝次は6マス目
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
  const fx = await page.evaluate(() => {
    const sfx = []; ['sfxClear', 'sfxBadge', 'sfxStepUp'].forEach(k => { const o = window[k]; window[k] = function () { sfx.push(k); return o.apply(this, arguments); }; });
    window.__sfx = sfx;
    show('s-home');
    document.querySelectorAll('.stepnote,.sg-adv,.sg-pirin,.sg-clear').forEach(e => e.remove());
    showStepAdvance();
    const bt = _lastBoardTile;
    const sl = document.querySelector('.room-slide[data-n="' + bt.sec + '"]');
    const from = sl.querySelector('.sg-tile[aria-label="マス' + bt.gidx + '"]');
    const el = document.querySelector('.sg-clear');
    const rk = from.querySelector('.sg-rank');
    const fr = from.getBoundingClientRect();
    return {
      gidx: bt.gidx,
      shown: !!el,
      text: el ? el.querySelector('.sgc-t').textContent : '',
      chars: el ? el.querySelectorAll('.sgc-t i').length : 0,
      charAnim: el ? getComputedStyle(el.querySelector('.sgc-t i')).animationName : '',
      ring: el ? !!el.querySelector('.sgc-ring') : false,
      onTile: el ? Math.abs(parseFloat(el.style.left) - (fr.left + fr.width / 2)) < 2 && Math.abs(parseFloat(el.style.top) - (fr.top + fr.height / 2)) < 2 : false,
      badgeExists: !!rk, badgeHidden: rk ? rk.classList.contains('pre') : false,
      badgeRank: rk ? rk.textContent.trim() : '',
      flyingYet: !!document.querySelector('.sg-adv'), // CLEARの最中はまだ飛ばない
      sfx: sfx.slice()
    };
  });
  check(`クリアしたマスの上に「CLEAR」が出る (${fx.text})`, fx.shown && fx.text === 'CLEAR' && fx.chars === 5);
  check(`「CLEAR」の文字にアニメが付く (${fx.charAnim})`, /sgcChar/.test(fx.charAnim));
  check('「CLEAR」は光の輪つき', fx.ring);
  check(`演出はいまやったマス（マス${fx.gidx}）の上に出る`, fx.onTile);
  check(`ランクバッジは付く直前まで隠れている (${fx.badgeRank})`, fx.badgeExists && fx.badgeHidden);
  check('CLEARの最中はまだ次のマスへ飛ばない', !fx.flyingYet);
  check(`CLEARの効果音が鳴る (${fx.sfx.join(',')})`, fx.sfx.includes('sfxClear'));

  await page.waitForTimeout(760); // バッジが押されるタイミング(640ms)を越える
  const badge = await page.evaluate(() => {
    const bt = _lastBoardTile;
    const sl = document.querySelector('.room-slide[data-n="' + bt.sec + '"]');
    const rk = sl.querySelector('.sg-tile[aria-label="マス' + bt.gidx + '"] .sg-rank');
    const cs = getComputedStyle(rk);
    return { anim: cs.animationName, hidden: rk.classList.contains('pre'), op: +cs.opacity,
             flying: !!document.querySelector('.sg-adv'), sfx: window.__sfx.slice() };
  });
  check(`ランクバッジがアニメーションで付く (${badge.anim})`, /sgRankIn/.test(badge.anim) && !badge.hidden);
  check('バッジの効果音が鳴る', badge.sfx.includes('sfxBadge'));
  check('バッジが付いた時点ではまだ次のマスへ飛んでいない', !badge.flying);

  await page.waitForTimeout(600 + 480); // CLEAR演出(1180ms)→次のマスを真ん中へ寄せるスクロール(480ms)→進む演出が始まる
  const after = await page.evaluate(() => {
    const bt = _lastBoardTile;
    const sl = document.querySelector('.room-slide[data-n="' + bt.sec + '"]');
    const to = sl.querySelector('.sg-tile[aria-label="マス' + (bt.gidx + 1) + '"]');
    const rk = sl.querySelector('.sg-tile[aria-label="マス' + bt.gidx + '"] .sg-rank');
    return { flying: !!document.querySelector('.sg-adv'), gone: !document.querySelector('.sg-clear'),
             gray: to.querySelector('.sg-img').classList.contains('preadv'),
             badgeVis: +getComputedStyle(rk).opacity };
  });
  check('CLEARのあとに次のマスへ光の玉が飛ぶ（順番どおり）', after.flying && after.gone);
  check('進む先はモノクロで待っている', after.gray);
  check('付いたランクバッジはそのまま残る', after.badgeVis > 0.9);
  await page.waitForTimeout(1000);
  const land = await page.evaluate(() => {
    const bt = _lastBoardTile;
    const sl = document.querySelector('.room-slide[data-n="' + bt.sec + '"]');
    const im = sl.querySelector('.sg-tile[aria-label="マス' + (bt.gidx + 1) + '"] .sg-img');
    return { recolor: im.classList.contains('recolor'), pirin: !!document.querySelector('.sg-pirin'), sfx: window.__sfx.slice() };
  });
  check('着いたらモノクロ→カラーに戻る（既存の演出は健在）', land.recolor);
  check('「ピラン」の光もそのまま出る', land.pirin && land.sfx.includes('sfxStepUp'));
  // ホーム復帰の通常フロー(プレゼント→ステップ)が裏で走っていると鳴り始めが混ざるので、初出の順番だけを見る
  check(`効果音は CLEAR → バッジ → 進む の順 (${land.sfx.join(' → ')})`,
    land.sfx.indexOf('sfxClear') === 0 && land.sfx.indexOf('sfxClear') < land.sfx.indexOf('sfxBadge')
    && land.sfx.indexOf('sfxBadge') < land.sfx.indexOf('sfxStepUp'));
  await page.waitForTimeout(1400);
  const note = await page.evaluate(() => { const e = document.querySelector('.stepnote'); return e ? e.textContent.trim() : ''; });
  check(`最後に「進みました」が出る (${note})`, /進みました/.test(note));

  check(`コンソールエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} ${failed.length ? 'passed（FAILあり）' : 'PASS'}`);
  process.exit(failed.length ? 1 : 0);
})();
