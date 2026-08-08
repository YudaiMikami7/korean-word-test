/* k-tango 2026-08-02 16:32 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0802f.test.js
 * 指示:
 *  ・「単語を探す」はフロートでなくす
 *  ・単語詳細ページでは単語検索は不要
 *  ・「さらに下へ引くと単語帳へ戻る」の表示は不要（機能は残す）
 *  ・ホーム画面：左上アイコンの左マージンを詰め、ステータスバーを少し短くし、
 *    空いた右のスペースに角丸ボタンを縦に2つ（上=設定／下=ハンバーガーメニュー）。
 *    アイコンは今の左アイコン群と同じ。左側にあった設定ボタンは廃止。
 *    メニューを押すと吹き出しが出て、カレンダー／ROOM一覧／スペシャルモードを
 *    アイコン＋文字のカプセル3つ（縦並び）で選べる。
 *  ・プレゼントボタンとガチャボタンを1つに統合し、押すとプレゼント画面／ガチャ画面へ行く
 *    ボタンが2つ横並びで出る（「単語帳ボタン」のようなデザイン）。統合ボタンは今日の5問のすぐ上。
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

  // ================= ① ホーム：左上アイコンの左マージン・ステータスバー・右の角丸ボタン2つ =================
  const hd = await page.evaluate(() => {
    const r = e => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
    const rail = document.querySelector('.hd-rail');
    const btns = [...document.querySelectorAll('.hd-rail .hd-btn')];
    const wrap = document.getElementById('homewrap');
    return {
      k: wrap.getBoundingClientRect().width / 602,
      wrapL: wrap.getBoundingClientRect().left,
      avatar: r(document.querySelector('.avatar-circle')),
      panel: r(document.querySelector('.status-panel')),
      rail: rail ? r(rail) : null,
      btnN: btns.length,
      // 角丸の判定は縮小前（602基準）どうしで比べる：offsetHeight と border-radius はどちらも縮小前の値
      btns: btns.map(b => ({ id: b.id, box: r(b), rad: parseFloat(getComputedStyle(b).borderTopLeftRadius), rawH: b.offsetHeight })),
      setImg: (document.querySelector('#hd-set img') || {}).getAttribute ? document.querySelector('#hd-set img').getAttribute('src') : null,
      bars: document.querySelectorAll('#hd-menu .hd-bars i').length,
      leftRailSet: !!document.querySelector('.reward-rail-left #set-btn'),
      leftRailIds: [...document.querySelectorAll('.reward-rail-left .rr-btn')].map(b => b.id),
      leftRailImg: (document.querySelector('.reward-rail-left .rr-btn img') || {}).src || ''
    };
  });
  check(`左上アイコンの左マージンが詰まっている (左端 ${(hd.avatar.l - hd.wrapL).toFixed(1)}px ＝ 602基準で ${((hd.avatar.l - hd.wrapL) / hd.k).toFixed(0)}px)`,
    near((hd.avatar.l - hd.wrapL) / hd.k, 14, 2));
  // 20:46 の指示で、文字がはみ出さないよう右端を460→520px（幅380px）へ伸ばし直した。
  // 「右に角丸ボタン2つぶんの余地を残して短い」という当初の狙いは保たれている（下の重なり判定も参照）
  check(`ステータスバーが短くなった (幅 ${(hd.panel.w / hd.k).toFixed(0)}px < 従来403px)`, hd.panel.w / hd.k < 403);
  check('角丸ボタンが縦に2つある', hd.btnN === 2);
  check(`上が設定ボタン・下がメニューボタン (${hd.btns.map(b => b.id).join(',')})`,
    hd.btns.length === 2 && hd.btns[0].id === 'hd-set' && hd.btns[1].id === 'hd-menu' && hd.btns[0].box.t < hd.btns[1].box.t);
  check('2つのボタンは横位置がそろって縦に並ぶ',
    hd.btns.length === 2 && near(hd.btns[0].box.l, hd.btns[1].box.l) && hd.btns[0].box.b <= hd.btns[1].box.t + 0.5);
  check(`角丸（丸ボタンでもカプセルでもない）になっている (${hd.btns.map(b => b.rad.toFixed(0) + '/' + b.rawH).join(' , ')}px)`,
    hd.btns.every(b => b.rad > 4 && b.rad < b.rawH / 2));
  check(`ボタンはステータスバーより右のスペースにある (バー右端 ${hd.panel.r.toFixed(0)} < ボタン左端 ${hd.btns[0].box.l.toFixed(0)})`,
    hd.btns.every(b => b.box.l >= hd.panel.r));
  check('設定ボタンのアイコンは左アイコン群と同じ画像（icons/settings.webp）', /icons\/settings\.webp$/.test(hd.setImg || ''));
  check('メニューボタンはハンバーガー（3本線）', hd.bars === 3);
  check(`左のアイコン群から設定ボタンが消えている (残り: ${hd.leftRailIds.join(',')})`, !hd.leftRailSet && hd.leftRailIds.indexOf('set-btn') < 0);

  // ================= ② メニューの吹き出し（カプセル3つ・アイコン＋文字） =================
  await page.click('#hd-menu');
  await page.waitForTimeout(450);
  const menu = await page.evaluate(() => {
    const m = document.getElementById('menu-modal'), card = m.querySelector('.hm-card');
    const caps = [...m.querySelectorAll('.hm-cap')];
    const cb = card.getBoundingClientRect(), bb = document.getElementById('hd-menu').getBoundingClientRect();
    return {
      on: m.classList.contains('on'),
      bubble: !!getComputedStyle(card, '::after').borderTopWidth, // しっぽ付き＝吹き出し
      n: caps.length,
      labels: caps.map(c => c.textContent.trim()),
      icons: caps.map(c => !!c.querySelector('img') || !!c.querySelector('.hm-emo')), // ことばの友だちは絵文字アイコン
      vertical: caps.every((c, i) => i === 0 || c.getBoundingClientRect().top >= caps[i - 1].getBoundingClientRect().bottom - 0.5),
      sameX: caps.every(c => Math.abs(c.getBoundingClientRect().left - caps[0].getBoundingClientRect().left) < 1),
      capsule: caps.map(c => parseFloat(getComputedStyle(c).borderTopLeftRadius) >= c.getBoundingClientRect().height / 2 - 1),
      nearBtn: Math.abs((cb.left + cb.right) / 2 - (bb.left + bb.right) / 2) < 140 && cb.top > bb.top
    };
  });
  check('メニューボタンで吹き出しが出る', menu.on);
  // ことばの友だちを追加（メール指示 2026-08-06 の続き）／今日のボーナスは廃止（メール指示 2026-08-08）
  check(`吹き出しの中は4つ (${menu.labels.join(' / ')})`, menu.n === 4);
  check('カレンダー・ROOM一覧・スペシャルモード・ことばの友だちが選べる',
    menu.labels.join(',') === 'カレンダー,ROOM一覧,スペシャルモード,🐶ことばの友だち');
  check('どれもアイコン＋文字', menu.icons.every(Boolean));
  check('カプセルが縦に3つ並ぶ', menu.vertical && menu.sameX && menu.capsule.every(Boolean));
  check('吹き出しはメニューボタンから出ている', menu.nearBtn);
  const menuGo = await page.evaluate(() => {
    document.querySelectorAll('#menu-modal .hm-cap')[1].click(); // ROOM一覧
    return { menuOff: !document.getElementById('menu-modal').classList.contains('on'), map: document.getElementById('map-modal').classList.contains('on') };
  });
  check('カプセルを押すと吹き出しが閉じてその画面へ行く', menuGo.menuOff && menuGo.map);
  await page.evaluate(() => { document.getElementById('map-modal').classList.remove('on'); });
  await page.waitForTimeout(300);

  // ================= ③ プレゼント／ガチャの統合ボタン =================
  const gift = await page.evaluate(() => {
    const r = e => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
    const g = document.getElementById('sg-gift'), d5 = document.querySelector('.sg-d5');
    return {
      exists: !!g,
      oldRail: [...document.querySelectorAll('.home-wrap .reward-rail:not(.reward-rail-left)')].length,
      dailyInRail: !!document.querySelector('.reward-rail #rr-daily'),
      gacha: r(g), d5: r(d5),
      centered: Math.abs((r(g).l + r(g).r) / 2 - (r(d5).l + r(d5).r) / 2) < 2
    };
  });
  check('プレゼントとガチャが1つのボタンに統合されている', gift.exists && gift.oldRail === 0 && !gift.dailyInRail);
  // 置き場所はその後「左に並んでいたアイコン3つのところ・丸アイコン」に変更（メール指示 2026-08-02 19:24）。
  // ＝中央のカプセル位置ではなく、今日の5問より上・画面の左寄せ
  check(`統合ボタンは今日の5問より上 (統合 ${gift.gacha.t.toFixed(0)}〜${gift.gacha.b.toFixed(0)} / 5問 ${gift.d5.t.toFixed(0)})`,
    gift.gacha.b <= gift.d5.t);
  check('統合ボタンは中央ぞろえではなく左に置く', !gift.centered && gift.gacha.r < gift.d5.l);

  await page.evaluate(() => document.getElementById('sg-gift').click()); // 受け取り待ちがあると上下に動くので座標クリックは使わない
  await page.waitForTimeout(450);
  const gf = await page.evaluate(() => {
    const r = e => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
    const m = document.getElementById('gift-modal'), btns = [...m.querySelectorAll('.gf-btn')];
    const wb = document.querySelector('.home-side-btn.hsb-right'), wbs = getComputedStyle(wb);
    const cs = btns.map(b => getComputedStyle(b));
    const gb = document.getElementById('sg-gift').getBoundingClientRect(), cb = m.querySelector('.gf-card').getBoundingClientRect();
    return {
      on: m.classList.contains('on'),
      n: btns.length,
      ids: btns.map(b => b.id),
      labels: btns.map(b => (b.querySelector('.gf-txt') || {}).textContent),
      sideBySide: btns.length === 2 && Math.abs(r(btns[0]).t - r(btns[1]).t) < 1 && r(btns[0]).r <= r(btns[1]).l,
      img: btns.map(b => !!b.querySelector('img')),
      // 「単語帳ボタン」と同じ作り：白地・角丸・大きな絵＋太字ラベルの縦並び
      like: cs.map(c => c.backgroundColor === wbs.backgroundColor && parseFloat(c.borderTopLeftRadius) >= 10 && c.flexDirection === 'column'),
      lab: btns.map(b => { const t = b.querySelector('.gf-txt'); const c = getComputedStyle(t); return parseFloat(c.fontSize) >= 16 && parseInt(c.fontWeight, 10) >= 800; }),
      fromBtn: cb.bottom <= gb.top + 2 && Math.abs((cb.left + cb.right) / 2 - (gb.left + gb.right) / 2) < 140
    };
  });
  check('統合ボタンを押すと吹き出しが出る', gf.on);
  check(`中はプレゼントとガチャの2つ (${gf.labels.join(' / ')})`, gf.n === 2 && gf.ids.join(',') === 'rr-daily,rr-rank');
  check('2つが横並び', gf.sideBySide);
  check('「単語帳ボタン」と同じデザイン（白い角丸・絵＋太字ラベル）', gf.img.every(Boolean) && gf.like.every(Boolean) && gf.lab.every(Boolean));
  check('吹き出しは統合ボタンから出ている', gf.fromBtn);
  const go = await page.evaluate(() => {
    document.getElementById('rr-rank').click();
    return { off: !document.getElementById('gift-modal').classList.contains('on'), gacha: document.getElementById('gacha-modal').classList.contains('on') };
  });
  check('ガチャのボタンを押すとガチャ画面へ飛ぶ', go.off && go.gacha);
  await page.evaluate(() => { document.getElementById('gacha-modal').classList.remove('on'); });
  await page.waitForTimeout(300);
  const gp = await page.evaluate(() => {
    document.getElementById('sg-gift').click();
    document.getElementById('rr-daily').click();
    return { off: !document.getElementById('gift-modal').classList.contains('on'), pres: document.getElementById('present-modal').classList.contains('on') };
  });
  check('プレゼントのボタンを押すとプレゼント画面へ飛ぶ', gp.off && gp.pres);
  await page.evaluate(() => { document.getElementById('present-modal').classList.remove('on'); });
  await page.waitForTimeout(300);

  // ================= ④ 「単語をさがす」欄はフロートでない =================
  await page.evaluate(() => { enterListMode(); });
  await page.waitForTimeout(800);
  await clearFx();
  const sb = await page.evaluate(() => {
    const r = e => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
    const list = document.querySelector(`.room-slide[data-n="${curSection}"] .slide-list`);
    const row = list.querySelector('.wb-searchrow'), inp = row && row.querySelector('.wb-qin');
    const tabs = list.querySelector('.wb-tabs');
    const cs = row ? getComputedStyle(row) : null;
    return {
      oldFloat: !!document.getElementById('wb-searchbar'),
      inList: !!row && !!list.contains(row),
      pos: cs ? cs.position : null,
      shadow: inp ? getComputedStyle(inp).boxShadow : null,
      afterTabs: row && tabs ? (r(row).t >= r(tabs).b - 1 && r(row).t - r(tabs).b < 14) : false,
      h: inp ? r(inp).h : 0,
      font: inp ? parseFloat(getComputedStyle(inp).fontSize) : 0,
      scrolls: (() => { // 一覧をスクロールしたときに動く量（固定になったので0のはず）
        const before = row.getBoundingClientRect().top;
        list.scrollTop = 200;
        const after = row.getBoundingClientRect().top;
        list.scrollTop = 0;
        return before - after;
      })()
    };
  });
  check('旧・画面に浮く検索バー（#wb-searchbar）は無くなった', !sb.oldFloat);
  check('「単語をさがす」欄は単語帳の一覧の中にある', sb.inList);
  check(`欄は浮いていない（position:${sb.pos}）`, sb.pos === 'static');
  check(`浮いて見える影も無い (${sb.shadow})`, sb.shadow === 'none');
  check('カード枚数・絞り込みの列のすぐ下にある', sb.afterTabs);
  // 一覧と一緒に動く欄から「上に固定して残る欄」へ変更（メール指示 2026-08-02 19:24）
  check(`一覧をスクロールしても動かない (${sb.scrolls.toFixed(0)}px)`, Math.abs(sb.scrolls) < 2);
  check(`欄の高さは従来どおり約26px (${sb.h.toFixed(1)}px)`, sb.h > 8 && sb.h < 34);
  check(`文字は16pxのまま（iPhoneで勝手に拡大しない） (${sb.font}px)`, sb.font >= 16);

  // 検索そのものは今までどおり効く
  await page.evaluate(() => { const q = wbSearchInput(); q.focus(); q.value = '물'; wbSearch2('물'); });
  await page.waitForTimeout(500);
  const hits = await page.evaluate(() => {
    const box = document.getElementById('wb-hits2'), row = document.querySelector('.wb-searchrow');
    const n = box.querySelectorAll('.wbh-row').length;
    return { n, below: box.getBoundingClientRect().top >= row.getBoundingClientRect().bottom - 1, grid: getComputedStyle(document.querySelector('.wb-grid')).opacity };
  });
  check(`検索は今までどおり効く (${hits.n}件)`, hits.n > 0);
  check('候補は欄のすぐ下に出る', hits.below);
  check('入力中は単語カードを隠す', hits.grid === '0');
  await page.evaluate(() => { wbClearQ(); wbSearch2(''); });
  await page.waitForTimeout(300);

  // ================= ⑤ 単語詳細ページには検索欄を出さない =================
  await page.evaluate(() => { renderWordDetail(sectionIds()[0], 'room'); });
  await page.waitForTimeout(900);
  await clearFx();
  const wd = await page.evaluate(() => {
    const center = document.getElementById('wd-center');
    const more = center.querySelector('.wd-more');
    return {
      // 隣のROOMのスライド（画面の外）には一覧＝検索欄があるので、「画面に見えているか」で見る
      noSearch: !document.getElementById('wb-searchbar') && !center.querySelector('.wb-qin')
        && ![...document.querySelectorAll('.wb-qin')].some(q => { const b = q.getBoundingClientRect(); return b.width > 0 && b.right > 0 && b.left < innerWidth && b.bottom > 0 && b.top < innerHeight; }),
      moreExists: !!more,                                   // 機能（ボタン）は残す
      moreShown: more ? getComputedStyle(more).display !== 'none' && more.getBoundingClientRect().height > 0 : false,
      order: [...center.children].map(c => c.className.split(' ')[0])
    };
  });
  check('単語詳細ページには単語検索の欄が出ない', wd.noSearch);
  check('「さらに下へ引くと単語帳へもどる」の表示は出ない', !wd.moreShown);
  check('戻る機能そのものは残っている（要素は生きている）', wd.moreExists);

  // 引いて戻る操作が今までどおり効くか（下端まで見てさらに引く）
  const pull = await page.evaluate(async () => {
    const c = document.getElementById('wd-center');
    c.scrollTop = c.scrollHeight;
    const t = (type, y) => c.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: c, clientX: 195, clientY: y })], changedTouches: [new Touch({ identifier: 1, target: c, clientX: 195, clientY: y })] }));
    t('touchstart', 600); t('touchmove', 540); t('touchmove', 460); t('touchmove', 420); t('touchend', 420);
    await new Promise(r => setTimeout(r, 600));
    return { closed: _wdId == null, list: _listMode };
  });
  check('下端でさらに引くと単語帳へ戻る（機能は残っている）', pull.closed && pull.list);

  await page.evaluate(() => { exitListMode(); });
  await page.waitForTimeout(500);
  check(`JSコンソールエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) errors.forEach(e => console.log('  ! ' + e));

  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n==== ${results.length - ng.length} / ${results.length} PASS ====`);
  if (ng.length) { ng.forEach(r => console.log('FAIL: ' + r.name)); process.exit(1); }
})();
