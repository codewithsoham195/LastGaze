/* ============================================================
   LASTGAZE — payment hook
   Only file that knows about your payment provider.
   Nothing about it is shown in the UI.
   ============================================================ */

var LG_CONFIG = {
  keyId: "rzp_live_TLclBaju3VOqER",   // Razorpay Dashboard -> Settings -> API Keys
  brand: "LASTGAZE",
  color: "#050505",
  // WhatsApp number for "Reserve on WhatsApp" flow.
  // Format: country code + number, no + or spaces. e.g. India = 91XXXXXXXXXX
  whatsapp: "919999999999",
  // Where the signed order is created. See README step 4.
  orderEndpoint: "https://lastgaze-order-worker.l4stgaze.workers.dev/",
  // Same account worker assets/account.js talks to — used here to look
  // up a signed-in buyer's saved addresses at checkout.
  accountApiBase: "https://lastgaze-account-worker.l4stgaze.workers.dev"
};

// Same key assets/account.js stores the session token under.
function LG_SESSION_TOKEN() {
  try { return localStorage.getItem('lg_session_token') || ''; } catch (e) { return ''; }
}

/* ---- account gate — every order must belong to a signed-in account,
   so checkout never even opens the shipping form for a guest. ---- */
function LG_SIGNIN_REQUIRED() {
  var overlay = document.createElement('div');
  overlay.setAttribute('style',
    'position:fixed;inset:0;z-index:99999;background:rgba(5,5,5,.72);' +
    'display:flex;align-items:center;justify-content:center;padding:20px;' +
    'font-family:Arial,Helvetica,sans-serif;');
  overlay.innerHTML = '' +
    '<div style="background:#050505;color:#F0ECE6;max-width:380px;width:100%;padding:28px 24px;text-align:center;">' +
    '<h2 style="margin:0 0 10px;font-size:18px;">Sign in to check out</h2>' +
    '<p style="margin:0 0 22px;font-size:13px;color:rgba(240,236,230,.6);line-height:1.5;">Create a free account or sign in so we can confirm your order and keep your delivery details on file.</p>' +
    '<a href="/account/" style="display:block;background:#F0ECE6;color:#050505;border:0;padding:13px 0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;margin-bottom:10px;">Sign in / Create account</a>' +
    '<button type="button" data-lg-signin-cancel style="width:100%;background:transparent;color:#F0ECE6;border:0;padding:10px 0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;opacity:.55;">Cancel</button>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.querySelector('[data-lg-signin-cancel]').addEventListener('click', function () {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  });
}

/* ---- address picker — shown instead of the manual form when a signed-in
   buyer already has saved addresses, so they don't have to retype one
   they've already given us. ---- */
function LG_ADDRESS_PICKER(addresses, onSelect, onUseNew, onCancel) {
  var overlay = document.createElement('div');
  overlay.setAttribute('style',
    'position:fixed;inset:0;z-index:99999;background:rgba(5,5,5,.72);' +
    'display:flex;align-items:center;justify-content:center;padding:20px;' +
    'font-family:Arial,Helvetica,sans-serif;');

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var cardsHtml = addresses.map(function (a, i) {
    var lines = [a.full_name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(', '), a.phone].filter(Boolean);
    return '' +
      '<button type="button" data-lg-addr="' + i + '" style="display:block;width:100%;text-align:left;background:transparent;border:1px solid rgba(240,236,230,.25);color:#F0ECE6;padding:14px 16px;margin-bottom:10px;cursor:pointer;font-size:13px;line-height:1.55;">' +
      (a.label ? '<div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:rgba(240,236,230,.45);margin-bottom:6px;">' + escapeHtml(a.label) + (a.is_default ? ' · Default' : '') + '</div>' : '') +
      escapeHtml(lines.join(', ')) +
      '</button>';
  }).join('');

  overlay.innerHTML = '' +
    '<div style="background:#050505;color:#F0ECE6;max-width:420px;width:100%;max-height:88vh;overflow:auto;padding:26px 24px;">' +
    '<h2 style="margin:0 0 4px;font-size:18px;">Choose a delivery address</h2>' +
    '<p style="margin:0 0 18px;font-size:13px;color:rgba(240,236,230,.55);">Where should we send this?</p>' +
    cardsHtml +
    '<button type="button" data-lg-addr-new style="width:100%;background:transparent;color:#F0ECE6;border:1px dashed rgba(240,236,230,.3);padding:13px 0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;margin-top:4px;">Use a different address</button>' +
    '<button type="button" data-lg-addr-cancel style="width:100%;background:transparent;color:#F0ECE6;border:0;padding:10px 0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;opacity:.55;margin-top:6px;">Cancel</button>' +
    '</div>';

  document.body.appendChild(overlay);

  function close() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  overlay.querySelectorAll('[data-lg-addr]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var a = addresses[Number(btn.getAttribute('data-lg-addr'))];
      close();
      onSelect(a);
    });
  });

  overlay.querySelector('[data-lg-addr-new]').addEventListener('click', function () {
    close();
    onUseNew();
  });

  overlay.querySelector('[data-lg-addr-cancel]').addEventListener('click', function () {
    close();
    if (onCancel) onCancel();
  });
}

