/* k-tango 2026-07-29 レビュー反映ぶんのスモークテスト
 * 使い方: node smoke.feedback.test.js
 * ・スペシャルモードのゲームを8つに絞った / 神経衰弱を外した
 * ・ゲームの成績がXPになる
 * ・その日はじめて開くと「今日の5問」が自動で出る
 * ・使い方ガイドが3ページ
 * ・5問の結果画面：字が大きい / タップで発音
 * ・結果画面に獲得XPとレベルアップ演出
 * ・書き取りの誤答で記憶率が一気に落ちない
 * ・長い日本語の選択肢は字が詰まる
 */
const { chromium } = require('playwright');
const path = require('path');

const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }
const FILE = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 602, height: 1178 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(FILE);
  await page.waitForTimeout(900);

  // ---------- 使い方ガイド（実画面のコーチマーク。メール指示 2026-07-31で形式変更） ----------
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.waitForTimeout(1600);
  check('初回は使い方ガイドが出る', await page.evaluate(() => !!document.getElementById('coach')));
  check('ポップアップではなく実画面の切り抜き＋説明', await page.evaluate(() => !!document.getElementById('cm-hole') && !!document.getElementById('cm-tip') && !document.querySelector('.coach-in')));
  check('1つ目はROOMの説明', await page.evaluate(() => /ROOM/.test(document.getElementById('cm-h').textContent + document.getElementById('cm-sub').textContent)));
  check('切り抜きが実際の部品の上にある', await page.evaluate(() => {
    const h = document.getElementById('cm-hole').getBoundingClientRect(), t = document.querySelector('#room-pager').getBoundingClientRect();
    return h.width > 4 && h.height > 4 && Math.abs((h.left + h.width / 2) - (t.left + t.width / 2)) < 24;
  }));
  check('つぎへでスタートのマスを指す', await page.evaluate(() => {
    coachNext();
    const h = document.getElementById('cm-hole').getBoundingClientRect(), t = document.querySelector('.sg-tile.now').getBoundingClientRect();
    return /スタート/.test(document.getElementById('cm-h').textContent) && Math.abs((h.left + h.width / 2) - (t.left + t.width / 2)) < 24;
  }));
  check('最後はPWR・XPの見かた', await page.evaluate(() => { while (document.getElementById('coach-next').textContent !== 'はじめる') coachNext(); const t = document.getElementById('cm-h').textContent + document.getElementById('cm-sub').textContent; return /PWR/.test(t) && /XP/.test(t); }));
  check('最後のボタンは「はじめる」', await page.evaluate(() => document.getElementById('coach-next').textContent === 'はじめる'));

  // ---------- その日はじめて開いたら「今日の5問」が自動で出る ----------
  await page.evaluate(() => coachNext()); // 閉じる
  await page.waitForTimeout(500);
  // 今日のボーナスは廃止した（メール指示 2026-08-08）ので、ガイドを閉じたらそのまま自動スタートへ進む
  await page.waitForTimeout(400);
  check('ガイドを閉じると今日の5問が自動で出る', await page.evaluate(() => !!document.querySelector('.d5auto')));
  check('「戻る」で見送れる', await page.evaluate(() => { closeAutoD5(false); return !document.getElementById('s-quiz').classList.contains('on'); }));
  await page.waitForTimeout(400);
  check('同じ枠では二度と自動で出ない', await page.evaluate(() => { maybeAutoDaily5(); return !document.querySelector('.d5auto'); }));

  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(2000);
  check('2回目以降もその日最初の起動で自動で出る', await page.evaluate(() => !!document.querySelector('.d5auto')));
  check('「いますぐ」で今日の5問が始まる', await page.evaluate(() => { closeAutoD5(true); return document.getElementById('s-quiz').classList.contains('on') && _d5.on && _d5.mode === 'd5'; }));
  await page.evaluate(() => { quitTest(); });
  await page.waitForTimeout(400);
  // 中断しただけの枠はやり直せる（2026-07-29 夜の指示）ので、自動スタートも出る。締切は「やり切った枠」だけ
  check('中断した枠なら自動でまた出る', await page.evaluate(() => { localStorage.removeItem('kwt_d5auto_v1'); maybeAutoDaily5(); const on = !!document.querySelector('.d5auto'); closeAutoD5(false); return on; }));
  check('やり切った枠なら自動で出ない', await page.evaluate(() => {
    const all = loadD5(); all[d5Key(Date.now())].done = true; saveD5(all);
    localStorage.removeItem('kwt_d5auto_v1'); maybeAutoDaily5(); return !document.querySelector('.d5auto');
  }));

  // ---------- 5問の結果画面：字の大きさ・タップで発音 ----------
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); });
  await page.reload();
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    startDaily5();
    for (let i = 0; i < 5; i++) { const q = state.questions[state.idx]; answered = false; clearInterval(timer); startTimer(); submit('correct', q.type === 'w' ? q.word.ko : q.correct); if (_d5.on) { document.querySelectorAll('.d5-ack').forEach(o => o.remove()); afterAnswer(); } }
  });
  await page.waitForTimeout(600);
  check('5問の結果画面が出る', await page.evaluate(() => document.getElementById('s-d5result').classList.contains('on')));
  const d5size = await page.evaluate(() => ({ q: parseFloat(getComputedStyle(document.querySelector('.d5r-q')).fontSize), a: parseFloat(getComputedStyle(document.querySelector('.d5r-a')).fontSize) }));
  check(`結果の出題文字が大きくなった (${d5size.q}px)`, d5size.q >= 18);
  check(`あなた/正解の行も大きくなった (${d5size.a}px)`, d5size.a >= 13);
  check('各行に正解の韓国語が紐づく', await page.evaluate(() => [...document.querySelectorAll('#s-d5result .d5r-row')].every(r => !!r.dataset.ko)));
  check('タップで発音の案内が出る', await page.evaluate(() => !!document.querySelector('#s-d5result .d5r-spk')));
  check('判定前の行はタップしても鳴らない', await page.evaluate(() => {
    const r = document.querySelector('#s-d5result .d5r-row'); r.classList.remove('judged');
    d5SpeakRow(r); return !r.classList.contains('speaking');
  }));
  check('判定後の行はタップで発音する', await page.evaluate(() => {
    const r = document.querySelector('#s-d5result .d5r-row'); r.classList.add('judged');
    d5SpeakRow(r); return r.classList.contains('speaking');
  }));

  // ---------- スペシャルモード：ゲームを絞った・XPが入る ----------
  await page.evaluate(() => { show('s-home'); });
  await page.waitForTimeout(400);
  check(`ゲームは8つに絞られた (${await page.evaluate(() => SP_MENU.length)}種)`, await page.evaluate(() => SP_MENU.length === 8));
  check('神経衰弱はメニューから外れた', await page.evaluate(() => !SP_MENU.some(t => t[0] === 'memory')));
  await page.evaluate(() => openSpecial());
  await page.waitForTimeout(300);
  check('メニューに並ぶタイルも8つ', await page.evaluate(() => document.querySelectorAll('#special-modal .sp-tile').length === 8));
  check('メニューに「神経衰弱」の文字が無い', await page.evaluate(() => document.getElementById('special-modal').textContent.indexOf('神経衰弱') === -1));
  check('XPがもらえると書いてある', await page.evaluate(() => /XP/.test(document.querySelector('#special-modal .sp-note').textContent)));
  const xpGame = await page.evaluate(() => {
    closeSpecial();
    const before = xpInfo();
    _spResult('🔊', 'テスト', '5', 'ok', () => { }, 40);
    const el = document.querySelector('.sp-res-xp');
    const after = xpInfo();
    const shown = el ? el.textContent : '';
    spExitGame();
    return { gained: after.level * 0 + (loadBonus()), shown, beforeCur: before.cur, afterCur: after.cur };
  });
  check(`ゲームの結果でXPが増える (${xpGame.shown})`, /\+40/.test(xpGame.shown) && xpGame.gained >= 40);
  check('上限を超えるXPは頭打ちになる', await page.evaluate(() => { const b = loadBonus(); spGrantXp(9999); return loadBonus() - b === SP_XP_CAP; }));

  // ---------- 通常テストの結果画面：獲得XPとレベルアップ ----------
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); });
  await page.reload();
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    curLevel = 'beginner'; startTest(); clearInterval(timer); renderQuestion();
    const n = state.questions.length;
    for (let i = 0; i < n; i++) { const q = state.questions[state.idx]; if (q.type === 'sg' || q.type === 'sg4') { shootAdvance(); continue; } answered = false; clearInterval(timer); startTimer(); submit('correct', q.type === 'w' ? q.word.ko : q.correct); document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer(); }
  });
  await page.waitForTimeout(3600); // カード獲得演出が閉じるまで
  check('結果画面に獲得XPが出る', await page.evaluate(() => !!document.getElementById('res-xp-gain')));
  const xpRes = await page.evaluate(() => {
    const el = document.getElementById('res-xp-gain');
    return { to: parseInt(el.dataset.to, 10), size: parseFloat(getComputedStyle(el).fontSize), txt: el.textContent };
  });
  check(`獲得XPが0より大きい (${xpRes.to} XP)`, xpRes.to > 0);
  check(`獲得XPは控えめな大きさ (${xpRes.size}px)`, xpRes.size >= 15 && xpRes.size <= 24); // メール指示でレベル・XPは小さくした
  check('Lv.と次のレベルまでのゲージも出る', await page.evaluate(() => !!document.querySelector('.res-meters .res-mlab') && !!document.getElementById('res-xpfill')));
  // メール指示: レベル/PWRはステータス画面と同じ見た目（黒座布団）／XPは黄色／PWRの増減は「+n%」
  const metersRes = await page.evaluate(() => {
    const m = document.querySelector('.res-meters'), fill = document.getElementById('res-xpfill');
    const gain = document.getElementById('res-xp-gain');
    const pwrGain = [...document.querySelectorAll('.res-mgain')].pop();
    return { bg: getComputedStyle(m).backgroundColor, xp: getComputedStyle(fill).backgroundColor,
      gainCol: getComputedStyle(gain).color, pwr: pwrGain.textContent.trim() };
  });
  check(`メーターは黒座布団 (${metersRes.bg})`, /rgba?\(0, 0, 0/.test(metersRes.bg));
  check(`XPゲージが黄色 (${metersRes.xp})`, metersRes.xp === 'rgb(255, 255, 55)');
  check(`獲得XPも黄色 (${metersRes.gainCol})`, metersRes.gainCol === 'rgb(255, 255, 55)');
  check(`PWRの増減は%表記 (${metersRes.pwr})`, /%$/.test(metersRes.pwr));
  check('「カードをタップで発音」の帯は出さない', await page.evaluate(() => !document.querySelector('.res-spkhint')));
  check('レベルアップ演出が出せる', await page.evaluate(() => { showLevelUp(3, 2); const ok = !!document.querySelector('.lvup') && /LEVEL UP/.test(document.querySelector('.lvup').textContent); closeLevelUp(); return ok; }));

  // ---------- 忘却曲線：書き取りの誤答で一気に落とさない ----------
  const mem = await page.evaluate(() => {
    const w = BEGINNER_WORDS[0];
    const run = (type, streak) => {
      const s = {};
      s[w.id] = {
        hasSeen: true, hasEverCorrect: true, memoryScore: 60, formingScore: 0, stabilityHours: 12,
        wordDifficulty: 1, reviewCount: 3, correctCount: 3, incorrectCount: 0, consecutiveCorrectCount: streak,
        lastReviewedAt: new Date(Date.now() - 3600000).toISOString(), firstCorrectAt: new Date(Date.now() - 86400000).toISOString()
      };
      localStorage.setItem('kwt_stats_v1', JSON.stringify(s));
      _d5 = { on: false, mode: '', slot: '', key: '' };
      state = { questions: [{ word: w, type, choices: [w.ja], correct: type === 'w' ? w.ko : w.ja, source: 'new' }], idx: 0, results: [], testId: 'tX', userId: 'u', cycleNumber: 1 };
      answered = false; clearInterval(timer); startTimer();
      submit('incorrect', 'ㅁㅁㅁ');
      document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer);
      return loadStats()[w.id];
    };
    const choice = run('kj', 0), writing = run('w', 0), lapse = run('kj', 3);
    return {
      choice: choice.memoryScore, writing: writing.memoryScore, lapse: lapse.memoryScore,
      choiceStab: choice.stabilityHours, writingStab: writing.stabilityHours
    };
  });
  check(`書き取りの誤答は4択の誤答より減らない (書取${mem.writing.toFixed(1)} > 4択${mem.choice.toFixed(1)})`, mem.writing > mem.choice);
  check(`書き取りの誤答で0にならない (${mem.writing.toFixed(1)})`, mem.writing > 20);
  check(`書き取りの誤答では安定度も落ちにくい (${mem.writingStab.toFixed(1)}h > ${mem.choiceStab.toFixed(1)}h)`, mem.writingStab > mem.choiceStab);
  check(`連続正解中のうっかりは減点が弱まる (${mem.lapse.toFixed(1)} > ${mem.choice.toFixed(1)})`, mem.lapse > mem.choice);

  // ---------- 長い日本語の選択肢 ----------
  check('短い選択肢はそのまま', await page.evaluate(() => choiceLenCls('感謝') === ''));
  check('やや長い選択肢は少し詰める', await page.evaluate(() => choiceLenCls('ドキュメンタリー') === ' len-l'));
  check('とても長い選択肢はさらに詰める', await page.evaluate(() => choiceLenCls('オールリダクション・テスト') === ' len-xl'));
  const lenPx = await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = '<button class="choice">あ</button><button class="choice len-l">あ</button><button class="choice len-xl">あ</button>';
    document.body.appendChild(d);
    const r = [...d.querySelectorAll('.choice')].map(b => parseFloat(getComputedStyle(b).fontSize));
    d.remove(); return r;
  });
  check(`長さに応じて字が小さくなる (${lenPx.join(' > ')})`, lenPx[0] > lenPx[1] && lenPx[1] > lenPx[2]);

  // ---------- 初テストのコメント（白い座布団は廃止し、ランク下の一言に集約） ----------
  check('初テストの白い座布団（res-first）は廃止された', await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = '<div class="res-first">a</div>';
    document.body.appendChild(d);
    const bg = getComputedStyle(d.firstChild).backgroundColor; d.remove();
    return bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent'; // スタイル定義そのものが無い
  }));
  check('応援コメントの字が大きくなった', await page.evaluate(() => {
    const d = document.createElement('div'); d.innerHTML = '<div class="res-cheer">a</div>';
    document.body.appendChild(d);
    const px = parseFloat(getComputedStyle(d.firstChild).fontSize); d.remove();
    return px >= 15;
  }));

  check('コンソールエラー無し', errors.length === 0);
  if (errors.length) console.log('  errors:', errors);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
