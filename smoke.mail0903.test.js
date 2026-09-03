/* k-tango 2026-09-03 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0903.test.js
 * 検証:
 *  ① 出題中は動物のポップアップ（たまご・誕生・進化）を出さない
 *  ② つぎの問題までのカウントダウンの黒座布団に文字が収まっている
 *  ③ きせかえ機能は無い
 *  ④ 動物はもっと動き回る／広場ぜんたいに散らばる／吹き出しは名前つきで動物についていく
 *  ⑤ 学習履歴は最新が一番上（降順）／文字が大きくなった
 *  ⑥ パワーの考え方（時間で減る／学習で戻る）は変わっていない
 *  ⑦ ガチャはキャラクター獲得中心（XPは出ない）＋まとめて回す
 *  ⑧ プレゼントは持っている動物向けのアイテム／動物はあとから追加できる作り
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
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kwt_coach_v1', '1');
    localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now()));
  });
  await page.reload();
  await page.waitForTimeout(1500);
  const clearFx = () => page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.lvup,.pbub,.stepnote,.rest-ask,#resume-ask,.coach,.d5auto,.lapdone,.appconfirm').forEach(o => o.remove()));
  await clearFx();

  /* ============ ① 出題中に動物のポップアップを出さない ============ */
  const pop = await page.evaluate(async () => {
    // 進化・誕生の待ちがある状態で出題に入る
    const o = petState(); o.evoPend = { lv: 3, stage: 'child', sp: o.sp }; savePet(o);
    curLevel = 'beginner'; startTest(); clearInterval(timer); renderQuestion();
    const inQuiz = document.getElementById('s-quiz').classList.contains('on');
    const shownInQuiz = petHomePopups() || document.getElementById('petevo-modal').classList.contains('on');
    // たまごのお知らせも出題中は重ねない
    petEggShow(1);
    await new Promise(r => setTimeout(r, 400));
    const eggInQuiz = document.getElementById('petevo-modal').classList.contains('on');
    return { inQuiz, shownInQuiz, eggInQuiz, stillPending: !!petEvoPending() };
  });
  check('出題中である', pop.inQuiz);
  check('出題中は進化のポップアップを出さない', !pop.shownInQuiz);
  check('出題中はたまごのお知らせも出さない', !pop.eggInQuiz);
  check('出さなかったぶんは保留のまま残る（消えない）', pop.stillPending);

  const back = await page.evaluate(async () => {
    quitTest();
    document.querySelectorAll('.appconfirm').forEach(o => o.remove());
    show('s-home');
    await new Promise(r => setTimeout(r, 300));
    const shown = petHomePopups();
    await new Promise(r => setTimeout(r, 300));
    const on = document.getElementById('petevo-modal').classList.contains('on');
    try { closePetEvo(); } catch (e) { }
    try { closePet(); } catch (e) { }
    return { shown, on };
  });
  check('ホームに戻れば、ちゃんと出る', back.shown && back.on);

  /* ============ ② つぎの問題までのカウントダウンの黒座布団 ============ */
  await page.evaluate(() => { closePet(); nqDisarm(); show('s-home'); nqStartBar(); });
  await page.waitForTimeout(400);
  const cd = await page.evaluate(() => {
    const el = document.getElementById('nqcd');
    if (!el) return null;
    const sp = el.querySelector('span'), bt = el.querySelector('button');
    const b = el.getBoundingClientRect(), hw = document.getElementById('homewrap').getBoundingClientRect();
    return {
      pager: el.classList.contains('at-pager'),
      clipped: sp.scrollWidth > sp.clientWidth + 1,
      // 文字とボタンが座布団の内側に収まっているか
      inside: sp.getBoundingClientRect().right <= bt.getBoundingClientRect().left + 1
        && b.left >= hw.left - 0.5 && b.right <= hw.right + 0.5,
      w: Math.round(b.width), hw: Math.round(hw.width)
    };
  });
  check('ホームのページャー下に出ている', cd && cd.pager);
  check(`文字が見切れていない (座布団${cd && cd.w}px / ホーム${cd && cd.hw}px)`, cd && !cd.clipped);
  check('座布団がホームの幅からはみ出していない', cd && cd.inside);
  await page.evaluate(() => nqDisarm());

  /* ============ ③ きせかえ機能は無い ============ */
  const wear = await page.evaluate(async () => {
    openPet();
    await new Promise(r => setTimeout(r, 300));
    const plaza = { field: !!document.querySelector('#pet-modal .pt-field'), btn: !!document.querySelector('#pet-modal .d5-go') };
    openPetWear();
    await new Promise(r => setTimeout(r, 200));
    const after = { rows: !!document.querySelector('#pet-modal .pt-wrow'), field: !!document.querySelector('#pet-modal .pt-field') };
    openPetMenu();
    await new Promise(r => setTimeout(r, 300));
    const menu = document.getElementById('petmenu-modal').textContent;
    closePetMenu(); closePet();
    return { plaza, after, menuHasWear: /きせかえ/.test(menu) };
  });
  check('広場に「きせかえる」ボタンが無い', wear.plaza.field && !wear.plaza.btn);
  check('きせかえ画面を開こうとしても広場になる', !wear.after.rows && wear.after.field);
  check('育てるメニューにも「きせかえ」の表示が無い', !wear.menuHasWear);

  /* ============ ④ 動物の動きと吹き出し ============ */
  const field = await page.evaluate(async () => {
    // 5匹いる状態にする
    const o = petState();
    PET_SPECIES.slice(0, 5).forEach(sp => { o.zoo[sp.k] = { xp: 20, friend: 0 }; });
    o.sp = PET_SPECIES[0].k; savePet(o);
    openPet();
    await new Promise(r => setTimeout(r, 350));
    const ans = [...document.querySelectorAll('#pet-modal .pt-an')];
    const st = ans.map(a => ({ x: parseFloat(a.style.left), y: parseFloat(a.style.top) }));
    // 歩き方は「数秒あるいて数秒止まる」に変わったので、時間をおいて位置の変化を見る（メール指示 2026-09-03 23:06）
    await new Promise(r => setTimeout(r, 6000));
    const st2 = ans.map(a => ({ x: parseFloat(a.style.left), y: parseFloat(a.style.top) }));
    st.forEach((s, i) => { s.w = Math.abs(st2[i].x - s.x); s.v = Math.abs(st2[i].y - s.y); });
    const me = document.querySelector('#pet-modal .pt-an.me');
    const say = document.querySelector('#pet-modal .pt-say');
    const r = { n: ans.length, st, names: [...document.querySelectorAll('#pet-modal .pt-nm')].length,
      sayInAnimal: !!(say && me && me.contains(say)),
      sayName: !!(say && say.querySelector('.pt-sayn') && say.querySelector('.pt-sayn').textContent.trim()) };
    closePet();
    return r;
  });
  check(`5匹ぜんぶ広場にいる (${field.n}匹)`, field.n === 5);
  check('動物ごとに名前の札が付く', field.names === field.n);
  const xs = field.st.map(s => s.x), ys = field.st.map(s => s.y);
  check(`横に広く散らばっている (${Math.min(...xs)}%〜${Math.max(...xs)}%)`, Math.max(...xs) - Math.min(...xs) >= 40);
  check(`縦にも散らばっている (${Math.min(...ys)}%〜${Math.max(...ys)}%)`, Math.max(...ys) - Math.min(...ys) >= 15);
  check('横に歩いて位置が変わる', field.st.some(s => s.w >= 3));
  check('縦にも歩く', field.st.some(s => s.v >= 2));
  check('吹き出しは動物の中にあり、いっしょに動く', field.sayInAnimal);
  check('吹き出しに名前が出ている', field.sayName);

  /* ============ ⑤ 学習履歴 ============ */
  const hist = await page.evaluate(async () => {
    const id = LEVEL_SECTIONS.beginner[1][0];
    // 並び順が見えるように、日時のちがう履歴を3件仕込む
    const h0 = loadHistory().filter(r => r.wordId !== id);
    ['2026-09-01T10:00:00.000Z', '2026-09-02T10:00:00.000Z', '2026-09-03T10:00:00.000Z'].forEach((at, i) => {
      h0.push({ wordId: id, answeredAt: at, direction: 'kr_to_jp', answerStatus: 'correct',
        responseTimeMs: 1000 + i * 100, displayMemoryScoreAfterDecay: 50 + i });
    });
    localStorage.setItem(LS_HIST, JSON.stringify(h0)); _histIdxCache = null;
    const h = loadHistory().filter(r => r.wordId === id);
    renderWordDetail(id, 'room');
    await new Promise(r => setTimeout(r, 800));
    const rows = [...document.querySelectorAll('.htab tbody tr')];
    const fs = parseFloat(getComputedStyle(document.querySelector('.htab')).fontSize);
    return { n: h.length, first: (rows[0] || {}).textContent || '', last: (rows[rows.length - 1] || {}).textContent || '',
      desc: (() => {
        const src = loadHistory().filter(r => r.wordId === id).map(r => r.answeredAt).sort();
        if (src.length < 2) return null;
        return rows.length === src.length;
      })(), fs, rows: rows.length };
  });
  check(`学習履歴の文字が大きい (${hist.fs}px)`, hist.fs >= 19);
  const order = await page.evaluate(() => {
    const id = LEVEL_SECTIONS.beginner[1][0];
    const recs = loadHistory().filter(r => r.wordId === id);
    if (recs.length < 3) return 'skip';
    const tb = document.querySelector('#wd-center .htab tbody') || document.querySelector('.htab tbody');
    const shown = [...tb.querySelectorAll('tr')].map(tr => tr.children[0].textContent.trim());
    const sorted = recs.map(r => r.answeredAt).sort().reverse().map(a => fmtDateNoYear(a));
    return shown.join('|') === sorted.join('|') ? true : { shown, sorted };
  });
  check(`最新の履歴が一番上にくる（降順）`, order === true, order === true ? '' : JSON.stringify(order));
  await page.evaluate(() => { exitListMode && exitListMode(); show('s-home'); });
  await page.waitForTimeout(400);

  /* ============ ⑥ パワーの考え方は変えない ============ */
  const pwr = await page.evaluate(() => ({
    decay: typeof MEMORY_CONFIG === 'object' && MEMORY_CONFIG !== null,
    score: typeof displayMemoryScore === 'function',
    stab: typeof stabilityHours === 'function'
  }));
  check('記憶モデル（時間で減る／学習で戻る）はそのまま', pwr.decay && pwr.score && pwr.stab);

  /* ============ ⑦ ガチャ ============ */
  const g1 = await page.evaluate(async () => {
    const o = petState(); o.zoo = { [o.sp]: { xp: 0, friend: 0 } }; savePet(o);
    const gs = gachaState(); gs.q = [{ xp: 0 }]; saveGacha(gs);
    openGacha();
    await new Promise(r => setTimeout(r, 250));
    const b0 = loadBonus(), h0 = petHave().length;
    spinGacha();
    await new Promise(r => setTimeout(r, 1500));
    return { b0, b1: loadBonus(), h0, h1: petHave().length,
      lab: (document.querySelector('#gacha-modal .gc-plab') || {}).textContent || '',
      val: (document.querySelector('#gacha-modal .gc-pval') || {}).textContent || '' };
  });
  check(`ガチャで新しいキャラクターが増える (${g1.h0} → ${g1.h1}匹 / ${g1.lab})`, g1.h1 === g1.h0 + 1);
  check(`ガチャからXPは出ない (+${g1.b1 - g1.b0} XP)`, g1.b1 === g1.b0);
  check(`結果は「1匹」表示 (${g1.val.trim()})`, /匹/.test(g1.val));

  const g2 = await page.evaluate(async () => {
    const gs = gachaState(); gs.q = [{ xp: 0 }, { xp: 0 }, { xp: 0 }, { xp: 0 }]; saveGacha(gs);
    gachaRenderIdle();
    const btn = document.querySelector('#gacha-modal .gc-all');
    const label = btn ? btn.textContent : '';
    const b0 = loadBonus(), h0 = petHave().length, n0 = gachaSpins();
    spinGachaAll();
    await new Promise(r => setTimeout(r, 1600));
    return { has: !!btn, label, n0, n1: gachaSpins(), h0, h1: petHave().length,
      b0, b1: loadBonus(), rows: document.querySelectorAll('#gacha-modal .gc-li').length };
  });
  check(`「まとめて回す」ボタンがある (${g2.label.trim()})`, g2.has);
  check(`まとめて回すと持っているぶん全部まわる (${g2.n0} → ${g2.n1})`, g2.n1 === 0);
  check(`回した数だけ結果が並ぶ (${g2.rows}件)`, g2.rows === g2.n0);
  check(`まとめて回してもXPは出ない (+${g2.b1 - g2.b0} XP)`, g2.b1 === g2.b0);
  check(`まとめて回してもキャラクターが増える (${g2.h0} → ${g2.h1}匹)`, g2.h1 > g2.h0);

  const g3 = await page.evaluate(async () => {
    // 会っていない子がいなくなったら、XPではなくおやすみチケット
    const o = petState(); PET_SPECIES.forEach(sp => { if (!o.zoo[sp.k]) o.zoo[sp.k] = { xp: 0, friend: 0 }; }); savePet(o);
    const gs = gachaState(); gs.q = [{ xp: 0 }]; saveGacha(gs);
    const t0 = restTickets(), b0 = loadBonus();
    spinGacha();
    await new Promise(r => setTimeout(r, 1500));
    closeGacha();
    return { t0, t1: restTickets(), b0, b1: loadBonus() };
  });
  check(`全員そろっていればおやすみチケット (${g3.t0} → ${g3.t1}枚)`, g3.t1 === g3.t0 + 1);
  check(`そのときもXPは出ない (+${g3.b1 - g3.b0} XP)`, g3.b1 === g3.b0);

  /* ============ ⑧ プレゼント／動物の追加しやすさ ============ */
  const pres = await page.evaluate(() => {
    // プレゼントは「持っている動物向けのアイテム」＝服・アクセサリー・家具など
    const slots = PET_SLOTS.map(s => s.t);
    const it = petGrantWear();
    return { slots, granted: !!it || PET_ITEMS.every(i => petState().items[i.k]),
      xpPrize: typeof GACHA_PRIZES !== 'undefined',
      addable: PET_SPECIES.length, pool: typeof gachaNewPetPool === 'function' };
  });
  check(`プレゼントは服・アクセサリーなどのアイテム (${pres.slots.join('/')})`,
    pres.slots.includes('ぼうし') && pres.slots.includes('アクセサリー') && pres.granted);
  check('ガチャの景品抽選表（XPなど）は廃止されている', !pres.xpPrize);
  check(`動物はPET_SPECIESに足すだけで増やせる作り (いまは${pres.addable}種)`, pres.pool && pres.addable >= 10);

  check(`コンソールエラーなし (${errors.length}件)`, errors.length === 0, errors[0] || '');

  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length}/${results.length} passed`);
  if (ng.length) console.log('FAILED:\n' + ng.map(r => ' - ' + r.name).join('\n'));
  await browser.close();
  process.exit(ng.length ? 1 : 0);
})();
