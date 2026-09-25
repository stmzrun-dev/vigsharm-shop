-- Enable storefront visibility flag for all currently published products.
-- Safe to re-run. Required before vigIsStorefrontVisible respects show_on_site.
--
-- Remote:
--   cd worker
--   wrangler d1 execute vigsharm-db --remote --file=./migrations/fix-show-on-site-published.sql
--
-- Local (if using local D1):
--   wrangler d1 execute vigsharm-db --local --file=./migrations/fix-show-on-site-published.sql

UPDATE products
SET show_on_site = 1
WHERE status = 'published'
  AND (show_on_site IS NULL OR show_on_site = 0);
