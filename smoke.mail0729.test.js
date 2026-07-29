/* k-tango 2026-07-29 メール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0729.test.js
 * 検証:
 *  ・中断ダイアログ＝白地＋黒枠・影なし／中断中はタイマー停止・問題文は横棒／シューティングも凍る
 *  ・薄くなった選択肢を回答後に押しても次へ行かず発音される
 *  ・音声マークは絵文字ではなく白いシルエット（単語詳細・書き取りの答え合わせ）
 *  ・書き取りの音声ボタンは「正解」の下
 *  ・結果画面: 「カードをタップで発音」の帯なし／メーターはステータスと同じ黒座布団・XPは黄・PWRは+n%
 *  ・単語帳/今日学んだ単語のカードが結果画面のカードと同じ意匠
 *  ・単語詳細: ROOMメニュー・カード型ページャー・獲得したカードの枚数＋音声マーク・記憶率バー・太いグラフ
 *  ・学習履歴の方向が「韓→日」表記
 *  ・すごろく: 進捗チップがぼかしの外／最後のマスの絵までスクロールできる
 *  ・今日の5問・今日のトレンドは開いた時点で10秒カウントダウン
 *  ・左上アバターは職業名（日本語）を出さない
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 602, height: 1178 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); localStorage.setItem('kwt_firstdone_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(1500);
  const normalRoom = await page.evaluate(() => { const sp = specialRooms().beginner; let n = 1; while ([sp.blue, sp.red, sp.green].includes(n)) n++; return n; });

  // ---------- 左上アバター: 職業名（日本語）は出さない ----------
  check('アバターの入替はキャラ⇄MBTIだけ（職業名を出さない）',
    await page.evaluate(() => !_AVATAR_SEQ.includes('job')));

  // ---------- すごろく ----------
  const board = await page.evaluate(n => {
    curLevel = 'beginner'; curSection = n; saveLastRoom();
    const sl = document.querySelector(`.room-slide[data-n="${n}"]`);
    const prog = sl && sl.querySelector('.sg-prog');
    const wrap = sl && sl.querySelector('.sg-wrap');
    const sc = sl && sl.querySelector('.sg-scroll');
    const track = sc && sc.querySelector('.sg-track');
    const tiles = [...(track ? track.querySelectorAll('.sg-tile') : [])];
    const top = tiles[tiles.length - 1]; // 最後のマス（＝いちばん上）
    return {
      progOutside: !!(prog && wrap && !wrap.contains(prog)),
      progTop: prog && parseInt(getComputedStyle(prog).top, 10),
      trackH: track && track.offsetHeight,
      topTileY: top && top.offsetTop,
      headroom: typeof SG_HEADROOM === 'number' ? SG_HEADROOM : null
    };
  }, normalRoom);
  check('「n周目 x/12」チップはぼかしマスクの外に出ている', board.progOutside);
  check(`最後のマスの絵(上186px)がスクロール範囲に収まる (マスy=${board.topTileY})`, board.topTileY >= 186 + 40);

  // ---------- 出題中の中断ダイアログ ----------
  await page.evaluate(n => { curLevel = 'beginner'; curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 1 }; startTest(); clearInterval(timer); renderQuestion(); }, normalRoom);
  await page.waitForTimeout(250);
  await page.evaluate(() => { const q = state.questions[state.idx]; if (q.type !== 'kj' && q.type !== 'jk') { state.questions[state.idx] = state.questions.find(x => x.type === 'kj' || x.type === 'jk') || q; renderQuestion(); } });
  await page.waitForTimeout(200);
  await page.evaluate(() => confirmQuit());
  await page.waitForTimeout(250);
  const dlg = await page.evaluate(() => {
    const card = document.querySelector('.appconfirm .ac-card');
    const yes = document.querySelector('.appconfirm .ac-stop');
    const cs = getComputedStyle(card), ys = getComputedStyle(yes);
    const w = document.querySelector('#qstage .qword');
    return {
      cardBg: cs.backgroundColor, cardShadow: cs.boxShadow, cardBorder: cs.borderTopWidth + ' ' + cs.borderTopColor,
      yesShadow: ys.boxShadow, yesBorder: ys.borderTopWidth + ' ' + ys.borderTopColor,
      paused: document.getElementById('s-quiz').classList.contains('paused'),
      wordColor: w && getComputedStyle(w).color,
      barW: w && getComputedStyle(w, '::after').width,
      time: document.getElementById('time').textContent
    };
  });
  check(`中断ダイアログは白地 (${dlg.cardBg})`, dlg.cardBg === 'rgb(255, 255, 255)');
  check(`中断ダイアログは影なし (${dlg.cardShadow})`, dlg.cardShadow === 'none');
  check(`中断ダイアログは黒枠線 (${dlg.cardBorder})`, /^2px rgb\(17, 17, 17\)$/.test(dlg.cardBorder));
  check(`「はい」も影なし・黒枠線 (${dlg.yesShadow} / ${dlg.yesBorder})`, dlg.yesShadow === 'none' && /^2px rgb\(17, 17, 17\)$/.test(dlg.yesBorder));
  check('中断中は問題文が透明（横棒で伏せる）', dlg.wordColor === 'rgba(0, 0, 0, 0)');
  check(`中断中の問題文は横棒に置き換わる (${dlg.barW})`, parseFloat(dlg.barW) > 20);
  await page.waitForTimeout(1600);
  const t2 = await page.evaluate(() => document.getElementById('time').textContent);
  check(`中断中は時間が進まない (${dlg.time} → ${t2})`, dlg.time === t2);
  await page.evaluate(() => document.querySelector('.appconfirm #ac-no').click());
  await page.waitForTimeout(120);
  check('「いいえ」で伏せ字が戻る', await page.evaluate(() => !document.getElementById('s-quiz').classList.contains('paused')));
  await page.waitForTimeout(700);
  check('「いいえ」で計時が再開する', await page.evaluate(() => parseFloat(document.getElementById('time').textContent) < 10));

  // ---------- 薄くなった選択肢: 回答後に押しても次へ行かず発音 ----------
  const elim = await page.evaluate(() => {
    const st = loadSettings(); st.tapAdvance = true; saveSettings(st);
    const q = state.questions[state.idx];
    const wrong = [...document.querySelectorAll('#qstage .choice')].find(b => b.dataset.v !== q.correct);
    wrong.classList.add('elim'); wrong.disabled = true;                       // 時間経過で薄くなった状態を作る
    answered = false; clearInterval(timer); startTimer(); submit('correct', q.correct);
    return { idx: state.idx, ov: !!document.querySelector('.overlay'), pe: getComputedStyle(wrong).pointerEvents };
  });
  check('回答後は薄い選択肢もタップを受け付ける', elim.pe === 'auto');
  const afterTap = await page.evaluate(() => {
    const q = state.questions[state.idx];
    const wrong = document.querySelector('#qstage .choice.elim');
    const r = wrong.getBoundingClientRect();
    let spoke = false; const orig = window.speakSmart; window.speakSmart = () => { spoke = true; };
    document.querySelector('.overlay').dispatchEvent(new MouseEvent('click', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
    window.speakSmart = orig;
    return { idx: state.idx, ov: !!document.querySelector('.overlay'), spoke, hasSpk: !!wrong.querySelector('.chspk') };
  });
  check('薄い選択肢を押しても次の問題へ進まない', afterTap.idx === elim.idx && afterTap.ov);
  check('薄い選択肢を押すと発音される', afterTap.spoke);
  check('選択肢に音声マーク（白シルエットSVG）が付く', afterTap.hasSpk);

  // ---------- 音声マークは絵文字ではない ----------
  check('選択肢の音声マークはSVG', await page.evaluate(() => !!document.querySelector('#qstage .choice .chspk svg')));
  await page.evaluate(() => { document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); quitTest(); });
  await page.waitForTimeout(300);

  // ---------- 書き取りの答え合わせ: 音声ボタンは正解の下 ----------
  const wr = await page.evaluate(() => {
    const q = state.questions.find(x => x.type === 'w') || { type: 'w', word: BEGINNER_WORDS[0], correct: BEGINNER_WORDS[0].ko };
    const html = writingAnsHTML('incorrect', q, 'xxx');
    const d = document.createElement('div'); d.innerHTML = html;
    const rows = [...d.querySelectorAll('.oa-row,.oa-spkrow')].map(e => e.className);
    return { rows, emoji: /🔊/.test(html), svg: !!d.querySelector('.oa-spk svg') };
  });
  check(`書き取りの音声ボタンは正解の下 (${wr.rows.join(' / ')})`, wr.rows[wr.rows.length - 1] === 'oa-spkrow');
  check('書き取りの音声マークは絵文字ではなくSVG', !wr.emoji && wr.svg);

  // ---------- 結果画面 ----------
  await page.evaluate(n => {
    curLevel = 'beginner'; curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 1 };
    startTest();
    const N = state.questions.length;
    for (let i = 0; i < N; i++) { const q = state.questions[state.idx]; if (!q) break; if (q.type === 'sg' || q.type === 'sg4') { shootAdvance(); continue; } answered = false; clearInterval(timer); startTimer(); submit('correct', q.type === 'w' ? q.word.ko : q.correct); document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer(); }
  }, normalRoom);
  await page.waitForTimeout(3600);
  const res = await page.evaluate(() => {
    const idw = document.querySelector('.res-idw'), side = document.querySelector('.res-side');
    const score = document.querySelector('.res-scorerow'), meters = document.querySelector('.res-meters');
    const cheer = document.querySelector('.res-cheer'), head = document.querySelector('.res-head');
    const pwrGain = [...document.querySelectorAll('.res-mgain')].pop();
    return {
      hint: !!document.querySelector('.res-spkhint'),
      medalOnly: idw && idw.querySelectorAll('.res-score,.res-counts').length === 0 && !!idw.querySelector('.rank-medal'),
      scoreAbove: score && meters && score.getBoundingClientRect().bottom <= meters.getBoundingClientRect().top + 1,
      rightSide: idw && side && idw.getBoundingClientRect().right <= side.getBoundingClientRect().left + 1,
      cheerLast: cheer && head && cheer === head.lastElementChild,
      cheerLines: cheer && Math.round(cheer.getBoundingClientRect().height / parseFloat(getComputedStyle(cheer).lineHeight)),
      metersBg: meters && getComputedStyle(meters).backgroundColor,
      xpFill: getComputedStyle(document.getElementById('res-xpfill')).backgroundColor,
      xpGainCol: getComputedStyle(document.getElementById('res-xp-gain')).color,
      pwr: pwrGain && pwrGain.textContent.trim()
    };
  });
  check('結果画面に「カードをタップで発音」の帯は出さない', !res.hint);
  check('左はメダルだけ', res.medalOnly);
  check('右は上＝点数と正誤／下＝メーター', res.scoreAbove && res.rightSide);
  check(`コメントは一番下に1行 (${res.cheerLines}行)`, res.cheerLast && res.cheerLines === 1);
  check(`メーターはステータスと同じ黒座布団 (${res.metersBg})`, /rgba?\(0, 0, 0/.test(res.metersBg));
  check(`XPゲージは黄色 (${res.xpFill})`, res.xpFill === 'rgb(255, 255, 55)');
  check(`獲得XPも黄色 (${res.xpGainCol})`, res.xpGainCol === 'rgb(255, 255, 55)');
  check(`PWRの増分は「+n%」表記 (${res.pwr})`, /^[+-]?\d+\s*%$/.test(res.pwr));

  // ---------- 単語帳のカード意匠 ----------
  await page.evaluate(() => { document.querySelectorAll('.cardget,.lvup,.pbub,.stepnote,.fcust,.streak-cel').forEach(o => o.remove()); show('s-home'); });
  await page.waitForTimeout(700);
  await page.evaluate(() => { document.querySelectorAll('.lvup,.pbub,.stepnote,.fcust,.streak-cel').forEach(o => o.remove()); enterListMode(); });
  await page.waitForTimeout(1200);
  const cards = await page.evaluate(() => {
    const rcBg = 'linear-gradient(160deg, rgb(255, 255, 255), rgb(255, 233, 194))';
    const wb = document.querySelector('.wb-card'), tb = document.querySelector('.tb-card');
    return { wb: wb && getComputedStyle(wb).backgroundImage, tb: tb && getComputedStyle(tb).backgroundImage, want: rcBg,
      wbShadow: wb && getComputedStyle(wb).boxShadow !== 'none' };
  });
  check(`単語帳カードが結果カードと同じ意匠 (${cards.wb})`, cards.wb === cards.want && cards.wbShadow);
  check('今日学んだ単語のカードも同じ意匠', cards.tb === cards.want);

  // ---------- 単語詳細 ----------
  await page.evaluate(() => { exitListMode(); renderWordDetail(LEVEL_SECTIONS.beginner[curSection][0], 'room'); });
  await page.waitForTimeout(900);
  const wd = await page.evaluate(() => {
    const bar = document.querySelector('#s-wdetail .wd-cbar');
    const cards = bar && bar.querySelector('.wd-cards'), spk = bar && bar.querySelector('.wd-spk');
    const dot = document.querySelector('#wd-pager .wd-dot');
    const th = [...document.querySelectorAll('#s-wdetail .htab th')].map(e => e.textContent);
    return {
      room: !!document.querySelector('#s-wdetail .wd-room'),
      back: !!document.querySelector('#s-wdetail .zk-sum .zk-back'),
      cardsTxt: cards && cards.textContent.replace(/\s+/g, ''),
      spkRight: !!(cards && spk) && spk.getBoundingClientRect().left >= cards.getBoundingClientRect().right - 1,
      spkSvg: !!(spk && spk.querySelector('svg')),
      pagerKoJa: !!(dot && dot.querySelector('.wd-dk') && dot.querySelector('.wd-dj')) && !dot.querySelector('.wd-dn'),
      koSize: parseFloat(getComputedStyle(document.querySelector('.wd-ko2')).fontSize),
      jaSize: parseFloat(getComputedStyle(document.querySelector('.wd-ja2')).fontSize),
      rateBar: !!document.querySelector('.wd-crate .wd-rg .wd-rf'),
      rateLab: (document.querySelector('.wd-rlab') || {}).textContent,
      dateTh: th[0],
      stroke: (document.querySelector('#s-wdetail .st-graphpanel polyline') || {}).getAttribute && +document.querySelector('#s-wdetail .st-graphpanel polyline').getAttribute('stroke-width')
    };
  });
  check('単語詳細にROOMメニューが出る', wd.room);
  check('戻るボタンが単語帳ページと同じ（黒帯の‹）', wd.back);
  check(`枚数が「獲得したカード n枚」表記 (${wd.cardsTxt})`, /^獲得したカード\d+枚$/.test(wd.cardsTxt || ''));
  check('音声マークはカード枚数の右', wd.spkRight);
  check('単語詳細の音声マークはSVG', wd.spkSvg);
  check('上のページャーは韓国語＋日本語のカード', wd.pagerKoJa);
  check(`韓国語・日本語が大きい (${wd.koSize}px / ${wd.jaSize}px)`, wd.koSize >= 40 && wd.jaSize >= 22);
  check(`記憶率はラベル＋バーで量が分かる (${wd.rateLab})`, wd.rateBar && wd.rateLab === '記憶率');
  check(`学習履歴の日付列に見出しを出さない ("${wd.dateTh}")`, wd.dateTh === '');
  check(`グラフの線が太い (${wd.stroke})`, wd.stroke >= 4);
  const dir = await page.evaluate(() => {
    const c = document.querySelector('#s-wdetail .htab tbody tr td:nth-child(2)');
    return c ? c.textContent.replace(/\s+/g, '') : '';
  });
  check(`学習履歴の方向が「韓→日」表記 (${dir})`, /^(韓→日|日→韓|書き取り)$/.test(dir));

  // ---------- 今日の5問／トレンドの10秒カウントダウン ----------
  await page.evaluate(() => show('s-home'));
  await page.waitForTimeout(500);
  const d5 = await page.evaluate(() => { openDaily5(); const e = document.getElementById('d5a-sec'); return { sec: e && e.textContent, bar: !!document.getElementById('d5a-fill') }; });
  check(`今日の5問は開いた時点で10秒カウントダウン (${d5.sec})`, d5.sec === '10' && d5.bar);
  await page.waitForTimeout(2200);
  const d5b = await page.evaluate(() => (document.getElementById('d5a-sec') || {}).textContent);
  check(`カウントダウンが進む (${d5b})`, +d5b < 10);
  await page.evaluate(() => closeDaily5());
  await page.waitForTimeout(200);
  check('閉じたらカウントダウンも止まる', await page.evaluate(() => !_d5CdTimer && !_d5CdTo));
  const tr = await page.evaluate(() => {
    const k = d5Key(Date.now()), s = d5Slot(Date.now());
    saveD5({ [k]: { slot: s, done: true, correct: 5, total: 5, items: [] } });   // 5問を消化した日だけトレンドが出る
    openTrend(); const e = document.getElementById('d5a-sec');
    return { sec: e && e.textContent, hasBtn: !!document.querySelector('.tr-go') };
  });
  check(`今日のトレンドも開いた時点で10秒カウントダウン (${tr.sec})`, tr.hasBtn ? tr.sec === '10' : true);
  await page.evaluate(() => closeDaily5());

  check(`コンソールエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));
  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length}/${results.length} PASS`);
  process.exit(ng.length ? 1 : 0);
})();
