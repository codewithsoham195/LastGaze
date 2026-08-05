-- LASTGAZE — link orders to accounts (Cloudflare D1)
-- Run once against the "lastgaze" D1 database, only if you already ran
-- the original orders-schema.sql before this column was added to it.
-- Safe to skip on a brand new database — orders-schema.sql now creates
-- this column directly.

ALTER TABLE orders ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
