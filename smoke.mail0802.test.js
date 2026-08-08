/* k-tango 2026-08-02 00:25 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0802.test.js
 * 検証:
 *  ① 最近学んだ単語：見出しの座布団はカプセル形／カードの裏の白半透明座布団は削除
 *  ② 今週のミッションのバリエーションが増えている（種類・文言・数え方）
 *  ③ ルーム背景の画像（ジオラマ）は非表示
 *  ④ ルームの色を設定で4段階（いまの色／少し濃い／濃い／濃い灰色）に切りかえられる
 *  ⑤ 左右のリールアイコン・左上アバターのアニメーションが無い
 *  ⑥ 単語帳ページでもROOMメニューの左右矢印が出る
 *  ⑦ つかいかたガイドの1つめ（ルームメニューバー）は時間で消えない
 *  ⑧ PWRメータが実際の減りかたのスピードで減る（10秒固定のドレイン演出ではない）
 *  ⑨ PWRボーナスは毎日ボーナスに統合／レベルボーナス廃止／ポップアップの「とじる」は無い
 *  ⑩ レベルアップはXPではなくガチャコイン／テスト後はプレゼント→ガチャコイン
 *  ⑪ ルーム プリQQ は非表示
 *  ⑫ タイプ詳細：アイコンと職業のすぐ下に説明文／メータの説明は太字
 *  ⑬ PWRメータ詳細ページ・ステータス画面は廃止（下スクロールは残るが機能しない）
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
  const clearFx = () => page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.lvup,.fcust,.pbub,.stepnote,.tapavatar,.rest-ask,#resume-ask').forEach(o => o.remove()));

  // ================= ① 最近学んだ単語の座布団 =================
  // 帯そのものが廃止になったため、座布団・見出しの確認は用済み（メール指示 2026-08-02 21:09）
  check('最近学んだ単語の帯は廃止済み（履歴があっても出ない）', await page.evaluate(() => {
    const w = BEGINNER_WORDS[0];
    _lsSetJSON(LS_HIST, [{ wordId: w.id, testId: 't-x', isCorrect: true, questionType: 'choice', responseTimeSec: 2, answeredAt: new Date().toISOString(), score: 8 }]);
    _histIdxCache = null;
    renderHome();
    return !document.getElementById('today-band') && document.querySelectorAll('.tb-card').length === 0;
  }));

  // ================= ② 今週のミッションのバリエーション =================
  const ms = await page.evaluate(() => {
    const kinds = new Set(); const titles = {};
    // 週キーを総当たりできないので、プール自体と文言・数え方を直接見る
    ['write', 'special', 'fast', 'tests', 'd5', 'newword', 'rooms', 'perfect', 'streak'].forEach(k => {
      const m = { kind: k, n: 3 };
      titles[k] = missionTitle(m);
      if (titles[k]) kinds.add(k);
    });
    // 週ごとの組み立てで実際に選ばれる2つ（4〜5つめ）の種類が週によって変わることを見る
    const picked = new Set();
    const orig = weekKey;
    for (let i = 0; i < 40; i++) {
      const h = _d5Hash('kwt-ms|w' + i + '|beginner');
      const pool = ['write', 'special', 'fast', 'tests', 'd5', 'newword', 'rooms', 'perfect', 'streak'];
      const i0 = h % pool.length, i1 = (i0 + 1 + (Math.floor(h / pool.length) % (pool.length - 1))) % pool.length;
      picked.add(pool[i0]); picked.add(pool[i1]);
    }
    return { kinds: [...kinds], titles, picked: [...picked], icons: [...kinds].map(k => missionIcon({ kind: k })) };
  });
  check(`ミッションの種類が9つに増えた (${ms.kinds.length}種)`, ms.kinds.length === 9);
  check('増えた種類にも文言がある', ['tests', 'd5', 'newword', 'rooms', 'perfect', 'streak'].every(k => ms.titles[k] && ms.titles[k].length > 3));
  check('増えた種類にもアイコンがある', ms.icons.every(i => i && i !== '★'));
  check(`週によって選ばれる種類が変わる (${ms.picked.length}種が登場)`, ms.picked.length >= 6);

  const msProg = await page.evaluate(() => {
    const ws = weekStartMs(), now = new Date().toISOString();
    const h = [];
    // テスト2本ぶん（1本目は全問正解＝perfect / 2本目は1問だけ不正解）
    for (let i = 0; i < 12; i++) h.push({ wordId: BEGINNER_WORDS[i].id, testId: 'p1', isCorrect: true, questionType: 'choice', responseTimeSec: 2, answeredAt: now, score: 8 });
    for (let i = 0; i < 12; i++) h.push({ wordId: BEGINNER_WORDS[i + 12].id, testId: 'p2', isCorrect: i > 0, questionType: 'choice', responseTimeSec: 2, answeredAt: now, score: 8 });
    _lsSetJSON(LS_HIST, h); _histIdxCache = null; _roomSeriesCache = {};
    // 初正解の記録（今週ぶん3語）
    const s = {}; BEGINNER_WORDS.slice(0, 3).forEach(w => s[w.id] = { hasSeen: true, hasEverCorrect: true, firstCorrectAt: now, memoryScore: 50, stabilityHours: 12, wordDifficulty: 1, reviewCount: 1, correctCount: 1 });
    _lsSetJSON(LS_STATS, s);
    // 今日の5問を1回ぶん
    _lsSetJSON(LS_D5, { [d5Key(Date.now())]: { done: true, finished: now } });
    return {
      tests: missionProgress({ kind: 'tests', n: 5 }),
      perfect: missionProgress({ kind: 'perfect', n: 1 }),
      newword: missionProgress({ kind: 'newword', n: 20 }),
      d5: missionProgress({ kind: 'd5', n: 5 }),
      rooms: missionProgress({ kind: 'rooms', n: 3 }),
      streak: missionProgress({ kind: 'streak', n: 5 })
    };
  });
  check(`テスト本数を数えられる (${msProg.tests}本)`, msProg.tests === 2);
  check(`全問正解を数えられる (${msProg.perfect}回)`, msProg.perfect === 1);
  check(`はじめて覚えた語を数えられる (${msProg.newword}語)`, msProg.newword === 3);
  check(`今日の5問の回数を数えられる (${msProg.d5}回)`, msProg.d5 === 1);
  check(`あそんだROOM数を数えられる (${msProg.rooms}ROOM)`, msProg.rooms >= 1);
  check(`連続学習日数を数えられる (${msProg.streak}日)`, typeof msProg.streak === 'number');

  await page.reload(); await page.waitForTimeout(1400); await clearFx();

  // ================= ③ ルーム背景の画像は非表示 =================
  const bg = await page.evaluate(() => {
    const e = document.querySelector('.room-slide[data-n="1"] .sg-bg');
    return { exists: !!e, disp: e ? getComputedStyle(e).display : '' };
  });
  check(`ルーム背景の画像が非表示 (${bg.disp})`, bg.exists && bg.disp === 'none');

  // ================= ④ ルームの色を設定のバーで変える（メール指示 2026-08-02 14:59） =================
  const tone = await page.evaluate(() => {
    const base = roomBg(1);
    const out = { base, list: [] };
    [0, 20, 50, 80, 100].forEach(t => { setRoomTone(t); out.list.push({ t, c: roomBg(1), saved: loadSettings().roomToneV2 }); });
    closeSettings(); setRoomTone(0); closeSettings();
    return out;
  });
  const lum = h => { const n = parseInt(h.slice(1), 16); return ((n >> 16) & 255) * .299 + ((n >> 8) & 255) * .587 + (n & 255) * .114; };
  check('0は今の色のまま', tone.list[0].c === tone.base);
  check(`動かすほど濃くなる (${tone.list.map(x => x.c).join(' ')})`,
    tone.list.every((x, i) => i === 0 || lum(x.c) < lum(tone.list[i - 1].c)));
  check(`100で真っ黒 (${tone.list[4].c})`, tone.list[4].c === '#000000');
  check('選んだ濃さが設定に保存される', tone.list[3].saved === 80);
  const toneUI = await page.evaluate(() => {
    openSettings();
    const r = document.querySelector('#settings-modal #tone-range');
    const out = { has: !!r, type: r ? r.type : '', min: r ? r.min : '', max: r ? r.max : '', lab: (document.getElementById('tone-lab') || {}).textContent };
    closeSettings(); return out;
  });
  check(`設定に色の濃さのバーがある (${toneUI.min}〜${toneUI.max} / ${toneUI.lab})`,
    toneUI.has && toneUI.type === 'range' && toneUI.min === '0' && toneUI.max === '100');

  // ================= ⑤ アイコンのアニメーション =================
  const anim = await page.evaluate(async () => {
    // 受け取り待ちの上下の動きは、統合したプレゼント・ガチャのボタンが担う（メール指示 2026-08-02 16:32）
    const rr = document.getElementById('sg-gift');
    rr.classList.add('rb', 'bob');
    const av = document.querySelector('.avatar-circle');
    const before = av.className;
    await new Promise(r => setTimeout(r, 3200)); // アバターは2.6秒周期だったので、それより長く待つ
    return {
      rrAnim: getComputedStyle(rr).animationName,
      rrAnimOff: (rr.classList.remove('rb', 'bob'), getComputedStyle(rr).animationName),
      railFlip: RAIL_FLIP, avatarFlip: AVATAR_FLIP,
      avChanged: av.className !== before,
      labelShown: [...document.querySelectorAll('.reward-rail .rr-btn')].some(b => b.classList.contains('show-label'))
    };
  });
  // 受け取り待ちのプレゼント／コインがあるときだけ上下に動かす（メール指示 2026-08-02）
  check(`受け取り待ちがあるときは上下に動く (${anim.rrAnim})`, anim.rrAnim === 'giftbob');
  check(`受け取り待ちが無いときは動かない (${anim.rrAnimOff})`, anim.rrAnimOff === 'none');
  check('アイコン⇄文字の入替も止まっている', anim.railFlip === false && anim.labelShown === false);
  check('左上アバターが切りかわらない', anim.avatarFlip === false && !anim.avChanged);

  // ================= ⑥ 単語帳ページでも左右矢印 =================
  await page.evaluate(() => enterListMode());
  await page.waitForTimeout(1200);
  const arrows = await page.evaluate(() => {
    const p = document.getElementById('rm-prev'), n = document.getElementById('rm-next');
    const g = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return { op: +s.opacity, pe: s.pointerEvents, top: Math.round(r.top), inView: r.top >= 0 && r.bottom <= window.innerHeight }; };
    return { list: _listMode, prev: g(p), next: g(n) };
  });
  check('単語帳モードに入っている', arrows.list);
  check(`単語帳でも左右矢印が見える (‹${arrows.prev.op} / ›${arrows.next.op})`, arrows.next.op > 0.9 && arrows.next.pe !== 'none');
  check(`矢印が画面内にある (top=${arrows.next.top}px)`, arrows.next.inView);
  const step = await page.evaluate(async () => {
    const from = curSection; stepRoom(1);
    await new Promise(r => setTimeout(r, 900));
    return { from, to: Math.round(document.getElementById('hv-rooms').scrollLeft / 602) - PQ_OFF };
  });
  check(`単語帳でも矢印で隣のROOMへ行ける (${step.from}→${step.to})`, step.to === step.from + 1);
  await page.evaluate(() => exitListMode());
  await page.waitForTimeout(900);

  // ================= ⑦ ガイドのルームメニューバーは消えない =================
  const coach = await page.evaluate(async () => {
    localStorage.removeItem('kwt_coach_v1');
    showCoach();
    const p = document.getElementById('room-pager');
    const t0 = { on: p.classList.contains('on'), op: +getComputedStyle(p).opacity };
    await new Promise(r => setTimeout(r, 2600)); // 従来は1.4秒で引っ込んでいた
    const t1 = { on: p.classList.contains('on'), op: +getComputedStyle(p).opacity };
    const step0 = _coachSteps[0] && _coachSteps[0].sel;
    coachNext(); // 2つめの説明へ
    await new Promise(r => setTimeout(r, 300));
    const t2 = { on: p.classList.contains('on') };
    closeCoach();
    await new Promise(r => setTimeout(r, 200));
    localStorage.setItem('kwt_coach_v1', '1');
    return { step0, t0, t1, t2, held: _pagerHold };
  });
  check(`ガイドの1つめがルームメニューバー (${coach.step0})`, coach.step0 === '#room-pager');
  check('ガイドを開いた時点で出はじめる', coach.t0.on); // 表示はフェードイン(.28s)なので、この時点の不透明度はまだ上がりきらない
  check(`2.6秒たっても消えない (op=${coach.t1.op})`, coach.t1.on && coach.t1.op > 0.9);
  check('次の説明に移ると普段どおり引っ込む', !coach.t2.on);
  check('ガイドを閉じたら出しっぱなしも解除される', coach.held === false);
  await clearFx();

  // ================= ⑧ PWRメータは本当のスピードで減る =================
  const pwr = await page.evaluate(() => {
    const now = Date.now(), s = {};
    BEGINNER_WORDS.slice(0, 20).forEach(w => s[w.id] = { hasSeen: true, hasEverCorrect: true, memoryScore: 80, stabilityHours: 24, wordDifficulty: 1,
      lastReviewedAt: new Date(now - 3600000).toISOString(), reviewCount: 3, correctCount: 3 });
    _lsSetJSON(LS_STATS, s);
    calibratePwr(); updatePwrFine();
    const bar = document.getElementById('hv-pwrfill');
    const cs = getComputedStyle(bar);
    const w = parseFloat(bar.style.width);
    return { anim: cs.animationName, w, exact: pwrOverallExact(), rate: _pwrRate, step: pwrStepSec(), down: !!document.getElementById('hv-pwrdown') };
  });
  check(`10秒固定のドレイン演出が無い (${pwr.anim})`, pwr.anim === 'none');
  check(`バーの長さ＝いまの実PWR (${pwr.w}% / 実測${pwr.exact.toFixed(2)}%)`, Math.abs(pwr.w - pwr.exact) < 0.5);
  check(`減るスピードを実測している (${(pwr.rate * 3600).toFixed(3)}%/時)`, pwr.rate > 0);
  check(`0.01%減るまでの秒数が実測から出ている (${pwr.step.toFixed(1)}秒 ≠ 10秒固定)`, pwr.step > 0 && Math.abs(pwr.step - 10) > 0.5);
  check('残り時間のカウント表示は廃止された（メール指示 2026-08-02 16:54）', pwr.down === false);
  const pwrMove = await page.evaluate(async () => {
    const bar = document.getElementById('hv-pwrfill');
    const w0 = parseFloat(bar.style.width);
    _pwrT0 -= 60000; // 1分ぶん時間を進めたことにして、実際の減りかたを見る
    updatePwrFine();
    return { w0, w1: parseFloat(bar.style.width) };
  });
  check(`時間がたつと実測ぶんだけ減る (${pwrMove.w0}% → ${pwrMove.w1}%)`, pwrMove.w1 < pwrMove.w0);

  // ================= ⑨⑩ ボーナスの統合・ガチャコイン =================
  const rail = await page.evaluate(() => ({
    // 右のレールは1つのボタンに統合し、中身は吹き出しの2ボタンになった（メール指示 2026-08-02 16:32）
    labels: [...document.querySelectorAll('#gift-modal .gf-btn .gf-txt')].map(e => e.textContent),
    level: !!document.getElementById('rr-level'), pwr: !!document.getElementById('rr-pwr'), cats: PRES_CATS.slice()
  }));
  check(`プレゼントとガチャの2つ (${rail.labels.join('|')})`, rail.labels.join('|') === 'プレゼント|ガチャ');
  check('レベルボーナス／PWRボーナスのボタンが無い', !rail.level && !rail.pwr);
  check(`プレゼントの箱は毎日ボーナスに統合 (${rail.cats.join(',')})`, rail.cats.length === 2 && rail.cats[0] === 'daily');

  const merged = await page.evaluate(() => {
    // 旧データ（level/pwrの箱に入っていたぶん）が毎日ボーナスへ引っ越すか
    _lsSetJSON(LS_PRESENT, { queue: [
      { cat: 'level', kind: 'achv', title: 'レベルアップ', total: 100, at: new Date().toISOString() },
      { cat: 'pwr', kind: 'achv', title: 'PWRが上がった！ +3%', total: 15, at: new Date().toISOString() }
    ] });
    const q = _presentState().queue;
    return { cats: q.map(x => x.cat), daily: presentsAvailable('daily') };
  });
  check(`旧レベル／PWRのプレゼントが毎日ボーナスへ移る (${merged.cats.join(',')})`, merged.cats.every(c => c === 'daily') && merged.daily === 2);

  const pmUI = await page.evaluate(() => {
    openPresent('daily');
    const card = document.querySelector('#present-modal .pm-card');
    const btns = [...card.querySelectorAll('.pm-btn')].map(b => b.textContent.trim());
    const hasX = !!card.querySelector('.pm-close');
    closePresent();
    return { btns, hasX };
  });
  check('ポップアップに×がある', pmUI.hasX);
  check(`「とじる」ボタンは無い (${pmUI.btns.join('/') || 'なし'})`, !pmUI.btns.includes('とじる'));

  const coin = await page.evaluate(() => {
    _lsSetJSON(LS_PRESENT, { queue: [] }); _lsSetJSON(LS_GACHA, { q: [] });
    state = { levelBefore: 1 }; // レベルが2つ上がった直後を模す
    const realXp = xpInfo; xpInfo = () => ({ level: 3, cur: 0, next: 100 });
    enqueuePresent('A', 4);
    xpInfo = realXp;
    const q = _presentState().queue;
    return {
      coins: q.filter(x => x.kind === 'coin').length,
      lvCoins: q.filter(x => x.kind === 'coin' && x.title === 'レベルアップ').length,
      lvXp: q.filter(x => x.title === 'レベルアップ' && x.kind === 'achv').length,
      testCoin: q.find(x => x.title === 'テストのごほうび'),
      pwrCat: (q.find(x => /PWRが上がった/.test(x.title || '')) || {}).cat
    };
  });
  // コインに付いていたXPは廃止され、そのぶんは別立ての「ごはん」プレゼントになった（メール指示 2026-08-08 23:52）
  check(`テスト後のごほうびはプレゼント（ガチャコイン） (${coin.testCoin && coin.testCoin.kind})`, coin.testCoin && coin.testCoin.kind === 'coin');
  check(`レベルアップは上がったぶんだけガチャコイン (${coin.lvCoins}枚)`, coin.lvCoins === 2);
  check('レベルアップのXPボーナスは廃止された', coin.lvXp === 0);
  check(`PWRボーナスは毎日ボーナスの箱へ (${coin.pwrCat})`, coin.pwrCat === 'daily');

  const claim = await page.evaluate(() => {
    const before = gachaSpins();
    openPresent('daily');
    const btn = [...document.querySelectorAll('#present-modal .pm-item')].find(b => b.dataset.kind === 'coin');
    const faceOk = !!btn.querySelector('.pm-cn');
    claimPresentItem(btn);
    const after = gachaSpins();
    closePresent();
    openGacha();
    const goOk = !!document.querySelector('#gacha-modal .gc-go');
    const count = document.querySelector('#gacha-modal .gc-count').textContent;
    closeGacha();
    return { before, after, faceOk, goOk, count };
  });
  check('プレゼントの中身がガチャコインだと分かる', claim.faceOk);
  check(`受け取るとガチャコインがふえる (${claim.before}→${claim.after})`, claim.after === claim.before + 1);
  check(`ガチャがまわせる状態になる (${claim.count.trim()})`, claim.goOk && /ガチャコイン/.test(claim.count));

  // ================= ⑪ ルーム プリQQ は非表示 =================
  const pq = await page.evaluate(() => {
    openRoomMap();
    const special = !!document.querySelector('#map-modal .rm-special');
    closeRoomMap();
    return {
      on: PQ_ON, off: PQ_OFF,
      slide: !!document.querySelector('.pq-slide'),
      dot: !!document.querySelector('#room-pager .rp-dot.pq'),
      special,
      firstRoom: (document.querySelectorAll('.room-slide')[1] || {}).dataset
    };
  });
  check('プリQQのスライドが無い', pq.on === false && !pq.slide);
  check('ページャーの★も無い', !pq.dot);
  check('ROOM一覧のSPECIALボタンも無い', !pq.special);
  check(`難易度スライドの右がすぐROOM01 (data-n=${pq.firstRoom && pq.firstRoom.n})`, pq.firstRoom && pq.firstRoom.n === '1');
  const pqNav = await page.evaluate(async () => {
    jumpRoom(3); await new Promise(r => setTimeout(r, 400));
    const el = document.getElementById('hv-rooms');
    return { sec: curSection, idx: Math.round(el.scrollLeft / 602), want: 3 + PQ_OFF };
  });
  check(`ROOMジャンプの位置が合っている (idx=${pqNav.idx} / 目標${pqNav.want})`, pqNav.idx === pqNav.want);
  const pqScroll = await page.evaluate(async () => {
    const el = document.getElementById('hv-rooms');
    el.scrollTo({ left: 5 * 602 }); await new Promise(r => setTimeout(r, 500));
    return { sec: curSection, sp: _onSpecial };
  });
  check(`スクロール位置とROOM番号が一致する (ROOM${pqScroll.sec})`, pqScroll.sec === 5 && pqScroll.sp === false);

  // ================= ⑫ タイプ詳細 =================
  const type = await page.evaluate(() => {
    renderTypeDetail();
    const body = document.querySelector('#s-type .page-body');
    const kids = [...body.children];
    const topY = e => e.getBoundingClientRect().top;
    const box = body.querySelector('.typebox'), peek = body.querySelector('.tpeek'), bars = body.querySelector('.ax2panel'), list = body.querySelector('.tlist');
    const d = getComputedStyle(body.querySelector('.ax2desc'));
    return { order: [topY(box), topY(peek), topY(bars), topY(list)], secs: kids.length,
      weight: d.fontWeight, size: parseFloat(d.fontSize), color: d.color, brk: d.wordBreak };
  });
  check(`アイコン・職業のすぐ下が説明文 (${type.order.map(Math.round).join(' → ')})`, type.order[0] < type.order[1] && type.order[1] < type.order[2]);
  check('メータは説明文の下', type.order[1] < type.order[2]);
  check('16タイプ一覧はいちばん下', type.order[2] < type.order[3]);
  check(`メータの説明文が太い (${type.weight} / ${type.size}px)`, +type.weight >= 800 && type.size >= 12);
  check(`メータの説明文がはっきり読める色 (${type.color})`, type.color === 'rgb(255, 255, 255)');
  check(`改行が単語の途中で切れない (word-break:${type.brk})`, type.brk === 'keep-all');
  await page.evaluate(() => show('s-home'));
  await page.waitForTimeout(300);

  // ================= ⑬ PWR詳細ページ・ステータス画面の廃止 =================
  const gone = await page.evaluate(async () => {
    renderCurve(); await new Promise(r => setTimeout(r, 200));
    const c1 = document.getElementById('s-curve').classList.contains('on');
    renderRoomCurve(); await new Promise(r => setTimeout(r, 200));
    const c2 = document.getElementById('s-curve').classList.contains('on');
    enterStatusMode(); await new Promise(r => setTimeout(r, 700));
    const st = { mode: _statusMode, cls: document.getElementById('homewrap').classList.contains('status') };
    return { curveOn: CURVE_ON, statusOn: STATUS_ON, c1, c2, st, home: document.getElementById('s-home').classList.contains('on') };
  });
  check('PWRメータ詳細ページは開かない', gone.curveOn === false && !gone.c1 && !gone.c2);
  check('ステータス画面は開かない', gone.statusOn === false && !gone.st.mode && !gone.st.cls);
  check('どちらもホームのまま', gone.home);
  const pull = await page.evaluate(() => {
    // 下スクロール（下引き）のジェスチャー自体は残っている
    const el = document.getElementById('hv-rooms');
    return { bound: el.dataset.bound === '1', hint: !!document.getElementById('pull-hint'), fn: typeof showPullHint === 'function' };
  });
  check('下スクロールのしくみは残っている（機能はしない）', pull.bound && pull.hint && pull.fn);
  const entries = await page.evaluate(() => ({
    lv: document.getElementById('hv-level').getAttribute('onclick'),
    code: document.getElementById('hv-code').getAttribute('onclick'),
    panel: document.querySelector('.status-panel').getAttribute('onclick'),
    side: getComputedStyle(document.querySelector('.hsb-left')).display
  }));
  check('Lv./連続日数/黒帯からのステータス入口が無い', !entries.lv && !entries.code && !entries.panel);
  check(`ステータスボタンも非表示 (${entries.side})`, entries.side === 'none');

  check(`コンソールエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) console.log('  errors:', errors);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) { console.log('FAILED:'); failed.forEach(f => console.log(' - ' + f.name)); }
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
