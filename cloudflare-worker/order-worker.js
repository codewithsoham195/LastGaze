/* ============================================================
   LASTGAZE — Razorpay order worker
   Creates a signed Razorpay order server-side so a buyer can't
   edit the price in their browser before paying, and marks lots
   sold only after independently verifying payment with Razorpay
   — never trusting the browser's own "payment succeeded" callback.

   Also serves the product catalog: the admin Products tab reads
   and writes it here, checkout prices lots from it (never a
   hardcoded map), and the storefront's GET /products is the
   public read the whole site now depends on instead of the old
   static assets/products.js array.

   Deploy this on Cloudflare Workers. Set RAZORPAY_KEY_ID and
   RAZORPAY_KEY_SECRET as encrypted secrets on the worker —
   never write them into this file or commit them.

   Bind a D1 database as "DB" (same one the account worker uses)
   — Settings -> Bindings — and run sold-lots-schema.sql and
   products-schema.sql against it once, before relying on
   /confirm-payment, /sold-lots, /products, or /admin/products.

   Bind an R2 bucket as "PRODUCT_IMAGES" — Settings -> Bindings —
   for admin-uploaded product photos. See README for setup.
   ============================================================ */

const ALLOWED_ORIGINS = [
  "https://lastgaze.com",
  "https://www.lastgaze.com"
];

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password, Authorization",
    "Content-Type": "application/json"
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status: status || 200, headers });
}

function razorpayAuth(env) {
  return "Basic " + btoa(env.RAZORPAY_KEY_ID + ":" + env.RAZORPAY_KEY_SECRET);
}

function bufToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bufToHex(digest);
}

// Resolves the signed-in account (if any) from the same Authorization
// bearer token the account worker issues — both workers share one D1
// database, so a session created there is valid here without any
// service-to-service call. createOrder() requires this to be non-null
// (every purchase must belong to an account); confirmPayment() just
// uses it best-effort to tag the order for "My orders".
async function resolveSessionUserId(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const tokenHash = await sha256Hex(match[1]);
    const row = await env.DB.prepare(
      "SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > datetime('now')"
    ).bind(tokenHash).first();
    return row ? row.user_id : null;
  } catch (e) {
    return null;
  }
}

async function createOrder(request, env, headers) {
  // Every order must belong to a signed-in account — no guest checkout.
  const userId = await resolveSessionUserId(request, env);
  if (!userId) {
    return json({ error: "Sign in required" }, 401, headers);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON" }, 400, headers);
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return json({ error: "No items" }, 400, headers);
  }

  // Prices are never trusted from the browser — always re-read from the
  // live product catalog, and only for lots actually published live.
  let amount = 0;
  for (const item of items) {
    const row = await env.DB.prepare(
      "SELECT price FROM products WHERE lot = ? AND status = 'live'"
    ).bind(String(item.lot)).first();
    if (!row) {
      return json({ error: "Unknown lot: " + item.lot }, 400, headers);
    }
    amount += row.price;
  }

  const rzRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Authorization": razorpayAuth(env),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: amount * 100, // paise
      currency: "INR",
      receipt: "lg_" + Date.now(),
      notes: { lots: items.map(function (i) { return i.lot; }).join(", ") }
    })
  });

  if (!rzRes.ok) {
    const detail = await rzRes.text();
    return json({ error: "Razorpay order failed", detail: detail }, 502, headers);
  }

  const order = await rzRes.json();
  return json({ id: order.id, amount: order.amount }, 200, headers);
}

