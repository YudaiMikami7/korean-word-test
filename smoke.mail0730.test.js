/* k-tango 2026-07-29 23:53 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0730.test.js
 * 検証:
 *  ・出題画面の帯: 黄色い札が12枚ぶん等間隔に並び、1問ごとに1枚ぶん左へ流れて獲得される（札に韓国語は書かない）
 *  ・結果画面: 白い座布団の初回バナーは出さず、ランク下の一言に「初テストおつかれさま／カードが集まる／毎日1回」
 *  ・結果画面の上段が 左＝点数 / 中＝正解数 / 右＝不正解数 の3つ
 *  ・レベル(XP)とPWRのゲージが同じ横幅／XPは黄・PWRは緑／PWRの増分は「+n%」
 *  ・「ホーム画面に追加」は結果の下に置かず、ホームへ戻るときに一度だけたずねる
 *  ・スワイプの案内は5秒で消え、左右の三角はROOMメニューの矢印と同じ幅・同じ位置
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 602, height: 1178 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); });
  await page.reload();
  await page.waitForTimeout(1500);
  const normalRoom = await page.evaluate(() => { const sp = specialRooms().beginner; let n = 1; while ([sp.blue, sp.red, sp.green].includes(n)) n++; return n; });

  // ---------- スワイプの案内（ROOMメニューの矢印と揃える・5秒で消える） ----------
  const hint = await page.evaluate(() => {
    localStorage.removeItem('kwt_roomhint_v1');
    initRoomHint();
    const h = document.getElementById('room-hint');
    const L = h.querySelector('.rh-l'), R = h.querySelector('.rh-r');
    const prev = document.getElementById('rm-prev'), next = document.getElementById('rm-next');
    const c = e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, w: r.width, l: r.left, r: r.right }; };
    return { shown: h.style.display !== 'none' && !h.classList.contains('off'),
             ms: typeof ROOMHINT_MS === 'number' ? ROOMHINT_MS : null,
             L: c(L), R: c(R), prev: c(prev), next: c(next), hw: c(h) };
  });
  check('起動時にスワイプの案内が出る', hint.shown);
  check(`左の三角がROOMメニューの矢印と同じ位置・同じ幅 (x${hint.L.x.toFixed(1)} w${hint.L.w.toFixed(1)} / x${hint.prev.x.toFixed(1)} w${hint.prev.w.toFixed(1)})`,
        near(hint.L.x, hint.prev.x, 1) && near(hint.L.w, hint.prev.w, 1));
  check(`右の三角も矢印と揃う (x${hint.R.x.toFixed(1)} w${hint.R.w.toFixed(1)} / x${hint.next.x.toFixed(1)} w${hint.next.w.toFixed(1)})`,
        near(hint.R.x, hint.next.x, 1) && near(hint.R.w, hint.next.w, 1));
  check(`消えるまで5秒 (${hint.ms}ms)`, hint.ms === 5000);
  await page.waitForTimeout(5600);
  const hintGone = await page.evaluate(() => {
    const h = document.getElementById('room-hint');
    return { off: h.classList.contains('off') || h.style.display === 'none',
             kept: !localStorage.getItem('kwt_roomhint_v1') }; // 自動で引っ込んだだけなので「二度と出さない」印は付けない
  });
  check('5秒たつと自然に消える', hintGone.off);
  check('自動で消えたときは次回また出す', hintGone.kept);

  // ---------- 出題画面の帯: 黄色い札が並び、1問ごとに獲得される ----------
  const rail = await page.evaluate(async n => {
    curLevel = 'beginner'; curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 1 };
    startTest(); clearInterval(timer); renderQuestion();
    const bar = document.getElementById('pbar'), rl = document.getElementById('rn-rail');
    const slots = [...rl.querySelectorAll('.rn-slot')];
    const barR = bar.getBoundingClientRect();
    const visible = slots.filter(s => { const r = s.getBoundingClientRect(); return r.right > barR.left && r.left < barR.right; }).length;
    const cs = getComputedStyle(slots[0]);
    const chR = document.getElementById('rn-char').getBoundingClientRect();
    const first = slots[0].getBoundingClientRect();
    // 1問答えてみる（正解＝手前の札を獲得）
    answered = false; startTimer();
    const q = state.questions[state.idx];
    submit('correct', q.type === 'w' ? q.word.ko : q.correct);
    const got = slots[0].classList.contains('got');
    document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer(); clearInterval(timer);
    const moved = /translateX\(-\d/.test(rl.style.transform || '');
    const q2 = state.questions[state.idx];
    answered = false; startTimer();
    submit('incorrect', q2.type === 'w' ? '' : 'ちがう');
    const pop = slots[1].classList.contains('pop');
    document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); quitTest();
    return { n: slots.length, visible, w: parseFloat(cs.width), h: parseFloat(cs.height), bg: cs.backgroundColor,
             empty: slots.every(s => s.textContent === ''), ahead: first.left > chR.left, got, pop, moved };
  }, normalRoom);
  check(`出題ぶんの札が並ぶ (${rail.n}枚)`, rail.n === 12);
  check(`同時に見えるのは5〜8枚 (${rail.visible})`, rail.visible >= 5 && rail.visible <= 8);
  check(`黄色い縦長の札 (${rail.w}x${rail.h} ${rail.bg})`, rail.h > rail.w && rail.bg === 'rgb(245, 197, 24)');
  check('札に韓国語は書かない（答えが見えない）', rail.empty);
  check('札はキャラの進む先に置かれている', rail.ahead);
  check('正解すると手前の札を獲得する', rail.got);
  check('不正解の札ははじけて消える', rail.pop);
  check('答えるたびに1枚ぶん流れる', rail.moved);

  // ---------- 結果画面（初回完走） ----------
  await page.evaluate(() => { localStorage.removeItem('kwt_firstdone_v1'); localStorage.removeItem('kwt_installask_v1'); });
  await page.evaluate(n => {
    curLevel = 'beginner'; curSection = n; _boardTile = { level: 'beginner', sec: n, gidx: 1 };
    startTest();
    const N = state.questions.length;
    for (let i = 0; i < N; i++) {
      const q = state.questions[state.idx]; if (!q) break;
      if (q.type === 'sg' || q.type === 'sg4') { shootAdvance(); continue; }
      answered = false; clearInterval(timer); startTimer();
      submit(i % 4 === 3 ? 'incorrect' : 'correct', q.type === 'w' ? (i % 4 === 3 ? '' : q.word.ko) : (i % 4 === 3 ? 'ちがう' : q.correct));
      document.querySelectorAll('.overlay').forEach(o => o.remove()); clearTimeout(ovTimer); afterAnswer();
    }
  }, normalRoom);
  await page.waitForTimeout(3600);
  const res = await page.evaluate(() => {
    const row = document.querySelector('.res-scorerow');
    const score = row.querySelector('.res-score'), cnts = [...row.querySelectorAll('.res-cnt')];
    const gauges = [...document.querySelectorAll('.res-meters .res-mg')];
    const cheer = document.querySelector('.res-cheer');
    const pwrGain = [...document.querySelectorAll('.res-mgain')].pop();
    const x = e => e.getBoundingClientRect();
    return {
      firstBanner: !!document.querySelector('.res-first'),
      cheer: cheer.textContent.trim(),
      nCnt: cnts.length,
      order: cnts.length === 2 && x(score).left < x(cnts[0]).left && x(cnts[0]).left < x(cnts[1]).left,
      ok: cnts[0] && cnts[0].textContent.trim(), ng: cnts[1] && cnts[1].textContent.trim(),
      gw: gauges.map(g => Math.round(x(g).width)),
      xp: getComputedStyle(document.getElementById('res-xpfill')).backgroundColor,
      pwrCol: getComputedStyle(document.getElementById('res-pwrfill')).backgroundColor,
      pwr: pwrGain && pwrGain.textContent.trim(),
      installBtn: !!document.querySelector('#s-result .btn.line.full')
    };
  });
  check('白い座布団の初回バナーは出さない', !res.firstBanner);
  check(`初テストの案内はランク下の一言に集約 (${res.cheer})`,
        /初テスト/.test(res.cheer) && /カード/.test(res.cheer) && /毎日1回/.test(res.cheer));
  check(`上段は 点数 / 正解数 / 不正解数 の3つ (${res.ok} ${res.ng})`, res.nCnt === 2 && res.order);
  check(`正解数・不正解数がそれぞれ出る (${res.ok} ${res.ng})`, /^○/.test(res.ok) && /^×/.test(res.ng));
  check(`レベルとPWRのゲージが同じ横幅 (${res.gw.join(' / ')})`, res.gw.length === 2 && res.gw[0] === res.gw[1]);
  check(`レベル(XP)のゲージは黄色 (${res.xp})`, res.xp === 'rgb(255, 255, 55)');
  check(`PWRのゲージは緑 (${res.pwrCol})`, res.pwrCol === 'rgb(0, 255, 55)');
  check(`PWRの増分は「+n%」 (${res.pwr})`, /%$/.test(res.pwr));
  check('「ホーム画面に追加」を結果の一番下に置かない', !res.installBtn);

  // ---------- ホームへ戻るときに一度だけ「追加してから戻りますか？」 ----------
  const ask = await page.evaluate(() => {
    _bipEvt = { prompt() { window.__promptCalled = true; } }; // インストール可能な端末を模す
    resultGoHome();
    const m = document.querySelector('.appconfirm');
    const t = m && m.querySelector('.ac-t').textContent.replace(/\s+/g, '');
    const btns = m ? [...m.querySelectorAll('.ac-btns .btn')].map(b => b.textContent.trim()) : [];
    const stillResult = document.getElementById('s-result').classList.contains('on');
    m && m.querySelector('#ac-no').click();
    return { shown: !!m, t, btns, stillResult,
             home: document.getElementById('s-home').classList.contains('on'),
             gone: !document.querySelector('.appconfirm'),
             flagged: !!localStorage.getItem('kwt_installask_v1') };
  });
  check('ホームへ戻るときにたずねる', ask.shown);
  check(`文言は「ホーム画面に追加してから戻りますか？」 (${ask.t})`, /ホーム画面に追加してから戻りますか/.test(ask.t || ''));
  check(`選べるのは追加する / このまま戻る (${ask.btns.join(' / ')})`, ask.btns.length === 2 && /追加/.test(ask.btns[0]) && /戻る/.test(ask.btns[1]));
  check('たずねている間はまだ結果画面', ask.stillResult);
  check('「このまま戻る」でホームへ', ask.home && ask.gone);
  const ask2 = await page.evaluate(() => {
    show('s-result'); resultGoHome();
    return { asked: !!document.querySelector('.appconfirm'), home: document.getElementById('s-home').classList.contains('on') };
  });
  check('2回目以降はたずねない（最初だけ）', !ask2.asked && ask2.home && ask.flagged);

  check(`コンソールエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} ${failed.length ? 'passed（FAILあり）' : 'PASS'}`);
  process.exit(failed.length ? 1 : 0);
})();
