/* k-tango「今日の5問テスト」スモークテスト
 * 使い方: node smoke.daily5.test.js
 * 検証: 1日2回(朝/夜)の回数制限・4択5問・回答中は正誤を出さない・結果画面で順に○×判定・判定後のレア演出
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
  await page.reload();
  await page.waitForTimeout(1000);
  await page.evaluate(() => { document.querySelectorAll('.streak-cel,.cardget,.appconfirm').forEach(o => o.remove()); });

  // --- 背景の玉は既定OFF ---
  check('玉の演出が既定でOFF', await page.evaluate(() => loadSettings().balls === false));
  check('玉が生成されない', await page.evaluate(() => { spawnWordDrop(BEGINNER_WORDS[0], 1); return QR.balls.length === 0; }));

  // --- 入口 ---
  check('ホームに「今日の5問」ボタンがある', await page.evaluate(() => !!document.getElementById('rr-d5')));
  check('未プレイなら残数バッジが出る', await page.evaluate(() => { renderHome(); return document.getElementById('pb-d5').style.display !== 'none'; }));

  await page.evaluate(() => openDaily5());
  await page.waitForTimeout(300);
  check('モーダルが開く', await page.evaluate(() => document.getElementById('d5-modal').classList.contains('on')));
  check('朝の部/夜の部の2枠が出る', await page.evaluate(() => document.querySelectorAll('#d5-modal .d5-slot').length === 2));
  check('未プレイ枠に「はじめる」がある', await page.evaluate(() => !!document.querySelector('#d5-modal .d5-go')));

  // --- 出題は今日のこの枠で固定 ---
  check('出題が固定（2回生成して同じ5語）', await page.evaluate(() => {
    curLevel = 'beginner';
    const a = buildDaily5Questions().map(q => q.word.id).join(',');
    const b = buildDaily5Questions().map(q => q.word.id).join(',');
    return a === b && a.split(',').length === 5;
  }));

  // --- 開始 ---
  await page.evaluate(() => { curLevel = 'beginner'; startDaily5(); });
  await page.waitForTimeout(2600); // 3・2・1カウントダウン
  check('クイズ画面に入る', await page.evaluate(() => document.getElementById('s-quiz').classList.contains('on')));
  check('全5問（進捗が 1 / 5）', await page.evaluate(() => /今日の5問.*1 \/ 5$/.test(document.getElementById('prog').textContent.trim())));
  check('全問4択（選択肢4つ）', await page.evaluate(() => state.questions.every(q => q.choices && q.choices.length === 4)));
  check('開始で1回ぶん消費される', await page.evaluate(() => d5Used()));

  // --- 回答（正解3・不正解2）: 正誤は一切出さない ---
  const expected = await page.evaluate(async () => {
    const want = [true, false, true, false, true], got = [];
    for (let i = 0; i < 5; i++) {
      const q = state.questions[state.idx];
      const wrong = q.choices.find(c => c !== q.correct);
      answered = false; clearInterval(timer); startTimer();
      if (want[i]) submit('correct', q.correct); else submit('incorrect', wrong);
      got.push({ overlay: document.querySelectorAll('.overlay').length, ack: document.querySelectorAll('.d5-ack').length });
      await new Promise(r => setTimeout(r, 900));
    }
    return { want, got };
  });
  check('回答中に○×オーバーレイが出ない', expected.got.every(g => g.overlay === 0));
  check('回答受付の中立フラッシュは出る', expected.got.every(g => g.ack === 1));

  // --- 結果画面 ---
  await page.waitForTimeout(400);
  check('5問目のあと結果画面へ', await page.evaluate(() => document.getElementById('s-d5result').classList.contains('on')));
  check('5問ぶんの行がある', await page.evaluate(() => document.querySelectorAll('#s-d5result .d5r-row').length === 5));
  check('開いた直後はまだ判定されていない', await page.evaluate(() => document.querySelectorAll('#s-d5result .d5r-row.judged').length === 0));
  check('未判定の問題はぼかされ先読みできない', await page.evaluate(() => {
    const un = [...document.querySelectorAll('#s-d5result .d5r-row:not(.shown)')];
    return un.length >= 4 && un.every(r => getComputedStyle(r.querySelector('.d5r-mid')).filter.indexOf('blur') === 0);
  }));

  // 判定が「順に」進むこと（1問目だけ判定済みの瞬間があるか）
  await page.waitForTimeout(1300);
  const seq1 = await page.evaluate(() => document.querySelectorAll('#s-d5result .d5r-row.judged').length);
  await page.waitForTimeout(1200);
  const seq2 = await page.evaluate(() => document.querySelectorAll('#s-d5result .d5r-row.judged').length);
  check(`順に判定が進む (${seq1}問 → ${seq2}問)`, seq1 >= 1 && seq1 < 5 && seq2 > seq1);

  await page.waitForTimeout(5000);
  check('5問すべて判定される', await page.evaluate(() => document.querySelectorAll('#s-d5result .d5r-row.judged').length === 5));
  check('○×が実際の正誤と一致', await page.evaluate(() => {
    const want = [true, false, true, false, true];
    return [...document.querySelectorAll('#s-d5result .d5r-mk')].every((m, i) => m.classList.contains(want[i] ? 'o' : 'x'));
  }));
  check('スコアが 3 / 5 正解', await page.evaluate(() => /3\s*\/\s*5/.test(document.querySelector('#s-d5result .res-score').textContent.replace(/\s+/g, ' ')) && document.querySelector('.d5r-score').classList.contains('shown')));
  check('結果画面が通常結果と同じ骨格(.res/.btn)', await page.evaluate(() => !!document.querySelector('#s-d5result .res .res-head') && !!document.querySelector('#s-d5result .res-btns .btn.pri')));

  // --- レア演出（判定しきったあと） ---
  const rare = await page.evaluate(async () => {
    for (let i = 0; i < 30; i++) { if (document.querySelector('.d5-rare')) return true; await new Promise(r => setTimeout(r, 100)); }
    return false;
  });
  check('判定後にレア演出が出る', rare);

  // --- 回数制限 ---
  await page.evaluate(() => { show('s-home'); openDaily5(); });
  await page.waitForTimeout(400);
  check('同じ枠では「はじめる」が出ない', await page.evaluate(() => !document.querySelector('#d5-modal .d5-go')));
  check('次の枠までのカウントダウンが出る', await page.evaluate(() => { const e = document.getElementById('d5-cd'); return !!e && /^\d+:\d\d:\d\d$/.test(e.textContent.trim()); }));
  check('もう一度呼んでも開始できない', await page.evaluate(() => { const before = location.href; startDaily5(); return !document.getElementById('s-quiz').classList.contains('on'); }));
  check('結果を後から見返せる', await page.evaluate(() => { closeDaily5(); d5ShowSaved(); return document.querySelectorAll('#s-d5result .d5r-row.judged').length === 5; }));
  check('ホームのボタンがグレーアウト', await page.evaluate(() => { show('s-home'); return document.getElementById('rr-d5').classList.contains('d5-off'); }));
  // 単語帳: 見出し/旧戻るボタンを廃止し、カード枚数バー左の戻るへ移設
  check('単語帳の見出し・旧戻るボタンが無い', await page.evaluate(() => !document.querySelector('.wb-title') && !document.getElementById('wb-back2')));
  check('カード枚数バー左に戻るボタン', await page.evaluate(async () => {
    enterListMode(); await new Promise(r => setTimeout(r, 900));
    const bar = document.querySelector(`.room-slide[data-n="${curSection}"] .zk-sum`);
    return !!bar && bar.firstElementChild && bar.firstElementChild.classList.contains('zk-back');
  }));
  check('その戻るボタンでホームに戻れる', await page.evaluate(async () => {
    document.querySelector(`.room-slide[data-n="${curSection}"] .zk-back`).click();
    await new Promise(r => setTimeout(r, 900));
    return _listMode === false && !document.getElementById('homewrap').classList.contains('hiderail');
  }));

  // --- 枠が変わればまた遊べる ---
  check('別の枠（夜/朝）は未プレイ扱い', await page.evaluate(() => {
    const other = Object.keys(loadD5())[0].endsWith('#am') ? '#pm' : '#am';
    return !loadD5()[dayKey(Date.now()) + other];
  }));

  check('コンソールエラー無し', errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
