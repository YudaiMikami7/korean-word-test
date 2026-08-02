/* k-tango 2026-08-01 20:20 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0801e.test.js
 * 検証:
 *  ① 単語カードのレア度：早く正解するほど高いレア度が出る／保存される／結果画面・獲得演出・出題帯・単語詳細に出る
 *  ② テストのごほうびはプレゼントではなくガチャ。テストを終えるたびに回せる回数が増える
 *  ③ ガチャの景品は おやすみチケット／XP（ランダム）／XP2倍（30分）チャンス の3種類
 *  ④ XP2倍チャンス中はテストでもらえるXPが2倍になる
 *  ⑤ 今日の5問を終えるたびに、プレゼントの中へ おやすみチケット が1枚入る
 *  ⑥ おやすみチケットを使うと連続学習が途切れない
 *  ⑦ 連続が途切れたまま起動した日は、いちばん最初に「使いますか？」のポップアップが出る
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
  await page.waitForTimeout(1400);

  // ================= ① レア度の抽選ロジック =================
  const roll = await page.evaluate(() => {
    const tally = (ratio, ok) => {
      const c = { N: 0, R: 0, SR: 0, SSR: 0 };
      for (let i = 0; i < 4000; i++) c[rollCardRarity(ratio, ok)]++;
      return c;
    };
    return { fast: tally(1, true), slow: tally(0.1, true), zero: tally(0, true), wrong: tally(1, false) };
  });
  const hiFast = roll.fast.SR + roll.fast.SSR, hiSlow = roll.slow.SR + roll.slow.SSR;
  check(`速く正解するほど高レア度が出やすい (残り満タン ${hiFast}回 / ほぼ時間切れ ${hiSlow}回 ※各4000回)`, hiFast > hiSlow * 3);
  check(`速い正解ではSSRも出る (${roll.fast.SSR}回)`, roll.fast.SSR > 0);
  check(`遅い正解ではSSRはほぼ出ない (${roll.slow.SSR}回)`, roll.slow.SSR <= 40);
  check(`ぎりぎりの正解ではSR・SSRは出ない (SR ${roll.zero.SR} / SSR ${roll.zero.SSR})`, roll.zero.SR === 0 && roll.zero.SSR === 0);
  check(`不正解はノーマルどまり`, roll.wrong.N === 4000);
  check(`4段階（N/R/SR/SSR）が定義されている`, await page.evaluate(() => RARITY_ORDER.join(',') === 'N,R,SR,SSR' && CARD_RARITY.length === 4));

  check('レア度の枚数がたまる', await page.evaluate(() => {
    addCardRare(9991, 3, 'SR'); addCardRare(9991, 2, 'SR'); addCardRare(9991, 1, 'SSR');
    const o = cardRareOf(9991);
    const ok = o.SR === 5 && o.SSR === 1 && bestRarity(9991) === 'SSR';
    const c = loadCardRare(); delete c[9991]; _lsSetJSON(LS_CARDR, c);
    return ok;
  }));

  // ================= ② 通常テスト1本：レア度の保存とガチャ回数 =================
  const before = await page.evaluate(() => ({ spins: gachaSpins(), rank: presentsAvailable('rank') }));
  check('はじめはガチャ0回', before.spins === 0 && before.rank === 0);

  await page.evaluate(() => {
    document.querySelectorAll('.pbub,.stepnote,.sg-clear,.sg-adv,.sg-pirin,.overlay').forEach(o => o.remove());
    _rollOrig = rollCardRarity; rollCardRarity = () => 'SSR';  // 検証しやすいようレア度を固定
    show('s-home'); curLevel = 'beginner'; curSection = 1;
    _boardTile = { level: 'beginner', sec: 1, gidx: 1 };
    startTest();
    const N = state.questions.length;
    for (let i = 0; i < N; i++) {
      const q = state.questions[state.idx]; if (!q) break;
      if (q.type === 'sg' || q.type === 'sg4') { shootAdvance(); continue; }
      answered = false; clearInterval(timer); startTimer();
      submit('correct', q.type === 'w' ? q.word.ko : q.correct);
      document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer();
    }
  });
  await page.waitForTimeout(500);

  const cg = await page.evaluate(() => ({
    overlay: !!document.querySelector('.cardget'),
    cards: document.querySelectorAll('.cardget .cg-card').length,
    rare: document.querySelectorAll('.cardget .cg-card.rare-SSR').length,
    tag: (document.querySelector('.cardget .cg-rare') || {}).textContent || '',
    slotRare: document.querySelectorAll('#rn-rail .rn-slot.rn-SSR').length,
    slotAll: document.querySelectorAll('#rn-rail .rn-slot.got').length
  }));
  check(`獲得演出のカードにレア度の枠が付く (${cg.rare}/${cg.cards}枚)`, cg.overlay && cg.cards > 0 && cg.rare === cg.cards);
  check(`獲得演出にレア度ラベルが出る (${cg.tag})`, cg.tag === 'SSR');
  check(`出題画面の札もレア度の色になる (${cg.slotRare}/${cg.slotAll}枚)`, cg.slotRare > 0 && cg.slotRare === cg.slotAll);

  await page.evaluate(() => { document.querySelectorAll('.cardget').forEach(o => o.remove()); });
  await page.waitForTimeout(600);

  const res = await page.evaluate(() => {
    const R = state.results;
    return {
      recRare: R.filter(r => r.cardRarity === 'SSR').length, recN: R.length,
      domRare: document.querySelectorAll('#s-result .rc-card.rare-SSR').length,
      domCards: document.querySelectorAll('#s-result .rc-card').length,
      badge: (document.querySelector('#s-result .rc-rareb') || {}).textContent || '',
      stored: bestRarity(R[0].wordId),
      storedN: cardRareOf(R[0].wordId).SSR
    };
  });
  check(`回答1件ごとにレア度が記録される (${res.recRare}/${res.recN}件)`, res.recRare === res.recN && res.recN >= 12);
  check(`結果画面のカードにレア度の枠が付く (${res.domRare}/${res.domCards}枚)`, res.domCards >= 12 && res.domRare === res.domCards);
  // レア度は左上の小さな札をやめ、絵の裏に薄く大きく右上寄せで出す（メール指示 2026-08-02）
  check(`結果画面にレア度が絵の裏に大きく出る (${res.badge})`, res.badge === 'SSR');
  check(`獲得したカードのレア度が保存される (SSR ${res.storedN}枚)`, res.stored === 'SSR' && res.storedN > 0);

  // 単語詳細のカード枚数は、レア度ごとに分けた黄色い座布団の札アイコンで出す（メール指示 2026-08-02）
  check('単語詳細にレア度ごとの札アイコンが出る', await page.evaluate(() => {
    const id = state.results[0].wordId;
    const h = wdCardIconsHTML(id);
    return /wd-cchip/.test(h) && /wd-cico rn-SSR/.test(h);
  }));

  // テストが終わると「プレゼント」が届き、受け取るとガチャコインになる（メール指示 2026-08-02）
  const after = await page.evaluate(() => {
    const coin = _presentState().queue.filter(x => x.kind === 'coin' && x.title === 'テストのごほうび');
    return { spinsBefore: gachaSpins(), coins: coin.length, cat: coin[0] && coin[0].cat, xp: coin[0] && coin[0].total };
  });
  check(`テストを1本終えるとプレゼントが1個届く (${after.coins}個)`, after.coins === 1);
  check(`プレゼントは毎日ボーナスの箱に入る (${after.cat})`, after.cat === 'daily');
  check('受け取る前はまだガチャはまわせない', after.spinsBefore === 0);
  check(`テストぶんのXPはコインにくっついている (+${after.xp} XP)`, after.xp > 0);
  // プレゼントを受け取る → ガチャコイン1枚
  const claimed = await page.evaluate(() => {
    openPresent('daily');
    const btn = [...document.querySelectorAll('#present-modal .pm-item')].find(b => b.dataset.kind === 'coin');
    const face = btn && btn.querySelector('.pm-cn');
    claimPresentItem(btn);
    closePresent();
    return { spins: gachaSpins(), q: gachaState().q.slice(-1)[0], hadCoinFace: !!face };
  });
  check('プレゼントの中身がガチャコインだと分かる', claimed.hadCoinFace);
  check(`受け取るとガチャコインが1枚ふえる (${claimed.spins}枚)`, claimed.spins === 1);
  check(`テストぶんのXPはコインと一緒にガチャへ渡る (+${claimed.q && claimed.q.xp} XP)`, claimed.q && claimed.q.xp > 0);

  // ================= ③ ガチャの見た目・景品 =================
  // ボタンはプレゼントと統合され、統合ボタンの吹き出しの中に入った（メール指示 2026-08-02 16:32）
  check('ホームのボタンがガチャになっている', await page.evaluate(() => {
    const b = document.getElementById('rr-rank');
    return /openGacha/.test(b.getAttribute('onclick')) && b.querySelector('.gf-txt').textContent.trim() === 'ガチャ';
  }));
  check('ガチャコインの枚数がバッジに出る', await page.evaluate(() => {
    updatePresent();
    const b = document.getElementById('pb-rank');
    return b.style.display === 'flex' && b.textContent === '1';
  }));

  await page.evaluate(() => { show('s-home'); openGacha(); });
  await page.waitForTimeout(250);
  check('ガチャのモーダルが開く', await page.evaluate(() => document.getElementById('gacha-modal').classList.contains('on')));
  check('「まわす」ボタンがある', await page.evaluate(() => !!document.querySelector('#gacha-modal .gc-go')));

  const prizes = await page.evaluate(() => {
    const c = {}; for (let i = 0; i < 3000; i++) { const p = rollGachaPrize(); c[p.k] = (c[p.k] || 0) + 1; }
    return { c, labs: GACHA_PRIZES.map(p => p.lab) };
  });
  check(`景品は3種類（${prizes.labs.join(' / ')}）`, prizes.labs.length === 3
    && prizes.labs.includes('おやすみチケット') && prizes.labs.includes('XP') && prizes.labs.includes('XP2倍チャンス'));
  check(`3種ともちゃんと出る (チケット${prizes.c.ticket} / XP${prizes.c.xp} / 2倍${prizes.c.x2})`,
    prizes.c.ticket > 0 && prizes.c.xp > 0 && prizes.c.x2 > 0);
  check('XPの当たり額はランダム', await page.evaluate(() => {
    const s = new Set(); for (let i = 0; i < 400; i++) s.add(rollGachaXp());
    return s.size >= 3 && [...s].every(v => v >= 30 && v <= 300);
  }));

  // まわす（景品＝おやすみチケットに固定）
  const spinT = await page.evaluate(async () => {
    _prizeOrig = rollGachaPrize; rollGachaPrize = () => GACHA_PRIZES.find(p => p.k === 'ticket');
    const b0 = loadBonus(), t0 = restTickets(), n0 = gachaSpins();
    spinGacha();
    await new Promise(r => setTimeout(r, 1400));
    return { n0, n1: gachaSpins(), t0, t1: restTickets(), b0, b1: loadBonus(), shown: !!document.querySelector('#gacha-modal .gc-prize') };
  });
  check(`まわすと回数が減る (${spinT.n0} → ${spinT.n1})`, spinT.n1 === spinT.n0 - 1);
  check('景品の表示が出る', spinT.shown);
  check(`おやすみチケットが当たると1枚もらえる (${spinT.t0} → ${spinT.t1})`, spinT.t1 === spinT.t0 + 1);
  check(`テストぶんのXPも一緒にもらえる (+${spinT.b1 - spinT.b0} XP)`, spinT.b1 > spinT.b0);

  // 景品＝XP / XP2倍
  const spinX = await page.evaluate(async () => {
    addGachaSpin(0, 'B'); rollGachaPrize = () => GACHA_PRIZES.find(p => p.k === 'xp');
    const b0 = loadBonus(); spinGacha(); await new Promise(r => setTimeout(r, 1400));
    const b1 = loadBonus();
    addGachaSpin(0, 'B'); rollGachaPrize = () => GACHA_PRIZES.find(p => p.k === 'x2');
    localStorage.removeItem(LS_XPBOOST);
    const on0 = xpBoostActive(); spinGacha(); await new Promise(r => setTimeout(r, 1400));
    const on1 = xpBoostActive(), left = xpBoostLeftMin();
    rollGachaPrize = _prizeOrig;
    return { b0, b1, on0, on1, left, x2badge: getComputedStyle(document.getElementById('rr-x2')).display };
  });
  check(`XPが当たるとXPが増える (+${spinX.b1 - spinX.b0} XP)`, spinX.b1 > spinX.b0);
  check(`XP2倍チャンスが当たると30分ぶん有効になる (残り${spinX.left}分)`, !spinX.on0 && spinX.on1 && spinX.left > 25 && spinX.left <= 30);
  check('XP2倍チャンス中はホームのガチャに✕2の札が出る', spinX.x2badge !== 'none');

  check('受け取っていない旧「テストのごほうび」はガチャ回数へ引っ越す', await page.evaluate(() => {
    const st = _presentState();
    st.queue.push({ cat: 'rank', kind: 'test', rank: 'A', total: 190, at: new Date().toISOString() });
    _savePresent(st);
    const n0 = gachaSpins();
    migrateRankPresents();
    return gachaSpins() === n0 + 1 && presentsAvailable('rank') === 0 && gachaState().q.slice(-1)[0].xp === 190;
  }));

  // ================= ④ XP2倍チャンス中のテスト =================
  await page.evaluate(() => { closeGacha(); document.querySelectorAll('.lvup,.cardget,.pbub').forEach(o => o.remove()); });
  const dbl = await page.evaluate(() => {
    startXpBoost(30);
    const b0 = loadBonus();
    show('s-home'); curLevel = 'beginner'; curSection = 2;
    _boardTile = { level: 'beginner', sec: 2, gidx: 1 };
    startTest();
    const N = state.questions.length;
    for (let i = 0; i < N; i++) {
      const q = state.questions[state.idx]; if (!q) break;
      if (q.type === 'sg' || q.type === 'sg4') { shootAdvance(); continue; }
      answered = false; clearInterval(timer); startTimer();
      submit('correct', q.type === 'w' ? q.word.ko : q.correct);
      document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer();
    }
    const raw = Math.max(0, Math.round(state.results.reduce((a, r) => a + r.score, 0)));
    return { raw, b0, b1: loadBonus(), shown: +(document.getElementById('res-xp-gain') || {}).dataset?.to };
  });
  check(`XP2倍チャンス中はもらえるXPが2倍で表示される (素点${dbl.raw} → 表示+${dbl.shown} XP)`, dbl.shown === dbl.raw * 2);
  check(`2倍ぶんが実際にXPへ加算される (+${dbl.b1 - dbl.b0})`, dbl.b1 - dbl.b0 === dbl.raw);

  const noDbl = await page.evaluate(() => {
    localStorage.removeItem(LS_XPBOOST);
    document.querySelectorAll('.cardget,.lvup,.pbub').forEach(o => o.remove());
    show('s-home'); curLevel = 'beginner'; curSection = 3;
    _boardTile = { level: 'beginner', sec: 3, gidx: 1 };
    startTest();
    const N = state.questions.length;
    for (let i = 0; i < N; i++) {
      const q = state.questions[state.idx]; if (!q) break;
      if (q.type === 'sg' || q.type === 'sg4') { shootAdvance(); continue; }
      answered = false; clearInterval(timer); startTimer();
      submit('correct', q.type === 'w' ? q.word.ko : q.correct);
      document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer();
    }
    rollCardRarity = _rollOrig; // レア度の固定をもとに戻す
    const raw = Math.max(0, Math.round(state.results.reduce((a, r) => a + r.score, 0)));
    return { raw, shown: +(document.getElementById('res-xp-gain') || {}).dataset?.to };
  });
  check(`チャンスが切れていれば等倍のまま (素点${noDbl.raw} → 表示+${noDbl.shown} XP)`, noDbl.shown === noDbl.raw);

  // ================= ⑤ 今日の5問 → おやすみチケット =================
  await page.evaluate(() => { document.querySelectorAll('.cardget,.lvup,.pbub,.streak-cel').forEach(o => o.remove()); show('s-home'); });
  const tkBefore = await page.evaluate(() => ({
    tickets: restTickets(),
    inPresent: _presentState().queue.filter(x => x.kind === 'ticket').length
  }));

  await page.evaluate(() => { curLevel = 'beginner'; startDaily5(); });
  await page.waitForTimeout(2600);
  await page.evaluate(async () => {
    for (let i = 0; i < 5; i++) {
      const q = state.questions[state.idx]; if (!q) break;
      answered = false; clearInterval(timer); startTimer();
      submit('correct', q.correct);
      await new Promise(r => setTimeout(r, 850));
    }
  });
  await page.waitForTimeout(700);

  const tkAfter = await page.evaluate(() => {
    const q = _presentState().queue.filter(x => x.kind === 'ticket');
    return { n: q.length, cat: q.length ? q[q.length - 1].cat : '', d5done: d5Done() };
  });
  check('今日の5問が完了している', tkAfter.d5done);
  check(`5問を終えるとプレゼントにおやすみチケットが入る (${tkBefore.inPresent} → ${tkAfter.n}個)`, tkAfter.n === tkBefore.inPresent + 1);
  check(`チケットは毎日ボーナスのプレゼントに入る (${tkAfter.cat})`, tkAfter.cat === 'daily');

  const tkClaim = await page.evaluate(() => {
    show('s-home'); openPresent('daily');
    const btn = [...document.querySelectorAll('#present-modal .pm-item')].find(b => b.dataset.kind === 'ticket');
    const label = btn ? btn.querySelector('.ttl').textContent : '';
    const amt = btn ? btn.querySelector('.amt').textContent : '';
    const b0 = loadBonus(), t0 = restTickets();
    if (btn) claimPresentItem(btn);
    const r = { label, amt, t0, t1: restTickets(), b0, b1: loadBonus() };
    closePresent();
    return r;
  });
  check(`プレゼントの中に「${tkClaim.label}」が並ぶ`, tkClaim.label === 'おやすみチケット');
  check(`XPではなく枚数で表示される (${tkClaim.amt})`, tkClaim.amt === '1枚');
  check(`受け取るとチケットが1枚ふえる (${tkClaim.t0} → ${tkClaim.t1}枚)`, tkClaim.t1 === tkClaim.t0 + 1);
  check('チケットの受け取りでXPは増えない', tkClaim.b1 === tkClaim.b0);

  // ================= ⑥⑦ 連続が途切れたときのポップアップ =================
  // 5日前〜3日前に学習し、2日前・1日前が抜けている状態を作る
  const setup = await page.evaluate(() => {
    const h = [];
    [5, 4, 3].forEach(off => {
      const d = new Date(); d.setDate(d.getDate() - off); d.setHours(12, 0, 0, 0);
      for (let i = 0; i < 12; i++) h.push({
        userId: 'u', wordId: 100 + i, testId: 't' + off, questionNumber: i + 1,
        korean: 'x', japanese: 'x', answerStatus: 'correct', isCorrect: true, score: 5,
        answeredAt: new Date(d.getTime() + i * 1000).toISOString()
      });
    });
    localStorage.setItem('kwt_history_v1', JSON.stringify(h));
    _histIdxCache = null; _roomSeriesCache = {};
    saveRest({ n: 2, used: [] });
    localStorage.removeItem('kwt_restask_v1');
    return { streak: loginStreak(), miss: restMissedDays() };
  });
  check(`2日以上あくと連続が途切れる (連続${setup.streak}日)`, setup.streak === 0);
  check(`途切れの原因になっている日が分かる (${setup.miss.join(' / ')})`, setup.miss.length === 2);

  await page.reload();
  await page.waitForTimeout(1600);
  const ask = await page.evaluate(() => {
    const ov = document.querySelector('.rest-ask');
    return {
      shown: !!ov,
      title: ov ? ov.querySelector('.pm-title').textContent : '',
      first: !document.getElementById('resume-ask') && !document.getElementById('coach') && !document.querySelector('.d5auto'),
      btns: ov ? [...ov.querySelectorAll('.pm-btn')].map(b => b.textContent) : []
    };
  });
  check(`途切れたあとの起動でポップアップが出る (${ask.title})`, ask.shown && ask.title === 'おやすみチケットを使いますか？');
  check('ほかの案内より先に出る（いちばん最初）', ask.first);
  check(`「使う」「使わない」が選べる (${ask.btns.join(' / ')})`, ask.btns.length === 2 && ask.btns[0] === '使う' && ask.btns[1] === '使わない');

  const used = await page.evaluate(() => {
    const t0 = restTickets();
    restAskUse();
    return { t0, t1: restTickets(), streak: loginStreak(), covered: [...restCovered()].length, gone: !document.querySelector('.rest-ask.on') };
  });
  check(`「使う」でチケットが減る (${used.t0} → ${used.t1}枚)`, used.t1 === 0);
  check(`使った日ぶんが「お休みした日」になる (${used.covered}日)`, used.covered === 2);
  check(`連続がつながる (0日 → ${used.streak}日)`, used.streak === 3 + 2);
  check('ポップアップが閉じる', used.gone);

  const cal = await page.evaluate(() => {
    // お休みにした日は先月にまたがることがあるので、今月と先月の両方を数える
    let n = 0, leg = false;
    [0, -1].forEach(off => {
      openCalendar(off);
      n += document.querySelectorAll('#calendar-modal .cd.rested').length;
      leg = leg || /おやすみチケットを使った日/.test(document.getElementById('calendar-modal').innerHTML);
    });
    closeCalendar();
    return { n, leg };
  });
  check(`カレンダーにお休みの日が出る (${cal.n}日)`, cal.n === 2 && cal.leg);

  // 同じ日に2度は聞かない／チケットが無ければ聞かない
  await page.waitForTimeout(500); // 直前のポップアップがDOMから消えるのを待つ
  check('同じ日に何度も聞かない', await page.evaluate(() => {
    saveRest({ n: 2, used: [] });
    _histIdxCache = null;
    return maybeRestAsk() === false && !document.querySelector('.rest-ask');
  }));
  check('チケットを持っていなければ聞かない', await page.evaluate(() => {
    localStorage.removeItem('kwt_restask_v1');
    saveRest({ n: 0, used: [] });
    return maybeRestAsk() === false && !document.querySelector('.rest-ask');
  }));
  check('途切れていなければ聞かない', await page.evaluate(() => {
    localStorage.removeItem('kwt_restask_v1');
    saveRest({ n: 3, used: [] });
    const h = [];
    [1, 0].forEach(off => {
      const d = new Date(); d.setDate(d.getDate() - off); d.setHours(12, 0, 0, 0);
      for (let i = 0; i < 12; i++) h.push({ wordId: 100 + i, testId: 'z' + off, questionNumber: i + 1, score: 5, isCorrect: true, answeredAt: new Date(d.getTime() + i * 1000).toISOString() });
    });
    localStorage.setItem('kwt_history_v1', JSON.stringify(h)); _histIdxCache = null; _roomSeriesCache = {};
    return restMissedDays().length === 0 && maybeRestAsk() === false;
  }));

  check(`コンソールエラーが出ていない (${errors.length}件)`, errors.length === 0, errors.slice(0, 3).join(' / '));

  const ok = results.filter(r => r.ok).length;
  console.log(`\n===== ${ok} / ${results.length} PASS =====`);
  if (ok !== results.length) console.log('FAILED:\n' + results.filter(r => !r.ok).map(r => ' - ' + r.name).join('\n'));
  await browser.close();
  process.exit(ok === results.length ? 0 : 1);
})();
