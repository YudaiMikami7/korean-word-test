/* k-tango スペシャル問題（パズル穴うめ／緑ROOM）スモークテスト
 * 使い方: node smoke.puzzle.test.js
 * 検証: 緑ROOMの選出（青・赤と別ROOM）／スタートの白座布団・緑枠・緑文字／緑の帯／
 *       緑ROOMのテストが12問すべてパズル形式／穴が1つで2文字なら1文字目か2文字目／ピースが4つで同じ形／
 *       はめると穴が埋まる／正誤の色分け（正解=赤・誤答=青）／採点・記憶スコアに入ること／完走できること
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
  await page.goto('file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/'));
  await page.waitForTimeout(900);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(1400);

  // --- 選出 ---
  const sp = await page.evaluate(() => ({ r: specialRooms(), bn: Object.keys(LEVEL_SECTIONS.beginner).length }));
  console.log('  いまの緑ROOM: 初級ROOM' + sp.r.beginner.green + ' / 中級ROOM' + sp.r.middle.green);
  check('初級・中級とも緑ROOMが1つ選ばれる',
    sp.r.beginner.green >= 1 && sp.r.beginner.green <= sp.bn && sp.r.middle.green >= 1);
  check('緑は青・赤と別ROOM',
    sp.r.beginner.green !== sp.r.beginner.blue && sp.r.beginner.green !== sp.r.beginner.red &&
    sp.r.middle.green !== sp.r.middle.blue && sp.r.middle.green !== sp.r.middle.red);
  check('種別が引ける（緑）', await page.evaluate(r => specialKind('beginner', r.beginner.green) === 'green', sp.r));

  // --- ホーム: 緑ROOMのスタートと帯 ---
  const home = await (async n => {
    await page.evaluate(x => { curLevel = 'beginner'; curSection = x; saveLastRoom(); }, n);
    await page.reload();
    await page.waitForTimeout(1600);
    return page.evaluate(x => {
      const sl = document.querySelector(`.room-slide[data-n="${x}"]`);
      const here = sl && sl.querySelector('.sg-tile.now .sg-here');
      const bub = sl && sl.querySelector('.sg-tile.now .sg-spbub');
      const cs = here && getComputedStyle(here), bs = bub && getComputedStyle(bub);
      return { sp: !!(here && here.classList.contains('sp')), green: !!(here && here.classList.contains('sp-green')),
        bg: cs && cs.backgroundColor, col: cs && cs.color, sh: cs && cs.boxShadow,
        bub: bub && bub.textContent, bubImg: bs && bs.backgroundImage, clip: bs && bs.clipPath };
    }, n);
  })(sp.r.beginner.green);
  check(`緑ROOMのスタートが白座布団・緑文字 (${home.bg} / ${home.col})`,
    home.sp && home.green && home.bg === 'rgb(255, 255, 255)' && home.col === 'rgb(0, 161, 80)');
  check('緑ROOMは緑枠', /rgb\(0, 161, 80\)/.test(home.sh || ''));
  check(`帯の文言が「スペシャル問題発生中！」(${home.bub})`, /スペシャル問題発生中！/.test(home.bub || ''));
  check('帯は緑・リボン形', /4, 108, 60/.test(home.bubImg || '') && /polygon/.test(home.clip || ''));

  // --- 緑ROOMのテスト: 12問すべてパズル ---
  const q = await page.evaluate(n => {
    curLevel = 'beginner'; curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 1 };
    startTest(); clearInterval(timer); renderQuestion();
    const qs = state.questions;
    return {
      len: qs.length, pz: qs.filter(x => x.type === 'pz').length,
      shoot: qs.filter(x => x.type === 'sg' || x.type === 'sg4').length,
      holesOK: qs.every(x => x.type !== 'pz' || (x.pz.chars[x.pz.hole] === x.correct)),
      twoCharOK: qs.every(x => x.type !== 'pz' || x.pz.chars.length !== 2 || x.pz.hole === 0 || x.pz.hole === 1),
      choiceOK: qs.every(x => x.type !== 'pz' || (x.choices.length === 4 && new Set(x.choices).size === 4 && x.choices.includes(x.correct))),
      hangulOK: qs.every(x => x.type !== 'pz' || x.choices.every(c => /^[가-힣]$/.test(c)))
    };
  }, sp.r.beginner.green);
  check(`緑ROOMは12問 (${q.len}問)`, q.len === 12);
  check(`12問すべてパズル形式 (${q.pz}問)`, q.pz === 12);
  check(`シューティングは混ざらない (${q.shoot}問)`, q.shoot === 0);
  check('穴の位置の文字＝正解', q.holesOK);
  check('2文字語は1文字目か2文字目が穴', q.twoCharOK);
  check('ピースは4つ・重複なし・正解を含む', q.choiceOK);
  check('ピースはすべてハングル1文字', q.hangulOK);

  // --- 画面 ---
  const ui = await page.evaluate(() => {
    const st = document.getElementById('qstage');
    const q = state.questions[state.idx];
    const cells = [...st.querySelectorAll('.pz-cell')];
    const hole = st.querySelector('.pz-cell.hole');
    const pieces = [...st.querySelectorAll('.pz-p')];
    const shapes = new Set([...cells, ...pieces].map(e => getComputedStyle(e).clipPath));
    const r = st.getBoundingClientRect(), pr = pieces.map(p => p.getBoundingClientRect());
    return {
      ja: (st.querySelector('.pz-ja') || {}).textContent, wordJa: q.word.ja,
      cells: cells.length, hangul: [...q.word.ko].filter(c => /[가-힣]/.test(c)).length,
      holes: st.querySelectorAll('.pz-cell.hole').length,
      holeEmpty: hole ? hole.textContent.trim() === '' : false,
      pieces: pieces.length, shapes: shapes.size,
      sameSize: pr.every(b => Math.abs(b.width - pr[0].width) < 1 && Math.abs(b.height - pr[0].height) < 1),
      inView: pr.every(b => b.left >= r.left - 1 && b.right <= r.right + 1 && b.bottom <= window.innerHeight + 1),
      unknown: !!st.querySelector('.unknown')
    };
  });
  check(`日本語の意味が出題として出る (${ui.ja})`, ui.ja === ui.wordJa);
  check(`ハングルの文字数ぶんマスがある (${ui.cells}/${ui.hangul})`, ui.cells === ui.hangul);
  check(`穴は1つだけで空 (${ui.holes}個)`, ui.holes === 1 && ui.holeEmpty);
  check(`ピースが4つ並ぶ (${ui.pieces}個)`, ui.pieces === 4);
  check('穴とピースはすべて同じジグソー形', ui.shapes === 1 && ui.sameSize);
  check('ピースが画面内に収まる', ui.inView);
  check('「わからない」がある', ui.unknown);

  // --- 正解のピースをはめる ---
  const okRes = await page.evaluate(() => {
    const q = state.questions[state.idx];
    const btn = [...document.querySelectorAll('#qstage .pz-p')].find(b => b.dataset.v === q.correct);
    btn.click();
    const hole = document.querySelector('#qstage .pz-cell.hole');
    return { filled: !!(hole && hole.classList.contains('filled')), text: hole && hole.textContent.trim(),
      correct: q.correct, res: state.results.length && state.results[state.results.length - 1],
      cor: !!document.querySelector('#qstage .pz-p.correct') };
  });
  check(`はめると穴が埋まる (${okRes.text})`, okRes.filled && okRes.text === okRes.correct);
  check('正しいピースが赤で示される', okRes.cor);
  check('採点・履歴に入る（通常の四択と同じ）',
    okRes.res && okRes.res.isCorrect === true && okRes.res.answerType === 'choice' && okRes.res.score > 0);

  // --- 誤答のピース ---
  const ngRes = await page.evaluate(() => {
    document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer();
    const q = state.questions[state.idx];
    const btn = [...document.querySelectorAll('#qstage .pz-p')].find(b => b.dataset.v !== q.correct);
    const picked = btn.dataset.v; btn.click();
    const hole = document.querySelector('#qstage .pz-cell.hole');
    return { wrong: !!document.querySelector('#qstage .pz-p.wrong'), cor: !!document.querySelector('#qstage .pz-p.correct'),
      shown: hole && hole.textContent.trim(), correct: q.correct, picked,
      res: state.results[state.results.length - 1] };
  });
  check('誤答は青・正解は赤で示される', ngRes.wrong && ngRes.cor);
  check(`不正解でも穴には正解の文字が出る (${ngRes.shown})`, ngRes.shown === ngRes.correct);
  check('不正解が履歴に残る', ngRes.res && ngRes.res.isCorrect === false && ngRes.res.userAnswer === ngRes.picked);

  // --- 完走 ---
  const fin = await page.evaluate(() => {
    document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer();
    for (let i = state.idx; i < state.questions.length; i++) {
      const q = state.questions[state.idx];
      answered = false; clearInterval(timer); startTimer(); submit('correct', q.correct);
      document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer();
    }
    return { result: document.getElementById('s-result').classList.contains('on'), n: state.results.length };
  });
  await page.waitForTimeout(600);
  check(`12問こなすと結果画面へ (${fin.n}問ぶん)`, fin.result && fin.n === 12);

  // --- テストを終えると別ROOMへ入れ替わる ---
  const rolled = await page.evaluate(g => specialRooms().beginner.green !== g || Object.keys(LEVEL_SECTIONS.beginner).length <= 3,
    sp.r.beginner.green);
  check('テストを終えると緑ROOMが入れ替わる', rolled);

  check(`コンソールエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));

  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length}/${results.length} PASS`);
  process.exit(ng.length ? 1 : 0);
})();
