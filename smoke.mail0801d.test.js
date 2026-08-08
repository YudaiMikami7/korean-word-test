/* k-tango 2026-08-01 19:49 / 20:02 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0801d.test.js
 * 検証:
 *  ① 出題画面のカード帯：角丸なし／動物より上の隙間なし／カードの影なし
 *  ② カードは動かず、12問なら最初から12枚ぜんぶ見えている。動物のほうが1問ごとに右へ進む
 *  ③ 今日の5問のあと、中央のカプセルは「今日のトレンド」ではなく「今週のミッション」
 *  ④ ミッションは5つ。1つめ＝トレンド問題（ボタン）／2つ＝おすすめROOM＋目標ランク／2つ＝書き取り・スペシャル・3秒以内
 *  ⑤ ROOMミッションをタッチするとそのROOMまでアニメーションで移動する
 *  ⑥ 進み具合が履歴・すごろく・トレンド記録から数えられている
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond, note) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${note ? ' (' + note + ')' : ''}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 602, height: 1178 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kwt_coach_v1', '1');
    localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now()));
    localStorage.setItem('kwt_firstdone_v1', '1');
  });
  await page.reload();
  await page.waitForTimeout(1500);

  // ================= ①② 出題画面のカード帯 =================
  await page.evaluate(() => {
    curLevel = 'beginner'; curSection = 1;
    _boardTile = { level: 'beginner', sec: 1, gidx: 1 };
    startTest();
  });
  await page.waitForTimeout(700);

  const bar = await page.evaluate(() => {
    const p = document.getElementById('pbar'), s = getComputedStyle(p);
    const ch = document.getElementById('rn-char'), cs = getComputedStyle(ch);
    const pr = p.getBoundingClientRect(), cr = ch.getBoundingClientRect();
    const slot = document.querySelector('#rn-slot, .rn-slot');
    return {
      radius: parseFloat(s.borderTopLeftRadius),
      barH: pr.height, charH: cr.height, slotH: slot.getBoundingClientRect().height,
      // 札の列と動物は同じ1列に置く（メール指示 2026-08-02）。動物は帯の下端（＝タイムメータの上）に立つ
      gapBelow: pr.bottom - cr.bottom,
      shadow: getComputedStyle(slot).boxShadow,
      slotN: document.querySelectorAll('.rn-slot').length,
      qN: state.questions.filter(q => q.type !== 'sg' && q.type !== 'sg4').length,
      allQ: state.questions.length
    };
  });
  check(`帯の角丸がない (${bar.radius}px)`, bar.radius === 0);
  check(`動物は帯の下端＝タイムメータの上に立つ (帯の下端から${Math.round(bar.gapBelow)}px)`, Math.abs(bar.gapBelow) < 1.5);
  check(`札と動物は同じ1列（帯は1段ぶんの高さ） (帯${Math.round(bar.barH)}px / 札${Math.round(bar.slotH)}px・動物${Math.round(bar.charH)}px)`,
    bar.barH >= bar.charH && bar.barH < bar.slotH + bar.charH);
  check(`カードに影がない (${bar.shadow})`, bar.shadow === 'none' || /rgba\(0, 0, 0, 0\)/.test(bar.shadow));
  check(`問題数ぶんのカードが最初から並んでいる (${bar.slotN}枚 / ${bar.allQ}問)`, bar.slotN === bar.allQ);

  const vis = await page.evaluate(() => {
    const pr = document.getElementById('pbar').getBoundingClientRect();
    return [...document.querySelectorAll('.rn-slot')].map(s => {
      const r = s.getBoundingClientRect();
      return r.left >= pr.left - 1 && r.right <= pr.right + 1;
    });
  });
  check(`12枚ぜんぶが帯の中に見えている (${vis.filter(Boolean).length}/${vis.length})`, vis.every(Boolean));

  // 1問答えたとき：カードは動かない／動物が右へ進む
  const move = await page.evaluate(() => {
    const pos = () => [...document.querySelectorAll('.rn-slot')].map(s => Math.round(s.getBoundingClientRect().left));
    const chX = () => document.getElementById('rn-char').getBoundingClientRect().left;
    const before = { slots: pos(), char: chX(), left: parseFloat(document.getElementById('rn-char').style.left) };
    const q = state.questions[state.idx];
    answered = false; clearInterval(timer); startTimer();
    submit('correct', q.type === 'w' ? q.word.ko : q.correct);
    const after = { left: parseFloat(document.getElementById('rn-char').style.left) };
    return { before, after, slotsAfter: pos() };
  });
  const slotsStill = move.before.slots.length === move.slotsAfter.length &&
    move.before.slots.every((x, i) => Math.abs(x - move.slotsAfter[i]) < 1);
  check('1問答えてもカードの位置は動かない', slotsStill);
  check(`動物が1コマぶん右へ進む (left ${move.before.left}px → ${move.after.left}px)`, move.after.left > move.before.left + 8);

  await page.evaluate(() => { document.querySelectorAll('.overlay').forEach(o => o.remove()); confirmQuit(); quitTest(true); show('s-home'); });
  await page.waitForTimeout(500);

  // ================= ③ 今日の5問のあとは「今週のミッション」 =================
  const before5 = await page.evaluate(() => {
    show('s-home'); renderHome();
    const ms = document.querySelector('.sg-mission');
    return { exists: !!ms, on: ms && ms.classList.contains('on') };
  });
  check('今週のミッションのボタンがホームにある', before5.exists);
  check('今日の5問を終える前は出ていない', before5.on === false);

  const after5 = await page.evaluate(() => {
    // 今日の5問を消化した状態にする
    const k = d5Key(Date.now()), o = loadD5();
    o[k] = { done: true, correct: 5, total: 5, slot: d5Slot(Date.now()), started: Date.now(), finished: Date.now() };
    _lsSetJSON(LS_D5, o);
    show('s-home'); renderHome(); updateD5Btn();
    const ms = document.querySelector('.sg-mission'), tr = document.querySelector('.sg-trend');
    return {
      on: ms && ms.classList.contains('on'),
      label: ms && ms.querySelector('.sgms-t').textContent,
      badge: ms && ms.querySelector('.ms-b').textContent,
      trendGone: !tr,
      centered: ms && Math.abs((ms.getBoundingClientRect().left + ms.getBoundingClientRect().width / 2) - innerWidth / 2) < 40
    };
  });
  check('今日の5問を終えたら今週のミッションが出る', after5.on);
  check(`ボタンの文字が「今週のミッション」 (${after5.label})`, after5.label === '今週のミッション');
  check(`残り数のバッジが出る (${after5.badge})`, after5.badge === '3'); // 3つに絞った（メール指示 2026-08-08）
  check('今日のトレンドのボタンはホームに出さない', after5.trendGone);
  check('中央のカプセル位置にある', after5.centered);

  // ================= ④ ミッションの中身 =================
  const list = await page.evaluate(() => {
    openMission();
    const rows = [...document.querySelectorAll('#d5-modal .ms-row')];
    return {
      n: rows.length,
      titles: rows.map(r => r.querySelector('.ms-t').textContent),
      tapable: rows.map(r => r.classList.contains('tapable')),
      kinds: loadMission().list.map(m => m.kind),
      head: document.querySelector('#d5-modal .u5-ti').textContent,   // 統合ポップアップの1つめの見出し
      d5Head: [...document.querySelectorAll('#d5-modal .u5-ti')].map(e => e.textContent),
      d5Below: (() => { const c = document.querySelector('#d5-modal .u5-card'); if (!c) return false;
        const ms = c.querySelector('.ms-list'), d5 = c.querySelector('.d5-slots');
        return !!ms && !!d5 && ms.getBoundingClientRect().top < d5.getBoundingClientRect().top; })(),
      bubbleShown: document.getElementById('d5-modal').classList.contains('on')
    };
  });
  check('吹き出しの見出しが「今週のミッション」', list.head === '今週のミッション');
  // 今日の5問と同じ1枚にまとめ、ミッションを上に置いた（メール指示 2026-08-08）
  check(`同じポップアップに今日の5問もある (${list.d5Head.join(' / ')})`, list.d5Head.indexOf('今日の5問') > 0);
  check('今週のミッションが今日の5問より上にある', list.d5Below);
  check(`ミッションが3つある (${list.n}件)`, list.n === 3);
  check('トレンド問題のミッションは無い', list.kinds.indexOf('trend') < 0 && list.titles.every(t => !/トレンド/.test(t)));
  const roomIdx = list.kinds.map((k, i) => k === 'room' ? i : -1).filter(i => i >= 0);
  check(`おすすめROOM＋目標ランクのミッションが2つ (${roomIdx.map(i => list.titles[i]).join(' / ')})`, roomIdx.length === 2);
  check('ROOMミッションは「ROOM NN で X ランクをとる」の形', roomIdx.every(i => /^ROOM \d\d で [SABCD] ランクをとる$/.test(list.titles[i])));
  check('ROOMミッションはタッチできる', roomIdx.every(i => list.tapable[i] === true));
  // 3つに絞ったので、ROOM2つ＋スキル系1つ（メール指示 2026-08-08）
  const skills = list.kinds.filter(k => k !== 'room');
  check(`ROOM以外から1つ (${skills.join(',')})`, skills.length === 1);
  check('スキル系ミッションの文言が指示どおり', list.titles.every(t =>
    !/書き取り|スペシャル|3秒/.test(t) ||
    /書き取り問題を3問正解する|スペシャル問題（青赤緑）のいずれかを6回クリアする|3秒以内に答えて正解するを10問/.test(t)));

  // ================= ⑤ ROOMミッションをタッチ → そのROOMへ移動 =================
  const jump = await page.evaluate(async () => {
    const m = loadMission().list.find(x => x.kind === 'room');
    const hv = document.getElementById('hv-rooms');
    hv.scrollLeft = (m.sec + 5) * 602; // わざと離れたROOMから出発して、ちゃんと移動することを見る
    await new Promise(r => setTimeout(r, 300));
    openMission();
    const from = hv.scrollLeft;
    missionTapRoom(m.sec);
    await new Promise(r => setTimeout(r, 1400));
    return { sec: m.sec, from, to: hv.scrollLeft, want: (m.sec + PQ_OFF) * 602, closed: !document.getElementById('d5-modal').classList.contains('on') }; // プリQQ非表示ぶんのオフセット（メール指示 2026-08-02）
  });
  check('タッチしたら吹き出しが閉じる', jump.closed);
  check(`そのROOMまで移動する (ROOM${jump.sec}: ${jump.from} → ${jump.to} / 目標${jump.want})`, Math.abs(jump.to - jump.want) < 20);
  check('スクロールで移動している（瞬間移動ではない）', jump.from !== jump.to);

  // ================= ⑥ 進み具合の数え方 =================
  const prog = await page.evaluate(() => {
    const list = loadMission().list;
    const out = {};
    // 書き取り正解を3問ぶん、3秒以内の正解を10問ぶん、履歴に積む
    const h = loadHistory();
    for (let i = 0; i < 12; i++) h.push({ wordId: 9000 + i, testId: 'ms-test', isCorrect: true, questionType: i < 5 ? 'writing' : 'choice',
      responseTimeSec: 2.1, answeredAt: new Date().toISOString(), score: 8 });
    _lsSetJSON(LS_HIST, h); _histIdxCache = null;
    list.forEach(m => { out[m.kind] = missionProgress(m); });
    out.writeDirect = missionProgress({ kind: 'write', n: 3 });   // その週に選ばれていなくても数え方は見ておく
    out.fastDirect = missionProgress({ kind: 'fast', n: 10 });
    // スペシャル問題のクリアを6回ぶん
    for (let i = 0; i < 6; i++) noteSpecialClear();
    out.specialAfter = missionProgress({ kind: 'special', n: 6 });
    // 先週ぶんは数えない
    const old = loadSpClears(); old[0] = new Date(weekStartMs() - 86400000).toISOString(); _lsSetJSON(LS_SPCLEAR, old);
    out.specialLastWeek = missionProgress({ kind: 'special', n: 6 });
    out.weekStartIsMonday = new Date(weekStartMs()).getDay() === 1;
    out.weekStartHour = new Date(weekStartMs()).getHours();
    return out;
  });
  check(`書き取りの正解数を数えている (${prog.writeDirect}問)`, prog.writeDirect === 5);
  check(`3秒以内の正解数を数えている (${prog.fastDirect}問)`, prog.fastDirect === 12);
  check(`スペシャル問題のクリア回数を数えている (${prog.specialAfter}回)`, prog.specialAfter === 6);
  check(`先週ぶんのクリアは数えない (${prog.specialLastWeek}回)`, prog.specialLastWeek === 5);
  check('週の区切りは月曜', prog.weekStartIsMonday);
  check(`週の区切りはあさ5時 (${prog.weekStartHour}時)`, prog.weekStartHour === 5);

  const MSN = await page.evaluate(() => MS_N);
  const badge = await page.evaluate(() => {
    updateMissionBtn();
    const ms = document.querySelector('.sg-mission');
    return { badge: ms.querySelector('.ms-b').textContent, done: missionDoneCount() };
  });
  check(`達成したぶんバッジの残り数が減る (残り${badge.badge} / 達成${badge.done})`, Number(badge.badge) === MSN - badge.done);

  // ================= ミッションのカプセルからも同じ統合ポップアップが開く =================
  const one = await page.evaluate(async () => {
    document.getElementById('d5-modal').classList.remove('on');
    document.querySelector('.sg-mission').click();
    await new Promise(r => setTimeout(r, 400));
    const c = document.querySelector('#d5-modal .u5-card');
    return { on: document.getElementById('d5-modal').classList.contains('on'),
             kicks: c ? [...c.querySelectorAll('.u5-kick')].map(e => e.textContent) : [] };
  });
  check(`ミッションのカプセルで統合ポップアップが開く (${one.kicks.join('/')})`,
    one.on && one.kicks.join('/') === 'MISSION/TODAY');

  check('コンソールエラーなし', errors.length === 0, errors.join(' | '));
  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length}/${results.length} PASS`);
  if (ng.length) { console.log('FAILED:'); ng.forEach(r => console.log(' - ' + r.name)); process.exit(1); }
})();
