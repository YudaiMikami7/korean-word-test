/* ことばの友だち（育成パートナー）のAI画像生成プロンプトを、全パターンぶん機械的に書き出す。
   実行: node tools/gen_pet_prompts.js （リポジトリルートで）
   データ源: index.html の PET_SPECIES / PET_STAGES / PET_ITEMS
   出力  : docs/pet-image-prompts.json（種類×段階＝本番用／表情・季節＝差分用）

   使い方の流れ:
     1) このスクリプトでプロンプトを出す
     2) ChatGPT のプロジェクト「アプリ画像生成」内の新規チャットで生成（人物は不可・マスコットなのでOK）
     3) 透過が市松柄ベイクになっていたら _sandbox/word_dechecker.py と同じ手順で真の透過へ
     4) pet/{種類}/{段階}.webp として置く（置いた瞬間から絵文字より優先して表示される） */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

/* ---------- index.html から定数を取り出す ---------- */
const SRC = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
function pick(name) {
  const m = SRC.match(new RegExp("const " + name + "=(\\[[\\s\\S]*?\\n\\]);"));
  if (!m) throw new Error(name + " not found in index.html");
  return eval(m[1]);
}
const SPECIES = pick("PET_SPECIES");
const BASE_SP = eval("(" + ((SRC.match(/const PET_AXIS_SP=(\{[^}]*\});/) || [])[1] || "{}") + ")");   // 基本の8匹
const STAGES = pick("PET_STAGES");
const ITEMS = pick("PET_ITEMS");
const GROW = STAGES.map(x => x.lv);   // 見た目の5段階が上がるレベル

/* ---------- 共通の作法（シリーズ全体で絵柄をそろえるための固定句） ---------- */
const STYLE = [
  "flat vector illustration",
  "thick clean outline",
  "soft pastel palette",
  "front view, full body, centered",
  "transparent background",
  "no text, no watermark, no logo",
  "square 1:1",
  "consistent character design across the series"
].join(", ");

/* 種類の見た目メモ（プロンプトの主語）。ja は index.html 側の説明と合わせる */
const LOOK = {
  mong: "a round friendly puppy with cream fur and floppy ears",
  yaong: "a round grey tabby kitten with big eyes",
  kkomi: "a round white rabbit with long soft ears",
  ppyong: "a round yellow chick with a tiny orange beak",
  gomdol: "a chubby brown bear cub",
  dungsil: "a chubby panda cub",
  yeoubi: "a slim orange fox kit with a fluffy tail",
  byeol: "a small living star spirit with a glowing body",
  yongi: "a small friendly baby dragon with tiny wings",
  dokkae: "a small friendly Korean dokkaebi goblin with one little horn"
};
/* 見た目の5段階（メール指示 2026-08-29）。1段階目は絵文字のままなので画像は作らない */
const GROW_LOOK = [
  "", // 1段階目＝絵文字のまま（生成しない）
  "as a tiny baby version, oversized round head, sitting, very simple silhouette",
  "as a small child version, standing on two legs, cheerful, slightly more detail",
  "as a grown-up version, standing confidently, a little taller and slimmer",
  "as a fully grown version with a soft warm aura and small decorative ornaments"
];
/* 進化段階の言い換え */
const STAGE_LOOK = {
  egg: "as a smooth pastel egg with a small pattern hinting at the creature inside, no limbs",
  baby: "as a tiny newborn baby version, oversized head, sitting",
  kid: "as a small child version, standing, cheerful",
  teen: "as a slender teen version, standing confidently",
  adult: "as a fully grown adult version, calm and dependable, slightly larger",
  myth: "as a legendary version with a soft golden aura and small decorative ornaments"
};
/* 差分の軸（指示に挙がっていたもの） */
const VARIANTS = [
  { k: "normal", t: "通常", p: "neutral happy expression, idle pose" },
  { k: "sleep", t: "寝ている", p: "sleeping peacefully, closed eyes, small ZZZ" },
  { k: "happy", t: "喜んでいる", p: "very happy, jumping with joy, sparkles around" },
  { k: "sad", t: "悲しい", p: "sad expression, drooping ears, a single small tear" },
  { k: "evolve", t: "進化", p: "glowing brightly during evolution, light beams from below" },
  { k: "hat", t: "帽子装備", p: "wearing a cute cap" },
  { k: "winter", t: "冬", p: "wearing a knitted winter scarf and mittens, snow falling" },
  { k: "summer", t: "夏", p: "wearing summer clothes, holding a small hand fan" },
  { k: "halloween", t: "ハロウィン", p: "wearing a small pumpkin costume, halloween mood" },
  { k: "christmas", t: "クリスマス", p: "wearing a santa hat, holding a tiny gift box" },
  { k: "sakura", t: "桜", p: "wearing a cherry blossom crown, petals floating" },
  { k: "raincoat", t: "レインコート", p: "wearing a yellow raincoat and rain boots, holding an umbrella" }
];
/* 背景・家具・住んでいる家（キャラとは別に、背景差分として作る） */
const SCENES = [
  { k: "bg_hanok", t: "韓屋（ハノク）", p: "a cozy Korean hanok courtyard, wooden pillars, tiled roof" },
  { k: "bg_school", t: "がっこう", p: "a bright school classroom window in spring" },
  { k: "bg_sea", t: "うみ", p: "a calm summer beach with soft waves" },
  { k: "bg_night", t: "よぞら", p: "a starry night sky over a quiet town" },
  { k: "bg_sakura", t: "さくら", p: "a cherry blossom path in full bloom" },
  { k: "bg_snow", t: "ゆき", p: "a snowy park, soft falling snow" },
  { k: "fur_house", t: "おうち", p: "a tiny cozy house interior for a small creature, warm light" },
  { k: "fur_bed", t: "ベッド", p: "a small pastel bed with a soft blanket" },
  { k: "fur_shelf", t: "ほんだな", p: "a small bookshelf filled with Korean language books" },
  { k: "fur_plant", t: "うえき", p: "a small potted plant on a wooden floor" }
];

