const SUPABASE_URL = "https://mlqaeginqsgqacdqdzbm.supabase.co";
const SUPABASE_KEY = "sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi";

let db = null;

async function loadSupabase() {
  if (db) return db;

  if (!window.supabase) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Không tải được Supabase JS"));
      document.head.appendChild(s);
    });
  }

  db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  return db;
}

const state = {
  page: "home",
  candidate: "",
  code: "",
  subject: "",
  exam: null,
  answers: {},
  startedAt: 0,
  timer: null
};

let exams = [];
let results = [];

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c])
  );
}

/* =========================
   ĐỌC BÀI TỪ SUPABASE
========================= */

async function loadExams() {
  try {
    await loadSupabase();

    const { data, error } = await db
      .from("exams")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) throw error;

    exams = (data || []).map(e => ({
      ...e,
      questions: Array.isArray(e.questions) ? e.questions : []
    }));

    console.log("Đã tải bài kiểm tra:", exams);

  } catch (error) {
    console.error("Không tải được exams:", error);
    exams = [];
  }
}

/* =========================
   HEADER
========================= */

function header() {
  return `
    <header class="top">
      <div class="brand">🎓 STUDY TEST AI</div>

      <div class="nav">
        <button onclick="go('home')">Trang chủ</button>
        <button onclick="go('history')">📊 Lịch sử</button>
        <button onclick="go('admin')">Admin</button>
      </div>
    </header>
  `;
}

/* =========================
   RENDER
========================= */

async function render() {
  document.getElementById("app").innerHTML = header() + page();
}

/* =========================
   TRANG
========================= */

function page() {

  if (state.page === "home") {
    return `
      <main class="container">

        <div class="card">
          <h1>Tạo và làm bài kiểm tra</h1>

          <p class="muted">
            Nhập tên thí sinh trước khi chọn bài.
          </p>

          <label>Họ và tên</label>

          <input
            id="candidate"
            placeholder="Ví dụ: Nguyễn Văn A"
            value="${esc(state.candidate)}"
            onchange="state.candidate=this.value"
          >

          <label>Mã học sinh</label>

          <input
            id="code"
            placeholder="HS001"
            value="${esc(state.code)}"
            onchange="state.code=this.value"
          >
        </div>

        <div class="card">

          <h2>Chọn môn</h2>

          <div class="grid">

            ${["Toán", "Tiếng Anh", "Ngữ Văn"].map(
              (subject, i) => {

                const count =
                  exams.filter(
                    e => e.subject === subject
                  ).length;

                return `
                  <button
                    class="subject"
                    onclick="chooseSubject('${subject}')"
                  >
                    <b>
                      ${["📐", "🇬🇧", "📖"][i]}
                      ${subject}
                    </b>

                    <span class="muted">
                      ${count} bài kiểm tra
                    </span>
                  </button>
                `;
              }
            ).join("")}

          </div>

        </div>

      </main>
    `;
  }

  if (state.page === "subject") {

    const list = exams.filter(
      e => e.subject === state.subject
    );

    return `
      <main class="container">

        <div class="card">

          <button
            class="btn secondary"
            onclick="go('home')"
          >
            ← Quay lại
          </button>

          <h1>${esc(state.subject)}</h1>

          <p class="muted">
            Chọn bài kiểm tra.
          </p>

          ${
            list.length
              ? list.map(examCard).join("")
              : "<p>Chưa có bài kiểm tra.</p>"
          }

        </div>

      </main>
    `;
  }

  if (state.page === "exam") {
    return examPage();
  }

  if (state.page === "result") {
    return resultPage();
  }

  if (state.page === "history") {
    return historyPage();
  }

  if (state.page === "admin") {
    return `
      <main class="container">

        <div class="card">
          <h1>👨‍💼 Admin</h1>

          <p>
            Khu vực quản trị:
          </p>

          <a
            class="btn"
            href="/admin/"
          >
            Mở Admin Dashboard
          </a>
        </div>

      </main>
    `;
  }

  return "";
}

