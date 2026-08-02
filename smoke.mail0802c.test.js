/* k-tango 2026-08-02 11:45 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0802c.test.js
 * 検証:
 *  ① 単語帳：単語数(N/M)の表示を廃止し、カード枚数を絞り込みの列の「全部」の左に置く
 *  ② 単語帳：左右のアイコンを出さず、そのぶん一覧を左右いっぱいまで使う
 *  ③ 単語帳：「最近学んだ単語」を出さず、その場所に検索バーを置く（ホームボタンに重ならない）
 *  ④ 単語詳細：「初級 ROOM xx」のバーを廃止し、ホームの真ん中だけが差し替わる方式
 *  ⑤ 単語詳細：韓国語を少し小さく／カード枚数はレア度ごとの黄色い札アイコン
 *  ⑥ 単語詳細：PWRメーターはステータスバーと同じ形（黒のカプセル）／学習履歴に西暦なし／国旗は絵ファイル
 *  ⑦ 単語詳細：一番下までスクロールしてさらに引くと単語帳へ戻る
 *  ⑧ ホーム：マス番号が「ROOMナンバー-ステップナンバー」／周の区切り線が上へ寄る
 *  ⑨ ホーム：受け取り待ちがあるときだけ右のアイコンが上下に動く
 *  ⑩ 設定：今日の5問と同じ白い座布団のデザイン／マスの大きさが中身で変わらない
 *  ⑪ スペシャルモード：同じデザイン＋プレビュー→もう一度押すとカウントダウンで開始
 *  ⑫ 出題画面：札の列とキャラは同じ1列／レア度は回答スピードで決まる／レア度付きは1単語1枚
 *  ⑬ 結果画面：レア度は絵の裏に大きく右上寄せ／カードの色がレア度で変わる／黒座布団はカプセル／点数の行は左寄せ
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kwt_coach_v1', '1');
    localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now()));
    localStorage.setItem('kwt_firstdone_v1', '1');
    localStorage.setItem('kwt_roomhint_v1', '1');
  });
  await page.reload();
  await page.waitForTimeout(1500);
  const clearFx = () => page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.lvup,.fcust,.pbub,.stepnote,.tapavatar,.rest-ask,#resume-ask,.coach,.d5auto').forEach(o => o.remove()));
  await clearFx();

  // カード・履歴・すごろくの進みを仕込む（2周目まで進める）
  await page.evaluate(() => {
    const ids = (LEVEL_SECTIONS[curLevel][curSection] || []).slice(0, 6);
    const cards = {}, rare = {};
    ids.forEach((id, i) => { cards[id] = 5; rare[id] = i === 0 ? { N: 3, SSR: 2 } : { N: 5 }; });
    _lsSetJSON(LS_CARDS, cards); _lsSetJSON(LS_CARDR, rare);
    const hist = [];
    ids.forEach(id => { for (let k = 0; k < 12; k++) hist.push({ wordId: id, testId: 't' + k, isCorrect: true, answerStatus: 'correct', questionType: 'choice', answerType: 'choice', direction: 'kr_to_jp', responseTimeMs: 2000, responseTimeSec: 2, answeredAt: new Date(Date.now() - k * 86400000).toISOString(), score: 8 }); });
    _lsSetJSON(LS_HIST, hist); _histIdxCache = null;
    const b = loadBoard(); b[boardKey(curLevel, curSection)] = { cleared: 14, tiles: {} }; _lsSetJSON(LS_BOARD, b);
    buildRoomSlides(); buildTodayBand();
  });
  await page.waitForTimeout(800);
  await clearFx();

  // ================= ⑧ すごろくのマス番号と周の区切り =================
  const sg = await page.evaluate(() => {
    const sl = document.querySelector(`.room-slide[data-n="${curSection}"]`);
    const L = boardLapSize(curLevel, curSection);
    const lap = sl.querySelector('.sg-lap');
    const t13 = sl.querySelector('.sg-tile[aria-label="マス' + (L + 1) + '"]');
    return { nums: [...sl.querySelectorAll('.sg-num')].map(e => e.textContent), L, room: curSection,
             lapTop: lap ? parseFloat(lap.style.top) : null, y13: t13 ? parseFloat(t13.dataset.y) : null };
  });
  check(`マス番号は「ROOM-ステップ」 (${sg.nums.slice(0, 3).join(',')})`,
    sg.nums[0] === `${sg.room}-1` && sg.nums[1] === `${sg.room}-2`);
  check(`ステップ番号は周をまたいで続く (${sg.nums[sg.L]})`, sg.nums[sg.L] === `${sg.room}-${sg.L + 1}`);
  // 周の区切り線は「下がりすぎ」だったので上へ寄せた（1マスの間隔SG_STEP=178の半分より上）
  check(`周の区切り線が半コマより上にある (線${sg.lapTop} / マス${sg.y13})`,
    sg.lapTop != null && sg.lapTop - sg.y13 < 89 && sg.lapTop > sg.y13);

  // ================= ⑨ 受け取り待ちがあるときだけアイコンが上下に動く =================
  const bob = await page.evaluate(() => {
    const b = document.getElementById('sg-gift'); // 統合ボタンが上下に動く（メール指示 2026-08-02 16:32）
    b.classList.remove('rb', 'bob');
    const off = getComputedStyle(b).animationName;
    b.classList.add('rb', 'bob');
    const on = getComputedStyle(b).animationName;
    b.classList.remove('rb', 'bob');
    return { off, on };
  });
  check(`受け取り待ちがあると上下に動く (${bob.on})`, bob.on === 'giftbob');
  check(`何も無いときは動かない (${bob.off})`, bob.off === 'none');

  // ================= ①②③ 単語帳ページ =================
  await page.evaluate(() => enterListMode());
  await page.waitForTimeout(900);
  await clearFx();
  const wb = await page.evaluate(() => {
    const cs = e => e ? getComputedStyle(e) : null;
    const list = document.querySelector(`.room-slide[data-n="${curSection}"] .slide-list`);
    const tabs = list.querySelector('.wb-tabs');
    const bar = list.querySelector('.wb-searchrow'), band = document.getElementById('today-band'); // 検索欄は一覧の中へ（メール指示 2026-08-02 16:32）
    const home = document.querySelector('.home-side-btn.hsb-right');
    const sr = bar.getBoundingClientRect(), br = band.getBoundingClientRect(), hr = home.getBoundingClientRect();
    return {
      oldSum: !!list.querySelector('.wb-sum'),
      chip: tabs.firstElementChild.classList.contains('wb-cnt-chip'),
      chipText: tabs.firstElementChild.textContent.replace(/\s+/g, ''),
      nextIsAll: tabs.children[1].classList.contains('wb-tab') && tabs.children[1].textContent === '全部',
      railHidden: [...document.querySelectorAll('.reward-rail')].every(r => cs(r).opacity === '0'),
      bandHidden: cs(band).opacity === '0',
      listPad: parseFloat(cs(list).paddingLeft),
      searchInBand: sr.top >= br.top - 2 && sr.bottom <= br.bottom + 2 && Math.abs(sr.width - br.width) <= 2,
      searchOverHome: sr.left < hr.right && sr.right > hr.left && sr.top < hr.bottom && sr.bottom > hr.top,
    };
  });
  check('単語数(N/M)の行は廃止', !wb.oldSum);
  check(`カード枚数は絞り込みの列の「全部」の左 (${wb.chipText})`, wb.chip && /^カード\d+枚$/.test(wb.chipText) && wb.nextIsAll);
  check('単語帳では左右のアイコンを出さない', wb.railHidden);
  check(`そのぶん一覧を左右いっぱいまで使う (padding=${wb.listPad}px)`, wb.listPad <= 8);
  check('「最近学んだ単語」は出さない', wb.bandHidden);
  // 検索バーは帯のあった場所から、カード枚数・絞り込みの列のすぐ下へ移した（メール指示 2026-08-02 14:55）
  const searchGap = await page.evaluate(() => {
    const s = document.querySelector(`.room-slide[data-n="${curSection}"] .wb-searchrow`).getBoundingClientRect();
    const t = document.querySelector(`.room-slide[data-n="${curSection}"] .wb-tabs`).getBoundingClientRect();
    return s.top - t.bottom;
  });
  check(`検索バーは絞り込みの列のすぐ下に入る (すき間${searchGap.toFixed(1)}px)`, searchGap >= -1 && searchGap < 14);
  check('検索バーはホームボタンに重ならない', !wb.searchOverHome);

  // ================= ④⑤⑥⑦ 単語詳細 =================
  await page.evaluate(() => { const ids = LEVEL_SECTIONS[curLevel][curSection]; renderWordDetail(ids[0], 'room'); });
  await page.waitForTimeout(1000);
  await clearFx();
  const wd = await page.evaluate(() => {
    const cs = e => e ? getComputedStyle(e) : null;
    const center = document.getElementById('wd-center');
    const crate = center.querySelector('.wd-crate');
    const cbar = center.querySelector('.wd-cbar');
    const chips = [...cbar.querySelectorAll('.wd-cchip')];
    const dateCell = center.querySelector('.htab tbody tr td:first-child');
    const dirCell = center.querySelector('.htab tbody tr td:nth-child(2)');
    const box = center.querySelector('.wd-histbox');
    return {
      inHome: document.getElementById('s-home').classList.contains('on'),
      roomBar: !!document.querySelector('.wd-titlebar') || !!document.getElementById('wd-rmwrap'),
      // ホームのルームメニューは上に出たまま
      homeMenu: !!document.querySelector(`.room-slide[data-n="${curSection}"] .rmenu-clip .hv-roomno`),
      koSize: parseFloat(cs(center.querySelector('.wd-ko2')).fontSize),
      cardsWord: /獲得したカード/.test(center.innerHTML),
      chipN: chips.length,
      chipIcoBg: chips.length ? cs(chips[0].querySelector('.wd-cico')).backgroundColor : '',
      chipIcoBorder: chips.length ? cs(chips[0].querySelector('.wd-cico')).borderTopColor : '',
      rareSplit: chips.some(c => c.querySelector('.wd-cico.rn-SSR')),
      crateRadius: cs(crate).borderTopLeftRadius,
      crateBg: cs(crate).backgroundColor,
      crateOrder: [...crate.children].map(e => e.className.split(' ')[0]),
      gaugeH: Math.round(crate.querySelector('.wd-rg').getBoundingClientRect().height * 100) / 100,
      date: dateCell ? dateCell.textContent.trim() : '',
      flags: dirCell ? [...dirCell.querySelectorAll('img.dicon')].map(i => i.getAttribute('src')).join(',') : '',
      histOv: cs(box).overflowY,
      centerOv: cs(center).overflowY,
      centerScrolls: center.scrollHeight > center.clientHeight,
      more: !!center.querySelector('.wd-more'),
    };
  });
  check('単語詳細はホーム画面の真ん中に入る', wd.inHome && wd.homeMenu);
  check('「初級 ROOM xx」のバー／タイトルの行は廃止', !wd.roomBar);
  check(`韓国語は少し小さくなった (${wd.koSize}px)`, wd.koSize >= 30 && wd.koSize < 44);
  check('「獲得したカード」の日本語は無い', !wd.cardsWord);
  check(`カードは黄色い座布団＋白枠のアイコン (${wd.chipIcoBg} / ${wd.chipIcoBorder})`,
    wd.chipIcoBg === 'rgb(245, 197, 24)' && wd.chipIcoBorder === 'rgb(255, 255, 255)');
  check(`レア度ごとに札が分かれている (${wd.chipN}種)`, wd.chipN === 2 && wd.rareSplit);
  check(`PWRメーターはステータスバーと同じ黒のカプセル (${wd.crateRadius} / ${wd.crateBg})`,
    parseFloat(wd.crateRadius) >= 100 && wd.crateBg === 'rgba(0, 0, 0, 0.8)');
  check(`ラベル→ゲージ→数値の並び (${wd.crateOrder.join('/')})`,
    wd.crateOrder[0] === 'wd-rlab' && wd.crateOrder[1] === 'wd-rg' && wd.crateOrder[2] === 'wd-rval');
  check(`ゲージはステータスバーと同じ太さ (${wd.gaugeH}px)`, wd.gaugeH > 10);
  check(`学習履歴に西暦を出さない (${wd.date})`, /^\d{1,2}\/\d{1,2} \d{2}:\d{2}$/.test(wd.date));
  check(`日韓の国旗は動物アイコンと同じ絵ファイル (${wd.flags})`,
    wd.flags === 'emoji/1f1f0-1f1f7.svg,emoji/1f1ef-1f1f5.svg' || wd.flags === 'emoji/1f1ef-1f1f5.svg,emoji/1f1f0-1f1f7.svg');
  check(`真ん中の器ごと縦にスクロールする (${wd.centerOv})`, (wd.centerOv === 'auto' || wd.centerOv === 'scroll') && wd.histOv === 'visible');
  check('一番下に単語帳へ戻る導線がある', wd.more);

  // 一番下までスクロールしてさらに引くと単語帳へ戻る
  const back = await page.evaluate(async () => {
    const c = document.getElementById('wd-center');
    c.scrollTop = c.scrollHeight;
    const el = document.getElementById('hv-rooms');
    const y0 = 600;
    const t = (type, y) => el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true,
      touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: el, clientX: 200, clientY: y })] }));
    t('touchstart', y0);
    t('touchmove', y0 - 20);
    t('touchmove', y0 - 140);
    await new Promise(r => setTimeout(r, 60));
    const hint = document.getElementById('pull-hint').textContent;
    t('touchend', y0 - 140);
    await new Promise(r => setTimeout(r, 700));
    return { hint, wd: _wdId, list: _listMode, hasList: !!document.querySelector(`.room-slide[data-n="${curSection}"] .wb-grid`) };
  });
  check(`さらに引くと単語帳へ戻る案内が出る (${back.hint})`, /単語帳/.test(back.hint || ''));
  check('離すと単語帳の一覧に戻る', back.wd === null && back.list === true && back.hasList);

  // 右下のボタンでも一覧へ戻れる
  const btn = await page.evaluate(async () => {
    const ids = LEVEL_SECTIONS[curLevel][curSection];
    renderWordDetail(ids[1], 'room');
    await new Promise(r => setTimeout(r, 700));
    const b = document.querySelector('.home-side-btn.hsb-right');
    const txt = b.querySelector('.hsb-txt').textContent;
    b.click();
    await new Promise(r => setTimeout(r, 700));
    return { txt, wd: _wdId, list: _listMode };
  });
  check(`単語詳細の間はボタンが「単語帳」になる (${btn.txt})`, btn.txt === '単語帳');
  check('押すと一覧に戻る（ホームまでは戻らない）', btn.wd === null && btn.list === true);

  await page.evaluate(() => exitListMode());
  await page.waitForTimeout(600);

  // ================= ⑩ 設定＝今日の5問と同じデザイン =================
  const set = await page.evaluate(() => {
    openSettings();
    const cs = e => getComputedStyle(e);
    const card = document.querySelector('#settings-modal .set-card');
    const tiles = [...document.querySelectorAll('#settings-modal .cc-tile')];
    const boxes = tiles.map(t => Math.round(t.getBoundingClientRect().width) + 'x' + Math.round(t.getBoundingClientRect().height));
    const on = tiles.find(t => t.classList.contains('on'));
    const r = {
      cardBg: cs(card).backgroundColor,
      tileBg: cs(tiles[0]).backgroundColor, tileBorder: cs(tiles[0]).borderTopColor,
      onBorder: on ? cs(on).borderTopColor : '',
      labSize: parseFloat(cs(tiles[0].querySelector('.cc-lab')).fontSize),
      icoSize: parseFloat(cs(tiles[0].querySelector('.cc-ico')).fontSize),
      sameSize: new Set(boxes).size === 1, boxes: boxes[0],
      overflow: tiles.some(t => { const l = t.querySelector('.cc-lab'); return l.scrollWidth > l.clientWidth + 1; }),
      inScreen: card.getBoundingClientRect().bottom <= innerHeight + 1,
    };
    closeSettings(); return r;
  });
  check(`設定は白い座布団（今日の5問と同じ） (${set.cardBg})`, set.cardBg === 'rgb(255, 255, 255)');
  check(`マスは薄いグレーの枠 (${set.tileBg} / ${set.tileBorder})`,
    set.tileBg === 'rgb(242, 242, 242)' && set.tileBorder === 'rgb(227, 227, 227)');
  check(`オンのマスは黄色い枠 (${set.onBorder})`, set.onBorder === 'rgb(255, 196, 0)');
  check(`文字とアイコンは小さめ (ラベル${set.labSize}px / アイコン${set.icoSize}px)`, set.labSize <= 12 && set.icoSize <= 18);
  check(`ボタンの大きさが中身で変わらない (${set.boxes})`, set.sameSize);
  check('ラベルがはみ出していない（文字数を調節済み）', !set.overflow);
  check('設定が画面内に収まる', set.inScreen);

  // ================= ⑪ スペシャルモード＝プレビュー→カウントダウン =================
  const sp1 = await page.evaluate(() => {
    openSpecial();
    const cs = e => getComputedStyle(e);
    const card = document.querySelector('.sp-card');
    const tiles = [...document.querySelectorAll('.sp-tile')];
    return { cardBg: cs(card).backgroundColor, tileBg: cs(tiles[0]).backgroundColor,
             labSize: parseFloat(cs(tiles[0].querySelector('.sp-lab')).fontSize),
             prev: !!document.querySelector('.sp-prev'), n: tiles.length };
  });
  check(`スペシャルも白い座布団・同じマス (${sp1.cardBg} / ${sp1.tileBg})`,
    sp1.cardBg === 'rgb(255, 255, 255)' && sp1.tileBg === 'rgb(242, 242, 242)');
  check(`文字は小さめ (${sp1.labSize}px)`, sp1.labSize <= 13);
  check('はじめはプレビューを出さない', !sp1.prev);

  const sp2 = await page.evaluate(() => {
    document.querySelectorAll('.sp-tile')[1].click(); // 「発音マッチ」
    const p = document.querySelector('.sp-prev');
    return { prev: !!p, lab: p && p.querySelector('.spp-lab').textContent,
             how: p && p.querySelector('.spp-how').textContent,
             go: !!(p && p.querySelector('.spp-go')),
             sel: document.querySelectorAll('.sp-tile')[1].classList.contains('sel'),
             cdHidden: p && p.querySelector('.spp-cd').style.display === 'none',
             started: !!document.getElementById('spov') };
  });
  check(`1回目のタップでプレビューが出る (${sp2.lab})`, sp2.prev && sp2.lab === '発音マッチ' && sp2.sel);
  check(`遊び方が出る (${(sp2.how || '').slice(0, 14)}…)`, (sp2.how || '').length > 6);
  check('プレビューの時点ではまだ始まらない', !sp2.started && sp2.cdHidden && sp2.go);

  const sp3 = await page.evaluate(async () => {
    document.querySelectorAll('.sp-tile')[1].click(); // 2回目＝カウントダウン開始
    const box = document.getElementById('spp-cd'), n = document.getElementById('spp-cdn');
    const shown = box.style.display !== 'none', first = n.textContent;
    await new Promise(r => setTimeout(r, 900));
    const second = document.getElementById('spp-cdn') ? document.getElementById('spp-cdn').textContent : '';
    await new Promise(r => setTimeout(r, 1900));
    return { shown, first, second, started: !!document.getElementById('spov'),
             closed: !document.getElementById('special-modal').classList.contains('on') };
  });
  check(`2回目のタップでカウントダウンが出る (${sp3.first})`, sp3.shown && sp3.first === '3');
  check(`カウントダウンが進む (${sp3.first} → ${sp3.second})`, sp3.second === '2');
  check('数え終わるとゲームが始まる', sp3.started && sp3.closed);
  await page.evaluate(() => { spExitGame(); closeSpecial(); show('s-home'); });
  await page.waitForTimeout(500);

  // ================= ⑫ 出題画面 =================
  const rr = await page.evaluate(() => ({
    fast: rollCardRarity(0.9, true), mid: rollCardRarity(0.65, true),
    slow: rollCardRarity(0.4, true), late: rollCardRarity(0.1, true), wrong: rollCardRarity(0.9, false),
    stable: [0.9, 0.9, 0.9, 0.9, 0.9].map(p => rollCardRarity(p, true)),
  }));
  check(`速いほど高いレア度になる (${rr.fast}/${rr.mid}/${rr.slow}/${rr.late})`,
    rr.fast === 'SSR' && rr.mid === 'SR' && rr.slow === 'R' && rr.late === 'N');
  check('不正解はノーマルどまり', rr.wrong === 'N');
  check('同じスピードなら必ず同じレア度（運ではない）', new Set(rr.stable).size === 1);

  await page.evaluate(() => startTest(null, true));
  await page.waitForTimeout(900);
  const q = await page.evaluate(() => {
    const bar = document.getElementById('pbar'), ch = document.getElementById('rn-char');
    const slot = document.querySelector('.rn-slot');
    const cb = ch.getBoundingClientRect(), sb = slot.getBoundingClientRect(), bb = bar.getBoundingClientRect();
    return { barH: Math.round(bb.height), charH: Math.round(cb.height), slotH: Math.round(sb.height),
             sameRow: sb.bottom > cb.top && sb.top < cb.bottom };
  });
  check(`札とキャラは同じ1列 (帯${q.barH}px / 札${q.slotH}px・キャラ${q.charH}px)`,
    q.sameRow && q.barH < q.slotH + q.charH);

  // 速く正解＝レア度付きは1枚だけ／ゆっくり正解＝ノーマルは複数もらえる
  const earn = await page.evaluate(() => {
    const out = [];
    const run = (leftRatio) => {
      const q = state.questions[state.idx];
      const before = loadCards()[q.word.id] || 0;
      const limit = curLimit();
      qStart = performance.now() - (limit * (1 - leftRatio) * 1000);
      answered = false;
      submit('correct', q.correct);
      const r = state.results[state.results.length - 1];
      out.push({ rare: r.cardRarity, got: r.cardsEarned, stored: (loadCards()[q.word.id] || 0) - before });
      state.idx++;
    };
    run(0.9); // かなり速い＝SSR
    run(0.2); // ゆっくり＝N
    return out;
  });
  check(`レア度が付いたカードは1単語1枚 (${earn[0].rare} ${earn[0].got}枚)`,
    earn[0].rare === 'SSR' && earn[0].got === 1 && earn[0].stored === 1);
  check(`ノーマルは今までどおり複数もらえる (${earn[1].rare} ${earn[1].got}枚)`,
    earn[1].rare === 'N' && earn[1].got > 1 && earn[1].stored === earn[1].got);

  // ================= ⑬ 結果画面 =================
  await page.evaluate(() => {
    while (state.idx < state.questions.length) {
      const q = state.questions[state.idx];
      qStart = performance.now() - 500; answered = false;
      submit('correct', q.correct); state.idx++;
    }
    finishTest();
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelectorAll('.cardget,.gainpop,.lvup').forEach(o => o.remove()));
  const res = await page.evaluate(() => {
    const cs = e => getComputedStyle(e);
    const card = document.querySelector('#s-result .rc-card');
    const rareCard = document.querySelector('#s-result .rc-card.rare-SSR, #s-result .rc-card.rare-SR, #s-result .rc-card.rare-R');
    const badge = document.querySelector('#s-result .rc-rareb');
    const meters = document.querySelector('#s-result .res-meters');
    const row = document.querySelector('#s-result .res-scorerow');
    const score = row.querySelector('.res-score'), cnts = [...row.querySelectorAll('.res-cnt')];
    const rowBox = row.getBoundingClientRect(), sBox = score.getBoundingClientRect();
    return {
      oldBadge: !!document.querySelector('#s-result .rc-rare'),
      hasBadge: !!badge,
      badgeOpacity: badge ? parseFloat(cs(badge).opacity) : 1,
      badgeSize: badge ? parseFloat(cs(badge).fontSize) : 0,
      badgeRight: (() => { if (!badge) return false; const b = badge.getBoundingClientRect(), c = card.getBoundingClientRect();
        return (b.left + b.width / 2) > (c.left + c.width / 2) && b.top < c.top + c.height * 0.4; })(),
      badgeBehind: badge ? (parseInt(cs(badge).zIndex, 10) || 0) < (parseInt(cs(card.querySelector('.rc-imgw')).zIndex, 10) || 0) : false,
      // レア度なしのカードは白→クリーム。レア度が付くとカードの色が変わる
      plainBg: 'linear-gradient(160deg, rgb(255, 255, 255), rgb(255, 233, 194))',
      rareBg: rareCard ? cs(rareCard).backgroundImage : '',
      metersRadius: cs(meters).borderTopLeftRadius,
      scoreLeft: Math.round(sBox.left - rowBox.left),
      leftAligned: cnts.length === 2 && cnts[1].getBoundingClientRect().right < rowBox.right - 20,
      rowGap: Math.round(parseFloat(cs(row).columnGap)),
    };
  });
  check('レア度の左上ラベルは廃止', !res.oldBadge);
  check(`レア度は絵の裏に薄く大きく (${res.badgeSize}px / 不透明度${res.badgeOpacity})`,
    res.hasBadge && res.badgeSize >= 30 && res.badgeOpacity <= 0.35 && res.badgeBehind);
  check('レア度は右上に寄っている', res.badgeRight);
  check(`レア度でカードの色が変わる (${res.rareBg})`, !!res.rareBg && res.rareBg !== res.plainBg);
  check(`ステータスバーの黒座布団がカプセル (${res.metersRadius})`, parseFloat(res.metersRadius) >= 100);
  check(`点数の行は左寄せでマージンあり (左${res.scoreLeft}px)`, res.scoreLeft >= 8 && res.leftAligned);

  check(`コンソールエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) { console.log('FAILED: ' + failed.map(r => r.name).join(' / ')); process.exit(1); }
})();
