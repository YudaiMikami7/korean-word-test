/* k-tango 2026-08-02 01:01 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0802b.test.js
 * 検証:
 *  ① すごろく：1周目と2周目の間は薄い線／出発点(1周目の手前)には線を引かない
 *  ② すごろく：マスの番号が「（ROOMナンバー）-（ステップナンバー）」になっている
 *  ③ 出題画面：白い地面の線(.rn-ground)は無い
 *  ④ 出題画面：タイムメータに白い枠線が付き、キャラはその上を歩く
 *  ⑤ 出題画面：札とキャラは同じ列。獲得アニメは横に飛び、最後の問題までキャラは帯の中（見切れない）
 *  ⑥ 落ちてくるのは丸い玉ではなく単語カード
 *  ⑦ 単語詳細：ホームの真ん中だけが差し替わり、その器ごと縦スクロールする
 *  ⑧ 単語詳細：音声ボタンはカードの中・絵の右上
 *  ⑨ 単語詳細：前後へ動くボタンは単語カードの並びの最左右／カードは横幅固定／番号あり／未獲得はシルエット
 *  ⑩ 単語詳細・単語帳：黒帯は廃止
 *  ⑪ 単語帳：ホーム画面のまま真ん中だけが一覧に変わる（左右のアイコンと最近学んだ単語は出さず、その場所に検索バー）
 *  ⑫ 単語帳：右下の「単語帳」ボタンが家の絵の「ホーム」ボタンに入れ替わり、押すとホームに戻る
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond, note) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${note ? ' (' + note + ')' : ''}`); }
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

  // 2周目まで進んだ状態＋履歴とカードを仕込む
  await page.evaluate(() => {
    const ids = (LEVEL_SECTIONS[curLevel][curSection] || []).slice(0, 6);
    const cards = {}; ids.forEach(id => cards[id] = 3);
    _lsSetJSON(LS_CARDS, cards);
    const hist = [];
    ids.forEach(id => { for (let k = 0; k < 12; k++) hist.push({ wordId: id, testId: 't' + k, isCorrect: true, answerStatus: 'correct', questionType: 'choice', direction: 'kr_to_jp', responseTimeSec: 2, answeredAt: new Date(Date.now() - k * 86400000).toISOString(), score: 8 }); });
    _lsSetJSON(LS_HIST, hist); _histIdxCache = null;
    const b = loadBoard(); b[boardKey(curLevel, curSection)] = { cleared: 14, tiles: {} }; _lsSetJSON(LS_BOARD, b);
    buildRoomSlides(); buildTodayBand();
  });
  await page.waitForTimeout(800);
  await clearFx();

  // ================= ①② すごろくの周の区切りとマス番号 =================
  const sg = await page.evaluate(() => {
    const sl = document.querySelector(`.room-slide[data-n="${curSection}"]`);
    const laps = [...sl.querySelectorAll('.sg-lap')].map(e => ({ top: parseFloat(e.style.top), h: getComputedStyle(e).height, bg: getComputedStyle(e).backgroundColor, txt: e.textContent.trim() }));
    const nums = [...sl.querySelectorAll('.sg-num')].map(e => e.textContent);
    const L = boardLapSize(curLevel, curSection);
    // 2周目の1マス目(=通し13マス目)のy座標。線はそのすぐ下に来るはず
    const t13 = sl.querySelector('.sg-tile[aria-label="マス' + (L + 1) + '"]');
    return { laps, nums, L, room: curSection, y13: t13 ? parseFloat(t13.dataset.y) : null, vis: sl.querySelectorAll('.sg-tile').length };
  });
  check(`周の区切りは1本だけ＝1周目の手前には引かない (${sg.laps.length}本 / 全${sg.vis}マス)`, sg.laps.length === 1);
  check(`区切りは薄い線（高さ${sg.laps[0] && sg.laps[0].h}・文字なし）`, sg.laps[0] && sg.laps[0].h === '1px' && sg.laps[0].txt === '');
  check(`区切り線は半透明の白 (${sg.laps[0] && sg.laps[0].bg})`, sg.laps[0] && /rgba\(255, 255, 255, 0\.[0-9]+\)/.test(sg.laps[0].bg));
  check(`区切り線は2周目の1マス目のすぐ下 (線${sg.laps[0] && sg.laps[0].top} / マス${sg.y13})`, sg.laps[0] && sg.y13 != null && sg.laps[0].top > sg.y13 && sg.laps[0].top - sg.y13 < 178);
  // マス番号は「ROOMナンバー-ステップナンバー」に変更（メール指示 2026-08-02）
  check(`マス番号が「ROOM-ステップ」形式 (先頭3つ=${sg.nums.slice(0, 3).join(',')})`,
    sg.nums.slice(0, 3).join(',') === `${sg.room}-1,${sg.room}-2,${sg.room}-3`);
  check(`2周目の1マス目は通し番号で続く (${sg.nums[sg.L]})`, sg.nums[sg.L] === `${sg.room}-${sg.L + 1}`);
  check(`1周目の最後は「${sg.room}-${sg.L}」 (${sg.nums[sg.L - 1]})`, sg.nums[sg.L - 1] === `${sg.room}-${sg.L}`);
  check(`番号は全マスぶんある (${sg.nums.length}/${sg.vis})`, sg.nums.length === sg.vis);

  // ================= ⑪⑫ 単語帳＝ホームの真ん中だけ差し替え =================
  await page.evaluate(() => enterListMode());
  await page.waitForTimeout(800);
  await clearFx();
  const wb = await page.evaluate(() => {
    const cs = e => e ? getComputedStyle(e) : null;
    const hw = document.getElementById('homewrap');
    const btn = document.querySelector('.home-side-btn.hsb-right');
    const list = document.querySelector(`.room-slide[data-n="${curSection}"] .slide-list`);
    // 左右のアイコン列は廃止（メール指示 2026-08-02 19:24）。代わりに、その場所に置いたプレゼント・ガチャの丸が単語帳では出ないことを見る
    const rail = document.querySelector('.sg-gift');
    const band = document.getElementById('today-band');
    const menu = document.querySelector(`.room-slide[data-n="${curSection}"] .rmenu-bg`);
    const listBox = list.getBoundingClientRect();
    const sgBox = { left: 24, top: 104, width: 554, height: 636 }; // .sg-wrap と同じ枠
    const lcs = cs(list);
    return {
      listMode: _listMode,
      lift: hw.style.getPropertyValue('--lift'), hiderail: hw.classList.contains('hiderail'),
      statusPanel: cs(document.querySelector('.status-panel')).opacity,
      headTransform: cs(document.querySelector('.home-head')).transform,
      menuShown: !!menu && cs(menu).opacity !== '0',
      railShown: !!document.querySelector('.reward-rail') || !!(rail && cs(rail).opacity !== '0' && rail.getBoundingClientRect().width > 0),
      bandShown: band.style.display !== 'none' && cs(band).opacity !== '0',
      pagerBlocked: (() => { showRoomPager(); return !document.getElementById('homewrap').classList.contains('pager-on'); })(),
      listLeft: lcs.left, listTop: lcs.top, listW: lcs.width, listH: lcs.height, listOpacity: lcs.opacity,
      sgBox, listVisible: listBox.width > 0 && listBox.height > 0,
      blackBand: !!document.querySelector('.slide-list .zk-sum'),
      // 単語数(N/M)の行は廃止。カード枚数は絞り込みの列の「全部」の左（メール指示 2026-08-02）
      oldSum: !!document.querySelector('.slide-list .wb-sum'),
      chipText: (document.querySelector('.slide-list .wb-tabs .wb-cnt-chip') || {}).textContent,
      chipFirst: (() => { const t = document.querySelector('.slide-list .wb-tabs'); return !!t && t.firstElementChild.classList.contains('wb-cnt-chip') && t.children[1].classList.contains('wb-tab'); })(),
      // 検索欄は浮かせず一覧の中に入れた（メール指示 2026-08-02 16:32）
      searchBox: (() => { const s = document.querySelector('.slide-list .wb-searchrow'), b = document.getElementById('today-band');
        if (!s || !b) return null; const sr = s.getBoundingClientRect(), br = b.getBoundingClientRect();
        return { inBand: sr.top >= br.top - 2 && sr.bottom <= br.bottom + 2, w: Math.round(sr.width), bw: Math.round(br.width) }; })(),
      searchOverBtn: (() => { const s = document.querySelector('.slide-list .wb-searchrow'), b = document.querySelector('.home-side-btn.hsb-right');
        if (!s || !b) return true; const sr = s.getBoundingClientRect(), br = b.getBoundingClientRect();
        return sr.left < br.right && sr.right > br.left && sr.top < br.bottom && sr.bottom > br.top; })(),
      btnImg: btn.querySelector('img').getAttribute('src'), btnTxt: btn.querySelector('.hsb-txt').textContent,
      btnLabel: btn.getAttribute('aria-label'), btnShown: cs(btn).opacity !== '0',
      cardCount: document.querySelectorAll('.slide-list .wb-card').length,
    };
  });
  check('単語帳ページでROOMメニューを持ち上げない (--lift=' + (wb.lift || '未設定') + ')', !wb.lift || wb.lift === '0px');
  check('hiderail は使わない', !wb.hiderail);
  check(`ステータスバーはホームと同じように出ている (opacity=${wb.statusPanel})`, wb.statusPanel === '1');
  check(`ヘッダーは退場していない (${wb.headTransform})`, wb.headTransform === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(wb.headTransform));
  check('ルームメニューバーが出ている', wb.menuShown);
  // 単語帳ページでは左右のアイコンと「最近学んだ単語」は出さず、その場所に検索バーを置く（メール指示 2026-08-02）
  check('左右のアイコン（リール）・プレゼントの丸は出さない', !wb.railShown);
  check('「最近学んだ単語」の帯も出さない', !wb.bandShown);
  // 検索バーは「最近学んだ単語」の帯のあった場所ではなく、カード枚数・絞り込みの列のすぐ下へ移した（メール指示 2026-08-02 14:55）
  const barPos = await page.evaluate(() => {
    const s = document.querySelector(`.room-slide[data-n="${curSection}"] .wb-searchrow`).getBoundingClientRect();
    const t = document.querySelector(`.room-slide[data-n="${curSection}"] .wb-tabs`).getBoundingClientRect();
    return { gap: s.top - t.bottom, h: document.querySelector(`.room-slide[data-n="${curSection}"] .wb-qin`).getBoundingClientRect().height };
  });
  check(`検索バーが絞り込みの列のすぐ下に入る (すき間${barPos.gap.toFixed(1)}px)`, barPos.gap >= -1 && barPos.gap < 14);
  check(`検索の入力欄は従来の半分の高さ (${barPos.h.toFixed(1)}px)`, barPos.h > 8 && barPos.h < 34);
  check('検索バーが右下のホームボタンに重ならない', !wb.searchOverBtn);
  check('ページャーは単語帳ページでも出せる', !wb.pagerBlocked);
  // 一覧の枠は、左右をルームメニューの矢印まで広げ、下は検索バー・ホームボタンの裏まで伸ばした（メール指示 2026-08-02 14:55）
  check(`一覧はすごろくの枠より左右・下に広い (${wb.listLeft}/${wb.listTop} ${wb.listW}x${wb.listH})`,
    wb.listTop === wb.sgBox.top + 'px'
    && parseFloat(wb.listLeft) < wb.sgBox.left && parseFloat(wb.listW) > wb.sgBox.width
    && parseFloat(wb.listH) > wb.sgBox.height);
  check(`一覧が見えている (opacity=${wb.listOpacity})`, wb.listVisible && wb.listOpacity === '1');
  check(`単語カードが並んでいる (${wb.cardCount}枚)`, wb.cardCount > 0);
  check('単語帳の黒帯は廃止', !wb.blackBand);
  check(`単語数(N/M)の行は廃止し、カード枚数を絞り込みの列の左へ (${(wb.chipText || '').trim()})`,
    !wb.oldSum && /カード/.test(wb.chipText || '') && wb.chipFirst);
  check(`単語帳ボタンが家の絵に変わる (${wb.btnImg})`, wb.btnImg === 'images-thumb/1111.webp');
  check(`ボタンの文字が「ホーム」 (${wb.btnTxt}/${wb.btnLabel})`, wb.btnTxt === 'ホーム' && wb.btnLabel === 'ホーム');
  check('ボタンは単語帳ページでも押せる状態で出ている', wb.btnShown);

  // カードがアイコンの下に隠れていないこと
  // アイコンを出さなくなったぶん、一覧は左右いっぱいまで使う（メール指示 2026-08-02）
  const overlap = await page.evaluate(() => {
    const list = document.querySelector(`.room-slide[data-n="${curSection}"] .slide-list`);
    const pad = parseFloat(getComputedStyle(list).paddingLeft);
    return pad > 8 ? 1 : 0;
  });
  check('一覧は左右いっぱいまで使う（アイコン用の余白を空けない）', overlap === 0);

  // ボタンを押すとホームへ戻り、真ん中がすごろくに戻る
  await page.evaluate(() => document.querySelector('.home-side-btn.hsb-right').click());
  await page.waitForTimeout(800);
  const back = await page.evaluate(() => ({
    listMode: _listMode,
    sg: !!document.querySelector(`.room-slide[data-n="${curSection}"] .sg-wrap`),
    list: !!document.querySelector(`.room-slide[data-n="${curSection}"] .slide-list`),
    btnImg: document.querySelector('.home-side-btn.hsb-right img').getAttribute('src'),
    btnTxt: document.querySelector('.home-side-btn.hsb-right .hsb-txt').textContent,
  }));
  check('ホームボタンでホームに戻る', !back.listMode && back.sg && !back.list);
  check(`戻ると「単語帳」ボタンに戻る (${back.btnImg}/${back.btnTxt})`, back.btnImg === 'images-thumb/1290.webp' && back.btnTxt === '単語帳');

  // ================= ⑦⑧⑨⑩ 単語詳細 =================
  await page.evaluate(() => { const ids = LEVEL_SECTIONS[curLevel][curSection]; renderWordDetail(ids[2], 'room'); });
  await page.waitForTimeout(900);
  const wd = await page.evaluate(() => {
    const slide = document.getElementById('wd-center'), inn = document.querySelector('#wd-center .wd-in'), box = document.querySelector('.wd-histbox');
    const row = document.querySelector('.wd-pagerow'), dots = [...document.querySelectorAll('.rp-pager .wd-dot')];
    const spk = document.querySelector('.wd-cimg .wd-spk'), img = document.querySelector('.wd-cimg .wd-img2');
    const cs = e => getComputedStyle(e);
    const sBox = spk ? spk.getBoundingClientRect() : null, iBox = document.querySelector('.wd-cimg').getBoundingClientRect();
    const cards = loadCards();
    const ids = LEVEL_SECTIONS[curLevel][curSection];
    return {
      slideOv: cs(slide).overflowY, slideOverflows: slide.scrollHeight > slide.clientHeight + 1,
      innOverflows: inn.scrollHeight > inn.clientHeight + 1,
      histScrolls: box.scrollHeight > box.clientHeight + 1, histOv: cs(box).overflowY,
      hasMore: !!slide.querySelector('.wd-more'),
      spkInCard: !!spk && !!spk.closest('.wd-cimg'),
      spkTopRight: sBox && sBox.right > iBox.left + iBox.width * 0.6 && sBox.top < iBox.top + iBox.height * 0.4,
      spkInCbar: !!document.querySelector('.wd-cbar .wd-spk'),
      first: row.firstElementChild.classList.contains('wd-prev'), last: row.lastElementChild.classList.contains('wd-next'),
      navAbs: cs(document.querySelector('.wd-prev')).position,
      widths: [...new Set(dots.filter(d => !d.classList.contains('cur')).map(d => Math.round(d.getBoundingClientRect().width)))],
      nos: dots.slice(0, 3).map(d => (d.querySelector('.wd-dno') || {}).textContent),
      bigSil: img.classList.contains('sil'), bigOwned: (cards[ids[2]] || 0) > 0,
      unownedSil: dots.map((d, i) => ({ owned: (cards[ids[i]] || 0) > 0, sil: !!(d.querySelector('.wd-dimg') && d.querySelector('.wd-dimg').classList.contains('sil')) })),
      blackBand: !!document.querySelector('#wd-center .zk-sum'),
      roomBar: !!document.querySelector('.wd-titlebar') || !!document.getElementById('wd-rmwrap'),
    };
  });
  // 真ん中の器ごと縦スクロールし、一番下まで見てさらに引くと単語帳へ戻る（メール指示 2026-08-02）
  check(`単語詳細は真ん中の器ごと縦スクロールする (overflow=${wd.slideOv})`, wd.slideOv === 'auto' || wd.slideOv === 'scroll');
  check(`学習履歴は表の中で別スクロールしない (overflow=${wd.histOv})`, wd.histOv === 'visible' && !wd.histScrolls);
  check('音声ボタンはカードの中・絵のところにある', wd.spkInCard && !wd.spkInCbar);
  check('音声ボタンは絵の右上', wd.spkTopRight);
  check('前後ボタンは単語カードの並びの最左右', wd.first && wd.last && wd.navAbs !== 'absolute');
  check(`並びのカードは横幅固定 (${wd.widths.join(',')}px)`, wd.widths.length === 1 && wd.widths[0] > 0);
  check(`並びのカードに番号が付く (${wd.nos.join(',')})`, wd.nos.join(',') === '001,002,003');
  check(`獲得済みの大きいカードはシルエットにしない (${wd.bigOwned ? '獲得済み' : '未獲得'})`, wd.bigOwned && !wd.bigSil);
  check('未獲得のカードは詳細ページでもシルエット', wd.unownedSil.every(d => d.sil === !d.owned) && wd.unownedSil.some(d => d.sil));
  check('単語詳細の黒帯・ROOMメニューのバーは廃止', !wd.blackBand && !wd.roomBar);
  check('一番下に単語帳へ戻る導線がある', wd.hasMore);

  // ================= ③④⑤⑥ 出題画面 =================
  await page.evaluate(() => { closeWordDetail(); exitListMode(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => startTest(null, true));
  await page.waitForTimeout(900);
  const q0 = await page.evaluate(() => {
    const bar = document.getElementById('pbar'), ch = document.getElementById('rn-char'), tb = document.querySelector('.tbar');
    const rail = document.getElementById('rn-rail');
    const cb = ch.getBoundingClientRect(), tbb = tb.getBoundingClientRect(), bb = bar.getBoundingClientRect();
    const slots = [...rail.querySelectorAll('.rn-slot')].map(s => s.getBoundingClientRect());
    const cs = getComputedStyle(tb);
    return {
      ground: !!document.querySelector('.rn-ground'),
      borderW: cs.borderTopWidth, borderC: cs.borderTopColor,
      charBottom: cb.bottom, tbarTop: tbb.top,
      // 札の段（上）とキャラの段（下）が縦にかぶっていない
      slotBottomMax: Math.max(...slots.map(s => s.bottom)), charTop: cb.top,
      slotsInBar: slots.every(s => s.left >= bb.left - 1 && s.right <= bb.right + 1),
      n: slots.length, gap: _rnGap,
    };
  });
  check('白い地面の線は無い', !q0.ground);
  check(`タイムメータに白い枠線 (${q0.borderW} ${q0.borderC})`, parseFloat(q0.borderW) >= 1 && q0.borderC === 'rgb(255, 255, 255)');
  check(`キャラはタイムメータの上に立つ (足${Math.round(q0.charBottom)} / メータ上端${Math.round(q0.tbarTop)})`, Math.abs(q0.charBottom - q0.tbarTop) <= 2);
  // 札の列とキャラは同じ1列に置く（メール指示 2026-08-02）
  check(`札とキャラが同じ列に並ぶ (札の下端${Math.round(q0.slotBottomMax)} / キャラの上端${Math.round(q0.charTop)})`, q0.slotBottomMax > q0.charTop);
  check(`札は帯の中に収まっている (${q0.n}枚)`, q0.slotsInBar && q0.n > 0);

  // 最後の問題までキャラが帯からはみ出さない＋獲得アニメは同じ列を横に飛ぶ
  const walk = [];
  for (let i = 0; i < q0.n; i++) {
    const st = await page.evaluate(() => {
      const slot = document.querySelector('#rn-rail .rn-slot[data-i="' + _runIdx + '"]');
      runnerStep(true, 'N');
      const ch = document.getElementById('rn-char'), bar = document.getElementById('pbar');
      const cb = ch.getBoundingClientRect(), bb = bar.getBoundingClientRect();
      return {
        idx: _runIdx, inBar: cb.left >= bb.left - 1 && cb.right <= bb.right + 1, visible: cb.width > 0,
        flyX: slot ? slot.style.getPropertyValue('--fly') : '', flyY: slot ? slot.style.getPropertyValue('--flyY') : '',
        got: slot ? slot.classList.contains('got') : false,
      };
    });
    walk.push(st);
    await page.waitForTimeout(80);
  }
  check(`最後の問題までキャラは帯の中に居る（見切れない）（${walk.length}問ぶん）`, walk.every(w => w.inBar && w.visible));
  check('どの問でも札は獲得アニメに入る', walk.every(w => w.got));
  check(`獲得アニメは同じ列を横に飛ぶ (例 x=${walk[0].flyX} y=${walk[0].flyY})`,
    walk.every(w => /px$/.test(w.flyX) && /px$/.test(w.flyY) && Math.abs(parseFloat(w.flyY)) <= 4));

  // 狭い画面でもキャラが帯の中に収まる（回転・機種差の再現）
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(500);
  const narrow = await page.evaluate(() => {
    const ch = document.getElementById('rn-char'), bar = document.getElementById('pbar'), rail = document.getElementById('rn-rail');
    const cb = ch.getBoundingClientRect(), bb = bar.getBoundingClientRect();
    const slots = [...rail.querySelectorAll('.rn-slot')].map(s => s.getBoundingClientRect());
    return { inBar: cb.left >= bb.left - 1 && cb.right <= bb.right + 1, slotsInBar: slots.every(s => s.right <= bb.right + 1), gap: _rnGap };
  });
  check(`画面幅が変わっても札とキャラが帯の中（幅320px・間隔${Math.round(narrow.gap)}px）`, narrow.inBar && narrow.slotsInBar);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);

  // 落ちてくるのはカード
  const drop = await page.evaluate(() => {
    const w = BEGINNER_WORDS.find(x => typeof WORD_IMG !== 'undefined' && WORD_IMG[x.ko]);
    spawnWordDrop(w, 0.8);
    const el = document.querySelector('#q-rain .qr-card');
    if (!el) return { none: true, ball: !!document.querySelector('#q-rain .qr-ball') };
    const cs = getComputedStyle(el);
    return { none: false, radius: cs.borderRadius, bg: cs.backgroundImage, border: cs.borderTopWidth, hasImg: !!el.querySelector('img'), w: el.style.width, h: el.style.height };
  });
  check('降ってくるのは丸い玉ではなくカード(.qr-card)', !drop.none && !drop.ball);
  check(`カードは角丸の四角（真円ではない）(${drop.radius} / ${drop.w}x${drop.h})`, !drop.none && !/50%/.test(drop.radius));
  check(`カードの面は単語カードと同じグラデーション`, !drop.none && /linear-gradient/.test(drop.bg));
  check(`カードにROOM色の枠線 (${drop.border})`, !drop.none && parseFloat(drop.border) >= 1);
  check('カードに単語の絵が入る', !drop.none && drop.hasImg);

  // ================= まとめ =================
  check(`JSエラーなし (${errors.length}件)`, errors.length === 0, errors.slice(0, 3).join(' / '));
  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length}/${results.length} PASS`);
  if (ng.length) { console.log('FAILED:'); ng.forEach(r => console.log(' - ' + r.name)); process.exit(1); }
})();
