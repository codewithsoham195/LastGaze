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
  orderEndpoint: "https://lastgaze-order-worker.l4stgaze.workers.dev/"
};

/* ---- shipping form — asked once, before Razorpay opens, so every
   paid order has a name + address to ship to. Self-styled (no
   dependency on site.css classes) since this file is deliberately
   the one place that owns the payment flow. ---- */
function LG_SHIPPING_FORM(onSubmit, onCancel) {
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

  var inputHtml = fields.map(function (f) {
    var required = (f[0] !== 'email' && f[0] !== 'line2') ? ' required' : '';
    return '' +
      '<label style="display:block;margin-bottom:12px;">' +
      '<span style="display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(5,5,5,.55);margin-bottom:5px;">' + f[1] + '</span>' +
      '<input name="' + f[0] + '" type="' + f[2] + '" autocomplete="' + f[3] + '"' + required +
      ' style="width:100%;box-sizing:border-box;border:1px solid rgba(5,5,5,.25);background:#fff;color:#050505;font-size:15px;padding:10px 12px;outline:0;">' +
      '</label>';
  }).join('');

  overlay.innerHTML = '' +
    '<div style="background:#F0ECE6;color:#050505;max-width:420px;width:100%;max-height:88vh;overflow:auto;padding:26px 24px;">' +
    '<h2 style="margin:0 0 4px;font-size:18px;">Shipping details</h2>' +
    '<p style="margin:0 0 18px;font-size:13px;color:rgba(5,5,5,.6);">Where should we send this?</p>' +
    '<form data-lg-ship-form>' + inputHtml +
    '<p data-lg-ship-err style="display:none;color:#a33;font-size:12px;margin:0 0 12px;"></p>' +
    '<button type="submit" style="width:100%;background:#050505;color:#F0ECE6;border:0;padding:13px 0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;">Continue to payment</button>' +
    '<button type="button" data-lg-ship-cancel style="width:100%;background:transparent;color:#050505;border:0;padding:10px 0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;opacity:.6;">Cancel</button>' +
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
        try { sessionStorage.removeItem('lg_cart'); } catch (e) { }
        var redirect = function () { location.href = "/?paid=" + res.razorpay_payment_id; };
        if (!LG_CONFIG.orderEndpoint) return redirect();
        // Tell the worker to independently verify this payment with
        // Razorpay, mark the lot(s) sold, and record the shipping
        // details — best-effort, never blocks the buyer's success
        // redirect if it fails.
        fetch(LG_CONFIG.orderEndpoint.replace(/\/$/, '') + '/confirm-payment', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_id: res.razorpay_payment_id, shipping: shipping })
        }).then(redirect).catch(redirect);
      }
    });
    rz.open();
  }

  function boot(shipping) {
    if (!LG_CONFIG.orderEndpoint) return open(null, shipping);
    fetch(LG_CONFIG.orderEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amount, items: cart.items })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) { open(d.id, shipping); })
      .catch(function () { open(null, shipping); });
  }

  function withRazorpayLoaded(fn) {
    if (window.Razorpay) return fn();
    var s = document.createElement('script');
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = fn;
    document.head.appendChild(s);
  }

  LG_SHIPPING_FORM(function (shipping) {
    withRazorpayLoaded(function () { boot(shipping); });
  });
};