// Independently confirms with Razorpay that a payment actually
// went through before marking anything sold — the browser telling
// us "it succeeded" is never enough on its own.
async function confirmPayment(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON" }, 400, headers);
  }

  const paymentId = String(body.payment_id || "");
  if (!paymentId) return json({ error: "Missing payment_id" }, 400, headers);

  const auth = razorpayAuth(env);

  const payRes = await fetch("https://api.razorpay.com/v1/payments/" + encodeURIComponent(paymentId), {
    headers: { "Authorization": auth }
  });
  if (!payRes.ok) return json({ error: "Could not look up payment" }, 502, headers);
  const payment = await payRes.json();

  if (payment.status !== "captured") {
    return json({ error: "Payment not captured", status: payment.status }, 402, headers);
  }

  const orderRes = await fetch("https://api.razorpay.com/v1/orders/" + encodeURIComponent(payment.order_id), {
    headers: { "Authorization": auth }
  });
  if (!orderRes.ok) return json({ error: "Could not look up order" }, 502, headers);
  const order = await orderRes.json();

  if (order.status !== "paid" || order.amount !== payment.amount) {
    return json({ error: "Order/payment mismatch" }, 402, headers);
  }

  const lots = String((order.notes && order.notes.lots) || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  if (!lots.length) return json({ error: "No lots on order" }, 400, headers);

  for (const lot of lots) {
    await env.DB.prepare(
      "INSERT INTO sold_lots (lot, payment_id) VALUES (?, ?) ON CONFLICT(lot) DO NOTHING"
    ).bind(lot, paymentId).run();
  }

  // Shipping details are best-effort: a buyer's lot is marked sold above
  // regardless, so a bad/missing address never blocks their payment from
  // going through — it just means the order needs a manual follow-up.
  const userId = await resolveSessionUserId(request, env);
  await saveShippingDetails(env, paymentId, order.id, lots, payment.amount, body.shipping, userId);

  return json({ ok: true, lots: lots }, 200, headers);
}

const REQUIRED_SHIPPING_FIELDS = ["name", "phone", "line1", "city", "state", "postal_code"];

function shippingIsValid(shipping) {
  if (!shipping || typeof shipping !== "object") return false;
  return REQUIRED_SHIPPING_FIELDS.every(function (f) { return String(shipping[f] || "").trim(); });
}

async function saveShippingDetails(env, paymentId, orderId, lots, amount, shipping, userId) {
  if (!shippingIsValid(shipping)) return;
  try {
    await env.DB.prepare(
      "INSERT INTO orders (payment_id, order_id, lots, amount, name, phone, email, line1, line2, city, state, postal_code, user_id) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(payment_id) DO NOTHING"
    ).bind(
      paymentId,
      orderId,
      lots.join(", "),
      amount,
      String(shipping.name).trim(),
      String(shipping.phone).trim(),
      String(shipping.email || "").trim(),
      String(shipping.line1).trim(),
      String(shipping.line2 || "").trim(),
      String(shipping.city).trim(),
      String(shipping.state).trim(),
      String(shipping.postal_code).trim(),
      userId || null
    ).run();
  } catch (e) {
    // Swallow — sold_lots is already recorded, which is what matters most.
  }
}

function checkAdminAuth(request, env) {
  const provided = request.headers.get("X-Admin-Password") || "";
  const expected = env.ADMIN_PASSWORD || "";
  return Boolean(expected) && provided === expected;
}

async function adminOrders(request, env, headers) {
  if (!checkAdminAuth(request, env)) {
    return json({ error: "Unauthorized" }, 401, headers);
  }
  // Only unshipped orders — clicking "Order shipped" in the admin page
  // marks fulfilled_at and drops it from this list for good, so the
  // Orders tab only ever shows what still needs to go out.
  const { results } = await env.DB.prepare(
    "SELECT payment_id, order_id, lots, amount, name, phone, email, line1, line2, city, state, postal_code, created_at " +
    "FROM orders WHERE fulfilled_at IS NULL ORDER BY created_at DESC"
  ).all();
  return json({ orders: results }, 200, headers);
}

async function adminFulfillOrder(request, env, headers, paymentId) {
  if (!checkAdminAuth(request, env)) {
    return json({ error: "Unauthorized" }, 401, headers);
  }
  const result = await env.DB.prepare(
    "UPDATE orders SET fulfilled_at = datetime('now') WHERE payment_id = ? AND fulfilled_at IS NULL"
  ).bind(paymentId).run();

  if (!result.meta || !result.meta.changes) return json({ error: "Not found" }, 404, headers);
  return json({ ok: true }, 200, headers);
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Public — the contact form on /contact/ posts here. No account or
// payment involved, so this stays open (unlike createOrder).
async function submitMessage(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON" }, 400, headers);
  }

  const name = String(body.name || "").trim().slice(0, 200);
  const email = String(body.email || "").trim().slice(0, 200);
  const subject = String(body.subject || "").trim().slice(0, 200);
  const message = String(body.message || "").trim().slice(0, 5000);

  if (!name || !message) return json({ error: "Missing name or message" }, 400, headers);
  if (!isValidEmail(email)) return json({ error: "Invalid email" }, 400, headers);

  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO messages (id, name, email, subject, message) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, name, email, subject, message).run();

  return json({ ok: true }, 200, headers);
}

