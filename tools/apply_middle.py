"""中級の単語画像(images-middle/NNNN_単語.png)を本番形式へ取り込む。

使い方:  python tools/apply_middle.py [--dry]
  images-middle/NNNN_単語.png を余白を切り詰めて 240x240 の透過webpにし、
  images-thumb/(2000+NNNN).webp として保存する（初級は 0001〜1671 なので番号が衝突しない。
  index.html の WORD_IMG_BOX 参照は src 末尾の数字をキーにするため、接頭辞ではなく数字でずらす）。
  併せて words-images.js の WORD_IMG に 単語→パス を追記する（初級と同じ単語は初級の絵を優先）。
  取り込み前に apply_regen.py と同じ検査を通し、不合格は取り込まずに報告する。
  取り込み後は tools/check_images.py と tools/gen_imgbox.py を回すこと。
"""
import os, re, sys, json, hashlib, collections
from PIL import Image, ImageFilter, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "images-middle")
DST = os.path.join(ROOT, "images-thumb")
WI = os.path.join(ROOT, "words-images.js")
OFFSET = 2000
SIZE = 240
DRY = "--dry" in sys.argv


def check(im):
    rgba = im.convert("RGBA")
    a = rgba.split()[3]
    alpha_mean = ImageStat.Stat(a).mean[0]
    sharp = ImageStat.Stat(rgba.convert("L").filter(ImageFilter.FIND_EDGES)).stddev[0]
    w, h = rgba.size
    corners = [a.getpixel((1, 1)), a.getpixel((w - 2, 1)), a.getpixel((1, h - 2)), a.getpixel((w - 2, h - 2))]
    m = dict(alpha_mean=round(alpha_mean, 1), sharp=round(sharp, 2), corners=corners)
    if max(corners) > 16:
        return False, "背景が透過されていない（四隅が不透明）", m
    if alpha_mean > 200:
        return False, "画面全体が不透明（もや/背景が残っている）", m
    if sharp < 30:
        return False, "ぼやけている（生成途中の可能性）", m
    if rgba.getbbox() is None:
        return False, "中身が空", m
    return True, "", m


def main():
    files = sorted(f for f in os.listdir(SRC) if re.match(r"^\d{4}_.+\.png$", f))
    h = collections.defaultdict(list)
    for f in files:
        h[hashlib.sha256(open(os.path.join(SRC, f), "rb").read()).hexdigest()].append(f)
    dup = {f for v in h.values() if len(v) > 1 for f in v}
    if dup:
        print("!! 同じ画像が複数の単語に割り当てられています（取り込みません）")
        for v in h.values():
            if len(v) > 1:
                print("   ", ", ".join(v))

    src_js = open(WI, encoding="utf-8").read()
    m = re.match(r"const WORD_IMG=(\{.*\});", src_js, re.S)
    word_img = json.loads(m.group(1))
    base = dict(word_img)  # 初級ぶん（最優先）

    ok = ng = skip = 0
    added = {}
    ng_list = []
    for f in files:
        num, ko = re.match(r"^(\d{4})_(.+)\.png$", f).groups()
        if f in dup:
            print(f"NG   {f}  他の単語と同じ画像"); ng += 1; ng_list.append(f); continue
        out_num = f"{OFFSET + int(num):04d}"
        dst = os.path.join(DST, out_num + ".webp")
        im = Image.open(os.path.join(SRC, f)).convert("RGBA")
        bbox = im.getbbox()
        if bbox:
            im = im.crop(bbox)
        side = max(im.size)
        pad = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        pad.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
        out = pad.resize((SIZE, SIZE), Image.LANCZOS)
        good, why, met = check(out)
        if not good:
            print(f"NG   {f}  {why}  {met}"); ng += 1; ng_list.append(f); continue
        if not DRY:
            out.save(dst, "WEBP", quality=86, method=6)
        if ko in base:
            skip += 1  # 初級と同じ単語: 絵は保存するが WORD_IMG は初級を優先
        else:
            added[ko] = f"images-thumb/{out_num}.webp"
        ok += 1
    if not DRY:
        word_img = dict(base); word_img.update(added)
        open(WI, "w", encoding="utf-8").write("const WORD_IMG=" + json.dumps(word_img, ensure_ascii=False, separators=(",", ":")) + ";\n")
        json.dump(ng_list, open(os.path.join(ROOT, "_middle_ng.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n取り込み {ok} 件（うち初級と同語で WORD_IMG 未追記 {skip} 件）/ 不合格 {ng} 件 / WORD_IMG 追記 {len(added)} 件 / 合計 {len(base)+len(added)} 語" + ("  (--dry)" if DRY else ""))


if __name__ == "__main__":
    main()
