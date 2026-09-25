#!/usr/bin/env node
/**
 * План Б — статические OG-страницы для мессенджеров (без Cloudflare Proxy).
 *
 * Читает data/products.json → пишет p/<slug>.html с og:* и JS-редиректом
 * на product.html?slug=… (боты JS не выполняют → видят превью).
 *
 * Usage:
 *   node scripts/generate-og-pages.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SITE = 'https://vigsharm.ru';
const FALLBACK_IMAGE = SITE + '/images/hero-balloon-character-party.webp';
const OUT_DIR = join(ROOT, 'p');

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,120}$/i;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPriceRu(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  return Math.round(num).toLocaleString('ru-RU');
}

function formatDescription(product) {
  let parts = product && product.composition;
  if (Array.isArray(parts)) {
    parts = parts.map((s) => String(s || '').trim()).filter(Boolean);
  } else {
    parts = String(parts || '')
      .split(/\n+|•|;/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (parts.length) return parts.join(' · ').slice(0, 300);
  const short = String(
    product?.short_description || product?.seo_description || ''
  ).trim();
  if (short) return short.slice(0, 300);
  return 'Композиция из воздушных шаров с доставкой по Армавиру от студии VigSharm.';
}

function productImage(product) {
  const candidates = [];
  if (product?.main_photo) candidates.push(product.main_photo);
  if (Array.isArray(product?.photos)) {
    for (const p of product.photos) {
      if (typeof p === 'string') candidates.push(p);
      else if (p && typeof p.url === 'string') candidates.push(p.url);
    }
  }
  for (const raw of candidates) {
    const u = String(raw || '').trim();
    if (!u || u.startsWith('data:')) continue;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    const path = u.replace(/^\.\//, '').replace(/^(\.\.\/)+/, '');
    if (path.startsWith('/')) return SITE + path;
    return SITE + '/' + path;
  }
  return FALLBACK_IMAGE;
}

function imageType(url) {
  const path = String(url).split('?')[0].toLowerCase();
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function buildPage(product) {
  const slug = String(product.slug || '').trim();
  const titleName = String(product.title || 'Композиция из шаров').trim();
  const priceLabel = formatPriceRu(product.price);
  const ogTitle = `${titleName} — ${priceLabel} ₽ | VigSharm`;
  const ogDescription = formatDescription(product);
  const ogImage = productImage(product);
  const pageUrl = `${SITE}/p/${encodeURIComponent(slug)}.html`;
  const productUrl = `${SITE}/product.html?slug=${encodeURIComponent(slug)}`;
  const imgType = imageType(ogImage);

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(ogTitle)}</title>
<meta name="description" content="${esc(ogDescription)}"/>
<meta name="robots" content="noindex"/>
<meta property="og:title" content="${esc(ogTitle)}"/>
<meta property="og:description" content="${esc(ogDescription)}"/>
<meta property="og:type" content="website"/>
<meta property="og:locale" content="ru_RU"/>
<meta property="og:site_name" content="VigSharm"/>
<meta property="og:url" content="${esc(pageUrl)}"/>
<meta property="og:image" content="${esc(ogImage)}"/>
<meta property="og:image:type" content="${esc(imgType)}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(ogTitle)}"/>
<meta name="twitter:description" content="${esc(ogDescription)}"/>
<meta name="twitter:image" content="${esc(ogImage)}"/>
<link rel="canonical" href="${esc(productUrl)}"/>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<script>location.replace(${JSON.stringify('/product.html?slug=' + slug)});</script>
</head>
<body>
<p><a href="${esc(productUrl)}">Открыть «${esc(titleName)}» на VigSharm</a></p>
</body>
</html>
`;
}

function main() {
  const productsFile = join(ROOT, 'data', 'products.json');
  if (!existsSync(productsFile)) {
    throw new Error('Нет data/products.json — сначала sync snapshot');
  }
  const data = JSON.parse(readFileSync(productsFile, 'utf8'));
  if (!data || data.ok !== true || !Array.isArray(data.products)) {
    throw new Error('products.json: нужен { ok: true, products: [...] }');
  }

  if (existsSync(OUT_DIR)) {
    rmSync(OUT_DIR, { recursive: true, force: true });
  }
  mkdirSync(OUT_DIR, { recursive: true });

  let written = 0;
  let skipped = 0;
  const used = new Set();

  for (const product of data.products) {
    if (!product || product.show_on_site === false) {
      skipped++;
      continue;
    }
    const slug = String(product.slug || '').trim();
    if (!slug || !SLUG_RE.test(slug)) {
      skipped++;
      continue;
    }
    const key = slug.toLowerCase();
    if (used.has(key)) {
      skipped++;
      continue;
    }
    used.add(key);
    writeFileSync(join(OUT_DIR, `${slug}.html`), buildPage(product), 'utf8');
    written++;
  }

  writeFileSync(
    join(OUT_DIR, 'README.md'),
    '# OG share pages (generated)\n\nНе редактировать вручную. Генерация: `node scripts/generate-og-pages.mjs` (в CI при деплое Pages).\n',
    'utf8'
  );

  console.log(`OG pages: ${written} written → p/*.html (${skipped} skipped)`);
}

main();