async function adminMessages(request, env, headers) {
  if (!checkAdminAuth(request, env)) {
    return json({ error: "Unauthorized" }, 401, headers);
  }
  const { results } = await env.DB.prepare(
    "SELECT id, name, email, subject, message, created_at FROM messages ORDER BY created_at DESC"
  ).all();
  return json({ messages: results }, 200, headers);
}

async function soldLots(env, headers) {
  const { results } = await env.DB.prepare("SELECT lot FROM sold_lots").all();
  return json({ lots: results.map(function (r) { return r.lot; }) }, 200, headers);
}

/* ---------------------------------------------------------------
   Product catalog — backs the admin Products tab, GET /products
   (the storefront's only source of product data), and createOrder's
   price lookup above.
   --------------------------------------------------------------- */

function parseImages(raw) {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

// Shape every storefront consumer already expects from the old static
// assets/products.js array.
function rowToPublicProduct(row) {
  const images = parseImages(row.images);
  return {
    lot: row.lot,
    name: row.name,
    era: row.era || "",
    cat: row.cat || "",
    isNew: !!row.is_new,
    sale: !!row.is_sale,
    price: row.price,
    size: row.size || "",
    sold: !!row.sold,
    comingSoon: !!row.coming_soon,
    image: row.image || images[0] || "",
    images: images,
    condition: row.condition || "",
    measure: row.measure || ""
  };
}

function rowToAdminProduct(row) {
  const pub = rowToPublicProduct(row);
  pub.status = row.status;
  pub.createdAt = row.created_at;
  pub.updatedAt = row.updated_at;
  return pub;
}

async function publicProducts(env, headers) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM products WHERE status = 'live' ORDER BY created_at DESC"
  ).all();
  return json({ products: results.map(rowToPublicProduct) }, 200, headers);
}

async function adminListProducts(request, env, headers) {
  if (!checkAdminAuth(request, env)) return json({ error: "Unauthorized" }, 401, headers);
  const { results } = await env.DB.prepare(
    "SELECT * FROM products ORDER BY created_at DESC"
  ).all();
  return json({ products: results.map(rowToAdminProduct) }, 200, headers);
}

// Pulls the fields a create/update body can set, falling back to an
// existing row's values on update so a partial edit doesn't null out
// the rest of the product.
function readProductFields(body, existing) {
  const b = body || {};
  const pick = function (key, fallback) {
    return b[key] != null ? b[key] : (existing ? existing[key] : fallback);
  };
  return {
    name: String(pick("name", "") || "").trim(),
    era: String(pick("era", "") || "").trim(),
    cat: String(pick("cat", "") || "").trim(),
    is_new: pick("isNew", existing ? existing.is_new : false) ? 1 : 0,
    is_sale: pick("sale", existing ? existing.is_sale : false) ? 1 : 0,
    price: Number(pick("price", NaN)),
    size: String(pick("size", "") || "").trim(),
    sold: pick("sold", existing ? existing.sold : false) ? 1 : 0,
    coming_soon: pick("comingSoon", existing ? existing.coming_soon : false) ? 1 : 0,
    image: String(pick("image", "") || "").trim(),
    images: JSON.stringify(Array.isArray(b.images) ? b.images : (existing ? parseImages(existing.images) : [])),
    condition: String(pick("condition", "") || "").trim(),
    measure: String(pick("measure", "") || "").trim()
  };
}

async function adminCreateProduct(request, env, headers) {
  if (!checkAdminAuth(request, env)) return json({ error: "Unauthorized" }, 401, headers);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON" }, 400, headers);
  }

  const lot = String(body.lot || "").trim();
  if (!lot) return json({ error: "Lot is required" }, 400, headers);

  const f = readProductFields(body, null);
  if (!f.name) return json({ error: "Name is required" }, 400, headers);
  if (!Number.isFinite(f.price) || f.price < 0) return json({ error: "Valid price is required" }, 400, headers);

  const status = body.publish ? "live" : "draft";

  try {
    await env.DB.prepare(
      "INSERT INTO products (lot, name, era, cat, is_new, is_sale, price, size, sold, coming_soon, image, images, condition, measure, status, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
    ).bind(
      lot, f.name, f.era, f.cat, f.is_new, f.is_sale, f.price, f.size, f.sold, f.coming_soon,
      f.image, f.images, f.condition, f.measure, status
    ).run();
  } catch (e) {
    return json({ error: "Lot " + lot + " already exists" }, 409, headers);
  }

  const row = await env.DB.prepare("SELECT * FROM products WHERE lot = ?").bind(lot).first();
  return json({ product: rowToAdminProduct(row) }, 201, headers);
}

