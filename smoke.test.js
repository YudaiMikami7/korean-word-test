/* k-tango 常設スモークテスト
 * 使い方: node smoke.test.js
 * 主要フロー（起動→テスト完走→単語帳→設定→中断→復習導線）が壊れていないかを1コマンドで確認する。
 * 変更のたびにこれを回せば、これまで手書きしていた検証を毎回自動化できる。
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
  await page.evaluate(() => { localStorage.setItem('kwt_coach_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(1000);

  // 起動: ホーム表示
  check('起動→ホーム表示', await page.evaluate(() => document.getElementById('s-home').classList.contains('on')));

  // テスト: 12問完走→結果
  await page.evaluate(() => { curLevel = 'beginner'; startTest(); clearInterval(timer); renderQuestion(); });
  await page.waitForTimeout(200);
  await page.evaluate(() => { for (let i = 0; i < 12; i++) { answered = false; clearInterval(timer); startTimer(); const q = state.questions[state.idx]; submit('correct', q.type === 'w' ? q.word.ko : q.correct); document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer(); } });
  await page.waitForTimeout(500);
  check('12問完走→結果画面', await page.evaluate(() => document.getElementById('s-result').classList.contains('on')));
  check('結果スクロールなし(小画面想定)', await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 2));

  // 単語帳: 一覧→3列グリッド
  await page.evaluate(() => show('s-home'));
  await page.waitForTimeout(400);
  await page.evaluate(() => enterListMode());
  await page.waitForTimeout(1100);
  check('単語帳: 3列グリッド', await page.evaluate(() => { const g = document.querySelector('.room-slide[data-n="1"] .wb-grid'); return g && getComputedStyle(g).gridTemplateColumns.split(' ').length === 3; }));
  check('単語検索がヒット', await page.evaluate(() => { wbSearch(BEGINNER_WORDS[0].ko); return document.querySelectorAll('#wb-hits .wbh-row').length > 0; }));
  await page.evaluate(() => exitListMode());
  await page.waitForTimeout(700);

  // 単語詳細
  await page.evaluate(() => renderWordDetail(BEGINNER_WORDS[0].id, 'room'));
  await page.waitForTimeout(500);
  check('単語詳細表示', await page.evaluate(() => document.getElementById('s-wdetail').classList.contains('on')));
  check('学習履歴にNaN無し', await page.evaluate(() => document.getElementById('s-wdetail').innerHTML.indexOf('NaN') === -1));
  await page.evaluate(() => show('s-home'));
  await page.waitForTimeout(400);

  // 設定
  await page.evaluate(() => openSettings());
  await page.waitForTimeout(300);
  check('設定が画面内に収まる', await page.evaluate(() => { const c = document.querySelector('.set-card'); const r = c.getBoundingClientRect(); return r.top >= -1 && r.bottom <= window.innerHeight + 1; }));
  await page.evaluate(() => closeSettings());

  // 中断ダイアログ（連続学習の豪華演出・カード獲得演出が出ていたら閉じる）
  await page.evaluate(() => { document.querySelectorAll('.streak-cel,.cardget').forEach(o => o.remove()); });
  await page.evaluate(() => { startTest(); clearInterval(timer); renderQuestion(); });
  await page.waitForTimeout(200);
  await page.click('.qhome');
  await page.waitForTimeout(200);
  check('中断確認ダイアログ表示', await page.evaluate(() => !!document.querySelector('.appconfirm')));
  await page.evaluate(() => { const m = document.querySelector('.appconfirm'); m.querySelector('#ac-yes').click(); });
  await page.waitForTimeout(300);
  check('中断→ホーム', await page.evaluate(() => document.getElementById('s-home').classList.contains('on')));

  // 復習導線
  await page.evaluate(() => {
    const s = {}; BEGINNER_WORDS.slice(0, 5).forEach(w => { s[w.id] = { hasSeen: true, hasEverCorrect: true, memoryScore: 40, stabilityHours: 12, wordDifficulty: 1, lastReviewedAt: new Date(Date.now() - 2 * 86400000).toISOString(), nextReviewAt: new Date(Date.now() - 3600000).toISOString(), reviewCount: 1, correctCount: 1 }; });
    localStorage.setItem('kwt_stats_v1', JSON.stringify(s));
  });
  check('復習テスト起動', await page.evaluate(() => { startDueReview(); return document.getElementById('s-quiz').classList.contains('on') && state.isReview; }));

  check('コンソールエラー無し', errors.length === 0);
  if (errors.length) console.log('  errors:', errors);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
