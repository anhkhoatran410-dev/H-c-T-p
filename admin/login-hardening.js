/* STUDY Admin — login hardening layer.
 * Loaded last so login remains usable even when another admin enhancement
 * script throws, hangs, or installs a competing submit handler.
 */
(function () {
  'use strict';

  const TOKEN_KEY = 'study_admin_session_v2';
  const TIMEOUT_MS = 12000;

  function $(id) { return document.getElementById(id); }

  function setMessage(text, kind) {
    const box = $('loginMsg');
    if (!box) return;
    box.textContent = text || '';
    box.classList.toggle('success-text', kind === 'success');
  }

  function setBusy(busy) {
    const form = $('loginForm');
    const input = $('adminPassword');
    const button = form && form.querySelector('button[type="submit"]');
    if (input) input.disabled = busy;
    if (button) {
      button.disabled = busy;
      button.textContent = busy ? '⏳ Đang đăng nhập…' : '🔐 Đăng nhập';
    }
  }

  async function login() {
    const input = $('adminPassword');
    const password = String(input?.value || '');
    if (!password) {
      setMessage('Vui lòng nhập mật khẩu Admin.');
      input?.focus();
      return;
    }

    setBusy(true);
    setMessage('⏳ Đang kết nối máy chủ…');

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
      setMessage('✅ Đăng nhập thành công.', 'success');

      const loginScreen = $('adminLogin');
      const app = $('adminApp');
      loginScreen?.classList.add('hidden');
      app?.classList.remove('hidden');

      // Boot the admin UI after the screen has switched. If a later module
      // fails, the login itself is still successful and the app remains open.
      try {
        if (typeof window.bootAdmin === 'function') {
          await Promise.resolve(window.bootAdmin());
        } else if (typeof window.showApp === 'function') {
          await Promise.resolve(window.showApp());
        }
      } catch (bootError) {
        console.error('[STUDY Admin] boot error after login:', bootError);
        setMessage('✅ Đã đăng nhập. Một số dữ liệu quản trị đang tải lại…', 'success');
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        setMessage('⚠️ Máy chủ phản hồi quá lâu. Hãy thử lại sau vài giây.');
      } else {
        setMessage(error?.message || 'Đăng nhập thất bại.');
      }
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  function install() {
    const form = $('loginForm');
    if (!form || form.dataset.loginHardening === '1') return;
    form.dataset.loginHardening = '1';

    // Capture phase lets this handler win over older bubbling submit handlers.
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      login();
    }, true);

    // Also make the button itself reliable when a legacy form handler is broken.
    const button = form.querySelector('button[type="submit"]');
    if (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        login();
      }, true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
