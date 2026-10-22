# Sheet of 15 print designs for a named bauble. Preview only.
import math
import os

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_WOFF = os.path.join(ROOT, "assets", "fonts", "caveat-cyrillic-600.woff2")
FONT_PATH = os.path.join(ROOT, "scripts", "_caveat-cyr.ttf")
OUT_SVG = os.path.join(ROOT, "preview", "bauble-faces-15.svg")
OUT_PNG = os.path.join(ROOT, "preview", "bauble-faces-15.raw.png")
OUT_SHEET = os.path.join(ROOT, "preview", "bauble-faces-15.webp")

CELL_W, CELL_H = 280, 332
GAP_X, GAP_Y = 22, 16
PAD = 28
CX, CY, R = 140, 178, 112

if not os.path.exists(FONT_PATH):
    _src = TTFont(FONT_WOFF)
    _src.flavor = None
    _src.save(FONT_PATH)
tt = TTFont(FONT_PATH)
glyph_order = tt.getGlyphOrder()
glyphset = tt.getGlyphSet()
blob = hb.Blob.from_file_path(FONT_PATH)
face = hb.Face(blob)
hb_font = hb.Font(face)
hb_font.scale = (1000, 1000)


def shape(text, font_px):
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hb_font, buf)
    scale = font_px / 1000.0
    parts = []
    x = 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = glyph_order[info.codepoint]
        pen = SVGPathPen(glyphset)
        glyphset[name].draw(pen)
        d = pen.getCommands()
        if d:
            ox = (x + pos.x_offset) * scale
            oy = -pos.y_offset * scale
            parts.append(
                f'<g transform="translate({ox:.2f},{oy:.2f}) scale({scale:.5f},{-scale:.5f})"><path d="{d}"/></g>'
            )
        x += pos.x_advance
    width = x * scale
    return "".join(parts), width


def fit_name(text, max_w=168, start=54, minimum=34):
    size = start
    paths, width = shape(text, size)
    if width > max_w:
        size = max(minimum, start * max_w / width)
        paths, width = shape(text, size)
    return paths, width, size


def snowflake(r=26, sw=3.3):
    bits = []
    for i in range(6):
        a = math.radians(i * 60 - 90)
        x2, y2 = r * math.cos(a), r * math.sin(a)
        bits.append(f'<line x1="0" y1="0" x2="{x2:.2f}" y2="{y2:.2f}"/>')
        for t, bl, ang in ((0.46, r * 0.40, 46), (0.74, r * 0.28, 42)):
            bx, by = t * x2, t * y2
            for s in (ang, -ang):
                aa = a + math.radians(s)
                bits.append(
                    f'<line x1="{bx:.2f}" y1="{by:.2f}" x2="{bx + bl * math.cos(aa):.2f}" y2="{by + bl * math.sin(aa):.2f}"/>'
                )
    body = "".join(bits)
    return (
        f'<g fill="none" stroke="#fff" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{body}</g>'
        f'<circle cx="0" cy="0" r="{sw * 0.85:.2f}" fill="#fff"/>',
        "",
    )


def star4(r=7):
    return f'<path d="M0,{-r} L{r*0.28:.1f},{-r*0.28:.1f} L{r},0 L{r*0.28:.1f},{r*0.28:.1f} L0,{r} L{-r*0.28:.1f},{r*0.28:.1f} L{-r},0 L{-r*0.28:.1f},{-r*0.28:.1f} Z"/>'


def fir(h=58):
    return (
        f'<g fill="#fff">'
        f'<path d="M0,{-h*0.62:.1f} L{h*0.16:.1f},{-h*0.34:.1f} H{h*0.07:.1f} L{h*0.30:.1f},{-h*0.08:.1f} H{h*0.16:.1f} L{h*0.42:.1f},{h*0.28:.1f} H{h*0.08:.1f} V{h*0.46:.1f} H{-h*0.08:.1f} V{h*0.28:.1f} H{-h*0.42:.1f} L{-h*0.16:.1f},{-h*0.08:.1f} H{-h*0.30:.1f} L{-h*0.07:.1f},{-h*0.34:.1f} H{-h*0.16:.1f} Z"/>'
        f'<g transform="translate(0,{-h*0.70:.1f})">{star4(h * 0.13)}</g>'
        f"</g>",
        "",
    )


