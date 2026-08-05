-- LASTGAZE — order + shipping details (Cloudflare D1)
-- Run once against the same "lastgaze" D1 database sold-lots-schema.sql
-- was run against, before relying on /admin/orders.

CREATE TABLE IF NOT EXISTS orders (
  payment_id TEXT PRIMARY KEY,
  order_id TEXT,
  lots TEXT NOT NULL,
  amount INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
