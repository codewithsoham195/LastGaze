/* ============================================================
   LASTGAZE — product catalog loader
   The catalog itself is no longer edited here. Add, edit, and
   publish products from the admin page's Products tab — see
   admin/README.md. This file just fetches whatever's currently
   published and makes it available the same way the old static
   array did: window.LASTGAZE_PRODUCTS.

   Because that fetch is async, anything that reads
   window.LASTGAZE_PRODUCTS must wait on window.LG_PRODUCTS_READY
   first (a promise that resolves with the same array). See
   assets/site.js's renderGrid()/renderPDP() for the pattern.
   ============================================================ */

window.LASTGAZE_DROP = {
  number: 1,                     // Drop 001
  opensAt: "2026-08-15T09:00:00+05:30",  // Saturday, 15 Aug 2026, 9AM IST
  password: "lastgaze"           // change this every drop
};

window.LASTGAZE_PRODUCTS = [];

window.LG_PRODUCTS_READY = fetch("https://lastgaze-order-worker.l4stgaze.workers.dev/products")
  .then(function (r) { return r.json(); })
  .then(function (d) {
    window.LASTGAZE_PRODUCTS = Array.isArray(d.products) ? d.products : [];
    return window.LASTGAZE_PRODUCTS;
  })
  .catch(function () {
    window.LASTGAZE_PRODUCTS = [];
    return window.LASTGAZE_PRODUCTS;
  });
