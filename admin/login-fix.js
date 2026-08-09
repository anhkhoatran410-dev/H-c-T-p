// STUDY Admin login hardening: replaces the older submit handler with
// a timeout + visible network/HTTP error so the login can never appear frozen.
(function () {
  const TOKEN_KEY = "study_admin_session_v2";
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.onsubmit = async function (event) {
    event.preventDefault();
    const passwordEl = document.getElementById("adminPassword");
    const msg = document.getElementById("loginMsg");
    const button = form.querySelector("button[type=submit]");
    const password = String(passwordEl?.value || "");

    if (!password) {
      if (msg) msg.textContent = "Vui lòng nhập mật khẩu Admin.";
      passwordEl?.focus();
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "⏳ Đang xác thực...";
    }
    if (msg) msg.textContent = "";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ password }),
        signal: controller.signal,
        cache: "no-store"
      });

      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}

      if (!response.ok) {
        throw new Error(data.error || `API đăng nhập trả về HTTP ${response.status}`);
      }
      if (!data.token) {
        throw new Error("API đăng nhập không trả về session token.");
      }

      sessionStorage.setItem(TOKEN_KEY, data.token);
      if (typeof window.showApp === "function") {
        window.showApp();
      } else {
        location.reload();
      }
    } catch (error) {
      const message = error?.name === "AbortError"
        ? "Máy chủ đăng nhập phản hồi quá lâu (10 giây). Hãy kiểm tra deployment /api/admin-login."
        : (error?.message || "Đăng nhập thất bại.");
      if (msg) msg.textContent = message;
    } finally {
      clearTimeout(timer);
      if (button) {
        button.disabled = false;
        button.textContent = "🔐 Đăng nhập";
      }
    }
  };
})();
