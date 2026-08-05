/* ============================================================
   LASTGAZE — Account worker
   Handles customer signup, login, logout and address book,
   backed by Cloudflare D1. Deployed separately from the order
   worker so payment logic is never touched by this file.

   Bind a D1 database as "DB" (wrangler.toml or dashboard
   Settings -> Bindings) and run schema.sql against it once,
   before the first deploy.
   ============================================================ */

const ALLOWED_ORIGINS = [
  "https://lastgaze.com",
  "https://www.lastgaze.com"
];

const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status: status || 200, headers });
}

function bufToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

// PBKDF2-SHA256 is used instead of bcrypt/argon2 because it's built into the
// Workers runtime's Web Crypto API — no extra dependency to bundle.
async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBuf(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial, 256
  );
  return { hash: bufToHex(bits), salt: bufToHex(salt) };
}

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bufToHex(digest);
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// The session token travels as an Authorization header, not a cookie —
// a cookie set by this *.workers.dev origin while the page is on
// lastgaze.com is a third-party cookie, which Chrome and Safari block by
// default for a growing share of visitors. A bearer token isn't subject
// to that restriction at all.
function bearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function createSession(db, userId) {
  const token = bufToHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000).toISOString();
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(tokenHash, userId, expiresAt).run();
  return token;
}

async function getSessionUser(db, request) {
  const token = bearerToken(request);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(
    `SELECT users.id, users.email, users.full_name
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > datetime('now')`
  ).bind(tokenHash).first();
  return row || null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);
    const url = new URL(request.url);
    const db = env.DB;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    try {
      if (url.pathname === "/auth/signup" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        const fullName = String(body.full_name || "").trim();

        if (!isValidEmail(email)) return json({ error: "Invalid email" }, 400, headers);
        if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400, headers);

        const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (existing) return json({ error: "An account with this email already exists" }, 409, headers);

        const { hash, salt } = await hashPassword(password);
        const userId = crypto.randomUUID();
        await db.prepare(
          "INSERT INTO users (id, email, password_hash, password_salt, full_name) VALUES (?, ?, ?, ?, ?)"
        ).bind(userId, email, hash, salt, fullName).run();

        const token = await createSession(db, userId);
        return json({ ok: true, token, user: { id: userId, email, full_name: fullName } }, 200, headers);
      }

      if (url.pathname === "/auth/login" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        const user = await db.prepare(
          "SELECT id, email, full_name, password_hash, password_salt FROM users WHERE email = ?"
        ).bind(email).first();

        if (!user) return json({ error: "Invalid email or password" }, 401, headers);

        const { hash } = await hashPassword(password, user.password_salt);
        if (hash !== user.password_hash) return json({ error: "Invalid email or password" }, 401, headers);

        const token = await createSession(db, user.id);
        return json({ ok: true, token, user: { id: user.id, email: user.email, full_name: user.full_name } }, 200, headers);
      }

      if (url.pathname === "/auth/logout" && request.method === "POST") {
        const token = bearerToken(request);
        if (token) {
          const tokenHash = await sha256Hex(token);
          await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
        }
        return json({ ok: true }, 200, headers);
      }

      // Every route below requires a signed-in session.
      const me = await getSessionUser(db, request);

      if (url.pathname === "/account/me" && request.method === "GET") {
        if (!me) return json({ error: "Not signed in" }, 401, headers);
        return json({ user: me }, 200, headers);
      }

      if (url.pathname === "/account/orders" && request.method === "GET") {
        if (!me) return json({ error: "Not signed in" }, 401, headers);
        // Reads the order worker's table directly — both workers share
        // this D1 database, so no service-to-service call is needed.
        const { results } = await db.prepare(
          "SELECT payment_id, lots, amount, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC"
        ).bind(me.id).all();
        return json({ orders: results }, 200, headers);
      }

      if (url.pathname === "/account/addresses" && request.method === "GET") {
        if (!me) return json({ error: "Not signed in" }, 401, headers);
        const { results } = await db.prepare(
          "SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC"
        ).bind(me.id).all();
        return json({ addresses: results }, 200, headers);
      }

      if (url.pathname === "/account/addresses" && request.method === "POST") {
        if (!me) return json({ error: "Not signed in" }, 401, headers);
        const body = await request.json().catch(() => ({}));
        const required = ["full_name", "line1", "city", "state", "postal_code"];
        for (const field of required) {
          if (!String(body[field] || "").trim()) return json({ error: `Missing field: ${field}` }, 400, headers);
        }
        const id = crypto.randomUUID();
        if (body.is_default) {
          await db.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").bind(me.id).run();
        }
        await db.prepare(
          `INSERT INTO addresses (id, user_id, label, full_name, line1, line2, city, state, postal_code, country, phone, is_default)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          id, me.id, body.label || "", body.full_name, body.line1, body.line2 || "",
          body.city, body.state, body.postal_code, body.country || "IN", body.phone || "",
          body.is_default ? 1 : 0
        ).run();
        return json({ ok: true, id }, 200, headers);
      }

      const addressMatch = url.pathname.match(/^\/account\/addresses\/([a-f0-9-]+)$/);
      if (addressMatch && (request.method === "PUT" || request.method === "DELETE")) {
        if (!me) return json({ error: "Not signed in" }, 401, headers);
        const addressId = addressMatch[1];
        const owned = await db.prepare("SELECT id FROM addresses WHERE id = ? AND user_id = ?")
          .bind(addressId, me.id).first();
        if (!owned) return json({ error: "Address not found" }, 404, headers);

        if (request.method === "DELETE") {
          await db.prepare("DELETE FROM addresses WHERE id = ?").bind(addressId).run();
          return json({ ok: true }, 200, headers);
        }

        const body = await request.json().catch(() => ({}));
        const required = ["full_name", "line1", "city", "state", "postal_code"];
        for (const field of required) {
          if (!String(body[field] || "").trim()) return json({ error: `Missing field: ${field}` }, 400, headers);
        }
        if (body.is_default) {
          await db.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").bind(me.id).run();
        }
        await db.prepare(
          `UPDATE addresses SET label = ?, full_name = ?, line1 = ?, line2 = ?, city = ?, state = ?,
           postal_code = ?, country = ?, phone = ?, is_default = ? WHERE id = ?`
        ).bind(
          body.label || "", body.full_name, body.line1, body.line2 || "", body.city, body.state,
          body.postal_code, body.country || "IN", body.phone || "", body.is_default ? 1 : 0, addressId
        ).run();
        return json({ ok: true }, 200, headers);
      }

      return json({ error: "Not found" }, 404, headers);
    } catch (err) {
      return json({ error: "Server error" }, 500, headers);
    }
  }
};
