# Admin page

Private page at `/admin/` with three tabs: **Orders** (every paid order —
buyer name, phone, email, shipping address, so you can pack and ship
without digging through Razorpay's dashboard), **Messages** (the contact
form's inbox), and **Products** — where you add, edit, and publish the
product catalog with no code at all.

## Products tab

Add a piece: lot number, name, category, price, size, condition,
measurements, and photos (uploaded straight from your computer — no `/img/`
folder, no git). It's saved as a **draft**, invisible on the live site.
Add as many as you like, then hit **Publish** to flip every draft live at
once — that's the only step that puts anything in front of a buyer.

Editing or taking an already-**live** product offline applies immediately,
no publish step needed — the draft → live gate only matters for a new
piece's first appearance. Prices come from here too: checkout re-reads a
lot's price from this same table on every purchase, so a price change here
takes effect on the very next checkout, no code or redeploy involved.

This replaced the old workflow of hand-editing `assets/products.js` and
re-uploading it to Hostinger — that file is now just a small script that
fetches the live catalog from the worker below.

Nobody can reach any of this without your admin password:

- The page isn't linked from any nav, and carries `noindex` + a
  `robots.txt` disallow, so it won't show up in search or get crawled.
- Every tab's data is only served by `cloudflare-worker/order-worker.js`'s
  `/admin/*` endpoints, which check an `X-Admin-Password` header against
  the `ADMIN_PASSWORD` secret you set on the worker — see
  `cloudflare-worker/README.md`. Anyone who doesn't know that password gets
  a 401, no matter how they found the page's URL. `GET /products` (what the
  live storefront reads) is deliberately public — it only ever returns
  already-published products, never drafts.

## Setup

1. Set `ADMIN_PASSWORD` as a secret on the order worker, bind an R2 bucket
   for product photos, and run `orders-schema.sql` and `products-schema.sql`
   against the D1 database once — see `cloudflare-worker/README.md` for all
   of this.
2. Visit `https://lastgaze.com/admin/`, enter that password.

The password is kept in `sessionStorage` only (cleared when you close the
tab) — never written to disk or synced anywhere.

## What shows up in Orders

Every order placed **after** that feature shipped, that you haven't marked
shipped yet. Older payments confirmed before the shipping form existed won't
have a row here, since no address was ever collected for them — nothing to
backfill.

Click **Order shipped** on a card once you've packed and sent it — that
marks it fulfilled and drops it off this list for good (it isn't shown
anywhere else in the admin page). This needs `orders-add-fulfilled.sql` run
against the D1 database once — see `cloudflare-worker/README.md`.
