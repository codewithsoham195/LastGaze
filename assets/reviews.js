/* ============================================================
   LASTGAZE — product reviews
   Renders the star-rating reviews block on the product page.
   Reviews are buyer-submitted from the account page's My Orders
   tab (see assets/account.js) and auto-publish — no moderation
   step, so whatever GET /reviews returns is shown as-is.
   ============================================================ */
(function () {
  'use strict';

  var REVIEWS_ENDPOINT = 'https://lastgaze-order-worker.l4stgaze.workers.dev/reviews';

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function stars(rating) {
    var full = Math.round(rating);
    var out = '';
    for (var i = 1; i <= 5; i++) out += i <= full ? '★' : '☆';
    return out;
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(String(iso).replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function reviewCard(r) {
    var photos = (r.images || []).map(function (src) {
      return '<div class="rv-photo"><img src="' + escapeHtml(src) + '" alt="" loading="lazy"></div>';
    }).join('');
    return '' +
      '<div class="rv-card">' +
      '<div class="rv-top">' +
      '<span class="rv-stars">' + stars(r.rating) + '</span>' +
      '<span class="lab dim">' + escapeHtml(r.reviewerName) + ' · ' + escapeHtml(formatDate(r.createdAt)) + '</span>' +
      '</div>' +
      (r.body ? '<p class="rv-body">' + escapeHtml(r.body) + '</p>' : '') +
      (photos ? '<div class="rv-photos">' + photos + '</div>' : '') +
      '</div>';
  }

  function render(root, data) {
    if (!data.count) {
      root.innerHTML = '';
      return;
    }
    root.innerHTML = '<div class="rv-list">' + data.reviews.map(reviewCard).join('') + '</div>';
  }

  function init() {
    var root = document.querySelector('[data-reviews]');
    if (!root) return;
    var lot = new URLSearchParams(location.search).get('lot') || '001';
    fetch(REVIEWS_ENDPOINT + '?lot=' + encodeURIComponent(lot))
      .then(function (r) { return r.json(); })
      .then(function (data) { render(root, data); })
      .catch(function () { root.innerHTML = ''; });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
