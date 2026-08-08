# Order worker

Creates a signed Razorpay order server-side so a buyer can't tamper with the
price before paying. Also verifies payment independently with Razorpay
(never trusting the browser's own "it succeeded" callback), records sold
lots in D1 so `sold-lots` can grey out a piece on the shop/product pages the
moment it's actually paid for, and records each order's shipping details
(name, phone, address) so you can look them up on the private `/admin/`
order page — see [`admin/README.md`](../admin/README.md).

Also serves the entire product catalog. There is no more static
`assets/products.js` array to hand-edit — the admin page's **Products** tab
reads and writes products here, checkout prices every lot from this same
table (never a hardcoded map), and `GET /products` is what `/shop/`,
`/product/`, `/bag/`, and everywhere else on the site now fetch instead of a
static file. Add a piece with photos in the admin page, click **Publish**,
and it's live — no code, no git push, no re-uploading anything to Hostinger.

**Checkout requires an account.** `/confirm-payment`'s order-creation step
(the one that signs the price) rejects anyone without a valid session —
resolved from the same `Authorization: Bearer <token>` the account worker
issues, checked against the sessions table in the D1 database the two
workers share. No service-to-service call needed, just a shared database.
Orders are tagged with the buyer's account so they show up under "My
orders" on `/account/` (see `cloudflare-worker-accounts/README.md`).

**Reviews** are star rating + text + photos, submitted from "My orders" on
`/account/` and shown on the matching product page. `POST /reviews` checks
the same shared `orders` table before accepting one — you can only review a
lot you actually bought — and reviews auto-publish immediately, no
moderation step. `GET /reviews?lot=...` is public. Photos go through the
same R2 bucket and `/img-cdn/` route product photos already use (see
`putImageToR2()`), just under a `reviews/` key prefix instead of
`products/`.

Also handles the `/contact/` form — `/contact` (public, no account
needed) records a message, and `/admin/messages` (same `ADMIN_PASSWORD`
gate as orders) lists them on the `/admin/` page's Messages tab.

Deploy this once, then point `assets/checkout.js`'s `orderEndpoint` at the
deployed URL.

## Deploy via the Cloudflare dashboard (no CLI needed)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** →
   **Create** → **Create Worker**.
2. Name it (e.g. `lastgaze-order-worker`) → **Deploy** (deploys a placeholder first).
3. **Edit code** → replace everything with the contents of `order-worker.js` →
   **Deploy**.
4. **Settings** → **Variables and Secrets** → **Add**:
   - `RAZORPAY_KEY_ID` — your `rzp_live_...` key
   - `RAZORPAY_KEY_SECRET` — your key secret
   - `ADMIN_PASSWORD` — a strong password only you know; this is what gates
     `/admin/orders` and, through it, the `/admin/` order page
   Add all three as **Secret** (encrypted), not plain text. Save.
5. **Bindings** → **Add binding** → **D1 database**. Variable name: `DB`.
   Database: the same `lastgaze` D1 database the account worker uses (see
   `cloudflare-worker-accounts/README.md` if you haven't created it yet).
6. In that D1 database's **Console** tab, run `sold-lots-schema.sql`,
   `orders-schema.sql`, `messages-schema.sql`, `products-schema.sql`, and
   `reviews-schema.sql` once each (only needed the first time —
   `products-schema.sql` also carries over the pieces that used to live in
   `assets/products.js` so the shop doesn't go blank the moment it switches
   to fetching from here). If you ran `orders-schema.sql` before it
   included the `user_id` column, also run `orders-add-user-id.sql` once —
   skip it on a brand new database. Also run `orders-add-fulfilled.sql`
   once — it adds the `fulfilled_at` column the admin page's "Order
   shipped" button needs.
7. **Bindings** → **Add binding** → **R2 bucket**. Variable name:
   `PRODUCT_IMAGES`. Create a new bucket (e.g. `lastgaze-products`) if you
   don't have one — this is where photos uploaded from the admin Products
   tab and buyer reviews are stored (under separate `products/` and
   `reviews/` key prefixes in the same bucket). No public-access toggle
   needed; the worker streams them back itself at `/img-cdn/...`.
8. Copy the worker's URL (`https://lastgaze-order-worker.<your-subdomain>.workers.dev`).
9. Send that URL back — it goes into `orderEndpoint` in `assets/checkout.js`,
   alongside switching `keyId` to the live key.

## Deploy via Wrangler CLI (alternative)

```bash
cd cloudflare-worker
npx wrangler login
npx wrangler secret put RAZORPAY_KEY_ID
npx wrangler secret put RAZORPAY_KEY_SECRET
npx wrangler secret put ADMIN_PASSWORD
npx wrangler d1 execute lastgaze --file=orders-schema.sql --remote
npx wrangler d1 execute lastgaze --file=products-schema.sql --remote
npx wrangler d1 execute lastgaze --file=reviews-schema.sql --remote
npx wrangler r2 bucket create lastgaze-products
npx wrangler deploy
```

If you deploy via CLI, also add the R2 binding to `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "PRODUCT_IMAGES"
bucket_name = "lastgaze-products"
```

`wrangler deploy` prints the worker URL at the end.

## Updating prices

Prices are no longer a hardcoded map in this file — `createOrder()` reads
each lot's price straight from the `products` table (and only for lots
`status = 'live'`, so a checkout attempt on a draft always fails). Change a
price from the admin page's Products tab and it takes effect on the very
next checkout, no redeploy needed.
