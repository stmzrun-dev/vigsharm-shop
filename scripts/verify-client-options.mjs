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
    advance_order_1_2_days: true,
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
assert(adminFlat.needs_advance_order === true, 'advance_order_1_2_days mapped');
assert(/фотозон/i.test(adminFlat.rental_item || ''), 'rental default item');

const floorFallback = vigNormalizeProduct({
  title: 'Floor',
  scene: 'floor',
  status: 'published',
  client_options: {}
});
assert(floorFallback.needs_advance_order === true, 'floor scene implies advance order');

const figuresAdvance = vigNormalizeProduct({
  title: 'Figure',
  scene: 'balloon_figures',
  status: 'published',
  client_options: {}
});
assert(figuresAdvance.needs_advance_order === true, 'balloon_figures implies advance order');

const wallInscription = vigNormalizeProduct({
  title: 'Wall bubble',
  scene: 'wall_only',
  status: 'published',
  composition: ['10 шаров', '1 баблс с надписью', '1 звезда с надписью'],
  client_options: {}
});
assert(wallInscription.has_inscription === true, 'wall_only + «с надписью» in composition → has_inscription');

const floorInscription = vigNormalizeProduct({
  title: 'Floor set',
  scene: 'floor',
  status: 'published',
  composition: ['1 сердце с надписью', 'арка'],
  client_options: {}
});
assert(floorInscription.has_inscription === true, 'floor + «с надписью» in composition → has_inscription');

const wallNoInscription = vigNormalizeProduct({
  title: 'Wall plain',
  scene: 'wall_only',
  status: 'published',
  composition: ['1 баблс с перьями', '5 латексных'],
  client_options: {}
});
assert(wallNoInscription.has_inscription === false, 'wall_only without надпись stays off');

const boxInscription = vigNormalizeProduct({
  title: 'Box',
  scene: 'floor',
  status: 'published',
  composition: ['коробка 70x70x70 с индивидуальной надписью', 'шары'],
  client_options: {}
});
assert(boxInscription.has_inscription === true, 'коробка с индивидуальной надписью → has_inscription');

const boxShort = vigNormalizeProduct({
  title: 'Box short',
  scene: 'floor',
  status: 'published',
  composition: ['коробка', 'шары'],
  client_options: {}
});
assert(boxShort.has_inscription === true, 'просто «коробка» → has_inscription');

const floorOneDigit = vigNormalizeProduct({
  title: 'Floor 1',
  scene: 'floor',
  status: 'published',
  composition: ['10 шаров', '1 цифра', 'звезда'],
  client_options: {}
});
assert(floorOneDigit.has_digit_choice === true, 'floor + «1 цифра» → digit choice');
assert(floorOneDigit.digit_count_on_photo === 1, 'floor one digit count');
assert(floorOneDigit.digit_count_locked === true, 'floor digit count locked');

const floorTwoDigits = vigNormalizeProduct({
  title: 'Floor 2',
  scene: 'floor',
  status: 'published',
  composition: ['2 фольгированные цифры', 'арка'],
  client_options: { number_choice: true, digit_choice: { enabled: true, count_on_photo: 2 } }
});
assert(floorTwoDigits.digit_count_on_photo === 2, 'floor two digits');
assert(floorTwoDigits.digit_count_locked === true, 'floor two digits locked');

const wallTwoDigits = vigNormalizeProduct({
  title: 'Wall 2',
  scene: 'wall_only',
  status: 'published',
  composition: ['две цифры', 'баблс'],
  client_options: {}
});
assert(wallTwoDigits.has_digit_choice === true, 'wall + «две цифры» → digit choice');
assert(wallTwoDigits.digit_count_on_photo === 2, 'wall two digits');
assert(wallTwoDigits.digit_count_locked === true, 'wall digit count locked');

const pzFrame = vigNormalizeProduct({
  title: 'PZ frame',
  scene: 'photozone',
  status: 'published',
  client_options: { photozone_type: 'frame' }
});
assert(pzFrame.needs_advance_order === true, 'photozone implies advance');
assert(pzFrame.has_rental === true, 'photozone implies rental');
assert(pzFrame.rental_item === 'Каркас фотозоны', 'frame rental item');
assert(pzFrame.rental_days === 3, 'photozone free days = 3');
assert(pzFrame.keep_price_delta === 500, 'photozone extra = 500/day');

const pzEasel = vigNormalizeProduct({
  title: 'PZ easel',
  scene: 'photozone',
  status: 'published',
  client_options: {
    photozone_type: 'easel',
    rental: { enabled: true, item: 'Мольберт с кругом из полистирола', days: 3, keep_price_delta: 500 }
  }
});
assert(pzEasel.has_rental === true, 'easel rental on');
assert(pzEasel.has_inscription === true, 'easel implies inscription');
assert(/мольбер/i.test(pzEasel.rental_item || ''), 'easel rental item');
assert(pzEasel.keep_price_delta === 500, 'easel keep_price_delta');

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
