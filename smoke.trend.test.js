/* k-tango「今日のトレンド問題」＆5問ボタンの位置揃えスモークテスト
 * 使い方: node smoke.trend.test.js
 * 検証: 消化後の5問ボタンが左アイコン群と同じ丸/位置・吹き出しが左下向き・
 *       中央カプセル位置に黄色いトレンドボタン・トレンド5問が遊べて記憶エンジンを汚さない
 */
const { chromium } = require('playwright');
const path = require('path');

const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }
const near = (a, b, t) => Math.abs(a - b) <= (t || 1.5);

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
  await page.waitForTimeout(1200);
  await page.evaluate(() => { document.querySelectorAll('.streak-cel,.cardget,.appconfirm').forEach(o => o.remove()); });

  // --- トレンド単語データ ---
  check('trend-words.js が読める', await page.evaluate(() => typeof TREND_WORDS === 'object' && Object.keys(TREND_WORDS).length > 0));
  check('その日ぶん（無ければ直近）が5語そろう', await page.evaluate(() => trendWords().length === 5 && trendWords().every(w => w.ko && w.ja)));

  // --- 5問を消化する前 ---
  check('未消化ならトレンドボタンは出ない', await page.evaluate(() => { renderHome(); return !trendAvailable() && !document.querySelector('.sg-trend').classList.contains('on'); }));
  check('未消化の5問ボタンは中央カプセルのまま', await page.evaluate(() => !document.querySelector('.sg-d5').classList.contains('d5-off')));

  // --- 今日の5問を消化 ---
  await page.evaluate(async () => {
    curLevel = 'beginner';
    const all = loadD5();
    all[d5Key(Date.now())] = { slot: d5Slot(Date.now()), finished: new Date().toISOString(), correct: 3, total: 5, done: true, items: [] };
    saveD5(all);
    renderHome(); updateD5Btn();
    await new Promise(r => setTimeout(r, 500));
  });
  await page.waitForTimeout(600);

  // --- 消化後のレイアウト（左アイコン群と揃っているか） ---
  await page.evaluate(() => { document.querySelectorAll('.sg-home').forEach(b => b.classList.add('on')); }); // 出現アニメを終わらせてから測る
  await page.waitForTimeout(400);
  const lay = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2 }; };
    const slide = document.querySelector('.room-slide[data-n="' + curSection + '"]');
    // 今日の5問／トレンドは home-wrap 直下のフロート1組。現在地ボタンだけスライドの中にある
    const d5 = document.querySelector('.sg-d5'), home = slide.querySelector('.sg-home'), tr = document.querySelector('.sg-trend');
    const railL = document.querySelector('.reward-rail-left .rr-btn'), railR = document.querySelector('.reward-rail:not(.reward-rail-left) .rr-btn');
    return {
      d5: vis(d5), home: vis(home), tr: vis(tr), railL: vis(railL), railR: vis(railR),
      d5Shadow: getComputedStyle(d5).boxShadow, railShadow: getComputedStyle(railL).boxShadow,
      d5Radius: getComputedStyle(d5).borderRadius, trBg: getComputedStyle(tr).backgroundColor,
      slideCx: vis(slide).cx
    };
  });
  check(`消化後の5問ボタンが左アイコン群と同じ横位置 (${lay.d5.l.toFixed(1)} vs ${lay.railL.l.toFixed(1)})`, near(lay.d5.l, lay.railL.l, 2));
  check(`丸の大きさが左アイコン群と同じ (${lay.d5.w.toFixed(1)}×${lay.d5.h.toFixed(1)} vs ${lay.railL.w.toFixed(1)})`, near(lay.d5.w, lay.railL.w, 2) && near(lay.d5.h, lay.railL.h, 2));
  check('影のデザインが左アイコン群と同じ', lay.d5Shadow === lay.railShadow);
  check('丸くなっている', /50%|9999px|34px/.test(lay.d5Radius));
  check(`現在地ボタンが右アイコン群と同じ横位置 (${lay.home.r.toFixed(1)} vs ${lay.railR.r.toFixed(1)})`, near(lay.home.r, lay.railR.r, 2));
  check(`現在地ボタンの丸の大きさがアイコン群と同じ (${lay.home.w.toFixed(1)})`, near(lay.home.w, lay.railR.w, 2));
  check(`5問ボタンと現在地ボタンの縦位置が揃う (${lay.d5.b.toFixed(1)} vs ${lay.home.b.toFixed(1)})`, near(lay.d5.b, lay.home.b, 2));
  check('トレンドボタンが中央カプセルの位置に出る', near(lay.tr.cx, lay.slideCx, 3) && near(lay.tr.b, lay.d5.b, 3));
  check('トレンドボタンは黄色', lay.trBg === 'rgb(255, 196, 0)');

  // --- 吹き出しの向き ---
  await page.evaluate(() => openDaily5());
  await page.waitForTimeout(350);
  const bub = await page.evaluate(() => {
    const c = document.querySelector('#d5-modal .d5-card'), b = document.querySelector('.sg-d5');
    const cr = c.getBoundingClientRect(), br = b.getBoundingClientRect();
    const tx = parseFloat(getComputedStyle(c).getPropertyValue('--tx'));
    return { edgeL: c.classList.contains('edge-l'), flip: c.classList.contains('flip'), tailX: cr.left + tx, btnCx: br.left + br.width / 2, above: cr.bottom <= br.top + 2 };
  });
  check('消化後の吹き出しはボタンの上に出る', bub.above && !bub.flip);
  check('しっぽが左下向き（edge-l）', bub.edgeL);
  check(`しっぽがボタンを指す (${bub.tailX.toFixed(1)} vs ${bub.btnCx.toFixed(1)})`, near(bub.tailX, bub.btnCx, 6));
  await page.evaluate(() => closeDaily5());

  // --- トレンド問題の吹き出し ---
  await page.evaluate(() => openTrend());
  await page.waitForTimeout(350);
  check('トレンドの吹き出しが開く', await page.evaluate(() => !!document.querySelector('#d5-modal .tr-card')));
  check('5語のトレンド単語が並ぶ', await page.evaluate(() => document.querySelectorAll('#d5-modal .tr-w').length === 5));
  check('「はじめる」がある', await page.evaluate(() => !!document.querySelector('#d5-modal .d5-go.tr-go')));

  // --- 出題 ---
  const statsBefore = await page.evaluate(() => JSON.stringify(loadStats()));
  const histBefore = await page.evaluate(() => loadHistory().length);
  await page.evaluate(() => { curLevel = 'beginner'; startTrend(); });
  await page.waitForTimeout(2600);
  check('クイズ画面に入る', await page.evaluate(() => document.getElementById('s-quiz').classList.contains('on')));
  check('進捗が「今日のトレンド 1 / 5」', await page.evaluate(() => /今日のトレンド.*1 \/ 5$/.test(document.getElementById('prog').textContent.trim())));
  check('出題語がトレンド単語', await page.evaluate(() => {
    const ko = trendWords().map(w => w.ko);
    return state.questions.length === 5 && state.questions.every(q => ko.includes(q.word.ko) && q.trend === true);
  }));
  check('全問4択', await page.evaluate(() => state.questions.every(q => q.choices && q.choices.length === 4)));

  const got = await page.evaluate(async () => {
    const want = [true, true, false, true, false], out = [];
    for (let i = 0; i < 5; i++) {
      const q = state.questions[state.idx];
      const wrong = q.choices.find(c => c !== q.correct);
      answered = false; clearInterval(timer); startTimer();
      if (want[i]) submit('correct', q.correct); else submit('incorrect', wrong);
      out.push(document.querySelectorAll('.overlay').length);
      await new Promise(r => setTimeout(r, 900));
    }
    return out;
  });
  check('回答中に○×オーバーレイが出ない', got.every(n => n === 0));

  await page.waitForTimeout(500);
  check('結果画面へ', await page.evaluate(() => document.getElementById('s-d5result').classList.contains('on')));
  check('見出しが「今日のトレンド問題」', await page.evaluate(() => document.querySelector('#s-d5result .res-head').textContent.includes('今日のトレンド問題')));
  await page.waitForTimeout(9000);
  check('スコアが 3 / 5 正解', await page.evaluate(() => /3\s*\/\s*5/.test(document.querySelector('#s-d5result .res-score').textContent.replace(/\s+/g, ' '))));

  // --- 記憶エンジン・履歴を汚さない ---
  check('記憶スコアに手を付けない', await page.evaluate(() => JSON.stringify(loadStats())) === statsBefore);
  check('回答履歴に混ぜない', await page.evaluate(() => loadHistory().length) === histBefore);

  // --- 1日1回 ---
  await page.evaluate(() => { show('s-home'); updateTrendBtn(); openTrend(); });
  await page.waitForTimeout(400);
  check('同じ日は「はじめる」が出ない', await page.evaluate(() => !document.querySelector('#d5-modal .d5-go.tr-go')));
  check('もう一度呼んでも開始できない', await page.evaluate(() => { startTrend(); return !document.getElementById('s-quiz').classList.contains('on'); }));
  check('結果を後から見返せる', await page.evaluate(() => { closeDaily5(); trendShowSaved(); return document.querySelectorAll('#s-d5result .d5r-row').length === 5; }));
  check('ホームのトレンドボタンがグレーアウト', await page.evaluate(() => { show('s-home'); updateTrendBtn(); return document.querySelector('.sg-trend').classList.contains('tr-off'); }));

  check('コンソールエラー無し', errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
