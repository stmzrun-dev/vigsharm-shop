# -*- coding: utf-8 -*-
"""Одноразовый скрипт: переключить ссылки с .png/.jpg на .webp (2026-09-24)."""
import os, re

ROOT = r"C:\vigsharm-shop"
FILES = [
    "catalog.html", "product.html", "price.html", "delivery.html", "index.html",
    "preview-home.html", "preview-inventory.html", "preview-catalog-pick.html",
    os.path.join("assets", "catalog.js"),
    os.path.join("assets", "catalog-nav.js"),
    os.path.join("assets", "product.js"),
    os.path.join("assets", "site.js"),
]

NAMES = (["comp-%s" % k for k in
          "bouquet box chrome bubble confetti star heart digit photozone figure floor tulip print latex".split()]
         + ["group-all", "group-balloons", "group-characters", "group-holidays", "group-ready",
            "menu-about", "menu-catalog", "menu-checklist", "menu-delivery", "menu-price", "menu-phone",
            "budget-ruble", "clay-pin", "dt-date", "dt-time", "ful-city", "ful-far", "ful-pickup",
            "ins-balloon", "phone-smartphone",
            "brand-instagram", "brand-max", "brand-telegram", "brand-vk", "brand-whatsapp"])

for rel in FILES:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        continue
    with open(p, encoding="utf-8") as f:
        s = f.read()
    orig = s
    for n in NAMES:
        # не трогаем .prev.png
        s = re.sub(re.escape(n) + r"\.png", n + ".webp", s)
    # digits (конкатенация в JS: 'icons/digits/off-' + d + '.png?v=1')
    s = s.replace("'icons/digits/off-' + d + '.png", "'icons/digits/off-' + d + '.webp")
    s = s.replace("'icons/digits/on-' + d + '.png", "'icons/digits/on-' + d + '.webp")
    s = re.sub(r"(icons/digits/(?:on|off)-\d)\.png", r"\1.webp", s)
    # sections
    s = re.sub(r"(icons/sections/section-[a-z]+-(?:on|off))\.png", r"\1.webp", s)
    # who-плитки
    s = re.sub(r"(images/who/who-(?:her|him|girl|boy))\.jpg", r"\1.webp", s)
    if s != orig:
        with open(p, "w", encoding="utf-8", newline="") as f:
            f.write(s)
        print("updated", rel)
print("done")
