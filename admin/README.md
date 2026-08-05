# Order admin page

Private page at `/admin/` listing every paid order — buyer name, phone,
email, and shipping address — so you can pack and ship without digging
through Razorpay's dashboard.

Nobody can reach the data without your admin password:

- The page isn't linked from any nav, and carries `noindex` + a
  `robots.txt` disallow, so it won't show up in search or get crawled.
- The order data itself is only served by `cloudflare-worker/order-worker.js`'s
  `/admin/orders` endpoint, which checks an `X-Admin-Password` header against
  the `ADMIN_PASSWORD` secret you set on the worker — see
  `cloudflare-worker/README.md`. Anyone who doesn't know that password gets
  a 401, no matter how they found the page's URL.

## Setup

1. Set `ADMIN_PASSWORD` as a secret on the order worker (see
   `cloudflare-worker/README.md`) and run `orders-schema.sql` against the D1
   database once.
2. Visit `https://lastgaze.com/admin/`, enter that password.

The password is kept in `sessionStorage` only (cleared when you close the
tab) — never written to disk or synced anywhere.

## What shows up here

Every order placed **after** this feature shipped. Older payments confirmed
before the shipping form existed won't have a row here, since no address was
ever collected for them — nothing to backfill.
