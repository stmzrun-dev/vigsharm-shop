"""Place each vinyl motif on the clean bauble photos."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"C:\vigsharm-shop\preview")
COLORS = ["red", "pink", "purple", "blue", "sky", "gold"]
# Smaller than 0.72 so wide scenes stay off the silhouette.
FACE = 0.65


def sphere_of(path):
    im0 = np.array(Image.open(path).convert("RGB"))
    small = np.array(Image.fromarray(im0).resize((400, 400), Image.Resampling.BOX)).astype(np.int16)
    h, w, _ = small.shape
    r, g, b = small[:, :, 0], small[:, :, 1], small[:, :, 2]
    ban = ((r > 205) & (g > 205) & (b > 205)) | ((g + 18 >= r) & (g + 18 >= b) & (r < 115) & (b < 140))
    vis = np.zeros((h, w), np.uint8)
    y0, x0 = int(h * 0.62), int(w * 0.50)
    if ban[y0, x0]:
        for dy in range(0, 50):
            if not ban[y0 + dy, x0]:
                y0 = y0 + dy
                break
    stack = [(y0, x0)]
    vis[y0, x0] = 1
    tol = 24
    while stack:
        y, x = stack.pop()
        c = small[y, x]
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if ny < 0 or nx < 0 or ny >= h or nx >= w or vis[ny, nx] or ban[ny, nx]:
                continue
            d = small[ny, nx]
            if abs(int(d[0] - c[0])) + abs(int(d[1] - c[1])) + abs(int(d[2] - c[2])) <= tol:
                vis[ny, nx] = 1
                stack.append((ny, nx))
    ys, xs = np.where(vis)
    scale = im0.shape[0] / 400.0
    cx = (xs.min() + xs.max()) / 2 * scale
    cy = (ys.min() + ys.max()) / 2 * scale
    rad = ((xs.max() - xs.min()) + (ys.max() - ys.min())) / 4 * scale
    return im0, float(cx), float(cy), float(rad)


def motif_geom(path):
    g = np.array(Image.open(path).convert("L"))
    ink = g < 128
    ys, xs = np.where(ink)
    cx = (xs.min() + xs.max()) / 2.0
    cy = (ys.min() + ys.max()) / 2.0
    rad = float(np.hypot(xs - cx, ys - cy).max()) * 1.02
    return ink.astype(np.float32), cx, cy, rad


def sample_soft(mask, xs, ys):
    h, w = mask.shape
    x0 = np.floor(xs).astype(np.int32)
    y0 = np.floor(ys).astype(np.int32)
    x1 = x0 + 1
    y1 = y0 + 1
    fx = xs - x0
    fy = ys - y0
    x0 = np.clip(x0, 0, w - 1)
    x1 = np.clip(x1, 0, w - 1)
    y0 = np.clip(y0, 0, h - 1)
    y1 = np.clip(y1, 0, h - 1)
    return (
        mask[y0, x0] * (1 - fx) * (1 - fy)
        + mask[y0, x1] * fx * (1 - fy)
        + mask[y1, x0] * (1 - fx) * fy
        + mask[y1, x1] * fx * fy
    )


def paint(base, cx, cy, rad, motif, mcx, mcy, mrad):
    soft = (
        motif
        + np.roll(motif, 1, 0) + np.roll(motif, -1, 0)
        + np.roll(motif, 1, 1) + np.roll(motif, -1, 1)
    ) / 5.0
    h, w, _ = base.shape
    yy, xx = np.ogrid[0:h, 0:w]
    dx = (xx - cx) / (rad * FACE)
    dy = (yy - cy) / (rad * FACE)
    screen = np.sqrt(dx * dx + dy * dy)
    alpha = float(np.arcsin(min(FACE, 0.92)))
    theta = np.arcsin(np.clip(screen, 0, 1) * np.sin(alpha))
    design = theta / alpha
    on_face = screen <= 1.0
    src_r = design * mrad
    ang = np.arctan2(dy, dx)
    src_x = mcx + np.cos(ang) * src_r
    src_y = mcy + np.sin(ang) * src_r
    ink = np.where(on_face, sample_soft(soft, src_x, src_y), 0.0)
    alpha_px = np.clip((ink - 0.18) / 0.82, 0, 1)
    out = base.astype(np.float32)
    lum = 0.22 * out[:, :, 0] + 0.62 * out[:, :, 1] + 0.16 * out[:, :, 2]
    y0 = int(np.clip(cy - 8, 0, h - 1))
    y1 = int(np.clip(cy + 8, 0, h - 1))
    x0 = int(np.clip(cx - 8, 0, w - 1))
    x1 = int(np.clip(cx + 8, 0, w - 1))
    center = float(lum[y0:y1, x0:x1].mean()) + 1.0
    shade = np.clip(lum / center, 0.72, 1.18)
    white = np.stack([248.0 * shade, 246.0 * shade, 242.0 * shade], axis=2)
    a = alpha_px[:, :, None]
    out = out * (1 - a) + white * a
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB")


# White-bow gloss keeps the existing file name. Gold and match bows sit on the
# same framing, so they reuse that sphere: a bow the colour of the ball would
# otherwise flood-fill into the ornament.
VARIANTS = {
    "white": ("bauble-gloss-%s.webp", ""),
    "gold": ("bauble-gloss-%s-bow-gold.webp", "-gold"),
    "match": ("bauble-gloss-%s-bow-match.webp", "-match"),
    "matte": ("bauble-matte-%s.webp", "-matte"),
}


def bases():
    found = {}
    for color in COLORS:
        gloss = sphere_of(ROOT / ("bauble-gloss-%s.webp" % color))
        for variant, (pattern, _suffix) in VARIANTS.items():
            name = pattern % color
            if variant == "match" and color == "gold":
                name = "bauble-gloss-gold-bow-gold.webp"
            path = ROOT / name
            im = np.array(Image.open(path).convert("RGB"))
            if variant in ("gold", "match"):
                _im, cx, cy, rad = gloss
            else:
                _im, cx, cy, rad = sphere_of(path)
            found[(color, variant)] = (im, cx, cy, rad)
    return found


def main():
    only = sys.argv[1:]
    ready = bases()
    ids = ["%02d" % i for i in range(1, 21)]
    variants = list(VARIANTS)
    if only:
        jobs = []
        for item in only:
            color, mid, *rest = item.split("-")
            jobs.append((color, mid, rest[0] if rest else "white"))
    else:
        jobs = [(c, i, v) for c in COLORS for i in ids for v in variants]
    motifs = {}
    for _color, mid, _variant in jobs:
        if mid not in motifs:
            motifs[mid] = motif_geom(ROOT / "bauble-cut" / ("bauble-cut-%s.png" % mid))
    for color, mid, variant in jobs:
        im, cx, cy, rad = ready[(color, variant)]
        g, mcx, mcy, mrad = motifs[mid]
        pic = paint(im, cx, cy, rad, g, mcx, mcy, mrad)
        dest = ROOT / ("bauble-on-%s-%s%s.webp" % (color, mid, VARIANTS[variant][1]))
        pic.save(dest, "WEBP", quality=80, method=4)
        print("wrote", dest.name, dest.stat().st_size)


if __name__ == "__main__":
    main()
