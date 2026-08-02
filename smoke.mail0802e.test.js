/* k-tango 2026-08-02 14:55 / 14:59 / 15:01 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0802e.test.js
 * 指示:
 *  14:55 単語帳ページも単語詳細ページも、左右のマージンを少なくせよ。ルームメニューの左右矢印も含めた横幅と同様に。
 *        また、今日の5問やミッションはホーム画面にのみ表示。
 *        検索バーやホーム画面ボタンの裏にも単語カードが来るように。
 *        検索バーを縦幅いまの半分にし、カード枚数や絞り込みのボタンの列のすぐ下に移行。
 *        単語詳細：単語カードバーの左右ボタンは、白三角（ルームメニューと同じ）横位置も同じ。
 *                  学習履歴は、表のラベルの1番左の日時が書いているところのラベルに収める。
 *                  単語カードの縦幅は固定。その右のパワーメーターとカードの枚数とグラフの表示幅が揃うように。
 *  14:59 ルーム背景色設定は、真っ黒から含めてバーで柔軟に変えれるように。
 *  15:01 ガチャの閉じるボタンいらない。バツがあるので。
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1.5 : tol);

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

  // ================= ① 単語帳の左右マージン＝ルームメニューの左右矢印を含めた横幅 =================
  await page.evaluate(() => { enterListMode(); });
  await page.waitForTimeout(700);
  await clearFx();

  const box = await page.evaluate(() => {
    const r = e => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
    const list = document.querySelector(`.room-slide[data-n="${curSection}"] .slide-list`);
    return {
      list: list ? r(list) : null,
      prev: r(document.getElementById('rm-prev')),
      next: r(document.getElementById('rm-next')),
      home: r(document.querySelector('.home-side-btn.hsb-right')),
      bar: r(document.getElementById('wb-searchbar')),
      tabs: r(document.querySelector(`.room-slide[data-n="${curSection}"] .wb-tabs`)),
      inputH: document.querySelector('#wb-searchbar input').getBoundingClientRect().height
    };
  });
  check(`単語帳の左端がルームメニューの左矢印と同じ (${box.list.l.toFixed(1)} / ${box.prev.l.toFixed(1)})`, near(box.list.l, box.prev.l));
  check(`単語帳の右端がルームメニューの右矢印と同じ (${box.list.r.toFixed(1)} / ${box.next.r.toFixed(1)})`, near(box.list.r, box.next.r));

  // ================= ② 検索バー・ホーム画面ボタンの裏にも単語カードが来る =================
  check(`一覧が検索バーの裏まで伸びている (list ${box.list.t.toFixed(0)}〜${box.list.b.toFixed(0)} / bar ${box.bar.t.toFixed(0)})`,
    box.list.t < box.bar.t && box.list.b > box.bar.b);
  check(`一覧がホーム画面ボタンの裏まで伸びている (home ${box.home.t.toFixed(0)}〜${box.home.b.toFixed(0)})`,
    box.list.b >= box.home.b - 1 && box.list.l < box.home.l && box.list.r > box.home.r);

  const behind = await page.evaluate(() => {
    const list = document.querySelector(`.room-slide[data-n="${curSection}"] .slide-list`);
    list.scrollTop = Math.round(list.scrollHeight / 2);      // カードが敷き詰まった状態にする
    const hit = el => {
      const b = el.getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return top ? (top.closest('.wb-card') ? 'card' : (top.id || top.className || top.tagName)) : null;
    };
    const cardUnder = (el) => {
      const b = el.getBoundingClientRect();
      return [...document.querySelectorAll('.wb-card')].some(c => {
        const cb = c.getBoundingClientRect();
        return cb.right > b.left && cb.left < b.right && cb.bottom > b.top && cb.top < b.bottom;
      });
    };
    return {
      barTop: hit(document.getElementById('wb-searchbar')),
      homeTop: hit(document.querySelector('.home-side-btn.hsb-right')),
      cardUnderBar: cardUnder(document.getElementById('wb-searchbar')),
      cardUnderHome: cardUnder(document.querySelector('.home-side-btn.hsb-right'))
    };
  });
  check('検索バーの位置に単語カードが重なっている', behind.cardUnderBar);
  check('ホーム画面ボタンの位置に単語カードが重なっている', behind.cardUnderHome);
  check(`検索バーはカードより手前（押せる） (${behind.barTop})`, String(behind.barTop).indexOf('card') < 0);
  check(`ホーム画面ボタンもカードより手前（押せる） (${behind.homeTop})`, String(behind.homeTop).indexOf('card') < 0);

  // ================= ③ 検索バーは縦幅が半分・絞り込みの列のすぐ下 =================
  check(`検索の入力欄が約半分の高さ (${box.inputH.toFixed(1)}px)`, box.inputH > 8 && box.inputH < 34);
  check(`検索バーがカード枚数・絞り込みの列のすぐ下 (tabs下端 ${box.tabs.b.toFixed(1)} / bar上端 ${box.bar.t.toFixed(1)})`,
    box.bar.t >= box.tabs.b - 1 && box.bar.t - box.tabs.b < 14);
  check('カード枚数と絞り込みボタンは同じ列にある',
    await page.evaluate(() => {
      const t = document.querySelector(`.room-slide[data-n="${curSection}"] .wb-tabs`);
      return !!t.querySelector('.wb-cnt-chip') && t.querySelectorAll('.wb-tab').length === 4;
    }));

  // ================= ④ 今日の5問・ミッションはホーム画面にのみ =================
  const fb = await page.evaluate(() => {
    const g = () => { const e = document.getElementById('home-fbtn'); const s = getComputedStyle(e); return { disp: s.display, vis: e.getBoundingClientRect().height > 0 }; };
    const inList = g();
    exitListMode();
    return { inList, atHome: g() };
  });
  await page.waitForTimeout(500);
  check(`単語帳ページでは今日の5問・ミッションを出さない (display:${fb.inList.disp})`, fb.inList.disp === 'none' && !fb.inList.vis);
  check(`ホーム画面では今までどおり出る (display:${fb.atHome.disp})`, fb.atHome.disp !== 'none');

  const fbWd = await page.evaluate(() => {
    const id = (LEVEL_SECTIONS[curLevel][curSection] || [])[0];
    renderWordDetail(id, 'room');
    return getComputedStyle(document.getElementById('home-fbtn')).display;
  });
  await page.waitForTimeout(700);
  await clearFx();
  check(`単語詳細ページでも出さない (display:${fbWd})`, fbWd === 'none');

  // ================= ⑤ 単語詳細：左右ボタンは白三角・横位置もルームメニューと同じ =================
  const nav = await page.evaluate(() => {
    const cs = e => { const s = getComputedStyle(e); const p = getComputedStyle(e, '::before'); const b = e.getBoundingClientRect();
      return { bg: s.backgroundColor, txt: e.textContent.trim(), l: b.left, r: b.right,
               bw: p.borderWidth, bc: p.borderColor, w: p.width, h: p.height }; };
    return {
      prev: cs(document.querySelector('.wd-nav.wd-prev')), next: cs(document.querySelector('.wd-nav.wd-next')),
      rprev: cs(document.getElementById('rm-prev')), rnext: cs(document.getElementById('rm-next')),
      center: document.getElementById('wd-center').getBoundingClientRect().left,
      centerR: document.getElementById('wd-center').getBoundingClientRect().right
    };
  });
  check(`単語詳細の左ボタンの横位置がルームメニューの左矢印と同じ (${nav.prev.l.toFixed(1)} / ${nav.rprev.l.toFixed(1)})`, near(nav.prev.l, nav.rprev.l));
  check(`単語詳細の右ボタンの横位置がルームメニューの右矢印と同じ (${nav.next.r.toFixed(1)} / ${nav.rnext.r.toFixed(1)})`, near(nav.next.r, nav.rnext.r));
  check(`左ボタンの三角がルームメニューと同じ形 (${nav.prev.bw} / ${nav.rprev.bw})`, nav.prev.bw === nav.rprev.bw);
  check(`右ボタンの三角がルームメニューと同じ形 (${nav.next.bw} / ${nav.rnext.bw})`, nav.next.bw === nav.rnext.bw);
  check(`三角は白 (${nav.prev.bc})`, /255,\s*255,\s*255/.test(nav.prev.bc) && /255,\s*255,\s*255/.test(nav.next.bc));
  check(`ボタンの座布団（黒い背景）は無い (${nav.prev.bg})`, /rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(nav.prev.bg));
  check('‹ › の文字は使っていない', nav.prev.txt === '' && nav.next.txt === '');
  check(`単語詳細の器も左右いっぱい (${nav.center.toFixed(1)}〜${nav.centerR.toFixed(1)})`,
    near(nav.center, box.list.l) && near(nav.centerR, box.list.r));

  // ================= ⑥ 学習履歴は表のいちばん左のラベルに収める =================
  const hist = await page.evaluate(() => {
    const sec = document.querySelector('#wd-center .tdetail-sec');
    const th = document.querySelector('#wd-center .htab thead th');
    return {
      outerH: !!sec.querySelector(':scope > .h'),
      thTxt: th.textContent.trim(),
      cls: th.className,
      bodyHasDate: (document.querySelector('#wd-center .htab tbody td') || {}).className,
      anywhere: [...document.querySelectorAll('#wd-center .tdetail-sec .h')].map(e => e.textContent.trim())
    };
  });
  check(`「学習履歴」が表のいちばん左のラベルに入っている (${hist.thTxt})`, hist.thTxt === '学習履歴');
  check(`表の外の見出しは廃止 (${JSON.stringify(hist.anywhere)})`, !hist.outerH && hist.anywhere.indexOf('学習履歴') < 0);

  // ================= ⑦ 単語カードの縦幅固定・右列と高さが揃う =================
  const main = await page.evaluate(() => {
    const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, h: b.height }; };
    return { card: r('#wd-center .wd-bigcard'), side: r('#wd-center .wd-side'),
             pwr: r('#wd-center .wd-crate'), cbar: r('#wd-center .wd-cbar'), graph: r('#wd-center .wd-graph'),
             cardCss: getComputedStyle(document.querySelector('#wd-center .wd-bigcard')).height,
             sideCss: getComputedStyle(document.querySelector('#wd-center .wd-side')).height };
  });
  // ホーム画面ごと縮小表示しているので、実寸(rect)ではなくCSS上の高さで「固定」を見る
  check(`単語カードの縦幅が固定 (${main.cardCss})`, /^\d+(\.\d+)?px$/.test(main.cardCss) && parseFloat(main.cardCss) > 100);
  check(`右列の高さもカードと同じ (${main.sideCss} / ${main.cardCss})`, main.sideCss === main.cardCss);
  check(`右列の上端がカードの上端と揃う (${main.side.t.toFixed(1)} / ${main.card.t.toFixed(1)})`, near(main.side.t, main.card.t, 2));
  check(`右列の下端がカードの下端と揃う (${main.side.b.toFixed(1)} / ${main.card.b.toFixed(1)})`, near(main.side.b, main.card.b, 2));
  check('右列はPWR・カードの枚数・グラフの3つ', !!main.pwr && !!main.cbar && !!main.graph);
  check(`グラフの下端も揃う (${main.graph.b.toFixed(1)})`, near(main.graph.b, main.card.b, 2));
  check('PWR→カードの枚数→グラフの順に縦に並ぶ', main.pwr.b <= main.cbar.t + 1 && main.cbar.b <= main.graph.t + 1);

  // 別の単語に切りかえてもカードの縦幅は変わらない（＝中身によらず固定）
  const heights = await page.evaluate(() => {
    const ids = sectionIds().slice(0, 4), out = [];
    ids.forEach(id => { renderWordDetail(id, 'room'); out.push(document.querySelector('#wd-center .wd-bigcard').getBoundingClientRect().height); });
    return out;
  });
  await page.waitForTimeout(400);
  check(`単語を変えても縦幅が同じ (${heights.map(h => h.toFixed(0)).join('/')})`, heights.every(h => near(h, heights[0], 1)));

  // ================= ⑧ ルーム背景色はバーで真っ黒まで（メール指示 14:59） =================
  const tone = await page.evaluate(() => {
    const base = roomBg(1), list = [];
    [0, 25, 50, 75, 100].forEach(v => { setRoomTone(v); list.push({ v, c: roomBg(1), saved: loadSettings().roomToneV2 }); });
    setRoomTone(0);
    openSettings();
    const r = document.getElementById('tone-range');
    const ui = { has: !!r, type: r && r.type, min: r && r.min, max: r && r.max, step: r && r.step,
                 val: r && r.value, lab: (document.getElementById('tone-lab') || {}).textContent,
                 sw: !!document.getElementById('tone-sw'), oldBtns: document.querySelectorAll('#settings-modal .tone-b').length };
    closeSettings();
    return { base, list, ui };
  });
  const lum = h => { const n = parseInt(h.slice(1), 16); return ((n >> 16) & 255) * .299 + ((n >> 8) & 255) * .587 + (n & 255) * .114; };
  check(`設定にバー（スライダー）がある (${tone.ui.type} ${tone.ui.min}〜${tone.ui.max} step ${tone.ui.step})`,
    tone.ui.has && tone.ui.type === 'range' && tone.ui.min === '0' && tone.ui.max === '100' && tone.ui.step === '1');
  check('4段階の選択ボタンは廃止', tone.ui.oldBtns === 0);
  check('いまの色の見本と目安の表示がある', tone.ui.sw && !!tone.ui.lab);
  check('0はいまの色のまま', tone.list[0].c === tone.base);
  check(`バーを動かすほど濃くなる (${tone.list.map(x => x.c).join(' ')})`,
    tone.list.every((x, i) => i === 0 || lum(x.c) < lum(tone.list[i - 1].c)));
  check(`いちばん動かすと真っ黒 (${tone.list[4].c})`, tone.list[4].c === '#000000');
  check('選んだ濃さが設定に保存される', tone.list[3].saved === 75);

  const toneLive = await page.evaluate(() => {
    openSettings();
    const r = document.getElementById('tone-range');
    r.value = '100'; r.dispatchEvent(new Event('input', { bubbles: true }));
    const after = { bg: document.getElementById('homewrap').style.background, lab: document.getElementById('tone-lab').textContent,
                    stillOpen: document.getElementById('settings-modal').classList.contains('on'),
                    val: document.getElementById('tone-range').value };
    r.value = '0'; r.dispatchEvent(new Event('input', { bubbles: true }));
    closeSettings();
    return after;
  });
  check(`真っ黒にすると背景も真っ黒になる (${toneLive.bg})`, /rgb\(0,\s*0,\s*0\)|#000000/.test(toneLive.bg));
  check(`真っ黒の目安が出る (${toneLive.lab})`, toneLive.lab === '真っ黒');
  check('バーを動かしても設定画面が閉じたりつまみが戻ったりしない', toneLive.stillOpen && toneLive.val === '100');

  const toneLegacy = await page.evaluate(() => {
    const st = loadSettings(); delete st.roomToneV2; st.roomTone = 3; saveSettings(st);
    const v = roomTone();
    const st2 = loadSettings(); delete st2.roomTone; st2.roomToneV2 = 0; saveSettings(st2);
    return v;
  });
  check(`以前の4段階の設定も引き継げる (旧3 → 濃さ${toneLegacy})`, toneLegacy > 0 && toneLegacy <= 60);

  // ================= ⑨ ガチャの「とじる」ボタンは廃止（メール指示 15:01） =================
  const gacha = await page.evaluate(() => {
    const g = () => {
      const m = document.getElementById('gacha-modal');
      const btns = [...m.querySelectorAll('.pm-btn')].map(b => b.textContent.trim());
      return { btns, close: m.querySelectorAll('.pm-close').length, closeTxt: (m.querySelector('.pm-close') || {}).textContent };
    };
    openGacha();
    const idle0 = g();
    const o = gachaState(); o.q.push({ xp: 10, rank: 'B' }); saveGacha(o);
    gachaRenderIdle();
    const idle1 = g();
    gachaRenderResult({ k: 'xp', lab: 'XP', ico: '✨', col: '#FFC400', msg: 'やったね' }, 50, { xp: 10, rank: 'B' });
    const res = g();
    closeGacha();
    return { idle0, idle1, res, closedByX: !document.getElementById('gacha-modal').classList.contains('on') };
  });
  check(`ガチャに「とじる」ボタンが無い（コインなし: ${JSON.stringify(gacha.idle0.btns)}）`, gacha.idle0.btns.indexOf('とじる') < 0);
  check(`コインがあるときも「とじる」は無い (${JSON.stringify(gacha.idle1.btns)})`,
    gacha.idle1.btns.indexOf('とじる') < 0 && gacha.idle1.btns.indexOf('まわす') >= 0);
  check(`ガチャ結果にも「とじる」は無い (${JSON.stringify(gacha.res.btns)})`, gacha.res.btns.indexOf('とじる') < 0);
  check(`右上の × は残っている (${gacha.idle0.closeTxt})`, gacha.idle0.close === 1 && gacha.res.close === 1);
  check('× で閉じられる', gacha.closedByX);

  check(`JSエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));

  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length}/${results.length} PASS`);
  if (ng.length) { console.log('FAILED:\n' + ng.map(r => ' - ' + r.name).join('\n')); process.exit(1); }
})();
