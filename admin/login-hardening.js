/* STUDY Admin — login hardening.
 * This is the final, single-purpose login guard. It must never depend on
 * Supabase or the rest of the Admin app being ready before authentication.
 */
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

  function busy(value) {
    const form = $('loginForm');
    const input = $('adminPassword');
    const button = form && form.querySelector('button[type="submit"]');
    if (input) input.disabled = value;
    if (button) {
      button.disabled = value;
      button.textContent = value ? '⏳ Đang xác thực…' : '🔐 Đăng nhập';
      button.style.pointerEvents = value ? 'none' : '';
    }
  }

  async function authenticate() {
    if (submitting) return;
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

      // Switch screens immediately. Do not wait for Supabase, realtime,
      // Copilot, exam builder, or any optional enhancement module.
      $('adminLogin')?.classList.add('hidden');
      $('adminApp')?.classList.remove('hidden');

      // Boot optional Admin data without allowing a boot error to block login.
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
    } finally {
      clearTimeout(timer);
      submitting = false;
      busy(false);
    }
  }

  function install() {
    const form = $('loginForm');
    const button = form?.querySelector('button[type="submit"]');
    if (!form || !button || form.dataset.loginHardeningV2 === '1') return;
    form.dataset.loginHardeningV2 = '1';

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
  }

  function ready() {
    // Run immediately when possible and once again after DOMContentLoaded.
    install();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install, { once: true });
    }
  }

  ready();
})();
