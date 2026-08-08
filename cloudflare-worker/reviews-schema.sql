-- LASTGAZE — product reviews (Cloudflare D1)
-- Run once against the same "lastgaze" D1 database the other schema files
-- were run against, before relying on GET/POST /reviews, POST
-- /reviews/images, or GET /account/reviews.
--
-- One row per (user, lot) — a buyer can only ever purchase a given one-of-
-- one piece once, so resubmitting a review for the same lot is treated as
-- an edit (upsert), not a second review.

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  lot TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  body TEXT,
  images TEXT NOT NULL DEFAULT '[]',
  reviewer_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, lot)
);

CREATE INDEX IF NOT EXISTS idx_reviews_lot ON reviews(lot);