def pines(n=3, h=40):
    gaps = {2: 34, 3: 28}[n]
    heights = {2: (0.82, 1), 3: (0.72, 1, 0.72)}[n]
    bits = []
    for i, k in enumerate(heights):
        x = (i - (n - 1) / 2) * gaps
        bits.append(f'<g transform="translate({x:.1f},{(1-k)*h*0.15:.1f})">{fir(h * k)[0]}</g>')
    return "".join(bits), ""


def holly():
    # Two leaves spreading apart, three berries on top of the join.
    leaf = "M0,2 C-8,-2 -24,-10 -34,-4 C-22,0 -12,2 -2,6 C-14,8 -22,18 -14,22 C-4,14 0,8 0,2 Z"
    white = (
        f'<g transform="translate(-8,0)"><path d="{leaf}"/></g>'
        f'<g transform="translate(8,0) scale(-1,1)"><path d="{leaf}"/></g>'
        '<circle cx="0" cy="8" r="4.6"/>'
        '<circle cx="-10" cy="14" r="3.5"/>'
        '<circle cx="10" cy="14" r="3.5"/>'
    )
    return white, ""


def bow():
    white = (
        '<path d="M-5,-4 C-10,-16 -32,-18 -34,-6 C-36,6 -22,12 -8,6 C-16,4 -12,-2 -5,-4 Z"/>'
        '<path d="M5,-4 C10,-16 32,-18 34,-6 C36,6 22,12 8,6 C16,4 12,-2 5,-4 Z"/>'
        '<path d="M-1,4 L-20,28 H-8 L-1,12 Z"/>'
        '<path d="M1,4 L20,28 H8 L1,12 Z"/>'
        '<circle cx="0" cy="1" r="5"/>'
    )
    holes = (
        '<path d="M-16,-6 C-22,-10 -26,-4 -20,0 C-14,2 -12,-2 -16,-6 Z"/>'
        '<path d="M16,-6 C22,-10 26,-4 20,0 C14,2 12,-2 16,-6 Z"/>'
    )
    return white, holes


def bells():
    one = (
        '<path d="M0,-16 C8,-16 11,-8 13,0 L17,12 H-17 L-13,0 C-11,-8 -8,-16 0,-16 Z"/>'
        '<rect x="-18" y="11" width="36" height="5" rx="2"/>'
        '<circle cx="0" cy="20" r="2.5"/>'
    )
    white = (
        f'<g transform="translate(-16,6) rotate(-12)">{one}</g>'
        f'<g transform="translate(16,6) rotate(12)">{one}</g>'
        '<path d="M-7,-14 C-14,-22 -2,-24 0,-16 C2,-24 14,-22 7,-14 C3,-18 -3,-18 -7,-14 Z"/>'
    )
    return white, ""


def deer():
    # Leaping reindeer, filled body, antlers up, legs in a run.
    white = (
        '<path d="M-36,8 C-30,0 -16,-2 -4,0 C6,-6 12,-4 16,2 C12,6 2,8 -8,6 '
        'C-4,12 -14,16 -22,12 C-18,8 -26,6 -32,10 C-28,16 -36,14 -36,8 Z"/>'
        '<path d="M12,-2 C18,-8 22,-18 18,-22 C22,-16 28,-18 26,-26 '
        'C28,-18 34,-16 36,-24 C34,-16 40,-18 42,-12 '
        'C36,-10 30,-6 24,-4 C20,0 14,2 12,-2 Z"/>'
        '<path d="M24,-20 L16,-34 M16,-30 L10,-34 M16,-26 L12,-36 '
        'M28,-22 L34,-36 M34,-30 L40,-34 M30,-18 L38,-28" '
        'fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>'
        '<path d="M36,-12 L46,-10 L38,-14 Z"/>'
        '<polygon points="-30,6 -24,6 -36,22 -42,20"/>'
        '<polygon points="-16,6 -10,8 -12,24 -18,22"/>'
        '<polygon points="0,4 6,2 14,20 6,22"/>'
        '<polygon points="12,0 18,-2 28,16 20,18"/>'
        '<path d="M-34,4 L-42,-2 L-32,8 Z"/>'
    )
    holes = '<circle cx="40" cy="-14" r="1.2"/>'
    return white, holes


