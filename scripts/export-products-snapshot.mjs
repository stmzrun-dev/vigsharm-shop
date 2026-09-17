#!/usr/bin/env node
/**
 * Выгрузка снимка каталога из Worker → data/products.json
 * (fallback для витрины, когда *.workers.dev недоступен, напр. РФ без VPN).
 *
 * Usage:
 *   node scripts/export-products-snapshot.mjs
 *   VIG_API=https://… node scripts/export-products-snapshot.mjs
 *   node scripts/export-products-snapshot.mjs --url https://…
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'data', 'products.json');
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

async function main() {
  const { url } = parseArgs(process.argv.slice(2));
  const endpoint = `${url}/api/products`;
  console.log(`Fetching ${endpoint} …`);

  let res;
  try {
    res = await fetch(endpoint, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
  } catch (e) {
    console.error(
      'Сеть: не удалось достучаться до Worker.\n' +
        'Если вы в РФ — включите VPN и повторите.\n' +
        `(${e.message || e})`
    );
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    console.error('Ответ не JSON');
    process.exit(1);
  }

  if (!data || data.ok !== true || !Array.isArray(data.products)) {
    console.error('Неожиданный формат: нужен { ok: true, products: [...] }');
    process.exit(1);
  }

  if (!data.products.length) {
    console.error('Пустой каталог — снимок не записан (чтобы не затереть рабочий файл).');
    process.exit(1);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  const body = JSON.stringify({ ok: true, products: data.products }, null, 2) + '\n';
  writeFileSync(OUT, body, 'utf8');

  console.log(`OK: ${data.products.length} товаров → ${OUT}`);
  if (process.env.CI) {
    console.log('CI: commit data/products.json if changed (workflow step).');
  } else {
    console.log('Дальше: закоммитить data/products.json и задеплоить сайт.');
  }
}

main();
