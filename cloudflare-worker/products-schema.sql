-- LASTGAZE — product catalog (Cloudflare D1)
-- Run once against the same "lastgaze" D1 database the other schema files
-- were run against, before relying on the admin Products tab, GET /products,
-- or checkout (createOrder now prices lots from this table, not a hardcoded
-- map — see order-worker.js).
--
-- Seeds the three real lots that used to live in assets/products.js as
-- already-live so the storefront doesn't go blank the moment products.js
-- switches from a static array to fetching this table. The old ₹1 "999"
-- demo listing is not carried over.

CREATE TABLE IF NOT EXISTS products (
  lot TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  era TEXT,
  cat TEXT,
  is_new INTEGER NOT NULL DEFAULT 0,
  is_sale INTEGER NOT NULL DEFAULT 0,
  price INTEGER NOT NULL,
  size TEXT,
  sold INTEGER NOT NULL DEFAULT 0,
  coming_soon INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  images TEXT NOT NULL DEFAULT '[]',
  condition TEXT,
  measure TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

INSERT INTO products
  (lot, name, era, cat, is_new, price, size, sold, image, images, condition, measure, status)
VALUES
  (
    '009',
    'Hendrix JNS — Dark Wash Bootcut',
    'Vintage denim',
    'denim',
    1,
    2000,
    '34',
    0,
    '/img/products/hendrix-jns-01.jpg',
    '["/img/products/hendrix-jns-01.jpg","/img/products/hendrix-jns-02.jpg"]',
    '8.5/10 — naturally faded dark wash with heavy whiskering throughout. No major stains or tears; light signs of wear consistent with vintage/pre-owned denim. Frayed hems at the leg openings add to the worn-in look. Pockets, stitching, zipper, and button all intact and functional. Relaxed bootcut / straight-flare silhouette in washed black / charcoal blue.',
    'Waist: 34"<br>Outseam (Length): 42"<br>Inseam: 32"<br>Rise: 10.5"<br>Leg Opening: 10"',
    'live'
  ),
  (
    '010',
    'Urbanage Design Essentials — Grey Puffer Jacket',
    'Winter outerwear',
    'outerwear',
    1,
    20000,
    'L',
    0,
    '/img/products/puffer-grey-01.jpg',
    '["/img/products/puffer-grey-01.jpg","/img/products/puffer-grey-02.jpg"]',
    '9/10 — like-new condition with no visible stains, tears, or fading. Zipper, snap-button collar closure, and both hand pockets fully functional. Minimal signs of wear consistent with light or no prior use. Relaxed boxy silhouette in solid grey nylon with front zip closure and branded chest/back graphics.',
    'Chest: 24"<br>Length: 27"<br>Shoulder: 20"<br>Sleeve: 25"',
    'live'
  ),
  (
    '011',
    'STAY — Striped Long Sleeve Tee',
    'Long sleeve tee',
    'tees',
    1,
    1500,
    'L',
    0,
    '/img/products/stay-striped-tee-01.jpg',
    '["/img/products/stay-striped-tee-01.jpg"]',
    '9.5/10 — like-new condition with no visible stains, tears, or fading. Crew neckline and cuffs fully intact. Minimal signs of wear consistent with light or no prior use. Relaxed silhouette in black and cream stripe with woven STAY neck label.',
    'Chest: 22"<br>Length: 28"<br>Shoulder: 19"<br>Sleeve: 25"',
    'live'
  )
ON CONFLICT(lot) DO NOTHING;
