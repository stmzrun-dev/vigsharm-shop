#!/usr/bin/env node
/**
 * Verifies vigNormalizeProduct maps admin + legacy client_options
 * and storefront visibility rules.
 */
import { readFileSync } from 'fs';
import vm from 'vm';

const src = readFileSync(new URL('../assets/site.js', import.meta.url), 'utf8');
const sandbox = {
  window: { addEventListener() {}, removeEventListener() {} },
  document: {
    readyState: 'complete',
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; },
    body: { appendChild() {}, style: {} }
  },
  location: { protocol: 'https:', href: 'https://example.test/' },
  navigator: { share: undefined, clipboard: undefined },
  console
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const { vigNormalizeProduct, vigIsStorefrontVisible, vigStorefrontProducts } = sandbox.window;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const adminFlat = vigNormalizeProduct({
  title: 'A',
  article: 'BOY-001',
  photos: ['x'],
  composition: ['a'],
  status: 'published',
  show_on_site: true,
  client_options: {
    available_on_request: true,
    number_choice: true,
    personal_inscription: true,
    photozone_rental: true
  }
});
assert(adminFlat.has_digit_choice === true, 'number_choice → has_digit_choice');
assert(adminFlat.digit_count_on_photo === 1, 'default digit_count_on_photo = 1');
assert(adminFlat.has_inscription === true, 'personal_inscription → has_inscription');
assert(adminFlat.inscription_price === 0, 'default inscription_price = 0');
assert(adminFlat.has_rental === true, 'photozone_rental → has_rental');
assert(adminFlat.available_on_request === true, 'available_on_request mapped');
assert(/фотозон/i.test(adminFlat.rental_item || ''), 'rental default item');

const legacy = vigNormalizeProduct({
  title: 'B',
  status: 'published',
  show_on_site: 1,
  client_options: {
    digit_choice: { enabled: true, count_on_photo: 2 },
    inscription: { enabled: true, price: 200 },
    rental: { enabled: true, item: 'Арка', days: 2, keep_price_delta: 500 }
  }
});
assert(legacy.has_digit_choice && legacy.digit_count_on_photo === 2, 'legacy digit_choice');
assert(legacy.has_inscription && legacy.inscription_price === 200, 'legacy inscription');
assert(legacy.has_rental && legacy.rental_item === 'Арка' && legacy.rental_days === 2, 'legacy rental');

assert(vigIsStorefrontVisible({ status: 'published', show_on_site: true }) === true, 'visible published+on');
assert(vigIsStorefrontVisible({ status: 'draft', show_on_site: true }) === false, 'hide draft');
assert(vigIsStorefrontVisible({ status: 'published', show_on_site: false }) === true, 'published still visible if show_on_site false');

const withPhotos = vigNormalizeProduct({
  title: 'C',
  status: 'published',
  photos: ['https://res.cloudinary.com/example/a.png'],
  main_photo: 'https://res.cloudinary.com/example/a.png'
});
assert(withPhotos.image_keys[0].indexOf('cloudinary') > 0, 'photos → image_keys');
assert(sandbox.window.vigProductPhoto(withPhotos).indexOf('cloudinary') > 0, 'vigProductPhoto');
assert(sandbox.window.vigImage('../images/category-girl.png') === 'images/category-girl.png', 'relative image path');
assert(sandbox.window.vigImage('https://cdn.example/x.webp') === 'https://cdn.example/x.webp', 'https passthrough');

const list = vigStorefrontProducts([
  { id: 1, status: 'published', show_on_site: true, client_options: { number_choice: true }, photos: ['https://x/1.png'] },
  { id: 2, status: 'draft', show_on_site: true, client_options: {} },
  { id: 3, status: 'published', show_on_site: false, client_options: {}, photos: ['https://x/3.png'] }
]);
assert(list.length === 2, 'vigStorefrontProducts keeps published even if show_on_site false');
assert(list[0].has_digit_choice === true, 'storefront list still maps options');
assert(list.every(function (p) { return !!sandbox.window.vigProductPhoto(p); }), 'photos resolved');

console.log('✓ client options normalize + visibility OK');
