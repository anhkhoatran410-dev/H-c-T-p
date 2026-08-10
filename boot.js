// Safety boot: never leave the public app stuck on the initial loading screen.
(function () {
  const SUPABASE_URL = "https://mlqaeginqsgqacdqdzbm.supabase.co";
  const SUPABASE_KEY = "sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function fixPublicTitle() {
    document.title = "Study";
    document.querySelectorAll('.brand').forEach((el) => {
      if (el.textContent.includes('STUDY')) el.textContent = '🎓 Study';
    });
  }

  async function fallbackLoadExams() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const url = SUPABASE_URL + "/rest/v1/exams?select=*&status=eq.active&order=created_at.desc";
      const res = await fetch(url, {
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return false;
      const data = await res.json();
      if (typeof exams !== "undefined") {
        exams = (data || []).map((e) => ({
          ...e,
          questions: Array.isArray(e.questions) ? e.questions : [],
        }));
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function recover() {
    await sleep(1200);
    const app = document.getElementById("app");
    if (!app) return;

    fixPublicTitle();
    if (typeof render === "function") {
      try { await render(); } catch (_) {}
    }
    fixPublicTitle();

    if (typeof exams !== "undefined" && exams.length === 0) {
      const loaded = await fallbackLoadExams();
      if (loaded && typeof render === "function") {
        try { await render(); } catch (_) {}
        fixPublicTitle();
      }
    }

    if (typeof render !== "function") {
      app.innerHTML = '<main class="container"><div class="card"><h1>🎓 Study</h1><p class="danger-text">Không tải được phần giao diện. Hãy tải lại trang.</p><button class="btn" onclick="location.reload()">↻ Tải lại</button></div></main>';
    }
    fixPublicTitle();
  }

  new MutationObserver(fixPublicTitle).observe(document.documentElement, { childList: true, subtree: true });
  recover();
})();
