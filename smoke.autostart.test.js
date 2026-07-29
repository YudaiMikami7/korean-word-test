/* k-tango 2026-07-29（夜）メール指示ぶんのスモークテスト
 * 使い方: node smoke.autostart.test.js
 * ・「今日の5問」自動スタートの制限時間が10秒（2.6秒は短すぎる）
 * ・自動スタートの見た目が「今日の5問」の吹き出し（朝の部・夜の部の2マス）と同じで、ボタンの上から出る
 * ・「戻る」で中断できる／中断してももう一度タッチすれば始められる
 * ・ホームのルームメニューのアニメーションが完全に無い
 */
const { chromium } = require('playwright');
const path = require('path');

const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }
const FILE = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 602, height: 1178 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(FILE);
  await page.waitForTimeout(900);

  // ---------- 自動スタート：10秒待つ ----------
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); });
  await page.reload();
  await page.waitForTimeout(2000);
  check('その日はじめての起動で自動スタートの吹き出しが出る', await page.evaluate(() => !!document.querySelector('.d5auto')));
  check('制限時間は10秒', await page.evaluate(() => D5_AUTO_SEC === 10));
  check('「あと10秒」と書いてある', await page.evaluate(() => {
    const t = document.querySelector('.d5a-cd').textContent.replace(/\s/g, '');
    return /あと\d+秒で.+がはじまります/.test(t);
  }));
  check('残り秒数が1秒ずつ減る', await page.evaluate(async () => {
    const sec = () => parseInt(document.getElementById('d5a-sec').textContent, 10);
    const a = sec();
    await new Promise(r => setTimeout(r, 1100));
    return sec() === a - 1;
  }));
  // 旧2.6秒では始まっていたタイミングでも、まだ始まっていないこと
  await page.waitForTimeout(1600);
  check('3秒たってもまだ始まらない（旧2.6秒より長い）', await page.evaluate(() => !!document.querySelector('.d5auto') && !document.getElementById('s-quiz').classList.contains('on')));

  // ---------- 見た目は「今日の5問」の吹き出しと同じ ----------
  check('吹き出しは今日の5問と同じ .d5-card', await page.evaluate(() => !!document.querySelector('.d5auto .d5-card')));
  check('見出しは「今日の5問テスト」', await page.evaluate(() => document.querySelector('.d5auto .d5-h').textContent === '今日の5問テスト'));
  check('朝の部・夜の部の2マスがある', await page.evaluate(() => {
    const s = [...document.querySelectorAll('.d5auto .d5-slot .d5-sl')].map(e => e.textContent);
    return s.length === 2 && s[0].indexOf('朝の部') === 0 && s[1].indexOf('夜の部') === 0;
  }));
  check('いまの枠のマスに印が付く', await page.evaluate(() => document.querySelectorAll('.d5auto .d5-slot.now').length === 1));
  check('しっぽ付きで「今日の5問」ボタンの上に出る', await page.evaluate(() => {
    const c = document.querySelector('.d5auto .d5-card'), b = d5AnchorBtn();
    if (!c || !b) return false;
    const rc = c.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const tail = getComputedStyle(c, '::after').content !== 'none';
    const overBtn = rc.bottom <= rb.top + 1 && Math.abs((rc.left + rc.width / 2) - (rb.left + rb.width / 2)) < 120;
    return tail && overBtn;
  }));
  check('「戻る（中断する）」ボタンがある', await page.evaluate(() => /戻る/.test(document.querySelector('.d5auto .d5-ghost').textContent)));
  check('「いますぐはじめる」ボタンがある', await page.evaluate(() => /いますぐ/.test(document.querySelector('.d5auto .d5-go').textContent)));

  // ---------- 戻る＝中断／もう一度タッチすれば始められる ----------
  await page.evaluate(() => document.querySelector('.d5auto .d5-ghost').click());
  await page.waitForTimeout(400);
  check('戻ると吹き出しが閉じてテストは始まらない', await page.evaluate(() => !document.querySelector('.d5auto') && !document.getElementById('s-quiz').classList.contains('on')));
  check('戻っても枠は消費されない', await page.evaluate(() => !d5Used() && !d5Done()));
  check('放置しても勝手に始まらない（タイマーが止まる）', await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 9000));
    return !document.getElementById('s-quiz').classList.contains('on');
  }));
  check('もう一度タッチすれば「はじめる」が出る', await page.evaluate(() => {
    openDaily5();
    const ok = /はじめる/.test(document.querySelector('#d5-modal .d5-go').textContent);
    closeDaily5(); return ok;
  }));
  check('もう一度タッチすれば始められる', await page.evaluate(() => { startDaily5(); return document.getElementById('s-quiz').classList.contains('on') && _d5.on && _d5.mode === 'd5'; }));

  // ---------- テストを中断した枠も、もう一度はじめられる ----------
  await page.evaluate(() => { quitTest(); });
  await page.waitForTimeout(500);
  check('中断すると記録は「中断」で残る', await page.evaluate(() => d5Used() && !d5Done()));
  check('中断した枠でもボタンは押せるまま', await page.evaluate(() => { updateD5Btn(); return !document.querySelector('.sg-d5').classList.contains('d5-off'); }));
  check('吹き出しに「中断」と出て、はじめるボタンが残る', await page.evaluate(() => {
    openDaily5();
    const m = document.getElementById('d5-modal');
    const ok = /中断/.test(m.textContent) && !!m.querySelector('.d5-go');
    closeDaily5(); return ok;
  }));
  check('中断した枠をもう一度はじめられる', await page.evaluate(() => { startDaily5(); return document.getElementById('s-quiz').classList.contains('on') && _d5.on; }));

  // ---------- やり切った枠はこれまでどおり締切 ----------
  check('やり切った枠は「はじめる」が出ない', await page.evaluate(() => {
    quitTest();
    const all = loadD5(); all[d5Key(Date.now())].done = true; saveD5(all);
    updateD5Btn(); openDaily5();
    const m = document.getElementById('d5-modal');
    const ok = !m.querySelector('.d5-go') && !!document.getElementById('d5-cd') && document.querySelector('.sg-d5').classList.contains('d5-off');
    closeDaily5(); return ok;
  }));
  check('やり切った枠では自動スタートも出ない', await page.evaluate(() => { localStorage.removeItem('kwt_d5auto_v1'); maybeAutoDaily5(); return !document.querySelector('.d5auto'); }));

  // ---------- ルームメニューのアニメーションを完全に廃止 ----------
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); });
  await page.reload();
  await page.waitForTimeout(1400);
  check('3面ローテーションは止まっている', await page.evaluate(() => ROOM_RECO_ROTATE === false && _recoTimer === null));
  check('7秒待っても面が入れ替わらない', await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 7000));
    return document.querySelectorAll('.slide-inner.face-word,.slide-inner.face-pwr').length === 0;
  }));
  check('ランクのメダルにポップのアニメが無い', await page.evaluate(() => {
    const el = document.querySelector('.room-slide:not(.pq-slide) .rank-b');
    return !!el && getComputedStyle(el).animationName === 'none';
  }));
  check('ランク/語数/メータに回転のtransitionが無い', await page.evaluate(() => {
    return ['.rank-b', '.rank-s', '.hv-learned', '.hv-roompwr'].every(s => {
      const el = document.querySelector('.room-slide:not(.pq-slide) ' + s);
      if (!el) return true;
      const t = getComputedStyle(el).transitionProperty;
      return t === 'none' || parseFloat(getComputedStyle(el).transitionDuration) === 0;
    });
  }));
  check('おすすめ/PWR面にも回転のtransitionが無い', await page.evaluate(() => {
    return ['.rmenu-reco', '.rmenu-pwr'].every(s => {
      const el = document.querySelector('.room-slide:not(.pq-slide) ' + s);
      if (!el) return true;
      return parseFloat(getComputedStyle(el).transitionDuration) === 0;
    });
  }));
  // ルームメニュー本体＝.rmenu-clip の中（プリQQスライドの背景の飾りは対象外）
  check('ルームメニューの中に動いている要素が無い', await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.room-slide:not(.pq-slide) .rmenu-clip')];
    if (!boxes.length) return false;
    return boxes.every(box => [box, ...box.querySelectorAll('*')].every(el => {
      const s = getComputedStyle(el);
      const anim = s.animationName === 'none' || parseFloat(s.animationDuration) === 0;
      const tr = s.transitionProperty === 'none' || parseFloat(s.transitionDuration) === 0;
      return anim && tr;
    }));
  }));

  check('コンソールエラー無し', errors.length === 0);
  if (errors.length) console.log('  errors:', errors);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
