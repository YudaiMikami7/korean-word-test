/* メール指示 2026-08-28: 初回ガイドの最後に出す「ホーム画面に追加」案内のスモークテスト
 * 使い方: node smoke.mail0828.test.js */
const { chromium } = require('playwright');
const path = require('path');
const R=[];const check=(n,c)=>{R.push({n,ok:!!c});console.log((c?'PASS':'FAIL')+'  '+n);};
(async()=>{
  const browser=await chromium.launch();
  for(const ios of [true,false]){
    const ctx=await browser.newContext({viewport:{width:602,height:1178},hasTouch:true,
      userAgent: ios?'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1':undefined});
    const page=await ctx.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(require('url').pathToFileURL(path.resolve(__dirname,'index.html')).href);
    await page.waitForTimeout(1500);
    const tag=ios?'[iOS]':'[Android]';
    if(!ios)await page.evaluate(()=>{_bipEvt={prompt(){window.__promptCalled=true;}};});
    // ガイドを最初から流す
    await page.evaluate(()=>{localStorage.removeItem('kwt_coach_v1');localStorage.removeItem('kwt_a2hs_v1');showCoach();});
    await page.waitForTimeout(400);
    check(tag+' ガイド表示', await page.evaluate(()=>!!document.getElementById('coach')));
    for(let i=0;i<8;i++){await page.evaluate(()=>{const b=document.getElementById('coach-next');if(b)b.click();});await page.waitForTimeout(200);}
    check(tag+' ガイド終了', await page.evaluate(()=>!document.getElementById('coach')));
    check(tag+' 追加案内ポップアップ', await page.evaluate(()=>!!document.getElementById('a2hs')));
    check(tag+' 手順の絵あり', await page.evaluate(()=>{const f=document.querySelector('#a2hs .a2hs-fig');return f&&f.querySelectorAll('.a2hs-step').length>=2;}));
    check(tag+' 画面内に収まる', await page.evaluate(()=>{const c=document.querySelector('.a2hs-card');if(!c)return false;const r=c.getBoundingClientRect();return r.top>=0&&r.bottom<=window.innerHeight;}));
    if(ios){
      check(tag+' 「わかった」で閉じる', await page.evaluate(()=>{document.getElementById('a2hs-ok').click();return !document.getElementById('a2hs');}));
    }else{
      await page.evaluate(()=>document.getElementById('a2hs-go').click());
      check(tag+' 「追加する」で閉じる', await page.evaluate(()=>!document.getElementById('a2hs')));
      check(tag+' 追加プロンプト呼び出し', await page.evaluate(()=>!!window.__promptCalled));
    }
    // 2度目は出ない
    await page.evaluate(()=>{localStorage.removeItem('kwt_coach_v1');showCoach();});
    await page.waitForTimeout(300);
    for(let i=0;i<8;i++){await page.evaluate(()=>{const b=document.getElementById('coach-next');if(b)b.click();});await page.waitForTimeout(150);}
    check(tag+' 2回目は出ない', await page.evaluate(()=>!document.getElementById('a2hs')));
    check(tag+' コンソールエラー無し', errors.length===0); if(errors.length)console.log(errors);
    await ctx.close();
  }
  await browser.close();
  const f=R.filter(r=>!r.ok);console.log(`\n${R.length-f.length}/${R.length} passed`);process.exit(f.length?1:0);
})();
