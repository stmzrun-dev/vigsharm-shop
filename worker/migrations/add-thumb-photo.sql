-- VigSharm D1 Migration: add thumb_photo column
-- Запустить: wrangler d1 execute vigsharm-db --remote --file=worker/migrations/add-thumb-photo.sql
ALTER TABLE products ADD COLUMN thumb_photo TEXT;
