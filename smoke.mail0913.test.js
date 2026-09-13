/* k-tango スモークテスト（メール指示 2026-09-13 16:52 ぶん）
 * 使い方: node smoke.mail0913.test.js
 *  1) 今日の5問では、上の帯の札とキャラの演出を正解・不正解で変えない（正解バレ防止）
 *  2) 結果画面の「もう一度」でやったぶんもマスが1つ進む（2回やって1マスしか進まない、を防ぐ）
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

  // ---- 1) 今日の5問の帯 ----
  const run = async (daily5) => page.evaluate((daily5) => {
    state = { questions: new Array(5).fill({}), idx: 0, results: [], daily5 };
    show('s-quiz'); runnerReset();
    const slot = i => document.querySelector('#rn-rail .rn-slot[data-i="' + i + '"]');
    const ch = document.getElementById('rn-char');
    runnerStep(true, 'SSR'); const c1 = ch.className, s1 = slot(0).className;
    runnerStep(false, 'R'); const c2 = ch.className, s2 = slot(1).className;
    return { c1, c2, s1, s2 };
  }, daily5);
  const d5 = await run(true);
  check(`今日の5問: 正解も不正解も同じ歩き (${d5.c1} / ${d5.c2})`, /step/.test(d5.c1) && /step/.test(d5.c2) && !/trip/.test(d5.c2));
  check(`今日の5問: 札はレア度の色を付けない (${d5.s1} / ${d5.s2})`, !/rn-(R|SR|SSR)/.test(d5.s1 + d5.s2) && /got/.test(d5.s1) && /got/.test(d5.s2));
  const nm = await run(false);
  check('通常テストは従来どおり（不正解はつまずく・レア色あり）', /trip/.test(nm.c2) && /rn-SSR/.test(nm.s1));

  // ---- 2) もう一度でもマスが進む ----
  const adv = await page.evaluate(() => {
    const lv = curLevel, sec = curSection;
    const b = loadBoard(); b[boardKey(lv, sec)] = { cleared: 0, tiles: {} }; _lsSetJSON(LS_BOARD, b);
    boardClear({ level: lv, sec, gidx: 1 }, 'A', 80); _lastBoardTile = { level: lv, sec, gidx: 1 };
    const orig = startTest; let tile = null; startTest = () => { tile = { ..._boardTile }; }; sgRetry(); startTest = orig;
    boardClear(tile, 'A', 80);
    return { gidx: tile.gidx, cleared: boardState(lv, sec).cleared };
  });
  check(`もう一度は次のマスとして始まる (gidx=${adv.gidx})`, adv.gidx === 2);
  check(`2回やったら2マス進む (cleared=${adv.cleared})`, adv.cleared === 2);

  check('コンソールエラー無し', errors.length === 0);
  await browser.close();
  const ok = results.filter(r => r.ok).length;
  console.log(`\n${ok}/${results.length} passed`);
  process.exit(ok === results.length ? 0 : 1);
})();
