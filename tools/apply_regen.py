"""再生成した単語画像を本番形式(images-thumb/NNNN.webp 240x240 透過)へ取り込む。

使い方:  python tools/apply_regen.py [--dry]
  _regen/NNNN.png を読み、余白を切り詰めて 240x240 の透過webpにして images-thumb/ を差し替える。
  取り込み前に「本当に透過されているか・ぼやけていないか」を検査し、不合格は取り込まずに報告する。
"""
import os, sys, shutil, hashlib, collections
from PIL import Image, ImageFilter, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_regen")
DST = os.path.join(ROOT, "images-thumb")
BAK = os.path.join(ROOT, "_regen", "_replaced")
SIZE = 240
DRY = "--dry" in sys.argv
# 追加の取り込み元（後から作り直したぶんが優先される）
EXTRA = [d for d in (os.path.join(ROOT, "_regen2"),) if os.path.isdir(d)]


def check(im):
    """破綻画像の検査。戻り値 (ok, 理由, 指標)"""
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
    if not os.path.isdir(SRC):
        print("_regen がありません"); return
    os.makedirs(BAK, exist_ok=True)
    # 同じ番号が複数の取り込み元にあれば、後ろのディレクトリ（作り直したぶん）を優先する
    srcmap = {}
    for d in [SRC] + EXTRA:
        for f in os.listdir(d):
            if f.lower().endswith(".png") and f[:-4].isdigit():
                srcmap[f[:-4]] = os.path.join(d, f)
    files = sorted(os.path.basename(p) for p in srcmap.values())

    # 生成の取り違え（同じ絵が複数の単語に割り当てられる）を検出する
    h = collections.defaultdict(list)
    for num, p in srcmap.items():
        h[hashlib.sha256(open(p, "rb").read()).hexdigest()].append(num)
    dups = {k: sorted(v) for k, v in h.items() if len(v) > 1}
    dup_nums = set()
    if dups:
        print("!! 同じ画像が複数の単語に割り当てられています（取り込みません）")
        for v in dups.values():
            print("   ", ", ".join(v))
            dup_nums.update(v)
        print()

    ok = ng = 0
    for num in sorted(srcmap):
        src = srcmap[num]
        if num in dup_nums:
            print(f"NG   {num}  他の単語と同じ画像（作り直しが必要）")
            ng += 1
            continue
        im = Image.open(src).convert("RGBA")
        f = os.path.basename(src)
        bbox = im.getbbox()
        if bbox:
            im = im.crop(bbox)
        # 正方形の余白を足してから縮小（縦横比を保つ）
        side = max(im.size)
        pad = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        pad.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
        out = pad.resize((SIZE, SIZE), Image.LANCZOS)
        good, why, m = check(out)
        dst = os.path.join(DST, num + ".webp")
        if not good:
            print(f"NG   {num}  {why}  {m}")
            ng += 1
            continue
        if not DRY:
            if os.path.exists(dst):
                shutil.copy2(dst, os.path.join(BAK, num + ".old.webp"))
            out.save(dst, "WEBP", quality=86, method=6)
        print(f"OK   {num}  {m}  -> {os.path.relpath(dst, ROOT)}")
        ok += 1
    print(f"\n取り込み {ok} 件 / 不合格 {ng} 件" + ("  (--dry のため書き込みなし)" if DRY else ""))


if __name__ == "__main__":
    main()
