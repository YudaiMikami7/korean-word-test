/* メール指示 2026-07-31（第3便）の検証
 * 1) ダブルタップでの拡大を防ぐ
 * 2) 「ホーム画面に追加しますか？」の案内を閉じても画面が消えない
 * 3) 途中でホームに戻ったテストは記録しない／中断ポップアップに「※記録されません」
 * 4) 途中でアプリを閉じたら、次に開いたとき復帰をたずねる（成績は保存）
 * 5) 使い方ガイドが実画面のコーチマーク（切り抜き＋矢印＋説明）になっている
 * 使い方: node smoke.mail0731c.test.js
 */
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file:///' + path.resolve(__dirname, 'index.html').split(path.sep).join('/');

const results = [];
function check(name, cond, note) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${note ? ' (' + note + ')' : ''}`); }

/* ガイド・今日の5問を出さない状態でホームまで進める */
async function fresh(page, extra) {
  await page.goto(FILE);
  await page.evaluate((ex) => {
    localStorage.clear();
    localStorage.setItem('kwt_coach_v1', '1');
    localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now()));
    localStorage.setItem('kwt_firstdone_v1', '1');
    if (ex) Object.keys(ex).forEach(k => localStorage.setItem(k, ex[k]));
  }, extra || null);
  await page.reload();
  await page.waitForTimeout(1000);
}

/* スペシャル問題(13問)が混ざらないROOMで通常テストを始める＝12問で固定して検証する */
async function start12(page) {
  await page.evaluate(() => {
    let sec = 1;
    while (sec < 17 && specialKind('beginner', sec)) sec++;
    curLevel = 'beginner'; curSection = sec; _boardTile = null;
    startTest(); clearInterval(timer); renderQuestion();
  });
  await page.waitForTimeout(300);
}

/* 通常テストをn問だけ解く（既存スモークと同じ手順で、演出待ちをせずに送る） */
async function answerN(page, n) {
  await page.evaluate((n) => {
    for (let i = 0; i < n; i++) {
      const q = state.questions[state.idx];
      if (q.type === 'sg' || q.type === 'sg4') { shootAdvance(); continue; }
      answered = false; clearInterval(timer); startTimer();
      submit('correct', q.type === 'w' ? q.word.ko : q.correct);
      document.querySelectorAll('.overlay').forEach(o => o.remove());
      clearTimeout(ovTimer);
      afterAnswer();
    }
  }, n);
  await page.waitForTimeout(350);
}
function xpOf() { return Math.round(loadHistory().reduce((a, r) => a + (r.score || 0), 0)) + loadBonus(); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 602, height: 1178 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // ================= 1) ダブルタップ拡大の抑止 =================
  await fresh(page);
  check('viewportで拡大を禁止している', await page.evaluate(() => {
    const c = document.querySelector('meta[name=viewport]').content;
    return /user-scalable=no/.test(c) && /maximum-scale=1/.test(c);
  }));
  check('全要素がtouch-action:manipulation（ダブルタップ拡大なし）', await page.evaluate(() => {
    const el = document.createElement('div'); document.body.appendChild(el);
    const v = getComputedStyle(el).touchAction; el.remove(); return v === 'manipulation';
  }));
  check('スタートのマスもmanipulation', await page.evaluate(() => {
    const e = document.querySelector('.sg-tile.now'); return e && getComputedStyle(e).touchAction === 'manipulation';
  }));
  check('スワイプ用のtouch-action指定は壊していない', await page.evaluate(() => {
    const e = document.querySelector('.rp-pager'); return !e || getComputedStyle(e).touchAction === 'pan-x';
  }));
  check('dblclickは既定動作を止めている', await page.evaluate(() => {
    const ev = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev); return ev.defaultPrevented;
  }));

  // ================= 2) ホーム画面に追加の案内 =================
  check('案内を開いても本体は消えない', await page.evaluate(() => {
    promptInstall();
    return !!document.getElementById('pi-close') && !!document.getElementById('s-home');
  }));
  const closed = await page.evaluate(() => {
    document.getElementById('pi-close').click();
    return { body: !!document.body, home: !!document.getElementById('s-home'), ov: !!document.getElementById('pi-close') };
  });
  check('「閉じる」で案内だけが消える', closed.ov === false);
  check('「閉じる」のあともホーム画面が残っている', closed.body && closed.home);
  check('ホーム画面はちゃんと見えている', await page.evaluate(() => {
    const e = document.getElementById('s-home'); return e && e.getBoundingClientRect().height > 100;
  }));

  // ================= 3) 中断したテストは記録しない =================
  await fresh(page);
  const before = await page.evaluate(() => ({
    hist: loadHistory().length, stats: Object.keys(loadStats()).length, cards: totalCards(),
    xp: Math.round(loadHistory().reduce((a, r) => a + (r.score || 0), 0)) + loadBonus()
  }));
  await start12(page);
  await answerN(page, 4);
  const mid = await page.evaluate(() => ({ idx: state.idx, hist: loadHistory().length, res: state.results.length }));
  check('4問ぶん回答が進んでいる', mid.res === 4, mid.res + '問');

  check('中断ダイアログに「※記録されません」がある', await page.evaluate(() => {
    confirmQuit();
    const t = document.querySelector('.appconfirm .ac-t');
    return !!t && /※記録されません/.test(t.textContent) && !!document.querySelector('.ac-nolog');
  }));
  check('「※記録されません」は赤字で目立つ', await page.evaluate(() => {
    const c = getComputedStyle(document.querySelector('.ac-nolog')).color;
    const m = c.match(/\d+/g); return m && +m[0] > 150 && +m[1] < 110;
  }));
  await page.evaluate(() => { document.getElementById('ac-yes').click(); });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    home: document.getElementById('s-home').classList.contains('on'),
    hist: loadHistory().length, stats: Object.keys(loadStats()).length, cards: totalCards(),
    xp: Math.round(loadHistory().reduce((a, r) => a + (r.score || 0), 0)) + loadBonus(),
    txn: localStorage.getItem('kwt_txn_v1'), resume: localStorage.getItem('kwt_resume_v1')
  }));
  check('中断でホームに戻る', after.home);
  check('回答履歴が残らない', after.hist === before.hist, before.hist + ' → ' + after.hist);
  check('記憶率(stats)が動いていない', after.stats === before.stats, before.stats + ' → ' + after.stats);
  check('単語カードも増えていない', after.cards === before.cards, before.cards + ' → ' + after.cards);
  check('XPも増えていない', after.xp === before.xp, before.xp + ' → ' + after.xp);
  check('中断の控えは片づけられる', after.txn === null);
  check('中断したら復帰の控えも消える', after.resume === null);
  check('診断も進んでいない', await page.evaluate(() => {
    const d = computeDiagnosis(); return !d.complete;
  }));

  // ================= 3-b) 完走したときはちゃんと記録される =================
  await fresh(page);
  const b2 = await page.evaluate(() => ({ hist: loadHistory().length, stats: Object.keys(loadStats()).length }));
  await start12(page);
  await answerN(page, 12);
  await page.waitForTimeout(700);
  const a2 = await page.evaluate(() => ({
    result: document.getElementById('s-result').classList.contains('on'),
    hist: loadHistory().length, stats: Object.keys(loadStats()).length,
    txn: localStorage.getItem('kwt_txn_v1'), resume: localStorage.getItem('kwt_resume_v1')
  }));
  check('完走すると結果画面に進む', a2.result);
  check('完走ぶんは履歴に残る', a2.hist > b2.hist, b2.hist + ' → ' + a2.hist);
  check('完走ぶんは記憶率に残る', a2.stats > b2.stats, b2.stats + ' → ' + a2.stats);
  check('完走したら控えは捨てられる', a2.txn === null);
  check('完走したら復帰の控えも消える', a2.resume === null);

  // ================= 4) 途中でアプリを閉じたときの復帰 =================
  await fresh(page);
  await start12(page);
  await answerN(page, 5);
  const saved = await page.evaluate(() => {
    const r = JSON.parse(localStorage.getItem('kwt_resume_v1') || 'null');
    return r && { idx: r.state.idx, res: r.state.results.length, total: r.state.questions.length, hasTxn: !!r.txn };
  });
  check('途中の現在地が保存されている', !!saved && saved.idx === 5, saved && (saved.idx + '/' + saved.total));
  check('そこまでの成績も保存されている', !!saved && saved.res === 5);
  check('差し戻し用の控えも一緒に持っている', !!saved && saved.hasTxn);

  // アプリを閉じて開き直す＝リロード
  await page.reload();
  await page.waitForTimeout(1400);
  check('開き直すと復帰をたずねてくる', await page.evaluate(() => !!document.getElementById('resume-ask')));
  check('何問めまで解いたか書いてある', await page.evaluate(() => /5 \/ 12 問め/.test(document.querySelector('#resume-ask .ac-t').textContent)));
  check('復帰をたずねている間は今日の5問を割りこませない', await page.evaluate(() => { maybeAutoDaily5(); return !document.querySelector('.d5auto'); }));
  check('復帰をたずねている間は使い方ガイドも出さない', await page.evaluate(() => !document.getElementById('coach')));

  const resumed = await page.evaluate(() => {
    document.querySelector('#resume-ask #ac-yes').click();
    return { quiz: document.getElementById('s-quiz').classList.contains('on'), idx: state.idx, res: state.results.length, total: state.questions.length };
  });
  check('「つづきから」で出題画面に戻る', resumed.quiz);
  check('中断した問題から再開する', resumed.idx === 5, resumed.idx + '問め');
  check('途中までの成績が引き継がれている', resumed.res === 5);
  check('残り問題も引き継がれている', resumed.total === 12);
  check('進捗の帯も途中から始まる', await page.evaluate(() => _runIdx === 5));
  check('画面の出題番号も6問め', await page.evaluate(() => document.getElementById('prog').textContent.indexOf('6 / 12') >= 0));

  // 復帰後にそのまま完走できる
  await answerN(page, 7);
  await page.waitForTimeout(700);
  check('復帰後もそのまま完走できる', await page.evaluate(() => document.getElementById('s-result').classList.contains('on')));
  check('完走後は復帰の控えが消えている', await page.evaluate(() => localStorage.getItem('kwt_resume_v1') === null));

  // 「やめる」を選んだら記録しない
  await fresh(page);
  const b3 = await page.evaluate(() => ({ hist: loadHistory().length, stats: Object.keys(loadStats()).length }));
  await start12(page);
  await answerN(page, 3);
  await page.reload();
  await page.waitForTimeout(1400);
  const a3 = await page.evaluate(() => {
    document.querySelector('#resume-ask #ac-no').click();
    return { hist: loadHistory().length, stats: Object.keys(loadStats()).length, resume: localStorage.getItem('kwt_resume_v1') };
  });
  check('「やめる」なら履歴は残らない', a3.hist === b3.hist, b3.hist + ' → ' + a3.hist);
  check('「やめる」なら記憶率も動かない', a3.stats === b3.stats, b3.stats + ' → ' + a3.stats);
  check('「やめる」で控えも消える', a3.resume === null);
  check('「やめる」のあとはホームのまま', await page.evaluate(() => document.getElementById('s-home').classList.contains('on')));

  // 完走済み・途中なしのときは聞かれない
  await page.reload();
  await page.waitForTimeout(1400);
  check('途中が無ければ復帰は聞かれない', await page.evaluate(() => !document.getElementById('resume-ask')));

  // ================= 5) 使い方ガイド＝実画面のコーチマーク =================
  await page.goto(FILE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1600);
  check('初回に使い方ガイドが出る', await page.evaluate(() => !!document.getElementById('coach')));
  check('中央の説明ポップアップ(.coach-in)は廃止', await page.evaluate(() => !document.querySelector('.coach-in')));
  check('画面を切り抜く枠がある', await page.evaluate(() => !!document.getElementById('cm-hole')));
  check('切り抜きの外だけが暗い（全面ベタ塗りではない）', await page.evaluate(() => {
    const c = getComputedStyle(document.getElementById('coach')).backgroundColor;
    return c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
  }));
  check('説明の箱から矢印が出ている', await page.evaluate(() => {
    const st = getComputedStyle(document.getElementById('cm-tip'), '::before');
    return st.content !== 'none' && parseFloat(st.borderBottomWidth) + parseFloat(st.borderTopWidth) > 5;
  }));
  check('矢印は切り抜きのほうを向いている', await page.evaluate(() => {
    const tip = document.getElementById('cm-tip'), h = document.getElementById('cm-hole').getBoundingClientRect();
    const above = tip.classList.contains('above'), below = tip.classList.contains('below');
    const t = tip.getBoundingClientRect();
    return (below && t.top >= h.bottom - 1) || (above && t.bottom <= h.top + 1);
  }));
  check('矢印のx位置が部品の中心に合っている', await page.evaluate(() => {
    const tip = document.getElementById('cm-tip'), t = tip.getBoundingClientRect();
    const h = document.getElementById('cm-hole').getBoundingClientRect();
    const ax = parseFloat(getComputedStyle(tip).getPropertyValue('--ax'));
    return Math.abs((t.left + ax) - (h.left + h.width / 2)) < 30;
  }));
  check('説明文が表示されている', await page.evaluate(() => document.getElementById('cm-sub').textContent.length > 10));
  const steps = [];
  for (let i = 0; i < 9; i++) {
    await page.waitForTimeout(380); // 切り抜きは .28s かけて動くので落ち着いてから測る
    const st = await page.evaluate(() => {
      const h = document.getElementById('cm-hole').getBoundingClientRect();
      return { h: document.getElementById('cm-h').textContent, w: Math.round(h.width), ht: Math.round(h.height), t: Math.round(h.top), last: document.getElementById('coach-next').textContent === 'はじめる' };
    });
    steps.push(st);
    if (st.last) break;
    await page.evaluate(() => coachNext());
  }
  const vh = 1178, vw = 602;
  check('複数のステップがある', steps.length >= 4, steps.length + 'ステップ');
  check('ステップごとに切り抜く場所が動く', new Set(steps.map(s => s.t + 'x' + s.w + 'x' + s.ht)).size === steps.length);
  check('切り抜きは画面全体ではない（部品を指している）',
    steps.every(s => (s.w * s.ht) < vw * vh * 0.4), '最大' + Math.max(...steps.map(s => Math.round(s.w * s.ht / (vw * vh) * 100))) + '%');
  check('スタートのマスを指すステップがある', steps.some(s => /スタート/.test(s.h)));
  check('今日の5問を指すステップがある', steps.some(s => /今日の5問/.test(s.h)));
  check('PWR・XPを指すステップがある', steps.some(s => /PWR/.test(s.h)));
  check('スキップボタンがある', await page.evaluate(() => !!document.getElementById('coach-skip')));
  await page.evaluate(() => coachNext());
  await page.waitForTimeout(300);
  check('最後まで進めるとガイドが閉じる', await page.evaluate(() => !document.getElementById('coach')));
  check('設定からも読み直せる', await page.evaluate(() => { showCoach(); return !!document.getElementById('cm-hole'); }));
  await page.evaluate(() => closeCoach());

  check('コンソールエラー無し', errors.length === 0, errors.join(' / '));

  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length}/${results.length} passed`);
  if (ng.length) { console.log('FAILED: ' + ng.map(r => r.name).join(' / ')); process.exit(1); }
})();
