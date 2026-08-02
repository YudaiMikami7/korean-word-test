/* k-tango 2026-08-02 19:24 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0802h.test.js
 * 指示:
 *  1. 左アイコン3つは消して良い（メニューに入れたため）
 *  2. ハンバーガーメニューと設定アイコンは正方形角丸で
 *  3. プレゼントガチャは、左アイコンの位置に丸アイコンで設置
 *  4. 設定ボタンとハンバーガーメニューボタンは、単語帳や単語詳細でも表示
 *  5. 単語帳ページでは、絞り込みや検索ボタンはスクロールされずに固定で
 *  6. 絞り込み列は、左右スクロールでページャーが出ている時は非表示
 *  7. 最近学んだ単語のアニメーションをなくす。その代わり左右スクロールできるように
 *  8. ガチャのアニメーションは、もっと現実に忠実なデザインに
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').split(path.sep).join('/');

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

  const box = sel => page.evaluate(s => {
    const e = document.querySelector(s); if (!e) return null;
    const r = e.getBoundingClientRect(), h = document.getElementById('homewrap').getBoundingClientRect();
    const k = h.width / 602;                       // 602px基準へ戻す
    return { x: (r.left - h.left) / k, y: (r.top - h.top) / k, w: r.width / k, h: r.height / k,
             vis: getComputedStyle(e).opacity !== '0' && getComputedStyle(e).visibility !== 'hidden' && r.width > 0 };
  }, sel);

  /* ---------- 1. 左のアイコン3つは廃止 ---------- */
  check('1-1 左のアイコン列(.reward-rail-left)がHTMLから無い', await page.evaluate(() => !document.querySelector('.reward-rail-left')));
  check('1-2 ROOM一覧アイコン(#map-btn)が無い', await page.evaluate(() => !document.getElementById('map-btn')));
  check('1-3 カレンダーアイコン(#cal-btn)が無い', await page.evaluate(() => !document.getElementById('cal-btn')));
  check('1-4 スペシャルアイコン(#sp-btn)が無い', await page.evaluate(() => !document.getElementById('sp-btn')));
  check('1-5 .reward-rail自体がホームに残っていない', await page.evaluate(() => !document.querySelector('.reward-rail')));
  // 消した機能はハンバーガーメニューの中に残っている
  const menuCaps = await page.evaluate(() => [...document.querySelectorAll('#menu-modal .hm-cap span')].map(s => s.textContent.trim()));
  check('1-6 メニューにカレンダーがある', menuCaps.includes('カレンダー'));
  check('1-7 メニューにROOM一覧がある', menuCaps.includes('ROOM一覧'));
  check('1-8 メニューにスペシャルモードがある', menuCaps.includes('スペシャルモード'));
  check('1-9 使い方ガイドが消したアイコンを指していない',
    await page.evaluate(() => !COACH_STEPS.some(s => (s.sel || '').indexOf('reward-rail') >= 0)));
  check('1-10 使い方ガイドの各ステップの部品が実在する',
    await page.evaluate(() => COACH_STEPS.every(s => !!document.querySelector(s.sel))));

  /* ---------- 2. 設定・ハンバーガーは正方形角丸 ---------- */
  const bSet = await box('#hd-set'), bMenu = await box('#hd-menu');
  check('2-1 設定ボタンが出ている', bSet && bSet.vis);
  check('2-2 メニューボタンが出ている', bMenu && bMenu.vis);
  check('2-3 設定ボタンが正方形（縦横差1px未満）', bSet && Math.abs(bSet.w - bSet.h) < 1);
  check('2-4 メニューボタンが正方形（縦横差1px未満）', bMenu && Math.abs(bMenu.w - bMenu.h) < 1);
  check('2-5 設定ボタンが角丸（16px）', await page.evaluate(() => getComputedStyle(document.getElementById('hd-set')).borderRadius.indexOf('16px') === 0));
  check('2-6 メニューボタンが角丸（16px）', await page.evaluate(() => getComputedStyle(document.getElementById('hd-menu')).borderRadius.indexOf('16px') === 0));
  check('2-7 2つは縦に並ぶ（設定が上）', bSet && bMenu && bMenu.y > bSet.y + bSet.h - 1);
  check('2-8 右端はアイコン列と同じ14px', bSet && Math.abs((602 - (bSet.x + bSet.w)) - 14) < 1.5);
  check('2-9 ルームメニュー(top:173px)に掛からない', bMenu && bMenu.y + bMenu.h <= 173);
  check('2-10 連続ログイン表示(#hv-code)と重ならない',
    await (async () => { const c = await box('#hv-code'); return c && bSet && c.x + c.w <= bSet.x + 0.5; })());
  check('2-11 ハンバーガーの3本線が残っている', await page.evaluate(() => document.querySelectorAll('#hd-menu .hd-bars i').length === 3));

  /* ---------- 3. プレゼント・ガチャは左アイコンの位置に丸アイコン ---------- */
  const bGift = await box('.sg-gift');
  check('3-1 プレゼント・ガチャのボタンが出ている', bGift && bGift.vis);
  check('3-2 丸（縦横68px）', bGift && Math.abs(bGift.w - 68) < 1 && Math.abs(bGift.h - 68) < 1);
  check('3-3 border-radiusが50%（丸）', await page.evaluate(() => getComputedStyle(document.querySelector('.sg-gift')).borderRadius === '50%'));
  check('3-4 左端14px＝消した左アイコンと同じ横位置', bGift && Math.abs(bGift.x - 14) < 1);
  check('3-5 上端340px＝消した左アイコン列の一番上と同じ縦位置', bGift && Math.abs(bGift.y - 340) < 1);
  check('3-6 画面中央のカプセル位置ではない（左に寄っている）', bGift && bGift.x + bGift.w < 602 / 2);
  check('3-7 文字ラベルは出さない（丸アイコンのみ）',
    await page.evaluate(() => getComputedStyle(document.querySelector('.sg-gift .sggf-t')).display === 'none'));
  check('3-8 プレゼントの絵が入っている', await page.evaluate(() => !!document.querySelector('.sg-gift img')));
  // ルーム番号ページャー(292〜340px)・今日の5問カプセルと重ならない
  const bD5 = await box('.sg-d5'), bPager = await box('#room-pager');
  check('3-9 ルーム番号ページャーと重ならない', bGift && bPager && bGift.y >= bPager.y + bPager.h - 0.5);
  check('3-10 今日の5問ボタンと重ならない', bGift && bD5 && (bGift.y + bGift.h <= bD5.y || bGift.x + bGift.w <= bD5.x));
  // 押すと吹き出しが開く
  // ふわふわ動くボタン(bob)なのでPlaywrightのclickは安定待ちで止まる。実際のタップと同じonclickを直接叩く
  await page.evaluate(() => document.querySelector('.sg-gift').click()); await page.waitForTimeout(400);
  check('3-11 押すとプレゼント／ガチャの吹き出しが開く', await page.evaluate(() => document.getElementById('gift-modal').classList.contains('on')));
  check('3-12 吹き出しが画面内に収まっている', await page.evaluate(() => {
    const c = document.querySelector('#gift-modal .gf-card'), r = c.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
  }));
  await page.evaluate(() => closeGiftMenu()); await page.waitForTimeout(300);

  /* ---------- 7. 最近学んだ単語：アニメーション廃止・左右スクロール ---------- */
  // 学習履歴を作って帯を出す
  await page.evaluate(() => {
    const ids = (LEVEL_SECTIONS[curLevel][curSection] || []).slice(0, 14);
    const st = loadStats(), now = Date.now();
    ids.forEach((id, i) => { st[id] = { hasSeen: 1, hasEverCorrect: 1, memoryScore: 40 + i, lastAnswerAt: new Date(now - 86400000).toISOString(), stabilityHours: 20 }; });
    saveStats(st); buildTodayBand();
  });
  await page.waitForTimeout(500);
  check('7-1 「最近学んだ単語」の帯が出ている', await page.evaluate(() => document.getElementById('today-band').style.display !== 'none'));
  check('7-2 流れるアニメーションが無い（tb-track）',
    await page.evaluate(() => { const a = getComputedStyle(document.getElementById('tb-track')).animationName; return a === 'none' || a === ''; }));
  check('7-3 tbflowのキーフレーム定義そのものが無い', await page.evaluate(() => !document.documentElement.innerHTML.includes('@keyframes tbflow')));
  check('7-4 カードの2重生成（同一グループ2連結）をやめた',
    await page.evaluate(() => document.querySelectorAll('#tb-track .tb-group').length === 1));
  check('7-5 同じ単語が重複して並んでいない', await page.evaluate(() => {
    const ks = [...document.querySelectorAll('#tb-track .tb-ko')].map(e => e.textContent);
    return ks.length > 0 && new Set(ks).size === ks.length;
  }));
  const clipOv = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.tb-clip')); return { x: c.overflowX, y: c.overflowY, pe: c.pointerEvents }; });
  check('7-6 帯が左右スクロールできる（overflow-x:auto）', clipOv.x === 'auto');
  check('7-7 縦にはスクロールしない', clipOv.y === 'hidden');
  check('7-8 指で触れる（pointer-events:auto）', clipOv.pe === 'auto');
  check('7-9 中身が帯より広く、実際にスクロールできる',
    await page.evaluate(() => { const c = document.querySelector('.tb-clip'); return c.scrollWidth > c.clientWidth + 4; }));
  check('7-10 スクロールすると実際に位置が動く', await page.evaluate(async () => {
    const c = document.querySelector('.tb-clip'); c.scrollLeft = 120; await new Promise(r => setTimeout(r, 120)); return c.scrollLeft > 60;
  }));
  check('7-11 カードをタップすると単語詳細へ行ける（onclickが残っている）',
    await page.evaluate(() => !!document.querySelector('.tb-card[onclick*="renderWordDetail"]')));
  check('7-12 帯は単語帳ボタン(left:476px)に掛からない',
    await (async () => { const b = await box('.today-band'); return b && b.x + b.w <= 476.5; })());

  /* ---------- 4. 設定・メニューは単語帳／単語詳細でも表示 ---------- */
  await page.evaluate(() => enterListMode()); await page.waitForTimeout(700);
  check('4-1 単語帳ページに入っている', await page.evaluate(() => document.getElementById('homewrap').classList.contains('listmode')));
  const lSet = await box('#hd-set'), lMenu = await box('#hd-menu');
  check('4-2 単語帳でも設定ボタンが見える', lSet && lSet.vis);
  check('4-3 単語帳でもメニューボタンが見える', lMenu && lMenu.vis);
  check('4-4 単語帳でも押せる（pointer-events）',
    await page.evaluate(() => getComputedStyle(document.querySelector('.hd-rail')).pointerEvents !== 'none'));
  check('4-5 単語帳でメニューボタンを押すと吹き出しが開く', await (async () => {
    await page.click('#hd-menu'); await page.waitForTimeout(350);
    const on = await page.evaluate(() => document.getElementById('menu-modal').classList.contains('on'));
    await page.evaluate(() => closeHomeMenu()); await page.waitForTimeout(250);
    return on;
  })());
  check('4-6 単語帳で設定ボタンを押すと設定が開く', await (async () => {
    await page.click('#hd-set'); await page.waitForTimeout(400);
    const on = await page.evaluate(() => document.getElementById('settings-modal').classList.contains('on'));
    await page.evaluate(() => closeSettings()); await page.waitForTimeout(300);
    return on;
  })());
  check('4-7 単語帳ではプレゼント・ガチャの丸は出さない（従来の左アイコンと同じ扱い）',
    await page.evaluate(() => { const g = document.querySelector('.sg-gift'); return !g || g.getBoundingClientRect().width === 0; }));

  /* ---------- 5. 単語帳の絞り込み・検索は固定 ---------- */
  const headSel = `.room-slide[data-n="${await page.evaluate(() => curSection)}"] .wb-fixhead`;
  check('5-1 絞り込みと検索が1つの固定帯にまとまっている',
    await page.evaluate(s => { const h = document.querySelector(s); return !!h && !!h.querySelector('.wb-tabs') && !!h.querySelector('.wb-searchrow'); }, headSel));
  check('5-2 position:sticky で固定されている',
    await page.evaluate(s => getComputedStyle(document.querySelector(s)).position === 'sticky', headSel));
  const y0 = await page.evaluate(s => document.querySelector(s).getBoundingClientRect().top, headSel);
  await page.evaluate(s => { document.querySelector(s).closest('.slide-list').scrollTop = 600; }, headSel);
  await page.waitForTimeout(400);
  const y1 = await page.evaluate(s => document.querySelector(s).getBoundingClientRect().top, headSel);
  check('5-3 一覧を600pxスクロールしても位置が動かない', Math.abs(y1 - y0) < 2);
  check('5-4 スクロール後も絞り込みボタンが押せる位置にある', await page.evaluate(s => {
    const h = document.querySelector(s), r = h.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight;
  }, headSel));
  check('5-5 スクロール後も検索欄が見えている', await page.evaluate(s => {
    const q = document.querySelector(s + ' .wb-qin'), r = q.getBoundingClientRect();
    return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight;
  }, headSel));
  check('5-6 カードが裏を通っても読めるよう座布団が敷いてある',
    await page.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundColor.replace(/\s/g, '') !== 'rgba(0,0,0,0)', headSel));
  check('5-7 絞り込みの切りかえは従来どおり効く', await (async () => {
    await page.evaluate(() => wbSetFilter('owned')); await page.waitForTimeout(500);
    const ok = await page.evaluate(() => _wbFilter === 'owned' && !!document.querySelector('.wb-fixhead .wb-tab.on'));
    await page.evaluate(() => wbSetFilter('all')); await page.waitForTimeout(500);
    return ok;
  })());
  check('5-8 一覧はいちばん上に戻せる（スクロール自体は生きている）',
    await page.evaluate(s => { const l = document.querySelector(s).closest('.slide-list'); l.scrollTop = 0; return l.scrollTop === 0; }, headSel));

  /* ---------- 6. ページャーが出ているあいだ絞り込み列は非表示 ---------- */
  const headOpacity = () => page.evaluate(s => parseFloat(getComputedStyle(document.querySelector(s)).opacity), headSel);
  check('6-1 ふだんは絞り込み列が見えている', (await headOpacity()) > 0.9);
  await page.evaluate(() => showRoomPager()); await page.waitForTimeout(500);
  check('6-2 ページャーが出ている', await page.evaluate(() => document.getElementById('room-pager').classList.contains('on')));
  check('6-3 その間はhomewrapにpager-onが付く', await page.evaluate(() => document.getElementById('homewrap').classList.contains('pager-on')));
  check('6-4 絞り込み列が非表示になる', (await headOpacity()) < 0.05);
  check('6-5 非表示中は押せない', await page.evaluate(s => getComputedStyle(document.querySelector(s)).pointerEvents === 'none', headSel));
  // ページャーと絞り込み列は同じ場所（＝重なるので消す必要がある）ことの裏取り
  check('6-6 ページャーと絞り込み列は同じ帯に重なっている', await (async () => {
    const p = await box('#room-pager'), h = await box(headSel);
    return p && h && p.y < h.y + h.h && h.y < p.y + p.h;
  })());
  await page.evaluate(() => { _pagerHold = false; hideRoomPager(); }); await page.waitForTimeout(600);
  check('6-7 ページャーが引っ込むと絞り込み列が戻る', (await headOpacity()) > 0.9);
  check('6-8 戻ったあとは押せる', await page.evaluate(s => getComputedStyle(document.querySelector(s)).pointerEvents !== 'none', headSel));

  /* ---------- 4(続き). 単語詳細でも設定・メニューが出る ---------- */
  await page.evaluate(() => { const id = (LEVEL_SECTIONS[curLevel][curSection] || [])[0]; renderWordDetail(id, 'room'); });
  await page.waitForTimeout(800);
  check('4-8 単語詳細を開いている', await page.evaluate(() => _wdId != null && !!document.getElementById('wd-center')));
  const dSet = await box('#hd-set'), dMenu = await box('#hd-menu');
  check('4-9 単語詳細でも設定ボタンが見える', dSet && dSet.vis);
  check('4-10 単語詳細でもメニューボタンが見える', dMenu && dMenu.vis);
  check('4-11 単語詳細でもボタンの位置は変わらない', dSet && bSet && Math.abs(dSet.x - bSet.x) < 1 && Math.abs(dSet.y - bSet.y) < 1);
  check('4-12 単語詳細では検索欄は出ない（従来どおり）', await page.evaluate(() => !document.querySelector('#wd-center .wb-qin')));
  check('4-13 単語詳細でメニューが開ける', await (async () => {
    await page.click('#hd-menu'); await page.waitForTimeout(350);
    const on = await page.evaluate(() => document.getElementById('menu-modal').classList.contains('on'));
    await page.evaluate(() => closeHomeMenu()); await page.waitForTimeout(250);
    return on;
  })());
  await page.evaluate(() => { closeWordDetail(); exitListMode(); }); await page.waitForTimeout(700);
  check('4-14 ホームに戻れる', await page.evaluate(() => !document.getElementById('homewrap').classList.contains('listmode')));

  /* ---------- 8. ガチャのアニメーションを現実に忠実に ---------- */
  await page.evaluate(() => { addGachaSpin(50, 'A'); addGachaSpin(50, 'A'); openGacha(); });
  await page.waitForTimeout(600);
  check('8-1 ガチャ画面が開く', await page.evaluate(() => document.getElementById('gacha-modal').classList.contains('on')));
  check('8-2 絵文字の🎰スロットは廃止', await page.evaluate(() => !document.querySelector('#gacha-modal .gc-cap')));
  check('8-3 ガラスのドームがある', await page.evaluate(() => !!document.querySelector('#gc-machine .gcm-dome')));
  check('8-4 本体（赤い箱）がある', await page.evaluate(() => !!document.querySelector('#gc-machine .gcm-body')));
  check('8-5 コイン投入口がある', await page.evaluate(() => !!document.querySelector('#gc-machine .gcm-slot')));
  check('8-6 まわすハンドルがある', await page.evaluate(() => !!document.querySelector('#gc-machine .gcm-knob')));
  check('8-7 取り出し口とフタがある', await page.evaluate(() => !!document.querySelector('#gc-machine .gcm-mouth .gcm-flap')));
  check('8-8 カプセルが複数入っている（6個）', await page.evaluate(() => document.querySelectorAll('#gc-machine .gcm-dome .gc-ball').length === 6));
  check('8-9 カプセルは上下2色に塗り分けられている（本物と同じ）',
    await page.evaluate(() => getComputedStyle(document.querySelector('#gc-machine .gc-ball')).backgroundImage.indexOf('linear-gradient') >= 0));
  check('8-10 ドームは上が丸く下が角ばった形',
    await page.evaluate(() => { const b = getComputedStyle(document.querySelector('.gcm-dome')).borderTopLeftRadius; return parseFloat(b) >= 40; }));
  check('8-11 まわせるときはカプセルがゆれる（ready）',
    await page.evaluate(() => document.getElementById('gc-machine').classList.contains('ready')
      && getComputedStyle(document.querySelector('#gc-machine .gc-ball')).animationName === 'gcFloat'));
  check('8-12 まわす前はハンドルが回っていない',
    await page.evaluate(() => getComputedStyle(document.querySelector('.gcm-knob')).animationName === 'none'));
  check('8-13 まわす前はカプセルが出てきていない',
    await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.gcm-drop')).opacity) === 0));
  // まわす
  await page.evaluate(() => spinGacha());
  await page.waitForTimeout(200);
  check('8-14 まわすと機械が振動する', await page.evaluate(() => {
    const m = document.getElementById('gc-machine');
    return m.classList.contains('spin') && getComputedStyle(m).animationName === 'gcShake';
  }));
  check('8-15 ハンドルが1回転する', await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.gcm-knob'));
    return s.animationName === 'gcTurn' && s.animationIterationCount === '1';
  }));
  check('8-16 中のカプセルが跳ねる', await page.evaluate(() => getComputedStyle(document.querySelector('#gc-machine .gc-ball')).animationName === 'gcTumble'));
  check('8-17 取り出し口のフタが開く', await page.evaluate(() => {
    const t = getComputedStyle(document.querySelector('.gcm-flap')).transform;
    return t !== 'none' && t.indexOf('matrix3d') === 0;
  }));
  check('8-18 少し遅れてカプセルが落ちてくる', await page.evaluate(() => getComputedStyle(document.querySelector('.gcm-drop')).animationName === 'gcDrop'));
  await page.waitForTimeout(700);
  check('8-19 落ちてきたカプセルが見えている', await page.evaluate(() => {
    const d = document.querySelector('.gcm-drop'); return !d || parseFloat(getComputedStyle(d).opacity) > 0.5;
  }));
  await page.waitForTimeout(600);
  check('8-20 結果が出る', await page.evaluate(() => !!document.querySelector('#gacha-modal .gc-prize')));
  check('8-21 もう1回まわせる（残り1回）', await page.evaluate(() => !!document.querySelector('#gacha-modal .gc-go')));
  await page.evaluate(() => spinGacha()); await page.waitForTimeout(1500);
  check('8-22 2回目もまわせて結果が出る', await page.evaluate(() => !!document.querySelector('#gacha-modal .gc-prize')));
  check('8-23 コインを使い切ると0枚になる', await page.evaluate(() => gachaSpins() === 0));
  await page.evaluate(() => { closeGacha(); openGacha(); }); await page.waitForTimeout(400);
  check('8-24 0枚のときも機械の絵は出る', await page.evaluate(() => !!document.querySelector('#gc-machine .gcm-dome')));
  check('8-25 0枚のときは灰色に沈む（ready無し）',
    await page.evaluate(() => !document.getElementById('gc-machine').classList.contains('ready')
      && getComputedStyle(document.getElementById('gc-machine')).filter.indexOf('grayscale') >= 0));
  await page.evaluate(() => closeGacha()); await page.waitForTimeout(300);

  /* ---------- 回帰：ホームの他の部品が壊れていない ---------- */
  check('R-1 ステータスバーが残っている', await (async () => { const b = await box('.status-panel'); return b && b.vis; })());
  check('R-2 ルームメニューが残っている', await (async () => { const b = await box('.rmenu-bg'); return b && b.vis; })());
  check('R-3 単語帳ボタンが残っている', await (async () => { const b = await box('.hsb-right'); return b && b.vis; })());
  check('R-4 今日の5問ボタンが残っている', await (async () => { const b = await box('.sg-d5'); return b && b.vis; })());
  check('R-5 PWRが減るまでのカウントは廃止のまま', await page.evaluate(() => !document.getElementById('hv-pwrdown')));
  check('R-6 ルーム番号ページャーはルームメニューの下のまま', await (async () => {
    const p = await box('#room-pager'); return p && Math.abs(p.y - 292) < 1.5;
  })());
  check('R-7 版数が上がっている', await page.evaluate(() => APP_VERSION.indexOf('v6.2') === 0));
  check('R-8 JSコンソールエラーが無い', errors.length === 0);
  if (errors.length) console.log(errors);

  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length} / ${results.length} PASS`);
  if (ng.length) { console.log('FAILED:'); ng.forEach(r => console.log(' - ' + r.name)); }
  await browser.close();
  process.exit(ng.length ? 1 : 0);
})();
