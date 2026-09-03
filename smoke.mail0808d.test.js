/* k-tango 2026-08-08 23:50 / 23:52 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0808d.test.js
 * 指示（23:50）:
 *  ①出題画面で降るカードは「手に入れたカードと同じ枚数」、レア度で色を変える
 *  ②出題画面の戻るボタンは角丸／「‹」は太く
 *  ③進捗の札は白枠を半分の太さ・大きさを75%へ
 *  ④四択の縦幅は文字の大きさで変わらない
 *  ⑤書き取りのヒントに黒光彩／制限時間が半分を切っても入力が無ければ1文字目のキーを順に黄色く
 *  ⑥結果画面のカードの正誤記号は左上（少し内側）に白い角丸座布団つき
 *  ⑦育成画面をよりシンプルに（主ボタンの色を統一・絵文字は画像）
 *  ⑧ホームのカウントダウン中にメニュー等を開いたら数えるのをやめる
 *  ⑨設定画面のUI見直し
 *  ⑩今日の5問の結果画面も通常結果画面のベース＋XP表示（先に判定アニメ・判定は倍速）
 * 指示（23:52）:
 *  ⑪ガチャなどでおやすみカードが出る確率を1/3に
 *  ⑫ごはんは廃止（メール指示 2026-08-29 で「きせかえ」に置きかえ）
 *  ⑬プレゼントのXPは廃止し、きせかえが当たる
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond, note) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${note ? ' (' + note + ')' : ''}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').split(path.sep).join('/');
const near = (a, b, tol) => Math.abs(a - b) <= tol;

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

  // ================= ⑪ おやすみカードの確率は1/3 =================
  // ガチャはキャラクター獲得中心になり、景品の抽選表そのものが無くなった（メール指示 2026-09-03）。
  // おやすみカードはガチャの当たりではなく「会っていない子がいないとき」の代わりになった。
  const rest = await page.evaluate(() => ({
    rate: REST_TICKET_RATE,
    noTable: typeof GACHA_PRIZES === 'undefined',
    draw: typeof gachaDrawOne === 'function'
  }));
  check(`今日の5問のおやすみカードは1/3 (${rest.rate.toFixed(3)})`, near(rest.rate, 1 / 3, 0.001));
  check('ガチャの景品抽選表は廃止', rest.noTable);
  check('ガチャは1回＝動物1匹の抽選になった', rest.draw);

  // ================= ⑫ ごはんは廃止（増えも減りもしない） =================
  const seed = await page.evaluate(() => {
    const before = petState().seeds || 0;
    petFeed('test'); petFeed('d5');
    const after = petState().seeds || 0;
    return { before, after, cfg: [PET_SEED.d5, PET_SEED.test] };
  });
  check(`テスト・今日の5問でごはんは動かない (${seed.before}→${seed.after})`, seed.after === seed.before && seed.cfg[0] === 0 && seed.cfg[1] === 0);

  // ================= ⑬ プレゼントはXP廃止・届くのはきせかえ =================
  const pres = await page.evaluate(() => {
    localStorage.removeItem('kwt_present_v1');
    state = { levelBefore: xpInfo().level };
    enqueuePresent('S', 4);
    const q = _presentState().queue;
    return { kinds: q.map(x => x.kind), xpItems: q.filter(x => x.kind !== 'coin' && x.kind !== 'food' && x.kind !== 'wear' && x.kind !== 'ticket').length };
  });
  check(`テスト後のプレゼントにXPのものが無い (${pres.kinds.join('/')})`, pres.xpItems === 0);
  check('きせかえのプレゼントが入る', pres.kinds.includes('wear'));
  check('ごはんのプレゼントはもう作られない', !pres.kinds.includes('food'));
  const claim = await page.evaluate(() => {
    const s0 = petState().seeds || 0, i0 = Object.keys(petState().items || {}).length, xp0 = loadBonus();
    openPresent('daily'); claimAllPresents();
    const r = { seeds: (petState().seeds || 0) - s0, items: Object.keys(petState().items || {}).length - i0, bonus: loadBonus() - xp0, spins: gachaSpins() };
    closePresent(); return r;
  });
  check(`受け取ってもごはんは増えない (+${claim.seeds})`, claim.seeds === 0);
  check(`受け取るときせかえが増える (+${claim.items})`, claim.items > 0);
  check(`受け取ってもボーナスXPは増えない (+${claim.bonus})`, claim.bonus === 0);
  check(`ガチャコインは今までどおりもらえる (${claim.spins}枚)`, claim.spins > 0);
  // 達成ボーナス・1周のごほうびもきせかえになっている
  const achv = await page.evaluate(() => {
    localStorage.removeItem('kwt_present_v1');
    checkAchievements();
    grantLapPresent('beginner', 1, 1);
    return _presentState().queue.map(x => x.kind);
  });
  check(`達成・周回のごほうびもきせかえ (${[...new Set(achv)].join('/')})`, achv.length > 0 && achv.every(k => k === 'wear'));

  // ================= ⑨ 設定のUI =================
  const set = await page.evaluate(() => {
    openSettings();
    const m = document.getElementById('settings-modal');
    const tiles = [...m.querySelectorAll('.cc-tile')];
    const boxes = tiles.map(t => Math.round(t.getBoundingClientRect().width) + 'x' + Math.round(t.getBoundingClientRect().height));
    const cs = getComputedStyle(tiles[0]);
    const r = {
      secs: [...m.querySelectorAll('.cc-sec')].map(e => e.textContent.trim()),
      sw: m.querySelectorAll('.cc-tile .cc-sw').length, tiles: tiles.length,
      same: new Set(boxes).size === 1, box: boxes[0],
      bg: cs.backgroundColor, border: cs.borderTopColor,
      // スイッチは2026-08-09 22:05の指示で廃止。オン/オフは枠の色で示す
      onBorder: (() => { const on = tiles.find(t => t.classList.contains('on')); return on ? getComputedStyle(on).borderTopColor : ''; })(),
      overflow: tiles.some(t => { const l = t.querySelector('.cc-lab'); return l.scrollWidth > l.clientWidth + 1; }),
      inScreen: m.querySelector('.set-card').getBoundingClientRect().bottom <= innerHeight + 1,
    };
    closeSettings(); return r;
  });
  check(`設定が見出しで分かれている (${set.secs.join('／')})`, set.secs.length >= 2 && set.secs.includes('学習') && set.secs.includes('見た目と音'));
  // ※スイッチは2026-08-09 22:05の指示で廃止（シンプル・コンパクトに）。マスは8つのまま、オンは黄色い枠で示す
  check(`マスは8つのまま・スイッチは無し (${set.sw}/${set.tiles})`, set.sw === 0 && set.tiles === 8);
  check(`オンのマスは黄色い枠 (${set.onBorder})`, set.onBorder === 'rgb(255, 196, 0)');
  check(`マスの大きさは全部同じ (${set.box})`, set.same);
  check(`これまでの配色は維持 (${set.bg} / ${set.border})`, set.bg === 'rgb(242, 242, 242)' && set.border === 'rgb(227, 227, 227)');
  check('ラベルがはみ出していない', !set.overflow);
  check('設定が画面内に収まる', set.inScreen);

  // ================= ⑦ 育成画面 =================
  const pet = await page.evaluate(() => {
    openPet();
    const card = document.querySelector('#pet-modal .pt-card');
    // きせかえ機能は廃止したので、広場に「きせかえる」ボタンは無い（メール指示 2026-09-03）
    const feed1 = card.querySelector('.pm-feed');
    const c1 = feed1 ? getComputedStyle(feed1).backgroundColor : '';
    const tabs = [...card.querySelectorAll('.pt-tabs button')];
    const imgs = card.querySelectorAll('.pt-ico').length;
    // 育てるメニューの画面は廃止し、そだてるボタンは広場を直接ひらく（メール指示 2026-08-31）
    const c2 = c1;
    // 図鑑・友だちガチャ・イベントは廃止され、残るのは広場ときせかえだけ（メール指示 2026-08-31）
    const subs = [];
    [['zoo', openPetZoo], ['gacha', openPetGacha], ['event', openPetEvent]].forEach(([k, fn]) => {
      fn();
      subs.push({ k, field: !!document.querySelector('#pet-modal .pt-field'),
        tabs: !!document.querySelector('#pet-modal .pt-tabs') });
    });
    openPetWear();
    const wearGone = !document.querySelector('#pet-modal .pt-wrow') && !!document.querySelector('#pet-modal .pt-field');
    closePet();
    return { c1, c2, tabs: tabs.length, imgs, subs, wearGone, hasFeed: !!feed1 };
  });
  check('広場に「きせかえる」ボタンは無い', !pet.hasFeed);
  check(`廃止した3画面はどれも広場になる`, pet.subs.length === 3 && pet.subs.every(s => s.field && !s.tabs));
  check(`きせかえ画面も広場になる`, pet.wearGone);

  // ================= ②③④ 出題画面の見た目 =================
  await page.evaluate(() => { curLevel = 'beginner'; startTest(); clearInterval(timer); renderQuestion(); });
  await page.waitForTimeout(400);
  await clearFx();
  const q = await page.evaluate(() => {
    const home = document.querySelector('.qhome'), cs = getComputedStyle(home);
    const slot = document.querySelector('.rn-slot'), ss = getComputedStyle(slot);
    return {
      radius: parseFloat(cs.borderTopLeftRadius), weight: cs.fontWeight, stroke: cs.webkitTextStrokeWidth,
      sw: parseFloat(ss.width), sh: parseFloat(ss.height), sb: parseFloat(ss.borderTopWidth),
    };
  });
  check(`戻るボタンが角丸 (${q.radius}px)`, q.radius >= 8);
  check(`「‹」が太い (weight ${q.weight} / stroke ${q.stroke})`, +q.weight >= 900 && parseFloat(q.stroke) >= 1);
  check(`進捗の札は75%の大きさ (${q.sw}×${q.sh}px)`, near(q.sw, 17 * 0.75, 0.3) && near(q.sh, 26 * 0.75, 0.3));
  check(`白枠は半分の太さ (${q.sb}px)`, near(q.sb, 1, 0.01));

  const ch = await page.evaluate(() => {
    // 文字数のちがう選択肢に差しかえても、4つの高さが変わらないこと
    const wrap = document.querySelector('#qstage .choices');
    if (!wrap) return null;
    const bs = [...wrap.querySelectorAll('.choice')];
    const before = bs.map(b => Math.round(b.getBoundingClientRect().height));
    bs[0].textContent = 'あ';
    bs[1].className = 'choice len-xl'; bs[1].textContent = 'とてもながい語釈がここに入ってしまう場合のテスト';
    bs[2].className = 'choice len-l'; bs[2].textContent = 'そこそこ長い語釈';
    const after = bs.map(b => Math.round(b.getBoundingClientRect().height));
    return { before, after };
  });
  check(`四択の縦幅が文字で変わらない (${ch ? ch.after.join('/') : '-'})`, !!ch && new Set(ch.after).size === 1 && new Set(ch.before).size === 1 && ch.after[0] === ch.before[0]);

  // ================= ① 降るカードの枚数とレア度 =================
  const rain = await page.evaluate(async () => {
    // 画像のある単語の四択問題にそろえてから、速く正解する
    const i = state.questions.findIndex(x => x.word && WORD_IMG[x.word.ko] && x.type !== 'w');
    if (i < 0) return null;
    state.idx = i;
    renderQuestion();
    QR.balls.forEach(b => b.el.remove()); QR.balls = [];
    document.getElementById('q-rain').innerHTML = '';
    const q = state.questions[state.idx];
    answered = false; clearInterval(timer); startTimer();
    qStart = performance.now() - curLimit() * 0.7 * 1000; // ゆっくり答えた＝ノーマルのカードが複数枚
    submit('correct', q.correct);
    const rec = state.results[state.results.length - 1];
    await new Promise(r => setTimeout(r, rec.cardsEarned * 90 + 400));
    const cards = [...document.querySelectorAll('#q-rain .qr-card')];
    document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer);
    return { earned: rec.cardsEarned, rare: rec.cardRarity, drops: cards.length, cls: cards[0] ? cards[0].className : '', border: cards[0] ? getComputedStyle(cards[0]).borderTopColor : '' };
  });
  check(`降るカードは手に入れた枚数と同じ (${rain && rain.drops}枚 / 獲得${rain && rain.earned}枚)`, !!rain && rain.drops === rain.earned && rain.earned > 1);
  // 速く答えたとき（レア度つき＝1枚）も枚数と色が一致する
  const rain2 = await page.evaluate(async () => {
    const i = state.questions.findIndex((x, n) => n > state.idx && x.word && WORD_IMG[x.word.ko] && x.type !== 'w');
    if (i < 0) return null;
    state.idx = i; renderQuestion();
    QR.balls.forEach(b => b.el.remove()); QR.balls = [];
    document.getElementById('q-rain').innerHTML = '';
    const q = state.questions[state.idx];
    answered = false; clearInterval(timer); startTimer();
    submit('correct', q.correct); // すぐ答える＝SSR
    const rec = state.results[state.results.length - 1];
    await new Promise(r => setTimeout(r, 400));
    const cards = [...document.querySelectorAll('#q-rain .qr-card')];
    document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer);
    return { earned: rec.cardsEarned, rare: rec.cardRarity, drops: cards.length, cls: cards[0] ? cards[0].className : '' };
  });
  check(`レア度でカードの色が変わる (${rain2 && rain2.rare} / ${rain2 && rain2.cls})`,
    !!rain2 && rain2.drops === rain2.earned && rain2.cls.indexOf('qr-' + rain2.rare) > 0);
  check(`ノーマルのカードには色を付けない (${rain && rain.cls})`, !!rain && rain.rare === 'N' && rain.cls.trim() === 'qr-card');

  // ================= ⑤ 書き取りのヒント =================
  const hint = await page.evaluate(() => {
    const i = state.questions.findIndex(x => x.word && /[가-힣]/.test(x.word.ko));
    state.idx = i < 0 ? 0 : i;
    state.results = [];               // 正解数0＝ヒントが出る条件
    state.questions[state.idx].type = 'w';
    renderQuestion();
    const wh = document.querySelector('.whint');
    const shadow = wh ? getComputedStyle(wh).textShadow : '';
    const limit = curLimit();
    // 制限時間の45%まで進めても、まだ1文字も入力していない状態にする
    qStart = performance.now() - limit * 0.55 * 1000;
    _tick();
    const keys1 = [...document.querySelectorAll('#kbd .key.hintkey')].map(k => k.dataset.k);
    // さらに時間が減ると、順に黄色が増える
    qStart = performance.now() - limit * 0.9 * 1000;
    _tick();
    const keys2 = [...document.querySelectorAll('#kbd .key.hintkey')].map(k => k.dataset.k);
    // 入力を始めたら消える
    IME.input(_HJUNG[0]); refreshInput(); _tick();
    const keys3 = document.querySelectorAll('#kbd .key.hintkey').length;
    const cho = _HCHO[_hDecomp(state.questions[state.idx].hintText).cho];
    clearInterval(timer);
    return { shadow, keys1, keys2, keys3, cho };
  });
  check(`書き取りヒントに黒光彩 (${hint.shadow.slice(0, 34)}…)`, /rgba?\(0, 0, 0/.test(hint.shadow));
  check(`半分を切ると1文字目の子音キーが黄色 (${hint.keys1.join('')})`, hint.keys1.length === 1 && hint.keys1[0] === hint.cho);
  check(`時間が減るほど順に増える (${hint.keys2.join('')})`, hint.keys2.length >= 2 && hint.keys2[0] === hint.cho);
  check('入力を始めたら黄色は消える', hint.keys3 === 0);

  // ================= ⑧ カウントダウン中にメニューを開いたら止める =================
  await page.evaluate(() => { clearInterval(timer); quitTest(); show('s-home'); });
  await page.waitForTimeout(500);
  await clearFx();
  const cd = await page.evaluate(async () => {
    onStartBtn();
    const during = !!document.getElementById('home-cd') && _counting;
    openHomeMenu();
    await new Promise(r => setTimeout(r, 60));
    const after = { cd: !!document.getElementById('home-cd'), counting: _counting };
    closeHomeMenu();
    await new Promise(r => setTimeout(r, 1400));
    return { during, after, quiz: document.getElementById('s-quiz').classList.contains('on') };
  });
  check('スタートで3・2・1が出る', cd.during);
  check('メニューを開くとカウントダウンが止まる', !cd.after.cd && !cd.after.counting);
  check('勝手にテストが始まらない', !cd.quiz);

  // ================= ⑥ 結果画面の正誤記号 =================
  const sym = await page.evaluate(() => {
    const R = [{ wordId: 1, korean: BEGINNER_WORDS[0].ko, japanese: BEGINNER_WORDS[0].ja, answerStatus: 'correct', isCorrect: true, cardsEarned: 3, cardRarity: 'R', displayMemoryScoreBefore: 10, displayMemoryScoreAfter: 40 }];
    document.getElementById('s-result').innerHTML = `<div class="res"><div class="res-cards">${resultCardsHTML(R)}</div></div>`;
    show('s-result');
    const card = document.querySelector('#s-result .rc-card'), s = card.querySelector('.rc-sym');
    const cb = card.getBoundingClientRect(), sb = s.getBoundingClientRect(), cs = getComputedStyle(s);
    return { inCard: s.parentElement.classList.contains('rc-card'), dx: sb.left - cb.left, dy: sb.top - cb.top, bg: cs.backgroundColor, radius: parseFloat(cs.borderTopLeftRadius) };
  });
  check('正誤記号はカード直下（画像の中ではない）', sym.inCard);
  check(`左上の少し内側にある (${Math.round(sym.dx)},${Math.round(sym.dy)})`, sym.dx > 1 && sym.dx < 14 && sym.dy > 1 && sym.dy < 14);
  check(`白い角丸座布団つき (${sym.bg} / ${sym.radius}px)`, sym.bg === 'rgb(255, 255, 255)' && sym.radius >= 4);

  // ================= ⑩ 今日の5問の結果画面 =================
  await page.evaluate(() => { show('s-home'); localStorage.removeItem('kwt_d5_v1'); curLevel = 'beginner'; startDaily5(); });
  await page.waitForTimeout(2600);
  await page.evaluate(async () => {
    for (let i = 0; i < 5; i++) {
      const q = state.questions[state.idx];
      answered = false; clearInterval(timer); startTimer();
      submit(i < 3 ? 'correct' : 'incorrect', i < 3 ? q.correct : q.choices.find(c => c !== q.correct));
      await new Promise(r => setTimeout(r, 820));
    }
  });
  await page.waitForTimeout(500);
  const d5a = await page.evaluate(() => ({
    on: document.getElementById('s-d5result').classList.contains('on'),
    shown: document.querySelector('#s-d5result .d5r-score').classList.contains('shown'),
    judged: document.querySelectorAll('#s-d5result .d5r-row.judged').length,
  }));
  check('今日の5問→結果画面', d5a.on);
  check(`判定アニメが先（点数はまだ出ていない） (判定${d5a.judged}問)`, !d5a.shown);
  await page.waitForTimeout(3400);
  const d5b = await page.evaluate(() => {
    const r = document.getElementById('s-d5result');
    const gain = r.querySelector('#res-xp-gain');
    return {
      shown: r.querySelector('.d5r-score').classList.contains('shown'),
      judged: r.querySelectorAll('.d5r-row.judged').length,
      medal: !!r.querySelector('.res-top .rank-medal'), medalTxt: (r.querySelector('.rank-medal') || {}).textContent,
      score: r.querySelector('.res-score').textContent.replace(/\s+/g, ' ').trim(),
      xpRow: !!r.querySelector('#res-xpfill'), xp: gain ? gain.textContent.trim() : '',
      pwr: !!r.querySelector('#res-pwrfill'),
    };
  });
  check('判定しきったら点数が出る', d5b.shown && d5b.judged === 5);
  check(`通常結果と同じメダルが出る (${d5b.medalTxt})`, d5b.medal);
  check(`点数は 3 / 5 (${d5b.score})`, /3 \/ 5/.test(d5b.score));
  check(`XPアップが表示される (${d5b.xp})`, d5b.xpRow && /\+\d+ XP/.test(d5b.xp));
  check('PWRメーターは出さない（WORLD別のため）', !d5b.pwr);

  await page.waitForTimeout(300);
  check(`コンソールエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) console.log(errors);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
