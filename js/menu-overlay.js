(function () {
  'use strict';

  var trigger = document.querySelector('.menu-trigger');
  var overlay = document.querySelector('.menu-overlay');
  var overlayVideo = overlay ? overlay.querySelector('.menu-overlay__video') : null;
  var closeButton = document.querySelector('.menu-overlay__close');
  var bagButton = document.querySelector('.menu-overlay__bag');
  var links = overlay ? Array.prototype.slice.call(overlay.querySelectorAll('a')) : [];
  var lastFocused = null;
  var isOpen = false;

  if (!trigger || !overlay) return;

  function lockBody() {
    document.body.classList.add('menu-open');
  }

  function unlockBody() {
    document.body.classList.remove('menu-open');
  }

  function openMenu() {
    if (isOpen) return;
    isOpen = true;
    trigger.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    if (overlayVideo) {
      overlayVideo.currentTime = 0;
      overlayVideo.play();
    }
    lockBody();
    lastFocused = document.activeElement;
    var firstLink = overlay.querySelector('a');
    if (firstLink) firstLink.focus();
  }

  function closeMenu() {
    if (!isOpen) return;
    isOpen = false;
    trigger.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    if (overlayVideo) {
      overlayVideo.pause();
    }
    unlockBody();
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus();
    }
  }

  trigger.addEventListener('click', function (event) {
    event.preventDefault();
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  closeButton && closeButton.addEventListener('click', function (event) {
    event.preventDefault();
    closeMenu();
  });

  bagButton && bagButton.addEventListener('click', function () {
    closeMenu();
  });

  links.forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('keydown', function (event) {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === 'Tab') {
      var focusable = links.filter(function (link) {
        return link.offsetParent !== null;
      });
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
})();
