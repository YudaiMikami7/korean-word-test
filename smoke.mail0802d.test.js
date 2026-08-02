/* k-tango 2026-08-02 14:48 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0802d.test.js
 * 指示: 「出題画面で、韓国語から日本語の問題で、韓国語が表示されると同時に音声出して」
 * 検証:
 *  ① 韓国語→日本語（kj）の問題は、韓国語が画面に出るのと同時に読み上げが始まる
 *  ② 読み上げる中身は、その問題で表示している韓国語そのもの
 *  ③ 日本語→韓国語（jk）・書き取り（w）は今までどおり読み上げない（答えを先に言わない）
 *  ④ 設定でサウンドをオフにしているときは鳴らさない
 *  ⑤ 次の問題へ進むたびに読み上げる（1問目だけではない）
 *  ⑥ 今日の5問・今日のトレンドでも同じように読み上げる
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
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
    localStorage.setItem('kwt_roomhint_v1', '1');
  });
  await page.reload();
  await page.waitForTimeout(1500);
  const clearFx = () => page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.lvup,.fcust,.pbub,.stepnote,.tapavatar,.rest-ask,#resume-ask,.coach,.d5auto').forEach(o => o.remove()));
  await clearFx();

  // 読み上げの盗聴器（SpeechSynthesis と音声ファイル再生の両方を記録する）
  await page.evaluate(() => {
    window.__spk = [];
    const ss = window.speechSynthesis;
    const orig = ss.speak.bind(ss);
    ss.speak = u => { window.__spk.push(u && u.text); try { orig(u); } catch (e) { } };
    const OA = window.Audio;
    window.Audio = function (src) { window.__spk.push('file:' + src); const a = new OA(); a.play = () => Promise.resolve(); return a; };
  });

  // ================= ① ② 韓国語→日本語は表示と同時に読み上げる =================
  await page.evaluate(() => startTest(null, true));
  await page.waitForTimeout(900);

  const kj = await page.evaluate(() => {
    const i = state.questions.findIndex(q => q.type === 'kj');
    state.idx = i; window.__spk = [];
    renderQuestion();                       // 「同時に」の確認: 待たずにこの場で読み上げが始まっているか
    const spokenAtOnce = window.__spk.slice();
    const shown = document.querySelector('#qstage .qword');
    return { i, spokenAtOnce, shown: shown ? shown.textContent : null, ko: state.questions[i].word.ko,
             ja: state.questions[i].word.ja };
  });
  check(`韓国語→日本語の問題がある (${kj.i + 1}問目 ${kj.ko})`, kj.i >= 0);
  check(`韓国語が画面に出ている (${kj.shown})`, kj.shown === kj.ko);
  check(`表示と同時（待ち時間なし）に読み上げが始まる (${JSON.stringify(kj.spokenAtOnce)})`, kj.spokenAtOnce.length === 1);
  check(`読み上げているのは表示中の韓国語 (${kj.spokenAtOnce[0]})`, kj.spokenAtOnce[0] === kj.ko);
  check('日本語の訳は読み上げない（答えを先に言わない）', !kj.spokenAtOnce.some(t => t === kj.ja));

  // ================= ③ 日本語→韓国語・書き取りは読み上げない =================
  const other = await page.evaluate(() => {
    const out = {};
    ['jk', 'w'].forEach(t => {
      const i = state.questions.findIndex(q => q.type === t);
      if (i < 0) { out[t] = null; return; }
      state.idx = i; window.__spk = [];
      renderQuestion();
      out[t] = { i, spoken: window.__spk.slice(), shown: (document.querySelector('#qstage .qword') || {}).textContent };
    });
    return out;
  });
  check(`日本語→韓国語は読み上げない (${other.jk && other.jk.shown})`, other.jk && other.jk.spoken.length === 0);
  check(`書き取りは読み上げない (${other.w && other.w.shown})`, other.w && other.w.spoken.length === 0);

  // ================= ④ サウンドオフのときは鳴らさない =================
  const off = await page.evaluate(() => {
    const st = loadSettings(); st.sound = false; saveSettings(st);
    const i = state.questions.findIndex(q => q.type === 'kj');
    state.idx = i; window.__spk = [];
    renderQuestion();
    const silent = window.__spk.slice();
    const st2 = loadSettings(); st2.sound = true; saveSettings(st2);
    window.__spk = [];
    renderQuestion();
    return { silent, backOn: window.__spk.slice() };
  });
  check('サウンドをオフにすると鳴らない', off.silent.length === 0);
  check('オンに戻すとまた鳴る', off.backOn.length === 1);

  // ================= ⑤ 問題が進むたびに読み上げる =================
  const seq = await page.evaluate(() => {
    const out = [];
    const kjIdx = state.questions.map((q, i) => ({ q, i })).filter(x => x.q.type === 'kj').slice(0, 3);
    kjIdx.forEach(x => {
      state.idx = x.i; window.__spk = [];
      renderQuestion();
      out.push({ ko: x.q.word.ko, spoken: window.__spk.slice() });
    });
    return out;
  });
  check(`韓国語→日本語の問題は毎回読み上げる (${seq.map(s => s.ko).join('/')})`,
    seq.length >= 2 && seq.every(s => s.spoken.length === 1 && s.spoken[0] === s.ko));

  // ================= ⑥ 今日の5問・今日のトレンドでも読み上げる =================
  const d5 = await page.evaluate(async () => {
    const out = {};
    try {
      startDaily5();
      await new Promise(r => setTimeout(r, 1200));
      const i = state.questions.findIndex(q => q.type === 'kj');
      if (i >= 0) {
        state.idx = i; window.__spk = [];
        renderQuestion();
        out.d5 = { ko: state.questions[i].word.ko, spoken: window.__spk.slice(), on: _d5.on };
      }
    } catch (e) { out.err = String(e); }
    return out;
  });
  check(`今日の5問でも表示と同時に読み上げる (${d5.d5 && d5.d5.ko})`,
    d5.d5 && d5.d5.on && d5.d5.spoken.length === 1 && d5.d5.spoken[0] === d5.d5.ko);

  check(`JSエラーなし (${errors.length}件)`, errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));

  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length}/${results.length} PASS`);
  if (ng.length) { console.log('FAILED:\n' + ng.map(r => ' - ' + r.name).join('\n')); process.exit(1); }
})();
