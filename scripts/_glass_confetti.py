# Слой конфетти: кусочки с фото баблса, по всему стеклянному шару.
# Чужая надпись «Happy Birthday Milana» снимается одной маской —
# на всех 24 фото она стоит в одном месте.
import cv2
import numpy as np
from pathlib import Path
from PIL import Image

ROOT = Path(r'C:\vigsharm-shop')
SRC = ROOT / 'images' / 'balloons' / 'confetti-bubbles'
OUT = ROOT / 'images' / 'balloons' / 'glass-confetti'

CX, CY, RX, RY = 320.0, 292.0, 214.0, 232.0

NAMES = [
    'confetti-01-malinovye.webp',
    'confetti-02-zoloto-temnoe.webp',
    'confetti-03-serebro.webp',
    'confetti-04-zoloto-yarkoe.webp',
    'confetti-05-rozovye.webp',
    'confetti-06-sinie.webp',
    'confetti-07-rozovoe-zoloto.webp',
    'confetti-08-zoloto-svetloe.webp',
    'confetti-09-kv-chernye.webp',
    'confetti-10-kv-rozovoe-zoloto.webp',
    'confetti-11-kv-rozovyy-miks.webp',
    'confetti-12-kv-goluboy-miks.webp',
    'confetti-13-kv-assorti.webp',
    'confetti-14-prazdnik.webp',
    'confetti-15-rozovye-metallik.webp',
    'confetti-16-kv-malinovye.webp',
    'confetti-17-kv-golubye.webp',
    'confetti-18-fioletovye.webp',
    'confetti-19-biryuzovye.webp',
    'confetti-20-krasnye.webp',
    'confetti-21-chernye.webp',
    'confetti-22-malinovye-metallik.webp',
    'confetti-23-golubye-metallik.webp',
    'confetti-24-zelenye.webp',
]


def glass_letters():
    g = np.asarray(Image.open(ROOT / 'images' / 'balloons' / 'glass-bubbles' / 'glass-05-rozovyy-svetlyy.webp').convert('RGB'))
    lum = g.astype(np.int16).sum(axis=2)
    letters = lum < 150
    letters[:165, :] = False
    letters[440:, :] = False
    letters[:, :130] = False
    letters[:, 510:] = False
    return cv2.dilate(letters.astype(np.uint8) * 255, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)), iterations=1) > 0


def source_text_mask(h, w):
    """Буквы с малинового фото: там кружки цветные, а надпись тёмная и серая."""
    rgb = np.asarray(Image.open(SRC / 'confetti-01-malinovye.webp').convert('RGB'))
    if rgb.shape[0] != h or rgb.shape[1] != w:
        rgb = np.asarray(Image.fromarray(rgb).resize((w, h), Image.Resampling.LANCZOS))
    lum = rgb.astype(np.int16).sum(axis=2) / 3
    sat = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
    zone = np.zeros((h, w), bool)
    zone[int(h * 0.17):int(h * 0.60), int(w * 0.18):int(w * 0.82)] = True
    text = (zone & (sat < 32) & (lum < 150) & (lum > 20)).astype(np.uint8) * 255
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    text = cv2.dilate(text, kernel, iterations=3)
    text = cv2.morphologyEx(text, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    return text > 0


def large_highlights(balloon, lum, sat):
    hi = (balloon & (lum > 214) & (sat < 14)).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(hi, 8)
    out = np.zeros(hi.shape, bool)
    for i in range(1, count):
        if int(stats[i, cv2.CC_STAT_AREA]) >= 70:
            out[labels == i] = True
    return out


LETTERS = None
TEXT = None


def transfer(name):
    rgb = np.asarray(Image.open(SRC / name).convert('RGB'))
    h, w = rgb.shape[:2]
    lum = rgb.astype(np.float32).sum(axis=2) / 3.0
    sat = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
    yy, xx = np.ogrid[:h, :w]
    scx, scy, sr = w * 0.50, h * 0.40, w * 0.345
    balloon = (xx - scx) ** 2 + (yy - scy) ** 2 <= sr ** 2
    pale = balloon & (lum > 188) & (sat < 32)
    bg = np.median(rgb[pale], axis=0).astype(np.int16) if int(pale.sum()) > 40 else np.array([230, 222, 214], np.int16)
    delta = np.abs(rgb.astype(np.int16) - bg).sum(axis=2)
    # Порог выше, чем «чуть отличается от фона»: иначе в слой попадает светлый край прозрачного шара.
    piece = balloon & (delta > 85) & ~TEXT & ~large_highlights(balloon, lum, sat)
    # Светлый край прозрачной плёнки. Сама фольга темнее или цветнее этого края.
    piece = piece & ~((sat < 20) & (lum > 190))
    piece[int(h * 0.73):, :] = False
    alpha = cv2.morphologyEx(piece.astype(np.uint8) * 255, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2)))

    ys, xs = np.mgrid[0:640, 0:640]
    nx = (xs - CX) / RX
    ny = (ys - CY) / RY
    inside = nx * nx + ny * ny <= 0.96
    map_x = (scx + nx * sr).astype(np.float32)
    map_y = (scy + ny * sr).astype(np.float32)
    warped = cv2.remap(rgb, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    wa = cv2.remap(alpha, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    wa[~inside] = 0
    wa[LETTERS] = 0
    # Блик окна с исходного фото — большое светлое пятно, не конфетти.
    wlum = warped.astype(np.int16).sum(axis=2) / 3
    wsat = warped.max(axis=2).astype(np.int16) - warped.min(axis=2).astype(np.int16)
    glare = ((wa > 40) & (wlum > 198) & (wsat < 24)).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(glare, 8)
    for i in range(1, count):
        if int(stats[i, cv2.CC_STAT_AREA]) > 480:
            wa[labels == i] = 0
    return Image.fromarray(np.dstack([warped, wa]), 'RGBA')


def main():
    global LETTERS, TEXT
    LETTERS = glass_letters()
    sample = np.asarray(Image.open(SRC / NAMES[0]).convert('RGB'))
    TEXT = source_text_mask(sample.shape[0], sample.shape[1])
    OUT.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        transfer(name).save(OUT / name, 'WEBP', quality=82, method=4)
        print(name)


if __name__ == '__main__':
    main()
