/* STUDY Admin — authoritative, non-blocking login guard. */
(function () {
  'use strict';

  const TOKEN_KEY = 'study_admin_session_v2';
  const TIMEOUT_MS = 7000;
  let submitting = false;

  function $(id) { return document.getElementById(id); }

  function message(text, ok) {
    const box = $('loginMsg');
    if (!box) return;
    box.textContent = text || '';
    box.classList.toggle('success-text', !!ok);
  }

  function restoreInteractivity() {
    const screen = $('adminLogin');
    const card = screen?.querySelector('.login-card');
    const form = $('loginForm');
    const input = $('adminPassword');
    const button = form?.querySelector('button[type="submit"]');

    if (!screen || !form || !input || !button) return false;

    // A previous enhancement/boot error must never leave the login layer
    // covered, disabled, or unable to receive pointer/keyboard events.
    screen.style.position = 'fixed';
    screen.style.inset = '0';
    screen.style.zIndex = '2147483000';
    screen.style.pointerEvents = 'auto';
    if (card) {
      card.style.position = 'relative';
      card.style.zIndex = '2147483001';
      card.style.pointerEvents = 'auto';
    }
    form.style.pointerEvents = 'auto';
    input.style.pointerEvents = 'auto';
    input.disabled = false;
    input.readOnly = false;
    button.style.pointerEvents = 'auto';
    button.disabled = false;
    return true;
  }

  function busy(value) {
    const form = $('loginForm');
    const input = $('adminPassword');
    const button = form && form.querySelector('button[type="submit"]');
    if (input) {
      input.disabled = value;
      input.readOnly = false;
      input.style.pointerEvents = 'auto';
    }
    if (button) {
      button.disabled = value;
      button.textContent = value ? '⏳ Đang xác thực…' : '🔐 Đăng nhập';
      button.style.pointerEvents = value ? 'none' : 'auto';
    }
  }

  async function authenticate() {
    if (submitting) return;
    restoreInteractivity();

    const input = $('adminPassword');
    const password = String(input?.value || '');
    if (!password) {
      message('⚠️ Vui lòng nhập mật khẩu Admin.');
      input?.focus();
      return;
    }

    submitting = true;
    busy(true);
    message('⏳ Đang xác thực…');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ password }),
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal
      });

      const raw = await response.text();
      let data = {};
      try { data = JSON.parse(raw || '{}'); } catch (_) {}

      if (!response.ok) {
        throw new Error(data.error || `Đăng nhập thất bại (HTTP ${response.status})`);
      }
      if (!data.token) throw new Error('Máy chủ không trả về session token.');

      sessionStorage.setItem(TOKEN_KEY, data.token);
      message('✅ Đăng nhập thành công.', true);

      $('adminLogin')?.classList.add('hidden');
      $('adminApp')?.classList.remove('hidden');

      // Optional Admin boot is deliberately non-blocking.
      try {
        if (typeof window.bootAdmin === 'function') {
          await Promise.race([
            Promise.resolve(window.bootAdmin()),
            new Promise(resolve => setTimeout(resolve, 2500))
          ]);
        }
      } catch (bootError) {
        console.error('[STUDY Admin] non-blocking boot error:', bootError);
      }
    } catch (error) {
      console.error('[STUDY Admin] login error:', error);
      if (error?.name === 'AbortError') {
        message('⚠️ Máy chủ phản hồi quá lâu. Hãy thử lại sau vài giây.');
      } else {
        message(`❌ ${error?.message || 'Đăng nhập thất bại.'}`);
      }
      restoreInteractivity();
    } finally {
      clearTimeout(timer);
      submitting = false;
      busy(false);
      restoreInteractivity();
    }
  }

  function install() {
    const form = $('loginForm');
    const button = form?.querySelector('button[type="submit"]');
    const input = $('adminPassword');
    if (!form || !button || !input || form.dataset.loginHardeningV3 === '1') return;
    form.dataset.loginHardeningV3 = '1';

    restoreInteractivity();

    // Capture-phase handler wins over legacy handlers from older fixes.
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      authenticate();
    }, true);

    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      authenticate();
    }, true);

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        authenticate();
      }
    }, true);

    // If another script later toggles disabled/overlay state, recover it.
    window.setTimeout(restoreInteractivity, 0);
    window.setTimeout(restoreInteractivity, 300);
    window.setTimeout(restoreInteractivity, 1000);
  }

  function ready() {
    install();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install, { once: true });
    }
  }

  ready();
})();
