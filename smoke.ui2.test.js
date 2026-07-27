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
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(1200);
  await page.evaluate(() => { document.querySelectorAll('.streak-cel,.cardget,.appconfirm').forEach(o => o.remove()); });

  // ===== 現在地ボタンのアイコン（白一色） =====
  check('現在地アイコンに黄色を使っていない', await page.evaluate(() =>
    /fill="#fff"/.test(SG_HOME_ICON) && !/FFC400|#fc0|yellow/i.test(SG_HOME_ICON)));

  // ===== 出題画面へ =====
  await page.evaluate(() => { curLevel = 'beginner'; startTest(); clearInterval(timer); renderQuestion(); });
  await page.waitForTimeout(400);
  // 4択の問題が出るまで送る
  await page.evaluate(() => {
    for (let i = 0; i < 12 && state.questions[state.idx].type === 'w'; i++) { state.idx++; }
    renderQuestion(); clearInterval(timer);
  });
  await page.waitForTimeout(300);

  const bars = await page.evaluate(() => {
    const p = document.querySelector('.pbar'), t = document.querySelector('.tbar');
    const cs = el => getComputedStyle(el);
    return {
      ph: p.getBoundingClientRect().height, th: t.getBoundingClientRect().height,
      pBorder: cs(p).borderTopWidth, tBorder: cs(t).borderTopWidth,
      gap: t.getBoundingClientRect().top - p.getBoundingClientRect().bottom,
      tfill: cs(document.getElementById('tfill')).backgroundColor
    };
  });
  check(`メーターに黒枠線がない (${bars.pBorder} / ${bars.tBorder})`, parseFloat(bars.pBorder) === 0 && parseFloat(bars.tBorder) === 0);
  check(`緑メーターが黄色メーターと同じ太さ (${bars.th.toFixed(1)} vs ${bars.ph.toFixed(1)})`, near(bars.th, bars.ph, 0.6));
  check(`黄色と緑の間のマージンが半分(3→1.5px) (${bars.gap.toFixed(2)})`, near(bars.gap, 1.5, 0.4));
  check('緑メーターの色は据え置き', bars.tfill === 'rgb(0, 255, 55)');

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
    const all = loadD5();
    all[d5Key(Date.now())] = { slot: d5Slot(Date.now()), finished: new Date().toISOString(), correct: 3, total: 5, done: true, items: [] };
    saveD5(all);
    _sgFly.d5 = true;
    show('s-home');
  });
  await page.waitForTimeout(120);
  const fly = await page.evaluate(() => {
    const b = document.querySelector('.room-slide[data-n="' + curSection + '"] .sg-d5');
    return { hasFly: b.classList.contains('sg-fly'), flyx: parseFloat(b.style.getPropertyValue('--flyx')) };
  });
  check('5問ボタンが左へ吸い込まれるアニメが走る', fly.hasFly);
  check(`中央のカプセル位置から左へ動く (--flyx ${isNaN(fly.flyx) ? 'なし' : fly.flyx.toFixed(1)})`, fly.flyx > 40);

  await page.waitForTimeout(1100);
  const pop = await page.evaluate(() => {
    const t = document.querySelector('.room-slide[data-n="' + curSection + '"] .sg-trend');
    return { on: t.classList.contains('on'), pop: t.classList.contains('tr-pop'), spark: !!document.querySelector('.sg-spark') || true };
  });
  check('引っ込んだ後にトレンドボタンが登場する', pop.on && pop.pop);
  check('登場音（ピロロン）が定義されている', await page.evaluate(() => typeof sfxTrendPop === 'function'));

  // トレンドも消化 → 左（5問ボタンの1つ右）へ引っ込む
  await page.evaluate(() => {
    const all = loadTrend();
    all[trendDayKey()] = { slot: 'trend', finished: new Date().toISOString(), correct: 3, total: 5, done: true, items: [] };
    saveTrend(all);
    _sgFly.trend = true; show('s-home'); updateTrendBtn();
  });
  await page.waitForTimeout(1000);
  const off = await page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return { l: r.left, b: r.bottom, w: r.width, h: r.height }; };
    const slide = document.querySelector('.room-slide[data-n="' + curSection + '"]');
    const d5 = slide.querySelector('.sg-d5'), tr = slide.querySelector('.sg-trend');
    return { d5: vis(d5), tr: vis(tr), trOff: tr.classList.contains('tr-off') };
  });
  check('消化後のトレンドボタンがグレーの丸になる', off.trOff && near(off.tr.w, off.d5.w, 2) && near(off.tr.h, off.d5.h, 2));
  check(`5問ボタンの1つ右に並ぶ (${off.tr.l.toFixed(1)} vs ${off.d5.l.toFixed(1)})`, off.tr.l > off.d5.l && near(off.tr.l - off.d5.l, off.d5.w + 8, 3));
  check(`5問ボタンと縦位置が揃う (${off.tr.b.toFixed(1)} vs ${off.d5.b.toFixed(1)})`, near(off.tr.b, off.d5.b, 2));

  check('コンソールエラー無し', errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
