/* ============================================================
   LASTGAZE — payment hook
   Only file that knows about your payment provider.
   Nothing about it is shown in the UI.
   ============================================================ */

var LG_CONFIG = {
  keyId: "rzp_test_TLZWBLYkdD36bR",   // Razorpay Dashboard -> Settings -> API Keys
  brand: "LASTGAZE",
  color: "#050505",
  // WhatsApp number for "Reserve on WhatsApp" flow.
  // Format: country code + number, no + or spaces. e.g. India = 91XXXXXXXXXX
  whatsapp: "919999999999",
  // Where the signed order is created. See README step 4.
  orderEndpoint: ""               // e.g. "https://your-worker.workers.dev/order"
};

window.LG_PAY = function (cart) {
  var amount = cart.total();
  var lots = cart.items.map(function (i) { return i.lot; }).join(', ');

  function open(orderId) {
    var rz = new Razorpay({
      key: LG_CONFIG.keyId,
      amount: amount * 100,
      currency: "INR",
      name: LG_CONFIG.brand,
      description: "Lot " + lots,
      order_id: orderId || undefined,
      theme: { color: LG_CONFIG.color, backdrop_color: "#050505" },
      notes: { lots: lots },
      handler: function (res) {
        try { sessionStorage.removeItem('lg_cart'); } catch (e) { }
        location.href = "index.html?paid=" + res.razorpay_payment_id;
      }
    });
    rz.open();
  }

  function boot() {
    if (!LG_CONFIG.orderEndpoint) return open(null);
    fetch(LG_CONFIG.orderEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amount, items: cart.items })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) { open(d.id); })
      .catch(function () { open(null); });
  }

  if (window.Razorpay) return boot();
  var s = document.createElement('script');
  s.src = "https://checkout.razorpay.com/v1/checkout.js";
  s.onload = boot;
  document.head.appendChild(s);
};
