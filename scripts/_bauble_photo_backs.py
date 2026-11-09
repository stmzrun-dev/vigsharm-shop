# -*- coding: utf-8 -*-
"""Render cream-text and sample-photo backs for every bow color.

Usage: python scripts/_bauble_photo_backs.py <sample-photo> <caveat-cyr.ttf> <caveat-lat.ttf> <tinted-back-dir>
Tinted back layers come from _bow_recolor.py (temp dir, not published in preview/).
"""
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREVIEW = os.path.join(ROOT, 'preview')
SAMPLE, FONT_CYR, FONT_LAT, TINT_DIR = sys.argv[1:5]

TINTED = ['gold', 'sky', 'silver', 'pink', 'peach', 'red', 'raspberry', 'wine', 'lilac', 'violet', 'navy', 'mint', 'green', 'black']
BASES = {'white': ('bauble-white-back.webp', 'bauble-white-front.webp')}
for key in TINTED:
    BASES[key] = (os.path.join(TINT_DIR, 'bauble-photo-bow-%s-back.webp' % key), 'bauble-white-front.webp')

LINES = [('Мой первый', FONT_CYR), ('Новый год', FONT_CYR), ('2027', FONT_LAT)]
INK = (128, 38, 44, 255)


def load(name):
    path = name if os.path.isabs(name) else os.path.join(PREVIEW, name)
    return Image.open(path).convert('RGBA')


def hole_of(back):
    alpha = back.getchannel('A')
    region = alpha.crop((260, 380, 740, 840))
    mask = region.point(lambda v: 255 if v < 128 else 0)
    box = mask.getbbox()
    full = Image.new('L', back.size, 0)
    full.paste(mask, (260, 380))
    x0, y0, x1, y1 = box[0] + 260, box[1] + 380, box[2] + 260, box[3] + 380
    return full, (x0, y0, x1, y1)


def cover(img, box, lift=0.0, zoom=1.0):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    side = int(max(w, h) * zoom)
    src = img.convert('RGBA')
    sw, sh = src.size
    s = min(sw, sh)
    crop = src.crop(((sw - s) // 2, (sh - s) // 2, (sw - s) // 2 + s, (sh - s) // 2 + s)).resize((side, side), Image.LANCZOS)
    left = x0 + (w - side) // 2
    top = y0 + (h - side) // 2 - int(h * lift)
    return crop, (left, top)


def text_card(box):
    x0, y0, x1, y1 = box
    d = x1 - x0
    card = Image.new('RGBA', (d, d), (251, 247, 241, 255))
    glow = Image.new('L', (d, d), 0)
    ImageDraw.Draw(glow).ellipse((d * 0.1, d * 0.05, d * 0.9, d * 0.75), fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(d * 0.12))
    warm = Image.new('RGBA', (d, d), (244, 233, 222, 255))
    card = Image.composite(card, warm, glow)
    draw = ImageDraw.Draw(card)
    size = int(d * 0.17)
    fonts = [ImageFont.truetype(f, size if i < 2 else int(size * 0.92)) for i, (_, f) in enumerate(LINES)]
    heights = [draw.textbbox((0, 0), t, font=fonts[i])[3] - draw.textbbox((0, 0), t, font=fonts[i])[1] for i, (t, _) in enumerate(LINES)]
    gap = int(size * 0.18)
    total = sum(heights) + gap * (len(LINES) - 1)
    y = int(d * 0.40 - total / 2)
    for i, (t, _) in enumerate(LINES):
        bb = draw.textbbox((0, 0), t, font=fonts[i])
        w = bb[2] - bb[0]
        draw.text(((d - w) / 2 - bb[0], y - bb[1]), t, font=fonts[i], fill=INK)
        y += heights[i] + gap
    return card, (x0, y0)


def glass(mask, box):
    x0, y0, x1, y1 = box
    d = x1 - x0
    layer = Image.new('RGBA', mask.size, (255, 255, 255, 0))
    arc = Image.new('L', mask.size, 0)
    ad = ImageDraw.Draw(arc)
    ad.arc((x0 + d * 0.05, y0 + d * 0.04, x1 - d * 0.05, y1 - d * 0.06), 205, 245, fill=70, width=int(d * 0.03))
    ad.ellipse((x0 + d * 0.70, y0 + d * 0.16, x0 + d * 0.76, y0 + d * 0.22), fill=90)
    arc = arc.filter(ImageFilter.GaussianBlur(d * 0.018))
    shade = mask.filter(ImageFilter.GaussianBlur(d * 0.05))
    edge = ImageChops.subtract(mask, shade).point(lambda v: min(255, v * 2))
    white = Image.new('RGBA', mask.size, (255, 255, 255, 255))
    dark = Image.new('RGBA', mask.size, (60, 50, 45, 255))
    layer = Image.composite(dark, layer, edge.point(lambda v: v * 0.35))
    layer = Image.composite(white, layer, ImageChops.multiply(arc, mask))
    return layer


def soft_snow(front):
    alpha = front.getchannel('A')
    box = alpha.point(lambda v: 255 if v > 200 else 0).getbbox()
    if not box:
        return front
    top, fade = box[1], 34
    ramp = Image.new('L', front.size, 255)
    draw = ImageDraw.Draw(ramp)
    for i in range(fade):
        draw.line((0, top + i, front.size[0], top + i), fill=int(255 * (i / fade) ** 1.6))
    draw.rectangle((0, 0, front.size[0], top), fill=0)
    front = front.copy()
    front.putalpha(ImageChops.multiply(alpha, ramp))
    return front


def render(key, content, pos):
    back_name, front_name = BASES[key]
    back = load(back_name)
    front = soft_snow(load(front_name))
    mask, box = hole_of(back)
    canvas = Image.new('RGBA', back.size, (250, 247, 243, 255))
    canvas.alpha_composite(content, pos)
    canvas.alpha_composite(glass(mask, box))
    canvas.alpha_composite(back)
    canvas.alpha_composite(front)
    return canvas.convert('RGB')


def main():
    sample = Image.open(SAMPLE)
    for key in BASES:
        _, box = hole_of(load(BASES[key][0]))
        grow = (box[0] - 8, box[1] - 8, box[2] + 8, box[3] + 8)
        card, pos = text_card(grow)
        render(key, card, pos).save(os.path.join(PREVIEW, 'bauble-photo-%s-text.webp' % key), 'WEBP', quality=82, method=6)
        photo, pos = cover(sample, grow, lift=0.12, zoom=1.08)
        render(key, photo, pos).save(os.path.join(PREVIEW, 'bauble-photo-%s-photo2.webp' % key), 'WEBP', quality=82, method=6)
        print(key, box)


if __name__ == '__main__':
    main()
