/* k-tango 2026-08-01 19:46 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0801c.test.js
 * 検証:
 *  ① 結果画面でXPが増えただけ／PWRが増えただけでもレベルアップと同じポップアップが出る
 *  ② 結果画面のコメントが1行に収まる／ランクバッジの周りにマージンがある
 *  ③ 結果画面のまま閉じて次に開いても、プレゼント・マス進みの演出が出る
 *  ④ 単語カード内のマージンが減った（結果画面／最近学んだ単語）
 *  ⑤ 単語詳細ページ: 最上部にルームメニュー → 戻る/ナンバーのバー → 単語カードの並び
 *  ⑥ 単語詳細ページ: 左に約2倍の大きい単語カード／右は上からPWR・カード枚数・グラフ
 *  ⑦ 学習履歴はその表の中だけでスクロール／方向は国旗の絵文字
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
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kwt_coach_v1', '1');
    localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now()));
    localStorage.setItem('kwt_firstdone_v1', '1');
    localStorage.setItem('kwt_lasttestday_v1', dayKey(Date.now())); // 連続日数の演出ではなくプレゼントの演出に固定
  });
  await page.reload();
  await page.waitForTimeout(1500);

  // ================= ④ 単語カード内のマージン（最近学んだ単語） =================
  const tb = await page.evaluate(() => {
    const c = document.querySelector('#today-band .tb-card');
    const st = getComputedStyle(c);
    return { pt: parseFloat(st.paddingTop), pl: parseFloat(st.paddingLeft),
             koMt: parseFloat(getComputedStyle(c.querySelector('.tb-ko')).marginTop),
             imgH: parseFloat(getComputedStyle(c.querySelector('.tb-imgw')).height),
             cardH: c.getBoundingClientRect().height };
  });
  check(`最近学んだ単語カードの内側の余白が減った (上下${tb.pt}px / 左右${tb.pl}px)`, tb.pt <= 4 && tb.pl <= 4);
  check(`同カードの語の上マージンも減った (${tb.koMt}px)`, tb.koMt <= 2);
  check(`余白が減ったぶん絵が大きい (${Math.round(tb.imgH)}px / カード${Math.round(tb.cardH)}px)`, tb.imgH / tb.cardH >= 0.55);

  // ================= テストを1本完走して結果画面へ =================
  const normalRoom = await page.evaluate(() => { curLevel = 'beginner'; curSection = 1; return curSection; });
  await page.evaluate(n => {
    curLevel = 'beginner'; curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 1 };
    startTest();
    const N = state.questions.length;
    for (let i = 0; i < N; i++) {
      const q = state.questions[state.idx]; if (!q) break;
      if (q.type === 'sg' || q.type === 'sg4') { shootAdvance(); continue; }
      answered = false; clearInterval(timer); startTimer();
      submit('correct', q.type === 'w' ? q.word.ko : q.correct);
      document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer();
    }
  }, normalRoom);
  await page.waitForTimeout(3600);

  // ================= ② コメント1行・ランクバッジのマージン =================
  const res = await page.evaluate(() => {
    const cheer = document.querySelector('#s-result .res-cheer'), sp = cheer && cheer.querySelector('.rch');
    const idw = document.querySelector('#s-result .res-idw'), st = idw && getComputedStyle(idw);
    return {
      text: cheer && cheer.textContent.trim(),
      lines: cheer && Math.round(cheer.getBoundingClientRect().height / parseFloat(getComputedStyle(cheer).lineHeight)),
      nowrap: cheer && getComputedStyle(cheer).whiteSpace === 'nowrap',
      fits: !!sp && sp.getBoundingClientRect().width <= cheer.clientWidth - 20,
      fontPx: sp && parseFloat(getComputedStyle(sp).fontSize),
      mTop: st && parseFloat(st.marginTop), mRight: st && parseFloat(st.marginRight),
      mBottom: st && parseFloat(st.marginBottom), mLeft: st && parseFloat(st.marginLeft)
    };
  });
  check(`コメントは1行 (${res.lines}行 / ${res.fontPx}px)「${res.text}」`, res.lines === 1 && res.nowrap);
  check('コメントが横にはみ出していない（1行に収まっている）', res.fits);
  check(`ランクバッジの周りにマージンがある (上${res.mTop} 右${res.mRight} 下${res.mBottom} 左${res.mLeft})`,
    res.mTop > 0 && res.mRight > 0 && res.mBottom > 0 && res.mLeft > 0);

  // ================= ④ 単語カード内のマージン（結果画面） =================
  const rc = await page.evaluate(() => {
    const c = document.querySelector('#s-result .rc-card'), st = getComputedStyle(c);
    return { pt: parseFloat(st.paddingTop), pl: parseFloat(st.paddingLeft),
             koMt: parseFloat(getComputedStyle(c.querySelector('.rc-ko')).marginTop) };
  });
  check(`結果カードの内側の余白が減った (上下${rc.pt}px / 左右${rc.pl}px)`, rc.pt <= 3 && rc.pl <= 2);
  check(`結果カードの語の上マージンも減った (${rc.koMt}px)`, rc.koMt <= 1);

  // ================= ① XP・PWRのポップアップ =================
  // カード獲得演出（最大2.8秒）→結果アニメ→1.5秒後にポップアップ、の順に流れる
  await page.evaluate(() => { document.querySelectorAll('.cardget').forEach(o => o.remove()); });
  await page.waitForTimeout(2200);
  const pop1 = await page.evaluate(() => {
    const ov = document.querySelector('.lvup.gainpop');
    if (!ov) return null;
    return { lab: ov.querySelector('.lu-lab').textContent, num: ov.querySelector('.lu-num').textContent,
             msg: ov.querySelector('.lu-msg').textContent, hasOk: !!ov.querySelector('.lu-card .btn'),
             full: getComputedStyle(ov).position === 'fixed' };
  });
  check(`XPが増えただけでもポップアップが出る (${pop1 && pop1.lab})`, pop1 && /XP/.test(pop1.lab));
  check('ポップアップはレベルアップと同じ全面表示＋OKボタン', pop1 && pop1.full && pop1.hasOk);

  // OKで閉じると次（PWR）が出る
  await page.evaluate(() => closeLevelUp());
  await page.waitForTimeout(700);
  const pop2 = await page.evaluate(() => {
    const ov = document.querySelector('.lvup');
    return ov ? { lab: ov.querySelector('.lu-lab').textContent, gain: ov.classList.contains('gainpop') } : null;
  });
  check(`続けてPWR上昇のポップアップが出る (${pop2 && pop2.lab})`, pop2 && /PWR/.test(pop2.lab));

  await page.evaluate(() => { let n = 0; while (document.querySelector('.lvup') && n++ < 6) closeLevelUp(); });
  await page.waitForTimeout(600);

  // ================= ③ 結果画面のまま閉じて開き直す =================
  const saved = await page.evaluate(() => {
    const r = JSON.parse(localStorage.getItem('kwt_notice_v1') || 'null');
    return { has: !!(r && r.n), type: r && r.n && r.n.type, bt: !!(r && r.bt) };
  });
  check(`結果画面の時点でお知らせが控えられている (${saved.type})`, saved.has);
  check('クリアしたマスの位置も控えられている（マス進み演出のため）', saved.bt);

  await page.reload(); // ＝結果画面のままアプリを閉じて開き直した状態
  await page.waitForTimeout(2600);
  const after = await page.evaluate(() => ({
    home: document.getElementById('s-home').classList.contains('on'),
    bubble: !!document.querySelector('.pbub'), step: !!document.querySelector('.stepnote'),
    clear: !!document.querySelector('.sg-clear'),
    left: localStorage.getItem('kwt_notice_v1')
  }));
  check('開き直すとホームでプレゼント／マス進みの演出が出る',
    after.home && (after.bubble || after.step || after.clear));
  await page.waitForTimeout(4200);
  const after2 = await page.evaluate(() => ({ step: !!document.querySelector('.stepnote'), left: localStorage.getItem('kwt_notice_v1') }));
  check('「新しいステップに進みました」まで流れる', after2.step || after.step);
  check('一度出したら控えは消える（毎回出続けない）', after2.left === null || after.left === null);

  // 二度目の起動では出ない
  await page.evaluate(() => { document.querySelectorAll('.pbub,.stepnote,.sg-clear,.lvup').forEach(o => o.remove()); });
  await page.reload();
  await page.waitForTimeout(2600);
  const third = await page.evaluate(() => !!document.querySelector('.pbub') || !!document.querySelector('.stepnote'));
  check('次の起動では演出は出ない（1回だけ）', !third);

  // ================= ⑤⑥⑦ 単語詳細ページ =================
  await page.evaluate(() => {
    document.querySelectorAll('.pbub,.stepnote,.lvup,.fcust,.streak-cel,.cardget').forEach(o => o.remove());
    renderWordDetail(LEVEL_SECTIONS.beginner[1][0], 'room');
  });
  await page.waitForTimeout(1200);

  const wd = await page.evaluate(() => {
    const page_ = document.querySelector('#s-wdetail .page');
    const kids = [...page_.children].map(e => e.id || e.className.split(' ')[0]);
    const rm = document.getElementById('wd-rmwrap');
    const bar = document.querySelector('#s-wdetail .zk-sum');
    const pager = document.getElementById('wd-pager');
    const dot = pager.querySelector('.wd-dot');
    const big = document.querySelector('#s-wdetail .wd-bigcard');
    const side = document.querySelector('#s-wdetail .wd-side');
    const sideKids = side ? [...side.children].map(e => e.className.split(' ')[0]) : [];
    const r = e => e.getBoundingClientRect();
    return {
      order: kids,
      rmTop: rm ? r(rm).top : null, barTop: bar ? r(bar).top : null, pagerTop: pager ? r(pager).top : null,
      rmH: rm ? r(rm).height : 0,
      hasMenuParts: !!(rm && rm.querySelector('.hv-roomlabel') && rm.querySelector('.hv-roomno') &&
                       rm.querySelector('.hv-learned') && rm.querySelector('.hv-roompwr') &&
                       rm.querySelector('.hv-wordsg') && rm.querySelector('.hv-roomg') && rm.querySelector('.rank-b')),
      menuNo: rm && rm.querySelector('.hv-roomno') && rm.querySelector('.hv-roomno').textContent,
      barHasBack: !!(bar && bar.querySelector('.zk-back')),
      barTitle: bar && (bar.querySelector('#wd-title') || {}).textContent,
      dotBg: dot && getComputedStyle(dot).backgroundImage,
      dotImg: !!(dot && dot.querySelector('.wd-dimg')),
      dotShadowCur: getComputedStyle(pager.querySelector('.wd-dot.cur')).boxShadow,
      dotW: dot ? r(dot).width : 0,
      bigW: big ? r(big).width : 0,
      bigLeftOfSide: !!(big && side) && r(big).right <= r(side).left + 1,
      sideKids,
      rlab: (document.querySelector('#s-wdetail .wd-rlab') || {}).textContent,
      graphInSide: !!(side && side.querySelector('.st-graphpanel svg')),
      stroke: +((document.querySelector('#s-wdetail .st-graphpanel polyline') || {}).getAttribute
        ? document.querySelector('#s-wdetail .st-graphpanel polyline').getAttribute('stroke-width') : 0)
    };
  });
  check(`最上部がルームメニュー → その下が戻る/ナンバーのバー → その下が単語カードの並び (${wd.order.join(' / ')})`,
    wd.rmTop < wd.barTop && wd.barTop < wd.pagerTop);
  check(`ルームメニューが単語帳ページと同じ中身 (ROOM ${wd.menuNo})`, wd.hasMenuParts);
  check(`ルームメニューに高さがある (${Math.round(wd.rmH)}px)`, wd.rmH > 40);
  check(`バーに戻るボタンとナンバー (${wd.barTitle})`, wd.barHasBack && /No\./.test(wd.barTitle || ''));
  check(`並びは白座布団ではなく単語カードの意匠 (${wd.dotBg})`,
    wd.dotBg === 'linear-gradient(160deg, rgb(255, 255, 255), rgb(255, 233, 194))');
  check('並びのカードに絵が入っている', wd.dotImg);
  check(`選択中の枠は黄色ではない (${wd.dotShadowCur})`, !/255,\s*196,\s*0/.test(wd.dotShadowCur));
  check(`左の単語カードは並びのカードの約2倍 (${Math.round(wd.bigW)}px / ${Math.round(wd.dotW)}px)`,
    wd.bigW / wd.dotW >= 1.6);
  check('大きいカードは左・その右に情報の列', wd.bigLeftOfSide);
  check(`右の列は上からPWR・カード枚数・グラフ (${wd.sideKids.join(' / ')})`,
    wd.sideKids[0] === 'wd-crate' && wd.sideKids[1] === 'wd-cbar' && wd.sideKids[2] === 'st-graphpanel');
  check(`PWR表記になっている (${wd.rlab})`, wd.rlab === 'PWR');
  check('グラフは右の列の中', wd.graphInSide);
  check(`グラフの線は太いまま (${wd.stroke})`, wd.stroke >= 4);

  // 学習履歴：表の中だけでスクロール／国旗の絵文字
  const hist = await page.evaluate(() => {
    const box = document.querySelector('#s-wdetail .wd-histbox');
    if (!box) return null;
    const st = getComputedStyle(box);
    const cell = document.querySelector('#s-wdetail .htab tbody tr td:nth-child(2)');
    const before = box.scrollTop; box.scrollTop = 60;
    const moved = box.scrollTop !== before || box.scrollHeight <= box.clientHeight;
    return { oy: st.overflowY, maxH: st.maxHeight, scrollable: box.scrollHeight > box.clientHeight, moved,
             last: box === document.querySelector('#s-wdetail .tdetail-sec').lastElementChild,
             dir: cell ? cell.textContent.trim() : '',
             fam: cell ? getComputedStyle(cell.querySelector('.hdir') || cell).fontFamily : '' };
  });
  check(`学習履歴は表の中だけでスクロール (${hist.oy} / ${hist.maxH})`, hist.oy === 'auto' || hist.oy === 'scroll');
  check('学習履歴は一番下にある', hist.last);
  check(`方向は国旗の絵文字 (${hist.dir})`, /[\u{1F1E6}-\u{1F1FF}]{2}→[\u{1F1E6}-\u{1F1FF}]{2}/u.test(hist.dir) || hist.dir === '書き取り');
  check(`絵文字フォントを指定している (${hist.fam})`, /Emoji/i.test(hist.fam));

  // 大きいカードをタップで読み上げが動く（onclickが付いている）
  const speak = await page.evaluate(() => {
    const c = document.querySelector('#s-wdetail .wd-bigcard');
    return !!(c && c.onclick && c.dataset.ko);
  });
  check('大きい単語カードはタップで読み上げできる', speak);

  check(`コンソールエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log('FAILED: ' + failed.map(r => r.name).join(' / ')); process.exit(1); }
})();
