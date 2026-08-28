/* k-tango スモークテスト（メール指示 2026-08-29 ぶん）
 * 使い方: node smoke.mail0829b.test.js
 *  1) ことばの友だちは最初から8匹いない。プレゼントの「たまご」が学習でそだって生まれる
 *  2) 9匹目・10匹目もたまにたまごから出る
 *  3) たまご到着・誕生のポップアップ
 *  4) 今日の5問を中断して開き直すと、通常のポップアップでもう一度カウントダウンから
 *  5) 結果→ホームの演出のあと、10秒で「いま開いているWORLDの次のマス」が自動で始まる（中止・リセットつき）
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
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => { localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_a2hs_v1', '1'); localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); });
  await page.reload();
  await page.waitForTimeout(1000);

  // ---- 1) 最初は1匹だけ。学習しても勝手に増えない ----
  check('最初にいるのは1匹だけ（8匹ではない）', await page.evaluate(() => petHave().length === 1));
  await page.evaluate(() => { for (let i = 0; i < 30; i++) petAxisGain(); });
  check('学習しても、たまごなしでは友だちが増えない', await page.evaluate(() => petHave().length === 1));

  // ---- 2) たまごが届く → 受け取る ----
  await page.evaluate(() => { grantEggPresent(1); });
  check('プレゼントに「たまご」が入る', await page.evaluate(() => _presentState().queue.some(x => x.kind === 'egg')));
  await page.evaluate(() => openPresent('daily'));
  await page.waitForTimeout(200);
  check('プレゼント画面にたまごの札が出る', await page.evaluate(() => [...document.querySelectorAll('#present-modal .pm-item')].some(b => b.dataset.kind === 'egg' && b.textContent.includes('たまご'))));
  await page.evaluate(() => { [...document.querySelectorAll('#present-modal .pm-item')].find(b => b.dataset.kind === 'egg').click(); });
  await page.waitForTimeout(800);
  check('受け取ると「たまごが届いた」ポップアップ', await page.evaluate(() => { const m = document.getElementById('petevo-modal'); return !!m && m.classList.contains('on') && m.textContent.includes('とどきました'); }));
  check('たまごが1つそだち始めている', await page.evaluate(() => petEggCount() === 1));
  await page.evaluate(() => { closePetEgg(); closePresent(); });

  // ---- 3) 学習でそだって生まれる ----
  await page.evaluate(() => { const o = petState(); petEggGrow(o, PET_EGG_XP); savePet(o); });
  check('たまごがそだちきると誕生が予約される', await page.evaluate(() => !!petHatchPending()));
  check('生まれるまでは たまごのまま', await page.evaluate(() => petEggCount() === 0 && !!petHatchPending()));
  await page.evaluate(() => petHomePopups());
  await page.waitForTimeout(300);
  check('ホームで「たんじょう」ポップアップ', await page.evaluate(() => { const m = document.getElementById('petevo-modal'); return !!m && m.classList.contains('on') && m.textContent.includes('生まれました'); }));
  check('生まれたら図鑑の頭数が増える', await page.evaluate(() => petHave().length === 2));
  await page.evaluate(() => { const m = document.getElementById('petevo-modal'); m.classList.remove('on'); m.innerHTML = ''; closePet(); });

  // ---- 4) 9匹目・10匹目もたまごから出る ----
  const extra = await page.evaluate(() => {
    for (let g = 0; g < 400; g++) { petGrantEgg(); const o = petState(); petEggGrow(o, PET_EGG_XP); if (o.hatchPend) delete o.hatchPend; savePet(o); }
    const o = petState();
    return { base: PET_BASE_SP.every(k => !!o.zoo[k]), extra: PET_EXTRA_SP.some(k => !!o.zoo[k]) };
  });
  check('基本の8匹はたまごから全部そろう', extra.base);
  check('9匹目・10匹目もたまごから出る', extra.extra);

  // ---- 5) 今日の5問：中断 → 開き直すと通常ポップアップでカウントダウン ----
  const page2 = await browser.newPage({ viewport: { width: 602, height: 1178 }, hasTouch: true });
  page2.on('pageerror', e => errors.push(e.message));
  await page2.goto(URL);
  await page2.waitForTimeout(900);
  await page2.evaluate(() => { localStorage.setItem('kwt_coach_v1', '1'); localStorage.setItem('kwt_a2hs_v1', '1'); });
  await page2.reload();
  await page2.waitForTimeout(2200);
  check('初回は自動スタートの吹き出しが出る', await page2.evaluate(() => !!document.querySelector('.d5auto')));
  await page2.evaluate(() => closeAutoD5(false));
  await page2.waitForTimeout(200);
  check('中断すると「中断しました」と出る', await page2.evaluate(() => { const e = document.querySelector('.stepnote'); return !!e && e.textContent.includes('中断'); }));
  await page2.reload();
  await page2.waitForTimeout(2400);
  check('開き直すと通常ポップアップが出る', await page2.evaluate(() => document.getElementById('d5-modal').classList.contains('on')));
  check('そのポップアップは10秒カウントダウンつき', await page2.evaluate(() => { const e = document.getElementById('d5a-sec'); return !!e && +e.textContent > 0 && +e.textContent <= D5_AUTO_SEC; }));
  await page2.evaluate(() => closeDaily5());

  // ---- 6) つぎの問題まで10秒 ----
  await page2.evaluate(() => { show('s-home'); nqArm(); });
  await page2.waitForTimeout(900);
  check('ホームでカウントダウンの帯が出る', await page2.evaluate(() => { const e = document.getElementById('nqcd'); return !!e && e.textContent.includes('つぎの問題'); }));
  check('帯が画面内に収まる', await page2.evaluate(() => { const r = document.getElementById('nqcd').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
  await page2.evaluate(() => openSettings());
  await page2.waitForTimeout(700);
  check('設定を開くとカウントダウンは消える', await page2.evaluate(() => !document.getElementById('nqcd')));
  await page2.evaluate(() => { document.getElementById('settings-modal').classList.remove('on'); });
  await page2.waitForTimeout(900);
  check('ホームに戻ると10秒から数えなおす', await page2.evaluate(() => { const e = document.getElementById('nq-sec'); return !!e && +e.textContent >= NQ_SEC - 1; }));
  await page2.evaluate(() => nqCancel());
  await page2.waitForTimeout(200);
  check('中止ボタンで止まる', await page2.evaluate(() => !document.getElementById('nqcd') && _nqArmed === false));
  // 0秒でその WORLD の次のマスが始まる
  const started = await page2.evaluate(async () => {
    curSection = 2; const want = boardState(curLevel, curSection).cleared + 1;
    nqArm();
    await new Promise(r => setTimeout(r, 600));
    _nqLeft = 1; await new Promise(r => setTimeout(r, 1400)); // 残り1秒 → 0で開始
    await new Promise(r => setTimeout(r, 2600));              // 3・2・1
    return { on: document.getElementById('s-quiz').classList.contains('on'), sec: _boardTile && _boardTile.sec, gidx: _boardTile && _boardTile.gidx, want, wantSec: 2 };
  });
  check('0秒で出題が始まる', started.on);
  check('開いているWORLDの一番進んだマスから始まる', started.sec === started.wantSec && started.gidx === started.want);

  check('コンソールエラー無し', errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length}/${results.length} passed`);
  process.exit(ng.length ? 1 : 0);
})();
