/* ============================================================
   LASTGAZE — Razorpay order worker
   Creates a signed Razorpay order server-side so a buyer can't
   edit the price in their browser before paying.

   Deploy this on Cloudflare Workers. Set RAZORPAY_KEY_ID and
   RAZORPAY_KEY_SECRET as encrypted secrets on the worker —
   never write them into this file or commit them.
   ============================================================ */

// Authoritative prices, in rupees. Keep this in sync with
// assets/products.js — this worker never trusts a price sent
// by the browser.
const PRICES = {
  "009": 1
};

const ALLOWED_ORIGINS = [
  "https://lastgaze.com",
  "https://www.lastgaze.com"
];

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return new Response(JSON.stringify({ error: "No items" }), { status: 400, headers });
    }

    let amount = 0;
    for (const item of items) {
      const price = PRICES[item.lot];
      if (price == null) {
        return new Response(JSON.stringify({ error: "Unknown lot: " + item.lot }), { status: 400, headers });
      }
      amount += price;
    }

    const auth = btoa(env.RAZORPAY_KEY_ID + ":" + env.RAZORPAY_KEY_SECRET);
    const rzRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + auth,
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
      return new Response(JSON.stringify({ error: "Razorpay order failed", detail: detail }), { status: 502, headers });
    }

    const order = await rzRes.json();
    return new Response(JSON.stringify({ id: order.id, amount: order.amount }), { headers });
  }
};
