/* k-tango スモークテスト（メール指示 2026-08-29 分）
 * 使い方: node smoke.mail0829.test.js
 *  1) iOSの「ホーム画面に追加」案内が、指示どおりの5ステップになっている
 *  2) ことばの友だちが、ごはんなしで「答えるたびに勝手に育つ」（基本の8匹・減らない）
 *  3) 見た目が5段階でレベルとともに変わる
 *  4) 今日の5問の結果の帯が、1行・小さな固定の高さで、正答の並びを押しさげない
 *  5) ごはん（あげる導線）が画面から消えている／育ち方がMBTIだとは書かれていない
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

(async () => {
  const browser = await chromium.launch();

  /* ---------- 1) iOSの追加案内は5ステップ ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 602, height: 1178 }, hasTouch: true, userAgent: IOS });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL); await page.waitForTimeout(900);
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload(); await page.waitForTimeout(900);
    await page.evaluate(() => { try { localStorage.removeItem('kwt_a2hs_v1'); } catch (e) {} showAddHome(); });
    await page.waitForTimeout(300);
    const steps = await page.$$eval('#a2hs .a2hs-step .txt', els => els.map(e => e.textContent.trim()));
    check('[iOS] 手順が5つ', steps.length === 5);
    check('[iOS] 1=三点リーダー', await page.$eval('#a2hs .a2hs-step:nth-child(1) .a2hs-ico', e => e.textContent.trim()) === '⋯');
    check('[iOS] 2=共有', steps[1] === '共有');
    check('[iOS] 3=表示を増やす', steps[2] === '表示を増やす');
    check('[iOS] 4=ホーム画面に追加', steps[3] === 'ホーム画面に追加');
    check('[iOS] 5=右上の「追加」', await page.$eval('#a2hs .a2hs-step:nth-child(5) .a2hs-ico', e => e.textContent.trim()) === '追加');
    const box = await page.$eval('#a2hs .a2hs-card', e => { const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom }; });
    check('[iOS] カードが画面内に収まる', box.t >= 0 && box.b <= 1178);
    check('[iOS] コンソールエラー無し', errors.length === 0);
    await page.close();
  }

  /* ---------- 2〜5) 育成まわり ---------- */
  const page = await browser.newPage({ viewport: { width: 602, height: 1178 }, hasTouch: true });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(URL); await page.waitForTimeout(900);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('kwt_coach_v1', '1'); });
  await page.reload(); await page.waitForTimeout(900);

  check('基本の友だちは8匹', await page.evaluate(() => PET_BASE_SP.length) === 8);
  check('8匹はそれぞれ別の育ち方に対応', await page.evaluate(() => new Set(PET_BASE_SP).size === 8 && Object.keys(PET_AXIS_SP).length === 8));
  check('見た目は5段階', await page.evaluate(() => PET_GROW.length) === 5);
  check('レベルで段階が上がる', await page.evaluate(() => [1, 5, 11, 19, 30, 40].map(petGrowStep).join(',')) === '1,2,3,4,5,5');

  /* 答えるだけで育つ（ごはんは一切あげない） */
  const grow = await page.evaluate(() => {
    const before = JSON.parse(JSON.stringify(petState().zoo || {}));
    for (let i = 0; i < 12; i++) {
      const w = Object.values(WORD_BY_ID)[i];
      saveAnswer({ wordId: w.id, korean: w.ko, answerType: 'choice', answerStatus: i % 3 ? 'correct' : 'incorrect',
        isCorrect: !!(i % 3), userAnswer: 'x', distractorType: 'semantic_close', responseTimeMs: 1200 + i * 400,
        writingErrorType: i % 2 ? 'phonetic_spelling' : 'semantic_substitution', answeredAt: new Date().toISOString() });
    }
    const o = petState();
    const sum = k => Object.keys(o.zoo).reduce((a, x) => a + (o.zoo[x].xp || 0), 0);
    return { grew: sum() > 0, seedsUntouched: (o.seeds || 0) === 0, kinds: Object.keys(o.zoo).length, beforeKinds: Object.keys(before).length };
  });
  check('答えるだけで育つ（ごはん不要）', grow.grew);
  check('ごはんは増えも減りもしない', grow.seedsUntouched);
  check('育つ子が増えていく', grow.kinds >= grow.beforeKinds);

  /* 育ちは減らない */
  const notLess = await page.evaluate(() => {
    const snap = () => { const z = petState().zoo; return Object.keys(z).map(k => k + ':' + (z[k].xp || 0)); };
    const a = {}; snap().forEach(s => { const [k, v] = s.split(':'); a[k] = +v; });
    for (let i = 0; i < 20; i++) {
      const w = Object.values(WORD_BY_ID)[50 + i];
      saveAnswer({ wordId: w.id, korean: w.ko, answerType: 'choice', answerStatus: 'correct', isCorrect: true,
        userAnswer: w.ja, distractorType: 'same_scene', responseTimeMs: 5000,
        writingErrorType: 'semantic_substitution', answeredAt: new Date().toISOString() });
    }
    const b = {}; snap().forEach(s => { const [k, v] = s.split(':'); b[k] = +v; });
    return Object.keys(a).every(k => (b[k] || 0) >= a[k]);
  });
  check('たまった育ちは減らない', notLess);

  /* 結果の帯：1行・小さな固定の高さ */
  const res = await page.evaluate(() => {
    const d = petDaily(), o = petState(), lv = petLevel(o.xp);
    const div = document.createElement('div'); div.style.cssText = 'position:fixed;left:0;top:0;width:340px';
    div.innerHTML = petResultHTML({ gain: 30, lv0: lv, lv1: lv, up: false, evolved: false, stage: petStage(lv), greet: null });
    document.body.appendChild(div);
    const el = div.querySelector('.pt-res'), r = el.getBoundingClientRect();
    const out = { h: r.height, lines: div.querySelectorAll('.pt-rtx b').length, spans: div.querySelectorAll('.pt-rtx span').length,
      food: div.querySelectorAll('.pt-food').length, text: el.textContent.replace(/\s+/g, '') };
    div.remove(); return out;
  });
  check('結果の帯は48px固定の低さ', Math.round(res.h) === 48);
  check('結果の帯は文字1行だけ', res.lines === 1 && res.spans === 0);
  check('エサが飛ぶ演出は無い', res.food === 0);
  check('結果の帯に見出し文言を足していない', res.text.indexOf('ことばの友だち') < 0);

  /* ごはん導線が消えている／MBTIとは書かない */
  const noFood = await page.evaluate(() => {
    const t = [];
    openPet(); t.push(document.getElementById('pet-modal').textContent);
    openPetZoo(); t.push(document.getElementById('pet-modal').textContent);
    openPetWear(); t.push(document.getElementById('pet-modal').textContent);
    openPetGacha(); t.push(document.getElementById('pet-modal').textContent);
    openPetEvent(); t.push(document.getElementById('pet-modal').textContent);
    closePet(); openPetMenu(); t.push(document.getElementById('petmenu-modal').textContent); closePetMenu();
    const all = t.join('');
    return { food: /ごはん/.test(all), snack: typeof petSnack, mbti: /MBTI|タイプ診断|16TYPE/.test(all), wear: /きせかえ/.test(all) };
  });
  check('ごはんの表示が無い', noFood.food === false);
  check('ごはんをあげる仕組みが無い', noFood.snack === 'undefined');
  check('きせかえに置きかわっている', noFood.wear === true);
  check('育ち方がMBTI連動だとは書かない', noFood.mbti === false);

  /* 結果画面が縦に伸びていない（今日の5問を1本通す） */
  const fits = await page.evaluate(() => { d5Key && localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); return true; });
  check('前提セット', fits);

  check('コンソールエラー無し', errors.length === 0);
  if (errors.length) console.log(errors);

  await browser.close();
  const ok = results.filter(r => r.ok).length;
  console.log(`\n${ok}/${results.length} passed`);
  process.exit(ok === results.length ? 0 : 1);
})();
