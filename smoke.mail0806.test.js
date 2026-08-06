/* k-tango 2026-08-06 22:32 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0806.test.js
 * 指示: 「今日限定ボーナス」機能仕様書（오늘의 행운／今日の幸運）
 *  ・毎日ひとつだけ「今日だけの学習効果」が選ばれ、起動時に公開（演出は最大2.5秒）
 *  ・「この効果で今日の5問を始める」→ 5問 → 発動・追加報酬 → 明日のテーマ予告
 *  ・最低条件は今日の5問1セット／学習量で伸びるが上限あり／低レアにも実用的な価値
 *  ・抽選は完全ランダムにせず、飽き・不公平・初心者格差を補正する
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
  await fresh({ kwt_d5auto_v1: 'x' }); // まずは公開の割り込みなしで中身だけ確かめる

  /* ============ 1. 100種類のボーナス一覧（メール本文の表そのまま） ============ */
  const cat = await page.evaluate(() => ({
    n: LUCK_LIST.length,
    dupN: LUCK_LIST.length - new Set(LUCK_LIST.map(i => i.n)).size,
    dupName: LUCK_LIST.length - new Set(LUCK_LIST.map(i => i.name)).size,
    badR: LUCK_LIST.filter(i => !LUCK_RARE[i.r]).map(i => i.n),
    badG: LUCK_LIST.filter(i => !LUCK_CATS[i.g]).map(i => i.n),
    noEff: LUCK_LIST.filter(i => !i.name || !i.eff || !i.t || !i.c).map(i => i.n),
    byG: Object.keys(LUCK_CATS).map(g => [g, LUCK_LIST.filter(i => i.g === g).length]),
    byR: Object.keys(LUCK_RARE).map(r => [r, LUCK_LIST.filter(i => i.r === r).length]),
    first: LUCK_LIST[0].name, last: LUCK_LIST[LUCK_LIST.length - 1].name
  }));
  check(`1-1 一覧が入っている（No.1〜118 の118件・いま${cat.n}件）`, cat.n === 118);
  check('1-2 番号・名称の重複が無い', cat.dupN === 0 && cat.dupName === 0);
  check('1-3 レアリティ(C/R/SR/E/L/M)がすべて定義済み ' + JSON.stringify(cat.byR), cat.badR.length === 0);
  check('1-4 8系統（XP/ガチャ/カード/復習/支援/継続/文化/特別）がすべて定義済み ' + JSON.stringify(cat.byG), cat.badG.length === 0);
  check('1-5 効果文・対象・コストの欠けが無い', cat.noEff.length === 0);
  check(`1-6 先頭「はじめの一歩」／末尾「復刻ボーナス」（いま ${cat.first} / ${cat.last}）`,
    cat.first === 'はじめの一歩' && cat.last === '復刻ボーナス');
  check('1-7 8系統すべてに中身がある', cat.byG.every(x => x[1] > 0));

  /* ============ 2. 抽選（完全ランダムにしない） ============ */
  check('2-1 同じ人・同じ日なら何度引いても同じ（起動のたびに変わらない）', await page.evaluate(() => {
    const k = luckDayKey();
    const a = luckPick(k).n, b = luckPick(k).n, c = luckPick(k).n;
    return a === b && b === c;
  }));
  check('2-2 日が変われば引き直される（同じ日ばかりにならない）', await page.evaluate(() => {
    const s = new Set();
    for (let i = 0; i < 30; i++) s.add(luckPick(luckDayKey(Date.now() + i * 86400000)).n);
    return s.size >= 5;
  }));
  check('2-3 飽き対策：直近14回に出たものは選ばれない', await page.evaluate(() => {
    const st = luckState();
    st.hist = LUCK_LIST.slice(0, 14).map(i => i.n);
    st.days = {}; saveLuck(st);
    for (let i = 0; i < 40; i++) {
      const n = luckPick(luckDayKey(Date.now() + i * 86400000)).n;
      if (st.hist.indexOf(n) >= 0) return false;
    }
    return true;
  }));
  check('2-4 初心者格差の補正：はじめの3日はC・Rだけ', await page.evaluate(() => {
    const st = luckState(); st.hist = []; st.days = {}; saveLuck(st);
    localStorage.setItem('kwt_launch_v1', JSON.stringify([dayKey(Date.now())]));
    for (let i = 0; i < 40; i++) {
      const it = luckById(luckPick(luckDayKey(Date.now() + i * 86400000)).n);
      if (it.r !== 'C' && it.r !== 'R') return false;
    }
    return true;
  }));
  check('2-5 不公平の補正：7日レアが出ていなければSR以上から引く', await page.evaluate(() => {
    const days = []; for (let i = 0; i < 30; i++) days.push(dayKey(Date.now() - i * 86400000));
    localStorage.setItem('kwt_launch_v1', JSON.stringify(days)); // 長く使っている人にする
    const st = luckState();
    st.hist = LUCK_LIST.filter(i => i.r === 'C').slice(0, 8).map(i => i.n); // 直近8回すべてCOMMON
    st.days = {}; saveLuck(st);
    const it = luckById(luckPick(luckDayKey()).n);
    return it && it.r !== 'C' && it.r !== 'R';
  }));
  check('2-6 対象に合わない効果は引かない（初心者に上級者向けは出ない）', await page.evaluate(() => {
    const p = { lv: 1, tests: 0, days: 1, streak: 0, cards: 0, hour: 12, gap: 0 };
    return !luckEligible(luckById(70), p) && !luckEligible(luckById(80), p) && luckEligible(luckById(1), p);
  }));
  check('2-7 その日のうちに達成できない時間帯の効果は出さない（朝活／夜の集中）', await page.evaluate(() => {
    const asa = luckById(8), yoru = luckById(9);
    return luckEligible(asa, { lv: 9, tests: 30, days: 30, streak: 5, cards: 99, hour: 8, gap: 0 })
      && !luckEligible(asa, { lv: 9, tests: 30, days: 30, streak: 5, cards: 99, hour: 20, gap: 0 })
      && luckEligible(yoru, { lv: 9, tests: 30, days: 30, streak: 5, cards: 99, hour: 20, gap: 0 })
      && !luckEligible(yoru, { lv: 9, tests: 30, days: 30, streak: 5, cards: 99, hour: 8, gap: 0 });
  }));

  /* ============ 3. 報酬（低レアにも価値・上限あり） ============ */
  const rw = await page.evaluate(() => {
    const o = {};
    // 倍率つきの効果と混ざらないよう、同じ条件（系統=特別・倍率なし）でレアリティだけを変えて比べる
    ['C', 'R', 'SR', 'E', 'L', 'M'].forEach(r => {
      o[r] = luckReward({ n: 0, g: 'special', r, name: '', eff: '', t: '全員', c: '低' }, 1, { correct: 0, lucky: 9, goldenOk: false });
    });
    o.all = LUCK_LIST.map(it => luckReward(it, 1, { correct: 0, lucky: 9, goldenOk: false }));
    o.step2 = luckReward(luckById(4), 2, null);
    o.gacha = luckReward(luckById(19), 1, null);
    o.card = luckReward(luckById(31), 1, null);
    o.streak = luckReward(luckById(80), 1, null);
    o.legend = luckReward(luckById(95), 1, null);
    o.perfect = [luckReward(luckById(6), 1, { correct: 5, lucky: 9, goldenOk: false }).xp,
                 luckReward(luckById(6), 1, { correct: 2, lucky: 9, goldenOk: false }).xp];
    o.golden = [luckReward(luckById(106), 1, { correct: 3, lucky: 9, goldenOk: true }).xp,
                luckReward(luckById(106), 1, { correct: 3, lucky: 9, goldenOk: false }).xp];
    return o;
  });
  check('3-1 レアが上がるほど値打ちも上がる', rw.C.xp < rw.SR.xp && rw.SR.xp < rw.L.xp && rw.L.xp <= rw.M.xp);
  check('3-2 どの日も最低10XPは残る（レアが低い日も実用的な価値）', rw.all.every(x => x.xp >= 10));
  check('3-3 上限がある（1回で240XPを超えない）', rw.all.every(x => x.xp <= 240));
  check('3-4 追加ぶん（2段階目）は1段階目より小さい', rw.step2.xp > 0 && rw.step2.xp < rw.SR.xp * 2);
  check('3-5 ガチャ系はガチャ回数・カード系はカード・継続系はおやすみチケットになる',
    rw.gacha.coin > 0 && rw.card.card > 0 && rw.streak.rest > 0);
  check('3-6 レジェンド／ミシックはXP2倍チャンスも付く', rw.legend.boost > 0);
  check(`3-7 条件つきの上乗せが効く（完璧主義 全問正解${rw.perfect[0]} > 一部正解${rw.perfect[1]}）`, rw.perfect[0] > rw.perfect[1]);
  check(`3-8 ゴールデン5問は当たり問題を正解したときだけ増える（${rw.golden[0]} > ${rw.golden[1]}）`, rw.golden[0] > rw.golden[1]);

  /* ============ 4. 発動（今日の5問を1セット終えるだけ） ============ */
  const ap = await page.evaluate(() => {
    localStorage.removeItem('kwt_luck_v1'); localStorage.setItem('kwt_bonus_v1', '0');
    localStorage.removeItem('kwt_gacha_v1'); localStorage.removeItem('kwt_cards_v1'); localStorage.removeItem('kwt_rest_v1');
    const d = luckEnsure(), it = luckById(d.n);
    const before = { xp: loadBonus(), coin: gachaSpins(), card: Object.keys(loadCards()).length, rest: restTickets() };
    const rec = { correct: 5, total: 5, done: true, items: [1, 2, 3, 4, 5].map(n => ({ n, ok: true })) };
    const r1 = luckApply(rec);
    const mid = { xp: loadBonus(), coin: gachaSpins(), card: Object.keys(loadCards()).length, rest: restTickets() };
    const r2 = luckApply(rec); // 2回目は発動しない
    const after = { xp: loadBonus(), coin: gachaSpins(), card: Object.keys(loadCards()).length, rest: restTickets() };
    const s = luckState().days[luckDayKey()];
    return { name: it.name, g: it.g, r1: !!r1, r2: !!r2, before, mid, after, applied: s.applied, step: s.step, got: s.got,
      html: r1 ? luckResultHTML(r1) : '' };
  });
  const gained = ap.mid.xp - ap.before.xp + (ap.mid.coin - ap.before.coin) + (ap.mid.card - ap.before.card) + (ap.mid.rest - ap.before.rest);
  check(`4-1 今日の5問を終えると発動する（${ap.name}）`, ap.r1 && ap.applied === true);
  check(`4-2 ちゃんと何かもらえる（XP ${ap.before.xp}→${ap.mid.xp} など）`, gained > 0);
  check('4-3 1日に2回は発動しない', ap.r2 === false && JSON.stringify(ap.mid) === JSON.stringify(ap.after));
  check('4-4 発動は1段階目から', ap.step === 1);
  check('4-5 結果画面に出す「今日のボーナス発動」の中身がある',
    /今日のボーナス発動/.test(ap.html) && ap.html.indexOf(ap.name) > 0 && /lk-gi/.test(ap.html));
  check('4-6 明日のテーマ予告が出る', await page.evaluate(() => {
    const t = luckTomorrowCat();
    return !!t && Object.keys(LUCK_CATS).some(g => LUCK_CATS[g].lab === t);
  }));

  /* ============ 5. 学習量で伸びるが上限がある（3段階） ============ */
  const st = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 4; i++) { const r = luckStepUp(); out.push(r ? r.step : null); }
    const d = luckState().days[luckDayKey()];
    return { out, step: d.step, xp: loadBonus() };
  });
  check(`5-1 テストを終えるごとに1段階ずつ伸びる（${JSON.stringify(st.out)}）`, st.out[0] === 2 && st.out[1] === 3);
  check('5-2 3段階で頭打ち（4本目以降は増えない）', st.out[2] === null && st.out[3] === null && st.step === 3);

  /* ============ 6. 制限時間に効く効果（No.66 時間延長 / No.67 ノータイマー） ============ */
  check('6-1 時間延長の日は制限時間が3秒のびる', await page.evaluate(() => {
    const st = luckState(); st.days[luckDayKey()] = { n: 66, lucky: 3, golden: 0, revealed: true, applied: false, step: 0 }; saveLuck(st);
    state = { questions: [{ type: 'jk' }], idx: 0 };
    const a = curLimit();
    st.days[luckDayKey()].n = 1; saveLuck(st);
    const b = curLimit();
    return a === b + 3;
  }));
  check('6-2 ノータイマーの日は今日の5問だけ時間切れにならない', await page.evaluate(() => {
    const st = luckState(); st.days[luckDayKey()] = { n: 67, lucky: 3, golden: 0, revealed: true, applied: false, step: 0 }; saveLuck(st);
    state = { questions: [{ type: 'jk' }], idx: 0 };
    const off = curLimit();                      // 通常テスト中は効かない
    _d5.on = true; _d5.mode = 'd5';
    const on = curLimit();
    _d5.on = false; _d5.mode = '';
    return off === 10 && on > 300;
  }));

  /* ============ 7. 画面（起動時の公開 → 今日の5問） ============ */
  await fresh(); // kwt_d5auto_v1 を置かない＝その日はじめて開いた状態
  // 公開の吹き出しが出る瞬間から、中身が見えるまでを測る
  const revd = await page.evaluate(() => new Promise(res => {
    const t0 = Date.now(); let seen = 0, sil = null;
    const iv = setInterval(() => {
      const ov = document.querySelector('.lkauto');
      if (ov && !seen) { seen = Date.now(); sil = { sil: !!ov.querySelector('.lk-face.sil'), name: !!ov.querySelector('.lk-name') }; }
      const nm = ov && ov.querySelector('.lk-name');
      if (seen && nm) {
        clearInterval(iv);
        res({ on: true, first: sil, ms: Date.now() - seen, name: nm.textContent, eff: (ov.querySelector('.lk-eff') || {}).textContent,
              badge: (ov.querySelector('.lk-badge') || {}).textContent, go: (ov.querySelector('.d5-go') || {}).textContent });
      }
      if (Date.now() - t0 > 8000) { clearInterval(iv); res({ on: !!seen, first: sil, ms: -1 }); }
    }, 30);
  }));
  check('7-1 起動すると今日のボーナスが公開される', revd.on);
  check('7-2 はじめはシルエット（中身はまだ見えない）', !!revd.first && revd.first.sil && !revd.first.name);
  check(`7-3 演出は最大2.5秒までに中身が出る（${revd.ms}ms）`, revd.ms >= 0 && revd.ms <= 2600);
  check(`7-4 名前・効果・レアリティが出る（${revd.name} / ${revd.badge}）`, !!revd.name && !!revd.eff && !!revd.badge);
  check(`7-5 「この効果で今日の5問を始める」ボタン（${revd.go}）`, /今日の5問を始める/.test(revd.go || ''));
  check('7-6 押すと公開が閉じて、いつもの今日の5問へ進む', await (async () => {
    await page.evaluate(() => document.querySelector('.lkauto .d5-go').click());
    await page.waitForTimeout(900);
    return await page.evaluate(() => !document.querySelector('.lkauto') && !!document.querySelector('.d5auto'));
  })());
  check('7-7 今日の5問の吹き出しにも今日のボーナスの1行が出る', await page.evaluate(() => {
    const s = document.querySelector('.d5auto .lk-strip');
    return !!s && /今日のボーナス/.test(s.textContent);
  }));
  check('7-8 公開は1日1回だけ（同じ日に開き直しても出ない）', await (async () => {
    await page.evaluate(() => { closeAutoD5(false); });
    await page.reload();
    await page.waitForTimeout(2200);
    return await page.evaluate(() => !document.querySelector('.lkauto'));
  })());
  check('7-9 今日の5問の吹き出しから、今日のボーナスをもう一度見られる', await (async () => {
    await page.evaluate(() => { _killAutoD5(); document.querySelectorAll('.d5auto').forEach(o => o.remove()); openDaily5(); });
    await page.waitForTimeout(500);
    const has = await page.evaluate(() => !!document.querySelector('#d5-modal .lk-strip'));
    await page.evaluate(() => document.querySelector('#d5-modal .lk-strip').click());
    await page.waitForTimeout(400);
    const on = await page.evaluate(() => {
      const m = document.getElementById('luck-modal');
      return m.classList.contains('on') && !!m.querySelector('.lk-name') && /今日の5問を1セット終えると発動/.test(m.textContent);
    });
    const cd = await page.evaluate(() => _d5CdTimer === null); // 見ている間に勝手にテストが始まらない
    await page.evaluate(() => { closeLuck(); closeDaily5(); });
    await page.waitForTimeout(300);
    return has && on && cd;
  })());
  check('7-10 明日のテーマ予告が吹き出しに出る', await (async () => {
    await page.evaluate(() => openLuck());
    await page.waitForTimeout(300);
    const t = await page.evaluate(() => (document.querySelector('#luck-modal .lk-next') || {}).textContent || '');
    await page.evaluate(() => closeLuck());
    return /明日は/.test(t);
  })());

  /* ============ 8. 今日の5問を実際に通しで遊ぶ ============ */
  check('8-1 5問を最後までやると、結果画面に「今日のボーナス発動」が出る', await (async () => {
    await page.evaluate(() => { localStorage.removeItem('kwt_luck_v1'); localStorage.removeItem('kwt_daily5_v1'); });
    await page.evaluate(() => { luckEnsure(); startDaily5(); });
    await page.waitForTimeout(2600); // 開始カウントダウン
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        const b = document.querySelector('#qstage .choices .choice:not([disabled])');
        if (b) b.click();
      });
      await page.waitForTimeout(1100);
    }
    await page.waitForTimeout(1200);
    return await page.evaluate(() => {
      const r = document.querySelector('#s-d5result .lk-res');
      return !!r && /今日のボーナス発動/.test(r.textContent) && !!r.querySelector('.lk-gi');
    });
  })());
  check('8-2 発動ずみになり、吹き出しの1行も「発動ずみ」に変わる', await page.evaluate(() => {
    const d = luckState().days[luckDayKey()];
    return d && d.applied === true && /発動ずみ/.test(luckStripHTML());
  }));
  check('8-3 結果をもう一度開いても二重には出ない', await (async () => {
    await page.evaluate(() => { show('s-home'); d5ShowSaved(); });
    await page.waitForTimeout(600);
    return await page.evaluate(() => !document.querySelector('#s-d5result .lk-res'));
  })());

  /* ============ 回帰 ============ */
  check('R-1 版数が上がっている（v6.6）', await page.evaluate(() => /^v6\.6/.test(APP_VERSION)));
  check('R-2 今日の5問・トレンド・ガチャ・プレゼントの入口は今までどおり', await (async () => {
    await page.evaluate(() => { show('s-home'); renderHome(); });
    await page.waitForTimeout(700);
    return await page.evaluate(() => !!document.querySelector('.sg-d5') && !!document.querySelector('.sg-gift')
      && typeof openGacha === 'function' && typeof openPresent === 'function');
  })());
  check('R-3 ガチャが今までどおり開く', await (async () => {
    await page.evaluate(() => { addGachaSpin(10, 'A'); openGacha(); });
    await page.waitForTimeout(500);
    const on = await page.evaluate(() => document.getElementById('gacha-modal').classList.contains('on'));
    await page.evaluate(() => closeGacha());
    return on;
  })());
  check('R-4 通常テストの制限時間は変わらない（ボーナスが時間ものでなければ10秒）', await page.evaluate(() => {
    const st = luckState(); st.days[luckDayKey()].n = 1; saveLuck(st);
    state = { questions: [{ type: 'jk' }], idx: 0 };
    return curLimit() === 10;
  }));
  check('R-5 ホームのレイアウトは変わっていない（今日の5問の丸の位置）', await page.evaluate(() => {
    const h = document.getElementById('homewrap').getBoundingClientRect(), k = h.width / 602;
    const r = document.querySelector('.sg-d5').getBoundingClientRect();
    return Math.abs((r.bottom - h.top) / k - 1132) < 1.5;
  }));
  check('R-6 保存キーが増えただけ（既存の記録を壊していない）', await page.evaluate(() => {
    return !!localStorage.getItem('kwt_luck_v1') && !!localStorage.getItem('kwt_daily5_v1');
  }));
  check('R-7 JSコンソールエラーが無い', errors.length === 0);
  if (errors.length) console.log(errors);

  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length} / ${results.length} PASS`);
  if (ng.length) { console.log('FAILED:'); ng.forEach(r => console.log(' - ' + r.name)); }
  await browser.close();
  process.exit(ng.length ? 1 : 0);
})();
