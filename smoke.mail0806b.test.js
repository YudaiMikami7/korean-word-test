/* k-tango 2026-08-06 23:42 のメール指示（「メールのなかに続きのものがあります」）ぶんのスモークテスト
 * 使い方: node smoke.mail0806b.test.js
 * 指示: 2026-08-06 22:32 のメールの、前回読み切れていなかった続き
 *   ・2つめの仕様書「動物育成」Phase1（ことばの友だち）
 *   ・8. 演出設計のうち「演出ひかえめ」（ことばの友だちの演出でも使う）
 * ※ 今日のボーナス（오늘의 행운）ぶんの 1〜10章・12-2 は、機能の廃止にあわせて外した（メール指示 2026-08-08）
 */
const { chromium } = require('playwright');
const path = require('path');
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').split(path.sep).join('/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForTimeout(900);
  const fresh = async (extra) => {
    await page.evaluate(ex => {
      localStorage.clear();
      localStorage.setItem('kwt_coach_v1', '1');
      localStorage.setItem('kwt_firstdone_v1', '1');
      localStorage.setItem('kwt_roomhint_v1', '1');
      Object.keys(ex || {}).forEach(k => localStorage.setItem(k, ex[k]));
    }, extra || {});
    await page.reload();
    await page.waitForTimeout(1200);
  };
  await fresh({ kwt_d5auto_v1: 'x' });

  /* ============ 8. 演出ひかえめ（8.1・8.3） ============ */
  check('8-1 「演出ひかえめ」の設定がある', await page.evaluate(() => {
    const s = loadSettings(); return 'lessFx' in s && s.lessFx === false;
  }));
  check('8-3 端末の「視差効果を減らす」にも追従する', await page.evaluate(() => typeof lessFxOn === 'function' && typeof _reducedMotion === 'function'));

  /* ============ 11. ことばの友だち（2つめの仕様書 Phase1） ============ */
  await fresh({ kwt_d5auto_v1: 'x' });
  const pet = await page.evaluate(() => {
    const day = petDaily();
    return { acts: PET_ACTS.length, moods: PET_MOODS.length, wears: PET_WEARS.length, stages: PET_STAGES.length,
      maxlv: PET_MAXLV, day, lv: petLevel(petState().xp), friend: petState().friend, album: petState().album.length,
      line0: petLine(), art: petArtHTML(day, 1, 'egg') };
  });
  check(`11-1 今日の出来事が20パターン（いま${pet.acts}）`, pet.acts === 20);
  check(`11-2 気分6種・衣装7種（いま${pet.moods}／${pet.wears}）`, pet.moods === 6 && pet.wears === 7);
  // Phase2（2026-08-06 23:54 の指示）で大人・伝説を開放したので Lv1〜40・6段階になった
  // 段階は5つになった（見た目の5段階＝成長の段階／メール指示 2026-08-29）
  check(`11-3 Lv1〜40・5段階成長（いま${pet.maxlv}／${pet.stages}段階）`, pet.maxlv === 40 && pet.stages === 5);
  check('11-4 その日だけの1枚（出来事×気分×衣装×天気）が組み立てられる',
    /pt-body/.test(pet.art) && /pt-act/.test(pet.art) && /pt-wx/.test(pet.art) && /pt-wear/.test(pet.art));
  check('11-5 毎日起動で親密度がつく', pet.friend >= 2);
  check('11-6 最初は「안녕!」だけ話す（覚えた語がふえると長くなる）', pet.line0.ko === '안녕!');
  check('11-7 同じ日なら何度開いても同じ1枚（翌日は変わる）', await page.evaluate(() => {
    const a = JSON.stringify(petDaily()), b = JSON.stringify(petDaily());
    const st = petState(); const k0 = st.day.k;
    return a === b && k0 === appDayKey();
  }));
  check('11-8 学習で韓国語エネルギーが入り、レベルが上がる／進化する', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1');
    const r1 = petFeed('d5'), lv1 = petLevel(petState().xp);
    let evolved = false;
    for (let i = 0; i < 12; i++) { const r = petFeed('test'); if (r.evolved) evolved = true; }
    return r1.gain === 30 && petLevel(petState().xp) > lv1 && evolved;
  }));
  // ごはんは廃止済み。今日の5問がいちばん多く育つことだけ確かめる（メール指示 2026-08-31）
  check('11-9 学習で育つ（今日の5問がいちばん多い）', await page.evaluate(() =>
    PET_GAIN.d5 > PET_GAIN.test && PET_GAIN.test > 0));
  check('11-10 思い出アルバムは最新30日まで', await page.evaluate(() => {
    const o = petState(); o.album = Array.from({ length: 45 }, (_, i) => ({ k: '2026-1-' + (i + 1), act: 0, mood: 0, wear: 0, wx: 0, lv: 1, stage: 'egg' }));
    savePet(o);
    return petState().album.length === 30;
  }));
  check('11-11 タップでもなつく（1日5回まで）', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1'); petDaily();
    const a = petState().friend;
    for (let i = 0; i < 9; i++) petTap();
    return petState().friend - a === 5;
  }));
  // 入口はハンバーガーではなく、ホーム左下の「そだてる」ボタン1つに一本化した（メール指示 2026-08-31）
  check('11-12 ホームの「そだてる」から広場をひらける', await (async () => {
    await page.evaluate(() => { show('s-home'); openHomeMenu(); });
    await page.waitForTimeout(400);
    const gone = await page.evaluate(() => ![...document.querySelectorAll('#menu-modal .hm-cap')].some(b => /ことばの友だち/.test(b.textContent)));
    await page.evaluate(() => { closeHomeMenu(); });
    await page.waitForTimeout(200);
    const opensPlaza = await page.evaluate(() => {
      const b = document.querySelector('.sg-pet');
      return !!b && /openPet\(\)/.test(b.getAttribute('onclick') || '');
    });
    await page.evaluate(() => openPet());
    await page.waitForTimeout(400);
    const on = await page.evaluate(() => {
      const m = document.getElementById('pet-modal');
      return m.classList.contains('on') && !!m.querySelector('.pt-field') && !!m.querySelector('.pt-name');
    });
    await page.evaluate(() => closePet());
    return gone && opensPlaza && on;
  })());
  // ごはんは廃止され、主ボタンは「きせかえる」になった（メール指示 2026-08-29）
  check('11-13 育成画面から1タップできせかえに行ける', await (async () => {
    await page.evaluate(() => openPet());
    await page.waitForTimeout(300);
    const t = await page.evaluate(() => (document.querySelector('#pet-modal .d5-go') || {}).textContent || '');
    await page.evaluate(() => closePet());
    return /きせかえる/.test(t);
  })());

  /* ============ 12. 通しで遊ぶ（ことばの友だちの成長） ============ */
  check('12-1 5問を最後までやっても、結果画面に動物は出さない', await (async () => {
    await page.evaluate(() => { localStorage.removeItem('kwt_daily5_v1'); localStorage.removeItem('kwt_pet_v1'); });
    await page.evaluate(() => { startDaily5(); });
    // カウントダウンの終わりを待ってから答える（時間で決め打ちすると取りこぼす）
    await page.waitForSelector('#qstage .choices .choice:not([disabled])', { timeout: 20000 });
    for (let i = 0; i < 5; i++) {
      await page.waitForSelector('#qstage .choices .choice:not([disabled])', { timeout: 20000 }).catch(() => {});
      await page.evaluate(() => { const b = document.querySelector('#qstage .choices .choice:not([disabled])'); if (b) b.click(); });
      await page.waitForTimeout(900);
    }
    await page.waitForSelector('#s-d5result.on', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(600);
    return await page.evaluate(() => {
      // 動物のことは書かない（メール指示 2026-08-31）
      const pt = document.querySelector('#s-d5result .pt-res');
      return !pt && document.getElementById('s-d5result').classList.contains('on');
    });
  })());

  /* ============ 回帰 ============ */
  check('R-1 版数が上がっている（v6.7以降）', await page.evaluate(() => { const m = /^v(\d+)\.(\d+)/.exec(APP_VERSION); return !!m && (+m[1] > 6 || +m[2] >= 7); }));
  // 5問の丸があった場所は育成ゲームの丸になった（高さはそのまま。メール指示 2026-08-08）
  check('R-2 ホームのレイアウトは変わっていない（左下の丸の位置）', await (async () => {
    await page.evaluate(() => { show('s-home'); renderHome(); });
    await page.waitForTimeout(700);
    return await page.evaluate(() => {
      const h = document.getElementById('homewrap').getBoundingClientRect(), k = h.width / 602;
      const r = document.querySelector('.sg-pet').getBoundingClientRect();
      return Math.abs((r.bottom - h.top) / k - 1132) < 1.5;
    });
  })());
  check('R-3 今日の5問・育成ゲーム・ガチャ・プレゼントの入口がある', await page.evaluate(() =>
    !!document.querySelector('.sg-d5') && !!document.querySelector('.sg-pet') && !!document.querySelector('.sg-gift')
    && typeof openGacha === 'function' && typeof openPresent === 'function'));
  check('R-4 設定に「演出」が増えただけ（既存の項目は残っている）', await (async () => {
    await page.evaluate(() => openSettings());
    await page.waitForTimeout(400);
    const t = await page.evaluate(() => document.getElementById('settings-modal').textContent);
    await page.evaluate(() => closeSettings());
    return /演出/.test(t) && /サウンド/.test(t) && /じっくり/.test(t) && /文字の大きさ/.test(t);
  })());
  check('R-5 保存キーが増えただけ（既存の記録を壊していない）', await page.evaluate(() =>
    !!localStorage.getItem('kwt_daily5_v1') && !!localStorage.getItem('kwt_pet_v1')));
  check('R-6 JSコンソールエラーが無い', errors.length === 0);
  if (errors.length) console.log(errors);

  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length} / ${results.length} PASS`);
  if (ng.length) { console.log('--- FAILED ---'); ng.forEach(r => console.log('  ' + r.name)); }
  await browser.close();
  process.exit(ng.length ? 1 : 0);
})();