async function adminUpdateProduct(request, env, headers, lot) {
  if (!checkAdminAuth(request, env)) return json({ error: "Unauthorized" }, 401, headers);

  const existing = await env.DB.prepare("SELECT * FROM products WHERE lot = ?").bind(lot).first();
  if (!existing) return json({ error: "Not found" }, 404, headers);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON" }, 400, headers);
  }

  const f = readProductFields(body, existing);
  if (!f.name) return json({ error: "Name is required" }, 400, headers);
  if (!Number.isFinite(f.price) || f.price < 0) return json({ error: "Valid price is required" }, 400, headers);

  await env.DB.prepare(
    "UPDATE products SET name=?, era=?, cat=?, is_new=?, is_sale=?, price=?, size=?, sold=?, coming_soon=?, image=?, images=?, condition=?, measure=?, updated_at=datetime('now') " +
    "WHERE lot = ?"
  ).bind(
    f.name, f.era, f.cat, f.is_new, f.is_sale, f.price, f.size, f.sold, f.coming_soon,
    f.image, f.images, f.condition, f.measure, lot
  ).run();

  const row = await env.DB.prepare("SELECT * FROM products WHERE lot = ?").bind(lot).first();
  return json({ product: rowToAdminProduct(row) }, 200, headers);
}

// Best-effort R2 cleanup — a product row is the source of truth, so a
// leftover orphaned image in R2 is a rounding error, not a bug worth
// blocking the delete over.
async function deleteProductImages(env, row) {
  if (!env.PRODUCT_IMAGES || !row) return;
  const images = parseImages(row.images);
  const keys = images
    .map(function (src) { return extractImageKey(src); })
    .filter(Boolean);
  for (const key of keys) {
    try { await env.PRODUCT_IMAGES.delete(key); } catch (e) { /* ignore */ }
  }
}

function extractImageKey(src) {
  const marker = "/img-cdn/";
  const i = String(src || "").indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(src.slice(i + marker.length));
}

async function adminDeleteProduct(request, env, headers, lot) {
  if (!checkAdminAuth(request, env)) return json({ error: "Unauthorized" }, 401, headers);

  const existing = await env.DB.prepare("SELECT * FROM products WHERE lot = ?").bind(lot).first();
  if (!existing) return json({ error: "Not found" }, 404, headers);

  await env.DB.prepare("DELETE FROM products WHERE lot = ?").bind(lot).run();
  await deleteProductImages(env, existing);

  return json({ ok: true }, 200, headers);
}

async function adminSetProductStatus(request, env, headers, lot) {
  if (!checkAdminAuth(request, env)) return json({ error: "Unauthorized" }, 401, headers);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON" }, 400, headers);
  }

  const status = body.status === "live" ? "live" : "draft";
  const result = await env.DB.prepare(
    "UPDATE products SET status = ?, updated_at = datetime('now') WHERE lot = ?"
  ).bind(status, lot).run();

  if (!result.meta || !result.meta.changes) return json({ error: "Not found" }, 404, headers);
  return json({ ok: true, status: status }, 200, headers);
}

// The admin Products tab's Publish button: flips every draft it's
// showing to live in one shot, so "add a bunch of pieces, then
// Publish" goes live as a single batch.
async function adminPublishProducts(request, env, headers) {
  if (!checkAdminAuth(request, env)) return json({ error: "Unauthorized" }, 401, headers);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON" }, 400, headers);
  }

  const lots = Array.isArray(body.lots) ? body.lots.map(String) : [];
  if (!lots.length) return json({ error: "No lots to publish" }, 400, headers);

  const placeholders = lots.map(function () { return "?"; }).join(", ");
  await env.DB.prepare(
    "UPDATE products SET status = 'live', updated_at = datetime('now') WHERE lot IN (" + placeholders + ")"
  ).bind(...lots).run();

  return json({ ok: true, published: lots }, 200, headers);
}

const IMAGE_EXT_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif"
};

function guessExtension(contentType, filename) {
  const fromName = String(filename || "").match(/\.([a-zA-Z0-9]+)$/);
  if (fromName) return fromName[1].toLowerCase();
  return IMAGE_EXT_BY_TYPE[contentType] || "jpg";
}

