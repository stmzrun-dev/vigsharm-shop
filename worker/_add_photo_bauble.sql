INSERT INTO products (
  id, title, article, price, short_description, full_description, composition, category, character, age_group, budget, series_name, occasion, target_audience, seo_title, seo_description, slug, scene, tags, client_options, photos, main_photo, thumb_photo, status, show_on_site, created_at, updated_at
) VALUES (
  'c2f4a7d9-5b1e-4e86-9a3c-7d0e6b1f8a42',
  'Ёлочный фотошар',
  'NY-006',
  600,
  'Прозрачный шар 8 см со снежком и вашим фото, атласный бант на выбор, в коробочке с окошком.',
  'Ваше фото внутри прозрачного ёлочного шара 8 см со снежком. На обороте второе фото или надпись. Бант любого цвета. Каждый шар в коробочке с окошком.',
  '["прозрачный шар 8 см со снежком","фото с двух сторон или фото и надпись","атласный бант","коробочка с окошком"]',
  'Новый год',
  NULL,
  'Для любого возраста',
  'до 1 000 ₽',
  NULL,
  NULL,
  NULL,
  'Ёлочный фотошар — Армавир | VigSharm',
  'Прозрачный ёлочный фотошар 8 см с вашим фото и снежком внутри, в коробочке с окошком. 600 ₽. Армавир.',
  'elochnyj-shar-s-foto',
  'auto',
  '["Новый год"]',
  '{"available_on_request":false,"advance_order_1_2_days":true,"number_choice":false,"personal_inscription":true,"photozone_rental":false,"catalog_pin":true,"balloon_size":"8 см","price_caption":"Цена за шар","order_page":"bauble-photo-lite.html"}',
  '["https://vigsharm.ru/preview/bauble-photo-in-hand.webp?v=1","https://vigsharm.ru/preview/bauble-photo-side.webp?v=1","https://vigsharm.ru/preview/bauble-photo-gift-box.webp?v=2","https://vigsharm.ru/preview/bauble-photo-set.webp?v=1"]',
  'https://vigsharm.ru/preview/bauble-photo-in-hand.webp?v=1',
  'https://vigsharm.ru/preview/bauble-photo-in-hand.webp?v=1',
  'published',
  1,
  '2026-10-26T08:00:00.000Z',
  '2026-10-28T16:30:00.000Z'
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  article = excluded.article,
  price = excluded.price,
  short_description = excluded.short_description,
  full_description = excluded.full_description,
  composition = excluded.composition,
  category = excluded.category,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  slug = excluded.slug,
  tags = excluded.tags,
  client_options = excluded.client_options,
  photos = excluded.photos,
  main_photo = excluded.main_photo,
  thumb_photo = excluded.thumb_photo,
  status = 'published',
  show_on_site = 1,
  updated_at = excluded.updated_at;

UPDATE products SET
  photos = '["https://vigsharm.ru/preview/bauble-ex-gift.webp?v=4"]',
  main_photo = 'https://vigsharm.ru/preview/bauble-ex-gift.webp?v=4',
  thumb_photo = 'https://vigsharm.ru/preview/bauble-ex-gift.webp?v=4',
  updated_at = '2026-10-29T05:45:00.000Z'
WHERE id = '136e5181-f581-41c7-9c7a-c5df00d4968b'
  AND slug = 'imennoj-elochnyj-shar';
