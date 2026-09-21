from PIL import Image, ImageDraw, ImageChops
import os

src = r'C:\Users\79528\.cursor\projects\c-vigsharm-shop\assets'
out = r'C:\vigsharm-shop\icons'

wa = Image.open(os.path.join(src, 'c__Users_79528_AppData_Roaming_Cursor_User_workspaceStorage_6241c564afede06b937256214e19f7a9_images_WhatsApp-down-d01dee25-7233-4353-84b3-619081bd8c13.jpg')).convert('RGBA')
tg = Image.open(os.path.join(src, 'c__Users_79528_AppData_Roaming_Cursor_User_workspaceStorage_6241c564afede06b937256214e19f7a9_images_Telegram_logo.svg-ccc83f7c-7ab2-4e2a-a907-db9dfb9cd893.webp')).convert('RGBA')
mx = Image.open(os.path.join(src, 'c__Users_79528_AppData_Roaming_Cursor_User_workspaceStorage_6241c564afede06b937256214e19f7a9_images_widlbcpe6fhyklpct2ttggvkvanb8c8go4l4ai74-e131f41e-58e6-493d-8e44-208965ff0ae7.jpg')).convert('RGBA')

def to_circle(im, size=256):
    im = im.convert('RGBA')
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    im = im.crop((left, top, left + side, top + side)).resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((1, 1, size - 2, size - 2), fill=255)
    r, g, b, a = im.split()
    a = ImageChops.multiply(a, mask)
    return Image.merge('RGBA', (r, g, b, a))

def knock_near(im, thr=28):
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r <= thr and g <= thr and b <= thr:
                px[x, y] = (0, 0, 0, 0)
    return im

# WhatsApp — green logo to circle
wa_out = to_circle(wa, 256)
wa_out.save(os.path.join(out, 'bar-whatsapp.png'))

# Telegram — remove black, circle
tg2 = knock_near(tg.copy(), 30)
bbox = tg2.getbbox()
tg2 = tg2.crop(bbox)
w, h = tg2.size
side = max(w, h)
sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
sq.paste(tg2, ((side - w) // 2, (side - h) // 2), tg2)
tg_out = to_circle(sq, 256)
tg_out.save(os.path.join(out, 'bar-telegram.png'))

# MAX — tight crop on bubble only (below top text, above "max" wordmark)
mw, mh = mx.size
# From 1024 promo: bubble ~ center, y roughly 220-560, x 280-740
crop = mx.crop((int(mw * 0.24), int(mh * 0.22), int(mw * 0.76), int(mh * 0.55)))
w, h = crop.size
side = min(w, h)
crop = crop.crop(((w - side) // 2, 0, (w - side) // 2 + side, side))

px = crop.load()
cw, ch = crop.size
for y in range(ch):
    for x in range(cw):
        r, g, b, a = px[x, y]
        # knock dark purple/navy bg; keep bright cyan/blue/magenta of logo
        bright = max(r, g, b)
        if bright < 95:
            px[x, y] = (0, 0, 0, 0)
        elif r < 110 and g < 100 and b < 170 and bright < 180 and abs(b - r) < 80:
            # residual bg
            px[x, y] = (0, 0, 0, 0)

bbox = crop.getbbox()
if bbox:
    crop = crop.crop(bbox)
w, h = crop.size
side = max(w, h)
pad = int(side * 0.12)
sq = Image.new('RGBA', (side + 2 * pad, side + 2 * pad), (0, 0, 0, 0))
sq.paste(crop, (pad + (side - w) // 2, pad + (side - h) // 2), crop)
mx_out = sq.resize((256, 256), Image.Resampling.LANCZOS)
# soft circular clip so edges are clean in round button
mx_out = to_circle(mx_out, 256)
mx_out.save(os.path.join(out, 'bar-max.png'))

print('ok', wa_out.size, tg_out.size, mx_out.size)
