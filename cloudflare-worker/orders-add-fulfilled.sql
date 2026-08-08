-- LASTGAZE — order fulfillment tracking (Cloudflare D1)
-- Run once against the same "lastgaze" D1 database orders-schema.sql was
-- run against, before relying on the admin page's "Order shipped" button.
-- Skip this on a brand new database if orders-schema.sql already
-- includes the fulfilled_at column.

ALTER TABLE orders ADD COLUMN fulfilled_at TEXT;
