/* ことばの友だちの「見た目の5段階」の画像を作る（メール指示 2026-08-29）
   実行: node tools/gen_pet_images.js [段階(既定 "2,3")]
   ・1段階目は絵文字をそのまま使うので作らない。まずは2段階目・3段階目だけ作る
   ・プロンプトは tools/gen_pet_prompts.js が書き出した docs/pet-image-prompts.json の grow を使う
   ・生成は ChatGPT のプロジェクト「アプリ画像生成」内の新規チャット（_sandbox/word_gen.js と同じ手順・同じトンマナ）
   ・保存直後に word_dechecker.py で真の透過にし、webp へ変換して pet/{種類}/g{段階}.webp に置く
   ・すでにあるファイルは飛ばすので、途中で止めても何度でも再実行できる */
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PROFILE = "C:/Users/myuda/chrome_pw_chatgpt_save";
const REF_IMAGE = path.join(ROOT, "ROOM01.png");
const DECHECKER = "C:/Users/myuda/_sandbox/word_dechecker.py";
const PROJECT_NAME = "アプリ画像生成";
let PROJECT_URL = "https://chatgpt.com/g/g-p-6a24e2d451148191bfbf964e46ed38b4-ahurihua-xiang-sheng-cheng/project";

const STEPS = (process.argv[2] || "2,3").split(",").map(n => parseInt(n, 10));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadJobs() {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "pet-image-prompts.json"), "utf8"));
  return (j.grow || []).filter(g => STEPS.includes(g.step));
}

async function getLargeImages(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll("img")).filter(img => {
    const src = img.src || "";
    if (img.naturalWidth < 700 || img.naturalHeight < 700) return false;
    if (!src.startsWith("http") && !src.startsWith("blob:")) return false;
    return !(src.includes(".svg") || src.includes("avatar") || src.includes("icon") || src.includes("logo"));
  }).map(img => img.src));
}

async function downloadImage(page, src, outPath) {
  if (src.startsWith("blob:")) {
    const b64 = await page.evaluate(async u => {
      const buf = await (await fetch(u)).arrayBuffer();
      let bin = ""; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      return btoa(bin);
    }, src);
    fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
  } else {
    const resp = await page.request.get(src);
    if (!resp.ok()) throw new Error("download status=" + resp.status());
    fs.writeFileSync(outPath, await resp.body());
  }
}

async function generateOne(page, prompt, pngPath) {
  await page.goto(PROJECT_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(4000);
  await page.locator('input[type="file"]').first().setInputFiles(REF_IMAGE);
  await sleep(8000);
  try {
    const dismiss = page.locator('button[aria-label="閉じる"], button[aria-label="Dismiss"], button[aria-label="Close"]').first();
    if (await dismiss.isVisible({ timeout: 1500 }).catch(() => false)) await dismiss.click({ timeout: 3000 }).catch(() => {});
  } catch (e) {}
  const composer = page.locator("#prompt-textarea");
  await composer.waitFor({ state: "visible", timeout: 30000 });
  await composer.click({ timeout: 8000 })
    .catch(() => composer.click({ force: true, timeout: 5000 }))
    .catch(() => composer.focus());
  await page.keyboard.type(prompt, { delay: 2 });
  await sleep(1500);
  const baseline = new Set(await getLargeImages(page));
  await page.keyboard.press("Enter");
  await sleep(10000);
  for (const s of await getLargeImages(page)) baseline.add(s);
  let src = null;
  for (let i = 0; i < 300; i++) {
    await sleep(3000);
    try {
      const fresh = (await getLargeImages(page)).filter(s => !baseline.has(s));
      if (fresh.length) {
        await sleep(45000); // 生成途中のぼやけプレビューを掴まないよう待つ
        const fresh2 = (await getLargeImages(page)).filter(s => !baseline.has(s));
        src = (fresh2.length ? fresh2 : fresh).pop();
        break;
      }
    } catch (e) {}
    if (i % 5 === 4) {
      const failed = await page.evaluate(() => {
        const t = (document.querySelector("main") || document.body).innerText;
        return t.includes("画像を生成できませんでした") || t.includes("couldn't create") || t.includes("wasn't able to generate");
      }).catch(() => false);
      if (failed) break;
    }
  }
  if (!src) throw new Error("image timeout");
  await downloadImage(page, src, pngPath);
  try {
    execFileSync("python", [DECHECKER, pngPath], { env: { ...process.env, PYTHONIOENCODING: "utf-8" }, timeout: 120000 });
  } catch (e) { console.log("WARN dechecker failed: " + path.basename(pngPath)); }
}

/* 512角の透過webpにそろえて置く（アプリ側は pet/{種類}/g{段階}.webp を見ている） */
function toWebp(pngPath, webpPath) {
  const py = "from PIL import Image\n"
    + "im = Image.open(r'" + pngPath + "').convert('RGBA')\n"
    + "im.thumbnail((512, 512), Image.LANCZOS)\n"
    + "c = Image.new('RGBA', (512, 512), (0, 0, 0, 0))\n"
    + "c.paste(im, ((512 - im.width) // 2, (512 - im.height) // 2))\n"
    + "c.save(r'" + webpPath + "', 'WEBP', quality=88, method=6)\n";
  execFileSync("python", ["-c", py], { env: { ...process.env, PYTHONIOENCODING: "utf-8" }, timeout: 120000 });
}

(async () => {
  const jobs = loadJobs();
  const todo = jobs.filter(g => !fs.existsSync(path.join(ROOT, g.file)));
  console.log("対象 " + jobs.length + " 枚 / まだ無いもの " + todo.length + " 枚");
  if (!todo.length) return;
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false, viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"]
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  const tmp = path.join(ROOT, "_regen", "tmp_pet_grow");
  fs.mkdirSync(tmp, { recursive: true });
  let ok = 0, ng = 0;
  for (const g of todo) {
    const webp = path.join(ROOT, g.file);
    const png = path.join(tmp, g.species + "_g" + g.step + ".png");
    fs.mkdirSync(path.dirname(webp), { recursive: true });
    process.stdout.write(g.species + " g" + g.step + " ... ");
    let done = false;
    for (let try_ = 1; try_ <= 2 && !done; try_++) {   // 1度きりの取りこぼしがあるので2回までやり直す
      try {
        await generateOne(page, g.prompt, png);
        toWebp(png, webp);
        done = true; ok++; console.log("OK (" + Math.round(fs.statSync(webp).size / 1024) + "KB)");
      } catch (e) {
        if (try_ === 2) { ng++; console.log("NG " + e.message); }
        else { process.stdout.write("retry(" + e.message + ") ... "); await sleep(5000); }
      }
    }
    await sleep(4000);
  }
  console.log("できた " + ok + " 枚 / できなかった " + ng + " 枚");
  await ctx.close();
})();
