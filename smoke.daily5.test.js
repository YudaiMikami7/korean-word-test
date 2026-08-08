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
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); });
  await page.reload();
  await page.waitForTimeout(1000);
  await page.evaluate(() => { document.querySelectorAll('.streak-cel,.cardget,.appconfirm').forEach(o => o.remove()); });

  // --- 背景の玉: メイン画面=既定OFF / 出題画面=既定ON ---
  check('玉の既定 メイン=OFF・出題=ON', await page.evaluate(() => loadSettings().ballsHome === false && loadSettings().ballsQuiz === true));
  check('メイン画面では玉が出ない', await page.evaluate(() => {
    QR.balls.forEach(b => b.el.remove()); QR.balls = [];
    spawnBallRaw(WORD_IMG[BEGINNER_WORDS[0].ko], 40, '#fff', 'home-rain');
    return QR.balls.length === 0;
  }));
  check('出題画面では玉が出る', await page.evaluate(() => {
    QR.balls.forEach(b => b.el.remove()); QR.balls = [];
    spawnBallRaw(WORD_IMG[BEGINNER_WORDS[0].ko], 40, '#fff', 'q-rain');
    const n = QR.balls.length; QR.balls.forEach(b => b.el.remove()); QR.balls = [];
    return n === 1;
  }));
  // 降ってくるのは丸い玉ではなくカードになったので、設定の名前も「カード」（メール指示 2026-08-02）
  check('設定にカードのトグルが2つある', await page.evaluate(() => {
    openSettings();
    const html = document.getElementById('settings-modal').innerHTML;
    const ok = html.includes('カード ホーム') && html.includes('カード 出題中');
    closeSettings(); return ok;
  }));

  // --- 入口 ---
  check('ホームに「今日の5問」ボタンがある', await page.evaluate(() => !!document.querySelector('.sg-d5')));
  check('未プレイなら残数バッジが出る', await page.evaluate(() => { renderHome(); return document.querySelector('.sg-d5 .d5-b').style.display !== 'none'; }));

  await page.evaluate(() => openDaily5());
  await page.waitForTimeout(300);
  check('モーダルが開く', await page.evaluate(() => document.getElementById('d5-modal').classList.contains('on')));
  check('朝の部/夜の部の2枠が出る', await page.evaluate(() => document.querySelectorAll('#d5-modal .d5-slot').length === 2));
  check('切り替えは5時と17時', await page.evaluate(() => {
    const at = (h) => { const d = new Date(); d.setHours(h, 30, 0, 0); return d5Slot(d.getTime()); };
    return at(4) === 'pm' && at(5) === 'am' && at(16) === 'am' && at(17) === 'pm' && at(23) === 'pm'
      && d5SlotTime('am') === '5:00–16:59' && d5SlotTime('pm') === '17:00–4:59';
  }));
  check('深夜0〜5時は前日の夜の部として扱う', await page.evaluate(() => {
    const d = new Date(); d.setHours(2, 0, 0, 0);
    const prev = new Date(d.getTime() - 86400000);
    return d5Key(d.getTime()) === dayKey(prev.getTime()) + '#pm';
  }));
  check('次の枠が開く時刻が5時/17時', await page.evaluate(() => {
    const mk = (h) => { const d = new Date(); d.setHours(h, 30, 0, 0); return new Date(d5NextOpenAt(d.getTime())).getHours(); };
    return mk(2) === 5 && mk(10) === 17 && mk(20) === 5;
  }));
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
  // 判定アニメは倍速になった（メール指示 2026-08-08 23:50）ので、この時点では「まだ全部は判定されていない」ことを見る
  check('開いた直後はまだ全部は判定されていない', await page.evaluate(() => document.querySelectorAll('#s-d5result .d5r-row.judged').length < 5));
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

  await page.waitForTimeout(900); // 判定アニメが倍速になったぶん待ち時間も詰める（メール指示 2026-08-08 23:50）
  check('5問すべて判定される', await page.evaluate(() => document.querySelectorAll('#s-d5result .d5r-row.judged').length === 5));
  check('○×が実際の正誤と一致', await page.evaluate(() => {
    const want = [true, false, true, false, true];
    return [...document.querySelectorAll('#s-d5result .d5r-mk')].every((m, i) => m.classList.contains(want[i] ? 'o' : 'x'));
  }));
  check('スコアが 3 / 5 正解', await page.evaluate(() => /3\s*\/\s*5/.test(document.querySelector('#s-d5result .res-score').textContent.replace(/\s+/g, ' ')) && document.querySelector('.d5r-score').classList.contains('shown')));
  // 下段は通常の結果画面と同じ4ボタン（応援する / シェアする / 次までの時間 / ホーム。メール指示 2026-07-31）
  check('結果画面が通常結果と同じ骨格(.res/4ボタン)', await page.evaluate(() => {
    const labs = [...document.querySelectorAll('#s-d5result .res-btns .rb-lab')].map(e => e.textContent.trim());
    return !!document.querySelector('#s-d5result .res .res-head') && labs.length === 4
      && labs[0] === '応援する' && labs[1] === 'シェアする' && labs[2] === '次までの時間' && labs[3] === 'ホーム';
  }));

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
  check('ホームのボタンがグレーアウト', await page.evaluate(() => { show('s-home'); return document.querySelector('.sg-d5').classList.contains('d5-off'); }));
  // 単語帳: 見出し/旧戻るボタン/黒帯を廃止し、ホームへは右下のホームボタンで戻る（メール指示 2026-08-02）
  check('単語帳の見出し・旧戻るボタンが無い', await page.evaluate(() => !document.querySelector('.wb-title') && !document.getElementById('wb-back2')));
  // 単語数(N/M)の表示は廃止し、カード枚数だけを絞り込みの列の左に置いた（メール指示 2026-08-02）
  check('単語数の行は廃止され、カード枚数が絞り込みの列に入る', await page.evaluate(async () => {
    enterListMode(); await new Promise(r => setTimeout(r, 900));
    const row = document.querySelector(`.room-slide[data-n="${curSection}"] .wb-tabs`);
    const chip = row && row.firstElementChild;
    return !document.querySelector('.slide-list .zk-sum') && !document.querySelector('.slide-list .wb-sum')
      && !!chip && chip.classList.contains('wb-cnt-chip') && /カード/.test(chip.textContent)
      && row.children[1].classList.contains('wb-tab');
  }));
  check('右下のホームボタンでホームに戻れる', await page.evaluate(async () => {
    document.querySelector('.home-side-btn.hsb-right').click();
    await new Promise(r => setTimeout(r, 900));
    return _listMode === false && !!document.querySelector(`.room-slide[data-n="${curSection}"] .sg-wrap`);
  }));

  // --- 枠が変わればまた遊べる ---
  check('別の枠（夜/朝）は未プレイ扱い', await page.evaluate(() => {
    const other = Object.keys(loadD5())[0].endsWith('#am') ? '#pm' : '#am';
    return !loadD5()[dayKey(Date.now()) + other];
  }));
  // カレンダー: 今日の5問を実施した日に枠線
  check('カレンダーの実施日に枠線', await page.evaluate(() => {
    openCalendar();
    const cells = [...document.querySelectorAll('#calendar-modal .cd.d5done')];
    const today = [...document.querySelectorAll('#calendar-modal .cd.today')];
    const ok = cells.length === 1 && today.length === 1 && cells[0] === today[0]
      && getComputedStyle(cells[0]).boxShadow.includes('rgb(224, 131, 26)');
    closeCalendar(); return ok;
  }));
  // 出題画面の進捗＝歩くキャラ（山吹色メーターは廃止。1問ごとに景色とカードが1枚ぶん左へ流れる）
  check('1問ごとに景色が流れる（山吹色メーターは廃止）', await page.evaluate(async () => {
    curLevel = 'beginner'; curSection = 1;
    _boardTile = { level: 'beginner', sec: 1, gidx: boardState('beginner', 1).cleared + 1 };
    startTest(); clearInterval(timer); renderQuestion();
    if (document.getElementById('pfill')) return false;            // 旧メーターが残っていないこと
    const bar = document.getElementById('pbar');
    const rp = () => parseFloat(bar.style.getPropertyValue('--rp') || 0);
    const start = rp();
    const q = state.questions[state.idx];
    answered = false; startTimer(); submit('correct', q.type === 'w' ? q.word.ko : q.correct);
    const afterOk = rp();
    document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer(); clearInterval(timer);
    const q2 = state.questions[state.idx];
    answered = false; startTimer(); submit('incorrect', q2.type === 'w' ? '' : 'ちがう');
    const afterNg = rp();
    document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer);
    quitTest();
    return start === 0 && afterOk === 1 && afterNg === 2; // カードの流れと同じテンポ＝1問ごとに1枚ぶん進む
  }));

  check('コンソールエラー無し', errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
