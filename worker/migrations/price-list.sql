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
