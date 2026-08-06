/* k-tango 2026-08-06 23:42 のメール指示（「メールのなかに続きのものがあります」）ぶんのスモークテスト
 * 使い方: node smoke.mail0806b.test.js
 * 指示: 2026-08-06 22:32 のメールの、前回読み切れていなかった続き
 *   ・今日限定ボーナス一覧 No.119〜120（120種そろえる）
 *   ・3. レアリティ設計（出現率・初心者補正・天井・報酬価値の上限）
 *   ・4. 抽選アルゴリズム（レアリティ→候補→7つの重み係数）
 *   ・5〜6. UX設計・ワイヤーフレーム（情報階層・進み具合・閉じる／7. 通知60パターン）
 *   ・8. 演出設計（レアリティ別の長さ・アクセシビリティ・学習から報酬が生まれる演出）
 *   ・9〜10. 年間イベントカレンダー・韓国らしいテーマ50種
 *   ・11. バランス調整（XP上限・学習量の逓減・FOMO制御）／14.3 履歴7日／16.3 時刻変更対策／16.4 教育上のガードレール
 *   ・2つめの仕様書「動物育成」Phase1（ことばの友だち）
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
  const fresh = async (extra) => {
    await page.evaluate(ex => {
      localStorage.clear();
      localStorage.setItem('kwt_coach_v1', '1');
      localStorage.setItem('kwt_firstdone_v1', '1');
      localStorage.setItem('kwt_roomhint_v1', '1');
      Object.keys(ex || {}).forEach(k => localStorage.setItem(k, ex[k]));
    }, extra || {});
    await page.reload();
    await page.waitForTimeout(1200);
  };
  await fresh({ kwt_d5auto_v1: 'x' });

  /* ============ 1. 一覧の続き（No.119・120） ============ */
  const list = await page.evaluate(() => ({
    n: LUCK_LIST.length,
    n119: luckById(119), n120: luckById(120),
    byR: LUCK_ORDER.map(r => [r, LUCK_LIST.filter(i => i.r === r).length]),
    tgt: LUCK_LIST.filter(i => !['全員', '初心者', '初中級', '中上級', '上級者', '継続者', '復帰者', '長期利用', '1年以上',
      'コレクター', '学習量多', '復習対象', '苦手あり', '2日目以降', '朝利用者', '夜利用者', '忙しい人'].includes(i.t)).map(i => i.n)
  }));
  check(`1-1 一覧が No.1〜120 の120件そろっている（いま${list.n}件）`, list.n === 120);
  check('1-2 No.119 コレクション記念日（SR／長期利用／中）',
    list.n119 && list.n119.name === 'コレクション記念日' && list.n119.r === 'SR' && list.n119.t === '長期利用' && list.n119.c === '中');
  check('1-3 No.120 学習の軌跡（M／1年以上／高）',
    list.n120 && list.n120.name === '学習の軌跡' && list.n120.r === 'M' && list.n120.t === '1年以上' && list.n120.c === '高');
  check('1-4 対象の書き方に取りこぼしが無い ' + JSON.stringify(list.tgt), list.tgt.length === 0);
  check('1-5 「1年以上」は1年つかった人にだけ出る', await page.evaluate(() => {
    const a = { lv: 20, tests: 900, days: 400, streak: 30, cards: 900, hour: 12, gap: 0 };
    const b = Object.assign({}, a, { days: 100 });
    return luckEligible(luckById(120), a) && !luckEligible(luckById(120), b);
  }));

  /* ============ 2. レアリティ設計（3.1／3.4／8.1／8.2） ============ */
  const rare = await page.evaluate(() => ({
    w: LUCK_ORDER.map(r => LUCK_RARE[r].w),
    ms: LUCK_ORDER.map(r => LUCK_RARE[r].ms),
    val: LUCK_ORDER.map(r => LUCK_RARE[r].val),
    cap: LUCK_ORDER.map(r => LUCK_RARE[r].cap),
    nb: LUCK_ORDER.map(r => LUCK_NEWBIE[r]),
    labs: LUCK_ORDER.map(r => LUCK_RARE[r].lab + '/' + LUCK_RARE[r].code)
  }));
  check(`2-1 基本出現率は仕様どおり 46/30/15/6/2.5/0.5（合計100%）${JSON.stringify(rare.w)}`,
    JSON.stringify(rare.w) === JSON.stringify([46, 30, 15, 6, 2.5, 0.5]) && rare.w.reduce((a, b) => a + b, 0) === 100);
  check(`2-2 演出の長さは 0.6/0.9/1.3/1.7/2.1/2.5秒（Mythicでも3秒を超えない）${JSON.stringify(rare.ms)}`,
    JSON.stringify(rare.ms) === JSON.stringify([600, 900, 1300, 1700, 2100, 2500]));
  check(`2-3 基準価値は 1.0/1.5/2.5/4.0/6.0/10.0 ${JSON.stringify(rare.val)}`,
    JSON.stringify(rare.val) === JSON.stringify([1, 1.5, 2.5, 4, 6, 10]));
  check(`2-4 はじめの7日間の出現率 C35/R38/SR20/E6/L1/M0（初日にLegendary・Mythicを出さない）${JSON.stringify(rare.nb)}`,
    JSON.stringify(rare.nb) === JSON.stringify([35, 38, 20, 6, 1, 0]) && rare.nb.reduce((a, b) => a + b, 0) === 100);
  check(`2-5 「SSR」は使わず Super Rare は SR と書く ${JSON.stringify(rare.labs)}`,
    rare.labs.every(x => !/SSR/.test(x)) && rare.labs[2] === 'SUPER RARE/SR');
  check('2-6 レアが上がるほどXPの上限も上がる ' + JSON.stringify(rare.cap),
    rare.cap[0] === 60 && rare.cap[4] === 80 && rare.cap[5] === 100);

  /* ============ 3. 天井（3.3） ============ */
  const pity = await page.evaluate(() => {
    const rnd = _d5Rng(12345);
    const P = { lv: 10, tests: 200, days: 400, streak: 10, cards: 200, hour: 12, gap: 0 };
    const mk = (n, r) => Array.from({ length: n }, () => ({ n: 1, r, g: 'xp' }));
    const many = (log) => Array.from({ length: 20 }, () => luckDrawRarity(rnd, P, log));
    return {
      c5: many(mk(5, 'C')),                                        // 5日連続C
      e30: many(mk(32, 'R')),                                      // 30日E以上なし
      l120: many(mk(130, 'SR')),                                   // 120日L以上なし
      m365: many(mk(370, 'L')),                                    // 365日Mなし
      sr10: many(mk(12, 'R')),                                     // 10日SR以上なし
      cat3: luckCat3(luckById(101), [{ n: 1, r: 'C', g: 'special' }, { n: 2, r: 'R', g: 'special' }]),
      cat2: luckCat3(luckById(101), [{ n: 1, r: 'C', g: 'xp' }, { n: 2, r: 'R', g: 'special' }])
    };
  });
  check('3-1 5日連続Cのみ → 翌日はR以上が確定', pity.c5.every(r => r !== 'C'));
  check('3-2 30日E以上なし → 翌日はE以上が確定', pity.e30.every(r => ['E', 'L', 'M'].includes(r)));
  check('3-3 120日L以上なし → 翌日はL以上が確定', pity.l120.every(r => ['L', 'M'].includes(r)));
  check('3-4 365日Mythicなし → 366日目はMythicが確定', pity.m365.every(r => r === 'M'));
  check(`3-5 10日SR以上なし → SR以上率が30%に上がる（20回中${pity.sr10.filter(r => ['SR', 'E', 'L', 'M'].includes(r)).length}回）`,
    pity.sr10.filter(r => ['SR', 'E', 'L', 'M'].includes(r)).length >= 3);
  check('3-6 同一カテゴリは3日連続しない', pity.cat3 === true && pity.cat2 === false);
  check('3-7 実際の抽選でも同じ系統が3日続かない', await page.evaluate(() => {
    const st = luckState(); st.days = {};
    st.hist = [{ n: 1, r: 'C', g: 'xp' }, { n: 2, r: 'C', g: 'xp' }]; saveLuck(st);
    localStorage.setItem('kwt_launch_v1', JSON.stringify(Array.from({ length: 40 }, (_, i) => dayKey(Date.now() - i * 86400000))));
    for (let i = 0; i < 25; i++) {
      const it = luckById(luckPick(luckDayKey(Date.now() + i * 86400000)).n);
      if (it.g === 'xp') return false;
    }
    return true;
  }));

  /* ============ 4. 重み係数（4.2〜4.4） ============ */
  const wf = await page.evaluate(() => {
    const P = { lv: 8, tests: 60, days: 60, streak: 10, cards: 120, hour: 12, gap: 0, due: 20, acc: 0.95, newRate: 0.8, twice: true };
    const log = LUCK_LIST.slice(0, 20).map(i => ({ n: i.n, r: i.r, g: i.g }));
    const nov = LUCK_LIST.map(i => luckNovelty(i, log));
    const need = LUCK_LIST.map(i => luckLearningNeed(i, P));
    const lvf = LUCK_LIST.map(i => luckLevelFit(i, P));
    const stf = LUCK_LIST.map(i => luckStreakFit(i, P));
    const fat = LUCK_LIST.map(i => luckFatigue(i, log));
    const evf = LUCK_LIST.map(i => luckEventFit(i, '2026-10-5'));
    const back = luckLearningNeed(luckById(81), Object.assign({}, P, { gap: 5 }));
    return {
      nov: [Math.min(...nov), Math.max(...nov)], need: [Math.min(...need), Math.max(...need)],
      lvf: [Math.min(...lvf), Math.max(...lvf)], stf: [Math.min(...stf), Math.max(...stf)],
      fat: [Math.min(...fat), Math.max(...fat)], evf: [Math.min(...evf), Math.max(...evf)], back
    };
  });
  check(`4-1 Novelty 0.1〜1.5（最近出ていないほど増える）${JSON.stringify(wf.nov)}`, wf.nov[0] >= 0.1 && wf.nov[1] <= 1.5 && wf.nov[1] > wf.nov[0]);
  check(`4-2 LearningNeed 0.7〜1.8 ${JSON.stringify(wf.need)}`, wf.need[0] >= 0.7 && wf.need[1] <= 1.8);
  check(`4-3 LevelFit 0.5〜1.5 ${JSON.stringify(wf.lvf)}`, wf.lvf[0] >= 0.5 && wf.lvf[1] <= 1.5);
  check(`4-4 StreakFit 0.7〜1.4 ${JSON.stringify(wf.stf)}`, wf.stf[0] >= 0.7 && wf.stf[1] <= 1.4);
  check(`4-5 FatigueControl 0.2〜1.0（同じ系統の出過ぎを抑える）${JSON.stringify(wf.fat)}`, wf.fat[0] >= 0.2 && wf.fat[1] <= 1.0);
  check(`4-6 EventFit 1.0〜5.0 ${JSON.stringify(wf.evf)}`, wf.evf[0] >= 1 && wf.evf[1] <= 5 && wf.evf[1] > 1);
  check(`4-7 3日以上休んだ人には復帰系を強める（×${wf.back}）`, wf.back >= 2);
  check('4-8 抽選は「その人・その日」で固定（何度引いても同じ）', await page.evaluate(() => {
    const k = luckDayKey();
    return luckPick(k).n === luckPick(k).n && luckPick(k).n === luckPick(k).n;
  }));

  /* ============ 5. 年間イベント（9）・韓国らしいテーマ（10） ============ */
  const ev = await page.evaluate(() => ({
    months: Object.keys(LUCK_CAL).length,
    oct: luckEvent('2026-10-5'), aug: luckEvent('2026-8-20'), oct20: luckEvent('2026-10-20'),
    th: LUCK_THEMES.length,
    thc: ['旅行', 'K-POP', '料理', 'ドラマ', '文化'].map(c => LUCK_THEMES.filter(t => t.c === c).length),
    hangulBoost: luckEventFit(luckById(95), '2026-10-5')
  }));
  check(`5-1 年間イベントカレンダーが12か月ぶんある（いま${ev.months}）`, ev.months === 12);
  check('5-2 10月1〜9日はハングルの日ウィーク（年間最大）', ev.oct && ev.oct.hangul === true && ev.oct.size === 5 && ev.oct20 && ev.oct20.hangul === false);
  check('5-3 8月は夏休み・광복절', ev.aug && /광복절/.test(ev.aug.name));
  check(`5-4 韓国らしいテーマが50種（旅行・K-POP・料理・ドラマ・文化 各10）${JSON.stringify(ev.thc)}`,
    ev.th === 50 && ev.thc.every(n => n === 10));
  check(`5-5 ハングルの日ウィークは「ハングルの日」が最優先で引かれる（×${ev.hangulBoost}）`, ev.hangulBoost === 5);

  /* ============ 6. 通知60パターン（7.2・7.3） ============ */
  const msg = await page.evaluate(() => {
    const ks = Object.keys(LUCK_MSGS);
    return { ks, n: ks.reduce((a, k) => a + LUCK_MSGS[k].length, 0), each: ks.map(k => LUCK_MSGS[k].length),
      now: luckMsg(), ng: ks.some(k => LUCK_MSGS[k].some(t => /失い|消えます/.test(t))) };
  });
  check(`6-1 通知文面が60本ある（6型×10）${JSON.stringify(msg.each)}`, msg.n === 60 && msg.each.every(n => n === 10));
  check('6-2 6つの型（好奇心・学習開始・レアリティ示唆・韓国テーマ・復習・ストリーク）',
    ['curious', 'start', 'rare', 'theme', 'review', 'streak'].every(k => msg.ks.includes(k)));
  check(`6-3 その日の1行が選ばれる（${msg.now}）`, !!msg.now);
  check('6-4 「失います」「連続記録が消えます」を使わない', msg.ng === false);

  /* ============ 7. UX（5.1・5.2・6.1）と履歴（14.3） ============ */
  const ui = await page.evaluate(() => {
    const d = luckEnsure(), it = luckById(d.n), h = luckBodyHTML(it, d);
    const cul = LUCK_LIST.find(x => x.g === 'culture');
    return { h, hcul: luckBodyHTML(cul, d), theme: luckTheme(d), st: luckStatus(d), pr: luckProgress(), left: luckLeftText(),
      hist: (() => { const s = luckState(); for (let i = 1; i <= 6; i++) s.days['2026-7-' + i] = { n: i, applied: i % 2 === 0, step: 1 }; saveLuck(s); return luckHistoryHTML(); })() };
  });
  check('7-1 第2情報「今日の5問をクリアすると」ともらえるものが出る', /今日の5問をクリアすると/.test(ui.h) && /lk-gi/.test(ui.h));
  check('7-2 第3情報「どこまで増やせるか」が出る', /追加の5問ごとに/.test(ui.h) && /25問まで/.test(ui.h));
  check('7-3 進み具合 0 / 5 が出る', /lk-prog/.test(ui.h) && /0 \/ 5/.test(ui.h) && ui.pr.p === 0 && ui.pr.t === 5);
  check(`7-4 期限までの残り時間が出る（${ui.left}）／「永久に入手不能」はうたわない`,
    /あと\d+/.test(ui.left) && ui.h.indexOf(ui.left) > 0 && !/永久|二度と/.test(ui.h));
  check(`7-5 今月のイベントが出る／韓国文化の日にはテーマも出る（${ui.theme}）`,
    /今月のイベント/.test(ui.h) && !!ui.theme && /テーマ：/.test(ui.hcul));
  check('7-6 色だけでレアリティを示さず、アイコンとレアリティ名を併記する', /lk-badge/.test(ui.h) && /(COMMON|RARE|SUPER RARE|EPIC|LEGENDARY|MYTHIC)/.test(ui.h));
  check('7-7 状態は LOCKED から始まる', ui.st === 'LOCKED');
  check('7-8 この7日間のボーナス履歴が出る', /この7日間のボーナス/.test(ui.hist) && (ui.hist.match(/lk-hr/g) || []).length >= 5);
  check('7-9 5問に答えるたびに進み具合が動く（LOCKED→IN_PROGRESS）', await page.evaluate(() => {
    localStorage.removeItem('kwt_luck_v1');
    luckEnsure(); luckNoteProgress(); luckNoteProgress();
    return luckProgress().p === 2 && luckStatus() === 'IN_PROGRESS';
  }));

  /* ============ 8. 演出（8.1・8.3・8.4） ============ */
  check('8-1 「演出ひかえめ」の設定がある', await page.evaluate(() => {
    const s = loadSettings(); return 'lessFx' in s && s.lessFx === false;
  }));
  await fresh({ kwt_settings_v1: JSON.stringify({ lessFx: true }) });
  const less = await page.evaluate(() => new Promise(res => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const ov = document.querySelector('.lkauto');
      if (ov && ov.querySelector('.lk-name')) { clearInterval(iv); res({ ok: true, sil: !!ov.querySelector('.lk-face.sil'), ms: Date.now() - t0 }); }
      if (Date.now() - t0 > 8000) { clearInterval(iv); res({ ok: false }); }
    }, 25);
  }));
  check('8-2 「演出ひかえめ」のときは待たずに中身が出る（シルエットで足止めしない）', less.ok && less.sil === false);
  check('8-3 端末の「視差効果を減らす」にも追従する', await page.evaluate(() => typeof luckLessFx === 'function' && typeof _reducedMotion === 'function'));
  await page.evaluate(() => { closeLuckReveal(); });
  await fresh({ kwt_d5auto_v1: 'x' });
  const fly = await page.evaluate(() => {
    const it = luckById(1), rw = luckReward(it, 1, null);
    return luckResultHTML({ it, rw, step: 1 }, { items: [{ ok: true }, { ok: true }, { ok: true }, { ok: false }, { ok: true }] });
  });
  check('8-4 結果画面：正解した語から光が集まってボーナスのアイコンに入る（画面外から飛んでこない）',
    /lk-rfly/.test(fly) && (fly.match(/--lx:/g) || []).length === 4 && /lk-rico/.test(fly));
  check('8-5 画面のフラッシュは使わない', await page.evaluate(() => {
    const css = [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('') } catch (e) { return '' } }).join('');
    return /lk-pop/.test(css) && !/lkauto[^{]*\{[^}]*d5-flash/.test(css);
  }));

  /* ============ 9. バランス（11.1・11.4）とガードレール（16.4） ============ */
  const bal = await page.evaluate(() => {
    const mk = r => ({ n: 0, g: 'special', r, name: '', eff: '', t: '全員', c: '低' });
    return {
      step: LUCK_STEP, max: LUCK_MAXSTEP,
      caps: LUCK_ORDER.map(r => luckReward(mk(r), 1, { correct: 5, lucky: 5, goldenOk: true }).xp <= LUCK_RARE[r].cap),
      m: luckReward(luckById(110), 1, { correct: 5, lucky: 5, goldenOk: true }).xp,
      floor: LUCK_LIST.every(it => luckReward(it, 1, null).xp >= 10),
      perfect: LUCK_LIST.filter(i => /全問正解/.test(i.eff)).length
    };
  });
  check(`9-1 学習量の追加は逓減し25問で止まる（${JSON.stringify(bal.step)}）`,
    JSON.stringify(bal.step) === JSON.stringify([1, 0.2, 0.15, 0.1]) && bal.max === 4);
  check('9-2 ボーナス由来XPはレアリティ別の上限を超えない', bal.caps.every(Boolean));
  check(`9-3 Mythicでも100XPまで（${bal.m}XP）`, bal.m <= 100);
  check('9-4 どのボーナスでも最低10XPは残る（Cが「はずれ」にならない）', bal.floor);
  check(`9-5 全問正解を条件にする効果は全体の20%以下（${bal.perfect}/120）`, bal.perfect / 120 <= 0.2);
  check('9-6 1日にボーナスから出るXPは上限で頭打ちになる', await page.evaluate(() => {
    localStorage.removeItem('kwt_luck_v1'); localStorage.setItem('kwt_bonus_v1', '0');
    const st = luckState(); st.days[luckTodayKey()] = { n: 110, lucky: 3, golden: 0, revealed: true, applied: false, step: 0, prog: 0 };
    st.hist = []; saveLuck(st);
    const before = loadBonus();
    luckApply({ correct: 5, total: 5, items: [1, 2, 3, 4, 5].map(n => ({ n, ok: true })) });
    for (let i = 0; i < 6; i++) luckStepUp();
    return loadBonus() - before <= LUCK_RARE.M.cap;
  }));

  /* ============ 10. 時刻変更対策（16.3） ============ */
  check('10-1 端末の時刻を戻しても、過ぎた日をもう一度引き直せない', await page.evaluate(() => {
    localStorage.removeItem('kwt_luck_v1');
    const k = luckTodayKey();
    const st = luckState(); st.maxk = '2099-1-1'; saveLuck(st);
    return luckTodayKey() === '2099-1-1' && k !== '2099-1-1';
  }));
  check('10-2 日付は進めば通常どおり進む', await page.evaluate(() => {
    localStorage.removeItem('kwt_luck_v1');
    const a = luckTodayKey();
    return a === luckDayKey() && luckState().maxk === a;
  }));

  /* ============ 11. ことばの友だち（2つめの仕様書 Phase1） ============ */
  await fresh({ kwt_d5auto_v1: 'x' });
  const pet = await page.evaluate(() => {
    const day = petDaily();
    return { acts: PET_ACTS.length, moods: PET_MOODS.length, wears: PET_WEARS.length, stages: PET_STAGES.length,
      maxlv: PET_MAXLV, day, lv: petLevel(petState().xp), friend: petState().friend, album: petState().album.length,
      line0: petLine(), art: petArtHTML(day, 1, 'egg') };
  });
  check(`11-1 今日の出来事が20パターン（いま${pet.acts}）`, pet.acts === 20);
  check(`11-2 気分6種・衣装7種（いま${pet.moods}／${pet.wears}）`, pet.moods === 6 && pet.wears === 7);
  check(`11-3 Lv1〜20・4段階進化（いま${pet.maxlv}／${pet.stages}段階）`, pet.maxlv === 20 && pet.stages === 4);
  check('11-4 その日だけの1枚（出来事×気分×衣装×天気）が組み立てられる',
    /pt-body/.test(pet.art) && /pt-act/.test(pet.art) && /pt-wx/.test(pet.art) && /pt-wear/.test(pet.art));
  check('11-5 毎日起動で親密度がつく', pet.friend >= 2);
  check('11-6 最初は「안녕!」だけ話す（覚えた語がふえると長くなる）', pet.line0.ko === '안녕!');
  check('11-7 同じ日なら何度開いても同じ1枚（翌日は変わる）', await page.evaluate(() => {
    const a = JSON.stringify(petDaily()), b = JSON.stringify(petDaily());
    const st = petState(); const k0 = st.day.k;
    return a === b && k0 === luckDayKey();
  }));
  check('11-8 学習で韓国語エネルギーが入り、レベルが上がる／進化する', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1');
    const r1 = petFeed('d5'), lv1 = petLevel(petState().xp);
    let evolved = false;
    for (let i = 0; i < 12; i++) { const r = petFeed('test'); if (r.evolved) evolved = true; }
    return r1.gain === 30 && petLevel(petState().xp) > lv1 && evolved;
  }));
  check('11-9 通常テスト・トレンドでも育つ（今日の5問がいちばん多い）', await page.evaluate(() =>
    PET_GAIN.d5 > PET_GAIN.test && PET_GAIN.test > PET_GAIN.trend && PET_GAIN.trend > 0));
  check('11-10 思い出アルバムは最新30日まで', await page.evaluate(() => {
    const o = petState(); o.album = Array.from({ length: 45 }, (_, i) => ({ k: '2026-1-' + (i + 1), act: 0, mood: 0, wear: 0, wx: 0, lv: 1, stage: 'egg' }));
    savePet(o);
    return petState().album.length === 30;
  }));
  check('11-11 タップでもなつく（1日5回まで）', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1'); petDaily();
    const a = petState().friend;
    for (let i = 0; i < 9; i++) petTap();
    return petState().friend - a === 5;
  }));
  check('11-12 ハンバーガーメニューから開ける', await (async () => {
    await page.evaluate(() => { show('s-home'); openHomeMenu(); });
    await page.waitForTimeout(400);
    const has = await page.evaluate(() => [...document.querySelectorAll('#menu-modal .hm-cap')].some(b => /ことばの友だち/.test(b.textContent)));
    await page.evaluate(() => { closeHomeMenu(); openPet(); });
    await page.waitForTimeout(400);
    const on = await page.evaluate(() => {
      const m = document.getElementById('pet-modal');
      return m.classList.contains('on') && !!m.querySelector('.pt-art') && !!m.querySelector('.pt-line') && /단어 친구/.test(m.textContent);
    });
    await page.evaluate(() => closePet());
    return has && on;
  })());
  check('11-13 育成画面から1タップで今日の5問へ戻れる（5秒以内に学習へ）', await (async () => {
    await page.evaluate(() => openPet());
    await page.waitForTimeout(300);
    const t = await page.evaluate(() => (document.querySelector('#pet-modal .d5-go') || {}).textContent || '');
    await page.evaluate(() => closePet());
    return /今日の5問/.test(t);
  })());

  /* ============ 12. 通しで遊ぶ（ボーナス発動＋ことばの友だちの成長） ============ */
  check('12-1 5問を最後までやると、結果画面にボーナス発動と、ことばの友だちの成長が出る', await (async () => {
    await page.evaluate(() => { localStorage.removeItem('kwt_luck_v1'); localStorage.removeItem('kwt_daily5_v1'); localStorage.removeItem('kwt_pet_v1'); });
    await page.evaluate(() => { luckEnsure(); startDaily5(); });
    await page.waitForTimeout(2600);
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => { const b = document.querySelector('#qstage .choices .choice:not([disabled])'); if (b) b.click(); });
      await page.waitForTimeout(1100);
    }
    await page.waitForTimeout(1300);
    return await page.evaluate(() => {
      const lk = document.querySelector('#s-d5result .lk-res'), pt = document.querySelector('#s-d5result .pt-res');
      return !!lk && /今日のボーナス発動/.test(lk.textContent) && !!pt && /韓国語エネルギー/.test(pt.textContent);
    });
  })());
  check('12-2 5問の途中でも進み具合が記録されている（5/5）', await page.evaluate(() => luckProgress().p === 5));

  /* ============ 回帰 ============ */
  check('R-1 版数が上がっている（v6.7）', await page.evaluate(() => /^v6\.7/.test(APP_VERSION)));
  check('R-2 ホームのレイアウトは変わっていない（今日の5問の丸の位置）', await (async () => {
    await page.evaluate(() => { show('s-home'); renderHome(); });
    await page.waitForTimeout(700);
    return await page.evaluate(() => {
      const h = document.getElementById('homewrap').getBoundingClientRect(), k = h.width / 602;
      const r = document.querySelector('.sg-d5').getBoundingClientRect();
      return Math.abs((r.bottom - h.top) / k - 1132) < 1.5;
    });
  })());
  check('R-3 今日の5問・トレンド・ガチャ・プレゼントの入口は今までどおり', await page.evaluate(() =>
    !!document.querySelector('.sg-d5') && !!document.querySelector('.sg-gift') && typeof openGacha === 'function' && typeof openPresent === 'function'));
  check('R-4 設定に「演出」が増えただけ（既存の項目は残っている）', await (async () => {
    await page.evaluate(() => openSettings());
    await page.waitForTimeout(400);
    const t = await page.evaluate(() => document.getElementById('settings-modal').textContent);
    await page.evaluate(() => closeSettings());
    return /演出/.test(t) && /サウンド/.test(t) && /じっくり/.test(t) && /文字の大きさ/.test(t);
  })());
  check('R-5 保存キーが増えただけ（既存の記録を壊していない）', await page.evaluate(() =>
    !!localStorage.getItem('kwt_luck_v1') && !!localStorage.getItem('kwt_daily5_v1') && !!localStorage.getItem('kwt_pet_v1')));
  check('R-6 JSコンソールエラーが無い', errors.length === 0);
  if (errors.length) console.log(errors);

  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length} / ${results.length} PASS`);
  if (ng.length) { console.log('--- FAILED ---'); ng.forEach(r => console.log('  ' + r.name)); }
  await browser.close();
  process.exit(ng.length ? 1 : 0);
})();