def snowman():
    white = (
        '<g transform="translate(0,8)">'
        '<rect x="-16" y="-40" width="32" height="5" rx="1.5"/>'
        '<rect x="-10" y="-56" width="20" height="18" rx="2"/>'
        '<circle cx="0" cy="-24" r="13"/>'
        '<circle cx="0" cy="2" r="18"/>'
        '<path d="M-20,-2 C-30,-8 -34,2 -28,6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'
        '<path d="M20,-2 C30,-8 34,2 28,6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'
        '<path d="M-8,-30 L2,-26 L-6,-24 Z"/>'
        "</g>"
    )
    holes = (
        '<g transform="translate(0,8)">'
        '<circle cx="-4" cy="-28" r="1.5"/>'
        '<circle cx="4" cy="-28" r="1.5"/>'
        '<path d="M-4,-22 Q0,-18 4,-22" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round"/>'
        '<circle cx="0" cy="-4" r="1.7"/>'
        '<circle cx="0" cy="4" r="1.7"/>'
        '<circle cx="0" cy="12" r="1.7"/>'
        "</g>"
    )
    return white, holes


def gift(w=34, h=26):
    white = (
        f'<rect x="{-w/2:.1f}" y="{-h/2+6:.1f}" width="{w}" height="{h}" rx="2.5"/>'
        '<ellipse cx="-7" cy="-10" rx="8" ry="6"/>'
        '<ellipse cx="7" cy="-10" rx="8" ry="6"/>'
        '<circle cx="0" cy="-6" r="3.4"/>'
    )
    holes = (
        f'<rect x="-3" y="{-h/2+6:.1f}" width="6" height="{h}"/>'
        f'<rect x="{-w/2:.1f}" y="{2:.1f}" width="{w}" height="5.5"/>'
        '<ellipse cx="-8" cy="-10" rx="3.6" ry="2.6"/>'
        '<ellipse cx="8" cy="-10" rx="3.6" ry="2.6"/>'
    )
    return white, holes


def gifts_two():
    a, ah = gift(30, 22)
    b, bh = gift(26, 20)
    white = (
        f'<g transform="translate(-16,4)">{a}</g>'
        f'<g transform="translate(16,6)">{b}</g>'
    )
    holes = (
        f'<g transform="translate(-16,4)">{ah}</g>'
        f'<g transform="translate(16,6)">{bh}</g>'
    )
    return white, holes


def penguin():
    white = (
        '<ellipse cx="0" cy="4" rx="20" ry="26"/>'
        '<ellipse cx="2" cy="8" rx="11" ry="16"/>'
        '<path d="M16,2 L28,6 L16,11 Z"/>'
        '<ellipse cx="-10" cy="30" rx="8" ry="4"/>'
        '<ellipse cx="8" cy="30" rx="8" ry="4"/>'
        '<path d="M-14,-18 H12 L8,-30 H-6 Z"/>'
        '<circle cx="14" cy="-32" r="4"/>'
        '<path d="M-4,-16 L6,-34" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'
    )
    # belly is a hole so the body reads; redraw belly as hole and keep beak/hat/feet white
    holes = (
        '<ellipse cx="1" cy="10" rx="10" ry="14"/>'
        '<circle cx="-4" cy="-2" r="1.6"/>'
        '<circle cx="6" cy="-2" r="1.6"/>'
    )
    # The second ellipse in white was the belly; keep it white then punch a smaller hole.
    return white, holes


def stocking():
    white = (
        '<path d="M-14,-26 H12 V-16 H8 C8,-4 10,6 20,12 C26,16 22,26 10,26 '
        'H-8 C-20,26 -22,14 -14,8 L-16,-6 H-18 V-16 H-14 Z"/>'
        '<rect x="-16" y="-32" width="30" height="10" rx="2"/>'
    )
    holes = '<rect x="-16" y="-24.5" width="30" height="3"/>'
    return white, holes


def santa():
    white = (
        '<path d="M-22,6 C-26,20 -10,32 0,32 C14,32 28,18 24,4 C16,16 4,20 -6,16 C-14,12 -18,8 -22,6 Z"/>'
        '<path d="M-18,-2 L2,-40 L16,0 Z"/>'
        '<rect x="-20" y="-6" width="40" height="8" rx="3"/>'
        '<circle cx="6" cy="-36" r="5"/>'
        '<path d="M-8,2 Q0,8 10,1 Q6,6 0,6 Q-4,6 -8,2 Z"/>'
    )
    holes = (
        '<circle cx="-5" cy="-4" r="1.6"/>'
        '<circle cx="6" cy="-4" r="1.6"/>'
        '<path d="M-4,6 Q1,10 7,6" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round"/>'
    )
    return white, holes


