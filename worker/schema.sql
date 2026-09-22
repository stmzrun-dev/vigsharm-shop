-- VigSharm D1 Migration — Products schema
-- Запустить: wrangler d1 execute vigsharm-db --file=./schema.sql

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  article TEXT UNIQUE,
  price INTEGER NOT NULL DEFAULT 0,
  short_description TEXT,
  full_description TEXT,
  composition TEXT DEFAULT '[]',
  category TEXT,
  character TEXT,
  age_group TEXT DEFAULT 'Для любого возраста',
  budget TEXT,
  series_name TEXT,
  occasion TEXT,
  target_audience TEXT,
  seo_title TEXT,
  seo_description TEXT,
  slug TEXT UNIQUE,
  scene TEXT DEFAULT 'auto',
  tags TEXT DEFAULT '[]',
  client_options TEXT DEFAULT '{}',
  photos TEXT DEFAULT '[]',
  main_photo TEXT,
  status TEXT DEFAULT 'draft',
  show_on_site INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_article ON products(article);

-- Вставка стандартных категорий
INSERT OR IGNORE INTO categories (id, name, slug, sort_order) VALUES
  ('cat-01', 'Для девочки', 'dlya-devochki', 1),
  ('cat-02', 'Для мальчика', 'dlya-malchika', 2),
  ('cat-03', 'Для неё', 'dlya-neyo', 3),
  ('cat-04', 'Для мамы', 'dlya-mamy', 4),
  ('cat-05', 'Для него', 'dlya-nego', 5),
  ('cat-06', 'Геймерам', 'geymeram', 6),
  ('cat-07', 'Юбилей', 'yubiley', 7),
  ('cat-08', '1 годик', '1-godik', 8),
  ('cat-09', 'Крещение', 'kreshchenie', 9),
  ('cat-10', 'Гендер-пати', 'gender-pati', 10),
  ('cat-11', 'На выписку', 'na-vypisku', 11),
  ('cat-12', 'Свадьба и девичник', 'svadba-i-devichnik', 12),
  ('cat-13', 'Выпускной', 'vypusknoy', 13),
  ('cat-14', 'Новый год', 'novyy-god', 14),
  ('cat-15', '14 февраля', '14-fevralya', 15),
  ('cat-16', '23 февраля', '23-fevralya', 16),
  ('cat-17', '8 марта', '8-marta', 17),
  ('cat-18', '1 сентября', '1-sentyabrya', 18),
  ('cat-19', 'Фигуры из шаров', 'figury-iz-sharov', 19),
  ('cat-20', 'Напольные композиции', 'napolnye-kompozicii', 20),
  ('cat-21', 'Букет из шаров', 'buket-iz-sharov', 21),
  ('cat-22', 'Цветы из шаров', 'cvety-iz-sharov', 22),
  ('cat-23', 'Крафтовый букет', 'kraftovyy-buket', 23),
  ('cat-24', 'Шар-сюрприз', 'shar-syurpriz', 24),
  ('cat-25', 'Коробка-сюрприз', 'korobka-syurpriz', 25),
  ('cat-26', 'Фотозона', 'fotozona', 26),
  ('cat-27', 'Арка из шаров', 'arka-iz-sharov', 27),
  ('cat-28', 'Шары поштучно', 'shary-poshtuchno', 28),
  ('cat-29', 'Универсальные', 'universalnye', 2);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  public_code TEXT NOT NULL,
  product_id TEXT,
  product_slug TEXT,
  product_title TEXT,
  product_sku TEXT,
  quantity INTEGER DEFAULT 1,
  digit TEXT,
  digit2 TEXT,
  digit_delta INTEGER DEFAULT 0,
  inscription TEXT,
  fulfillment TEXT,
  address TEXT,
  order_date TEXT,
  order_time TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  total INTEGER DEFAULT 0,
  price_from INTEGER DEFAULT 0,
  message TEXT,
  status TEXT DEFAULT 'new',
  ip TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_ip ON orders(ip);

CREATE TABLE IF NOT EXISTS price_list (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  price_from INTEGER NOT NULL DEFAULT 0,
  unit TEXT DEFAULT '',
  catalog_category TEXT DEFAULT '',
  catalog_query TEXT DEFAULT '',
  subhead TEXT DEFAULT '',
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_price_list_group ON price_list(group_id, sort_order);
