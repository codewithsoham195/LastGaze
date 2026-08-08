/* ============================================================
   LASTGAZE — admin: Products tab
   Drives the Products panel in admin/index.html: no-code product
   entry (details + photo upload) with draft/live state, and the
   Publish button that flips every draft live at once. Talks to the
   same worker admin.js does — see LG_ADMIN_CONFIG there.

   The admin password lives in sessionStorage under the same key
   admin.js writes it to; this file only ever reads it, so it never
   needs to duplicate the login form or its validation.
   ============================================================ */
(function () {
  var PW_KEY = 'lg_admin_pw';

  var panel = document.getElementById('admin-products-panel');
  if (!panel) return; // not on the admin page

  var listEl = document.getElementById('admin-product-list');
  var countEl = document.getElementById('admin-product-count');
  var addBtn = document.getElementById('admin-add-product-btn');
  var form = document.getElementById('admin-product-form');
  var formTitle = document.getElementById('admin-product-form-title');
  var formMsg = document.getElementById('admin-product-form-msg');
  var cancelBtn = document.getElementById('pf-cancel-btn');
  var saveBtn = document.getElementById('pf-save-btn');
  var imagesInput = document.getElementById('pf-images');
  var imageListEl = document.getElementById('pf-image-list');
  var publishBar = document.getElementById('admin-publish-bar');
  var publishMsg = document.getElementById('admin-publish-msg');
  var publishBtn = document.getElementById('admin-publish-btn');

  var fields = {
    lot: document.getElementById('pf-lot'),
    name: document.getElementById('pf-name'),
    era: document.getElementById('pf-era'),
    cat: document.getElementById('pf-cat'),
    price: document.getElementById('pf-price'),
    size: document.getElementById('pf-size'),
    condition: document.getElementById('pf-condition'),
    measure: document.getElementById('pf-measure'),
    isNew: document.getElementById('pf-isnew'),
    sale: document.getElementById('pf-sale'),
    sold: document.getElementById('pf-sold'),
    comingSoon: document.getElementById('pf-comingsoon')
  };

  var allProducts = [];
  var editingLot = null; // null while creating a new product
  var uploadedImages = []; // [{ url }] in upload/display order — first is the cover
  var loaded = false;

  function getPassword() {
    return sessionStorage.getItem(PW_KEY) || '';
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function inr(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN');
  }

  function api(path, options) {
    options = options || {};
    options.headers = options.headers || {};
    options.headers['X-Admin-Password'] = getPassword();
    return fetch(LG_ADMIN_CONFIG.apiBase.replace(/\/$/, '') + path, options).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          throw new Error(body.error || 'Request failed (' + res.status + ')');
        });
      }
      return res.status === 204 ? null : res.json();
    });
  }

  function fetchProducts() {
    return api('/admin/products').then(function (data) {
      allProducts = data.products || [];
      render();
    });
  }

  function nextLotSuggestion() {
    var max = 0;
    allProducts.forEach(function (p) {
      var n = parseInt(p.lot, 10);
      if (!isNaN(n) && String(n) === String(p.lot).replace(/^0+(?=\d)/, '') && n > max) max = n;
    });
    var next = max + 1;
    var digits = Math.max(3, String(max || 1).length);
    var padded = String(next);
    while (padded.length < digits) padded = '0' + padded;
    return padded;
  }

  function render() {
    countEl.textContent = allProducts.length + (allProducts.length === 1 ? ' product' : ' products');

    var drafts = allProducts.filter(function (p) { return p.status === 'draft'; });
    if (drafts.length) {
      publishBar.classList.add('is-visible');
      publishMsg.textContent = drafts.length + (drafts.length === 1 ? ' draft product ready to publish.' : ' draft products ready to publish.');
      publishBtn.disabled = false;
    } else {
      publishBar.classList.remove('is-visible');
    }

    if (!allProducts.length) {
      listEl.innerHTML = '<p class="adm-empty">No products yet — add your first piece above.</p>';
      return;
    }

    listEl.innerHTML = allProducts.map(function (p) {
      var thumb = p.image ? '<img src="' + escapeHtml(p.image) + '" alt="">' : '';
      var statusLabel = p.status === 'live' ? 'Live' : 'Draft';
      return '' +
        '<div class="adm-product" data-lot="' + escapeHtml(p.lot) + '">' +
        '<div class="adm-product-thumb">' + thumb + '</div>' +
        '<div class="adm-product-body">' +
        '<div class="adm-product-top">' +
        '<span><span class="adm-product-lot">Lot ' + escapeHtml(p.lot) + '</span><span class="adm-product-name">' + escapeHtml(p.name) + '</span></span>' +
        '<span class="adm-status' + (p.status === 'live' ? ' is-live' : '') + '">' + statusLabel + '</span>' +
        '</div>' +
        '<div class="adm-product-price">' + inr(p.price) + '</div>' +
        '<div class="adm-product-actions">' +
        '<button type="button" data-edit>Edit</button>' +
        '<button type="button" data-toggle-status>' + (p.status === 'live' ? 'Take offline' : 'Publish this one') + '</button>' +
        '<button type="button" data-delete>Delete</button>' +
        '</div></div></div>';
    }).join('');

    listEl.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { openForEdit(lotFromCard(btn)); });
    });
    listEl.querySelectorAll('[data-toggle-status]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleStatus(lotFromCard(btn)); });
    });
    listEl.querySelectorAll('[data-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteProduct(lotFromCard(btn)); });
    });
  }

  function lotFromCard(btn) {
    return btn.closest('.adm-product').dataset.lot;
  }

  function findProduct(lot) {
    return allProducts.filter(function (p) { return p.lot === lot; })[0];
  }

  function toggleStatus(lot) {
    var p = findProduct(lot);
    if (!p) return;
    var nextStatus = p.status === 'live' ? 'draft' : 'live';
    api('/admin/products/' + encodeURIComponent(lot) + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus })
    }).then(fetchProducts).catch(function (err) { alert(err.message); });
  }

  function deleteProduct(lot) {
    var p = findProduct(lot);
    if (!p) return;
    if (!confirm('Delete "' + p.name + '" (lot ' + lot + ')? This can\'t be undone.')) return;
    api('/admin/products/' + encodeURIComponent(lot), { method: 'DELETE' })
      .then(fetchProducts)
      .catch(function (err) { alert(err.message); });
  }

  /* ---------- add / edit form ---------- */

  function renderImageList() {
    imageListEl.innerHTML = uploadedImages.map(function (img, i) {
      return '' +
        '<div class="adm-image-item' + (i === 0 ? ' is-cover' : '') + '" data-idx="' + i + '">' +
        '<img src="' + escapeHtml(img.url) + '" alt="">' +
        '<button type="button" class="adm-image-remove" data-remove-image aria-label="Remove photo">&times;</button>' +
        '</div>';
    }).join('');

    imageListEl.querySelectorAll('[data-remove-image]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.closest('.adm-image-item').dataset.idx);
        uploadedImages.splice(idx, 1);
        renderImageList();
      });
    });
  }

  function uploadImage(file) {
    return api('/admin/products/images?filename=' + encodeURIComponent(file.name), {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
  }

  imagesInput.addEventListener('change', function () {
    var files = Array.prototype.slice.call(imagesInput.files || []);
    if (!files.length) return;
    formMsg.textContent = 'Uploading ' + files.length + (files.length === 1 ? ' photo…' : ' photos…');
    saveBtn.disabled = true;

    files.reduce(function (chain, file) {
      return chain.then(function () {
        return uploadImage(file).then(function (data) {
          uploadedImages.push({ url: data.url });
          renderImageList();
        });
      });
    }, Promise.resolve())
      .then(function () { formMsg.textContent = ''; })
      .catch(function (err) { formMsg.textContent = err.message; })
      .then(function () { saveBtn.disabled = false; imagesInput.value = ''; });
  });

  function resetForm() {
    fields.lot.value = '';
    fields.lot.disabled = false;
    fields.name.value = '';
    fields.era.value = '';
    fields.cat.value = 'denim';
    fields.price.value = '';
    fields.size.value = '';
    fields.condition.value = '';
    fields.measure.value = '';
    fields.isNew.checked = false;
    fields.sale.checked = false;
    fields.sold.checked = false;
    fields.comingSoon.checked = false;
    uploadedImages = [];
    renderImageList();
    formMsg.textContent = '';
  }

  function openForAdd() {
    editingLot = null;
    resetForm();
    fields.lot.value = nextLotSuggestion();
    formTitle.textContent = 'Add product';
    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openForEdit(lot) {
    var p = findProduct(lot);
    if (!p) return;
    editingLot = lot;
    resetForm();
    fields.lot.value = p.lot;
    fields.lot.disabled = true; // lot is the product's id — not editable in place
    fields.name.value = p.name || '';
    fields.era.value = p.era || '';
    fields.cat.value = p.cat || 'denim';
    fields.price.value = p.price != null ? p.price : '';
    fields.size.value = p.size || '';
    fields.condition.value = p.condition || '';
    fields.measure.value = (p.measure || '').split('<br>').join('\n');
    fields.isNew.checked = !!p.isNew;
    fields.sale.checked = !!p.sale;
    fields.sold.checked = !!p.sold;
    fields.comingSoon.checked = !!p.comingSoon;
    uploadedImages = (p.images && p.images.length ? p.images : (p.image ? [p.image] : [])).map(function (url) { return { url: url }; });
    renderImageList();
    formTitle.textContent = 'Edit product — Lot ' + p.lot;
    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeForm() {
    form.style.display = 'none';
    editingLot = null;
  }

  addBtn.addEventListener('click', openForAdd);
  cancelBtn.addEventListener('click', closeForm);

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var lot = fields.lot.value.trim();
    var name = fields.name.value.trim();
    var price = Number(fields.price.value);

    if (!lot || !name || !fields.price.value || isNaN(price) || price < 0) {
      formMsg.textContent = 'Lot, name and a valid price are required.';
      return;
    }

    var payload = {
      lot: lot,
      name: name,
      era: fields.era.value.trim(),
      cat: fields.cat.value,
      price: price,
      size: fields.size.value.trim(),
      condition: fields.condition.value.trim(),
      measure: fields.measure.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).join('<br>'),
      isNew: fields.isNew.checked,
      sale: fields.sale.checked,
      sold: fields.sold.checked,
      comingSoon: fields.comingSoon.checked,
      image: uploadedImages.length ? uploadedImages[0].url : '',
      images: uploadedImages.map(function (i) { return i.url; })
    };

    saveBtn.disabled = true;
    formMsg.textContent = 'Saving…';

    var req = editingLot
      ? api('/admin/products/' + encodeURIComponent(editingLot), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      : api('/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

    req.then(function () {
      closeForm();
      return fetchProducts();
    }).catch(function (err) {
      formMsg.textContent = err.message;
    }).then(function () {
      saveBtn.disabled = false;
    });
  });

  /* ---------- publish ---------- */

  publishBtn.addEventListener('click', function () {
    var draftLots = allProducts.filter(function (p) { return p.status === 'draft'; }).map(function (p) { return p.lot; });
    if (!draftLots.length) return;
    publishBtn.disabled = true;
    api('/admin/products/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lots: draftLots })
    }).then(fetchProducts).catch(function (err) {
      alert(err.message);
      publishBtn.disabled = false;
    });
  });

  /* ---------- load on first visit to this tab ---------- */

  document.addEventListener('lg-admin-tab', function (e) {
    if (e.detail.tab !== 'products' || loaded) return;
    loaded = true;
    fetchProducts().catch(function (err) {
      listEl.innerHTML = '<p class="adm-empty">Could not load products: ' + escapeHtml(err.message) + '</p>';
    });
  });
})();