def ginger():
    white = (
        '<circle cx="0" cy="-22" r="13"/>'
        '<rect x="-14" y="-12" width="28" height="30" rx="12"/>'
        '<path d="M-14,-2 L-32,8" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>'
        '<path d="M14,-2 L32,8" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>'
        '<path d="M-8,16 L-16,36" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>'
        '<path d="M8,16 L16,36" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>'
    )
    holes = (
        '<circle cx="-4.5" cy="-24" r="1.5"/>'
        '<circle cx="4.5" cy="-24" r="1.5"/>'
        '<path d="M-4,-18 Q0,-14 4,-18" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round"/>'
        '<circle cx="0" cy="-2" r="1.8"/>'
        '<circle cx="0" cy="6" r="1.8"/>'
        '<circle cx="0" cy="14" r="1.8"/>'
    )
    return white, holes


def sleigh():
    white = (
        '<path d="M-36,14 H22 C34,14 40,6 36,-2" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>'
        '<path d="M-24,14 V6" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>'
        '<path d="M14,14 V7" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>'
        '<path d="M-30,6 H16 L12,-12 H-22 Z"/>'
        '<path d="M-30,6 L-38,-10 H-30 Z"/>'
        '<path d="M16,-2 C24,-4 28,-12 20,-16" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>'
    )
    return white, ""


def house():
    tree = fir(34)[0]
    white = (
        f'<g transform="translate(-34,6) scale(0.85)">{tree}</g>'
        f'<g transform="translate(36,8) scale(0.72)">{tree}</g>'
        '<path d="M-22,16 V-2 L0,-24 L22,-2 V16 Z"/>'
        '<rect x="8" y="-22" width="6" height="12"/>'
        '<rect x="-6" y="-8" width="12" height="10" rx="1"/>'
    )
    holes = (
        '<rect x="-8" y="2" width="10" height="14" rx="1"/>'
        '<path d="M-6,-8 H6 M0,-8 V2" fill="none" stroke="#000" stroke-width="1.4"/>'
    )
    return white, holes


def candle():
    white = (
        '<ellipse cx="0" cy="20" rx="16" ry="5"/>'
        '<rect x="-7" y="-12" width="14" height="32" rx="2"/>'
        '<path d="M0,-34 C6,-26 5,-18 0,-14 C-5,-18 -6,-26 0,-34 Z"/>'
    )
    holes = '<path d="M0,-30 C3,-25 2,-20 0,-18 C-2,-20 -3,-25 0,-30 Z"/>'
    return white, holes


def cane():
    white = (
        '<path d="M-6,26 V-6 C-6,-22 6,-28 16,-22" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-dasharray="8 5.5"/>'
        '<g transform="translate(10,-24) scale(0.45)">' + bow()[0] + "</g>"
    )
    holes = '<g transform="translate(10,-24) scale(0.45)">' + bow()[1] + "</g>"
    return white, holes


def star8(r=30):
    pts = []
    for i in range(16):
        rad = r if i % 2 == 0 else r * 0.42
        a = math.radians(i * 22.5 - 90)
        pts.append(f"{rad * math.cos(a):.2f},{rad * math.sin(a):.2f}")
    return f'<polygon points="{" ".join(pts)}"/>', ""


DESIGNS = [
    ("Алина", fir(62), holly(), 1, 0.92),
    ("Максим", deer(), pines(3, 36), 0.92, 0.86),
    ("Екатерина", bells(), snowflake(24, 3.1), 0.86, 0.82),
    ("Даниил", snowman(), gift(), 0.82, 0.92),
    ("София", bow(), gifts_two(), 0.78, 0.82),
    ("Иван", penguin(), snowflake(22, 3.0), 0.78, 0.78),
    ("Мария", sleigh(), pines(2, 38), 0.92, 0.9),
    ("Артём", stocking(), snowflake(22, 3.0), 0.9, 0.78),
    ("Виктория", santa(), holly(), 0.86, 0.9),
    ("Станислав", ginger(), gift(32, 24), 0.72, 0.88),
    ("Александра", snowflake(28, 3.4), bow(), 0.86, 0.62),
    ("Дмитрий", house(), pines(2, 34), 0.92, 0.78),
    ("Наталья", candle(), holly(), 0.9, 0.9),
    ("Елена", cane(), snowflake(22, 3.0), 0.92, 0.78),
    ("Валерия", star8(32), pines(2, 36), 0.9, 0.86),
]


def wrap(fragment, x, y, scale):
    if not fragment:
        return ""
    return f'<g transform="translate({x:.1f},{y:.1f}) scale({scale})">{fragment}</g>'