function line(parts) { return parts.filter(Boolean).join(", "); }

/* ---------- ①本番用：種類 × 進化段階（pet/{種類}/{段階}.webp） ---------- */
const main = [];
SPECIES.forEach(s => {
  STAGES.forEach(st => {
    main.push({
      file: "pet/" + s.k + "/" + st.k + ".webp",
      species: s.k, name: s.name, stage: st.k, stageName: st.name,
      prompt: line([
        "Cute mascot character sticker",
        LOOK[s.k] || s.ja,
        STAGE_LOOK[st.k],
        "neutral happy expression",
        STYLE
      ])
    });
  });
});

/* ---------- ①-b 本番用：基本8匹 × 見た目の5段階（pet/{種類}/g{段階}.webp）
      1段階目は絵文字をそのまま使うので、作るのは2段階目以降（メール指示 2026-08-29） ---------- */
const grow = [];
Object.keys(BASE_SP).forEach(axis => {
  const k = BASE_SP[axis];
  const s = SPECIES.find(x => x.k === k);
  if (!s) return;
  GROW_LOOK.forEach((look, i) => {
    if (!look) return;
    grow.push({
      file: "pet/" + k + "/g" + (i + 1) + ".webp",
      species: k, name: s.name, step: i + 1, fromLevel: GROW[i],
      emoji: s.ico[1],
      prompt: line([
        "Cute mascot character sticker",
        LOOK[k] || s.ja,
        look,
        "keep the same character identity and colors across all five growth steps",
        "neutral happy expression",
        STYLE
      ])
    });
  });
});

/* ---------- ②差分用：種類 × 表情/季節（Phase3で使う） ---------- */
const variants = [];
SPECIES.forEach(s => {
  VARIANTS.forEach(v => {
    variants.push({
      file: "pet/" + s.k + "/var_" + v.k + ".webp",
      species: s.k, variant: v.k, variantName: v.t,
      prompt: line([
        "Cute mascot character sticker",
        LOOK[s.k] || s.ja,
        "as a small child version",
        v.p,
        STYLE
      ])
    });
  });
});

/* ---------- ③背景・家具・住んでいる家 ---------- */
const scenes = SCENES.map(sc => ({
  file: "pet/scene/" + sc.k + ".webp",
  key: sc.k, name: sc.t,
  prompt: line([
    "Background illustration for a cute pet raising game",
    sc.p,
    "flat vector illustration, soft pastel palette, no characters, no text, no watermark, square 1:1"
  ])
}));

/* ---------- ④装備アイコン（きせかえの一覧で使う小さい絵） ---------- */
const items = ITEMS.map(i => ({
  file: "pet/item/" + i.k + ".webp",
  key: i.k, slot: i.slot, name: i.t,
  prompt: line([
    "Single cute game item icon",
    i.t + " (" + i.ko + ")",
    "flat vector illustration, thick clean outline, soft pastel palette, centered, transparent background, no text, square 1:1"
  ])
}));

const out = {
  generatedFrom: "index.html (PET_SPECIES / PET_STAGES / PET_ITEMS / PET_AXIS_SP / PET_GROW)",
  style: STYLE,
  note: "透過が市松柄ベイクになっていたら _sandbox/word_dechecker.py と同じ手順で真の透過へ変換してから置くこと",
  counts: { main: main.length, grow: grow.length, variants: variants.length, scenes: scenes.length, items: items.length },
  main, grow, variants, scenes, items
};
const dest = path.join(ROOT, "docs", "pet-image-prompts.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2), "utf8");
console.log("wrote " + path.relative(ROOT, dest));
console.log("  本番（種類×段階）: " + main.length + " 枚");
console.log("  育ち（基本8匹×2〜5段階）: " + grow.length + " 枚");
console.log("  差分（表情・季節）: " + variants.length + " 枚");
console.log("  背景・家具       : " + scenes.length + " 枚");
console.log("  装備アイコン     : " + items.length + " 枚");
