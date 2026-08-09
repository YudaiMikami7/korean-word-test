/* k-tango 2026-08-09 22:05 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0809.test.js
 * 指示:
 *  ①WORLDメニューのパラメータの数字とバーを少し小さく／完全なカプセルに
 *  ②ステップ数は右ぞろえ
 *  ③単語詳細ページの文字とカードを大きく／PWRメーターは廃止しグラフの中へ／
 *    グラフは白背景・いまのPWRは緑の文字・点ごとに数値
 *  ④学習履歴の表から得点をなくす／数字が右寄せならラベルも右寄せ／文字は大きく／白地に黒文字
 *  ⑤出題画面の進捗メーターとその上のマージンを最小に
 *  ⑥設定画面はボタンが縦に伸びすぎないように／スイッチはなし・シンプルでコンパクトに
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond, note) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${note ? ' (' + note + ')' : ''}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').split(path.sep).join('/');

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
    localStorage.setItem('kwt_firstdone_v1', '1');
    localStorage.setItem('kwt_roomhint_v1', '1');
    localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now()));
  });
  await page.reload();
  await page.waitForTimeout(1500);
  const clearFx = () => page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.lvup,.fcust,.pbub,.stepnote,.rest-ask,#resume-ask,.coach,.d5auto,.lapdone,.appconfirm').forEach(o => o.remove()));
  await clearFx();

  // ================= ① WORLDメニュー：完全なカプセル＋数字とバーは小さく =================
  const menu = await page.evaluate(() => {
    const bg = document.querySelector('.room-slide[data-n="1"] .rmenu-bg');
    const r = bg.getBoundingClientRect();
    const rad = parseFloat(getComputedStyle(bg).borderTopLeftRadius);
    const num = document.querySelector('.room-slide[data-n="1"] .hv-learned');
    const g = document.querySelector('.room-slide[data-n="1"] .rm-lap .gauge');
    const gs = getComputedStyle(g), gr = g.getBoundingClientRect();
    const clip = getComputedStyle(document.querySelector('.room-slide[data-n="1"] .rmenu-clip')).clipPath;
    return { rad, h: r.height, num: parseFloat(getComputedStyle(num).fontSize),
      gh: gr.height, grad: parseFloat(gs.borderTopLeftRadius), clip };
  });
  check(`WORLDメニューの座布団は完全なカプセル（角丸${menu.rad.toFixed(1)}px ≧ 高さの半分${(menu.h / 2).toFixed(1)}px）`, menu.rad >= menu.h / 2 - 0.6);
  check('クリップの角丸も座布団に合わせてある（58px）', /58px/.test(menu.clip));
  check(`パラメータの数字は前より小さい (${menu.num.toFixed(1)}px < 42.8px)`, menu.num < 42.8 && menu.num > 30);
  check(`パラメータのバーは前より細い (${menu.gh.toFixed(1)}px < 13.8px)`, menu.gh < 13.8 && menu.gh > 8);
  check('バーは完全なカプセル（角丸≧高さの半分）', menu.grad >= menu.gh / 2 - 0.6);

  // ================= ② ステップ数は右ぞろえ =================
  const lap = await page.evaluate(() => {
    const blk = document.querySelector('.room-slide[data-n="1"] .rm-lap');
    const v = blk.querySelector('.lp-v'), b = blk.querySelector('.lp-v b'), i = blk.querySelector('.lp-v i');
    const l = blk.querySelector('.lp-l');
    const rb = blk.getBoundingClientRect(), rv = v.getBoundingClientRect(), rl = l.getBoundingClientRect();
    return { just: getComputedStyle(v).justifyContent, align: getComputedStyle(b).textAlign,
      gapRight: rb.right - rv.right, labBottom: rl.bottom, numTop: rv.top,
      iRight: i.getBoundingClientRect().right, blkRight: rb.right };
  });
  check(`ステップ数は右ぞろえ（右端とのすき間 ${lap.gapRight.toFixed(1)}px）`, lap.just === 'flex-end' && lap.align === 'right' && lap.gapRight < 2);
  check('「N周目」とステップ数が重なっていない', lap.labBottom <= lap.numTop + 0.5);

  // ================= ③ 単語詳細：カード・文字が大きい／PWRはグラフの中 =================
  // 学習履歴の行が出るように、1語ぶんの履歴と記憶率を入れておく
  await page.evaluate(() => {
    const id = LEVEL_SECTIONS[curLevel][1][0], now = Date.now();
    const hist = [0, 1, 2, 3].map(j => ({
      wordId: id, answeredAt: new Date(now - 86400000 * (4 - j)).toISOString(),
      direction: j % 2 ? 'kr_to_jp' : 'jp_to_kr', answerType: j === 3 ? 'writing' : 'choice',
      answerStatus: j === 1 ? 'incorrect' : 'correct', isCorrect: j !== 1, score: 80 + j,
      responseTimeMs: 2400 + j * 300, memoryScoreAfter: 45 + j * 10, displayMemoryScoreAfterDecay: 40 + j * 9,
      stabilityHoursAfter: 40 + j * 12, wordDifficultyAfter: 1
    }));
    localStorage.setItem('kwt_history_v1', JSON.stringify(hist));
    const all = loadStats(), st = getStat(id);
    st.memoryScore = 70; st.hasSeen = true; st.hasEverCorrect = true; st.stabilityHours = 90;
    st.lastReviewedAt = new Date(now - 3600000).toISOString();
    all[id] = st; saveStats(all);
  });
  await page.reload();
  await page.waitForTimeout(1400); await clearFx();
  await page.evaluate(() => { renderWordDetail(LEVEL_SECTIONS[curLevel][1][0]); });
  await page.waitForTimeout(700); await clearFx();
  const wd = await page.evaluate(() => {
    const card = document.querySelector('.wd-bigcard').getBoundingClientRect();
    const ko = parseFloat(getComputedStyle(document.querySelector('.wd-ko2')).fontSize);
    const ja = parseFloat(getComputedStyle(document.querySelector('.wd-ja2')).fontSize);
    const dot = document.querySelector('.rp-pager .wd-dot').getBoundingClientRect();
    const dk = parseFloat(getComputedStyle(document.querySelector('.rp-pager .wd-dk')).fontSize);
    const gp = document.querySelector('.wd-graph');
    const svg = gp.querySelector('svg');
    const texts = [...svg.querySelectorAll('text')];
    const pwr = texts.find(t => /^PWR /.test(t.textContent));
    const dots = svg.querySelectorAll('circle').length;
    // 目盛り(5個)・横軸ラベル(点の数)・PWR表示 を除いたものが「点ごとの数値」
    const vals = texts.filter(t => t !== pwr && parseFloat(t.getAttribute('font-size')) < 11).length;
    return { cardH: card.height, cardW: card.width, ko, ja, dotW: dot.width, dk,
      bg: getComputedStyle(gp).backgroundColor, hasCrate: !!document.querySelector('.wd-crate'),
      pwrTxt: pwr ? pwr.textContent : '', pwrFill: pwr ? pwr.getAttribute('fill') : '',
      dots, vals, line: svg.querySelector('polyline').getAttribute('stroke') };
  });
  check(`単語カードが大きくなった (${wd.cardH.toFixed(0)}×${wd.cardW.toFixed(0)}px ＞ 248×220px)`, wd.cardH > 248 && wd.cardW > 220);
  check(`カードの文字が大きくなった (韓${wd.ko}px/日${wd.ja}px ＞ 36/22px)`, wd.ko > 36 && wd.ja > 22);
  check(`単語カードの並びも大きくなった (幅${wd.dotW.toFixed(0)}px/文字${wd.dk}px)`, wd.dotW > 82 && wd.dk > 16);
  check('PWRメーターの帯は無くなった', !wd.hasCrate);
  check('グラフの背景は白', wd.bg === 'rgb(255, 255, 255)');
  check(`いまのPWRはグラフの中に緑の文字（${wd.pwrTxt}）`, /^PWR \d+%$/.test(wd.pwrTxt) && wd.pwrFill === '#12B25A');
  check(`点ごとに数値が書いてある (点${wd.dots}個/数値${wd.vals}個)`, wd.dots > 0 && wd.vals === wd.dots);
  check('白地でも見えるように線は濃い緑', wd.line === '#12B25A');

  // ================= ④ 学習履歴の表 =================
  const tab = await page.evaluate(() => {
    const ths = [...document.querySelectorAll('.wd-center .htab thead th')];
    const tb = document.querySelector('.wd-center .htab');
    const num = document.querySelector('.wd-center .htab th.num');
    const td = document.querySelector('.wd-center .htab td.num');
    const rowTds = document.querySelectorAll('.wd-center .htab tbody tr:first-child td').length;
    return { heads: ths.map(t => t.textContent), thAlign: getComputedStyle(num).textAlign,
      tdAlign: td ? getComputedStyle(td).textAlign : '', bg: getComputedStyle(tb).backgroundColor,
      color: getComputedStyle(tb).color, base: parseFloat(getComputedStyle(tb).fontSize),
      tdSize: td ? parseFloat(getComputedStyle(td).fontSize) : 0, cols: ths.length, rowTds };
  });
  check(`学習履歴に得点の列が無い（列＝${tab.heads.join('/')}）`, !tab.heads.some(h => h.includes('得点')) && tab.cols === 5 && tab.rowTds === 5);
  check('数字が右寄せなら見出しも右寄せ', tab.thAlign === 'right' && tab.tdAlign === 'right');
  check(`表は白い背景に黒い文字 (${tab.bg} / ${tab.color})`, tab.bg === 'rgb(255, 255, 255)' && tab.color === 'rgb(26, 26, 26)');
  check(`表の文字が大きくなった (本文${tab.base}px/数字${tab.tdSize}px ＞ 15/16px)`, tab.base > 15 && tab.tdSize > 16);

  // ================= ⑤ 出題画面：進捗メーターとその上のマージンを最小に =================
  await page.evaluate(() => { closeWordDetail(); curLevel = 'beginner'; startTest(); clearInterval(timer); renderQuestion(); });
  await page.waitForTimeout(700);
  const q = await page.evaluate(() => {
    const bar = document.getElementById('pbar'), cs = getComputedStyle(bar);
    const qbar = document.querySelector('#s-quiz .qbar').getBoundingClientRect();
    const rb = bar.getBoundingClientRect(), tb = document.querySelector('#s-quiz .tbar').getBoundingClientRect();
    const slot = document.querySelector('#rn-rail .rn-slot').getBoundingClientRect();
    const ch = document.getElementById('rn-char').getBoundingClientRect();
    return { mt: parseFloat(cs.marginTop), h: rb.height, gap: rb.top - qbar.bottom,
      slotIn: slot.top >= rb.top - 0.6 && slot.bottom <= tb.top + 0.6,
      charIn: ch.bottom <= tb.top + 0.6 && ch.top >= qbar.bottom - 0.6, slotH: slot.height };
  });
  check(`進捗メーターの上のマージンは最小 (${q.mt}px ≦ 2px)`, q.mt <= 2);
  check(`進捗メーター自体も低くなった (${q.h.toFixed(0)}px < 30px)`, q.h < 30 && q.h > 14);
  check(`出題番号の行との間もほぼ詰まっている (${q.gap.toFixed(1)}px)`, q.gap <= 2.5);
  check(`札は帯からはみ出していない（札の高さ${q.slotH.toFixed(1)}px）`, q.slotIn);
  check('キャラも帯の中（タイムメータの上）に収まっている', q.charIn);

  // ================= ⑥ 設定画面：スイッチなし・コンパクト =================
  await page.evaluate(() => { quitTest ? quitTest() : show('s-home'); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { openSettings(); });
  await page.waitForTimeout(500);
  const set = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('#settings-modal .cc-tile')];
    const hs = tiles.map(t => t.getBoundingClientRect().height);
    const dir = getComputedStyle(tiles[0]).flexDirection;
    return { n: tiles.length, max: Math.max(...hs), min: Math.min(...hs), dir,
      sw: document.querySelectorAll('#settings-modal .cc-sw').length,
      card: document.querySelector('#settings-modal .set-card').getBoundingClientRect().height,
      lab: [...document.querySelectorAll('#settings-modal .cc-lab')].map(e => e.textContent) };
  });
  check(`設定のボタンは縦に伸びていない (${set.max.toFixed(0)}px ≦ 48px)`, set.max <= 48 && set.max === set.min);
  check('スイッチは無くなった', set.sw === 0);
  check(`マスは1行の横並び（${set.dir}）`, set.dir === 'row');
  check(`設定は8マスのまま (${set.lab.length}個)`, set.n === 8);
  check(`ポップアップ全体もコンパクトになった (${set.card.toFixed(0)}px < 770px)`, set.card < 770);

  check('JSエラーが出ていない', errors.length === 0, errors.join(' / '));

  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length}/${results.length} PASS`);
  if (ng.length) { console.log('FAILED:'); ng.forEach(r => console.log(' - ' + r.name)); process.exit(1); }
})();
