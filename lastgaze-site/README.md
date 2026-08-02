# LASTGAZE — site

Plain HTML, CSS and JS. No Shopify, no build step, no npm. Open it, edit it, upload it.

```
index.html          home — 3D hero, drop countdown, featured lots
shop.html           shop all — the Denim Tears-style grid
product.html        single piece (reads ?lot=001 from the URL)
password.html       the drop lock you show while uploading stock
assets/site.css     all styling. Logo is baked in here as a data URI.
assets/site.js      3D mark, scroll reveals, grid, bag
assets/products.js  ← THE ONLY FILE YOU EDIT EACH WEEK
assets/checkout.js  Razorpay key + order call. Nothing else touches payment.
brand/              transparent PNG logos (white + black) for IG / LinkedIn
img/                you create this. Drop product photos here.
```

---

## 1. See it locally

Double-click `index.html`. It works — the logo is embedded in the CSS, so there's no
broken-image problem when you open files directly.

If you want it to behave exactly like the live site:

```bash
cd lastgaze
python3 -m http.server 8000
# open http://localhost:8000
```

---

## 2. Put it online (5 minutes, free)

**Easiest:** go to `app.netlify.com/drop` and drag the whole `lastgaze` folder into the
browser. You get a live URL immediately. Then Site settings → Domain → add `lastgaze.com`.

**If you prefer GitHub:** push the folder to a repo, then import it on Vercel. Framework
preset = **Other**, build command = **empty**, output directory = **empty**. That's it —
there's nothing to compile.

---

## 3. The weekly drop — your Saturday routine

**Friday night — close the shop**

Rename files so visitors hit the lock instead of the store:

```
mv index.html home.html
mv password.html index.html
```

Change the code and the open time in `assets/products.js`:

```js
window.LASTGAZE_DROP = {
  number: 5,
  opensAt: "2026-08-15T20:00:00+05:30",
  password: "pick-a-new-one"
};
```

**Saturday — shoot and list**

1. Put photos in `img/`. Four per piece is the sweet spot: front, back, a detail, a flaw.
   Shoot flat on the same wall every week — consistency is what makes a grid look expensive.
2. Resize to about 1400px wide and save as `.webp` (`squoosh.app`, free, takes seconds).
3. Add each piece to `window.LASTGAZE_PRODUCTS`:

```js
{
  lot: "009",
  name: "Harrington — Sand",
  era: "1980s / UK",
  cat: "outerwear",     // outerwear | knitwear | denim | tops | trousers
  price: 4200,          // rupees, no symbol
  size: "M",
  sold: false,
  images: ["img/009-a.webp","img/009-b.webp","img/009-c.webp","img/009-d.webp"],
  condition: "Tartan lining intact. Fade across both shoulders.",
  measure: "Chest 55cm · Length 66cm · Shoulder 47cm · Sleeve 62cm"
}
```

**20:00 — open**

```
mv index.html password.html
mv home.html index.html
```

Re-upload. Done.

**When something sells:** set `sold: true`. Don't delete it. A grid full of struck-through
sold pieces is the single best proof that your drops actually clear.

> Leave `images` empty and the card renders a clean archive frame instead. Nothing on this
> site uses stock photography — every frame is either your photo or an honest empty slot.

---

## 4. Razorpay

Right now the checkout button says it isn't connected. Two steps to change that.

**Test mode (today):** Razorpay Dashboard → Settings → API Keys → generate test keys.
Paste the Key ID into `assets/checkout.js`:

```js
keyId: "rzp_test_xxxxxxxxxxxx"
```

Test cards work immediately. Never put the Key *Secret* in this file — it stays on the server.

**Live mode (before you take real money):** Razorpay needs a signed `order_id` created on a
server, otherwise a buyer can edit the price in their browser. You don't need a backend for
this — a single Cloudflare Worker does it. Create one, have it call Razorpay's Orders API
with your Key Secret, and return `{ id }`. Then set:

```js
orderEndpoint: "https://your-worker.workers.dev/order"
```

Also switch the key to `rzp_live_...`. Nothing else in the site changes.

Razorpay's own KYC needs your PAN and a current account — same set you used for the GST
registration, so it should clear in a day or two.

---

## 5. About the password page — read this

The code in `products.js` is a **curtain, not a lock**. Anyone who opens DevTools can read
it. That's completely fine for what you're doing: building anticipation and rewarding people
who follow you on Instagram.

If you ever need a real lock — say you're previewing pricing for a wholesale buyer — use
Netlify's built-in *Password protection* or Cloudflare Access instead. Both are one toggle.

---

## 6. Things worth doing in week one

- Set `<meta property="og:image">` on every page to a real campaign photo. Right now links
  shared to WhatsApp and Instagram DMs will look bare.
- Add a `favicon.ico` alongside the SVG one for older Android browsers.
- Point `hello@lastgaze.com` somewhere real — Zoho Mail is free for one domain.
- Swap the Instagram links from `instagram.com/lastgaze` to your actual handle. They're in
  the footer and nav of every page.
- Write the sizing page. You promise "real measurements, not labels" on the homepage — that
  claim needs a page behind it.

---

## Design notes

Two surfaces, nothing else: ink `#050505` and paper `#F0ECE6` — the cream is sampled from
your own logo file, not invented. There's no accent colour anywhere. The contrast flip
between sections *is* the accent, which is why the logo is applied as a CSS mask: it inherits
whatever surface it sits on and inverts automatically. You will never need a second logo file.

Type is Archivo at expanded widths for display, Instrument Sans for reading, DM Mono for lot
numbers and labels — loaded from Google Fonts, so the first paint needs a connection.

The hero mark is 26 stacked copies of your logo in CSS 3D space. It's a real extruded object,
not a video or a shader, so it costs nothing to load and stays sharp at any size. It follows
the cursor, and rotates away as you scroll.