/* ---- shipping form — asked once, before Razorpay opens, so every
   paid order has a name + address to ship to. Self-styled (no
   dependency on site.css classes) since this file is deliberately
   the one place that owns the payment flow. ---- */
function LG_SHIPPING_FORM(onSubmit, onCancel, prefill) {
  var overlay = document.createElement('div');
  overlay.setAttribute('style',
    'position:fixed;inset:0;z-index:99999;background:rgba(5,5,5,.72);' +
    'display:flex;align-items:center;justify-content:center;padding:20px;' +
    'font-family:Arial,Helvetica,sans-serif;');

  var fields = [
    ['name', 'Full name', 'text', 'name'],
    ['phone', 'Phone', 'tel', 'tel'],
    ['email', 'Email (optional)', 'email', 'email'],
    ['line1', 'Address line 1', 'text', 'address-line1'],
    ['line2', 'Address line 2 (optional)', 'text', 'address-line2'],
    ['city', 'City', 'text', 'address-level2'],
    ['state', 'State', 'text', 'address-level1'],
    ['postal_code', 'Pincode', 'text', 'postal-code']
  ];

  function escapeAttr(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var inputHtml = fields.map(function (f) {
    var required = (f[0] !== 'email' && f[0] !== 'line2') ? ' required' : '';
    var value = prefill && prefill[f[0]] ? ' value="' + escapeAttr(prefill[f[0]]) + '"' : '';
    return '' +
      '<label style="display:block;margin-bottom:14px;">' +
      '<span style="display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(240,236,230,.5);margin-bottom:6px;">' + f[1] + '</span>' +
      '<input name="' + f[0] + '" type="' + f[2] + '" autocomplete="' + f[3] + '"' + required + value +
      ' style="width:100%;box-sizing:border-box;border:0;border-bottom:1px solid rgba(240,236,230,.3);background:transparent;color:#F0ECE6;font-size:15px;padding:9px 0;outline:0;">' +
      '</label>';
  }).join('');

  overlay.innerHTML = '' +
    '<div style="background:#050505;color:#F0ECE6;max-width:420px;width:100%;max-height:88vh;overflow:auto;padding:26px 24px;">' +
    '<h2 style="margin:0 0 4px;font-size:18px;color:#F0ECE6;">Shipping details</h2>' +
    '<p style="margin:0 0 18px;font-size:13px;color:rgba(240,236,230,.55);">Where should we send this?</p>' +
    '<form data-lg-ship-form>' + inputHtml +
    '<p data-lg-ship-err style="display:none;color:#ff7a7a;font-size:12px;margin:0 0 12px;"></p>' +
    '<button type="submit" style="width:100%;background:#F0ECE6;color:#050505;border:0;padding:13px 0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;margin-top:6px;">Continue to payment</button>' +
    '<button type="button" data-lg-ship-cancel style="width:100%;background:transparent;color:#F0ECE6;border:0;padding:10px 0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;opacity:.55;">Cancel</button>' +
    '</form></div>';

  document.body.appendChild(overlay);

  var form = overlay.querySelector('[data-lg-ship-form]');
  var err = overlay.querySelector('[data-lg-ship-err]');

  function close() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  overlay.querySelector('[data-lg-ship-cancel]').addEventListener('click', function () {
    close();
    if (onCancel) onCancel();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = {};
    fields.forEach(function (f) { data[f[0]] = form.elements[f[0]].value.trim(); });
    var missing = fields.some(function (f) {
      return f[0] !== 'email' && f[0] !== 'line2' && !data[f[0]];
    });
    if (missing) {
      err.textContent = 'Please fill in every required field.';
      err.style.display = 'block';
      return;
    }
    close();
    onSubmit(data);
  });
}

window.LG_PAY = function (cart) {
  if (!LG_SESSION_TOKEN()) return LG_SIGNIN_REQUIRED();

  var amount = cart.total();
  var lots = cart.items.map(function (i) { return i.lot; }).join(', ');

  function open(orderId, shipping) {
    var rz = new Razorpay({
      key: LG_CONFIG.keyId,
      amount: amount * 100,
      currency: "INR",
      name: LG_CONFIG.brand,
      description: "Lot " + lots,
      order_id: orderId || undefined,
      prefill: {
        name: shipping.name,
        email: shipping.email || undefined,
        contact: shipping.phone
      },
      theme: { color: LG_CONFIG.color, backdrop_color: "#050505" },
      notes: { lots: lots },
      handler: function (res) {
        try {
          sessionStorage.setItem('lg_last_order', JSON.stringify({
            payment_id: res.razorpay_payment_id,
            items: cart.items,
            amount: amount,
            shipping: shipping,
            placed_at: new Date().toISOString()
          }));
        } catch (e) { }
        try { sessionStorage.removeItem('lg_cart'); } catch (e) { }
        var redirect = function () { location.href = "/order-confirmation/?paid=" + res.razorpay_payment_id; };
        if (!LG_CONFIG.orderEndpoint) return redirect();
        // Tell the worker to independently verify this payment with
        // Razorpay, mark the lot(s) sold, and record the shipping
        // details (tagged to the signed-in account) — best-effort,
        // never blocks the buyer's success redirect if it fails.
        fetch(LG_CONFIG.orderEndpoint.replace(/\/$/, '') + '/confirm-payment', {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + LG_SESSION_TOKEN() },
          body: JSON.stringify({ payment_id: res.razorpay_payment_id, shipping: shipping })
        }).then(redirect).catch(redirect);
      }
    });
    rz.open();
  }

  function boot(shipping) {
    var token = LG_SESSION_TOKEN();
    if (!token) return LG_SIGNIN_REQUIRED();
    if (!LG_CONFIG.orderEndpoint) return open(null, shipping);
    // No silent fallback here on purpose: without a signed order_id from
    // this call, Razorpay would open unsigned (a buyer could edit the
    // price) and the purchase wouldn't be tied to an account — both are
    // things this checkout is specifically built to prevent.
    fetch(LG_CONFIG.orderEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ amount: amount, items: cart.items })
    })
      .then(function (r) {
        if (r.status === 401) { LG_SIGNIN_REQUIRED(); return null; }
        if (!r.ok) throw new Error('order failed');
        return r.json();
      })
      .then(function (d) { if (d) open(d.id, shipping); })
      .catch(function () { alert('Could not start checkout. Please try again.'); });
  }

  function withRazorpayLoaded(fn) {
    if (window.Razorpay) return fn();
    var s = document.createElement('script');
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = fn;
    document.head.appendChild(s);
  }

  function proceedWithShipping(shipping) {
    withRazorpayLoaded(function () { boot(shipping); });
  }

  function startManualShipping(prefill) {
    LG_SHIPPING_FORM(proceedWithShipping, undefined, prefill);
  }

  function addressToShipping(a) {
    return {
      name: a.full_name || '',
      phone: a.phone || '',
      email: '',
      line1: a.line1 || '',
      line2: a.line2 || '',
      city: a.city || '',
      state: a.state || '',
      postal_code: a.postal_code || ''
    };
  }

  // Saved addresses first, so a returning buyer doesn't retype one we
  // already have. Falls back to the manual form if there are none, the
  // lookup fails, or the buyer picks "use a different address" — and if
  // a saved address is missing a phone number (optional in the address
  // book), routes into the manual form pre-filled instead of silently
  // dropping the shipping record (the worker requires phone).
  fetch(LG_CONFIG.accountApiBase.replace(/\/$/, '') + '/account/addresses', {
    headers: { "Authorization": "Bearer " + LG_SESSION_TOKEN() }
  })
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function (data) {
      var addresses = data.addresses || [];
      if (!addresses.length) return startManualShipping();
      LG_ADDRESS_PICKER(addresses, function (a) {
        var shipping = addressToShipping(a);
        if (!shipping.phone) return startManualShipping(shipping);
        proceedWithShipping(shipping);
      }, startManualShipping);
    })
    .catch(function () { startManualShipping(); });
};
