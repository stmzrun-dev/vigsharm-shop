# -*- coding: utf-8 -*-
"""Square catalog frames from real named-bauble photos.

Keeps the ornament itself (text, bow, colour). Replaces the room
with the same hanging look as preview/bauble-ex-logo.webp:
pine branch at the top, warm tree lights behind.
"""
import os

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREVIEW = os.path.join(ROOT, 'preview')
SRC = os.path.join(PREVIEW, '_bauble_src')
RAW = r'C:\Users\79528\.cursor\projects\c-vigsharm-shop\assets'
STYLE = os.path.join(PREVIEW, 'bauble-ex-logo.webp')
SIZE = 1000


def plate():
    """Warm tree lights only. The strip is left of the sample ornament, so nothing else is copied in."""
    src = Image.open(STYLE).convert('RGB')
    return src.crop((0, 140, 200, 980)).resize((SIZE, SIZE), Image.LANCZOS)


def largest(alpha):
    """Keep the ball and any large piece that broke off (a bow). Drop specks."""
    mask = (alpha > 30).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    if n <= 1:
        return alpha
    areas = stats[1:, cv2.CC_STAT_AREA]
    big = int(areas.max())
    keep = np.zeros(alpha.shape, np.uint8)
    for i, area in enumerate(areas, start=1):
        if area >= max(400, big * 0.04):
            keep[labels == i] = 255
    return np.where(keep > 0, alpha, 0).astype(np.uint8)


def shorten_hanger(alpha):
    """Leave a short cord above the bow. Drop stray pine and long ribbons."""
    ys, xs = np.where(alpha > 40)
    if len(ys) == 0:
        return alpha
    span = xs.max() - xs.min() + 1
    y0, y1 = int(ys.min()), int(ys.max())
    bow = None
    for y in range(y0, y1):
        if (alpha[y] > 40).sum() > span * 0.22:
            bow = y
            break
    if bow is None:
        return alpha
    cut_at = max(0, bow - 36)
    alpha = alpha.copy()
    alpha[:cut_at, :] = 0
    return alpha


def clean_cut(cut, hanger=True):
    arr = np.array(cut)
    alpha = largest(arr[:, :, 3])
    # pull the edge in one pixel so the grey room fringe does not show
    alpha = cv2.erode(alpha, np.ones((3, 3), np.uint8), iterations=1)
    if hanger:
        alpha = shorten_hanger(alpha)
    arr[:, :, 3] = alpha
    im = Image.fromarray(arr, 'RGBA')
    box = im.getchannel('A').getbbox()
    if not box:
        return im
    pad = 6
    x0, y0, x1, y1 = box
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


def solid_boxes(cut):
    """The right-hand boxes were only half-opaque, so the lights showed through."""
    arr = np.array(cut)
    mask = (arr[:, :, 3] > 40).astype(np.uint8)
    inv = ((mask == 0).astype(np.uint8)) * 255
    flood = inv.copy()
    cv2.floodFill(flood, np.zeros((inv.shape[0] + 2, inv.shape[1] + 2), np.uint8), (0, 0), 0)
    holes = flood > 0
    mask[holes] = 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    arr[:, :, 3] = np.where(mask > 0, 255, 0).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')


def strip_needles(cut):
    """A bit of the real pine stayed on the hanger of the aunt bauble."""
    arr = np.array(cut)
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    top = int(arr.shape[0] * 0.28)
    green = (g > r + 18) & (g > 70)
    green[top:, :] = False
    arr[green, 3] = 0
    return Image.fromarray(arr, 'RGBA')


def restore_nails_bow(cut):
    """The silver bow sat on ivy and was dropped. Paint it back from the photo."""
    orig = Image.open(os.path.join(
        RAW, '20231211_143548_0_-ac0ea953-167a-47be-b16b-af8f20825bd2.jpg')).convert('RGB')
    o = np.array(orig).astype(np.int16)
    r, g, b = o[:, :, 0], o[:, :, 1], o[:, :, 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    bow = (mx > 165) & ((mx - mn) < 80) & (g < r + 45) & (b > 140)
    bow[430:, :] = False
    bow[:, :40] = False
    bow[:, 520:] = False
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    bow_u = cv2.morphologyEx(bow.astype(np.uint8) * 255, cv2.MORPH_CLOSE, k)
    bow_u = cv2.morphologyEx(bow_u, cv2.MORPH_OPEN, k)
    n, labels, stats, _ = cv2.connectedComponentsWithStats((bow_u > 0).astype(np.uint8), 8)
    if n > 1:
        keep = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        bow_u = np.where(labels == keep, bow_u, 0).astype(np.uint8)
    arr = np.array(cut)
    add = bow_u > 0
    arr[add, :3] = o[add]
    arr[add, 3] = 255
    return Image.fromarray(arr, 'RGBA')


def soften(cut):
    a = cut.getchannel('A')
    # knock out the grey fringe rembg leaves on the ball edge
    a = a.point(lambda v: 0 if v < 20 else (255 if v > 210 else int((v - 20) * 255 / 190)))
    a = a.filter(ImageFilter.GaussianBlur(0.4))
    cut = cut.copy()
    cut.putalpha(a)
    return cut


def place(base, cut, max_w, max_h, cx, top):
    cut = soften(lift(cut))
    scale = min(max_w / cut.width, max_h / cut.height)
    w, h = int(cut.width * scale), int(cut.height * scale)
    cut = cut.resize((w, h), Image.LANCZOS)
    x = int(cx - w / 2)
    y = top
    shadow = Image.new('RGBA', base.size, (0, 0, 0, 0))
    shade = cut.getchannel('A').point(lambda v: int(v * 0.28)).filter(ImageFilter.GaussianBlur(14))
    shadow.paste((50, 36, 28, 255), (x + 10, y + 16), shade)
    frame = base.convert('RGBA')
    frame.alpha_composite(shadow)
    frame.alpha_composite(cut, (x, y))
    return frame.convert('RGB')


def lift(im):
    im = ImageEnhance.Brightness(im).enhance(1.06)
    im = ImageEnhance.Contrast(im).enhance(1.05)
    im = ImageEnhance.Color(im).enhance(1.06)
    return im


JOBS = [
    ('georgiy', True, 780, 860, 500, 70),
    ('first', True, 820, 880, 500, 60),
    ('businka', True, 800, 880, 490, 50),
    ('dasha', True, 800, 880, 500, 60),
    ('vet-lion', True, 760, 880, 500, 40),
    ('aunt', True, 780, 880, 500, 70),
    ('boxes', False, 620, 940, 500, 30),
    ('vet-green', True, 800, 880, 500, 50),
    ('ivanor', True, 800, 880, 500, 50),
    ('nails', True, 760, 820, 500, 90),
]


def main():
    bg = plate()
    bg.save(os.path.join(SRC, 'plate2.jpg'), quality=90)
    cuts = {}
    for name, hanger, max_w, max_h, cx, top in JOBS:
        cut = Image.open(os.path.join(SRC, name + '.png')).convert('RGBA')
        if name == 'nails':
            cut = restore_nails_bow(cut)
        if name == 'aunt':
            cut = strip_needles(cut)
        cut = clean_cut(cut, hanger=hanger)
        cuts[name] = cut
        frame = place(bg, cut, max_w, max_h, cx, top)
        out = os.path.join(PREVIEW, 'bauble-real-%s.webp' % name)
        frame.save(out, 'WEBP', quality=80, method=6)
        print(name, os.path.getsize(out), frame.size)


if __name__ == '__main__':
    main()
