/* k-tango 2026-08-08 21:06 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0808.test.js
 * 指示:
 *  ① 今日の5問と今週のミッションを同じポップアップに（ミッションが上）
 *  ② 今週のミッションからトレンド問題を廃止／トレンド問題そのものも廃止
 *  ③ 今週のミッションは3つに絞る
 *  ④ 統合ポップアップのデザインを、もっと簡潔でグラフィカルなスタイリッシュなものに
 *  ⑤ もとの「今日の5問」の丸は育成ゲームのメニューを開くボタンにし、
 *     押すとキャラクターと「ごはんをあげる」ボタンが出る
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const results = [];
function check(name, cond, note) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${note ? ' (' + note + ')' : ''}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').split(path.sep).join('/');

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
    localStorage.setItem('kwt_firstdone_v1', '1');
    localStorage.setItem('kwt_roomhint_v1', '1');
    localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); // 自動スタートの吹き出しは邪魔なので出さない
  });
  await page.reload();
  await page.waitForTimeout(1600);
  const clearFx = () => page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.lvup,.pbub,.stepnote,.rest-ask,#resume-ask,.coach,.d5auto').forEach(o => o.remove()));
  await clearFx();

  /* ============ ② トレンド問題そのものの廃止 ============ */
  check('2-1 トレンドの関数・データが残っていない', await page.evaluate(() =>
    typeof openTrend === 'undefined' && typeof startTrend === 'undefined' && typeof loadTrend === 'undefined'
    && typeof TREND_WORDS === 'undefined'));
  check('2-2 ホームにトレンドのボタンが無い', await page.evaluate(() => !document.querySelector('.sg-trend')));
  check('2-3 単語データ(trend-words.js)を読み込んでいない', await page.evaluate(() =>
    ![...document.querySelectorAll('script')].some(s => /trend/.test(s.getAttribute('src') || ''))));
  check('2-4 trend-words.js のファイルも無い', !fs.existsSync(path.join(__dirname, 'trend-words.js')));

  /* ============ ③ 今週のミッションは3つ ============ */
  const ms = await page.evaluate(() => ({
    n: MS_N, kinds: loadMission().list.map(m => m.kind),
    titles: missionRows().map(r => missionTitle(r.m))
  }));
  check(`3-1 ミッションは3つ (MS_N=${ms.n})`, ms.n === 3);
  check(`3-2 組み立てたミッションも3つ (${ms.kinds.join(',')})`, ms.kinds.length === 3);
  check('3-3 トレンドのミッションは無い', ms.kinds.indexOf('trend') < 0 && ms.titles.every(t => !/トレンド/.test(t)));

  /* ============ ① 同じポップアップ／ミッションが上 ============ */
  await page.evaluate(() => openDaily5());
  await page.waitForTimeout(400);
  const pop = await page.evaluate(() => {
    const c = document.querySelector('#d5-modal .u5-card');
    if (!c) return null;
    const ms2 = c.querySelector('.ms-list'), d5 = c.querySelector('.d5-slots');
    return {
      kicks: [...c.querySelectorAll('.u5-kick')].map(e => e.textContent),
      titles: [...c.querySelectorAll('.u5-ti')].map(e => e.textContent),
      rows: c.querySelectorAll('.ms-row').length,
      above: ms2.getBoundingClientRect().bottom <= d5.getBoundingClientRect().top,
      go: (c.querySelector('.d5-go') || {}).textContent,
      slots: c.querySelectorAll('.d5-slot').length,
      fit: (() => { const b = c.getBoundingClientRect(); return b.left >= -0.5 && b.top >= -0.5 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1; })()
    };
  });
  check('1-1 今日の5問と今週のミッションが1枚のポップアップに入っている',
    pop && pop.titles.indexOf('今週のミッション') === 0 && pop.titles.indexOf('今日の5問') === 1);
  check(`1-2 今週のミッションが今日の5問より上にある`, pop && pop.above);
  check(`1-3 ミッションの行は3つ (${pop && pop.rows})`, pop && pop.rows === 3);
  check(`1-4 今日の5問の朝／夜のマスと開始ボタンもある (${pop && pop.go})`, pop && pop.slots === 2 && /はじめる/.test(pop.go || ''));
  check('1-5 ポップアップが画面に収まっている', pop && pop.fit);

  /* ============ ④ 簡潔・グラフィカル・スタイリッシュ ============ */
  const look = await page.evaluate(() => {
    const c = document.querySelector('#d5-modal .u5-card'), st = getComputedStyle(c);
    const ring = c.querySelector('.u5-ring'), bar = c.querySelector('.ms-bar i');
    const tail = getComputedStyle(c, '::after');
    return {
      bg: st.backgroundColor, radius: st.borderTopLeftRadius,
      ring: !!ring && /conic-gradient/.test(getComputedStyle(ring).backgroundImage),
      ringTxt: ring && ring.textContent,
      bar: !!bar && /linear-gradient/.test(getComputedStyle(bar).backgroundImage),
      tail: tail.borderTopColor,
      chars: c.textContent.replace(/\s/g, '').length
    };
  });
  // ダーク地は 2026-08-08 22:26 の指示で白地に変えた
  check(`4-1 白地のカード (${look.bg})`, look.bg === 'rgb(255, 255, 255)');
  check(`4-2 角丸を大きくしたカード (${look.radius})`, parseFloat(look.radius) >= 20);
  check('4-3 達成数はドーナツ（円グラフ）で見せる', look.ring);
  check('4-4 進み具合は色のついたバーで見せる', look.bar);
  check(`4-5 しっぽの色もカードに合わせている (${look.tail})`, look.tail === 'rgb(255, 255, 255)');
  check(`4-6 文字数はしぼってある (${look.chars}字)`, look.chars <= 200);
  await page.evaluate(() => closeDaily5());

  /* ============ ⑤ もとの5問の丸＝育成ゲームのメニュー ============ */
  await page.evaluate(() => { const all = loadD5(); all[d5Key(Date.now())] = { done: true, correct: 5, total: 5, slot: d5Slot(Date.now()) }; saveD5(all); show('s-home'); renderHome(); updateD5Btn(); });
  await page.waitForTimeout(900);
  await clearFx();
  const home = await page.evaluate(() => {
    const g = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, b: r.bottom, w: r.width }; };
    const pet = document.querySelector('.sg-pet'), gift = document.querySelector('.sg-gift'), d5 = document.querySelector('.sg-d5');
    return { pet: pet && g(pet), gift: gift && g(gift), d5w: d5.getBoundingClientRect().width,
             msOn: document.querySelector('.sg-mission').classList.contains('on'), label: pet && pet.textContent };
  });
  check(`5-1 もとの5問の丸の場所に育成ゲームのボタンがある (${home.label})`, !!home.pet && Math.abs(home.pet.x - home.gift.x) < 1 && Math.abs(home.pet.w - 68) < 1);
  check('5-2 プレゼントの丸のすぐ下に並ぶ', home.gift.b < home.pet.y && home.pet.y - home.gift.b < 20);
  check('5-3 消化後の5問カプセルは消え、中央は今週のミッション', home.d5w === 0 && home.msOn);

  const menu = await page.evaluate(async () => {
    const o = petState(); o.seeds = 2; savePet(o);
    openPetMenu();
    await new Promise(r => setTimeout(r, 350));
    const c = document.querySelector('#petmenu-modal .pm-card');
    if (!c) return null;
    return {
      on: document.getElementById('petmenu-modal').classList.contains('on'),
      art: !!c.querySelector('.pt-art'), body: (c.querySelector('.pt-art .pt-body') || {}).textContent,
      feed: (c.querySelector('.pm-feed') || {}).textContent,
      toPet: [...c.querySelectorAll('button')].some(b => /育成画面/.test(b.textContent))
    };
  });
  check('5-4 押すと育成ゲームのメニューが開く', menu && menu.on);
  check(`5-5 キャラクターが出る (${menu && menu.body})`, menu && menu.art && !!menu.body);
  // きせかえは廃止され、主ボタンは広場を開くだけになった（メール指示 2026-09-03）
  check(`5-6 主ボタンは「広場をひらく」 (${menu && menu.feed})`, menu && /広場/.test(menu.feed || ''));
  check('5-7 きせかえのボタンは無い', menu && !/きせかえ/.test(menu.feed || ''));

  const fed = await page.evaluate(async () => {
    document.querySelector('#petmenu-modal .pm-feed').click();
    await new Promise(r => setTimeout(r, 350));
    return { plaza: document.getElementById('pet-modal').classList.contains('on'),
             field: !!document.querySelector('#pet-modal .pt-field'),
             head: (document.querySelector('#pet-modal .pt-subh') || {}).textContent || '' };
  });
  check(`5-8 押すと広場が開く (${fed.head})`, fed.plaza && fed.field);
  check(`5-9 ごはんは減らない (${fed.seed0}→${fed.seed1})`, fed.seed1 === fed.seed0);

  // ごはんをあげなくても、1問答えるたびに勝手に育つ
  const auto = await page.evaluate(() => {
    const sum = () => { const z = petState().zoo; return Object.keys(z).reduce((a, k) => a + (z[k].xp || 0), 0); };
    const before = sum(), ws = Object.values(WORD_BY_ID);
    for (let i = 0; i < 8; i++) saveAnswer({ wordId: ws[i].id, korean: ws[i].ko, answerType: 'choice',
      answerStatus: 'correct', isCorrect: true, userAnswer: ws[i].ja, distractorType: 'semantic_close',
      responseTimeMs: 1500, writingErrorType: 'phonetic_spelling', answeredAt: new Date().toISOString() });
    return { before, after: sum() };
  });
  check(`5-10 ごはんなしで、答えるだけで育つ (${auto.before}→${auto.after})`, auto.after > auto.before);
  await page.evaluate(() => { closePet(); closePetMenu(); });
  await page.evaluate(() => closeDaily5());

  /* ============ 回帰 ============ */
  check('R-1 版数が上がっている（v7以降）', await page.evaluate(() => /^v[7-9]\./.test(APP_VERSION)));
  const play = await page.evaluate(async () => {
    localStorage.removeItem('kwt_daily5_v1');
    show('s-home'); renderHome(); updateD5Btn();
    await new Promise(r => setTimeout(r, 300));
    openDaily5();
    await new Promise(r => setTimeout(r, 300));
    const has = !!document.querySelector('#d5-modal .d5-go');
    startDaily5();
    await new Promise(r => setTimeout(r, 2600));
    return { has, quiz: document.getElementById('s-quiz').classList.contains('on'), n: state.questions.length };
  });
  check('R-2 統合ポップアップから今日の5問を始められる', play.has && play.quiz && play.n === 5);
  await page.evaluate(() => { quitTest(); show('s-home'); });
  await page.waitForTimeout(600);
  // 「ことばの友だち」はメニューから廃止（メール指示 2026-08-31）
  check('R-3 ハンバーガーメニューは3つ', await page.evaluate(async () => {
    openHomeMenu();
    await new Promise(r => setTimeout(r, 300));
    const labs = [...document.querySelectorAll('#menu-modal .hm-cap')].map(b => b.textContent.trim());
    closeHomeMenu();
    return labs.length === 3 && !labs.some(l => /ことばの友だち/.test(l));
  }));
  check('R-4 JSコンソールエラーが無い', errors.length === 0, errors.join(' | '));

  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length} / ${results.length} PASS`);
  if (ng.length) { console.log('--- FAILED ---'); ng.forEach(r => console.log('  ' + r.name)); process.exit(1); }
})();
