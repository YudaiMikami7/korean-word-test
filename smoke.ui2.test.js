/* k-tango 出題UI＆ホームボタン演出のスモークテスト
 * 使い方: node smoke.ui2.test.js
 * 検証: 上部メーター（枠線なし・同じ太さ・マージン半分）／選択肢の半透明フェード（残り1/4・1/8）／
 *       選択肢の外から撫で始めても選べる／現在地アイコンが白一色／
 *       5問→トレンドの引っ込み演出とトレンドボタンの位置
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
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); });
  await page.reload();
  await page.waitForTimeout(1200);
  await page.evaluate(() => { document.querySelectorAll('.streak-cel,.cardget,.appconfirm').forEach(o => o.remove()); });

  // ===== 現在地ボタンのアイコン（白一色） =====
  check('現在地アイコンに黄色を使っていない', await page.evaluate(() =>
    /fill="#fff"/.test(SG_HOME_ICON) && !/FFC400|#fc0|yellow/i.test(SG_HOME_ICON)));

  // ===== 出題画面へ =====
  // スペシャル問題発生中のROOM（緑＝12問すべてパズル）を引くと4択が1問も無いので、通常ROOMを選んでから始める
  await page.evaluate(() => {
    curLevel = 'beginner';
    const secs = Object.keys(LEVEL_SECTIONS.beginner).map(Number).filter(n => n > 0);
    curSection = secs.find(n => !isSpecialSection('beginner', n)) || curSection;
    startTest(); clearInterval(timer); renderQuestion();
  });
  await page.waitForTimeout(400);
  // 4択の問題が出るまで送る
  await page.evaluate(() => {
    for (let i = 0; i < 12 && !['kj', 'jk'].includes(state.questions[state.idx].type); i++) { state.idx++; } // 書き取り・スペシャル問題は飛ばす
    renderQuestion(); clearInterval(timer);
  });
  await page.waitForTimeout(300);

  const bars = await page.evaluate(() => {
    const p = document.querySelector('.pbar'), t = document.querySelector('.tbar');
    const cs = el => getComputedStyle(el);
    return {
      ph: p.getBoundingClientRect().height, th: t.getBoundingClientRect().height,
      pBorder: cs(p).borderTopWidth, tBorder: cs(t).borderTopWidth, tBorderColor: cs(t).borderTopColor,
      gap: t.getBoundingClientRect().top - p.getBoundingClientRect().bottom,
      tfill: cs(document.getElementById('tfill')).backgroundColor,
      pfill: !!document.getElementById('pfill'),
      char: !!document.getElementById('rn-char'), ground: !!document.querySelector('.rn-ground'),
      charBottom: document.getElementById('rn-char').getBoundingClientRect().bottom,
      tbarTop: t.getBoundingClientRect().top
    };
  });
  check(`帯には枠線がなく、タイムメータの枠線は白 (${bars.pBorder} / ${bars.tBorder} ${bars.tBorderColor})`,
    parseFloat(bars.pBorder) === 0 && parseFloat(bars.tBorder) >= 1 && bars.tBorderColor === 'rgb(255, 255, 255)'); // メール指示 2026-08-02
  check('山吹色の進捗メーターは廃止されている', !bars.pfill);
  // 札の列と動物は同じ1列にしたので帯は1段ぶん（メール指示 2026-08-02）
  check(`代わりにキャラが歩く帯がある (高さ${bars.ph.toFixed(1)}px)`, bars.char && bars.ph >= 28);
  check('白い地面の線は廃止（メール指示 2026-08-02）', !bars.ground);
  // 地面の線の代わりに、キャラはタイムメータの白枠の上に立つ＝帯とメータの間は空けない
  check(`帯と緑メーターの間は空けない (${bars.gap.toFixed(2)})`, near(bars.gap, 0, 0.4));
  check(`キャラの足がタイムメータの上端に乗る (足${Math.round(bars.charBottom)} / メータ${Math.round(bars.tbarTop)})`,
    Math.abs(bars.charBottom - bars.tbarTop) <= 2);
  check('緑メーターの色は据え置き', bars.tfill === 'rgb(0, 255, 55)');

  // 進む先には黄色い札が等間隔に並び、1問ごとに1枚ぶん流れる（正解＝獲得／不正解＝はじけて消える）
  const runner = await page.evaluate(async () => {
    const bar = document.getElementById('pbar'), ch = document.getElementById('rn-char'), rail = document.getElementById('rn-rail');
    const rp = () => parseFloat(bar.style.getPropertyValue('--rp') || 0);
    // 地面の線は廃止したので、景色の流れではなく --rp（歩数）そのもので進みを見る（メール指示 2026-08-02）
    // カードは動かず、動物のほうが右へ進む（メール指示 2026-08-01 19:49）。動物のleftで見る
    const txOf = () => parseFloat(ch.style.left || 0);
    const slotsAt = () => [...rail.querySelectorAll('.rn-slot')].map(s => parseFloat(s.style.left));
    const wait = ms => new Promise(r => setTimeout(r, ms));
    runnerBuild(12);
    const slots = [...rail.querySelectorAll('.rn-slot')];
    const lefts = slots.map(s => parseFloat(s.style.left));
    const gaps = lefts.slice(1).map((v, i) => v - lefts[i]);
    const cs = getComputedStyle(slots[0]);
    const barR = bar.getBoundingClientRect();
    const visible = slots.filter(s => { const r = s.getBoundingClientRect(); return r.right > barR.left && r.left < barR.right; }).length;
    const noKo = slots.every(s => s.textContent === '');
    const start = rp(), tx0 = txOf(), slots0 = slotsAt();
    runnerStep(true); const afterOk = rp(), cls1 = ch.className, got = slots[0].classList.contains('got'), tx1 = txOf();
    // 札は1段上からキャラのところへ斜めに飛ぶ（メール指示 2026-08-02）
    const flyX = slots[0].style.getPropertyValue('--fly'), flyY = slots[0].style.getPropertyValue('--flyY');
    await wait(1300);
    runnerStep(false); const cls2 = ch.className, gotNg = slots[1].classList.contains('got'), pop = slots[1].classList.contains('pop'), tx2 = txOf();
    const slots2 = slotsAt();
    return { n: slots.length, gaps, w: parseFloat(cs.width), h: parseFloat(cs.height), bg: cs.backgroundColor,
             border: cs.borderTopWidth + ' ' + cs.borderTopColor, shadow: cs.boxShadow,
             visible, noKo, start, afterOk, cls1, cls2, flyX, flyY, tx0, tx1, tx2, got, gotNg, pop, slots0, slots2,
             img: ch.querySelector('img') ? ch.querySelector('img').getAttribute('src') : null, txt: ch.textContent.trim() };
  });
  check(`カードが12枚ぶん並ぶ (${runner.n})`, runner.n === 12);
  // 帯の幅に合わせて等間隔（端数のぶん1pxだけ前後する）
  check(`等間隔に並んでいる (${runner.gaps.join('/')})`, runner.gaps.every(g => Math.abs(g - runner.gaps[0]) <= 1) && runner.gaps[0] > 0);
  check(`黄色い縦長の札 (${runner.w}x${runner.h} ${runner.bg})`, runner.h > runner.w && /^rgb\(2[0-5]\d, 19[0-9]|^rgb\(245, 197, 24\)/.test(runner.bg));
  check('札に韓国語は書かれていない（答えが見えない）', runner.noKo);
  // 12問なら最初から12枚ぜんぶ見えている（メール指示 2026-08-01 19:49）
  check(`12枚ぜんぶが見えている (${runner.visible})`, runner.visible === 12);
  // 札とキャラは同じ列なので、札は横に飛ぶ（メール指示 2026-08-02）
  check(`札は同じ列のキャラへ横に飛ぶ (x=${runner.flyX} y=${runner.flyY})`,
    /px$/.test(runner.flyX) && /px$/.test(runner.flyY) && Math.abs(parseFloat(runner.flyX)) > 4 && Math.abs(parseFloat(runner.flyY)) <= 4);
  check(`1問ごとに動物が1コマぶん右へ進む (${runner.tx0} → ${runner.tx1} → ${runner.tx2})`,
        runner.tx1 > runner.tx0 && runner.tx2 > runner.tx1 && Math.abs((runner.tx1 - runner.tx0) - (runner.tx2 - runner.tx1)) <= 1);
  check('カードの位置は動かない', runner.slots0.length === runner.slots2.length &&
        runner.slots0.every((v, i) => v === runner.slots2[i]));
  check(`正解でキャラが歩く (${runner.start} → ${runner.afterOk})`, runner.afterOk === runner.start + 1 && /step/.test(runner.cls1));
  check('不正解ではつまずく', /trip/.test(runner.cls2));
  check(`未診断のうちはダミーの動物が歩く (${runner.txt})`, !runner.img && runner.txt.length > 0);
  check('正解でカードを獲得する演出', runner.got);
  check('不正解でもカードを獲得する（メール指示 2026-08-01）', runner.gotNg && !runner.pop);
  check(`札は白枠つき (${runner.border})`, /^2px rgb\(255, 255, 255\)/.test(runner.border));
  check(`札に影は付けない (${runner.shadow})`, runner.shadow === 'none'); // メール指示 2026-08-01 19:49

  // ===== 選択肢の間引き（残り1/4で1つ・1/8で2つ・半透明で残る） =====
  const elim = await page.evaluate(async () => {
    const out = {};
    const wrap = document.querySelector('#qstage .choices');
    const limit = curLimit();
    const at = frac => { // 残り時間を frac にして tick を打つ
      qStart = performance.now() - (limit * (1 - frac)) * 1000;
      _tick();
      return wrap.querySelectorAll('.choice.elim').length;
    };
    answered = false;
    out.half = at(0.45);   // 半分過ぎ＝まだ消えない
    out.quarter = at(0.24); // 残り1/4＝1つ
    out.eighth = at(0.12);  // 残り1/8＝2つ
    await new Promise(r => setTimeout(r, 500)); // フェードの完了を待ってから濃さを測る
    const e = wrap.querySelector('.choice.elim');
    const cs = getComputedStyle(e);
    out.opacity = parseFloat(cs.opacity);
    out.pe = cs.pointerEvents;
    out.correctKept = ![...wrap.querySelectorAll('.choice.elim')].some(b => b.dataset.v === state.questions[state.idx].correct);
    clearInterval(timer);
    return out;
  });
  check(`残り約半分ではまだ消えない (${elim.half})`, elim.half === 0);
  check(`残り1/4で1つ選べなくなる (${elim.quarter})`, elim.quarter === 1);
  check(`残り1/8でもう1つ選べなくなる (${elim.eighth})`, elim.eighth === 2);
  check(`完全には消さず半透明で残る (opacity ${elim.opacity})`, elim.opacity > 0.05 && elim.opacity < 0.6);
  check('半透明の選択肢はタップできない', elim.pe === 'none');
  check('正解は間引かれない', elim.correctKept);

  // ===== 選択肢の外から撫で始めても選べる =====
  await page.evaluate(() => { state.idx = 0; while (state.questions[state.idx].type === 'w') state.idx++; answered = false; renderQuestion(); clearInterval(timer); });
  await page.waitForTimeout(300);
  const drag = await page.evaluate(async () => {
    const wrap = document.querySelector('#qstage .choices');
    const btn = wrap.querySelectorAll('.choice')[1];
    const r = btn.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    const startY = Math.max(4, wr.top - 90); // 選択肢の外（問題文のあたり）から開始
    const ev = (type, x, y) => document.elementFromPoint(x, y).dispatchEvent(
      new PointerEvent(type, { pointerId: 1, bubbles: true, cancelable: true, clientX: x, clientY: y, isPrimary: true }));
    ev('pointerdown', wr.left + wr.width / 2, startY);
    ev('pointermove', r.left + r.width / 2, r.top + r.height / 2);
    await new Promise(r2 => setTimeout(r2, 50));
    const lit = btn.classList.contains('cand');
    ev('pointerup', r.left + r.width / 2, r.top + r.height / 2);
    await new Promise(r2 => setTimeout(r2, 120));
    return { lit, picked: answered, val: btn.dataset.v };
  });
  check('選択肢の外から撫で始めても指の下が黄色く光る', drag.lit);
  check('離した位置の選択肢で確定する', drag.picked);

  // ===== ホームのボタン演出 =====
  await page.evaluate(() => { quitTest(); show('s-home'); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { document.querySelectorAll('.streak-cel,.cardget,.appconfirm,.overlay').forEach(o => o.remove()); });

  // 5問を消化した直後としてホームへ戻る
  await page.evaluate(() => {
    // 登場演出(tr-pop)は終わると外れる（付けっぱなしだと単語帳へ移っても消えなくなるため）。
    // 一瞬しか付かないので、付いたかどうかは監視して記録する
    window.__trPop = false;
    const t = document.querySelector('.sg-mission'); // 中央カプセルは今週のミッション（メール指示 2026-08-01）
    new MutationObserver(() => { if (t.classList.contains('tr-pop')) window.__trPop = true; })
      .observe(t, { attributes: true, attributeFilter: ['class'] });
    const all = loadD5();
    all[d5Key(Date.now())] = { slot: d5Slot(Date.now()), finished: new Date().toISOString(), correct: 3, total: 5, done: true, items: [] };
    saveD5(all);
    _sgFly.d5 = true;
    show('s-home');
  });
  await page.waitForTimeout(120);
  const fly = await page.evaluate(() => {
    const b = document.querySelector('.sg-d5'); // home-wrap直下のフロート1組
    // 5問はミッションと同じ吹き出しに入ったので、消化後はその場でしぼんで消える（メール指示 2026-08-08）
    return { fade: b.classList.contains('sg-fade'), anim: getComputedStyle(b).animationName };
  });
  check('5問カプセルがその場でしぼんで消えるアニメが走る', fly.fade);
  check(`しぼむアニメが当たっている (${fly.anim})`, fly.anim === 'sgGone');

  await page.waitForTimeout(1100);
  const pop = await page.evaluate(() => {
    const t = document.querySelector('.sg-mission');
    return { on: t.classList.contains('on'), pop: window.__trPop, left: t.classList.contains('tr-pop'),
             vis: getComputedStyle(t).visibility, spark: !!document.querySelector('.sg-spark') || true };
  });
  check('引っ込んだ後に今週のミッションが登場する', pop.on && pop.pop && pop.vis === 'visible');
  check('登場演出が終わったらクラスは外れる（単語帳で消えなくなるのを防ぐ）', !pop.left);
  check('登場音（ピロロン）が定義されている', await page.evaluate(() => typeof sfxPopIn === 'function'));

  // 5問を消化したあとは、中央カプセルは今週のミッション。押すと統合ポップアップが開く（メール指示 2026-08-08）
  await page.evaluate(() => { show('s-home'); updateD5Btn(); });
  await page.waitForTimeout(1000);
  const off = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return { l: r.left, b: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2 }; };
    const pet = document.querySelector('.sg-pet'), ms = document.querySelector('.sg-mission');
    return { pet: vis(pet), ms: vis(ms), on: ms.classList.contains('on'), slideCx: innerWidth / 2,
             d5w: document.querySelector('.sg-d5').getBoundingClientRect().width };
  });
  check('消化後は今週のミッションが中央カプセル', off.on && near(off.ms.cx, off.slideCx, 40) && off.d5w === 0);
  check(`育成ゲームの丸と縦位置が揃う (${off.ms.b.toFixed(1)} vs ${off.pet.b.toFixed(1)})`, near(off.ms.b, off.pet.b, 2));
  const uni = await page.evaluate(async () => {
    document.querySelector('.sg-mission').click();
    await new Promise(r => setTimeout(r, 400));
    const c = document.querySelector('#d5-modal .u5-card');
    const k = c ? [...c.querySelectorAll('.u5-kick')].map(e => e.textContent).join('/') : '';
    document.getElementById('d5-modal').classList.remove('on');
    return k;
  });
  check(`統合ポップアップ（ミッション＋今日の5問）が開く (${uni})`, uni === 'MISSION/TODAY');

  check('コンソールエラー無し', errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
