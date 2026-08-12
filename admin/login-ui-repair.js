/* STUDY Admin — emergency login UI repair. */
(function () {
  'use strict';

  function repair() {
    const screen = document.getElementById('adminLogin');
    const card = screen?.querySelector('.login-card');
    const form = document.getElementById('loginForm');
    const input = document.getElementById('adminPassword');
    const button = form?.querySelector('button[type="submit"]');
    if (!screen || !card || !form || !input) return;

    screen.style.position = 'fixed';
    screen.style.inset = '0';
    screen.style.zIndex = '2147483000';
    screen.style.pointerEvents = 'auto';
    card.style.position = 'relative';
    card.style.zIndex = '2147483001';
    card.style.pointerEvents = 'auto';
    form.style.position = 'relative';
    form.style.zIndex = '2147483002';
    form.style.pointerEvents = 'auto';

    input.style.position = 'relative';
    input.style.zIndex = '2147483003';
    input.style.pointerEvents = 'auto';
    input.style.userSelect = 'text';
    input.style.webkitUserSelect = 'text';
    input.style.touchAction = 'manipulation';
    input.disabled = false;
    input.readOnly = false;
    input.removeAttribute('aria-disabled');

    if (button) {
      button.style.position = 'relative';
      button.style.zIndex = '2147483003';
      button.style.pointerEvents = 'auto';
      button.disabled = false;
    }
  }

  function schedule() {
    repair();
    [0, 100, 300, 700, 1500, 3000].forEach(ms => setTimeout(repair, ms));
  }

  schedule();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  }
  window.addEventListener('load', schedule, { once: true });
})();