/* =========================
   CARD BÀI KIỂM TRA
========================= */

function examCard(e) {

  const questionCount =
    Array.isArray(e.questions)
      ? e.questions.length
      : Number(e.question_count || 0);

  return `
    <div class="exam">

      <div>

        <span class="pill">
          ${questionCount} câu
        </span>

        <span class="pill">
          ⏱ ${Number(e.duration || 0)} phút
        </span>

        <h3>
          ${esc(e.title)}
        </h3>

        <div class="muted">
          ${esc(e.difficulty || "")}
        </div>

      </div>

      <div class="actions">

        <button
          class="btn"
          onclick="startExam('${e.id}')"
          ${questionCount === 0 ? "disabled" : ""}
        >
          Bắt đầu
        </button>

      </div>

    </div>
  `;
}

/* =========================
   CHỌN MÔN
========================= */

function chooseSubject(subject) {

  state.candidate =
    document.getElementById("candidate")?.value.trim()
    || state.candidate;

  state.code =
    document.getElementById("code")?.value.trim()
    || state.code;

  if (!state.candidate) {
    alert("Hãy nhập họ tên trước.");
    return;
  }

  state.subject = subject;
  state.page = "subject";

  render();
}

/* =========================
   BẮT ĐẦU BÀI
========================= */

function startExam(id) {

  state.exam = exams.find(
    e => String(e.id) === String(id)
  );

  if (!state.exam) {
    alert("Không tìm thấy bài kiểm tra.");
    return;
  }

  if (
    !Array.isArray(state.exam.questions) ||
    state.exam.questions.length === 0
  ) {
    alert(
      "Bài kiểm tra này chưa có dữ liệu câu hỏi. Hãy tạo lại bài từ Admin."
    );
    return;
  }

  state.answers = {};
  state.startedAt = Date.now();
  state.page = "exam";

  render();
  startTimer();
}

/* =========================
   TIMER
========================= */

function startTimer() {

  clearInterval(state.timer);

  state.timer = setInterval(
    updateTimer,
    1000
  );

  updateTimer();
}

function updateTimer() {

  if (state.page !== "exam") {
    clearInterval(state.timer);
    return;
  }

  const duration =
    Number(state.exam.duration || 0);

  const left = Math.max(
    0,
    duration * 60 -
      Math.floor(
        (Date.now() - state.startedAt) / 1000
      )
  );

  const el =
    document.getElementById("timer");

  if (el) {

    el.textContent =
      "⏱ " +
      Math.floor(left / 60)
        .toString()
        .padStart(2, "0") +
      ":" +
      String(left % 60)
        .padStart(2, "0");
  }

  if (left <= 0) {
    submitExam(true);
  }
}

/* =========================
   TRANG LÀM BÀI
========================= */

function examPage() {

  const e = state.exam;

  const questions =
    Array.isArray(e.questions)
      ? e.questions
      : [];

  return `
    <main class="container">

      <div
        class="timer"
        id="timer"
      >
        ⏱ --:--
      </div>

      <div class="card">

        <h1>
          ${esc(e.title)}
        </h1>

        <p class="muted">
          Thí sinh:
          <b>${esc(state.candidate)}</b>
          · ${questions.length} câu
          · ${Number(e.duration || 0)} phút
        </p>

        ${questions.map((q, i) => {

          const opts =
            Array.isArray(q.opts)
              ? q.opts
              : [];

          return `
            <div class="q">

              <b>
                Câu ${i + 1}.
                ${esc(q.q || q.question || "")}
              </b>

              ${opts.map((o, j) => `
                <label class="option">

                  <input
                    type="radio"
                    name="q${i}"
                    ${state.answers[i] === j ? "checked" : ""}
                    onchange="state.answers[${i}]=${j}"
                  >

                  ${String.fromCharCode(65 + j)}.
                  ${esc(o)}

                </label>
              `).join("")}

            </div>
          `;

        }).join("")}

        <button
          class="btn"
          onclick="submitExam(false)"
        >
          NỘP BÀI
        </button>

      </div>

    </main>
  `;
}

