/* STUDY Admin — final login guard: auth first, boot never blocks login. */
(function () {
  'use strict';

  const TOKEN_KEY = 'study_admin_session_v2';
  const LOGIN_TIMEOUT_MS = 8000;
  let submitting = false;

  const $ = id => document.getElementById(id);

  function message(text, ok) {
    const box = $('loginMsg');
    if (!box) return;
    box.textContent = text || '';
    box.classList.toggle('success-text', !!ok);
  }

  function repair() {
    const screen = $('adminLogin');
    const card = screen?.querySelector('.login-card');
    const form = $('loginForm');
    const input = $('adminPassword');
    const button = form?.querySelector('button[type="submit"]');
    if (!screen || !form || !input || !button) return false;

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
    input.disabled = false;
    input.readOnly = false;
    input.style.pointerEvents = 'auto';
    button.style.pointerEvents = 'auto';
    button.disabled = false;
    return true;
  }

  function busy(value) {
    const form = $('loginForm');
    const input = $('adminPassword');
    const button = form?.querySelector('button[type="submit"]');
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
    repair();

    const password = String($('adminPassword')?.value || '');
    if (!password) {
      message('⚠️ Vui lòng nhập mật khẩu Admin.');
      $('adminPassword')?.focus();
      return;
    }

    submitting = true;
    busy(true);
    message('⏳ Đang xác thực…');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);

    try {
      const response = await fetch('/api/admin-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
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
      if (!data.token) {
        throw new Error('Máy chủ đăng nhập không trả về session token.');
      }

      sessionStorage.setItem(TOKEN_KEY, data.token);
      message('✅ Đăng nhập thành công.', true);

      // IMPORTANT: do not await bootAdmin here. A Supabase/realtime/API
      // problem must never make the login button look permanently loading.
      $('adminLogin')?.classList.add('hidden');
      $('adminApp')?.classList.remove('hidden');

      setTimeout(() => {
        try {
          if (typeof window.bootAdmin === 'function') {
            Promise.resolve(window.bootAdmin()).catch(err => {
              console.error('[STUDY Admin] boot error:', err);
              message('⚠️ Đã đăng nhập. Một số dữ liệu quản trị đang tải lại.', true);
            });
          }
        } catch (err) {
          console.error('[STUDY Admin] boot error:', err);
        }
      }, 0);
    } catch (error) {
      console.error('[STUDY Admin] login error:', error);
      if (error?.name === 'AbortError') {
        message('❌ Máy chủ đăng nhập không phản hồi sau 8 giây. Kiểm tra API /api/admin-login.');
      } else {
        message(`❌ ${error?.message || 'Đăng nhập thất bại.'}`);
      }
      repair();
    } finally {
      clearTimeout(timer);
      submitting = false;
      busy(false);
      repair();
    }
  }

  function install() {
    const form = $('loginForm');
    const button = form?.querySelector('button[type="submit"]');
    const input = $('adminPassword');
    if (!form || !button || !input || form.dataset.loginHardeningFinal === '1') return;
    form.dataset.loginHardeningFinal = '1';

    repair();

    form.addEventListener('submit', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      authenticate();
    }, true);

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      authenticate();
    }, true);

    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        authenticate();
      }
    }, true);

    [0, 250, 1000, 3000].forEach(ms => setTimeout(repair, ms));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
