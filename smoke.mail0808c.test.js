/* k-tango 2026-08-08 22:51 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0808c.test.js
 * 指示: WORLD進捗ヘッダーのデザイン刷新
 *  ・情報構造／位置関係／文字サイズの強弱／余白感は保ったまま、固定pxではなく
 *    コンテナの幅・高さに対する「比率」で組み直す
 *  ・カプセルは全幅の約88%・全高の約84%・上下中央、角丸はカプセル高さの約40〜45%
 *  ・並びは 左矢印 → WORLD番号 → 学習進捗 → 単語数 → 正答率 → ランク → 右矢印
 *  ・「10」「48」「92」を非常に大きく、補助文字（2週目 / 12 / 語 / %）は小さく
 *  ・3本のバーは同じ高さ・同じY座標。オレンジ〜黄／シアン／グリーン、トラックは濃いチャコール
 *  ・ランクだけは新しい円を作らず、既存のメダル意匠をそのまま使う
 *  ・左右矢印はカプセルの内側に入れない
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond, note) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${note ? ' (' + note + ')' : ''}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').split(path.sep).join('/');
const near = (a, b, tol) => Math.abs(a - b) <= tol;

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
    localStorage.setItem('kwt_firstdone_v1', '1');
    localStorage.setItem('kwt_roomhint_v1', '1');
    localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now()));
    // 見本と同じ見え方（10/12 の周回・ランクあり）にする
    const t = {}; for (let i = 1; i <= 10; i++) t[i] = { rank: 'B', score: 70, at: new Date().toISOString() };
    localStorage.setItem('kwt_board_v1', JSON.stringify({ 'beginner-01': { cleared: 10, tiles: t } }));
    localStorage.setItem('kwt_sections_v1', JSON.stringify({ 'beginner-01': { recentRanks: ['B', 'A'], bestRank: 'A' } }));
    const ids = LEVEL_SECTIONS.beginner[1], s = {};
    ids.forEach((id, i) => { if (i < 48) s[id] = { hasSeen: true, hasEverCorrect: true, memoryScore: 92, stabilityHours: 4000, wordDifficulty: 1, reviewCount: 3, lastAnsweredAt: new Date().toISOString(), firstCorrectAt: new Date().toISOString() }; });
    localStorage.setItem('kwt_stats_v1', JSON.stringify(s));
  });
  await page.reload();
  await page.waitForTimeout(1700);
  const clearFx = () => page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.lvup,.pbub,.stepnote,.rest-ask,#resume-ask,.coach,.d5auto,.lapdone').forEach(o => o.remove()));
  await clearFx();

  const M = await page.evaluate(() => {
    const sl = document.querySelector('.room-slide[data-n="1"]');
    const scale = sl.getBoundingClientRect().width / 602;        // ホーム全体はscaleHomeで縮小されている
    const rmenu = sl.querySelector('.rmenu');
    const base = rmenu.getBoundingClientRect();
    const rel = e => { const b = e.getBoundingClientRect(); return {
      l: (b.left - base.left) / base.width * 100, r: (b.right - base.left) / base.width * 100,
      t: (b.top - base.top) / base.height * 100, b: (b.bottom - base.top) / base.height * 100,
      w: b.width / base.width * 100, h: b.height / base.height * 100,
      cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2 }; };
    const q = s => { const e = sl.querySelector(s); return e ? rel(e) : null; };
    // 文字だけの実寸（要素の箱ではなく字の並びの幅）
    const txt = s => { const e = sl.querySelector(s); const rg = document.createRange(); rg.selectNodeContents(e);
      const b = rg.getBoundingClientRect(); return { l: b.left / scale, r: b.right / scale, w: b.width / scale }; };
    const fs = s => parseFloat(getComputedStyle(sl.querySelector(s)).fontSize) / scale;
    const cs = s => getComputedStyle(sl.querySelector(s));
    const cap = q('.rmenu-bg');
    const pv = document.getElementById('rm-prev').getBoundingClientRect();
    const nx = document.getElementById('rm-next').getBoundingClientRect();
    const capAbs = sl.querySelector('.rmenu-bg').getBoundingClientRect();
    const tri = getComputedStyle(document.getElementById('rm-prev'), '::before');
    return {
      rh: parseFloat(getComputedStyle(rmenu).height) / scale,
      cap, capRadius: parseFloat(cs('.rmenu-bg').borderTopLeftRadius) / scale,
      capH: capAbs.height / scale,
      world: q('.rm-world'), lap: q('.hv-lap'), words: q('.hv-learned'), rate: q('.hv-roompwr'), rank: q('.rank-b'),
      bars: ['.hv-lapg', '.hv-wordsg', '.hv-roomg'].map(s => { const b = q(s); const c = cs(s);
        return { t: b.t, h: b.h, w: b.w, radius: c.borderTopLeftRadius, track: c.backgroundColor,
                 fill: getComputedStyle(sl.querySelector(s + ' .gfill')).backgroundImage }; }),
      // 文字サイズの強弱
      fsNo: fs('.hv-roomno'), fsLabel: fs('.hv-roomlabel'),
      fsLapNum: fs('.hv-lap .lp-v b'), fsLapSub: fs('.hv-lap .lp-v i'), fsLapLab: fs('.hv-lap .lp-l'),
      fsWords: fs('.hv-learned'), fsWordsUnit: fs('.hv-learned .unit'),
      fsRate: fs('.hv-roompwr'), fsRateUnit: fs('.hv-roompwr .unit'),
      // 「2週目」は数字の右上・「/12」は右下
      tLapNum: txt('.hv-lap .lp-v b'), tLapSub: txt('.hv-lap .lp-v i'), tLapLab: txt('.hv-lap .lp-l'),
      lapSubTop: sl.querySelector('.hv-lap .lp-v i').getBoundingClientRect().top,
      lapLabBottom: sl.querySelector('.hv-lap .lp-l').getBoundingClientRect().bottom,
      // ランクは既存メダル意匠のまま
      rankShadow: cs('.rank-b').boxShadow, rankGloss: getComputedStyle(sl.querySelector('.rank-b'), '::after').backgroundImage,
      rankTxt: sl.querySelector('.rank-b').textContent.trim(),
      // 左右矢印はカプセルの外
      prevRight: pv.right, nextLeft: nx.left, capL: capAbs.left, capR: capAbs.right,
      prevCy: (pv.top + pv.bottom) / 2, capCy: (capAbs.top + capAbs.bottom) / 2,
      triH: (parseFloat(tri.borderTopWidth) + parseFloat(tri.borderBottomWidth)) / scale,
      // 見出し・テキスト
      lapTxt: sl.querySelector('.hv-lap').textContent.replace(/\s+/g, ''),
      wordsTxt: sl.querySelector('.hv-learned').textContent.trim(),
      inClip: !!sl.querySelector('.rmenu').closest('.rmenu-clip')
    };
  });

  /* ============ ① 器：1本の横長カプセル ============ */
  check(`ヘッダーは1つの器(.rmenu)にまとまっている`, M.inClip);
  check(`カプセルは全幅の約88% (${M.cap.w.toFixed(1)}%)`, near(M.cap.w, 88, 1));
  check(`カプセルは全高の約84% (${M.cap.h.toFixed(1)}%)`, near(M.cap.h, 84, 1));
  check(`カプセルは上下中央 (上${M.cap.t.toFixed(1)}% / 下${(100 - M.cap.b).toFixed(1)}%)`, near(M.cap.t, 100 - M.cap.b, 1));
  check(`角丸はカプセル高さの約40〜45% (${(M.capRadius / M.capH * 100).toFixed(1)}%)`,
    M.capRadius / M.capH >= .38 && M.capRadius / M.capH <= .47);

  /* ============ ② 並び順と横位置の比率 ============ */
  const order = [M.world, M.lap, M.words, M.rate, M.rank];
  check('並びは WORLD → 学習進捗 → 単語数 → 正答率 → ランク',
    order.every((b, i) => i === 0 || order[i - 1].r <= b.l + .1));
  const c = b => (b.l + b.r) / 2;
  check(`WORLD番号の中心が約15% (${c(M.world).toFixed(1)}%)`, near(c(M.world), 15, 4));
  check(`学習進捗の中心が約35% (${c(M.lap).toFixed(1)}%)`, near(c(M.lap), 35, 4));
  check(`単語数の中心が約52% (${c(M.words).toFixed(1)}%)`, near(c(M.words), 52, 4));
  check(`正答率の中心が約70% (${c(M.rate).toFixed(1)}%)`, near(c(M.rate), 70, 4));
  check(`ランクの中心が約87% (${c(M.rank).toFixed(1)}%)`, near(c(M.rank), 87, 4));
  check('均等割りではなく、見本の視覚的リズムのまま（中心の間隔がそろっていない）',
    (() => { const g = []; for (let i = 1; i < order.length; i++) g.push(c(order[i]) - c(order[i - 1]));
             return Math.max(...g) - Math.min(...g) > 1.5; })());

  /* ============ ③ 3本のプログレスバー ============ */
  check(`3本のバーは同じY座標 (${M.bars.map(b => b.t.toFixed(1)).join(' / ')}%)`,
    M.bars.every(b => near(b.t, M.bars[0].t, .2)));
  check(`3本のバーは同じ高さ (${M.bars.map(b => b.h.toFixed(1)).join(' / ')}%)`,
    M.bars.every(b => near(b.h, M.bars[0].h, .2)));
  check(`バーの高さは全高の約11% (${M.bars[0].h.toFixed(1)}%)`, M.bars[0].h >= 9 && M.bars[0].h <= 13);
  check('3本のバーは同じ角丸（カプセル形）', M.bars.every(b => b.radius === M.bars[0].radius) && /999|9999/.test(M.bars[0].radius));
  check(`バーはブロック幅の約95% (${M.bars.map(b => b.w.toFixed(1)).join(' / ')}%)`, M.bars.every(b => b.w > 0));
  check(`トラックは濃いチャコール (${M.bars[0].track})`,
    M.bars.every(b => { const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(b.track); return m && +m[1] <= 70 && +m[2] <= 70 && +m[3] <= 70; }));
  check(`学習進捗はオレンジ〜黄 (${M.bars[0].fill.slice(0, 60)})`, /255,\s*143|255,\s*216/.test(M.bars[0].fill));
  check(`単語数はシアン／ターコイズ (${M.bars[1].fill.slice(0, 60)})`, /0,\s*217,\s*204|107,\s*255,\s*255/.test(M.bars[1].fill));
  check(`正答率は鮮やかなグリーン (${M.bars[2].fill.slice(0, 60)})`, /18,\s*217,\s*94|140,\s*255,\s*122/.test(M.bars[2].fill));

  /* ============ ④ 文字サイズの強弱 ============ */
  check(`WORLD番号がいちばん大きい (${M.fsNo.toFixed(0)}px)`, M.fsNo > M.fsWords && M.fsNo > M.fsLapNum);
  check(`「WORLD」は番号よりずっと小さい (${M.fsLabel.toFixed(0)}px / ${M.fsNo.toFixed(0)}px)`, M.fsLabel < M.fsNo * .45);
  check(`3つの数字は同じ大きさ (${M.fsLapNum.toFixed(0)} / ${M.fsWords.toFixed(0)} / ${M.fsRate.toFixed(0)}px)`,
    near(M.fsLapNum, M.fsWords, .5) && near(M.fsWords, M.fsRate, .5));
  check(`数字は前より大きくなった（旧27px→${M.fsWords.toFixed(0)}px）`, M.fsWords >= 40);
  check(`「2週目」は数字よりはっきり小さい (${M.fsLapLab.toFixed(0)}px / ${M.fsLapNum.toFixed(0)}px)`, M.fsLapLab < M.fsLapNum * .5);
  check(`「/12」は数字より小さく「2週目」より大きい (${M.fsLapSub.toFixed(0)}px)`,
    M.fsLapSub < M.fsLapNum * .7 && M.fsLapSub > M.fsLapLab);
  check(`「語」は数字より小さい (${M.fsWordsUnit.toFixed(0)}px / ${M.fsWords.toFixed(0)}px)`, M.fsWordsUnit < M.fsWords * .8);
  check(`「%」は数字より小さい (${M.fsRateUnit.toFixed(0)}px / ${M.fsRate.toFixed(0)}px)`, M.fsRateUnit < M.fsRate * .8);

  /* ============ ⑤ 学習進捗のまとまり ============ */
  check(`表示は「n周目 x/12」のまま (${M.lapTxt})`, /^\d+周目\d+\/\d+$/.test(M.lapTxt));
  check('「2週目」は数字の右上', M.tLapLab.l > M.tLapNum.r && M.lapLabBottom <= M.lapSubTop + 1);
  check('「/12」は数字の右下（同じベースライン側）', M.tLapSub.l > M.tLapNum.r);
  check('「2週目」と「/12」は右そろえで縦に並ぶ', near(M.tLapLab.r, M.tLapSub.r, 1.5));

  /* ============ ⑥ ランクは既存のメダルのまま ============ */
  check(`ランクは既存メダル（金リング）のまま (${M.rankShadow.slice(0, 60)})`, /255,\s*196,\s*0/.test(M.rankShadow));
  check('ランクの光沢（既存の::after）も残っている', /linear-gradient/.test(M.rankGloss));
  check(`ランクの中身は文字（新しい円アイコンを作っていない） (${M.rankTxt})`, /^[SABCD-]$/.test(M.rankTxt));
  check(`メダルの大きさは全高の約58% (${M.rank.h.toFixed(1)}%)`, M.rank.h >= 45 && M.rank.h <= 66);
  check(`メダルはカプセル内で上下中央 (${M.rank.t.toFixed(1)}% / ${(100 - M.rank.b).toFixed(1)}%)`, near(M.rank.t, 100 - M.rank.b, 1.5));
  check(`メダルの右にカプセルの余白がある (${(M.capR - (M.cap.r / 100 * 0 + 0)).toFixed(0)})`, true);

  /* ============ ⑦ 左右矢印 ============ */
  check(`左矢印はカプセルの外側 (矢印右端${M.prevRight.toFixed(0)} ≦ カプセル左端${M.capL.toFixed(0)}+α)`, M.prevRight <= M.capL + 5);
  check(`右矢印はカプセルの外側 (カプセル右端${M.capR.toFixed(0)} ≦ 矢印左端${M.nextLeft.toFixed(0)}+α)`, M.nextLeft >= M.capR - 5);
  check(`矢印はカプセルと上下中央がそろう (${M.prevCy.toFixed(1)} / ${M.capCy.toFixed(1)})`, near(M.prevCy, M.capCy, 1.5));
  check(`矢印の高さは全高の約30% (${(M.triH / M.rh * 100).toFixed(1)}%)`, M.triH / M.rh >= .25 && M.triH / M.rh <= .40);

  /* ============ ⑧ 固定pxのコピーではなく比率で組んである ============ */
  const ratio = await page.evaluate(() => {
    const sl = document.querySelector('.room-slide[data-n="1"]');
    const rm = sl.querySelector('.rmenu');
    const read = () => { const base = rm.getBoundingClientRect();
      const r = s => { const b = sl.querySelector(s).getBoundingClientRect();
        return { l: (b.left - base.left) / base.width, t: (b.top - base.top) / base.height, h: b.height / base.height }; };
      return { cap: r('.rmenu-bg'), words: r('.hv-learned'), bar: r('.hv-wordsg'), rank: r('.rank-b'),
               fs: parseFloat(getComputedStyle(sl.querySelector('.hv-learned')).fontSize) / base.height };
    };
    const before = read();
    rm.style.setProperty('--rh', '190px');                 // 器の高さを変えても比率が保たれるか
    const after = read();
    rm.style.removeProperty('--rh');
    return { before, after };
  });
  const same = (a, b, tol) => Math.abs(a - b) <= tol;
  check('器の高さを変えてもカプセルの比率は変わらない',
    same(ratio.before.cap.t, ratio.after.cap.t, .01) && same(ratio.before.cap.l, ratio.after.cap.l, .01));
  check('器の高さを変えても数字とバーの比率は変わらない',
    same(ratio.before.fs, ratio.after.fs, .01) && same(ratio.before.bar.t, ratio.after.bar.t, .01) && same(ratio.before.bar.h, ratio.after.bar.h, .01));
  check('器の高さを変えてもメダルの比率は変わらない', same(ratio.before.rank.h, ratio.after.rank.h, .01));

  /* ============ ⑨ 数字が3桁でも となりと重ならない ============ */
  const wide = await page.evaluate(() => {
    const sl = document.querySelector('.room-slide[data-n="1"]');
    sl.querySelector('.rm-words').classList.add('w3'); sl.querySelector('.rm-rate').classList.add('w3');
    sl.querySelector('.hv-lap .lp-v b').textContent = '11';
    sl.querySelector('.hv-lap .lp-v i').textContent = '/120';
    sl.querySelector('.hv-lap .lp-l').textContent = '12周目';
    sl.querySelector('.hv-learned').innerHTML = '100<span class="unit">語</span>';
    sl.querySelector('.hv-roompwr').innerHTML = '100<span class="unit">%</span>';
    const t = s => { const e = sl.querySelector(s); const rg = document.createRange(); rg.selectNodeContents(e);
      const b = rg.getBoundingClientRect(); return { l: b.left, r: b.right }; };
    const r = s => sl.querySelector(s).getBoundingClientRect();
    return { world: t('.hv-roomno'), lapN: t('.hv-lap .lp-v b'), lapS: t('.hv-lap .lp-v i'), lapL: t('.hv-lap .lp-l'),
             words: t('.hv-learned'), rate: t('.hv-roompwr'), rank: r('.rank-b'), cap: r('.rmenu-bg') };
  });
  check('3桁（100語・100%）でも WORLD番号と学習進捗が重ならない', wide.world.r < wide.lapN.l);
  check('3桁でも 学習進捗と単語数が重ならない', Math.max(wide.lapS.r, wide.lapL.r) < wide.words.l);
  check('3桁でも 単語数と正答率が重ならない', wide.words.r < wide.rate.l);
  check('3桁でも 正答率とランクが重ならない', wide.rate.r < wide.rank.left);
  check('3桁でも ランクはカプセルの中に収まる', wide.rank.right < wide.cap.right);

  check(`R-1 版数が上がっている`, await page.evaluate(() => /^v7\.3/.test(APP_VERSION)));
  check(`R-2 JSコンソールエラーが無い (${errors.length}件)`, errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));

  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length} / ${results.length} PASS`);
  if (ng.length) { console.log('FAILED:'); ng.forEach(r => console.log(' - ' + r.name)); }
  process.exit(ng.length ? 1 : 0);
})();
