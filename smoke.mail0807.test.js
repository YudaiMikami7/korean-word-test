/* k-tango 2026-08-06 23:54 のメール指示（育成パートナー＝動物育成の本編）ぶんのスモークテスト
 * 使い方: node smoke.mail0807.test.js
 * 指示のうち Phase1（2026-08-06 23:42ぶん）で入っていなかった残り全部＝Phase2:
 *   ・ガチャで新しい動物を入手できる（天井つき）／図鑑／パートナー変更（育ちは子ごとに残る）
 *   ・衣装・帽子・アクセサリー・背景・家具・エフェクトを装備できる（きせかえ）
 *   ・一定条件で進化する（大人・伝説を開放／進化は全画面で見せる）
 *   ・学習完了→エサが飛ぶ→食べる→経験値→レベルアップ→進化 の一連の演出
 *   ・韓国語との連携（覚えた単語を食べる／しゃべる／忘れている単語があると心配する）
 *   ・イベント画面（年間12か月・その月だけの限定品）
 *   ・長期継続（30/100/365/1000日の記念・久しぶりでも「おかえり」で迎える）
 *   ・AI画像の差しかえ口（pet/{種類}/{段階}.webp・読めた／読めなかったをおぼえてムダに取りにいかない）
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

  /* ============ 1. 友だちの種類（ガチャで増える・図鑑にならぶ） ============ */
  const zoo = await page.evaluate(() => ({
    n: PET_SPECIES.length,
    rares: PET_SPECIES.map(s => s.rare),
    stages: PET_STAGES.length,
    icoOK: PET_SPECIES.every(s => Array.isArray(s.ico) && s.ico.length >= PET_STAGES.length),
    likeOK: PET_SPECIES.every(s => !!s.like),
    firstHave: petHave().length, first: petState().sp
  }));
  check(`1-1 友だちは10種いる（いま${zoo.n}種）`, zoo.n === 10);
  check('1-2 レアリティ4段階（N/R/SR/SSR）がそろっている',
    ['N', 'R', 'SR', 'SSR'].every(r => zoo.rares.indexOf(r) >= 0));
  // 段階は5つになった（見た目の5段階＝成長の段階／メール指示 2026-08-29）
  check('1-3 成長は5段階（赤ちゃん→子ども→青年→大人→伝説）', zoo.stages === 5);
  check('1-4 どの子にも段階ぶんの姿と、好きな韓国語がある', zoo.icoOK && zoo.likeOK);
  check('1-5 さいしょは1種だけ（멍이）といっしょ', zoo.firstHave === 1 && zoo.first === 'mong');

  // 図鑑は廃止（メール指示 2026-08-31）。開こうとしても広場になる
  check('1-6 図鑑は廃止され、広場になる', await (async () => {
    await page.evaluate(() => openPetZoo());
    await page.waitForTimeout(300);
    return await page.evaluate(() => {
      const m = document.getElementById('pet-modal');
      return !m.querySelector('.pt-zoo') && !!m.querySelector('.pt-field');
    });
  })());

  /* ============ 2. ガチャ（単語の実で回す・天井つき） ============ */
  // ごはん（単語の実）は学習では増えず、プレゼントとガチャからだけ手に入る（メール指示 2026-08-08 23:52）
  check('2-1 学習ではごはんが増えない（プレゼント・ガチャのみ）', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1');
    const a = petState().seeds;
    petFeed('d5'); const b = petState().seeds;
    petFeed('test'); const c = petState().seeds;
    return a === 0 && b === 0 && c === 0 && PET_SEED.d5 === 0 && PET_SEED.test === 0;
  }));
  // ごはんは廃止され、ガチャ・プレゼントからは「きせかえ」が届く（メール指示 2026-08-29）
  check('2-1b ガチャの景品とプレゼントからきせかえが手に入る', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1');
    const a = Object.keys(petState().items || {}).length;
    petGrantWear();                             // ガチャの「きせかえ」
    const b = Object.keys(petState().items || {}).length;
    localStorage.removeItem('kwt_present_v1');
    grantWearPresent('テスト', 1);              // プレゼントの「きせかえ」
    const q = _presentState().queue.filter(x => x.kind === 'wear');
    return a === 0 && b > 0 && q.length === 1 && q[0].total === 1;
  }));
  // 元手は「ごはん」から「親密度」に変わった（学習していれば勝手にたまる／メール指示 2026-08-29）
  check('2-2 親密度がたりないと回せない', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1');
    const o = petState(); o.friend = PET_GACHA_COST - 1; savePet(o);
    return petRoll() === null && petState().friend === PET_GACHA_COST - 1;
  }));
  check('2-3 回すと親密度が減り、なにか手に入る', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1');
    const o = petState(); o.friend = 100; savePet(o);
    const r = petRoll();
    return !!r && ['sp', 'item', 'dup'].indexOf(r.type) >= 0 && petState().friend === 90;
  }));
  check(`2-4 ${'天井'}：10回まわせば必ず新しい友だちが来る`, await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1');
    const o = petState(); o.friend = 500; savePet(o);
    let sp = 0;
    for (let i = 0; i < 10; i++) { const r = petRoll(); if (r && r.type === 'sp') sp++; }
    return sp >= 1 && petHave().length >= 2;
  }));
  check('2-5 動物・衣装・帽子・アクセサリー・背景・家具・エフェクトが出る', await page.evaluate(() => {
    const slots = {};
    PET_ITEMS.forEach(i => slots[i.slot] = 1);
    return PET_SLOTS.every(s => slots[s.k]) && PET_SLOTS.length === 6;
  }));
  check('2-6 持っているものが出たら「親密度」にかわる（ムダにならない）', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1');
    const o = petState(); o.friend = 4000;
    PET_SPECIES.forEach(s => o.zoo[s.k] = { xp: 0, friend: 0, got: '2026-1-1' });
    PET_ITEMS.forEach(i => o.items[i.k] = 1);
    savePet(o);
    const before = petState().friend, r = petRoll();
    return !!r && r.type === 'dup' && petState().friend > before - PET_GACHA_COST;
  }));
  // 友だちガチャの画面は廃止（メール指示 2026-08-31）。友だちはプレゼントのたまごから生まれる
  check('2-7 友だちガチャ画面は廃止され、広場になる', await (async () => {
    await page.evaluate(() => { localStorage.removeItem('kwt_pet_v1'); const o = petState(); o.friend = 50; savePet(o); openPetGacha(); });
    await page.waitForTimeout(300);
    return await page.evaluate(() => {
      const m = document.getElementById('pet-modal');
      return !m.querySelector('.pt-ball') && !/ガチャを回す/.test(m.textContent) && !!m.querySelector('.pt-field');
    });
  })());

  /* ============ 3. パートナー変更（育ちは子ごとに別々に残る） ============ */
  check('3-1 図鑑から相手をかえられる／それぞれの育ちが混ざらない', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1');
    const o = petState();
    o.xp = 200; o.friend = 30;
    o.zoo['yaong'] = { xp: 0, friend: 0, got: '2026-1-1' };
    savePet(o);
    petSwitch('yaong');
    const a = petState();
    const okA = a.sp === 'yaong' && a.xp === 0 && /야옹이/.test(a.name) && a.zoo.mong.xp === 200;
    petFeed('d5');
    petSwitch('mong');
    const b = petState();
    return okA && b.sp === 'mong' && b.xp === 200 && b.zoo.yaong.xp === PET_GAIN.d5;
  }));

  /* ============ 4. きせかえ（装備できる） ============ */
  check('4-1 持っていないものは装備できない／持っていれば装備・解除できる', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1');
    const o = petState(); o.items = { hat_crown: 1 }; savePet(o);
    petEquip('acc', 'acc_medal');
    const noEquip = !petState().eq.acc;
    petEquip('hat', 'hat_crown');
    const on = petState().eq.hat === 'hat_crown';
    petEquip('hat', '');
    return noEquip && on && !petState().eq.hat;
  }));
  check('4-2 装備すると、その日の1枚に出る（背景もかわる）', await page.evaluate(() => {
    const o = petState();
    o.items = { hat_crown: 1, bg_hanok: 1, fx_spark: 1, cos_hanbok: 1, acc_medal: 1, fur_house: 1 };
    o.eq = { hat: 'hat_crown', bg: 'bg_hanok', fx: 'fx_spark', cos: 'cos_hanbok', acc: 'acc_medal', fur: 'fur_house' };
    savePet(o);
    const html = petArtHTML(petDaily(), 1, 'egg');
    return /👑/.test(html) && /F6E2C3/.test(html) && /✨/.test(html) && /👘/.test(html) && /🏅/.test(html) && /🏠/.test(html);
  }));
  // きせかえ画面は廃止（メール指示 2026-09-03）。開こうとしても広場になる
  check('4-3 きせかえ画面は廃止され広場になる', await (async () => {
    await page.evaluate(() => openPetWear());
    await page.waitForTimeout(300);
    return await page.evaluate(() => !!document.querySelector('#pet-modal .pt-field')
      && !document.querySelector('#pet-modal .pt-wrow'));
  })());

  /* ============ 5. 進化（大人・伝説まで／全画面で見せる） ============ */
  check('5-1 育てると4段階目より先（大人・伝説）まで進化する', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1');
    const seen = {};
    for (let i = 0; i < 100; i++) { const r = petFeed('test'); if (r) seen[r.stage.k] = 1; }
    return !!seen.adult && !!seen.myth && petLevel(petState().xp) <= PET_MAXLV;
  }));
  check('5-2 進化したら「あとで全画面で見せる」ぶんが残る', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1');
    let ev = false;
    for (let i = 0; i < 12; i++) { const r = petFeed('test'); if (r.evolved) ev = true; }
    return ev && !!petEvoPending();
  }));
  check('5-3 進化の全画面が出て、閉じると友だちの画面に戻る（1度きり）', await (async () => {
    const shown = await page.evaluate(() => petEvoShow());
    await page.waitForTimeout(400);
    const on = await page.evaluate(() => {
      const m = document.getElementById('petevo-modal');
      return m.classList.contains('on') && /진화/.test(m.textContent) && !!m.querySelector('.pv-new');
    });
    const again = await page.evaluate(() => petEvoPending());
    await page.evaluate(() => closePetEvo());
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => document.getElementById('pet-modal').classList.contains('on'));
    await page.evaluate(() => closePet());
    return shown && on && !again && back;
  })());

  /* ============ 6. 学習後の一連の演出（エサ→食べる→経験値→レベルアップ） ============ */
  // 結果の帯は文字を減らして1行・低い固定の高さになった（メール指示 2026-08-29）
  check('6-1 結果の帯は、絵とレベル1行と経験値バーだけ', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1');
    const r = petFeed('d5'); r.up = true; r.greet = petLevelGreet(2);
    const html = petResultHTML(r);
    return /pt-art/.test(html) && /pt-rbar/.test(html) && /Lv\./.test(html)
      && !/pt-food/.test(html) && !/pt-lvup/.test(html) && !/pt-greet/.test(html) && !/ことばの友だち/.test(html);
  }));
  check('6-2 「演出ひかえめ」にすると動きを止める', await page.evaluate(() => {
    const s = loadSettings(); s.lessFx = true; saveSettings(s);
    const html = petResultHTML(petFeed('d5'));
    const s2 = loadSettings(); s2.lessFx = false; saveSettings(s2);
    return /pt-res less/.test(html);
  }));

  /* ============ 7. 韓国語との連携 ============ */
  check('7-1 覚えた単語を食べる＝この子の語彙としてたまる（最新50語）', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1');
    const o = petState(); o.ate = []; for (let i = 0; i < 60; i++) o.ate.push('말' + i); savePet(o);
    return petState().ate.length === 50 && petState().ate[0] === '말10';
  }));
  // たべたことばは、育成画面の簡素化で図鑑へ移した（メール指示 2026-08-08 22:26）
  // 図鑑ごと廃止したので「たべたことば」はどこにも出さない（メール指示 2026-08-31）
  check('7-2 たべたことばの一覧は出さない', await (async () => {
    await page.evaluate(() => { openPet(); openPetZoo(); });
    await page.waitForTimeout(300);
    const has = await page.evaluate(() => !!document.querySelector('#pet-modal .pt-ate'));
    await page.evaluate(() => closePet());
    return !has;
  })());
  check('7-3 レベルアップすると韓国語であいさつする（語彙がふえるほど長くなる）', await page.evaluate(() => {
    const a = petLevelGreet(3);
    return /고마워/.test(a.ko) && !!a.ja;
  }));
  check('7-4 好きな単語を覚えると、その子だけの反応をする', await page.evaluate(() => {
    const sp = PET_SP_BY_K[petState().sp];
    return PET_SPECIES.every(s => s.like && s.like !== sp.like || s.k === sp.k);
  }));
  check('7-5 忘れかけの単語があると心配する→そのまま復習へ行ける', await (async () => {
    await page.evaluate(() => {
      localStorage.removeItem('kwt_pet_v1');
      const s = {}, ids = Object.keys(WORD_BY_ID).slice(0, 40), old = new Date(Date.now() - 3 * 86400000).toISOString();
      ids.forEach(id => {
        const st = getStat(id);
        st.hasSeen = true; st.hasEverCorrect = true; st.memoryScore = 30;
        st.lastReviewedAt = old; st.nextReviewAt = old; st.correctCount = 1;
        s[id] = st;
      });
      localStorage.setItem('kwt_stats_v1', JSON.stringify(s));
      openPet();
    });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const m = document.getElementById('pet-modal');
      return { worry: petWorry().length, btn: !!m.querySelector('.pt-worry'), txt: m.textContent };
    });
    await page.evaluate(() => closePet());
    return r.worry >= 3 && r.btn && /わすれかけ/.test(r.txt) && /잊어버릴/.test(r.txt);
  })());

  /* ============ 8. イベント ============ */
  check('8-1 年間12か月ぶんのイベントがある', await page.evaluate(() => PET_EVENTS.length === 12 && PET_EVENTS.every(e => e.m >= 1 && e.m <= 12 && e.t && e.ko)));
  check('8-2 その月だけの限定品が、月に1つ届く', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1');
    const m = _dayFromKey(appDayKey()).getMonth() + 1;
    petDaily();
    const o = petState(), got = Object.keys(o.items);
    const lim = PET_ITEMS.filter(i => i.ev === m);
    if (!lim.length) return got.length === 0 && !!o.evGot;
    const before = got.length;
    petDaily(); petDaily();
    return before === 1 && lim.some(i => i.k === got[0]) && Object.keys(petState().items).length === 1;
  }));
  // イベント画面は廃止（メール指示 2026-08-31）
  check('8-3 イベント画面は廃止され、広場になる', await (async () => {
    await page.evaluate(() => openPetEvent());
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const m = document.getElementById('pet-modal');
      return { cal: m.querySelectorAll('.pt-evcal span').length, field: !!m.querySelector('.pt-field') };
    });
    await page.evaluate(() => closePet());
    return r.cal === 0 && r.field;
  })());

  /* ============ 9. 長く育てる（30/100/365/1000日） ============ */
  check('9-1 記念は30・100・365・1000日の4つ', await page.evaluate(() => PET_BONDS.map(b => b.d).join(',') === '30,100,365,1000'));
  // 記念のごほうびはプレゼントの箱に「きせかえ」として届く（ごはんは廃止／メール指示 2026-08-29）
  check('9-2 日数を越えた時だけ、記念の品ときせかえのプレゼントがもらえる（二重取りしない）', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1'); localStorage.removeItem('kwt_present_v1');
    const o = petState(); o.days = 30; o.seeds = 0; o.items = {}; o.bond = [];
    petBondCheck(o); savePet(o);
    const a = petState(), w1 = _presentState().queue.filter(x => x.kind === 'wear');
    const o2 = petState(); petBondCheck(o2); savePet(o2);
    const b = petState(), w2 = _presentState().queue.filter(x => x.kind === 'wear');
    return a.bond.join() === '30' && a.seeds === 0 && !!a.items.acc_ribbon
      && w1.length === 1 && w1[0].total === 1 && w2.length === 1 && b.seeds === 0;
  }));
  check('9-3 1000日まで育てると、4つぜんぶ受け取れている', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1'); localStorage.removeItem('kwt_present_v1');
    const o = petState(); o.days = 1000; petBondCheck(o); savePet(o);
    const s = petState(), w = _presentState().queue.filter(x => x.kind === 'wear');
    return s.bond.length === 4 && !!s.items.hat_crown && w.length === 4;
  }));
  check('9-4 何日かあいても叱らない。「おかえり」で迎えてきせかえのプレゼントをわたす', await page.evaluate(() => {
    localStorage.removeItem('kwt_pet_v1'); localStorage.removeItem('kwt_present_v1');
    const o = petState(); petDaily();
    const p = petState();
    const d = new Date(Date.now() - 5 * 86400000);
    p.lastLaunch = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    p.seeds = 0; delete p.day; savePet(p);
    localStorage.removeItem('kwt_present_v1');
    petDaily();
    const s = petState(), w = _presentState().queue.filter(x => x.kind === 'wear');
    return !!s.back && s.back.gap >= 3 && s.seeds === 0 && w.length === 1 && w[0].total === 1;
  }));
  check('9-5 「おかえり」は1回見せたら消える', await (async () => {
    await page.evaluate(() => openPet());
    await page.waitForTimeout(300);
    const t1 = await page.evaluate(() => document.getElementById('pet-modal').textContent);
    await page.evaluate(() => { closePet(); openPet(); });
    await page.waitForTimeout(300);
    const t2 = await page.evaluate(() => document.getElementById('pet-modal').textContent);
    await page.evaluate(() => closePet());
    return /おかえり/.test(t1) && !/おかえり/.test(t2);
  })());
  check('9-6 いっしょにいた日数が画面に出る', await (async () => {
    await page.evaluate(() => openPet());
    await page.waitForTimeout(300);
    const t = await page.evaluate(() => (document.querySelector('#pet-modal .pt-name') || {}).textContent || '');
    await page.evaluate(() => closePet());
    return /いっしょに\s*\d+日/.test(t);
  })());

  /* ============ 10. AI画像の差しかえ口 ============ */
  // 段階は番号で持つようになった（見た目の5段階／メール指示 2026-08-29）
  check('10-1 画像は pet/{種類}/g{段階}.webp を見にいく', await page.evaluate(() =>
    petImgSrc('mong', 2) === 'pet/mong/g2.webp' && petImgKey('mong', 2) === 'mong/g2'));
  check('10-2 画像が無ければ絵文字のまま出て、「無かった」ことを控える（次から取りにいかない）', await (async () => {
    await page.evaluate(() => { localStorage.removeItem('kwt_pet_v1'); openPet(); });
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const st = petState(), m = document.getElementById('pet-modal');
      return { step: petGrowStep(petLevel(st.xp)), mark: st.img[petImgKey(st.sp, petGrowStep(petLevel(st.xp)))],
               body: !!m.querySelector('.pt-body'), img: !!m.querySelector('.pt-img') };
    });
    // 控えたあとは <img> 自体を出さない
    await page.evaluate(() => { closePet(); openPet(); });
    await page.waitForTimeout(400);
    const again = await page.evaluate(() => !!document.querySelector('#pet-modal .pt-img'));
    await page.evaluate(() => closePet());
    // 1段階目は絵文字のままで画像を取りにいかないので、そのときは控えも付かない
    return (r.step < 2 ? r.mark === undefined : r.mark === 'ng') && r.body && !again;
  })());
  check('10-3 生成状態の控えは種類×段階ごと（見た目が変わる時だけ作ればよい）', await page.evaluate(() => {
    const st = petState();
    return Object.keys(st.img).every(k => /^[a-z]+\/g[1-5]$/.test(k));
  }));

  /* ============ 11. 通しで遊ぶ ============ */
  check('11-1 5問→結果に動物は出さない→ホームで進化の全画面', await (async () => {
    await page.evaluate(() => {
      localStorage.removeItem('kwt_daily5_v1'); localStorage.removeItem('kwt_pet_v1'); localStorage.removeItem('kwt_stats_v1');
      const o = petState(); o.xp = 39 + 40 * 3; savePet(o); // つぎの1回で「子ども」(Lv.5)へ進化する手前
      startDaily5();
    });
    await page.waitForTimeout(2600);
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => { const b = document.querySelector('#qstage .choices .choice:not([disabled])'); if (b) b.click(); });
      await page.waitForTimeout(1100);
    }
    await page.waitForTimeout(1300);
    // 今日の5問の結果には動物のことは出さない。育ち自体は裏で進む（メール指示 2026-08-31）
    const res = await page.evaluate(() => {
      const pt = document.querySelector('#s-d5result .pt-res');
      return !pt && !!petEvoPending();
    });
    await page.evaluate(() => { show('s-home'); renderHome(); });
    await page.waitForTimeout(1200);
    const evo = await page.evaluate(() => document.getElementById('petevo-modal').classList.contains('on'));
    await page.evaluate(() => { closePetEvo(); closePet(); });
    return res && evo;
  })());
  // 下に並んでいた5つのボタン群は廃止し、広場と「きせかえる」だけにした（メール指示 2026-08-31）
  check('11-2 育成画面は広場だけ（ボタンは閉じるのみ）', await (async () => {
    await page.evaluate(() => openPet());
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const m = document.getElementById('pet-modal');
      return { tabs: !!m.querySelector('.pt-tabs'), field: !!m.querySelector('.pt-field'),
        btns: m.querySelectorAll('button').length };
    });
    await page.evaluate(() => closePet());
    return !r.tabs && r.field && r.btns === 1; // ×だけ（きせかえるは廃止／メール指示 2026-09-03）
  })());
  check('11-3 どの画面からも「‹」で友だちの画面に戻れる', await (async () => {
    await page.evaluate(() => { openPet(); openPetZoo(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#pet-modal .pt-back2').click());
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => !!document.querySelector('#pet-modal .pt-tabs'));
    await page.evaluate(() => closePet());
    return back;
  })());

  /* ============ 回帰 ============ */
  await fresh({ kwt_d5auto_v1: 'x' });
  check('R-1 版数が上がっている（v6.8以降）', await page.evaluate(() => { const m = /^v(\d+)\.(\d+)/.exec(APP_VERSION); return !!m && (+m[1] > 6 || +m[2] >= 8); }));
  check('R-2 ホームのレイアウトは変わっていない（今日の5問の丸の位置）', await (async () => {
    await page.evaluate(() => { show('s-home'); renderHome(); });
    await page.waitForTimeout(700);
    return await page.evaluate(() => {
      const h = document.getElementById('homewrap').getBoundingClientRect(), k = h.width / 602;
      const r = document.querySelector('.sg-d5').getBoundingClientRect();
      return Math.abs((r.bottom - h.top) / k - 1132) < 1.5;
    });
  })());
  check('R-3 入口はハンバーガーメニューの「ことばの友だち」1つのまま', await (async () => {
    await page.evaluate(() => { show('s-home'); openHomeMenu(); });
    await page.waitForTimeout(400);
    const n = await page.evaluate(() => [...document.querySelectorAll('#menu-modal .hm-cap')].filter(b => /ことばの友だち/.test(b.textContent)).length);
    await page.evaluate(() => closeHomeMenu());
    return n === 1;
  })());
  check('R-4 今日の5問・トレンド・ガチャ・プレゼントの入口は今までどおり', await page.evaluate(() =>
    !!document.querySelector('.sg-d5') && !!document.querySelector('.sg-gift') && typeof openGacha === 'function' && typeof openPresent === 'function'));
  check('R-5 Phase1の記録（xp/親密度）はそのまま最初の子のものとして引き継がれる', await page.evaluate(() => {
    localStorage.setItem('kwt_pet_v1', JSON.stringify({ xp: 123, friend: 45, album: [{ k: '2026-8-1', act: 0, mood: 0, wear: 0, wx: 0, lv: 4, stage: 'baby' }], name: '멍이（モンイ）' }));
    const o = petState();
    return o.sp === 'mong' && o.xp === 123 && o.zoo.mong.xp === 123 && o.zoo.mong.friend === 45 && o.seeds === 0;
  }));
  check('R-6 保存キーは増えていない（ことばの友だちは kwt_pet_v1 のまま）', await page.evaluate(() => {
    const before = Object.keys(localStorage).length;
    petDaily(); petFeed('test'); petRoll(); petEquip('hat', 'hat_cap');
    return Object.keys(localStorage).filter(k => /^kwt_pet/.test(k)).join() === 'kwt_pet_v1' && Object.keys(localStorage).length >= before;
  }));
  check('R-7 JSコンソールエラーが無い', errors.length === 0);
  if (errors.length) console.log(errors);

  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length} / ${results.length} PASS`);
  if (ng.length) { console.log('--- FAILED ---'); ng.forEach(r => console.log('  ' + r.name)); }
  await browser.close();
  process.exit(ng.length ? 1 : 0);
})();
