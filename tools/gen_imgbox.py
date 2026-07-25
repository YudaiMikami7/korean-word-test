"""単語画像の「実際に絵が描かれている範囲」を事前計算して words-imgbox.js に書き出す。

使い方:  python tools/gen_imgbox.py
  画像ファイルはすべて240x240の正方形だが、被写体の形は縦長・横長とまちまちで、
  まわりの透明部分の量が画像ごとに違う。すごろくのマス番号・ランクを画像の角に付けるとき、
  ファイルの角ではなく「絵の角」に寄せないと、絵が横長の画像で番号とランクが離れて見えてしまう。
  そこでアルファチャンネルから被写体の外接矩形を求め、0〜100(%)で持たせる。
  images-thumb を作り直したら再実行すること。
"""
import os, json, re

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "images-thumb")
OUT = os.path.join(ROOT, "words-imgbox.js")
ALPHA = 24  # これ以上を「絵がある」とみなす


def main():
    box = {}
    files = sorted(f for f in os.listdir(DIR) if f.endswith(".webp"))
    for f in files:
        im = Image.open(os.path.join(DIR, f)).convert("RGBA")
        w, h = im.size
        bb = im.split()[3].point(lambda v: 255 if v >= ALPHA else 0).getbbox()
        if not bb:
            bb = (0, 0, w, h)
        x0, y0, x1, _y1 = bb
        # 左端・上端・右端を % で保持（下端は台座で必ず埋まるため持たない）
        box[f[:-5]] = [round(x0 * 100 / w), round(y0 * 100 / h), round(x1 * 100 / w)]
    with open(OUT, "w", encoding="utf-8") as fp:
        fp.write("/* 単語画像の被写体の外接矩形（左%,上%,右%）。tools/gen_imgbox.py で自動生成 */\n")
        fp.write("const WORD_IMG_BOX=" + json.dumps(box, separators=(",", ":")) + ";\n")
    print(f"{len(box)} 件 -> {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
