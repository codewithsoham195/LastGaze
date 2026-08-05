/* ============================================================
   LASTGAZE — Razorpay order worker
   Creates a signed Razorpay order server-side so a buyer can't
   edit the price in their browser before paying, and marks lots
   sold only after independently verifying payment with Razorpay
   — never trusting the browser's own "payment succeeded" callback.

   Deploy this on Cloudflare Workers. Set RAZORPAY_KEY_ID and
   RAZORPAY_KEY_SECRET as encrypted secrets on the worker —
   never write them into this file or commit them.

   Bind a D1 database as "DB" (same one the account worker uses)
   — Settings -> Bindings — and run sold-lots-schema.sql against
   it once, before relying on /confirm-payment or /sold-lots.
   ============================================================ */

// Authoritative prices, in rupees. Keep this in sync with
// assets/products.js — this worker never trusts a price sent
// by the browser.
const PRICES = {
  "009": 2000,
  "010": 20000,
  "998": 1 // TEMPORARY — checkout/admin test listing, remove once verified
};

const ALLOWED_ORIGINS = [
  "https://lastgaze.com",
  "https://www.lastgaze.com"
];

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

  let amount = 0;
  for (const item of items) {
    const price = PRICES[item.lot];
    if (price == null) {
      return json({ error: "Unknown lot: " + item.lot }, 400, headers);
    }
    amount += price;
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
  const { results } = await env.DB.prepare(
    "SELECT payment_id, order_id, lots, amount, name, phone, email, line1, line2, city, state, postal_code, created_at " +
    "FROM orders ORDER BY created_at DESC"
  ).all();
  return json({ orders: results }, 200, headers);
}

async function soldLots(env, headers) {
  const { results } = await env.DB.prepare("SELECT lot FROM sold_lots").all();
  return json({ lots: results.map(function (r) { return r.lot; }) }, 200, headers);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
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
      if (request.method === "POST") {
        return await createOrder(request, env, headers);
      }
      return json({ error: "Not found" }, 404, headers);
    } catch (err) {
      return json({ error: "Server error" }, 500, headers);
    }
  }
};