// Shared by the admin product-image upload and the buyer review-image
// upload — same bucket, same /img-cdn/ serving path, different key
// prefix so the two never collide.
async function putImageToR2(request, env, headers, url, keyPrefix) {
  if (!env.PRODUCT_IMAGES) return json({ error: "Image storage not configured" }, 500, headers);

  const contentType = request.headers.get("Content-Type") || "application/octet-stream";
  if (IMAGE_EXT_BY_TYPE[contentType] == null) {
    return json({ error: "Unsupported image type: " + contentType }, 400, headers);
  }

  const filename = url.searchParams.get("filename") || "";
  const ext = guessExtension(contentType, filename);
  const key = keyPrefix + "/" + crypto.randomUUID() + "." + ext;

  const bytes = await request.arrayBuffer();
  await env.PRODUCT_IMAGES.put(key, bytes, { httpMetadata: { contentType: contentType } });

  return json({ url: url.origin + "/img-cdn/" + key }, 201, headers);
}

async function uploadProductImage(request, env, headers, url) {
  if (!checkAdminAuth(request, env)) return json({ error: "Unauthorized" }, 401, headers);
  return await putImageToR2(request, env, headers, url, "products");
}

async function uploadReviewImage(request, env, headers, url) {
  const userId = await resolveSessionUserId(request, env);
  if (!userId) return json({ error: "Sign in required" }, 401, headers);
  return await putImageToR2(request, env, headers, url, "reviews");
}

// Public, unauthenticated — this is what <img> tags on the storefront
// point at for anything uploaded through the admin page. Never routed
// through corsHeaders()/json(): those force a JSON content type, which
// would break every image.
async function serveProductImage(env, key) {
  if (!env.PRODUCT_IMAGES) return new Response("Not found", { status: 404 });
  const obj = await env.PRODUCT_IMAGES.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", obj.httpEtag);
  return new Response(obj.body, { headers: headers });
}

/* ---------------------------------------------------------------
   Reviews — star rating + photos, restricted to buyers who actually
   purchased the lot (never trusted from the browser — checked
   against the same orders table checkout writes to). Auto-publish,
   no moderation step: a review is visible the moment it's saved.
   --------------------------------------------------------------- */

function isValidRating(n) {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

// Orders store lots as a comma-joined string ("009, 010"), one row per
// checkout rather than one row per item — so "did this user buy this
// lot" means splitting each of their orders and checking membership,
// not a single indexed lookup.
async function userOwnsLot(env, userId, lot) {
  const { results } = await env.DB.prepare(
    "SELECT lots, payment_id FROM orders WHERE user_id = ?"
  ).bind(userId).all();
  for (const row of results) {
    const lots = String(row.lots || "").split(",").map(function (s) { return s.trim(); });
    if (lots.indexOf(lot) !== -1) return row.payment_id;
  }
  return null;
}

function rowToPublicReview(row) {
  let images = [];
  try { images = JSON.parse(row.images || "[]"); } catch (e) { images = []; }
  return {
    lot: row.lot,
    rating: row.rating,
    body: row.body || "",
    images: images,
    reviewerName: row.reviewer_name || "Verified buyer",
    createdAt: row.created_at
  };
}

async function submitReview(request, env, headers) {
  const userId = await resolveSessionUserId(request, env);
  if (!userId) return json({ error: "Sign in required" }, 401, headers);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON" }, 400, headers);
  }

  const lot = String(body.lot || "").trim();
  const rating = Number(body.rating);
  if (!lot) return json({ error: "Missing lot" }, 400, headers);
  if (!isValidRating(rating)) return json({ error: "Rating must be 1-5" }, 400, headers);

  const paymentId = await userOwnsLot(env, userId, lot);
  if (!paymentId) return json({ error: "You can only review pieces you've purchased" }, 403, headers);

  const reviewBody = String(body.body || "").trim().slice(0, 4000);
  const images = JSON.stringify(Array.isArray(body.images) ? body.images.slice(0, 6) : []);

  // reviewer_name is captured at write time so a public read never has to
  // join against users (which would risk leaking email addresses).
  const user = await env.DB.prepare("SELECT full_name, email FROM users WHERE id = ?").bind(userId).first();
  const reviewerName = (user && user.full_name) || (user && user.email ? user.email.split("@")[0] : "Verified buyer");

  await env.DB.prepare(
    "INSERT INTO reviews (id, lot, user_id, payment_id, rating, body, images, reviewer_name) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(user_id, lot) DO UPDATE SET rating=excluded.rating, body=excluded.body, images=excluded.images, payment_id=excluded.payment_id, created_at=datetime('now')"
  ).bind(crypto.randomUUID(), lot, userId, paymentId, rating, reviewBody, images, reviewerName).run();

  const row = await env.DB.prepare("SELECT * FROM reviews WHERE user_id = ? AND lot = ?").bind(userId, lot).first();
  return json({ review: rowToPublicReview(row) }, 200, headers);
}

