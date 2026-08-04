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
  "010": 20000
};

const ALLOWED_ORIGINS = [
  "https://lastgaze.com",
  "https://www.lastgaze.com"
];

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status: status || 200, headers });
}

function razorpayAuth(env) {
  return "Basic " + btoa(env.RAZORPAY_KEY_ID + ":" + env.RAZORPAY_KEY_SECRET);
}

async function createOrder(request, env, headers) {
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

  return json({ ok: true, lots: lots }, 200, headers);
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
      if (request.method === "POST") {
        return await createOrder(request, env, headers);
      }
      return json({ error: "Not found" }, 404, headers);
    } catch (err) {
      return json({ error: "Server error" }, 500, headers);
    }
  }
};
