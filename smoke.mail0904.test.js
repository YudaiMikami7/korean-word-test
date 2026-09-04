/* k-tango 2026-09-04 09:35 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0904.test.js
 * 検証:
 *  ① 動物どうしが重ならない（開いた直後・歩いている途中・追いかけたとき）
 *  ② 動物のステータス（メーター）は動物たちよりも前面に出る
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond, note) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${note ? ' (' + note + ')' : ''}`); }
const URL = require('url').pathToFileURL(path.resolve(__dirname, 'index.html')).href;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 602, height: 1178 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kwt_coach_v1', '1');
    localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now()));
  });
  await page.reload();
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.lvup,.pbub,.stepnote,.rest-ask,#resume-ask,.coach,.d5auto,.lapdone,.appconfirm').forEach(o => o.remove()));

  /* ============ ① 重ならない ============ */
  const yard = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const o = petState();
    ['mong', 'yaong', 'kkomi', 'ppyong', 'gomdol', 'dungsil', 'yeoubi'].forEach(k => { o.zoo[k] = { xp: 40, friend: 12 }; });
    o.sp = 'mong'; o.xp = 40; o.friend = 12; savePet(o);
    openPet();
    await wait(500);
    const ans = [...document.querySelectorAll('#pet-modal .pt-an')];
    // 実際に見えている絵の重なりぐあいを測る（円どうしの離れぐあい／1.0未満＝体が重なっている）
    const worstNow = () => {
      const rs = ans.map(a => a.querySelector('i').getBoundingClientRect());
      let w = 99;
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j];
        const dx = (a.left + a.width / 2) - (b.left + b.width / 2);
        const dy = (a.top + a.height / 2) - (b.top + b.height / 2);
        const need = (a.width + b.width) / 2 * 0.95;
        w = Math.min(w, Math.sqrt(dx * dx + dy * dy) / need);
      }
      return w;
    };
    const out = { n: ans.length };
    out.openWorst = worstNow();            // 開いた直後
    const samples = [];
    for (let i = 0; i < 90; i++) { samples.push(worstNow()); await wait(200); }  // 18秒ぶん見張る
    out.worst = Math.min(...samples);
    out.overFrames = samples.filter(v => v < 1).length;
    out.frames = samples.length;
    out.avoidsInCode = /clearPath\(/.test(String(petYardStart)) && /pushApart/.test(String(petYardStart));
    out.moved = new Set(ans.map(a => a.style.left)).size > 1; // 止まっているせいで重ならないのではない
    return out;
  });
  check(`広場の動物が7匹いる`, yard.n === 7);
  check(`開いた直後から重なっていない (${yard.openWorst.toFixed(2)})`, yard.openWorst >= 1);
  check(`18秒のあいだ一度も重ならない (最小 ${yard.worst.toFixed(2)} / 重なったコマ ${yard.overFrames}/${yard.frames})`, yard.overFrames === 0);
  check('重なりを避ける仕組みがコードにある（道すじの判定・離れる処理）', yard.avoidsInCode);
  check('動物はちゃんと動いている（固まっているわけではない）', yard.moved);

  /* ============ ② メーターは動物より前面 ============ */
  const mt = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const ans = [...document.querySelectorAll('#pet-modal .pt-an')];
    ans[0].querySelector('i').click();
    await wait(250);
    const m = document.querySelector('#pet-modal .pt-mt');
    if (!m) return { shown: false };
    const z = v => parseInt(getComputedStyle(v).zIndex) || 0;
    const r = m.getBoundingClientRect();
    // メーターの上・中・下の点で、いちばん手前にあるのはメーターか（動物に隠されていないか）
    const pts = [[r.left + r.width / 2, r.top + 6], [r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width / 2, r.bottom - 6],
                 [r.left + 8, r.top + r.height / 2], [r.right - 8, r.top + r.height / 2]];
    const front = pts.every(p => { const e = document.elementFromPoint(p[0], p[1]); return !!(e && e.closest('.pt-mt')); });
    return { shown: true, front, zMt: z(m), zAnMax: Math.max(...ans.map(z)),
      zSay: Math.max(...ans.map(a => a.querySelector('.pt-say') ? z(a.querySelector('.pt-say')) : 0)) };
  });
  check('動物をタッチするとメーターが出る', mt.shown);
  check(`メーターの重なり順が動物より前 (メーター ${mt.zMt} > 動物 ${mt.zAnMax})`, mt.shown && mt.zMt > mt.zAnMax);
  check('メーターの上に動物がかぶっていない（実際の当たり判定で確認）', mt.shown && mt.front);

  check('コンソールエラーが出ていない', errors.length === 0, errors.join(' / '));

  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length}/${results.length} PASS`);
  process.exit(ng.length ? 1 : 0);
})();
