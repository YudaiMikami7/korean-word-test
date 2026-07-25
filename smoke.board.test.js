/* k-tango すごろく（1マス=1テスト / 12マスで1周）スモークテスト
 * 使い方: node smoke.board.test.js
 * 検証: 1周の網羅（12マスで全語登場）・周の伸長・マスの開放/ロック・テスト連動・画像が常に乗ること
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
  page.on('dialog', d => d.accept());
  await page.goto('file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/'));
  await page.waitForTimeout(900);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); });
  await page.reload(); await page.waitForTimeout(1300);
  await page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.appconfirm').forEach(o => o.remove()));

  // --- 1周のマス数 ---
  const laps = await page.evaluate(() => ({
    b1: boardLapSize('beginner', 1),      // 100語
    b17: boardLapSize('beginner', 17),    // 71語
    m27: boardLapSize('middle', 27),      // 62語
    n1: LEVEL_SECTIONS.beginner[1].length, n17: LEVEL_SECTIONS.beginner[17].length, n27: LEVEL_SECTIONS.middle[27].length,
  }));
  check(`100語ROOMは1周12マス (${laps.n1}語→${laps.b1}マス)`, laps.b1 === 12);
  check(`語数の少ないROOMは短い (初級17: ${laps.n17}語→${laps.b17} / 中級27: ${laps.n27}語→${laps.m27})`, laps.b17 < 12 && laps.m27 < 12);

  // --- 1周で全語が必ず登場する ---
  const cov = await page.evaluate(() => {
    const out = {};
    for (const [lv, sec] of [['beginner', 1], ['beginner', 5], ['beginner', 17], ['middle', 3], ['middle', 27]]) {
      const L = boardLapSize(lv, sec), ids = LEVEL_SECTIONS[lv][sec], seen = new Set();
      let dup = 0;
      for (let i = 0; i < L; i++) boardTileWords(lv, sec, 1, i).forEach(id => { if (seen.has(id)) dup++; seen.add(id); });
      out[lv + '-' + sec] = { unique: seen.size, total: ids.length, dup };
    }
    return out;
  });
  const allCovered = Object.values(cov).every(v => v.unique === v.total && v.dup === 0);
  check('1周で担当語が全語・重複なし ' + JSON.stringify(cov), allCovered);

  // --- 周ごとに並びが変わる ---
  check('周が変われば担当の並びも変わる', await page.evaluate(() => {
    const a = boardTileWords('beginner', 1, 1, 0).join(','), b = boardTileWords('beginner', 1, 2, 0).join(',');
    return a !== b && boardTileWords('beginner', 1, 1, 0).join(',') === a; // 同じ周なら毎回同じ
  }));

  // --- 初期表示 ---
  const init = await page.evaluate(() => ({
    tiles: document.querySelectorAll('.room-slide[data-n="1"] .sg-tile').length,
    now: document.querySelectorAll('.room-slide[data-n="1"] .sg-tile.now').length,
    lock: document.querySelectorAll('.room-slide[data-n="1"] .sg-tile.lock').length,
    imgs: document.querySelectorAll('.room-slide[data-n="1"] .sg-tile .sg-img, .room-slide[data-n="1"] .sg-tile .sg-noimg').length,
    road: !!document.querySelector('.room-slide[data-n="1"] .sg-road path'),
    deco: document.querySelectorAll('.room-slide[data-n="1"] .sg-deco').length,
  }));
  check(`未着手は12マス表示 (${init.tiles})`, init.tiles === 12);
  check('マス1が「いまここ」・残り11個がロック', init.now === 1 && init.lock === 11);
  check(`全マスに画像が乗っている (${init.imgs}/12)`, init.imgs === 12);
  check('蛇行する道が描かれている', init.road);
  check(`自然物が配置されている (${init.deco}個)`, init.deco >= 12);

  // --- ロックされたマスは開けない ---
  check('先のマスはタップしても始まらない', await page.evaluate(async () => {
    sgTap(1, 5); await new Promise(r => setTimeout(r, 300));
    const blocked = !document.getElementById('s-quiz').classList.contains('on') && !!document.querySelector('.sg-toast');
    document.querySelectorAll('.sg-toast').forEach(t => t.remove());
    return blocked;
  }));

  // --- マス1をプレイ → クリアされて次が開く ---
  const played = await page.evaluate(async () => {
    _boardTile = { level: 'beginner', sec: 1, gidx: 1 };
    startTest(); clearInterval(timer); renderQuestion();
    const ids = state.questions.map(q => q.word.id);
    const assigned = boardTileWords('beginner', 1, 1, 0);
    const coverIncluded = assigned.every(id => ids.includes(id));
    for (let i = 0; i < 12; i++) {
      answered = false; clearInterval(timer); startTimer();
      const q = state.questions[state.idx];
      submit('correct', q.type === 'w' ? q.word.ko : q.correct);
      document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer);
      afterAnswer();
    }
    await new Promise(r => setTimeout(r, 600));
    document.querySelectorAll('.cardget,.streak-cel').forEach(o => o.remove());
    return { coverIncluded, qn: ids.length, state: boardState('beginner', 1) };
  });
  check(`1マス=12問 (${played.qn}問)`, played.qn === 12);
  check('そのマスの担当語がすべて出題される', played.coverIncluded);
  check('クリアするとマスが進む', played.state.cleared === 1 && !!played.state.tiles['1']);

  await page.evaluate(() => show('s-home'));
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    done: document.querySelectorAll('.room-slide[data-n="1"] .sg-tile.done').length,
    rank: !!document.querySelector('.room-slide[data-n="1"] .sg-tile.done .sg-rank'),
    nowIdx: document.querySelector('.room-slide[data-n="1"] .sg-tile.now')?.getAttribute('aria-label'),
  }));
  check('クリア済みマスに色とランクが付く', after.done === 1 && after.rank);
  check('「いまここ」がマス2へ移動', after.nowIdx === 'マス2');

  // --- 1周終わると次の周が伸びる ---
  const grown = await page.evaluate(async () => {
    const tiles = {}; for (let i = 1; i <= 12; i++) tiles[i] = { rank: 'B', score: 70, at: new Date().toISOString() };
    localStorage.setItem('kwt_board_v1', JSON.stringify({ 'beginner-01': { cleared: 12, tiles } }));
    buildRoomSlides(); await new Promise(r => setTimeout(r, 400));
    return {
      visible: boardVisible('beginner', 1),
      tiles: document.querySelectorAll('.room-slide[data-n="1"] .sg-tile').length,
      laps: [...document.querySelectorAll('.room-slide[data-n="1"] .sg-lap')].map(e => e.textContent.trim()),
    };
  });
  check(`1周クリアで次の12マスが出現 (${grown.tiles}マス / ${grown.laps.join(',')})`, grown.visible === 24 && grown.tiles === 24 && grown.laps.length === 2);

  // --- 過去の履歴から進捗を復元 ---
  const seeded = await page.evaluate(async () => {
    localStorage.clear();
    // 初級ROOM01で3回、ROOM02で1回の「12問完走」履歴を仕込む
    const ids1 = LEVEL_SECTIONS.beginner[1], ids2 = LEVEL_SECTIONS.beginner[2], h = [];
    const push = (ids, testId, score, day) => {
      for (let i = 0; i < 12; i++) h.push({ wordId: ids[i], testId, score, answeredAt: '2026-07-' + String(day).padStart(2, '0') + 'T10:00:00.000Z' });
    };
    push(ids1, 't-a', 8, 10); push(ids1, 't-b', 6, 11); push(ids1, 't-c', 9, 12);
    push(ids2, 't-d', 7, 13);
    push(ids1, 't-short', 8, 14); h.length -= 6; // 6問しかない未完走テストは数えない
    localStorage.setItem('kwt_history_v1', JSON.stringify(h));
    return true;
  });
  await page.reload(); await page.waitForTimeout(1400);
  await page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.appconfirm').forEach(o => o.remove()));
  const st = await page.evaluate(() => ({
    r1: boardState('beginner', 1), r2: boardState('beginner', 2), r3: boardState('beginner', 3),
    tiles: document.querySelectorAll('.room-slide[data-n="1"] .sg-tile.done').length,
    now: document.querySelector('.room-slide[data-n="1"] .sg-tile.now')?.getAttribute('aria-label'),
  }));
  check(`過去3回ぶんが3マス進んだ状態になる (cleared=${st.r1.cleared})`, seeded && st.r1.cleared === 3 && st.tiles === 3);
  // 履歴が間引かれていても、記憶データ(reviewCount)から進捗を補える
  const fromStats = await page.evaluate(async () => {
    localStorage.clear();
    const st = {}; LEVEL_SECTIONS.beginner[4].forEach(id => { st[id] = { reviewCount: 6, hasSeen: true }; }); // 100語x6回=600 → 600/12=50マス
    localStorage.setItem('kwt_stats_v1', JSON.stringify(st));
    return true;
  }).then(() => page.reload()).then(() => page.waitForTimeout(1400))
    .then(() => page.evaluate(() => ({ r4: boardState('beginner', 4).cleared, r5: boardState('beginner', 5).cleared })));
  check(`履歴が無くても記憶データから進捗を補う (ROOM04=${fromStats.r4})`, fromStats.r4 === 50 && fromStats.r5 === 0);
  // 既に進めている分は下げない
  const noDown = await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('kwt_board_v1', JSON.stringify({ 'beginner-06': { cleared: 20, tiles: {} } }));
    const st = {}; LEVEL_SECTIONS.beginner[6].slice(0, 10).forEach(id => { st[id] = { reviewCount: 1, hasSeen: true }; });
    localStorage.setItem('kwt_stats_v1', JSON.stringify(st));
    return true;
  }).then(() => page.reload()).then(() => page.waitForTimeout(1400))
    .then(() => page.evaluate(() => boardState('beginner', 6).cleared));
  check(`既存の進捗は下げない (20 → ${noDown})`, noDown === 20);
  check('未完走(6問)のテストはマスに数えない', st.r1.cleared === 3);
  check(`別ROOMも個別に反映 (ROOM02=${st.r2.cleared} / ROOM03=${st.r3.cleared})`, st.r2.cleared === 1 && st.r3.cleared === 0);
  check('復元したマスにランクが入る', !!st.r1.tiles['1'] && !!st.r1.tiles['1'].rank);
  check('「いまここ」が4マス目', st.now === 'マス4');

  // --- ROOMメニュー左右の矢印 ---
  const arr = await page.evaluate(async () => {
    localStorage.clear(); location.hash = '';
    return null;
  }).then(() => page.reload()).then(() => page.waitForTimeout(1400)).then(() => page.evaluate(async () => {
    jumpRoom(3); await new Promise(r => setTimeout(r, 600));
    const before = curSection;
    document.querySelector('.room-slide[data-n="3"] .rm-next').click();
    await new Promise(r => setTimeout(r, 600));
    const next = curSection;
    document.querySelector('.room-slide[data-n="4"] .rm-prev').click();
    await new Promise(r => setTimeout(r, 600));
    return { before, next, prev: curSection,
      firstPrev: !!document.querySelector('.room-slide[data-n="1"] .rm-prev'),
      lastNext: !!document.querySelector(`.room-slide[data-n="${LEVEL_INFO[curLevel].count}"] .rm-next`) };
  }));
  check(`矢印で隣のROOMへ移動できる (3→${arr.next}→${arr.prev})`, arr.before === 3 && arr.next === 4 && arr.prev === 3);
  check('先頭に「前へ」、末尾に「次へ」は出ない', !arr.firstPrev && !arr.lastNext);

  // --- ホーム下部のレイアウト刷新 ---
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); })
    .then(() => page.reload()).then(() => page.waitForTimeout(1500));
  await page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.appconfirm').forEach(o => o.remove()));
  const home = await page.evaluate(() => ({
    startHidden: getComputedStyle(document.querySelector('.start-button')).display === 'none',
    statusHidden: !document.querySelector('.hsb-left') || getComputedStyle(document.querySelector('.hsb-left')).display === 'none',
    wbRect: (() => { const b = document.querySelector('.hsb-right'); if (!b) return null; const cs = getComputedStyle(b); return { radius: cs.borderRadius, left: cs.left, top: cs.top }; })(),
    bubble: document.querySelector('.room-slide[data-n="1"] .sg-here')?.textContent,
  }));
  check('大きなスタートボタンは非表示', home.startHidden);
  check('ステータスボタンは廃止', home.statusHidden);
  check(`単語帳は長方形で帯の右へ (left=${home.wbRect && home.wbRect.left})`, !!home.wbRect && home.wbRect.radius === '14px' && home.wbRect.left === '478px');
  check('「いまここ」の吹き出しが「スタート」', home.bubble === 'スタート');
  check('吹き出しが画像の上にある', await page.evaluate(() => {
    const t = document.querySelector('.room-slide[data-n="1"] .sg-tile.now');
    const img = t.querySelector('.sg-img'), b = t.querySelector('.sg-here');
    return b.getBoundingClientRect().bottom <= img.getBoundingClientRect().top + 2;
  }));
  check('「いまここ」はモノクロ＋黄色い光彩', await page.evaluate(() => {
    const f = getComputedStyle(document.querySelector('.room-slide[data-n="1"] .sg-tile.now .sg-img')).animationName;
    return f.includes('sgglow') && f.includes('sgnowc');
  }));
  check('吹き出しを押すとテストが始まる', await page.evaluate(async () => {
    document.querySelector('.room-slide[data-n="1"] .sg-here').click();
    await new Promise(r => setTimeout(r, 2600));
    const on = document.getElementById('s-quiz').classList.contains('on');
    if (on) quitTest();
    return on;
  }));

  check('コンソールエラー無し', errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
