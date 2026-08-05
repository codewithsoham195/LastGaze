# Account worker

Handles customer signup, login, logout, address book (add/edit/delete), and
order history, backed by Cloudflare D1. Separate from
`cloudflare-worker/order-worker.js` so your live payment worker is never
touched by this — but both bind the *same* `lastgaze` D1 database, so
`/account/orders` can read the order worker's `orders` table directly with
a plain SQL query, no service-to-service call. That means `/account/orders`
only works once you've deployed the order worker and run its
`orders-schema.sql` against this same database — see
`cloudflare-worker/README.md`.

Passwords are hashed with PBKDF2-SHA256 (100,000 iterations, random salt per
user) — the plaintext password is never stored. Sessions are random tokens;
only a hash of the token is stored in the database, so a database read alone
can't be used to sign in as anyone.

## 1. Create the D1 database

Dashboard: **Workers & Pages → D1 → Create database** → name it `lastgaze` → **Create**.

Then run the schema against it — dashboard **D1 → lastgaze → Console**, paste
the contents of `schema.sql`, run it. (Or via CLI: `npx wrangler d1 execute
lastgaze --file=schema.sql --remote`.)

Copy the **Database ID** shown on the database's page — you'll need it next.

## 2. Deploy the worker

### Via the Cloudflare dashboard (no CLI needed)

1. **Workers & Pages → Create → Create Worker.** Name it `lastgaze-account-worker` → **Deploy** (deploys a placeholder).
2. **Edit code** → replace everything with the contents of `account-worker.js` → **Deploy**.
3. **Settings → Bindings → Add → D1 Database.** Variable name: `DB`. Database: `lastgaze`. Save.
4. Copy the worker's URL (`https://lastgaze-account-worker.<your-subdomain>.workers.dev`).
5. Send that URL back — it goes into `LG_ACCOUNT_CONFIG.apiBase` in `assets/account.js`.

### Via Wrangler CLI (alternative)

```bash
cd cloudflare-worker-accounts
npx wrangler login
npx wrangler d1 create lastgaze          # skip if you already created it above
npx wrangler d1 execute lastgaze --file=schema.sql --remote
# put the database_id from the create/list output into wrangler.toml
npx wrangler deploy
```

## 3. Point the site at it

Once deployed, update `apiBase` in `assets/account.js` with the worker URL
from step 2, and redeploy the site as usual.

## Notes

- **Cross-origin cookies.** The site (`lastgaze.com`) and the worker
  (`*.workers.dev`) are different origins, so the session cookie is set with
  `SameSite=None; Secure`. This requires both sides to be HTTPS, which they
  already are. If you later put this worker on a custom route under your own
  domain (e.g. `lastgaze.com/api/*`), you can simplify this to `SameSite=Lax`.
- **Rate limiting.** The worker itself doesn't rate-limit login attempts.
  Add a Cloudflare **WAF → Rate limiting rule** on `/auth/login` and
  `/auth/signup` (dashboard, no code) to blunt brute-force / credential
  stuffing attempts.
- **CORS allowlist.** `ALLOWED_ORIGINS` in `account-worker.js` mirrors the
  order worker's — update both if your domain changes.
