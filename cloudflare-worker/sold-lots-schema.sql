-- LASTGAZE — sold lots tracking (Cloudflare D1)
-- Run once against the same "lastgaze" D1 database the account
-- worker uses, before deploying the updated order-worker.js.

CREATE TABLE IF NOT EXISTS sold_lots (
  lot TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  sold_at TEXT NOT NULL DEFAULT (datetime('now'))
);
