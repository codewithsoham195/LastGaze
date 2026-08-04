/* ============================================================
   LASTGAZE — site behaviour
   No framework. No build step. No Shopify.
   ============================================================ */
(function () {
  'use strict';

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var INR = function (n) { return '₹' + n.toLocaleString('en-IN'); };
  var priceLabel = function (p) { return p.comingSoon || typeof p.price !== 'number' ? 'Details soon' : INR(p.price); };

  /* ---------- 1. grain (generated, not a downloaded texture) ------ */
  function grain() {
    if (!document.querySelector('.grain')) return;
    var c = document.createElement('canvas'), n = 120;
    c.width = c.height = n;
    var x = c.getContext('2d'), d = x.createImageData(n, n), p = d.data;
    for (var i = 0; i < p.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 26;
    }
    x.putImageData(d, 0, 0);
    document.documentElement.style.setProperty('--noise', 'url(' + c.toDataURL() + ')');
  }

  /* ---------- 2. the extruded gaze -------------------------------- */
  function gaze() {
    var el = document.querySelector('.gaze');
    if (!el) return;

    var DEPTH = reduced ? 1 : 26;
    for (var i = 0; i < DEPTH; i++) {
      var l = document.createElement('div');
      l.className = 'layer';
      // back layers sit deeper and darker -> reads as a solid extruded object
      l.style.transform = 'translateZ(' + ((i - DEPTH / 2) * 1.6).toFixed(2) + 'px)';
      l.style.opacity = (0.30 + (i / DEPTH) * 0.70).toFixed(3);
      el.appendChild(l);
    }
    var scan = document.createElement('div');
    scan.className = 'scan';
    el.appendChild(scan);

    if (reduced) return;

    var tx = 0, ty = 0, cx = 0, cy = 0, sy = 0;
    addEventListener('pointermove', function (e) {
      tx = (e.clientY / innerHeight - 0.5) * -26;
      ty = (e.clientX / innerWidth - 0.5) * 40;
    }, { passive: true });

    addEventListener('scroll', function () {
      sy = scrollY;
    }, { passive: true });

    (function loop() {
      cx += (tx - cx) * 0.055;
      cy += (ty - cy) * 0.055;
      var k = Math.min(sy / (innerHeight || 1), 1);
      el.style.setProperty('--rx', (-13 + cx + k * 34).toFixed(2) + 'deg');
      el.style.setProperty('--ry', (26 + cy + k * 120).toFixed(2) + 'deg');
      el.style.opacity = (1 - k * 0.92).toFixed(3);
      el.style.scale = (1 - k * 0.3).toFixed(3);
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- 3. reveals + nav ------------------------------------ */
  function reveals() {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8%' });

    document.querySelectorAll('.rise').forEach(function (el, i) {
      el.style.transitionDelay = (Math.min(i, 6) * 70) + 'ms';
      io.observe(el);
    });

    var nav = document.querySelector('.nav'), last = 0;
    if (!nav) return;
    addEventListener('scroll', function () {
      var y = scrollY;
      nav.classList.toggle('hide', y > last && y > 220);
      last = y;
    }, { passive: true });
  }

  /* ---------- 4. cart (memory-first, storage if allowed) ---------- */
  var Cart = {
    items: [],
    load: function () {
      try { this.items = JSON.parse(sessionStorage.getItem('lg_cart') || '[]'); } catch (e) { this.items = []; }
      this.paint();
    },
    save: function () {
      try { sessionStorage.setItem('lg_cart', JSON.stringify(this.items)); } catch (e) { }
      this.paint();
    },
    add: function (p, size) {
      if (this.items.some(function (i) { return i.lot === p.lot; })) return 'already';
      this.items.push({ lot: p.lot, name: p.name, price: p.price, size: size || p.size });
      this.save();
      return 'added';
    },
    total: function () { return this.items.reduce(function (s, i) { return s + i.price; }, 0); },
    paint: function () {
      var n = this.items.length;
      document.querySelectorAll('[data-cart-count]').forEach(function (e) {
        e.textContent = n ? 'Bag (' + n + ')' : 'Bag';
      });
    }
  };
  window.LG_CART = Cart;

  /* ---------- 5. product grid ------------------------------------ */
  function frame(p, i, priority) {
    var src = (p.images && p.images[i]) || (i === 0 ? p.image : '');
    var alt = p.name + (i ? ' — view ' + (i + 1) : '');
    var loading = priority ? 'eager' : 'lazy';
    var fetch = priority ? ' fetchpriority="high"' : '';
    if (src) return '<div class="frame"><img src="' + src + '" alt="' + alt + '" loading="' + loading + '" decoding="async"' + fetch + '></div>';
    return '<div class="frame empty"><div class="slot-note lab">Lot ' + p.lot + '<br>Image pending</div></div>';
  }

  function card(p) {
    var state = p.sold ? 'sold' : (p.comingSoon ? 'preview' : '');
    return '' +
      '<article class="card rise' + (state ? ' ' + state : '') + '">' +
      '<a href="product.html?lot=' + p.lot + '" style="display:grid;gap:12px;color:inherit;text-decoration:none">' +
      frame(p, 0) +
      '<div class="card-row"><h3>' + p.name + '</h3><span class="price' + (p.sold ? ' strike' : '') + '">' + priceLabel(p) + '</span></div>' +
      '<div class="lab dim">' + (p.era || 'Archive preview') + '</div>' +
      '</a></article>';
  }

  function renderGrid() {
    var g = document.querySelector('[data-grid]');
    if (!g) return;
    var list = window.LASTGAZE_PRODUCTS || [];
    g.innerHTML = list.map(card).join('');

    var count = document.querySelector('[data-product-count]');
    if (count) count.textContent = String(list.length);

    reveals();
  }

  /* ---------- 6. product page ------------------------------------ */
  function renderPDP() {
    var root = document.querySelector('[data-pdp]');
    if (!root) return;
    var lot = new URLSearchParams(location.search).get('lot') || '001';
    var all = window.LASTGAZE_PRODUCTS || [];
    var p = all.filter(function (x) { return x.lot === lot; })[0] || all[0];
    if (!p) return;

    document.title = p.name + ' — LASTGAZE';
    var galleryImages = (p.images || []).filter(Boolean);
    if (!galleryImages.length) galleryImages = p.image ? [p.image] : [''];
    root.querySelector('[data-gallery]').innerHTML = galleryImages.map(function (src, i) { return frame(p, i, i === 0); }).join('');

    var info = root.querySelector('[data-info]');
    var unavailable = p.sold || p.comingSoon;
    var sizeControl = p.size
      ? '<div><div class="lab dim" style="margin-bottom:8px">Size — one piece only</div><div class="sizes"><button class="size lab" aria-pressed="true">' + p.size + '</button></div></div>'
      : '<div class="lab dim">Sizing details coming soon</div>';
    info.innerHTML = '' +
      '<div class="pdp-primary">' +
      '<div class="lab dim">Lot ' + p.lot + ' · ' + p.era + '</div>' +
      '<h1 class="h-1">' + p.name + '</h1>' +
      '<div class="price" style="font-size:18px">' + priceLabel(p) + '</div>' +
      '</div>' +
      '<div class="pdp-secondary">' +
      sizeControl +
      '<button class="btn solid" data-buy' + (unavailable ? ' disabled style="opacity:.4;cursor:not-allowed"' : '') + '>' +
      '<span>' + (p.sold ? 'Gone' : (p.comingSoon ? 'Details coming soon' : 'Add to bag')) + '</span></button>' +
      '<details class="acc"><summary><span class="lab">Description</span><span class="pm">+</span></summary>' +
      '<div class="bd">' + p.condition + '</div></details>' +
      '<details class="acc"><summary><span class="lab">Measurements</span><span class="pm">+</span></summary>' +
      '<div class="bd">' + p.measure + '</div></details>' +
      '<details class="acc"><summary><span class="lab">Shipping &amp; returns</span><span class="pm">+</span></summary>' +
      '<div class="bd">Dispatched from New Delhi within 48 hours. Shipping across India takes 3–5 days, fully tracked. ' +
      'As every piece is a one-of-one, all sales are final — but please reach out within 48 hours of delivery if there\'s an issue, and we\'ll make it right.</div></details>' +
      '<details class="acc"><summary><span class="lab">On this piece</span><span class="pm">+</span></summary>' +
      '<div class="bd">Sourced, washed, measured and photographed by hand. Nothing is restored beyond cleaning. What you see is what has survived.</div></details>' +
      '</div>';

    var buy = info.querySelector('[data-buy]');
    if (buy && !unavailable) {
      buy.addEventListener('click', function () {
        var r = Cart.add(p, p.size);
        buy.querySelector('span').textContent = r === 'added' ? 'In your bag' : 'Already in bag';
      });
    }
  }

  /* ---------- 7. checkout ---------------------------------------- */
  /*  Razorpay loads only when someone actually checks out.
      Put your key in assets/checkout.js — never inline it in HTML.  */
  window.LG_CHECKOUT = function () {
    if (!Cart.items.length) return;
    if (typeof window.LG_PAY === 'function') return window.LG_PAY(Cart);
    alert('Checkout is not connected yet. See README — step 4.');
  };

  /* ---------- 8. countdown --------------------------------------- */
  function countdown() {
    var box = document.querySelector('[data-count]');
    if (!box || !window.LASTGAZE_DROP) return;
    var end = new Date(window.LASTGAZE_DROP.opensAt).getTime();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    function tick() {
      var d = Math.max(0, end - Date.now()), s = Math.floor(d / 1000);
      box.querySelectorAll('strong')[0].textContent = pad(Math.floor(s / 86400));
      box.querySelectorAll('strong')[1].textContent = pad(Math.floor(s / 3600) % 24);
      box.querySelectorAll('strong')[2].textContent = pad(Math.floor(s / 60) % 60);
      box.querySelectorAll('strong')[3].textContent = pad(s % 60);
    }
    tick(); setInterval(tick, 1000);
  }

  /* ---------- 9. drop lock --------------------------------------- */
  function lock() {
    var f = document.querySelector('[data-lock]');
    if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = f.querySelector('input').value.trim().toLowerCase();
      var input = f.querySelector('input');
      var status = document.querySelector('[data-lock-status]');
      if (v === String(window.LASTGAZE_DROP.password).toLowerCase()) {
        try { sessionStorage.setItem('lg_open', '1'); } catch (er) { }
        location.href = 'index.html';
      } else {
        input.setAttribute('aria-invalid', 'true');
        if (status) status.textContent = 'That access code is not recognised.';
        f.classList.add('bad');
        setTimeout(function () { f.classList.remove('bad'); input.focus(); }, 420);
      }
    });
  }

  /* ---------- boot ------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', function () {
    grain(); gaze(); Cart.load(); renderGrid(); renderPDP(); countdown(); lock(); reveals();
    document.querySelectorAll('[data-checkout]').forEach(function (b) {
      b.addEventListener('click', window.LG_CHECKOUT);
    });
    requestAnimationFrame(function () {
      document.querySelectorAll('.hero .rise').forEach(function (e, i) {
        setTimeout(function () { e.classList.add('in'); }, 180 + i * 110);
      });
    });
  });
})();
