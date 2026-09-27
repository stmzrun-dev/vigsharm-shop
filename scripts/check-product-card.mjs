/**
 * Перед выкладкой открывает несколько карточек тем же скриптом, что и сайт.
 * Если страница падает (как когда из скрипта пропали надпись, дата и время),
 * команда завершается с ошибкой и GitHub Pages не обновляется.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productsPath = path.join(root, 'data', 'products.json');
const deliveryPath = path.join(root, 'data', 'delivery.json');
const sitePath = path.join(root, 'assets', 'site.js');
const productJsPath = path.join(root, 'assets', 'product.js');

const catalog = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
const products = Array.isArray(catalog) ? catalog : (catalog.products || []);
const delivery = fs.existsSync(deliveryPath)
  ? JSON.parse(fs.readFileSync(deliveryPath, 'utf8'))
  : { ok: true, city: 200 };
const siteJs = fs.readFileSync(sitePath, 'utf8');
const productJs = fs.readFileSync(productJsPath, 'utf8');

function visible(p) {
  if (!p) return false;
  if (p.status && p.status !== 'published') return false;
  if (p.show_on_site == null || p.show_on_site === '') return true;
  return p.show_on_site === true || p.show_on_site === 1 || p.show_on_site === '1';
}

function tagsOf(p) {
  return Array.isArray(p.tags) ? p.tags : [];
}

function pickCards() {
  const list = products.filter(visible);
  if (!list.length) throw new Error('В снимке каталога нет ни одной видимой карточки');
  const picked = [];
  function take(p, why) {
    if (!p || !p.slug) return;
    if (picked.some(function (x) { return x.slug === p.slug; })) return;
    picked.push({ slug: p.slug, title: p.title, why: why });
  }
  take(list[0], 'первая в каталоге');
  take(list.find(function (p) {
    const opts = p.client_options || {};
    return opts.unit_type === 'bubble' || tagsOf(p).indexOf('Шары Bubble') >= 0;
  }), 'баблс');
  take(list.find(function (p) { return tagsOf(p).indexOf('Цена за метр') >= 0; }), 'цена за метр');
  take(list.find(function (p) {
    return p.category && p.category !== 'Шары поштучно' && tagsOf(p).indexOf('Шары поштучно') < 0;
  }), 'композиция');
  return picked;
}

function classList() {
  const names = new Set();
  return {
    add: function () { for (let i = 0; i < arguments.length; i++) names.add(arguments[i]); },
    remove: function () { for (let i = 0; i < arguments.length; i++) names.delete(arguments[i]); },
    toggle: function (name, on) {
      if (on === true) names.add(name);
      else if (on === false) names.delete(name);
      else if (names.has(name)) names.delete(name);
      else names.add(name);
    },
    contains: function (name) { return names.has(name); }
  };
}

function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    attrs: {},
    style: {},
    classList: classList(),
    className: '',
    children: [],
    parentNode: null,
    textContent: '',
    value: '',
    hidden: false,
    href: '',
    id: '',
    type: '',
    innerHTML: '',
    setAttribute: function (key, value) {
      this.attrs[key] = String(value);
      if (key === 'class') this.className = String(value);
      if (key === 'id') this.id = String(value);
    },
    getAttribute: function (key) {
      return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null;
    },
    hasAttribute: function (key) { return Object.prototype.hasOwnProperty.call(this.attrs, key); },
    addEventListener: function () {},
    removeEventListener: function () {},
    appendChild: function (child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild: function (child) {
      this.children = this.children.filter(function (item) { return item !== child; });
    },
    remove: function () {},
    focus: function () {},
    blur: function () {},
    closest: function () { return null; },
    getBoundingClientRect: function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  return el;
}

function parseTags(html) {
  const nodes = [];
  const re = /<([a-zA-Z][\w:-]*)([^>]*)>/g;
  let match;
  while ((match = re.exec(html))) {
    const node = makeEl(match[1]);
    const attrRe = /([\w:-]+)\s*=\s*"([^"]*)"/g;
    let attr;
    while ((attr = attrRe.exec(match[2] || ''))) node.setAttribute(attr[1], attr[2]);
    nodes.push(node);
  }
  return nodes;
}

function queryAll(html, selector) {
  const nodes = parseTags(html);
  const parts = String(selector || '').split(',').map(function (part) { return part.trim(); }).filter(Boolean);
  return nodes.filter(function (node) {
    return parts.some(function (part) {
      const bits = part.split(/\s+/);
      const last = bits[bits.length - 1];
      if (last.charAt(0) === '.') return (node.className || '').split(/\s+/).indexOf(last.slice(1)) >= 0;
      if (last.charAt(0) === '[') {
        const name = last.slice(1, -1).split('=')[0];
        return node.hasAttribute(name);
      }
      return node.tagName === last.toUpperCase();
    });
  });
}

function installRoot(el) {
  let html = '';
  Object.defineProperty(el, 'innerHTML', {
    configurable: true,
    get: function () { return html; },
    set: function (value) { html = String(value == null ? '' : value); }
  });
  el.querySelectorAll = function (selector) { return queryAll(html, selector); };
  el.querySelector = function (selector) {
    const found = queryAll(html, selector);
    return found[0] || null;
  };
  return el;
}

function openCard(slug) {
  const pageUrl = 'https://vigsharm.ru/product.html?slug=' + encodeURIComponent(slug);
  const rootEl = installRoot(makeEl('div'));
  rootEl.id = 'product-root';
  const head = makeEl('head');
  const body = makeEl('body');
  const sandbox = {
    console: console,
    URL: URL,
    URLSearchParams: URLSearchParams,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    queueMicrotask: queueMicrotask,
    requestAnimationFrame: function (fn) { return setTimeout(fn, 0); },
    cancelAnimationFrame: function (id) { clearTimeout(id); },
    AbortController: AbortController,
    fetch: function (url) {
      const address = String(url);
      let payload = null;
      if (address.indexOf('products') >= 0) payload = catalog;
      else if (address.indexOf('delivery') >= 0) payload = delivery;
      return Promise.resolve({
        ok: !!payload,
        status: payload ? 200 : 404,
        json: function () { return Promise.resolve(payload || {}); }
      });
    },
    navigator: {},
    localStorage: {
      getItem: function () { return null; },
      setItem: function () {},
      removeItem: function () {}
    },
    history: { replaceState: function () {}, pushState: function () {} },
    location: new URL(pageUrl),
    scrollY: 0,
    scrollTo: function () {},
    innerHeight: 800,
    innerWidth: 390,
    addEventListener: function () {},
    removeEventListener: function () {},
    matchMedia: function () {
      return {
        matches: false,
        addEventListener: function () {},
        removeEventListener: function () {},
        addListener: function () {},
        removeListener: function () {}
      };
    }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    readyState: 'complete',
    title: '',
    body: body,
    head: head,
    documentElement: makeEl('html'),
    scrollingElement: { scrollHeight: 2000 },
    activeElement: null,
    getElementById: function (id) { return id === 'product-root' ? rootEl : null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    createElement: makeEl,
    addEventListener: function () {},
    removeEventListener: function () {},
    execCommand: function () { return false; }
  };
  vm.createContext(sandbox);
  vm.runInContext(siteJs, sandbox, { filename: 'assets/site.js' });
  vm.runInContext(productJs, sandbox, { filename: 'assets/product.js' });
  return new Promise(function (resolve) {
    setTimeout(function () { resolve(rootEl.innerHTML); }, 0);
  });
}

const cards = pickCards();
const failures = [];
for (const card of cards) {
  try {
    const html = await openCard(card.slug);
    const opened = html.indexOf(card.title) >= 0
      && html.indexOf('Не удалось открыть композицию') < 0
      && html.indexOf('Композиция не найдена') < 0
      && html.indexOf('product-page') >= 0;
    if (!opened) {
      const hint = html.indexOf('Не удалось открыть') >= 0
        ? 'скрипт карточки упал'
        : 'страница собралась без названия товара';
      failures.push(card.title + ' (' + card.why + '): ' + hint);
    } else {
      console.log('ok  ' + card.why + ' — ' + card.title);
    }
  } catch (err) {
    failures.push(card.title + ' (' + card.why + '): ' + (err && err.stack ? err.stack : err));
  }
}

if (failures.length) {
  console.error('Карточка не открылась. Сайт не будет обновлён.');
  failures.forEach(function (line) { console.error('  ' + line); });
  process.exit(1);
}
console.log('Карточки открываются, можно выкладывать сайт.');
