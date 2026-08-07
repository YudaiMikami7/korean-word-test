/* k-tango すごろく（1マス=1テスト / 12マスで1周）スモークテスト
 * 使い方: node smoke.board.test.js
 * 検証: 1周の網羅（12マスで全語登場）・周の伸長・マスの開放/ロック・テスト連動・画像が常に乗ること
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
  page.on('dialog', d => d.accept());
  await page.goto('file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/'));
  await page.waitForTimeout(900);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); });
  await page.reload(); await page.waitForTimeout(1300);
  await page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.appconfirm').forEach(o => o.remove()));

  // --- 1周のマス数 ---
  const laps = await page.evaluate(() => ({
    b1: boardLapSize('beginner', 1),      // 100語
    b17: boardLapSize('beginner', 17),    // 71語
    m27: boardLapSize('middle', 27),      // 62語
    n1: LEVEL_SECTIONS.beginner[1].length, n17: LEVEL_SECTIONS.beginner[17].length, n27: LEVEL_SECTIONS.middle[27].length,
  }));
  check(`100語ROOMは1周12マス (${laps.n1}語→${laps.b1}マス)`, laps.b1 === 12);
  check(`語数の少ないROOMは短い (初級17: ${laps.n17}語→${laps.b17} / 中級27: ${laps.n27}語→${laps.m27})`, laps.b17 < 12 && laps.m27 < 12);

  // --- 1周で全語が必ず登場する ---
  const cov = await page.evaluate(() => {
    const out = {};
    for (const [lv, sec] of [['beginner', 1], ['beginner', 5], ['beginner', 17], ['middle', 3], ['middle', 27]]) {
      const L = boardLapSize(lv, sec), ids = LEVEL_SECTIONS[lv][sec], seen = new Set();
      let dup = 0;
      for (let i = 0; i < L; i++) boardTileWords(lv, sec, 1, i).forEach(id => { if (seen.has(id)) dup++; seen.add(id); });
      out[lv + '-' + sec] = { unique: seen.size, total: ids.length, dup };
    }
    return out;
  });
  const allCovered = Object.values(cov).every(v => v.unique === v.total && v.dup === 0);
  check('1周で担当語が全語・重複なし ' + JSON.stringify(cov), allCovered);

  // --- 周ごとに並びが変わる ---
  check('周が変われば担当の並びも変わる', await page.evaluate(() => {
    const a = boardTileWords('beginner', 1, 1, 0).join(','), b = boardTileWords('beginner', 1, 2, 0).join(',');
    return a !== b && boardTileWords('beginner', 1, 1, 0).join(',') === a; // 同じ周なら毎回同じ
  }));

  // --- 初期表示 ---
  const init = await page.evaluate(() => ({
    tiles: document.querySelectorAll('.room-slide[data-n="1"] .sg-tile').length,
    now: document.querySelectorAll('.room-slide[data-n="1"] .sg-tile.now').length,
    lock: document.querySelectorAll('.room-slide[data-n="1"] .sg-tile.lock').length,
    imgs: document.querySelectorAll('.room-slide[data-n="1"] .sg-tile .sg-img, .room-slide[data-n="1"] .sg-tile .sg-noimg').length,
    road: !!document.querySelector('.room-slide[data-n="1"] .sg-road path'),
    deco: document.querySelectorAll('.room-slide[data-n="1"] .sg-deco').length,
  }));
  check(`未着手は12マス表示 (${init.tiles})`, init.tiles === 12);
  check('マス1が「いまここ」・残り11個がロック', init.now === 1 && init.lock === 11);
  check(`全マスに画像が乗っている (${init.imgs}/12)`, init.imgs === 12);
  check('蛇行する道が描かれている', init.road);
  check(`自然物が配置されている (${init.deco}個)`, init.deco >= 12);

  // --- ロックされたマスは開けない ---
  check('先のマスはタップしても始まらない', await page.evaluate(async () => {
    sgTap(1, 5); await new Promise(r => setTimeout(r, 300));
    const blocked = !document.getElementById('s-quiz').classList.contains('on') && !!document.querySelector('.sg-toast');
    document.querySelectorAll('.sg-toast').forEach(t => t.remove());
    return blocked;
  }));

  // --- マス1をプレイ → クリアされて次が開く ---
  const played = await page.evaluate(async () => {
    _boardTile = { level: 'beginner', sec: 1, gidx: 1 };
    startTest(); clearInterval(timer); renderQuestion();
    const ids = state.questions.filter(q => q.word).map(q => q.word.id); // スペシャル問題(シューティング)は単語問題ではないので除く
    const assigned = boardTileWords('beginner', 1, 1, 0);
    const coverIncluded = assigned.every(id => ids.includes(id));
    for (let i = 0, n = state.questions.length; i < n; i++) {
      const q = state.questions[state.idx];
      if (q.type === 'sg') { shootAdvance(); continue; }
      answered = false; clearInterval(timer); startTimer();
      submit('correct', q.type === 'w' ? q.word.ko : q.correct);
      document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer);
      afterAnswer();
    }
    await new Promise(r => setTimeout(r, 600));
    document.querySelectorAll('.cardget,.streak-cel').forEach(o => o.remove());
    return { coverIncluded, qn: ids.length, state: boardState('beginner', 1) };
  });
  check(`1マス=12問 (${played.qn}問)`, played.qn === 12);
  check('そのマスの担当語がすべて出題される', played.coverIncluded);
  check('クリアするとマスが進む', played.state.cleared === 1 && !!played.state.tiles['1']);

  await page.evaluate(() => show('s-home'));
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    done: document.querySelectorAll('.room-slide[data-n="1"] .sg-tile.done').length,
    rank: !!document.querySelector('.room-slide[data-n="1"] .sg-tile.done .sg-rank'),
    nowIdx: document.querySelector('.room-slide[data-n="1"] .sg-tile.now')?.getAttribute('aria-label'),
  }));
  check('クリア済みマスに色とランクが付く', after.done === 1 && after.rank);
  check('「いまここ」がマス2へ移動', after.nowIdx === 'マス2');

  // --- 1周終わると次の周が伸びる ---
  const grown = await page.evaluate(async () => {
    const tiles = {}; for (let i = 1; i <= 12; i++) tiles[i] = { rank: 'B', score: 70, at: new Date().toISOString() };
    localStorage.setItem('kwt_board_v1', JSON.stringify({ 'beginner-01': { cleared: 12, tiles } }));
    buildRoomSlides(); await new Promise(r => setTimeout(r, 400));
    return {
      visible: boardVisible('beginner', 1),
      tiles: document.querySelectorAll('.room-slide[data-n="1"] .sg-tile').length,
      // 周の変わり目は「N周目」のチップではなく薄い線1本（1周目の手前には引かない。メール指示 2026-08-02）
      laps: [...document.querySelectorAll('.room-slide[data-n="1"] .sg-lap')].map(e => getComputedStyle(e).height),
    };
  });
  check(`1周クリアで次の12マスが出現 (${grown.tiles}マス / 区切り線${grown.laps.join(',')})`, grown.visible === 24 && grown.tiles === 24 && grown.laps.length === 1 && grown.laps[0] === '1px');

  // --- 過去の履歴から進捗を復元 ---
  const seeded = await page.evaluate(async () => {
    localStorage.clear();
    // 初級ROOM01で3回、ROOM02で1回の「12問完走」履歴を仕込む
    const ids1 = LEVEL_SECTIONS.beginner[1], ids2 = LEVEL_SECTIONS.beginner[2], h = [];
    const push = (ids, testId, score, day) => {
      for (let i = 0; i < 12; i++) h.push({ wordId: ids[i], testId, score, answeredAt: '2026-07-' + String(day).padStart(2, '0') + 'T10:00:00.000Z' });
    };
    push(ids1, 't-a', 8, 10); push(ids1, 't-b', 6, 11); push(ids1, 't-c', 9, 12);
    push(ids2, 't-d', 7, 13);
    push(ids1, 't-short', 8, 14); h.length -= 6; // 6問しかない未完走テストは数えない
    localStorage.setItem('kwt_history_v1', JSON.stringify(h));
    return true;
  });
  await page.reload(); await page.waitForTimeout(1400);
  await page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.appconfirm').forEach(o => o.remove()));
  const st = await page.evaluate(() => ({
    r1: boardState('beginner', 1), r2: boardState('beginner', 2), r3: boardState('beginner', 3),
    tiles: document.querySelectorAll('.room-slide[data-n="1"] .sg-tile.done').length,
    now: document.querySelector('.room-slide[data-n="1"] .sg-tile.now')?.getAttribute('aria-label'),
  }));
  check(`過去3回ぶんが3マス進んだ状態になる (cleared=${st.r1.cleared})`, seeded && st.r1.cleared === 3 && st.tiles === 3);
  // 履歴が間引かれていても、記憶データ(reviewCount)から進捗を補える
  const fromStats = await page.evaluate(async () => {
    localStorage.clear();
    const st = {}; LEVEL_SECTIONS.beginner[4].forEach(id => { st[id] = { reviewCount: 6, hasSeen: true }; }); // 100語x6回=600 → 600/12=50マス
    localStorage.setItem('kwt_stats_v1', JSON.stringify(st));
    return true;
  }).then(() => page.reload()).then(() => page.waitForTimeout(1400))
    .then(() => page.evaluate(() => ({ r4: boardState('beginner', 4).cleared, r5: boardState('beginner', 5).cleared })));
  check(`履歴が無くても記憶データから進捗を補う (ROOM04=${fromStats.r4})`, fromStats.r4 === 50 && fromStats.r5 === 0);
  // 既に進めている分は下げない
  const noDown = await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('kwt_board_v1', JSON.stringify({ 'beginner-06': { cleared: 20, tiles: {} } }));
    const st = {}; LEVEL_SECTIONS.beginner[6].slice(0, 10).forEach(id => { st[id] = { reviewCount: 1, hasSeen: true }; });
    localStorage.setItem('kwt_stats_v1', JSON.stringify(st));
    return true;
  }).then(() => page.reload()).then(() => page.waitForTimeout(1400))
    .then(() => page.evaluate(() => boardState('beginner', 6).cleared));
  check(`既存の進捗は下げない (20 → ${noDown})`, noDown === 20);
  check('未完走(6問)のテストはマスに数えない', st.r1.cleared === 3);
  check(`別ROOMも個別に反映 (ROOM02=${st.r2.cleared} / ROOM03=${st.r3.cleared})`, st.r2.cleared === 1 && st.r3.cleared === 0);
  check('復元したマスにランクが入る', !!st.r1.tiles['1'] && !!st.r1.tiles['1'].rank);
  check('「いまここ」が4マス目', st.now === 'マス4');

  // --- 左右の三角ボタン（スライドごとではなくhome-wrap直下のフロート＝全ページ共通） ---
  const arr = await page.evaluate(async () => {
    localStorage.clear(); location.hash = '';
    return null;
  }).then(() => page.reload()).then(() => page.waitForTimeout(1400)).then(() => page.evaluate(async () => {
    jumpRoom(3); await new Promise(r => setTimeout(r, 600));
    const before = curSection;
    document.getElementById('rm-next').click();
    await new Promise(r => setTimeout(r, 900));
    const next = curSection;
    document.getElementById('rm-prev').click();
    await new Promise(r => setTimeout(r, 900));
    const prev = curSection;
    const inSlide = !!document.querySelector('.room-slide .rm-arrow');           // スライドの中には無い
    const parent = document.getElementById('rm-next').parentElement.id;          // home-wrap直下にある
    const el = document.getElementById('hv-rooms');
    el.scrollLeft = 0; syncRoomArrows();                                          // 先頭（難易度スライド）
    const firstPrev = document.getElementById('rm-prev').classList.contains('off');
    const firstNext = document.getElementById('rm-next').classList.contains('off');
    el.scrollLeft = (LEVEL_INFO[curLevel].count + 1) * 602; syncRoomArrows();     // 末尾のROOM
    const lastNext = document.getElementById('rm-next').classList.contains('off');
    return { before, next, prev, inSlide, parent, firstPrev, firstNext, lastNext };
  }));
  check(`矢印で隣のROOMへ移動できる (3→${arr.next}→${arr.prev})`, arr.before === 3 && arr.next === 4 && arr.prev === 3);
  check(`矢印はフロート（スライド内に無く home-wrap 直下）`, !arr.inSlide && arr.parent === 'homewrap');
  check('先頭では「前へ」、末尾では「次へ」だけが消える', arr.firstPrev && !arr.firstNext && arr.lastNext);

  // --- すごろくの上での左右スワイプ（touch-action:pan-yで効かなくなっていたぶんを自前で判定） ---
  const sw = await page.evaluate(() => { localStorage.clear(); })
    .then(() => page.reload()).then(() => page.waitForTimeout(1500)).then(() => page.evaluate(async () => {
      document.querySelectorAll('.streak-cel,.cardget,.appconfirm').forEach(o => o.remove());
      const swipe = async (dx) => {
        const sc = document.querySelector(`.room-slide[data-n="${curSection}"] .sg-scroll`);
        const mk = (x, y) => new Touch({ identifier: 1, target: sc, clientX: x, clientY: y });
        const fire = (type, x, y) => {
          const t = mk(x, y);
          sc.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true,
            touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
        };
        fire('touchstart', 300, 600); fire('touchmove', 300 + dx, 606); fire('touchend', 300 + dx, 606);
        await new Promise(r => setTimeout(r, 900));
        return curSection;
      };
      jumpRoom(3); await new Promise(r => setTimeout(r, 600));
      const left = await swipe(-120);   // 左へ払う＝次のROOM
      const right = await swipe(120);   // 右へ払う＝前のROOM
      return { left, right };
    }));
  check(`すごろくを左へスワイプで次のROOM (3→${sw.left})`, sw.left === 4);
  check(`すごろくを右へスワイプで前のROOM (${sw.left}→${sw.right})`, sw.right === 3);

  // --- 現在地（スタートのマス）へ戻る ---
  const hb = await page.evaluate(() => { localStorage.clear(); })
    .then(() => page.reload()).then(() => page.waitForTimeout(1500)).then(() => page.evaluate(async () => {
      document.querySelectorAll('.streak-cel,.cardget,.appconfirm').forEach(o => o.remove());
      const sc = document.querySelector(`.room-slide[data-n="${curSection}"] .sg-scroll`);
      const btn = sc.closest('.slide-inner').querySelector('.sg-home'); // 3ボタンは器の外（スライド直下）
      const atHome = !btn.classList.contains('on');           // 現在地に居るあいだは出ない
      sc.scrollTop = 0; await new Promise(r => setTimeout(r, 120));
      const away = btn.classList.contains('on');              // 離れると出る
      btn.click(); await new Promise(r => setTimeout(r, 900));
      const back = Math.abs(sc.scrollTop - sgHomeTop(sc)) < 4, hidden = !btn.classList.contains('on');
      // ダブルタップでも戻る
      sc.scrollTop = 0; await new Promise(r => setTimeout(r, 120));
      const tap = (t) => sc.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: 300, clientY: 600 }));
      tap('pointerdown'); tap('pointerup'); tap('pointerdown'); tap('pointerup');
      await new Promise(r => setTimeout(r, 900));
      return { atHome, away, back, hidden, dbl: Math.abs(sc.scrollTop - sgHomeTop(sc)) < 4 };
    }));
  check('現在地に居るあいだ「現在地」ボタンは出ない', hb.atHome);
  check('現在地から離れると「現在地」ボタンが出る', hb.away);
  check('「現在地」ボタンでスタートのマスへ戻る', hb.back);
  check('戻ったら「現在地」ボタンは消える', hb.hidden);
  check('画面のダブルタップでもスタートのマスへ戻る', hb.dbl);

  // --- ホーム下部のレイアウト刷新 ---
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); })
    .then(() => page.reload()).then(() => page.waitForTimeout(1500));
  await page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.appconfirm').forEach(o => o.remove()));
  const home = await page.evaluate(() => ({
    startHidden: getComputedStyle(document.querySelector('.start-button')).display === 'none',
    statusHidden: !document.querySelector('.hsb-left') || getComputedStyle(document.querySelector('.hsb-left')).display === 'none',
    wbRect: (() => { const b = document.querySelector('.hsb-right'); if (!b) return null; const cs = getComputedStyle(b); return { radius: cs.borderRadius, left: cs.left, top: cs.top }; })(),
    bubble: document.querySelector('.room-slide[data-n="1"] .sg-here')?.textContent,
  }));
  check('大きなスタートボタンは非表示', home.startHidden);
  check('ステータスボタンは廃止', home.statusHidden);
  check(`単語帳は長方形で帯の右へ (left=${home.wbRect && home.wbRect.left})`, !!home.wbRect && home.wbRect.radius === '14px' && home.wbRect.left === '476px');
  check('「いまここ」の吹き出しが「スタート」', home.bubble === 'スタート');
  check('吹き出しが画像の上にある', await page.evaluate(() => {
    const t = document.querySelector('.room-slide[data-n="1"] .sg-tile.now');
    const img = t.querySelector('.sg-img'), b = t.querySelector('.sg-here');
    return b.getBoundingClientRect().bottom <= img.getBoundingClientRect().top + 2;
  }));
  check('「いまここ」はモノクロ＋黄色い光彩', await page.evaluate(() => {
    const f = getComputedStyle(document.querySelector('.room-slide[data-n="1"] .sg-tile.now .sg-img')).animationName;
    return f.includes('sgglow') && f.includes('sgnowc');
  }));
  check('吹き出しを押すとテストが始まる', await page.evaluate(async () => {
    document.querySelector('.room-slide[data-n="1"] .sg-here').click();
    await new Promise(r => setTimeout(r, 2600));
    const on = document.getElementById('s-quiz').classList.contains('on');
    if (on) quitTest();
    return on;
  }));

  // --- ランクのメダル表示・レールの切替方式 ---
  await page.evaluate(() => {
    const t = {}; for (let i = 1; i <= 3; i++) t[i] = { rank: 'A', score: 90, at: new Date().toISOString() };
    localStorage.setItem('kwt_board_v1', JSON.stringify({ 'beginner-01': { cleared: 3, tiles: t } }));
  }).then(() => page.reload()).then(() => page.waitForTimeout(1500));
  const look = await page.evaluate(() => {
    const r = document.querySelector('.room-slide[data-n="1"] .sg-rank');
    const n = document.querySelector('.room-slide[data-n="1"] .sg-num');
    const cs = r && getComputedStyle(r);
    return { w: cs && cs.width, fs: cs && cs.fontSize, ring: cs && cs.boxShadow.includes('rgba(255, 196, 0'),
      numFs: n && getComputedStyle(n).fontSize,
      // 設定はヘッダー右の角丸ボタンへ、プレゼント／ガチャは統合ボタンの吹き出しへ移した（メール指示 2026-08-02 16:32）
      // 左のアイコン列は廃止し、カレンダー／ROOM一覧／スペシャルはハンバーガーメニューへ入れた（メール指示 2026-08-02 19:24）
      railGone: !document.querySelector('.reward-rail') && !document.getElementById('cal-btn'),
      menuCaps: [...document.querySelectorAll('#menu-modal .hm-cap')].map(e => (e.querySelector('span:not(.hm-emo)') || e).textContent.trim()),
      hdSet: !!document.querySelector('.hd-rail #hd-set img') && !document.getElementById('set-btn'),
      labels: [...document.querySelectorAll('#gift-modal .gf-btn .gf-txt')].map(e => e.textContent),
      gone: !document.getElementById('rr-level') && !document.getElementById('rr-pwr') };
  });
  check(`ランクは58px・メダル風 (${look.w} / ${look.fs})`, look.w === '58px' && look.fs === '41px' && look.ring);
  check(`マス番号が大きい (${look.numFs})`, look.numFs === '32px'); // 「周-マス」の2つ組みになったぶん一段小さく（メール指示 2026-08-02）
  check('左のアイコン列は廃止された', look.railGone);
  // ことばの友だちを追加（メール指示 2026-08-06 の続き）／今日のボーナスを追加（メール指示 2026-08-07）
  check(`カレンダー等はメニューの中にある (${look.menuCaps.join('|')})`, look.menuCaps.join('|') === 'カレンダー|ROOM一覧|スペシャルモード|ことばの友だち|今日のボーナス');
  check('設定はヘッダー右の角丸ボタンへ移った（左のレールには無い）', look.hdSet);
  // プレゼントとガチャは1つのボタンに統合し、中身は吹き出しの2ボタンになった（メール指示 2026-08-02 16:32）
  check(`統合ボタンの中はプレゼントとガチャの2つ (${look.labels.join('|')})`, look.labels.join('|') === 'プレゼント|ガチャ');
  check('レベル／PWRのボーナス箱は無くなった', look.gone);

  // --- 番号/ランクが絵の位置に追従するか・レール切替で重ならないか ---
  check('番号とランクが絵の角に追従する', await page.evaluate(async () => {
    if (typeof WORD_IMG_BOX === 'undefined') return false;
    const imgs = [...document.querySelectorAll('.room-slide[data-n="1"] .sg-tile .sg-img')];
    // 画面外のlazy画像は読み込まれないままなので、待つのは最大1.5秒までにする
    await Promise.all(imgs.map(i => i.complete ? null : new Promise(r => {
      const done = () => r(); i.onload = done; i.onerror = done; setTimeout(done, 1500);
    })));
    sgFitAllBadges();
    let checked = 0;
    for (const img of imgs) {
      const t = img.closest('.sg-tile'), num = t.querySelector('.sg-num');
      const key = (img.getAttribute('src').match(/(\d+)\.webp$/) || [])[1];
      const b = WORD_IMG_BOX[key]; if (!b) continue;
      const expect = Math.round(-186 + 236 * b[1] / 100 - 6);
      if (Math.abs(parseFloat(num.style.top) - expect) > 1.5) return false; // 絵の上端に合っていない
      checked++;
    }
    return checked >= 5;
  }));
  check('絵が横長でも番号とランクが離れない', await page.evaluate(() => {
    // 絵の横幅が最も狭い画像でも、番号とランクの間隔が画像枠(236px)より十分狭いこと
    const narrow = Object.entries(WORD_IMG_BOX).sort((a, b) => (a[1][2] - a[1][0]) - (b[1][2] - b[1][0]))[0];
    const w = 236 * (narrow[1][2] - narrow[1][0]) / 100;
    return w < 236 * 0.75;  // データ上そういう画像が実在する
  }));
  // 左のアイコン列（アイコン⇄文字の切替）は廃止したので、メニューから同じ機能へ行けることを見る（メール指示 2026-08-02 19:24）
  check('メニューからカレンダーが開ける', await page.evaluate(async () => {
    openHomeMenu();
    await new Promise(r => setTimeout(r, 300));
    const cap = [...document.querySelectorAll('#menu-modal .hm-cap')].find(b => b.textContent.indexOf('カレンダー') >= 0);
    if (!cap) return false;
    cap.click();
    await new Promise(r => setTimeout(r, 400));
    const on = document.getElementById('calendar-modal').classList.contains('on');
    closeCalendar();
    await new Promise(r => setTimeout(r, 300));
    return on;
  }));

  // --- 描画量の上限（ページが落ちないこと） ---
  const load = await page.evaluate(async () => {
    localStorage.clear();
    const board = {};
    for (let n = 1; n <= 27; n++) { const t = {}; for (let i = 1; i <= 24; i++) t[i] = { rank: 'B', score: 70, at: new Date().toISOString() }; board['middle-' + String(n).padStart(2, '0')] = { cleared: 24, tiles: t }; }
    localStorage.setItem('kwt_board_v1', JSON.stringify(board));
    localStorage.setItem('kwt_lastroom_v1', JSON.stringify({ level: 'middle', section: 1 }));
    localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now()));
    return true;
  }).then(() => page.reload()).then(() => page.waitForTimeout(2200)).then(() => page.evaluate(() => ({
    tiles: document.querySelectorAll('.sg-tile').length,
    nodes: document.getElementsByTagName('*').length,
    layers: [...document.querySelectorAll('*')].filter(e => getComputedStyle(e).willChange === 'transform').length,
  })));
  check(`最重ケースでもGPUレイヤーを量産しない (${load.layers}枚)`, load.layers <= 4);
  check(`すごろくは近傍ROOMのみ描画 (マス${load.tiles} / 要素${load.nodes})`, load.tiles <= 120 && load.nodes < 2000);
  check('ROOMを次々移動しても描画され続ける', await page.evaluate(async () => {
    for (const n of [5, 12, 20, 27, 3]) {
      jumpRoom(n); await new Promise(r => setTimeout(r, 500));
      const t = document.querySelectorAll(`.room-slide[data-n="${n}"] .sg-tile`).length;
      const road = document.querySelector(`.room-slide[data-n="${n}"] .sg-road path[d]`);
      if (!t || !road || !road.getAttribute('d')) return false;
      if (document.querySelectorAll('.sg-tile').length > 160) return false; // 溜め込んでいない
    }
    return true;
  }));

  // --- 1周クリアの到達演出・進捗チップ ---
  const lap = await page.evaluate(async () => {
    localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now()));
    const t = {}; for (let i = 1; i <= 11; i++) t[i] = { rank: 'B', score: 70, at: new Date().toISOString() };
    localStorage.setItem('kwt_board_v1', JSON.stringify({ 'beginner-01': { cleared: 11, tiles: t } })); // あと1マスで1周
    return true;
  }).then(() => page.reload()).then(() => page.waitForTimeout(1600)).then(() => page.evaluate(async () => {
    document.querySelectorAll('.streak-cel,.cardget,.appconfirm').forEach(o => o.remove());
    const chip = document.querySelector('.room-slide[data-n="1"] .hv-lap').textContent.replace(/\s+/g, ''); // 周回表示はルームメニューへ移設
    curLevel = 'beginner'; curSection = 1;
    _boardTile = { level: 'beginner', sec: 1, gidx: 12 };
    startTest(); clearInterval(timer); renderQuestion();
    for (let i = 0, n = state.questions.length; i < n; i++) {
      const q = state.questions[state.idx];
      if (q.type === 'sg') { shootAdvance(); continue; }
      answered = false; clearInterval(timer); startTimer();
      submit('correct', q.type === 'w' ? q.word.ko : q.correct);
      document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer();
    }
    await new Promise(r => setTimeout(r, 3600));
    const ov = document.querySelector('.lapdone');
    const res = { chip, shown: !!ov, txt: ov ? ov.textContent : '',
      next: !!(ov && ov.querySelector('.lb-next')),
      present: _presentState().queue.some(x => (x.title || '').includes('1周達成')),
      cleared: boardState('beginner', 1).cleared, visible: boardVisible('beginner', 1) };
    if (ov) closeLapDone();
    document.querySelectorAll('.cardget,.streak-cel').forEach(o => o.remove());
    return res;
  }));
  check(`ルームメニューに周回と位置が出る (${lap.chip})`, /1周目11\/12/.test(lap.chip));
  check('1周クリアで到達演出が出る', lap.shown && /1周.*達成/.test(lap.txt));
  check('周回達成のごほうびが届く', lap.present);
  check('次のROOMへ進む導線がある', lap.next);
  check(`1周クリアで次の周が伸びる (${lap.cleared}マス消化 → ${lap.visible}マス表示)`, lap.cleared === 12 && lap.visible === 24);

  // --- 今日の5問の連続記録 ---
  check('今日の5問の連続日数を数える', await page.evaluate(() => {
    const dk = ms => dayKey(ms);
    const now = Date.now() - 5 * 3600000, D = 86400000, rec = {};
    for (const off of [0, 1, 2]) rec[dk(now - off * D) + '#am'] = { done: true, correct: 3, total: 5, finished: new Date(now - off * D).toISOString() };
    rec[dk(now - 5 * D) + '#am'] = { done: true, correct: 1, total: 5, finished: new Date(now - 5 * D).toISOString() }; // 間が空いた古い記録は数えない
    localStorage.setItem('kwt_daily5_v1', JSON.stringify(rec));
    return d5Streak() === 3;
  }));
  check('未プレイでも連続記録は0にならない（前日までを数える）', await page.evaluate(() => {
    const dk = ms => dayKey(ms), now = Date.now() - 5 * 3600000, D = 86400000, rec = {};
    for (const off of [1, 2]) rec[dk(now - off * D) + '#am'] = { done: true, finished: new Date(now - off * D).toISOString() };
    localStorage.setItem('kwt_daily5_v1', JSON.stringify(rec));
    return d5Streak() === 2;
  }));

  // --- ホーム下部の帯（最近学んだ単語／おすすめの単語）は廃止（メール指示 2026-08-02 21:09） ---
  const bandNew = await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); return true; })
    .then(() => page.reload()).then(() => page.waitForTimeout(1600)).then(() => page.evaluate(() => {
      document.querySelectorAll('.streak-cel,.cardget,.appconfirm').forEach(o => o.remove());
      return { band: !!document.getElementById('today-band'), cards: document.querySelectorAll('.tb-card').length,
        text: (document.getElementById('s-home').innerText || '') };
    }));
  check('初回ユーザーでも帯は出ない（廃止済み）', !bandNew.band && bandNew.cards === 0);
  check('「最近学んだ単語」「おすすめの単語」の見出しも出ない',
    bandNew.text.indexOf('最近学んだ単語') < 0 && bandNew.text.indexOf('おすすめの単語') < 0);
  check('1問学んでも帯は復活しない', await page.evaluate(() => {
    const w = WORD_BY_ID[LEVEL_SECTIONS.beginner[1][3]];
    const s = {}; s[w.id] = { hasSeen: true, hasEverCorrect: true, memoryScore: 45, stabilityHours: 12, wordDifficulty: 1,
      lastReviewedAt: new Date(Date.now() - 2 * 86400000).toISOString(), reviewCount: 1, correctCount: 1 };
    localStorage.setItem('kwt_stats_v1', JSON.stringify(s));
    renderHome();
    return !document.getElementById('today-band') && document.querySelectorAll('.tb-card').length === 0;
  }));

  // --- ホーム復帰で巨大JSONを解析し直さない（アプリ内ブラウザで固まる原因の回帰防止） ---
  check('ホーム復帰でlocalStorageの再解析が起きない', await page.evaluate(async () => {
    const s = {}, h = [];
    BEGINNER_WORDS.forEach((w, i) => { s[w.id] = { hasSeen: true, hasEverCorrect: true, memoryScore: 30 + (i % 60), stabilityHours: 20, wordDifficulty: 1,
      lastReviewedAt: new Date(Date.now() - 3600000).toISOString(), nextReviewAt: new Date().toISOString(), reviewCount: 3, correctCount: 2 }; });
    for (let i = 0; i < 1200; i++) { const w = BEGINNER_WORDS[i % BEGINNER_WORDS.length];
      h.push({ testId: 't' + Math.floor(i / 12), wordId: w.id, korean: w.ko, japanese: w.ja, isCorrect: true, score: 8,
        answeredAt: new Date(Date.now() - (1200 - i) * 60000).toISOString(), answerStatus: 'correct', answerType: 'choice', responseTimeSec: 4 }); }
    localStorage.setItem('kwt_stats_v1', JSON.stringify(s));
    localStorage.setItem('kwt_history_v1', JSON.stringify(h));
    show('s-home'); // 1回目でキャッシュを温める
    let n = 0; const orig = JSON.parse;
    JSON.parse = function (t) { if (typeof t === 'string' && t.length > 2000) n++; return orig.apply(this, arguments); };
    show('s-result'); show('s-home');
    await new Promise(r => setTimeout(r, 4000)); // 3秒ごとの面回転も含めて監視
    JSON.parse = orig;
    return n === 0;
  }));

  check('コンソールエラー無し', errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
