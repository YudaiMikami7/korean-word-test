/* k-tango 2026-08-08 22:26 のメール指示ぶんのスモークテスト
 * 使い方: node smoke.mail0808b.test.js
 * 指示:
 *  ① 今日の5問などのポップアップは、ダーク地をやめ、小さな英字をなくす
 *  ② 育てるメニューのデザインを刷新する
 *  ③ 育成画面をもっとシンプルにする
 *  ④ ごはんをあげるボタンで、ごはんが無いときは「ごはんを集める」を出し、
 *     ごはんが集まりやすいWORLDのステップをすすめる
 *  ⑤ ROOM を WORLD に全面的に改変する
 *  ⑥ 過去の結果画面は、問題のあとの結果画面と同じUI（同じ画面を流用・専用UIは廃止）
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const results = [];
function check(name, cond, note) { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${note ? ' (' + note + ')' : ''}`); }
const URL = 'file:///' + path.resolve(__dirname, 'index.html').split(path.sep).join('/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 602, height: 1178 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('kwt_coach_v1', '1');
    localStorage.setItem('kwt_firstdone_v1', '1');
    localStorage.setItem('kwt_roomhint_v1', '1');
    localStorage.setItem('kwt_d5auto_v1', d5Key(Date.now())); // 自動スタートの吹き出しは邪魔なので出さない
  });
  await page.reload();
  await page.waitForTimeout(1600);
  const clearFx = () => page.evaluate(() => document.querySelectorAll('.streak-cel,.cardget,.lvup,.pbub,.stepnote,.rest-ask,#resume-ask,.coach,.d5auto').forEach(o => o.remove()));
  await clearFx();

  /* ============ ① 統合ポップアップ：白地・小さな英字なし ============ */
  await page.evaluate(() => openDaily5());
  await page.waitForTimeout(400);
  const pop = await page.evaluate(() => {
    const c = document.querySelector('#d5-modal .u5-card'), st = getComputedStyle(c);
    return {
      bg: st.backgroundColor, color: st.color,
      tail: getComputedStyle(c, '::after').borderTopColor,
      kicks: c.querySelectorAll('.u5-kick').length,
      titles: [...c.querySelectorAll('.u5-ti')].map(e => e.textContent),
      latin: (c.textContent.match(/[A-Z]{4,}/g) || []).filter(w => w !== 'WORLD'),
      ring: !!c.querySelector('.u5-ring'), bar: !!c.querySelector('.ms-bar i'),
      slots: c.querySelectorAll('.d5-slot').length
    };
  });
  check(`1-1 ポップアップはダーク地をやめて白地 (${pop.bg})`, pop.bg === 'rgb(255, 255, 255)');
  check(`1-2 しっぽも白 (${pop.tail})`, pop.tail === 'rgb(255, 255, 255)');
  check('1-3 文字は濃い色（白地でも読める）', pop.color !== 'rgb(255, 255, 255)');
  check(`1-4 小さな英字の見出し(MISSION/TODAY)は無い (${pop.kicks}個)`, pop.kicks === 0);
  check(`1-5 見出しは日本語だけ (${pop.titles.join('/')})`, pop.titles.join('/') === '今週のミッション/今日の5問');
  check(`1-6 カードの中に英字の見出しが残っていない (${pop.latin.join(',')})`, pop.latin.length === 0);
  check('1-7 ドーナツ・バー・朝夜のマスはそのまま', pop.ring && pop.bar && pop.slots === 2);
  await page.evaluate(() => closeDaily5());

  /* ============ ② 育てるメニューの刷新 ============ */
  await page.evaluate(() => { localStorage.removeItem('kwt_pet_v1'); openPetMenu(); });
  await page.waitForTimeout(400);
  const pm = await page.evaluate(() => {
    const c = document.querySelector('#petmenu-modal .pm-card');
    return {
      bg: getComputedStyle(c).backgroundColor,
      kicks: c.querySelectorAll('.u5-kick').length,
      rings: [...c.querySelectorAll('.pm-ring em')].map(e => e.textContent),
      ringGrad: [...c.querySelectorAll('.pm-ring span')].every(e => /conic-gradient/.test(getComputedStyle(e).backgroundImage)),
      art: !!c.querySelector('.pt-art'), bar: !!c.querySelector('.pm-bar i'),
      oldSt: !!c.querySelector('.pt-st'),
      feed: (c.querySelector('.pm-feed') || {}).textContent,
      fit: (() => { const b = c.getBoundingClientRect(); return b.left >= -0.5 && b.top >= -0.5 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1; })()
    };
  });
  check(`2-1 育てるメニューも白地 (${pm.bg})`, pm.bg === 'rgb(255, 255, 255)');
  check(`2-2 小さな英字(FRIEND)は無い (${pm.kicks}個)`, pm.kicks === 0);
  check(`2-3 状態は3つの丸ゲージ (${pm.rings.join('/')})`, pm.rings.join('/') === 'ごはん/親密度/韓国語力');
  check('2-4 丸ゲージは円グラフで描いている', pm.ringGrad);
  check('2-5 キャラクターと伸び具合のバーはそのまま', pm.art && pm.bar);
  check('2-6 前の横並びチップ(.pt-st)はもう使っていない', !pm.oldSt);
  check(`2-7 ごはんをあげるボタンがある (${(pm.feed || '').trim()})`, /ごはんをあげる/.test(pm.feed || ''));
  check('2-8 吹き出しが画面に収まっている', pm.fit);

  /* ============ ④ ごはんが無いとき＝「ごはんを集める」 ============ */
  const need = await page.evaluate(async () => {
    const o = petState(); o.seeds = 0; savePet(o);
    petMenuRender();
    document.querySelector('#petmenu-modal .pm-feed').click();
    await new Promise(r => setTimeout(r, 350));
    const m = document.getElementById('petmenu-modal');
    return {
      on: m.classList.contains('on'),
      title: (m.querySelector('.u5-ti') || {}).textContent || '',
      need: (m.querySelector('.pm-need') || {}).textContent || '',
      ways: [...m.querySelectorAll('.pm-way button')].map(b => ({
        t: b.querySelector('.pw-t').textContent, s: b.querySelector('.pw-s').textContent,
        n: b.querySelector('.pw-n').textContent, act: b.getAttribute('onclick')
      }))
    };
  });
  check('4-1 吹き出しは閉じず、その場で出る', need.on);
  check(`4-2 見出しが「ごはんを集める」 (${need.title})`, need.title === 'ごはんを集める');
  check(`4-3 足りないことを知らせる (${need.need.slice(0, 20)})`, /ごはんが足りません/.test(need.need));
  check(`4-4 集めかたが2つ以上ならぶ (${need.ways.length}件)`, need.ways.length >= 2);
  check(`4-5 WORLDのステップをすすめる (${need.ways.map(w => w.t).join(' / ')})`,
    need.ways.some(w => /^WORLD \d\d のステップ \d+-\d+$/.test(w.t)));
  check('4-6 いくつ集まるかも出ている', need.ways.every(w => /🌰\+\d+/.test(w.n)));
  check('4-7 すすめたステップはタップでそのWORLDへ行ける', need.ways.some(w => /petGoStep\(\d+\)/.test(w.act || '')));
  const jump = await page.evaluate(async () => {
    const b = [...document.querySelectorAll('#petmenu-modal .pm-way button')].find(x => /petGoStep/.test(x.getAttribute('onclick')));
    const sec = Number((b.getAttribute('onclick').match(/petGoStep\((\d+)\)/) || [])[1]);
    b.click();
    await new Promise(r => setTimeout(r, 700));
    return { sec, cur: curSection, menu: document.getElementById('petmenu-modal').classList.contains('on'), home: document.getElementById('s-home').classList.contains('on') };
  });
  check(`4-8 押すとそのWORLDへ移動する (WORLD${jump.sec} → 現在${jump.cur})`, !jump.menu && jump.home);
  check('4-9 ごはんがあるときは、そのまま食べさせられる', await page.evaluate(async () => {
    const o = petState(); o.seeds = 3; savePet(o);
    openPetMenu(); petMenuRender();
    const x0 = petState().xp;
    document.querySelector('#petmenu-modal .pm-feed').click();
    await new Promise(r => setTimeout(r, 300));
    const ok = petState().xp > x0 && petState().seeds === 2 && !document.querySelector('#petmenu-modal .pm-need');
    closePetMenu();
    return ok;
  }));

  /* ============ ③ 育成画面はシンプルに ============ */
  await page.evaluate(() => openPet());
  await page.waitForTimeout(400);
  const pet = await page.evaluate(() => {
    const c = document.querySelector('#pet-modal .pt-card');
    return {
      art: !!c.querySelector('.pt-art'), line: !!c.querySelector('.pt-line'),
      rings: c.querySelectorAll('.pm-ring').length,
      album: !!c.querySelector('.pt-alb'), ate: !!c.querySelector('.pt-ate'),
      oldSt: !!c.querySelector('.pt-st'), oldBar: !!c.querySelector('.pt-bar'),
      ko: /단어 친구/.test(c.textContent),
      go: c.querySelectorAll('.d5-go').length,
      tabs: c.querySelectorAll('.pt-tabs button').length,
      chars: c.textContent.replace(/\s/g, '').length
    };
  });
  check('3-1 キャラクターとひとことは残っている', pet.art && pet.line);
  check(`3-2 状態は育てるメニューと同じ3つの丸ゲージ (${pet.rings}個)`, pet.rings === 3);
  check('3-3 思い出アルバムは育成画面から外した', !pet.album);
  check('3-4 たべたことばも育成画面から外した', !pet.ate);
  check('3-5 古い横並びチップ・細バーはもう無い', !pet.oldSt && !pet.oldBar);
  check('3-6 「단어 친구」の飾り見出しは外した', !pet.ko);
  check(`3-7 大きなボタンは1つだけ (${pet.go}個)`, pet.go === 1);
  check(`3-8 図鑑・ガチャ・きせかえ・イベントへは行ける (${pet.tabs}個)`, pet.tabs === 4);
  check(`3-9 画面の文字数がしぼれている (${pet.chars}字)`, pet.chars <= 220);
  check('3-10 たべたことば・思い出アルバムは図鑑で見られる', await page.evaluate(async () => {
    const o = petState(); o.ate = ['말1', '말2']; savePet(o);
    openPetZoo();
    await new Promise(r => setTimeout(r, 250));
    const c = document.querySelector('#pet-modal .pt-card');
    const ok = !!c.querySelector('.pt-ate');
    closePet();
    return ok;
  }));

  /* ============ ⑤ ROOM → WORLD ============ */
  await page.evaluate(() => { show('s-home'); });
  await page.waitForTimeout(600);
  await clearFx();
  const world = await page.evaluate(async () => {
    const seen = [];
    const grab = () => { const t = document.body.innerText; if (/ROOM/.test(t)) seen.push(t.match(/.{0,12}ROOM.{0,12}/)[0]); };
    grab();
    openHomeMenu(); await new Promise(r => setTimeout(r, 300)); grab();
    const caps = [...document.querySelectorAll('#menu-modal .hm-cap')].map(b => b.textContent.trim());
    closeHomeMenu();
    openRoomMap(); await new Promise(r => setTimeout(r, 300)); grab();
    closeRoomMap();
    openDaily5(); await new Promise(r => setTimeout(r, 300)); grab();
    const titles = missionRows().map(r => missionTitle(r.m));
    closeDaily5();
    return { seen, caps, titles, head: (document.querySelector('.rm-no') || document.querySelector('.hv-no') || {}).textContent || '' };
  });
  check(`5-1 画面のどこにもROOMの文字が出ない (${world.seen.join(' / ')})`, world.seen.length === 0);
  check(`5-2 メニューは「WORLD一覧」 (${world.caps.join(',')})`, world.caps.some(t => /WORLD一覧/.test(t)));
  check(`5-3 ミッションもWORLD表記 (${world.titles.join(' / ')})`,
    world.titles.filter(t => /WORLD/.test(t)).length >= 1 && world.titles.every(t => !/ROOM/.test(t)));
  check('5-4 ソースにも表示用のROOMが残っていない',
    !/(^|[^A-Za-z_])ROOM([^A-Za-z_]|$)/.test(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')));
  check('5-5 カタカナの「ルーム」も残っていない',
    !/ルーム/.test(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')));

  /* ============ ⑥ 過去の結果＝テスト後と同じ画面 ============ */
  const past = await page.evaluate(async () => {
    const ids = (LEVEL_SECTIONS.beginner[1] || []).slice(0, 12), now = Date.now();
    const H = ids.map((id, i) => ({
      userId: 'u', wordId: id, testId: 't-past1', questionNumber: i + 1,
      korean: '단어' + i, japanese: 'たんご' + i,
      answerStatus: i % 4 === 0 ? 'incorrect' : 'correct', isCorrect: i % 4 !== 0,
      score: i % 4 === 0 ? 0 : 8.3, answeredAt: new Date(now - 3600000 + i * 1000).toISOString(),
      displayMemoryScoreBefore: 20, displayMemoryScoreAfter: 20 + (i % 4 === 0 ? -3 : 12),
      memoryScoreBefore: 20, memoryScoreAfter: 30, cardsEarned: i % 4 === 0 ? 1 : 6, cardRarity: i === 2 ? 'SR' : 'N'
    }));
    localStorage.setItem('kwt_history_v1', JSON.stringify(H));
    renderPastResult('t-past1');
    await new Promise(r => setTimeout(r, 400));
    const r = document.getElementById('s-result');
    return {
      on: r.classList.contains('on'),
      cards: r.querySelectorAll('.rc-card').length,
      table: !!r.querySelector('.rtab'), head: !!r.querySelector('.page-head'),
      right: !!r.querySelector('.res-right'),
      medal: !!r.querySelector('.rank-c.rank-medal'),
      rank: (r.querySelector('.rank-c') || {}).textContent,
      score: (document.getElementById('res-score-n') || {}).textContent,
      meters: r.querySelectorAll('.res-mrow').length,
      xpGain: (document.getElementById('res-xp-gain') || {}).textContent,
      btns: [...r.querySelectorAll('.res-btns .rb-lab')].map(e => e.textContent),
      cheer: (r.querySelector('.res-cheer') || {}).textContent.trim(),
      rare: !!r.querySelector('.rc-card.rare-SR')
    };
  });
  check('6-1 過去の結果もs-result（同じ画面）に出る', past.on);
  check('6-2 専用の表組み(.rtab)は廃止', !past.table);
  check('6-3 専用の見出し・専用レイアウトも廃止', !past.head && !past.right);
  check(`6-4 テスト後と同じカードのグリッドで出る (${past.cards}枚)`, past.cards === 12);
  check('6-5 レア度の見え方もテスト後と同じ', past.rare);
  check(`6-6 ランクメダルもテスト後と同じ (${past.rank})`, past.medal && past.rank === 'B');
  check(`6-7 点数はすぐ出す（動かさない） (${past.score})`, past.score === '75');
  check(`6-8 XP・PWRのメーターも同じ2本 (${past.meters}本)`, past.meters === 2);
  check(`6-9 その回でもらったXPが出ている (${(past.xpGain || '').trim()})`, /\+75/.test(past.xpGain || ''));
  check(`6-10 下のボタンもテスト後と同じ4つ (${past.btns.join(',')})`, past.btns.join(',') === '応援する,シェアする,もう一度,ホーム');
  check(`6-11 一言の場所には、その回の日時を出す (${past.cheer})`, /\d{4}\/\d{2}\/\d{2} \d{2}:\d{2} の結果/.test(past.cheer));

  check('コンソールエラーなし', errors.length === 0, errors.join(' | '));
  await browser.close();
  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length}/${results.length} PASS`);
  if (ng.length) { console.log('FAILED: ' + ng.map(r => r.name).join(' / ')); process.exit(1); }
})();
