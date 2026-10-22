# Black cut-file for Silhouette Studio: "ТРЕНЕРУ, за которым не угнаться!"
import os
import subprocess

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_SVG = os.path.join(ROOT, "preview", "treneru-banda.svg")
OUT_PNG = os.path.join(ROOT, "preview", "treneru-banda.png")

FONT_BLACK = r"C:\Windows\Fonts\ariblk.ttf"
FONT_NARROW = r"C:\Windows\Fonts\ARIALNB.TTF"
FONT_NARROW_ITALIC = r"C:\Windows\Fonts\ARIALNBI.TTF"

# 300 dpi so 1 mm on the mat is a known pixel size
PX = 300 / 25.4


def load_font(path):
    tt = TTFont(path)
    blob = hb.Blob.from_file_path(path)
    face = hb.Face(blob)
    font = hb.Font(face)
    upem = tt["head"].unitsPerEm
    hhea = tt["hhea"]
    font.scale = (upem, upem)
    return {
        "tt": tt,
        "glyphset": tt.getGlyphSet(),
        "order": tt.getGlyphOrder(),
        "font": font,
        "upem": upem,
        "asc": hhea.ascent,
        "desc": hhea.descent,
    }


FONTS = {
    "black": load_font(FONT_BLACK),
    "narrow": load_font(FONT_NARROW),
    "italic": load_font(FONT_NARROW_ITALIC),
}


def shape(text, font_px, face, tracking=0.0):
    """Return SVG path group, advance width, and font vertical metrics in px."""
    src = FONTS[face]
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(src["font"], buf)
    scale = font_px / src["upem"]
    parts = []
    x = 0.0
    for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
        name = src["order"][info.codepoint]
        pen = SVGPathPen(src["glyphset"])
        src["glyphset"][name].draw(pen)
        d = pen.getCommands()
        if d:
            ox = (x + pos.x_offset) * scale
            oy = -pos.y_offset * scale
            parts.append(
                f'<g transform="translate({ox:.2f},{oy:.2f}) scale({scale:.5f},{-scale:.5f})">'
                f'<path d="{d}"/></g>'
            )
        x += pos.x_advance
        if i < len(buf.glyph_infos) - 1:
            x += tracking / scale
    width = x * scale
    return "".join(parts), width, src["asc"] * scale, src["desc"] * scale


def flame(h):
    """Solid three-tongue flame, tip up. No inner hole — one vinyl piece."""
    w = h * 0.62
    return (
        f'<g transform="scale({w / 100:.4f},{h / 150:.4f})">'
        '<path d="M50 2'
        'C54 28 72 36 66 62'
        'C86 48 104 72 84 104'
        'C112 96 108 132 70 148'
        'C64 128 54 132 50 148'
        'C46 132 36 128 30 148'
        'C-6 132 2 96 22 104'
        'C4 72 20 48 36 62'
        'C30 36 46 28 50 2Z"/>'
        '</g>'
    ), w


def layout():
    # Sizes chosen so the thinnest stem stays about 2 mm (Oracal weeds cleanly).
    line1, w1, a1, d1 = shape("ТРЕНЕРУ,", 22 * PX, "black", tracking=0.6 * PX)
    line2, w2, a2, d2 = shape("за которым не угнаться!", 16 * PX, "italic", tracking=0.15 * PX)
    line3, w3, a3, d3 = shape("ОТ ТВОЕЙ БАНДЫ", 11 * PX, "narrow", tracking=0.85 * PX)
    fire, fw = flame(a3 * 1.22)
    gap_fire = 3.2 * PX
    block3 = w3 + gap_fire + fw

    width = max(w1, w2, block3)
    pad_x = 8 * PX
    pad_y = 7 * PX
    gap12 = 3.4 * PX
    gap23 = 4.2 * PX

    y1 = pad_y + a1
    y2 = y1 - d1 + gap12 + a2
    y3 = y2 - d2 + gap23 + a3
    bottom = y3 - d3

    canvas_w = width + pad_x * 2
    canvas_h = bottom + pad_y
    mm_w = canvas_w / PX
    mm_h = canvas_h / PX
    x1 = pad_x + (width - w1) / 2
    x2 = pad_x + (width - w2) / 2
    x3 = pad_x + (width - block3) / 2
    fire_x = x3 + w3 + gap_fire
    fire_y = y3 - a3 * 1.18

    body = (
        f'<g transform="translate({x1:.2f},{y1:.2f})">{line1}</g>'
        f'<g transform="translate({x2:.2f},{y2:.2f})">{line2}</g>'
        f'<g transform="translate({x3:.2f},{y3:.2f})">{line3}</g>'
        f'<g transform="translate({fire_x:.2f},{fire_y:.2f})">{fire}</g>'
    )
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{mm_w:.1f}mm" height="{mm_h:.1f}mm" '
        f'viewBox="0 0 {canvas_w:.2f} {canvas_h:.2f}">'
        f'<g fill="#000000" fill-rule="evenodd">{body}</g>'
        f'</svg>'
    )
    preview = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{canvas_w:.0f}" height="{canvas_h:.0f}" '
        f'viewBox="0 0 {canvas_w:.2f} {canvas_h:.2f}">'
        f'<rect width="100%" height="100%" fill="#ffffff"/>'
        f'<g fill="#000000" fill-rule="evenodd">{body}</g>'
        f'</svg>'
    )
    return svg, preview, int(round(canvas_w)), int(round(canvas_h)), mm_w, mm_h


def main():
    svg, preview, px_w, px_h, mm_w, mm_h = layout()
    shot = os.path.join(ROOT, "preview", "_treneru-shot.svg")
    with open(shot, "w", encoding="utf-8") as f:
        f.write(preview)
    chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    if os.path.exists(OUT_PNG):
        os.remove(OUT_PNG)
    subprocess.run(
        [
            chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
            "--force-device-scale-factor=1",
            f"--window-size={px_w},{px_h}",
            "--default-background-color=FFFFFFFF",
            f"--screenshot={OUT_PNG}",
            "file:///C:/vigsharm-shop/preview/_treneru-shot.svg",
        ],
        check=True,
        timeout=40,
    )
    im = Image.open(OUT_PNG).convert("L")
    # Crop Chrome's extra window pixels, then knock out gray so Trace sees only black.
    ink = im.point(lambda p: 0 if p < 250 else 255)
    bbox = ink.getbbox()
    if bbox:
        margin = round(6 * PX)
        im = im.crop((
            max(0, bbox[0] - margin),
            max(0, bbox[1] - margin),
            min(im.width, bbox[2] + margin),
            min(im.height, bbox[3] + margin),
        ))
    bw = im.point(lambda p: 0 if p < 160 else 255).convert("RGB")
    bw.save(OUT_PNG, "PNG", optimize=True)
    with open(OUT_SVG, "w", encoding="utf-8") as f:
        f.write(svg)
    os.remove(shot)
    print(f"{px_w}x{px_h}px  {mm_w:.1f}x{mm_h:.1f}mm  png={bw.size}")


if __name__ == "__main__":
    main()
