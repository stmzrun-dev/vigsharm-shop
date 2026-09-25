#!/usr/bin/env python3
"""Generate sitemap.xml for vigsharm.ru from data/products.json"""
import json
import datetime
import os

BASE = 'https://vigsharm.ru'
ROOT = os.path.join(os.path.dirname(__file__), '..')

with open(os.path.join(ROOT, 'data', 'products.json'), encoding='utf-8') as f:
    data = json.load(f)

prods = data.get('products', data)
today = datetime.date.today().isoformat()

lines = []
lines.append('<?xml version="1.0" encoding="UTF-8"?>')
lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

# Static pages
static = [
    ('/', '1.0', 'weekly'),
    ('/catalog.html', '0.9', 'weekly'),
    ('/delivery.html', '0.7', 'monthly'),
    ('/price.html', '0.7', 'monthly'),
]
for path, pri, freq in static:
    lines.append('  <url>')
    lines.append('    <loc>' + BASE + path + '</loc>')
    lines.append('    <lastmod>' + today + '</lastmod>')
    lines.append('    <changefreq>' + freq + '</changefreq>')
    lines.append('    <priority>' + pri + '</priority>')
    lines.append('  </url>')

# Product pages — canonical URL as used in orderMessage: /p/<slug>.html
count = 0
for p in prods:
    slug = str(p.get('slug') or '').strip()
    if not slug:
        continue
    lines.append('  <url>')
    lines.append('    <loc>' + BASE + '/p/' + slug + '.html</loc>')
    lines.append('    <lastmod>' + today + '</lastmod>')
    lines.append('    <changefreq>monthly</changefreq>')
    lines.append('    <priority>0.6</priority>')
    lines.append('  </url>')
    count += 1

lines.append('</urlset>')

out_path = os.path.join(ROOT, 'sitemap.xml')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')

print(f'sitemap.xml written: {len(static)} static + {count} products = {len(static)+count} URLs total')