/* =========================
   NỘP BÀI
========================= */

async function submitExam(auto = false) {

  if (!state.exam) return;

  clearInterval(state.timer);

  const e = state.exam;

  const questions =
    Array.isArray(e.questions)
      ? e.questions
      : [];

  let correct = 0;

  questions.forEach((q, i) => {

    const answer =
      state.answers[i];

    const right =
      Number(
        q.a ??
        q.answer ??
        -1
      );

    if (answer === right) {
      correct++;
    }
  });

  const total =
    questions.length;

  const score =
    total
      ? Math.round(correct / total * 100)
      : 0;

  const timeSec = Math.min(
    Math.floor(
      (Date.now() - state.startedAt) / 1000
    ),
    Number(e.duration || 0) * 60
  );

  try {

    await loadSupabase();

    await db
      .from("participants")
      .insert({
        name: state.candidate,
        code: state.code || null
      });

  } catch (error) {
    console.warn(
      "Không ghi được participant:",
      error
    );
  }

  try {

    await db
      .from("attempts")
      .insert({
        student_name: state.candidate,
        exam_title: e.title,
        score: score,
        created_at: new Date().toISOString()
      });

  } catch (error) {
    console.warn(
      "Không ghi được attempt:",
      error
    );
  }

  results.push({
    examId: e.id,
    examTitle: e.title,
    candidate: state.candidate,
    score,
    correct,
    total,
    timeSec,
    submittedAt:
      new Date().toISOString(),
    auto
  });

  state.lastResult =
    results.at(-1);

  state.page = "result";

  render();
}

/* =========================
   KẾT QUẢ
========================= */

function resultPage() {

  const r =
    state.lastResult;

  return `
    <main class="container">

      <div class="card">

        <h1>
          🎉 Hoàn thành
        </h1>

        <p
          class="muted"
          style="text-align:center"
        >
          ${esc(r.candidate)}
          ·
          ${esc(r.examTitle)}
        </p>

        <div class="score">
          ${r.score}%
        </div>

        <p
          style="
            text-align:center;
            font-size:18px
          "
        >
          Đúng
          <b>${r.correct}/${r.total}</b>
          câu
        </p>

        <p
          style="text-align:center"
        >
          ${
            r.auto
              ? "⏰ Hết giờ, hệ thống đã tự động nộp bài."
              : "Bài đã được nộp thành công."
          }
        </p>

        <div style="text-align:center">

          <button
            class="btn"
            onclick="go('history')"
          >
            Xem lịch sử
          </button>

          <button
            class="btn secondary"
            onclick="go('home')"
          >
            Về trang chủ
          </button>

        </div>

      </div>

    </main>
  `;
}

/* =========================
   LỊCH SỬ
========================= */

function historyPage() {

  const mine =
    results.filter(
      r => r.candidate === state.candidate
    );

  return `
    <main class="container">

      <div class="card">

        <h1>
          📊 Lịch sử làm bài
        </h1>

        <p>
          Thí sinh:
          <b>
            ${esc(state.candidate || "Chưa nhập tên")}
          </b>
        </p>

        ${
          mine.length
            ? mine
                .slice()
                .reverse()
                .map(r => `
                  <div class="exam">

                    <div>
                      <b>
                        ${esc(r.examTitle)}
                      </b>

                      <div class="muted">
                        ${new Date(
                          r.submittedAt
                        ).toLocaleString("vi-VN")}
                      </div>
                    </div>

                    <strong>
                      ${r.score}%
                    </strong>

                  </div>
                `)
                .join("")
            : "<p class='muted'>Chưa có kết quả.</p>"
        }

      </div>

    </main>
  `;
}

/* =========================
   ĐIỀU HƯỚNG
========================= */

async function go(page) {

  clearInterval(state.timer);

  state.page = page;

  if (page === "home") {
    state.exam = null;
    await loadExams();
  }

  render();
}

/* =========================
   KHỞI ĐỘNG
========================= */

(async function init() {

  await loadExams();

  render();

})();
