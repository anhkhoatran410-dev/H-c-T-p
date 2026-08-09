const SUPABASE_URL = "https://mlqaeginqsgqacdqdzbm.supabase.co";
const SUPABASE_KEY = "sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi";

const script = document.createElement("script");
script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
script.onload = init;
document.head.appendChild(script);

let db;

async function init() {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  document.querySelectorAll(".nav").forEach(btn => {
    btn.onclick = () => openTab(btn.dataset.tab);
  });

  document.getElementById("file").onchange = e => {
    document.getElementById("fileName").textContent =
      e.target.files[0]?.name || "Chưa chọn file";
  };

  document.getElementById("createBtn").onclick = createExam;

  await loadStats();
  await loadExams();
}

function openTab(id) {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".nav").forEach(x => x.classList.remove("active"));

  document.getElementById(id).classList.add("active");

  const nav = document.querySelector(`[data-tab="${id}"]`);
  if (nav) nav.classList.add("active");

  if (id === "tests") loadExams();
  if (id === "students") loadStudents();
  if (id === "dashboard") loadStats();
}

async function loadStats() {
  const exams = await db.from("exams").select("id");
  const participants = await db.from("participants").select("id");
  const attempts = await db.from("attempts").select("id");

  document.getElementById("statTests").textContent =
    exams.data?.length || 0;

  document.getElementById("statStudents").textContent =
    participants.data?.length || 0;

  document.getElementById("statAttempts").textContent =
    attempts.data?.length || 0;
}

async function createExam() {
  const file = document.getElementById("file").files[0];
  const title = document.getElementById("title").value.trim();
  const subject = document.getElementById("subject").value;
  const difficulty = document.getElementById("level").value;
  const duration = Number(document.getElementById("minutes").value) || 30;
  const questionCount = Number(document.getElementById("questions").value) || 20;

  const msg = document.getElementById("msg");

  if (!file) {
    msg.textContent = "⚠️ Hãy chọn tài liệu.";
    return;
  }

  if (!title) {
    msg.textContent = "⚠️ Hãy đặt tên bài kiểm tra.";
    return;
  }

  msg.textContent = "⏳ Đang lưu bài kiểm tra...";

  const { data: exam, error } = await db
    .from("exams")
    .insert({
      title,
      subject,
      difficulty,
      duration,
      question_count: questionCount,
      status: "draft"
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    msg.textContent = "❌ Lỗi Database: " + error.message;
    return;
  }

  msg.textContent =
    "✅ Đã lưu bài kiểm tra vào Database. File: " + file.name;

  document.getElementById("title").value = "";
  document.getElementById("file").value = "";
  document.getElementById("fileName").textContent = "Chưa chọn file";

  await loadStats();
  await loadExams();
}

async function loadExams() {
  const box = document.getElementById("testList");

  const { data, error } = await db
    .from("exams")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    box.innerHTML = `<div class="panel">❌ ${escapeHtml(error.message)}</div>`;
    return;
  }

  if (!data?.length) {
    box.innerHTML = `<div class="panel">Chưa có bài kiểm tra.</div>`;
    return;
  }

  box.innerHTML = data.map(e => `
    <div class="test">
      <div>
        <h3>${escapeHtml(e.title)}</h3>
        <p>
          ${escapeHtml(e.subject)}
          · ${escapeHtml(e.difficulty || "")}
          · ${e.question_count || 0} câu
          · ${e.duration || 0} phút
        </p>
      </div>
      <span class="badge">${escapeHtml(e.status || "draft")}</span>
    </div>
  `).join("");
}

async function loadStudents() {
  const { data, error } = await db
    .from("participants")
    .select("*")
    .order("created_at", { ascending: false });

  const section = document.getElementById("students");

  if (error) {
    section.querySelector(".panel").innerHTML =
      `<p>❌ ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data?.length) {
    section.querySelector(".panel").innerHTML =
      "<p>Chưa có người tham gia.</p>";
    return;
  }

  section.querySelector(".panel").innerHTML = `
    <h3>Danh sách người tham gia</h3>
    ${data.map(x => `
      <div class="test">
        <div>
          <b>${escapeHtml(x.name)}</b>
          <div class="muted">${escapeHtml(x.email || "")}</div>
        </div>
      </div>
    `).join("")}
  `;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

window.openTab = openTab;

document.addEventListener("DOMContentLoaded", () => {
  if (window.supabase) init();
});
