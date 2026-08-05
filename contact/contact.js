/* ============================================================
   LASTGAZE — contact form
   Posts to the order worker's /contact endpoint (public, no
   account needed) — messages show up on /admin/'s Messages tab.
   ============================================================ */

var LG_CONTACT_CONFIG = {
  apiBase: "https://lastgaze-order-worker.l4stgaze.workers.dev"
};

(function () {
  var form = document.getElementById('contact-form');
  if (!form) return;

  var msg = document.getElementById('contact-msg');
  var submitBtn = form.querySelector('button[type="submit"]');
  var subjectSelect = document.getElementById('contact-subject');

  subjectSelect.addEventListener('change', function () {
    subjectSelect.classList.toggle('is-chosen', !!subjectSelect.value);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msg.textContent = 'Sending…';
    submitBtn.disabled = true;

    fetch(LG_CONTACT_CONFIG.apiBase.replace(/\/$/, '') + '/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('contact-name').value.trim(),
        email: document.getElementById('contact-email').value.trim(),
        subject: document.getElementById('contact-subject').value,
        message: document.getElementById('contact-message').value.trim()
      })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
          return data;
        });
      })
      .then(function () {
        form.reset();
        subjectSelect.classList.remove('is-chosen');
        msg.textContent = "Sent — we'll get back to you soon.";
        submitBtn.disabled = false;
      })
      .catch(function (err) {
        msg.textContent = err.message;
        submitBtn.disabled = false;
      });
  });
})();
