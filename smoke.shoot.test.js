/* k-tango スペシャル問題（シューティング）スモークテスト
 * 使い方: node smoke.shoot.test.js
 * 検証: 青ROOM(風船3×大砲3)・赤ROOM(風船1×大砲4)の選出／スタートの見た目とリボン帯／5〜11問目への差し込み／
 *       砲台の操作（スワイプで傾く／タップで発射）／5発で割れる・誤爆でふえる／割れたら玉が落ちる／
 *       大砲に画像を置かず日本語だけになっていること／採点に混ざらないこと／テストを終えるたびROOMが入れ替わること
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
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); });
  await page.reload();
  await page.waitForTimeout(1400);

  const sp = await page.evaluate(() => ({ r: specialRooms(),
    bn: Object.keys(LEVEL_SECTIONS.beginner).length, mn: Object.keys(LEVEL_SECTIONS.middle).length }));
  console.log('  いまのスペシャル: 初級 青ROOM' + sp.r.beginner.blue + ' / 赤ROOM' + sp.r.beginner.red
    + '　中級 青ROOM' + sp.r.middle.blue + ' / 赤ROOM' + sp.r.middle.red);
  check('初級は青1・赤1が選ばれる', sp.r.beginner.blue >= 1 && sp.r.beginner.blue <= sp.bn && sp.r.beginner.red >= 1 && sp.r.beginner.red <= sp.bn);
  check('中級は青1・赤1が選ばれる', sp.r.middle.blue >= 1 && sp.r.middle.blue <= sp.mn && sp.r.middle.red >= 1 && sp.r.middle.red <= sp.mn);
  check('青と赤は別ROOM', sp.r.beginner.blue !== sp.r.beginner.red && sp.r.middle.blue !== sp.r.middle.red);
  check('種別が引ける（青/赤）', await page.evaluate(r =>
    specialKind('beginner', r.beginner.blue) === 'blue' && specialKind('beginner', r.beginner.red) === 'red', sp.r));
  check('リロードしても保たれる（テストを終えるまで固定）', await page.evaluate(() => {
    const a = JSON.stringify(specialRooms()); _spCache = null; return a === JSON.stringify(specialRooms());
  }));

  // --- ホーム: スペシャルROOMのスタートボタンとリボン帯 ---
  // すごろく盤は「現在ROOM±1」しか実描画されないため、対象ROOMへ移動してから見る
  const readRoom = async n => {
    await page.evaluate(async x => { curLevel = 'beginner'; curSection = x; saveLastRoom(); }, n);
    await page.reload();
    await page.waitForTimeout(1600);
    return page.evaluate(x => {
      const pick = m => {
        const sl = document.querySelector(`.room-slide[data-n="${m}"]`);
        const here = sl && sl.querySelector('.sg-tile.now .sg-here');
        const bub = sl && sl.querySelector('.sg-tile.now .sg-spbub');
        const cs = here && getComputedStyle(here);
        const bs = bub && getComputedStyle(bub);
        return { sp: !!(here && here.classList.contains('sp')), red: !!(here && here.classList.contains('sp-red')),
          bg: cs && cs.backgroundColor, col: cs && cs.color, sh: cs && cs.boxShadow,
          bub: bub && bub.textContent, bubImg: bs && bs.backgroundImage, clip: bs && bs.clipPath,
          tail: bub ? getComputedStyle(bub, '::after').content : null };
      };
      // 隣接ROOM（実描画されている）にスペシャル表示が漏れていないか
      const others = [x - 1, x + 1].filter(m => m >= 1 && !isSpecialSection('beginner', m))
        .filter(m => !!document.querySelector(`.room-slide[data-n="${m}"] .sg-tile.now .sg-spbub`));
      return { me: pick(x), others };
    }, n);
  };
  const blueHome = await readRoom(sp.r.beginner.blue);
  const redHome = await readRoom(sp.r.beginner.red);
  const home = { blue: blueHome.me, red: redHome.me, others: blueHome.others.concat(redHome.others) };
  check(`青ROOMのスタートが白座布団・青文字 (${home.blue.bg} / ${home.blue.col})`,
    home.blue.sp && !home.blue.red && home.blue.bg === 'rgb(255, 255, 255)' && home.blue.col === 'rgb(24, 104, 255)');
  check('青ROOMは青枠', /rgb\(24, 104, 255\)/.test(home.blue.sh || ''));
  check(`赤ROOMのスタートが白座布団・赤文字 (${home.red.bg} / ${home.red.col})`,
    home.red.sp && home.red.red && home.red.bg === 'rgb(255, 255, 255)' && home.red.col === 'rgb(228, 0, 43)');
  check('赤ROOMは赤枠', /rgb\(228, 0, 43\)/.test(home.red.sh || ''));
  check(`帯の文言が「スペシャル問題発生中！」(${home.blue.bub})`, /スペシャル問題発生中！/.test(home.blue.bub || ''));
  check('帯は吹き出しをやめてリボン（しっぽ無し・切り抜き有り）', /polygon/.test(home.blue.clip || '') && (home.blue.tail === 'none' || !home.blue.tail));
  check('青ROOMの帯は青・赤ROOMの帯は赤', /11, 68, 196/.test(home.blue.bubImg || '') && /179, 0, 27/.test(home.red.bubImg || ''));
  check(`スペシャルでないROOMには出ない (${home.others.length}件)`, home.others.length === 0);

  // --- 青ROOM: テストの5〜11問目にシューティングが1問 ---
  const q = await page.evaluate(n => {
    curLevel = 'beginner'; curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 1 };
    startTest(); clearInterval(timer); renderQuestion();
    const idx = state.questions.findIndex(x => x.type === 'sg');
    return { len: state.questions.length, idx, cnt: state.questions.filter(x => x.type === 'sg' || x.type === 'sg4').length };
  }, sp.r.beginner.blue);
  check(`青ROOMは13問になる (${q.len}問)`, q.len === 13);
  check(`シューティングは1問だけ (${q.cnt}問)`, q.cnt === 1);
  check(`5問目〜11問目に入る (${q.idx + 1}問目)`, q.idx >= 4 && q.idx <= 10);

  // --- 通常ROOMには入らない ---
  const normal = await page.evaluate(r => {
    const other = [...Array(17).keys()].map(i => i + 1).find(n => n !== r.beginner.blue && n !== r.beginner.red);
    curSection = other; _boardTile = { level: 'beginner', sec: other, gidx: 1 };
    startTest(); clearInterval(timer); renderQuestion();
    return { len: state.questions.length, sg: state.questions.some(x => x.type === 'sg' || x.type === 'sg4') };
  }, sp.r);
  check(`通常ROOMは12問のまま (${normal.len}問)`, normal.len === 12 && !normal.sg);

  // --- 青ROOM: シューティング画面 ---
  const view = await page.evaluate(n => {
    curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 1 };
    startTest(); clearInterval(timer);
    state.idx = state.questions.findIndex(x => x.type === 'sg');
    renderQuestion();
    const bal = document.querySelector('.shg-bal'), bcs = bal && getComputedStyle(bal);
    return { bal: document.querySelectorAll('.shg-bal').length, cn: document.querySelectorAll('.shg-cn').length,
      img: document.querySelectorAll('.shg-cn img').length, circ: document.querySelectorAll('.shg-circ').length,
      base: document.querySelectorAll('.shg-base').length, scene: document.querySelectorAll('.shg-scene').length,
      ja: [...document.querySelectorAll('.shg-ja')].map(e => e.textContent),
      ko: [...document.querySelectorAll('.shg-ko')].map(e => e.textContent),
      need: [...document.querySelectorAll('.shg-need')].map(e => e.textContent),
      w: bal && bal.offsetWidth, h: bal && bal.offsetHeight, br: bcs && bcs.borderRadius, bg: bcs && bcs.backgroundImage,
      prog: document.getElementById('prog').textContent };
  }, sp.r.beginner.blue);
  await page.waitForTimeout(600);
  check(`風船3つ・大砲3つ (${view.bal}/${view.cn})`, view.bal === 3 && view.cn === 3);
  check(`大砲に画像は置かない (img ${view.img}件 / 丸 ${view.circ}件)`, view.img === 0 && view.circ === 0);
  check(`日本語が画像のあった位置に出る (${view.ja.join(',')})`, view.ja.length === 3 && view.ja.every(t => t));
  check(`砲身と本体がつながる台座がある (${view.base}件)`, view.base === 3);
  check('スペシャルな景色が敷かれる', view.scene === 1);
  check(`風船はまん丸 (${view.w}x${view.h} / ${view.br})`, view.w === view.h && /50%/.test(view.br || ''));
  check(`風船の色はシンプル（グラデーションなし）(${view.bg})`, view.bg === 'none');
  check(`風船は韓国語 (${view.ko.join(',')})`, view.ko.length === 3 && view.ko.every(t => /[가-힣]/.test(t)));
  check(`必要弾数は5 (${view.need.join(',')})`, view.need.every(t => t === '残り5'));
  check(`出題番号が13問表示 (${view.prog})`, /\/ 13/.test(view.prog));

  // --- 砲台の向きをスワイプで変える（右から左に払う＝右へ傾く） ---
  const dial = await page.evaluate(async () => {
    const el = document.querySelectorAll('.shg-cn')[1], r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + 20;
    const ev = (t, x) => el.dispatchEvent(new PointerEvent(t, { pointerId: 1, clientX: x, clientY: cy, bubbles: true }));
    const before = _shg.cannons[1].ang;
    ev('pointerdown', cx); ev('pointermove', cx - 60); ev('pointerup', cx - 60);
    const after = _shg.cannons[1].ang;
    return { before, after, tf: document.querySelectorAll('.shg-piv')[1].style.transform, bullets: _shg.bullets.length };
  });
  check(`右から左へ払うと右に傾く (${dial.before}° → ${dial.after.toFixed(1)}°)`, dial.after > 20 && /rotate/.test(dial.tf));
  check('スワイプでは発射しない', dial.bullets === 0);

  // --- タップで発射 ---
  const tap = await page.evaluate(async () => {
    const el = document.querySelectorAll('.shg-cn')[0], r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + 20;
    const ev = t => el.dispatchEvent(new PointerEvent(t, { pointerId: 2, clientX: x, clientY: y, bubbles: true }));
    _shg.cannons[0].ang = 0; _shg.cannons[0].last = 0;
    ev('pointerdown'); ev('pointerup');
    return _shg.bullets.length;
  });
  check('タップで1発出る', tap === 1);

  // --- 正しい大砲で必要数当てると割れる／まちがえると必要数がふえる／割れたら玉が落ちる ---
  const play = await page.evaluate(async () => {
    const aim = (ci, bi) => { const c = _shg.cannons[ci], b = _shg.balloons[bi];
      c.ang = Math.atan2(b.x - c.x, c.y - b.y) * 180 / Math.PI; c.last = 0; shgFire(c); };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40 && _shg.bullets.length; i++) await wait(120); // 前の検証で撃った弾を片づける
    const base = _shg.balloons[0].remain;
    // 風船0に、わざと違う大砲から2発
    const wrongCi = _shg.cannons.find(c => c.i !== _shg.balloons[0].wi).i;
    aim(wrongCi, 0); await wait(400); aim(wrongCi, 0);
    for (let i = 0; i < 40 && _shg.balloons[0].remain < base + 2; i++) await wait(100); // 弾が着くまで待つ
    const afterWrong = _shg.balloons[0].remain;
    // 正しい大砲から、ふえたぶんだけ当てる
    const okCi = _shg.balloons[0].wi;
    for (let i = 0; i < afterWrong; i++) { aim(okCi, 0); await wait(330); }
    for (let i = 0; i < 40 && _shg.balloons[0].alive; i++) await wait(100); // 弾が着くまで待つ
    const ball = document.querySelector('.shg-ball');
    return { base, afterWrong, alive: _shg.balloons[0].alive, done: _shg.cannons.find(c => c.i === okCi).done,
      cls: _shg.cannons.find(c => c.i === okCi).el.className,
      ball: !!ball, ballTop: ball && parseFloat(ball.style.top), by: _shg.balloons[0].y, // 割れた時点で風船のyは止まる
      fall: ball && ball.style.getPropertyValue('--fall') };
  });
  check(`まちがえると必要数がふえる (${play.base}→${play.afterWrong})`, play.afterWrong === play.base + 2);
  check('正しい弾を必要数当てると割れる', !play.alive);
  check('割れた大砲は使用済みになる', play.done && /done/.test(play.cls));
  check(`割れた位置から玉が出る (top=${play.ballTop} / 風船=${Math.round(play.by)})`,
    play.ball && Math.abs(play.ballTop - play.by) < 2);
  check(`玉は下へ落ちる (--fall=${play.fall})`, parseFloat(play.fall) > 100);

  // --- 3つ割ると次の問題へ ---
  const fin = await page.evaluate(async () => {
    const idx = state.idx, res0 = state.results.length;
    const aim = (ci, bi) => { const c = _shg.cannons[ci], b = _shg.balloons[bi];
      c.ang = Math.atan2(b.x - c.x, c.y - b.y) * 180 / Math.PI; c.last = 0; shgFire(c); };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (const bi of [1, 2]) {
      for (let i = 0; i < 5; i++) { aim(_shg.balloons[bi].wi, bi); await wait(330); }
      for (let i = 0; i < 40 && _shg && _shg.balloons[bi].alive; i++) await wait(100); // 弾が着くまで待つ
    }
    await wait(2200); // CLEAR!演出→次の問題へ
    return { idx, now: state.idx, quiz: document.getElementById('s-quiz').classList.contains('on'),
      shg: !!document.getElementById('shg'), running: !!_shg, res0, results: state.results.length };
  });
  check(`3つ割ると次の問題へ進む (${fin.idx + 1}問目 → ${fin.now + 1}問目)`, fin.now === fin.idx + 1 && fin.quiz && !fin.shg);
  check('ゲームのループが止まる', !fin.running);
  check(`採点には入らない (回答${fin.res0}件→${fin.results}件)`, fin.results === fin.res0);

  // --- 赤ROOM: 風船1つ × 大砲4つ（4択） ---
  const four = await page.evaluate(n => {
    curLevel = 'beginner'; curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 1 };
    startTest(); clearInterval(timer);
    const idx = state.questions.findIndex(x => x.type === 'sg4');
    if (idx < 0) return { idx };
    state.idx = idx; renderQuestion();
    const q = state.questions[idx];
    const bal = document.querySelector('.shg-bal');
    return { idx, len: state.questions.length,
      bal: document.querySelectorAll('.shg-bal').length, cn: document.querySelectorAll('.shg-cn').length,
      img: document.querySelectorAll('.shg-cn img').length,
      ko: bal && bal.querySelector('.shg-ko').textContent, wordKo: q.word.ko,
      ja: [...document.querySelectorAll('.shg-ja')].map(e => e.textContent),
      correct: q.correct, wi: _shg.balloons[0].wi,
      angs: _shg.cannons.map(c => Math.round(c.ang)), four: document.querySelector('.shg').classList.contains('four') };
  }, sp.r.beginner.red);
  check(`赤ROOMも13問・5〜11問目 (${four.idx + 1}問目 / ${four.len}問)`, four.len === 13 && four.idx >= 4 && four.idx <= 10);
  check(`風船1つ・大砲4つ (${four.bal}/${four.cn})`, four.bal === 1 && four.cn === 4);
  check(`出題は上の風船に韓国語 (${four.ko})`, four.ko === four.wordKo && /[가-힣]/.test(four.ko || ''));
  check(`選択肢は下の大砲に日本語4つ (${four.ja.join(' / ')})`, four.ja.length === 4 && four.ja.every(t => t));
  check('大砲に画像は置かない', four.img === 0);
  check(`正解の大砲が的に対応 (index ${four.wi})`, four.wi >= 0 && four.wi <= 3);
  // 左半分の砲は右（＋角度）へ、右半分の砲は左（−角度）へ向いて中央の風船を狙う
  check(`4本とも最初から的を向く (${four.angs.join('°,')}°)`, four.four && four.angs.every((a, i) => (i < 2 ? a > 0 : a < 0)));

  // --- 赤ROOM: 正解の大砲で5発当てると割れて次へ ---
  const fourPlay = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const b = _shg.balloons[0], ok = _shg.cannons.find(c => c.i === b.wi);
    const ng = _shg.cannons.find(c => c.i !== b.wi);
    const aim = c => { c.ang = Math.atan2(b.x - c.x, c.y - b.y) * 180 / Math.PI; c.last = 0; shgFire(c); };
    const base = b.remain;
    aim(ng); for (let i = 0; i < 40 && b.remain === base; i++) await wait(100);
    const afterWrong = b.remain;
    const idx = state.idx, res0 = state.results.length;
    for (let i = 0; i < afterWrong; i++) { aim(ok); await wait(330); }
    for (let i = 0; i < 40 && _shg && _shg.balloons[0].alive; i++) await wait(100);
    const ball = !!document.querySelector('.shg-ball');
    await wait(2200);
    return { base, afterWrong, ball, idx, now: state.idx, res0, results: state.results.length,
      shg: !!document.getElementById('shg') };
  });
  check(`まちがった大砲は必要数がふえる (${fourPlay.base}→${fourPlay.afterWrong})`, fourPlay.afterWrong === fourPlay.base + 1);
  check('割れた位置から玉が落ちる', fourPlay.ball);
  check(`割ると次の問題へ (${fourPlay.idx + 1}問目 → ${fourPlay.now + 1}問目)`, fourPlay.now === fourPlay.idx + 1 && !fourPlay.shg);
  check(`採点には入らない (回答${fourPlay.res0}件→${fourPlay.results}件)`, fourPlay.results === fourPlay.res0);

  // --- 完走できる（1問目からスペシャル入りで通す）＋終わるたびROOMが入れ替わる ---
  const done = await page.evaluate(async n => {
    curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 1 };
    const before = JSON.stringify(specialRooms());
    startTest(); clearInterval(timer); renderQuestion();
    for (let i = 0; i < 20 && !document.getElementById('s-result').classList.contains('on'); i++) {
      const q = state.questions[state.idx];
      if (q.type === 'sg' || q.type === 'sg4') { shootAdvance(); continue; }
      answered = false; clearInterval(timer); startTimer();
      submit('correct', q.type === 'w' ? q.word.ko : q.correct);
      document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer();
    }
    await new Promise(r => setTimeout(r, 700));
    return { res: document.getElementById('s-result').classList.contains('on'),
      cards: document.querySelectorAll('#s-result .rc-card').length,
      counts: [...document.querySelectorAll('#s-result .res-cnt')].map(e => e.textContent.trim()).join(' '),
      before, after: JSON.stringify(specialRooms()),
      wasSpecial: JSON.parse(before).beginner, nowSpecial: specialRooms().beginner };
  }, sp.r.beginner.blue);
  check('スペシャル入りでも完走→結果画面', done.res);
  check(`結果は12語のまま (${done.cards}枚 / ${done.counts})`, done.cards === 12);
  check(`テストを終えるとスペシャルROOMが入れ替わる (${done.before} → ${done.after})`, done.before !== done.after);
  check(`直前と同じROOMは選ばれない (青${done.wasSpecial.blue}→${done.nowSpecial.blue} / 赤${done.wasSpecial.red}→${done.nowSpecial.red})`,
    done.nowSpecial.blue !== done.wasSpecial.blue && done.nowSpecial.blue !== done.wasSpecial.red
    && done.nowSpecial.red !== done.wasSpecial.blue && done.nowSpecial.red !== done.wasSpecial.red
    && done.nowSpecial.blue !== done.nowSpecial.red);

  check('コンソールエラー無し', errors.length === 0);
  if (errors.length) console.log('  errors:', errors);
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
