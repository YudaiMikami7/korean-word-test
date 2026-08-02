/* k-tango 2026-08-01 のメール指示ぶんのスモークテスト（「最近学んだ単語」の帯のカードを縦幅マックスに／見出しを重ねる）
 * ※ その帯そのものが 2026-08-02 21:09 のメール指示で廃止になったため、
 *    当時の見た目の確認はすべて用済み。ここでは「帯が復活していないこと」だけを見張る。
 * 使い方: node smoke.mail0801b.test.js
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').split(path.sep).join('/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
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
  });
  await page.reload();
  await page.waitForTimeout(1500);

  // 学習履歴ゼロ（当時は「おすすめの単語」が出ていた状態）
  check('学習履歴ゼロでも帯は出ない（廃止済み）',
    await page.evaluate(() => !document.getElementById('today-band') && document.querySelectorAll('.tb-card').length === 0));

  // 最近学んだ単語を12語つくっても復活しない
  await page.evaluate(() => {
    const ids = LEVEL_SECTIONS.beginner[curSection].slice(0, 12), s = {}, c = {};
    ids.forEach((id, i) => {
      s[id] = { hasSeen: true, hasEverCorrect: true, memoryScore: 60, stabilityHours: 20, wordDifficulty: 1,
                reviewCount: 2, lastAnsweredAt: new Date(Date.now() - i * 60000).toISOString(), firstCorrectAt: new Date().toISOString() };
      c[id] = 3;
    });
    localStorage.setItem('kwt_stats_v1', JSON.stringify(s));
    localStorage.setItem('kwt_cards_v1', JSON.stringify(c));
    renderHome();
  });
  await page.waitForTimeout(900);
  check('12語学んでも帯は出ない',
    await page.evaluate(() => !document.getElementById('today-band') && document.querySelectorAll('.tb-card,.tb-label,.tb-clip').length === 0));
  check('帯を作っていた関数も残っていない',
    await page.evaluate(() => typeof buildTodayBand === 'undefined' && typeof recommendWords === 'undefined'));
  check('帯の跡地には今日の5問／プレゼントが下りている', await page.evaluate(() => {
    const h = document.getElementById('homewrap').getBoundingClientRect(), k = h.width / 602;
    const b = document.querySelector('.sg-d5').getBoundingClientRect();
    return (b.bottom - h.top) / k > 1100;
  }));

  check(`コンソールエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log('FAILED: ' + failed.map(r => r.name).join(' / ')); process.exit(1); }
})();
