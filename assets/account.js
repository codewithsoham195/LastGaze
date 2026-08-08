/* ============================================================
   LASTGAZE — account
   Drives account.html: sign in / sign up / address book.
   Talks to the account worker over fetch, authenticating with a
   bearer token (not a cookie) since the worker lives on a
   different origin — a cookie set there would be a third-party
   cookie, which Chrome/Safari block by default for many visitors.
   ============================================================ */

var LG_ACCOUNT_CONFIG = {
  // Deployed account-worker URL. See cloudflare-worker-accounts/README.md.
  apiBase: "https://lastgaze-account-worker.l4stgaze.workers.dev"
};

(function () {
  var TOKEN_KEY = 'lg_session_token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function api(path, options) {
    options = options || {};
    var opts = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken()
      }
    };
    for (var k in options) opts[k] = options[k];
    return fetch(LG_ACCOUNT_CONFIG.apiBase.replace(/\/$/, '') + path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Something went wrong');
        return data;
      });
    });
  }

  var authView = document.getElementById('auth-view');
  if (!authView) return; // not on the account page

  var accountView = document.getElementById('account-view');
  var tabs = document.querySelectorAll('#auth-view .pg-tab');
  var signinForm = document.getElementById('signin-form');
  var signupForm = document.getElementById('signup-account-form');
  var signinMsg = document.getElementById('signin-msg');
  var signupMsg = document.getElementById('signup-account-msg');
  var accountEmail = document.getElementById('account-email');
  var signoutBtn = document.getElementById('signout-btn');
  var addressList = document.getElementById('address-list');
  var addAddressBtn = document.getElementById('add-address-btn');
  var addressForm = document.getElementById('address-form');
  var addressMsg = document.getElementById('address-msg');
  var addressCancel = document.getElementById('address-cancel');
  var accountTabs = document.querySelectorAll('[data-account-tab]');
  var ordersPanel = document.getElementById('orders-panel');
  var addressesPanel = document.getElementById('addresses-panel');
  var ordersList = document.getElementById('orders-list');

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('is-active'); });
      tab.classList.add('is-active');
      var isSignup = tab.dataset.tab === 'signup';
      signinForm.style.display = isSignup ? 'none' : 'block';
      signupForm.style.display = isSignup ? 'block' : 'none';
    });
  });

  accountTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      accountTabs.forEach(function (t) { t.classList.remove('is-active'); });
      tab.classList.add('is-active');
      var isAddresses = tab.dataset.accountTab === 'addresses';
      ordersPanel.style.display = isAddresses ? 'none' : 'block';
      addressesPanel.style.display = isAddresses ? 'block' : 'none';
    });
  });

  if (!LG_ACCOUNT_CONFIG.apiBase) {
    signinMsg.textContent = 'Account service is not configured yet.';
    return;
  }

  function showAccount(user) {
    // Came here from checkout's "sign in required" prompt — go straight
    // back instead of leaving the buyer stranded on the account page.
    // The cart itself never left sessionStorage, so this just re-opens
    // checkout where they left off.
    var resumeUrl;
    try { resumeUrl = sessionStorage.getItem('lg_resume_checkout'); } catch (e) { resumeUrl = null; }
    if (resumeUrl) {
      try { sessionStorage.removeItem('lg_resume_checkout'); } catch (e) { }
      location.href = resumeUrl + (resumeUrl.indexOf('?') > -1 ? '&' : '?') + 'resumeCheckout=1';
      return;
    }

    authView.style.display = 'none';
    accountView.style.display = 'block';
    accountEmail.textContent = user.email;
    accountEmail.style.display = 'inline';
    signoutBtn.style.display = 'inline';
    loadOrders();
    loadAddresses();
  }

  function showAuth() {
    accountView.style.display = 'none';
    authView.style.display = 'block';
    accountEmail.style.display = 'none';
    signoutBtn.style.display = 'none';
  }

  signinForm.addEventListener('submit', function (e) {
    e.preventDefault();
    signinMsg.textContent = '';
    api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('signin-email').value.trim(),
        password: document.getElementById('signin-password').value
      })
    }).then(function (data) {
      setToken(data.token);
      showAccount(data.user);
    }).catch(function (err) {
      signinMsg.textContent = err.message;
    });
  });

  signupForm.addEventListener('submit', function (e) {
    e.preventDefault();
    signupMsg.textContent = '';
    api('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        full_name: document.getElementById('signup-name').value.trim(),
        email: document.getElementById('signup-account-email').value.trim(),
        password: document.getElementById('signup-account-password').value
      })
    }).then(function (data) {
      setToken(data.token);
      showAccount(data.user);
    }).catch(function (err) {
      signupMsg.textContent = err.message;
    });
  });

  signoutBtn.addEventListener('click', function () {
    api('/auth/logout', { method: 'POST' }).then(function () {
      clearToken();
      showAuth();
    });
  });

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  function inr(paise) {
    return '₹' + Math.round((paise || 0) / 100).toLocaleString('en-IN');
  }

  function findProduct(lot) {
    var products = window.LASTGAZE_PRODUCTS || [];
    return products.filter(function (p) { return p.lot === lot; })[0];
  }

  function renderOrders(orders) {
    if (!orders.length) {
      ordersList.innerHTML = '<p class="pg-form-msg" style="margin:0 0 20px;">No orders yet.</p>';
      return;
    }
    ordersList.innerHTML = orders.map(function (o) {
      var lots = String(o.lots || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var itemsHtml = lots.map(function (lot) {
        var p = findProduct(lot) || {};
        var img = p.image || (p.images && p.images[0]) || '';
        var thumb = img
          ? '<img src="' + img + '" alt="' + escapeHtml(p.name || lot) + '">'
          : '';
        return '' +
          '<div class="ord-item">' +
          '<div class="ord-item-frame">' + thumb + '</div>' +
          '<div>' +
          '<div class="ord-item-name">' + escapeHtml(p.name || ('Lot ' + lot)) + '</div>' +
          '<div class="ord-item-meta">Lot ' + escapeHtml(lot) + '</div>' +
          '</div></div>';
      }).join('');
      var placed = o.created_at
        ? new Date(o.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : '';
      return '' +
        '<a class="ord-card" href="/order-confirmation/?paid=' + encodeURIComponent(o.payment_id || '') + '">' +
        '<div class="ord-card-top">' +
        '<span class="ord-date">' + escapeHtml(placed) + '</span>' +
        '<span class="ord-ref">' + escapeHtml(o.payment_id || '') + '</span>' +
        '</div>' +
        itemsHtml +
        '<div class="ord-total"><span>Total paid</span><strong>' + inr(o.amount) + '</strong></div>' +
        '</a>';
    }).join('');
  }

  function loadOrders() {
    // findProduct() below reads window.LASTGAZE_PRODUCTS — wait for the
    // catalog fetch alongside the orders fetch so it's populated by the
    // time renderOrders() looks up each item's thumbnail.
    Promise.all([api('/account/orders', { method: 'GET' }), window.LG_PRODUCTS_READY]).then(function (results) {
      renderOrders(results[0].orders || []);
    }).catch(function () {
      ordersList.innerHTML = '<p class="pg-form-msg">Could not load orders.</p>';
    });
  }

  function renderAddresses(addresses) {
    if (!addresses.length) {
      addressList.innerHTML = '<p class="pg-form-msg" style="margin:0 0 20px;">No saved addresses yet.</p>';
      return;
    }
    addressList.innerHTML = addresses.map(function (a) {
      return '' +
        '<div class="pg-address-card" data-id="' + a.id + '">' +
          '<div class="pg-address-card__top">' +
            '<span class="pg-address-card__label">' + escapeHtml(a.label || 'Address') + '</span>' +
            (a.is_default ? '<span class="pg-address-card__default">Default</span>' : '') +
          '</div>' +
          '<div class="pg-address-card__body">' +
            escapeHtml(a.full_name) + '<br>' +
            escapeHtml(a.line1) + (a.line2 ? ', ' + escapeHtml(a.line2) : '') + '<br>' +
            escapeHtml(a.city) + ', ' + escapeHtml(a.state) + ' ' + escapeHtml(a.postal_code) + '<br>' +
            escapeHtml(a.country) + (a.phone ? ' · ' + escapeHtml(a.phone) : '') +
          '</div>' +
          '<div class="pg-address-card__actions">' +
            '<button type="button" class="pg-link-btn" data-edit="' + a.id + '">Edit</button>' +
            '<button type="button" class="pg-link-btn" data-delete="' + a.id + '">Delete</button>' +
          '</div>' +
        '</div>';
    }).join('');

    addressList.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var address = addresses.filter(function (a) { return a.id === btn.dataset.edit; })[0];
        if (address) openAddressForm(address);
      });
    });
    addressList.querySelectorAll('[data-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Delete this address?')) return;
        api('/account/addresses/' + btn.dataset.delete, { method: 'DELETE' }).then(loadAddresses);
      });
    });
  }

  function loadAddresses() {
    api('/account/addresses', { method: 'GET' }).then(function (data) {
      renderAddresses(data.addresses || []);
    });
  }

  function openAddressForm(address) {
    address = address || {};
    document.getElementById('address-id').value = address.id || '';
    document.getElementById('address-label').value = address.label || '';
    document.getElementById('address-full-name').value = address.full_name || '';
    document.getElementById('address-line1').value = address.line1 || '';
    document.getElementById('address-line2').value = address.line2 || '';
    document.getElementById('address-city').value = address.city || '';
    document.getElementById('address-state').value = address.state || '';
    document.getElementById('address-postal').value = address.postal_code || '';
    document.getElementById('address-phone').value = address.phone || '';
    document.getElementById('address-default').checked = !!address.is_default;
    addressMsg.textContent = '';
    addressForm.style.display = 'block';
    addAddressBtn.style.display = 'none';
    addressForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function closeAddressForm() {
    addressForm.reset();
    addressForm.style.display = 'none';
    addAddressBtn.style.display = 'block';
  }

  addAddressBtn.addEventListener('click', function () { openAddressForm(); });
  addressCancel.addEventListener('click', closeAddressForm);

  addressForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = document.getElementById('address-id').value;
    var payload = {
      label: document.getElementById('address-label').value.trim(),
      full_name: document.getElementById('address-full-name').value.trim(),
      line1: document.getElementById('address-line1').value.trim(),
      line2: document.getElementById('address-line2').value.trim(),
      city: document.getElementById('address-city').value.trim(),
      state: document.getElementById('address-state').value.trim(),
      postal_code: document.getElementById('address-postal').value.trim(),
      phone: document.getElementById('address-phone').value.trim(),
      is_default: document.getElementById('address-default').checked
    };
    var request = id
      ? api('/account/addresses/' + id, { method: 'PUT', body: JSON.stringify(payload) })
      : api('/account/addresses', { method: 'POST', body: JSON.stringify(payload) });
    request.then(function () {
      closeAddressForm();
      loadAddresses();
    }).catch(function (err) {
      addressMsg.textContent = err.message;
    });
  });

  // Check for an existing session on load.
  if (getToken()) {
    api('/account/me', { method: 'GET' }).then(function (data) {
      showAccount(data.user);
    }).catch(function () {
      clearToken();
      showAuth();
    });
  } else {
    showAuth();
  }
})();
