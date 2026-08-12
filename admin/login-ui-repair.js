/* STUDY Admin — emergency login UI repair.
 * Keeps the login form above any late-loaded overlay/visual layer and makes
 * the password field reliably focusable/clickable on desktop + mobile.
 */
(function () {
  'use strict';

  function repair() {
    const screen = document.getElementById('adminLogin');
    const card = screen?.querySelector('.login-card');
    const form = document.getElementById('loginForm');
    const input = document.getElementById('adminPassword');
    const button = form?.querySelector('button[type="submit"]');
    if (!screen || !card || !form || !input) return;

    screen.style.position = 'relative';
    screen.style.zIndex = '10000';
    screen.style.pointerEvents = 'auto';
    card.style.position = 'relative';
    card.style.zIndex = '10001';
    card.style.pointerEvents = 'auto';
    form.style.position = 'relative';
    form.style.zIndex = '10002';
    form.style.pointerEvents = 'auto';
    input.style.position = 'relative';
    input.style.zIndex = '10003';
    input.style.pointerEvents = 'auto';
    input.style.userSelect = 'text';
    input.style.webkitUserSelect = 'text';
    input.style.touchAction = 'manipulation';
    input.disabled = false;
    input.removeAttribute('aria-disabled');
    if (button) {
      button.style.position = 'relative';
      button.style.zIndex = '10003';
      button.style.pointerEvents = 'auto';
    }
  }

  repair();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', repair, { once: true });
  }
  window.addEventListener('load', repair, { once: true });
  setTimeout(repair, 100);
  setTimeout(repair, 500);
})();
