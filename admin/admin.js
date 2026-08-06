/* ============================================================
   LASTGAZE — admin
   Drives admin/index.html: password-gated order + shipping list.
   Nothing here is linked from the rest of the site and the page
   carries noindex — the only thing actually guarding the data is
   the worker checking X-Admin-Password against its own secret.
   ============================================================ */

var LG_ADMIN_CONFIG = {
  // Same worker that handles payment confirmation. See
  // cloudflare-worker/README.md for setting the ADMIN_PASSWORD secret.
  apiBase: "https://lastgaze-order-worker.l4stgaze.workers.dev"
};

(function () {
  var PW_KEY = 'lg_admin_pw';

  var authView = document.getElementById('admin-auth-view');
  if (!authView) return; // not on the admin page

  var ordersView = document.getElementById('admin-orders-view');
  var loginForm = document.getElementById('admin-login-form');
  var loginMsg = document.getElementById('admin-login-msg');
  var signoutBtn = document.getElementById('admin-signout-btn');
  var searchInput = document.getElementById('admin-search');
  var orderList = document.getElementById('admin-order-list');
  var orderCount = document.getElementById('admin-order-count');
  var adminTabs = document.querySelectorAll('[data-admin-tab]');
  var ordersPanel = document.getElementById('admin-orders-panel');
  var messagesPanel = document.getElementById('admin-messages-panel');
  var messageList = document.getElementById('admin-message-list');
  var messageCount = document.getElementById('admin-message-count');

  var allOrders = [];
  var allMessages = [];

  adminTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      adminTabs.forEach(function (t) { t.classList.remove('is-active'); });
      tab.classList.add('is-active');
      var isMessages = tab.dataset.adminTab === 'messages';
      ordersPanel.style.display = isMessages ? 'none' : 'block';
      messagesPanel.style.display = isMessages ? 'block' : 'none';
    });
  });

  function getPassword() {
    return sessionStorage.getItem(PW_KEY) || '';
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function inr(paise) {
    return '₹' + Math.round((paise || 0) / 100).toLocaleString('en-IN');
  }

  function formatDateTime(raw) {
    if (!raw) return '';
    var d = new Date(raw.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return raw;
    var datePart = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    var timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return datePart + ', ' + timePart;
  }

  function fetchOrders(password) {
    return fetch(LG_ADMIN_CONFIG.apiBase.replace(/\/$/, '') + '/admin/orders', {
      headers: { 'X-Admin-Password': password }
    }).then(function (res) {
      if (res.status === 401) throw new Error('Wrong password.');
      if (!res.ok) throw new Error('Could not load orders.');
      return res.json();
    });
  }

  function fetchMessages(password) {
    return fetch(LG_ADMIN_CONFIG.apiBase.replace(/\/$/, '') + '/admin/messages', {
      headers: { 'X-Admin-Password': password }
    }).then(function (res) {
      if (res.status === 401) throw new Error('Wrong password.');
      if (!res.ok) throw new Error('Could not load messages.');
      return res.json();
    });
  }

  function renderMessages() {
    messageCount.textContent = allMessages.length + (allMessages.length === 1 ? ' message' : ' messages');

    if (!allMessages.length) {
      messageList.innerHTML = '<p class="adm-empty">No messages yet.</p>';
      return;
    }

    messageList.innerHTML = allMessages.map(function (m) {
      return '' +
        '<div class="adm-msg">' +
        '<div class="adm-msg-top">' +
        '<span class="adm-msg-from">' + escapeHtml(m.name) + ' · <a href="mailto:' + escapeHtml(m.email) + '">' + escapeHtml(m.email) + '</a></span>' +
        '<span class="adm-msg-date">' + escapeHtml(formatDateTime(m.created_at)) + '</span>' +
        '</div>' +
        (m.subject ? '<div class="adm-msg-subject">' + escapeHtml(m.subject) + '</div>' : '') +
        '<div class="adm-msg-body">' + escapeHtml(m.message) + '</div>' +
        '</div>';
    }).join('');
  }

  function addressBlock(o) {
    var lines = [o.name, o.phone, o.email, o.line1, o.line2,
      [o.city, o.state, o.postal_code].filter(Boolean).join(', ')];
    return lines.filter(Boolean).join('\n');
  }

  function renderOrders(filterText) {
    var q = (filterText || '').trim().toLowerCase();
    var filtered = !q ? allOrders : allOrders.filter(function (o) {
      return [o.name, o.lots, o.phone, o.city, o.state, o.postal_code, o.payment_id]
        .some(function (f) { return String(f || '').toLowerCase().indexOf(q) !== -1; });
    });

    orderCount.textContent = filtered.length + (filtered.length === 1 ? ' order' : ' orders');

    if (!filtered.length) {
      orderList.innerHTML = '<p class="adm-empty">No orders' + (q ? ' match that search.' : ' yet.') + '</p>';
      return;
    }

    orderList.innerHTML = filtered.map(function (o) {
      var addr = addressBlock(o);
      return '' +
        '<div class="adm-order" data-payment-id="' + escapeHtml(o.payment_id) + '">' +
        '<div class="adm-order-top">' +
        '<span class="adm-order-lots">Lot ' + escapeHtml(o.lots) + '</span>' +
        '<span class="adm-order-amount">' + inr(o.amount) + '</span>' +
        '<span class="adm-order-date">' + escapeHtml(formatDateTime(o.created_at)) + '</span>' +
        '</div>' +
        '<div class="adm-order-body">' + escapeHtml(addr) + '</div>' +
        '<div class="adm-order-actions">' +
        '<button type="button" data-copy>Copy address</button>' +
        '<span class="pg-header-email">' + escapeHtml(o.payment_id) + '</span>' +
        '</div>' +
        '</div>';
    }).join('');

    orderList.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.adm-order');
        var order = filtered.filter(function (o) { return o.payment_id === card.dataset.paymentId; })[0];
        if (!order) return;
        navigator.clipboard.writeText(addressBlock(order)).then(function () {
          var original = btn.textContent;
          btn.textContent = 'Copied';
          setTimeout(function () { btn.textContent = original; }, 1200);
        });
      });
    });
  }

  function showOrders() {
    authView.style.display = 'none';
    ordersView.style.display = 'block';
    signoutBtn.style.display = 'inline';
  }

  function showLogin(message) {
    ordersView.style.display = 'none';
    authView.style.display = 'block';
    signoutBtn.style.display = 'none';
    loginMsg.textContent = message || '';
  }

  function load(password) {
    return fetchOrders(password).then(function (data) {
      sessionStorage.setItem(PW_KEY, password);
      allOrders = data.orders || [];
      showOrders();
      renderOrders(searchInput.value);
      // Best-effort: messages loading shouldn't block the orders view
      // that already succeeded.
      fetchMessages(password).then(function (msgData) {
        allMessages = msgData.messages || [];
        renderMessages();
      }).catch(function () { });
    });
  }

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var password = document.getElementById('admin-password').value;
    loginMsg.textContent = 'Checking…';
    load(password).catch(function (err) {
      showLogin(err.message);
    });
  });

  signoutBtn.addEventListener('click', function () {
    sessionStorage.removeItem(PW_KEY);
    allOrders = [];
    allMessages = [];
    showLogin('');
  });

  searchInput.addEventListener('input', function () {
    renderOrders(searchInput.value);
  });

  var savedPassword = getPassword();
  if (savedPassword) {
    load(savedPassword).catch(function () {
      sessionStorage.removeItem(PW_KEY);
      showLogin('');
    });
  }
})();
