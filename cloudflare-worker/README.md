# Order worker

Creates a signed Razorpay order server-side so a buyer can't tamper with the
price before paying. Deploy this once, then point `assets/checkout.js`'s
`orderEndpoint` at the deployed URL.

## Deploy via the Cloudflare dashboard (no CLI needed)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** →
   **Create** → **Create Worker**.
2. Name it (e.g. `lastgaze-order-worker`) → **Deploy** (deploys a placeholder first).
3. **Edit code** → replace everything with the contents of `order-worker.js` →
   **Deploy**.
4. **Settings** → **Variables and Secrets** → **Add**:
   - `RAZORPAY_KEY_ID` — your `rzp_live_...` key
   - `RAZORPAY_KEY_SECRET` — your key secret
   Add both as **Secret** (encrypted), not plain text. Save.
5. Copy the worker's URL (`https://lastgaze-order-worker.<your-subdomain>.workers.dev`).
6. Send that URL back — it goes into `orderEndpoint` in `assets/checkout.js`,
   alongside switching `keyId` to the live key.

## Deploy via Wrangler CLI (alternative)

```bash
cd cloudflare-worker
npx wrangler login
npx wrangler secret put RAZORPAY_KEY_ID
npx wrangler secret put RAZORPAY_KEY_SECRET
npx wrangler deploy
```

`wrangler deploy` prints the worker URL at the end.

## Updating prices

`order-worker.js` has its own `PRICES` map — it never trusts a price sent by
the browser. Whenever a lot's price changes in `assets/products.js`, update
`PRICES` here too and redeploy (dashboard: Edit code → Deploy; CLI: `wrangler
deploy`).
