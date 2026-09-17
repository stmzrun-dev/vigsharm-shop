"""Make near-white background of vigsharm-logo transparent via flood-fill from edges."""
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\vigsharm-shop\images\vigsharm-logo.png")
BACKUP = Path(r"C:\vigsharm-shop\images\vigsharm-logo-with-bg.png")
OUT = Path(r"C:\vigsharm-shop\images\vigsharm-logo.png")

# Threshold: treat as background if all RGB channels >= this
THRESH = 245


def is_bg(px):
    r, g, b, a = px
    return a > 0 and r >= THRESH and g >= THRESH and b >= THRESH


def main():
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    px = im.load()

    if not BACKUP.exists():
        Image.open(SRC).save(BACKUP)
        print("backup ->", BACKUP)

    # Flood-fill from all edge pixels that look like background
    stack = []
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(px[x, y]):
                stack.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(px[x, y]):
                stack.append((x, y))

    seen = set()
    while stack:
        x, y = stack.pop()
        if (x, y) in seen:
            continue
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        if not is_bg(px[x, y]):
            continue
        seen.add((x, y))
        px[x, y] = (255, 255, 255, 0)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    # Soften leftover near-white fringe near transparent pixels
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r >= 250 and g >= 250 and b >= 250:
                # only if neighbor transparent (fringe)
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        px[x, y] = (255, 255, 255, 0)
                        break

    im.save(OUT, optimize=True)
    print("wrote", OUT, "cleared", len(seen), "bg pixels")


if __name__ == "__main__":
    main()
