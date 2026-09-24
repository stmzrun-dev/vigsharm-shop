# -*- coding: utf-8 -*-
"""Одноразовый скрипт: clay-иконки -> WebP + пережатие тяжёлых PNG (2026-09-24)."""
import os, shutil
from PIL import Image

ROOT = r"C:\vigsharm-shop"
GEN = r"C:\Users\79528\.cursor\projects\c-vigsharm-shop\assets"
ARCHIVE = os.path.join(ROOT, "_archive", "icons-photoreal-20260924")
os.makedirs(ARCHIVE, exist_ok=True)

def save_webp(src, dst, size, quality=82):
    im = Image.open(src)
    im = im.convert("RGBA") if im.mode != "RGBA" else im
    im.thumbnail((size, size), Image.LANCZOS)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst, "WEBP", quality=quality, method=6)
    return os.path.getsize(dst)

log = []

# 1) Новые clay comp-иконки -> icons/comp-<key>.webp (128px, показ 32px)
COMP_KEYS = ["bouquet","box","chrome","bubble","confetti","star","heart",
             "digit","photozone","figure","floor","tulip","print","latex"]
for k in COMP_KEYS:
    src = os.path.join(GEN, "comp-%s-clay.png" % k)
    dst = os.path.join(ROOT, "icons", "comp-%s.webp" % k)
    log.append(("comp-%s.webp" % k, save_webp(src, dst, 128)))

# 2) group-all -> webp 256
log.append(("group-all.webp", save_webp(os.path.join(GEN, "group-all-clay.png"),
            os.path.join(ROOT, "icons", "group-all.webp"), 256)))

# 3) who-плитки -> images/who/*.webp 512
for name in ["her","him","girl","boy"]:
    src = os.path.join(GEN, "who-%s-clay.png" % name)
    dst = os.path.join(ROOT, "images", "who", "who-%s.webp" % name)
    log.append(("who-%s.webp" % name, save_webp(src, dst, 512)))

# 4) Пережать используемые тяжёлые PNG -> webp рядом
HEAVY = {
    256: ["menu-about","menu-catalog","menu-checklist","menu-delivery","menu-price","menu-phone",
          "group-balloons","group-characters","group-holidays","group-ready",
          "budget-ruble","clay-pin","dt-date","dt-time","ful-city","ful-far","ful-pickup",
          "ins-balloon","phone-smartphone"],
    128: ["brand-instagram","brand-max","brand-telegram","brand-vk","brand-whatsapp"],
}
for size, names in HEAVY.items():
    for n in names:
        src = os.path.join(ROOT, "icons", n + ".png")
        if os.path.exists(src):
            log.append((n + ".webp", save_webp(src, os.path.join(ROOT, "icons", n + ".webp"), size)))

# digits 128px
for pref in ["on","off"]:
    for d in range(10):
        src = os.path.join(ROOT, "icons", "digits", "%s-%d.png" % (pref, d))
        log.append(("digits/%s-%d.webp" % (pref, d),
                    save_webp(src, os.path.join(ROOT, "icons", "digits", "%s-%d.webp" % (pref, d)), 128)))

# sections: сохранить пропорции, ширина до 640
for base in ["balloons","heroes","holidays","ready"]:
    for st in ["on","off"]:
        src = os.path.join(ROOT, "icons", "sections", "section-%s-%s.png" % (base, st))
        im = Image.open(src).convert("RGBA")
        im.thumbnail((640, 640), Image.LANCZOS)
        dst = os.path.join(ROOT, "icons", "sections", "section-%s-%s.webp" % (base, st))
        im.save(dst, "WEBP", quality=82, method=6)
        log.append(("sections/section-%s-%s.webp" % (base, st), os.path.getsize(dst)))

# 5) Архив: старые фотореалистичные comp-* и budget-ruble оригинал
for f in os.listdir(os.path.join(ROOT, "icons")):
    if f.startswith("comp-") and f.endswith(".png"):
        shutil.move(os.path.join(ROOT, "icons", f), os.path.join(ARCHIVE, f))
        log.append(("ARCHIVED " + f, 0))
shutil.move(os.path.join(ROOT, "icons", "budget-ruble.png"), os.path.join(ARCHIVE, "budget-ruble.png"))
log.append(("ARCHIVED budget-ruble.png", 0))

for name, sz in log:
    print("%-40s %8.1f KB" % (name, sz / 1024.0))
