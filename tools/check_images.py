"""単語画像(images-thumb)の破綻を検出する。

使い方:  python tools/check_images.py [--sheet]
  生成パイプラインは「生成途中のぼやけ画像を掴む」「透過に失敗して背景が焼き込まれる」ことがあるため、
  画像を追加・再生成したら必ずこれを回して混入を防ぐ。--sheet を付けると疑わしい画像の一覧PNGを出力する。

判定の決め手は alpha_mean（透明度の平均）。正常な切り抜きは 32〜140 程度に収まり、
背景が残っている画像は 200 超になる。ぼやけは FIND_EDGES の標準偏差(sharp)で拾う。
"""
import os, re, sys, json
from PIL import Image, ImageFilter, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "images-thumb")
ALPHA_MAX = 200   # これ以上は背景が抜けていない
SHARP_MIN = 38    # これ未満はぼやけ
CORNER_MAX = 16   # 四隅が不透明なら背景が残っている


def word_map():
    p = os.path.join(ROOT, "words-images.js")
    if not os.path.exists(p):
        return {}
    src = open(p, encoding="utf-8").read()
    return {m.group(2) + ".webp": m.group(1)
            for m in re.finditer(r'"([^"]+)":"images-thumb/(\d+)\.webp"', src)}


def main():
    ko = word_map()
    bad = []
    files = sorted(f for f in os.listdir(DIR) if f.endswith(".webp"))
    for f in files:
        p = os.path.join(DIR, f)
        try:
            im = Image.open(p).convert("RGBA")
        except Exception as e:
            bad.append((f, ko.get(f, "?"), "開けない: " + str(e), {}))
            continue
        a = im.split()[3]
        w, h = im.size
        corners = [a.getpixel((1, 1)), a.getpixel((w - 2, 1)), a.getpixel((1, h - 2)), a.getpixel((w - 2, h - 2))]
        alpha_mean = ImageStat.Stat(a).mean[0]
        sharp = ImageStat.Stat(im.convert("L").filter(ImageFilter.FIND_EDGES)).stddev[0]
        m = dict(alpha_mean=round(alpha_mean, 1), sharp=round(sharp, 2), corners=corners)
        why = None
        if max(corners) > CORNER_MAX:
            why = "背景が透過されていない（四隅が不透明）"
        elif alpha_mean > ALPHA_MAX:
            why = "画面全体が不透明（もや/背景が残っている）"
        elif sharp < SHARP_MIN:
            why = "ぼやけている（生成途中の可能性）"
        if why:
            bad.append((f, ko.get(f, "?"), why, m))

    print(f"検査 {len(files)} 枚 / 要再生成 {len(bad)} 枚")
    for f, k, why, m in bad:
        print(f"  {f[:-5]}  {k:<10} {why}  {m}")
    if bad:
        json.dump([{"file": f, "ko": k, "why": why} for f, k, why, _ in bad],
                  open(os.path.join(ROOT, "_regen_targets.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print("\n対象を _regen_targets.json に書き出しました")
    if "--sheet" in sys.argv and bad:
        from PIL import ImageDraw
        C, S = 8, 150
        R = (len(bad) + C - 1) // C
        sheet = Image.new("RGB", (C * S, R * (S + 20)), (250, 250, 250))
        dr = ImageDraw.Draw(sheet)
        for i, (f, k, _, _) in enumerate(bad):
            im = Image.open(os.path.join(DIR, f)).convert("RGBA").resize((S, S))
            bg = Image.new("RGBA", (S, S), (255, 255, 255, 255)); bg.alpha_composite(im)
            x, y = (i % C) * S, (i // C) * (S + 20)
            sheet.paste(bg.convert("RGB"), (x, y))
            dr.text((x + 3, y + S + 4), f"{f[:-5]} {k}", fill=(20, 20, 20))
        out = os.path.join(ROOT, "_regen_sheet.png")
        sheet.save(out)
        print("一覧を書き出しました:", out)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