def cap():
    return (
        '<g fill="#fff">'
        '<circle cx="140" cy="20" r="11" stroke="#e7dcef" stroke-width="1"/>'
        '<circle cx="140" cy="20" r="5" fill="#f7f4f8"/>'
        '<rect x="132" y="28" width="16" height="14" rx="2"/>'
        '<rect x="116" y="40" width="48" height="16" rx="4"/>'
        "</g>"
    )


def ball(index, name, top, bottom, top_s, bot_s):
    gid = f"g{index}"
    tw, th = top
    bw, bh = bottom
    paths, width, size = fit_name(name)
    baseline = 198
    # Keep the name clear of the icons when the font stays large.
    name_svg = (
        f'<g fill="#fff" transform="translate({CX - width / 2:.2f},{baseline})">{paths}</g>'
    )
    mask = (
        f'<mask id="m{index}" maskUnits="userSpaceOnUse" x="0" y="0" width="{CELL_W}" height="{CELL_H}">'
        f'<rect width="{CELL_W}" height="{CELL_H}" fill="#fff"/>'
        f'{wrap(th, CX, 112, top_s)}'
        f'{wrap(bh, CX, 250, bot_s)}'
        f"</mask>"
    )
    art = (
        f'<g mask="url(#m{index})" fill="#fff">'
        f'{wrap(tw, CX, 112, top_s)}'
        f'{wrap(bw, CX, 250, bot_s)}'
        f"{name_svg}"
        f"</g>"
    )
    return (
        f'<g id="ball{index}">'
        f"{mask}"
        f'<ellipse cx="140" cy="304" rx="78" ry="10" fill="#2a063f" opacity="0.10"/>'
        f'<radialGradient id="{gid}" gradientUnits="userSpaceOnUse" cx="108" cy="132" r="150">'
        f'<stop offset="0" stop-color="#8a46ae"/>'
        f'<stop offset="0.42" stop-color="#5a1878"/>'
        f'<stop offset="1" stop-color="#2c0844"/>'
        f"</radialGradient>"
        f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="url(#{gid})"/>'
        f"{cap()}"
        f"{art}"
        f"</g>"
    )


def sheet():
    cols = 5
    rows = 3
    width = PAD * 2 + cols * CELL_W + (cols - 1) * GAP_X
    height = PAD * 2 + rows * CELL_H + (rows - 1) * GAP_Y
    balls = []
    for i, (name, top, bottom, ts, bs) in enumerate(DESIGNS):
        c, r = i % cols, i // cols
        x = PAD + c * (CELL_W + GAP_X)
        y = PAD + r * (CELL_H + GAP_Y)
        balls.append(f'<g transform="translate({x},{y})">{ball(i, name, top, bottom, ts, bs)}</g>')
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
        f'<rect width="100%" height="100%" fill="#ffffff"/>'
        f'{"".join(balls)}'
        f"</svg>"
    )
    return svg, width, height


def raster():
    import subprocess
    chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    if os.path.exists(OUT_PNG):
        os.remove(OUT_PNG)
    subprocess.run(
        [
            chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
            "--force-device-scale-factor=2", "--window-size=1544,1084",
            "--default-background-color=FFFFFFFF",
            f"--screenshot={OUT_PNG}",
            "file:///C:/vigsharm-shop/preview/bauble-faces-15.svg",
        ],
        check=True,
        timeout=40,
    )
    sheet_im = Image.open(OUT_PNG).convert("RGB")
    wide = 1600
    sheet_im.resize((wide, round(sheet_im.height * wide / sheet_im.width)), Image.Resampling.LANCZOS).save(
        OUT_SHEET, "WEBP", quality=82, method=6
    )
    scale = 2
    for i, (name, *_) in enumerate(DESIGNS):
        c, r = i % 5, i // 5
        x = round((PAD + c * (CELL_W + GAP_X)) * scale)
        y = round((PAD + r * (CELL_H + GAP_Y)) * scale)
        crop = sheet_im.crop((x, y, x + CELL_W * scale, y + CELL_H * scale))
        crop.thumbnail((640, 640), Image.Resampling.LANCZOS)
        dest = os.path.join(ROOT, "preview", f"bauble-face-{i+1:02d}.webp")
        crop.save(dest, "WEBP", quality=82, method=6)
    print("sheet", os.path.getsize(OUT_SHEET), sheet_im.size)


def main():
    svg, width, height = sheet()
    with open(OUT_SVG, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"svg {width}x{height}")
    raster()


if __name__ == "__main__":
    main()
