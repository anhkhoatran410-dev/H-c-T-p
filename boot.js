// Safe boot: recover from app startup failures without touching the DOM in a loop.
(function () {
  const SUPABASE_URL = "https://mlqaeginqsgqacdqdzbm.supabase.co";
  const SUPABASE_KEY = "sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi";
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let titleFixed = false;
  let recoveryStarted = false;

  function fixPublicTitle() {
    if (!titleFixed) {
      document.title = "Study";
      titleFixed = true;
    }

    // Only update an existing brand when it actually needs changing.
    document.querySelectorAll(".brand").forEach((el) => {
      const text = (el.textContent || "").trim();
      if (text === "🎓 Study") return;
      if (text.includes("STUDY") || text.includes("Study Test AI")) {
        el.textContent = "🎓 Study";
      }
    });
  }

  async function fallbackLoadExams() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const url = SUPABASE_URL + "/rest/v1/exams?select=*&status=eq.active&order=created_at.desc";
      const res = await fetch(url, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY,
        },
        signal: controller.signal,
      });
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
    } finally {
      clearTimeout(timer);
    }
  }

  async function recover() {
    // The final UI owns rendering. Never call the legacy window.render() here:
    // doing so races the final login shell and causes the mobile login -> legacy
    // navbar -> blank-screen jump.
    const app = document.getElementById("app");
    if (!app) return;

    await sleep(9000);

    if (window.__studyThFinalUi || window.__studyAppReady) return;

    const current = app.textContent || "";
    if (current.includes("Đang tải hệ thống")) {
      app.innerHTML = '<main class="container"><div class="card"><h1>🎓 Study TH</h1><p class="danger-text">Không thể khởi động giao diện. Hãy tải lại trang.</p><button class="btn" type="button" id="boot-retry">↻ Tải lại</button></div></main>';
      const retry = document.getElementById("boot-retry");
      if (retry) retry.addEventListener("click", () => location.reload());
    }
  }
  // Intentionally NO MutationObserver here. Watching the whole document while
  // changing .brand creates a DOM mutation loop and can freeze the browser.
  fixPublicTitle();
  recover();
})();
