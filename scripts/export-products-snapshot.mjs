#!/usr/bin/env node
/**
 * Снимки витрины из Worker → data/*.json
 * (fallback, когда *.workers.dev недоступен, напр. РФ без VPN).
 *
 * Usage:
 *   node scripts/export-products-snapshot.mjs
 *   VIG_API=https://… node scripts/export-products-snapshot.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');
const DEFAULT_API = 'https://vigsharm-api.vigsharm.workers.dev';

function parseArgs(argv) {
  let url = process.env.VIG_API || DEFAULT_API;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) {
      url = argv[++i].replace(/\/$/, '');
    }
  }
  return { url: url.replace(/\/$/, '') };
}

async function getJson(endpoint, headers = {}) {
  let res;
  try {
    res = await fetch(endpoint, {
      cache: 'no-store',
      headers: { Accept: 'application/json', ...headers }
    });
  } catch (e) {
    throw new Error(
      'Сеть: не удалось достучаться до Worker. Если вы в РФ — VPN.\n' +
        `${endpoint}\n(${e.message || e})`
    );
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${endpoint}`);
  try {
    return await res.json();
  } catch {
    throw new Error('Ответ не JSON — ' + endpoint);
  }
}

function writeJson(file, payload) {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function main() {
  const { url } = parseArgs(process.argv.slice(2));
  const written = [];

  const adminKey = process.env.ADMIN_API_KEY || '';
  const productsData = await getJson(`${url}/api/products?full=1`, adminKey
    ? { Authorization: 'Bearer ' + adminKey }
    : {});
  if (!productsData || productsData.ok !== true || !Array.isArray(productsData.products)) {
    throw new Error('Каталог: нужен { ok: true, products: [...] }');
  }
  if (!productsData.products.length) {
    throw new Error('Пустой каталог — снимок не записан (чтобы не затереть рабочий файл).');
  }
  const productsFile = join(DATA, 'products.json');
  writeJson(productsFile, { ok: true, products: productsData.products });
  written.push(`products.json (${productsData.products.length})`);

  const deliveryData = await getJson(`${url}/api/delivery`);
  const city = Math.max(0, Math.round(Number(deliveryData.city)));
  const nearby = Math.max(0, Math.round(Number(deliveryData.nearby)));
  if (!deliveryData || deliveryData.ok !== true || !Number.isFinite(city) || !Number.isFinite(nearby)) {
    throw new Error('Доставка: нужен { ok: true, city, nearby, nearby_from }');
  }
  const deliveryFile = join(DATA, 'delivery.json');
  writeJson(deliveryFile, {
    ok: true,
    city,
    nearby,
    nearby_from: Number(deliveryData.nearby_from) ? 1 : 0
  });
  written.push(`delivery.json (город ${city} ₽)`);

  const priceData = await getJson(`${url}/api/price-list`);
  if (!priceData || priceData.ok !== true || !Array.isArray(priceData.items) || !priceData.items.length) {
    throw new Error('Прайс: нужен { ok: true, items: [...] }');
  }
  const priceFile = join(DATA, 'price-list.json');
  writeJson(priceFile, { ok: true, items: priceData.items });
  written.push(`price-list.json (${priceData.items.length})`);

  console.log('OK: ' + written.join(' · '));
  if (process.env.CI) {
    console.log('CI: commit data/*.json if changed (workflow step).');
  } else {
    console.log('Дальше: закоммитить data/*.json и задеплоить сайт.');
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
