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

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_article ON products(article);