async function listReviews(env, headers, lot) {
  if (!lot) return json({ error: "Missing lot" }, 400, headers);
  const { results } = await env.DB.prepare(
    "SELECT * FROM reviews WHERE lot = ? ORDER BY created_at DESC"
  ).bind(lot).all();
  const reviews = results.map(rowToPublicReview);
  const average = reviews.length
    ? Math.round((reviews.reduce(function (s, r) { return s + r.rating; }, 0) / reviews.length) * 10) / 10
    : 0;
  return json({ reviews: reviews, average: average, count: reviews.length }, 200, headers);
}

async function accountReviews(request, env, headers) {
  const userId = await resolveSessionUserId(request, env);
  if (!userId) return json({ error: "Sign in required" }, 401, headers);
  const { results } = await env.DB.prepare("SELECT * FROM reviews WHERE user_id = ?").bind(userId).all();
  return json({ reviews: results.map(rowToPublicReview) }, 200, headers);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // Images are served outside the try/json plumbing below — a missing
    // photo should 404 as an image response, not a JSON error body.
    if (url.pathname.indexOf("/img-cdn/") === 0 && request.method === "GET") {
      return await serveProductImage(env, decodeURIComponent(url.pathname.slice("/img-cdn/".length)));
    }

    try {
      if (url.pathname === "/confirm-payment" && request.method === "POST") {
        return await confirmPayment(request, env, headers);
      }
      if (url.pathname === "/sold-lots" && request.method === "GET") {
        return await soldLots(env, headers);
      }
      if (url.pathname === "/admin/orders" && request.method === "GET") {
        return await adminOrders(request, env, headers);
      }
      const fulfillMatch = url.pathname.match(/^\/admin\/orders\/([^/]+)\/fulfill$/);
      if (fulfillMatch && request.method === "PATCH") {
        return await adminFulfillOrder(request, env, headers, decodeURIComponent(fulfillMatch[1]));
      }
      if (url.pathname === "/contact" && request.method === "POST") {
        return await submitMessage(request, env, headers);
      }
      if (url.pathname === "/admin/messages" && request.method === "GET") {
        return await adminMessages(request, env, headers);
      }

      // Product catalog — public read, admin-gated writes.
      if (url.pathname === "/products" && request.method === "GET") {
        return await publicProducts(env, headers);
      }
      if (url.pathname === "/admin/products" && request.method === "GET") {
        return await adminListProducts(request, env, headers);
      }
      if (url.pathname === "/admin/products" && request.method === "POST") {
        return await adminCreateProduct(request, env, headers);
      }
      if (url.pathname === "/admin/products/publish" && request.method === "POST") {
        return await adminPublishProducts(request, env, headers);
      }
      if (url.pathname === "/admin/products/images" && request.method === "POST") {
        return await uploadProductImage(request, env, headers, url);
      }
      let m = url.pathname.match(/^\/admin\/products\/([^/]+)\/status$/);
      if (m && request.method === "PATCH") {
        return await adminSetProductStatus(request, env, headers, decodeURIComponent(m[1]));
      }
      m = url.pathname.match(/^\/admin\/products\/([^/]+)$/);
      if (m && request.method === "PUT") {
        return await adminUpdateProduct(request, env, headers, decodeURIComponent(m[1]));
      }
      if (m && request.method === "DELETE") {
        return await adminDeleteProduct(request, env, headers, decodeURIComponent(m[1]));
      }

      // Reviews — public read, signed-in-and-purchased write.
      if (url.pathname === "/reviews" && request.method === "GET") {
        return await listReviews(env, headers, url.searchParams.get("lot"));
      }
      if (url.pathname === "/reviews" && request.method === "POST") {
        return await submitReview(request, env, headers);
      }
      if (url.pathname === "/reviews/images" && request.method === "POST") {
        return await uploadReviewImage(request, env, headers, url);
      }
      if (url.pathname === "/account/reviews" && request.method === "GET") {
        return await accountReviews(request, env, headers);
      }

      if (request.method === "POST") {
        return await createOrder(request, env, headers);
      }
      return json({ error: "Not found" }, 404, headers);
    } catch (err) {
      return json({ error: "Server error" }, 500, headers);
    }
  }
};
