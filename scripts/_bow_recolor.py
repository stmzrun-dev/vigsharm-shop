# -*- coding: utf-8 -*-
"""Tint the photo-bauble bow on the white master shot (offline only).

Not used on the storefront — the card shows bauble-white / bauble-blue / bauble-photo
until real per-color photos exist. The satin mask is learned from |white − blue|.

Usage: python scripts/_bow_recolor.py <front-dir> <back-layer-dir> [color ...]
Front mockups → preview/ (or OUT). Back layers stay outside the site tree.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREVIEW = os.path.join(ROOT, 'preview')
OUT = sys.argv[1] if len(sys.argv) > 1 else PREVIEW
BACK_OUT = sys.argv[2] if len(sys.argv) > 2 else OUT
ONLY = sys.argv[3:]

# (ribbon rgb at mid tone, sheen 0..1)
TARGETS = {
    'gold': ((212, 172, 92), 0.45),
    'sky': ((150, 186, 232), 0.35),
    'silver': ((200, 203, 210), 0.55),
    'pink': ((238, 170, 192), 0.35),
    'peach': ((240, 196, 162), 0.35),
    'red': ((196, 26, 42), 0.5),
    'raspberry': ((176, 46, 104), 0.5),
    'wine': ((112, 24, 40), 0.55),
    'lilac': ((192, 162, 228), 0.35),
    'violet': ((118, 70, 172), 0.5),
    'navy': ((30, 56, 116), 0.55),
    'mint': ((150, 214, 194), 0.35),
    'green': ((26, 102, 70), 0.55),
    'black': ((34, 35, 40), 0.6),
}

BALL = (487, 600, 176)
PEARL = (481, 378, 34)
CAP = (450, 398, 515, 446)

_WHITE = None
_BLUE = None


def _masters():
    global _WHITE, _BLUE
    if _WHITE is None:
        _WHITE = np.array(Image.open(os.path.join(PREVIEW, 'bauble-white.webp')).convert('RGB'))
        _BLUE = np.array(Image.open(os.path.join(PREVIEW, 'bauble-blue.webp')).convert('RGB'))
    return _WHITE, _BLUE


def bow_mask(rgb, alpha):
    white, blue = _masters()
    diff = np.linalg.norm(rgb.astype(np.float32) - blue.astype(np.float32), axis=2)
    diff_w = np.linalg.norm(rgb.astype(np.float32) - white.astype(np.float32), axis=2)
    # bow pixels differ from blue but stay near white master
    core = (diff > 20) & (diff_w < 55)

    hsv = np.array(Image.fromarray(rgb).convert('HSV')).astype(np.float64) / 255.0
    s, v = hsv[..., 1], hsv[..., 2]
    ys, xs = np.mgrid[0:rgb.shape[0], 0:rgb.shape[1]]
    hanger = (ys < 175) & (xs >= 442) & (xs <= 528)
    tail = hanger & (v > 0.52) & (s < 0.22) & (diff_w < 45)

    zone = (ys <= 505) & (xs >= 220) & (xs <= 760) & (alpha > 0)
    zone &= ~(((xs - BALL[0]) ** 2 + (ys - BALL[1]) ** 2 < BALL[2] ** 2) & (ys > 420))
    zone &= ~((xs - PEARL[0]) ** 2 + (ys - PEARL[1]) ** 2 < PEARL[2] ** 2)
    zone &= ~((xs >= CAP[0]) & (xs <= CAP[2]) & (ys >= CAP[1]) & (ys <= CAP[3]))

    raw = (core | tail) & zone
    img = Image.fromarray((raw * 255).astype(np.uint8))
    img = img.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    img = img.filter(ImageFilter.GaussianBlur(1.0))
    soft = np.array(img).astype(np.float64) / 255.0
    soft[~zone] = 0
    return soft, v


def recolor(src_name, dst_path, target):
    color, sheen = target
    im = Image.open(os.path.join(PREVIEW, src_name)).convert('RGBA')
    alpha = np.array(im.getchannel('A'))
    rgb = np.array(im.convert('RGB'))
    soft, v = bow_mask(rgb, alpha)
    shade = np.clip((v - 0.68) / 0.32, 0, 1)
    tone = 0.36 + 0.84 * shade ** 1.25
    base = np.array(color, dtype=np.float64)[None, None, :] * tone[..., None]
    spec = np.clip((shade - 0.7) / 0.3, 0, 1) ** 2 * sheen
    tinted = base + (255 - base) * spec[..., None]
    orig = rgb.astype(np.float64)
    m = soft[..., None]
    out = tinted * m + orig * (1 - m)
    res = Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), 'RGB')
    res.putalpha(Image.fromarray(alpha))
    if dst_path.endswith('-back.webp'):
        res.save(dst_path, 'WEBP', quality=90, method=6)
    else:
        res.convert('RGB').save(dst_path, 'WEBP', quality=82, method=6)


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(BACK_OUT, exist_ok=True)
    for key, target in TARGETS.items():
        if ONLY and key not in ONLY:
            continue
        recolor('bauble-white.webp', os.path.join(OUT, 'bauble-photo-bow-%s.webp' % key), target)
        recolor('bauble-white-back.webp', os.path.join(BACK_OUT, 'bauble-photo-bow-%s-back.webp' % key), target)
        print(key)


if __name__ == '__main__':
    main()
