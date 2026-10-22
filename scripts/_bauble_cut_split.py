"""Cut the generated sheets into single vinyl designs.

Writes for every design:
  preview/bauble-cut/bauble-cut-NN.png  black on white, for Silhouette tracing
  preview/bauble-motif-NN.webp          square thumbnail for the picker
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SRC = Path(r"C:\Users\79528\.cursor\projects\c-vigsharm-shop\assets")
ROOT = Path(r"C:\vigsharm-shop\preview")
CUT = ROOT / "bauble-cut"

SHEETS = ["bauble-cut-sheet-%d.jpg" % i for i in range(1, 5)]
SINGLES = {
    "01": "bauble-cut-01.jpg", "03": "bauble-cut-03.jpg", "08": "bauble-cut-08.jpg",
    "09": "bauble-cut-09.jpg", "10": "bauble-cut-10.jpg", "11": "bauble-cut-11b.jpg",
    "12": "bauble-cut-12.jpg", "13": "bauble-cut-13.jpg", "14": "bauble-cut-14.jpg",
    "16": "bauble-cut-16.jpg", "17": "bauble-cut-17.jpg", "18": "bauble-cut-18.jpg",
    "19": "bauble-cut-19.jpg",
}

CUT_SIDE = 1600
THUMB_SIDE = 320


def ink_of(gray):
    return gray < 128


def split_sheet(path):
    g = np.array(Image.open(path).convert("L"))
    ink = ink_of(g)
    h, w = ink.shape
    cols = ink.sum(axis=0)
    cuts = [0]
    for k in range(1, 5):
        lo, hi = int(w * k / 5 - w * 0.07), int(w * k / 5 + w * 0.07)
        best, run, start = None, 0, None
        for x in range(lo, hi):
            if cols[x] == 0:
                if run == 0:
                    start = x
                run += 1
                if best is None or run > best[0]:
                    best = (run, start)
            else:
                run = 0
        if best is None:
            x = lo + int(np.argmin(cols[lo:hi]))
        else:
            x = best[1] + best[0] // 2
        cuts.append(x)
    cuts.append(w)
    return [g[:, cuts[i]:cuts[i + 1]] for i in range(5)]


def tidy(gray, side, pad):
    """Crop to ink, upscale smoothly, re-threshold to crisp black and white."""
    ink = ink_of(gray)
    ys, xs = np.where(ink)
    g = gray[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    im = Image.fromarray(g)
    inner = side - 2 * pad
    scale = inner / max(im.size)
    big = im.resize((max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))), Image.Resampling.LANCZOS)
    big = big.filter(ImageFilter.GaussianBlur(radius=max(0.6, scale * 0.35)))
    bw = big.point(lambda v: 0 if v < 128 else 255)
    out = Image.new("L", (side, side), 255)
    out.paste(bw, ((side - bw.size[0]) // 2, (side - bw.size[1]) // 2))
    return out


def main():
    CUT.mkdir(exist_ok=True)
    designs = {}
    n = 0
    for sheet in SHEETS:
        for part in split_sheet(SRC / sheet):
            n += 1
            designs["%02d" % n] = part
    for mid, name in SINGLES.items():
        designs[mid] = np.array(Image.open(SRC / name).convert("L"))
    for mid in sorted(designs):
        g = designs[mid]
        cut = tidy(g, CUT_SIDE, 80)
        cut.save(CUT / ("bauble-cut-%s.png" % mid), optimize=True)
        thumb = cut.resize((THUMB_SIDE, THUMB_SIDE), Image.Resampling.LANCZOS).convert("RGB")
        dest = ROOT / ("bauble-motif-%s.webp" % mid)
        thumb.save(dest, "WEBP", quality=82, method=6)
        print(mid, dest.stat().st_size)


if __name__ == "__main__":
    main()
